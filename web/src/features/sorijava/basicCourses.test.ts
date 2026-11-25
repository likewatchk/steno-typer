import { describe, expect, it } from 'vitest'
import { decomposeSyllable } from '../../lib/hangul.ts'
import { BASIC_STAGES, NEW_CHO, NEW_JONG, NEW_JUNG, buildSessionItems, syllableCount } from './basicCourses.ts'

function allowedUpTo(table: Record<number, string>, stage: number): Set<string> {
  const set = new Set<string>()
  for (const [k, v] of Object.entries(table)) if (Number(k) <= stage) for (const c of v) set.add(c)
  return set
}

describe('기본자리 코스 데이터', () => {
  it('1~10단계 + 11단계 총정리, 기본자리 단계는 항목이 비어 있지 않다', () => {
    expect(BASIC_STAGES.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11])
    expect(BASIC_STAGES.filter((s) => s.drills).map((s) => s.no)).toEqual([11])
    for (const s of BASIC_STAGES.filter((st) => !st.drills)) {
      expect(s.bookWords.length).toBeGreaterThan(10)
      expect(s.extra.length, `${s.no}단계 추가 낱말 3배`).toBeGreaterThanOrEqual(s.bookWords.length * 3)
      expect(s.abbr.length).toBeGreaterThan(0)
      expect(s.sentences.length).toBeGreaterThan(0)
    }
  })

  for (const stage of BASIC_STAGES.filter((st) => !st.drills)) {
    it(`${stage.no}단계 추가 낱말은 배운 자리만 쓰고, 새 자리를 하나 이상 쓴다`, () => {
      const cho = allowedUpTo(NEW_CHO, stage.no)
      const jung = allowedUpTo(NEW_JUNG, stage.no)
      const jong = allowedUpTo(NEW_JONG, stage.no)
      const newCho = new Set(NEW_CHO[stage.no] ?? '')
      const newJung = new Set(NEW_JUNG[stage.no] ?? '')
      const newJong = new Set(NEW_JONG[stage.no] ?? '')
      const bad: string[] = []
      const unfocused: string[] = []
      for (const w of stage.extra) {
        let ok = true
        let usesNew = false
        for (const ch of w) {
          const d = decomposeSyllable(ch)
          if (!d) {
            ok = false
            continue
          }
          const [c, v, f] = d
          if (!cho.has(c) || !jung.has(v) || (f && !jong.has(f))) ok = false
          if (newCho.has(c) || newJung.has(v) || (f && newJong.has(f))) usesNew = true
        }
        if (!ok) bad.push(w)
        else if (!usesNew) unfocused.push(w)
      }
      expect(bad, '아직 안 배운 자리를 쓴 낱말').toEqual([])
      expect(unfocused, '이 단계의 새 자리를 안 쓰는 낱말').toEqual([])
    })
  }

  it('추가 낱말에 단계 내 중복이 없다', () => {
    for (const s of BASIC_STAGES) expect(new Set(s.extra).size, `${s.no}단계`).toBe(s.extra.length)
  })
})

describe('buildSessionItems', () => {
  const seeded = () => {
    let x = 42
    return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  }

  it('목표 분량을 채운다 (모자라면 다시 섞어 이어 붙임)', () => {
    const items = buildSessionItems({ stage: 1, part: 'words', cumulative: false, shuffle: true, targetSyllables: 600, rand: seeded() })
    const total = items.reduce((n, it) => n + syllableCount(it.t), 0)
    expect(total).toBeGreaterThanOrEqual(600)
  })

  it('누적 끄면 해당 단계 항목만', () => {
    const own = new Set([...BASIC_STAGES[2].bookWords, ...BASIC_STAGES[2].extra])
    const items = buildSessionItems({ stage: 3, part: 'words', cumulative: false, shuffle: true, targetSyllables: 300, rand: seeded() })
    expect(items.every((it) => own.has(it.t))).toBe(true)
  })

  it('누적 켜면 앞 단계 항목도 섞여 들어온다', () => {
    const own = new Set([...BASIC_STAGES[4].bookWords, ...BASIC_STAGES[4].extra])
    const items = buildSessionItems({ stage: 5, part: 'words', cumulative: true, shuffle: true, targetSyllables: 400, rand: seeded() })
    expect(items.some((it) => !own.has(it.t))).toBe(true)
    expect(items.some((it) => own.has(it.t))).toBe(true)
  })

  it('약어 범위는 부호를 분량에 넣어 센다 — 채점 단위 수와 목표가 맞아떨어진다', () => {
    const items = buildSessionItems({ stage: 1, part: 'abbr', cumulative: false, shuffle: true, targetSyllables: 100, rand: seeded() })
    const withPunct = items.reduce((n, it) => n + syllableCount(it.t, { punct: true }), 0)
    const withoutPunct = items.reduce((n, it) => n + syllableCount(it.t), 0)
    expect(withPunct).toBeGreaterThanOrEqual(100)
    expect(withPunct).toBeLessThan(100 + 10) // 마지막 항목만큼만 넘친다
    expect(withoutPunct).toBeLessThan(withPunct)
  })

  it('Infinity 분량은 항목 상한(20000)에서 멈춘다', () => {
    const items = buildSessionItems({ stage: 1, part: 'words', cumulative: false, shuffle: false, targetSyllables: Infinity })
    expect(items.length).toBe(20000)
  })

  it("분량 '전부' — 범위 항목을 한 번씩, 누적이면 앞 단계에서 같은 수만큼 더", () => {
    const own = buildSessionItems({ stage: 3, part: 'words', cumulative: false, shuffle: true, targetSyllables: 'all', rand: seeded() })
    const expected = [...BASIC_STAGES[2].bookWords, ...BASIC_STAGES[2].extra]
    expect(own.map((i) => i.t).sort()).toEqual(expected.slice().sort())
    const cum = buildSessionItems({ stage: 3, part: 'words', cumulative: true, shuffle: true, targetSyllables: 'all', rand: seeded() })
    expect(cum.length).toBe(expected.length * 2)
  })

  it('섞기 끄면 교재 순서 그대로', () => {
    const items = buildSessionItems({ stage: 1, part: 'sentences', cumulative: false, shuffle: false, targetSyllables: 10 })
    expect(items[0].t).toBe(BASIC_STAGES[0].sentences[0])
  })
})
