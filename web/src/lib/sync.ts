/**
 * 서버 동기화 — 서버 연동 최소화 원칙 (서버가 사우디, RTT ~350ms):
 * - 자동 호출 0. 사용자가 버튼을 누른 순간에만 실행된다.
 * - 항상 백그라운드 비동기 — UI 를 블록하지 않는다.
 * - 10초 타임아웃 — 링크가 죽어도 앱은 멀쩡하다.
 *
 * 프로토콜: POST /api/sync 에 로컬 전체(단어장·기록·삭제목록)를 보내면
 * 서버가 updatedAt LWW 로 병합한 스냅샷을 돌려주고, 로컬 미러를 그걸로 교체한다.
 */
import * as repo from './repo.ts'
import type { SessionRecord, Wordset } from './types.ts'

export interface SyncOutcome {
  ok: boolean
  message: string
}

interface SyncResponse {
  wordsets: Wordset[]
  sessions: SessionRecord[]
}

export async function syncNow(token: string): Promise<SyncOutcome> {
  if (!token) return { ok: false, message: '동기화 암호가 없습니다' }
  try {
    const [wordsets, sessions, deletedWordsetIds] = await Promise.all([
      repo.listWordsets(),
      repo.listSessions(1000),
      repo.getPendingDeletes(),
    ])
    const res = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ wordsets, sessions, deletedWordsetIds }),
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401) return { ok: false, message: '동기화 암호가 틀립니다' }
    if (!res.ok) return { ok: false, message: `서버 오류 (${res.status})` }
    const data = (await res.json()) as SyncResponse
    await repo.replaceAll(data.wordsets ?? [], data.sessions ?? [])
    await repo.clearPendingDeletes(deletedWordsetIds)
    return { ok: true, message: `완료 — 단어장 ${data.wordsets.length}개` }
  } catch (e) {
    const err = e as Error
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { ok: false, message: '시간 초과 (10초) — 나중에 다시' }
    }
    return { ok: false, message: '연결 실패 — 오프라인이어도 앱은 정상 동작합니다' }
  }
}
