import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { SessionRecord, Settings, Wordset } from './types.ts'

interface StenoDB extends DBSchema {
  wordsets: { key: string; value: Wordset; indexes: { byUpdated: number } }
  sessions: { key: string; value: SessionRecord; indexes: { byStarted: number } }
  settings: { key: string; value: Settings & { id: string } }
  /** 동기화 보조 데이터 (pendingDeletes 등) — out-of-line key */
  meta: { key: string; value: unknown }
}

let dbPromise: Promise<IDBPDatabase<StenoDB>> | null = null

export function getDB(): Promise<IDBPDatabase<StenoDB>> {
  dbPromise ??= openDB<StenoDB>('steno', 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const ws = db.createObjectStore('wordsets', { keyPath: 'id' })
        ws.createIndex('byUpdated', 'updatedAt')
        const se = db.createObjectStore('sessions', { keyPath: 'id' })
        se.createIndex('byStarted', 'startedAt')
        db.createObjectStore('settings', { keyPath: 'id' })
      }
      if (oldVersion < 2) {
        db.createObjectStore('meta')
      }
    },
  })
  return dbPromise
}

export function newId(): string {
  // crypto.randomUUID 는 secure context 전용 — HTTP 배포이므로 쓰지 않는다.
  const buf = new Uint8Array(12)
  crypto.getRandomValues(buf)
  return Date.now().toString(36) + '-' + Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('')
}
