// @vitest-environment jsdom
/** 저장소 왕복 검증 — fake-indexeddb 로 실제 IndexedDB 경로를 테스트 */
import 'fake-indexeddb/auto'
import { beforeAll, describe, expect, it } from 'vitest'
import * as repo from './repo.ts'
import { getDB } from './db.ts'
import { DEFAULT_SETTINGS, type SessionRecord } from './types.ts'

beforeAll(async () => {
  await getDB()
})

describe('wordsets CRUD', () => {
  it('생성 → 목록 → 수정 → 삭제 왕복', async () => {
    const ws = await repo.createWordset('테스트', ['가', '나'])
    expect(ws.id).toBeTruthy()

    let list = await repo.listWordsets()
    expect(list.some((w) => w.id === ws.id)).toBe(true)

    await repo.saveWordset({ ...ws, items: [{ t: '가' }, { t: '나' }, { t: '다' }], updatedAt: Date.now() + 1 })
    const got = await repo.getWordset(ws.id)
    expect(got?.items).toEqual([{ t: '가' }, { t: '나' }, { t: '다' }])

    await repo.deleteWordset(ws.id)
    list = await repo.listWordsets()
    expect(list.some((w) => w.id === ws.id)).toBe(false)
  })

  it('updatedAt 내림차순 정렬', async () => {
    const a = await repo.createWordset('A', ['x'])
    await new Promise((r) => setTimeout(r, 5))
    const b = await repo.createWordset('B', ['y'])
    const list = await repo.listWordsets()
    const ia = list.findIndex((w) => w.id === a.id)
    const ib = list.findIndex((w) => w.id === b.id)
    expect(ib).toBeLessThan(ia)
  })

  it('10,000 항목 단어장 저장/로드', async () => {
    const items = Array.from({ length: 10_000 }, (_, i) => `항목${i}`)
    const t0 = performance.now()
    const ws = await repo.createWordset('큰 단어장', items)
    const got = await repo.getWordset(ws.id)
    expect(performance.now() - t0).toBeLessThan(2000)
    expect(got?.items.length).toBe(10_000)
    await repo.deleteWordset(ws.id)
  })
})

describe('items 정규화 (힌트·레거시 호환)', () => {
  it('레거시 string[] 저장분도 읽을 때 {t}로 정규화', async () => {
    const db = await getDB()
    const legacy = {
      id: 'legacy-1',
      name: '레거시',
      items: ['가', '나'] as never,
      createdAt: 1,
      updatedAt: 1,
    }
    await db.put('wordsets', legacy)
    const got = await repo.getWordset('legacy-1')
    expect(got?.items).toEqual([{ t: '가' }, { t: '나' }])
    await repo.deleteWordset('legacy-1')
  })

  it('힌트 보존 왕복', async () => {
    const ws = await repo.createWordset('힌트', [{ t: '것도', h: 'ㄱㅅ-ㄷ' }, '평문'])
    const got = await repo.getWordset(ws.id)
    expect(got?.items).toEqual([{ t: '것도', h: 'ㄱㅅ-ㄷ' }, { t: '평문' }])
    await repo.deleteWordset(ws.id)
  })
})

describe('settings', () => {
  it('저장 안 된 상태 → 기본값', async () => {
    const s = await repo.getSettings()
    expect(s.blankMs).toBe(DEFAULT_SETTINGS.blankMs)
    expect(s.flashScale).toBe(1)
  })

  it('구버전 저장값(새 필드 없음)에 기본값 병합 — 마이그레이션 안전', async () => {
    const db = await getDB()
    // flashScale/inputFontPx 가 없던 시절의 저장값 흉내
    const legacy = { ...DEFAULT_SETTINGS, id: 'app' } as Record<string, unknown>
    delete legacy.flashScale
    delete legacy.inputFontPx
    ;(legacy.scoring as Record<string, unknown>) = { ignoreSpace: false } // 부분 저장
    await db.put('settings', legacy as never)

    const s = await repo.getSettings()
    expect(s.flashScale).toBe(1) // 기본 병합
    expect(s.inputFontPx).toBe(26)
    expect(s.scoring.ignoreSpace).toBe(false) // 저장값 우선
    expect(s.scoring.unit).toBe('syllable') // 빠진 필드는 기본
  })

  it('저장 → 로드 왕복', async () => {
    const s = await repo.getSettings()
    await repo.saveSettings({ ...s, fixedMs: 3300, flashScale: 0.8 })
    const got = await repo.getSettings()
    expect(got.fixedMs).toBe(3300)
    expect(got.flashScale).toBe(0.8)
  })
})

describe('이어하기 (resume)', () => {
  const mkResume = (wid: string, index: number) => ({
    wordsetId: wid,
    wordsetName: '테스트',
    items: [
      { text: '가나', sourceIndex: 0 },
      { text: '다라', sourceIndex: 1 },
      { text: '마바', sourceIndex: 2 },
    ],
    index,
    settings: DEFAULT_SETTINGS,
    typing: { kind: 'continuous' as const, fullText: '가나다', boundaries: [2] },
    savedAt: Date.now(),
  })

  it('저장 → 조회 → 덮어쓰기 → 삭제 왕복', async () => {
    await repo.saveResume(mkResume('rw1', 1))
    let got = await repo.getResume('rw1')
    expect(got?.index).toBe(1)
    expect(got?.typing).toEqual({ kind: 'continuous', fullText: '가나다', boundaries: [2] })

    await repo.saveResume(mkResume('rw1', 2)) // 덮어쓰기
    got = await repo.getResume('rw1')
    expect(got?.index).toBe(2)

    await repo.deleteResume('rw1')
    expect(await repo.getResume('rw1')).toBeUndefined()
  })

  it('단어장별 독립 슬롯', async () => {
    await repo.saveResume(mkResume('rwA', 0))
    await repo.saveResume(mkResume('rwB', 2))
    expect((await repo.getResume('rwA'))?.index).toBe(0)
    expect((await repo.getResume('rwB'))?.index).toBe(2)
    await repo.deleteResume('rwA')
    await repo.deleteResume('rwB')
  })
})

describe('sessions', () => {
  it('저장 → 최근 목록 (startedAt 내림차순, limit)', async () => {
    const mk = (i: number): SessionRecord => ({
      id: `s${i}`,
      wordsetId: 'w',
      wordsetName: '단어장',
      mode: 'view',
      settings: { durationMode: 'fixed', fixedMs: 2000, scoring: DEFAULT_SETTINGS.scoring },
      startedAt: 1000 + i,
      endedAt: 2000 + i,
      result: null,
      updatedAt: Date.now(),
    })
    for (let i = 0; i < 15; i++) await repo.saveSession(mk(i))
    const recent = await repo.listSessions(10)
    expect(recent.length).toBe(10)
    expect(recent[0].startedAt).toBeGreaterThan(recent[9].startedAt)
  })
})
