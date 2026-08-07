/**
 * 저장소 추상화 — 화면 코드는 이 모듈만 안다.
 * IndexedDB(로컬)가 정본, 서버 동기화는 sync.ts 가 이 위에서 수행.
 */
import { getDB, newId } from './db.ts'
import {
  DEFAULT_SETTINGS,
  toWordItem,
  type SessionRecord,
  type Settings,
  type WordInput,
  type Wordset,
} from './types.ts'

/**
 * 항목 정규화 — 레거시(string[])·서버 스냅샷·외부 JSON 이 무엇을 주든
 * 읽기 경계에서 {t,h?} 로 통일한다. 화면·엔진은 구조형만 본다.
 */
function normalizeWordset(ws: Wordset): Wordset {
  const raw = ws.items as unknown as WordInput[]
  return { ...ws, items: raw.map(toWordItem).filter((it) => it.t.length > 0) }
}

export async function listWordsets(): Promise<Wordset[]> {
  const db = await getDB()
  const all = await db.getAll('wordsets')
  return all.map(normalizeWordset).sort((a, b) => b.updatedAt - a.updatedAt)
}

export async function getWordset(id: string): Promise<Wordset | undefined> {
  const ws = await (await getDB()).get('wordsets', id)
  return ws && normalizeWordset(ws)
}

export async function saveWordset(ws: Wordset): Promise<void> {
  await (await getDB()).put('wordsets', normalizeWordset(ws))
}

export async function createWordset(name: string, items: WordInput[]): Promise<Wordset> {
  const now = Date.now()
  const ws: Wordset = { id: newId(), name, items: items.map(toWordItem), createdAt: now, updatedAt: now }
  await saveWordset(ws)
  return ws
}

export async function deleteWordset(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('wordsets', id)
  // 삭제를 서버에도 전파하기 위한 기록 (다음 동기화 때 전송)
  const pending = ((await db.get('meta', 'pendingDeletes')) as string[] | undefined) ?? []
  if (!pending.includes(id)) await db.put('meta', [...pending, id], 'pendingDeletes')
}

export async function getPendingDeletes(): Promise<string[]> {
  return (((await (await getDB()).get('meta', 'pendingDeletes')) as string[] | undefined) ?? [])
}

export async function clearPendingDeletes(ids: string[]): Promise<void> {
  const db = await getDB()
  const pending = ((await db.get('meta', 'pendingDeletes')) as string[] | undefined) ?? []
  await db.put(
    'meta',
    pending.filter((x) => !ids.includes(x)),
    'pendingDeletes',
  )
}

/** 동기화 응답 스냅샷으로 로컬 미러 전체 교체 (단일 트랜잭션) */
export async function replaceAll(wordsets: Wordset[], sessions: SessionRecord[]): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['wordsets', 'sessions'], 'readwrite')
  await tx.objectStore('wordsets').clear()
  for (const w of wordsets) await tx.objectStore('wordsets').put(w)
  await tx.objectStore('sessions').clear()
  for (const s of sessions) await tx.objectStore('sessions').put(s)
  await tx.done
}

export async function saveSession(rec: SessionRecord): Promise<void> {
  await (await getDB()).put('sessions', rec)
}

export async function listSessions(limit = 20): Promise<SessionRecord[]> {
  const db = await getDB()
  const all = await db.getAllFromIndex('sessions', 'byStarted')
  return all.reverse().slice(0, limit)
}

export async function getSettings(): Promise<Settings> {
  const stored = await (await getDB()).get('settings', 'app')
  // 기본값 위에 저장값을 덮어 새 필드 추가에도 안전
  return { ...DEFAULT_SETTINGS, ...stored, scoring: { ...DEFAULT_SETTINGS.scoring, ...stored?.scoring } }
}

export async function saveSettings(s: Settings): Promise<void> {
  await (await getDB()).put('settings', { ...s, id: 'app' })
}
