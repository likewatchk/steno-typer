"""
steno 동기화 API — 최소 표면적 3개 엔드포인트.

- GET  /api/health  : living check (무인증)
- GET  /api/sync    : 전체 스냅샷 pull
- POST /api/sync    : 로컬 전체 push → updatedAt LWW 병합 → 병합 스냅샷 반환

저장은 stdlib sqlite3 (WAL) 단일 테이블 docs(kind, id, updated_at, body).
네이티브 의존성 0 — arm64 에서 빌드 이슈 없음.
인증: STENO_TOKEN 공유 시크릿 Bearer, 상수시간 비교. 미설정 시 503 (실수로 열린 서버 방지).
"""

import hmac
import json
import os
import sqlite3
from contextlib import contextmanager

from fastapi import FastAPI, HTTPException, Request

DB_PATH = os.environ.get("STENO_DB", "/data/steno.db")
TOKEN = os.environ.get("STENO_TOKEN", "")
MAX_DOCS = 10_000  # 한 번의 push 에서 종류별 상한 (폭주 방지)

app = FastAPI(title="steno-sync", docs_url=None, redoc_url=None, openapi_url=None)


def _connect() -> sqlite3.Connection:
    con = sqlite3.connect(DB_PATH, timeout=10)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    return con


def init_db() -> None:
    con = _connect()
    try:
        con.execute(
            """CREATE TABLE IF NOT EXISTS docs(
                 kind TEXT NOT NULL,
                 id TEXT NOT NULL,
                 updated_at INTEGER NOT NULL,
                 body TEXT NOT NULL,
                 PRIMARY KEY (kind, id)
               )"""
        )
        con.commit()
    finally:
        con.close()


init_db()


@contextmanager
def db():
    con = _connect()
    try:
        yield con
        con.commit()
    finally:
        con.close()


def check_auth(request: Request) -> None:
    if not TOKEN:
        raise HTTPException(503, "sync token not configured on server")
    header = request.headers.get("authorization", "")
    supplied = header[7:] if header.lower().startswith("bearer ") else ""
    if not hmac.compare_digest(supplied.encode(), TOKEN.encode()):
        raise HTTPException(401, "invalid token")


def snapshot(con: sqlite3.Connection) -> dict:
    wordsets, sessions = [], []
    for kind, body in con.execute("SELECT kind, body FROM docs"):
        (wordsets if kind == "wordset" else sessions).append(json.loads(body))
    wordsets.sort(key=lambda x: -(x.get("updatedAt") or 0))
    sessions.sort(key=lambda x: -(x.get("startedAt") or 0))
    return {"wordsets": wordsets, "sessions": sessions}


@app.get("/api/health")
def health() -> dict:
    return {"ok": True}


@app.get("/api/sync")
def pull(request: Request) -> dict:
    check_auth(request)
    with db() as con:
        return snapshot(con)


@app.post("/api/sync")
async def push(request: Request) -> dict:
    check_auth(request)
    try:
        payload = await request.json()
    except Exception:
        raise HTTPException(400, "invalid json")
    if not isinstance(payload, dict):
        raise HTTPException(400, "invalid payload")

    def docs_of(key: str) -> list:
        v = payload.get(key, [])
        return v[:MAX_DOCS] if isinstance(v, list) else []

    with db() as con:
        # 1) 삭제 전파 — 클라이언트가 지운 단어장은 서버에서도 제거
        for wid in docs_of("deletedWordsetIds"):
            if isinstance(wid, str):
                con.execute("DELETE FROM docs WHERE kind='wordset' AND id=?", (wid,))

        # 2) LWW upsert — 더 최신 updatedAt 만 반영
        def upsert(kind: str, doc: object, ts_field: str) -> None:
            if not isinstance(doc, dict):
                return
            did = doc.get("id")
            ts = doc.get(ts_field)
            if not isinstance(did, str) or not did or not isinstance(ts, (int, float)):
                return
            row = con.execute(
                "SELECT updated_at FROM docs WHERE kind=? AND id=?", (kind, did)
            ).fetchone()
            if row is None or int(ts) > row[0]:
                con.execute(
                    """INSERT INTO docs(kind, id, updated_at, body) VALUES(?,?,?,?)
                       ON CONFLICT(kind, id) DO UPDATE SET
                         updated_at=excluded.updated_at, body=excluded.body""",
                    (kind, did, int(ts), json.dumps(doc, ensure_ascii=False)),
                )

        for doc in docs_of("wordsets"):
            upsert("wordset", doc, "updatedAt")
        for doc in docs_of("sessions"):
            upsert("session", doc, "updatedAt")

        return snapshot(con)
