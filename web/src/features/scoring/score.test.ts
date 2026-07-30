import { describe, expect, it } from 'vitest'
import type { ScoringOptions } from '../../lib/types.ts'
import { alignOps, countOps, diffChars } from './align.ts'
import { normalizeText, toUnits } from './normalize.ts'
import { scoreSession } from './score.ts'

const opts = (over: Partial<ScoringOptions> = {}): ScoringOptions => ({
  ignoreSpace: false,
  ignorePunct: false,
  unit: 'syllable',
  inputStyle: 'discrete',
  ...over,
})

describe('normalizeText', () => {
  it('NFC 는 항상 (NFD 입력 정규화)', () => {
    expect(normalizeText('간'.normalize('NFD'), { ignoreSpace: false, ignorePunct: false })).toBe('간')
  })
  it('띄어쓰기 무시', () => {
    expect(normalizeText('안녕 하세요\n반가워', { ignoreSpace: true, ignorePunct: false })).toBe(
      '안녕하세요반가워',
    )
  })
  it('띄어쓰기 유지 시 연속 공백은 한 칸', () => {
    expect(normalizeText('  안녕   하세요 ', { ignoreSpace: false, ignorePunct: false })).toBe('안녕 하세요')
  })
  it('문장부호 무시', () => {
    expect(normalizeText('간다. 온다!', { ignoreSpace: false, ignorePunct: true })).toBe('간다 온다')
  })
})

describe('alignOps / countOps', () => {
  it('완전 일치', () => {
    const c = countOps(alignOps([...'가나다'], [...'가나다']))
    expect(c).toEqual({ correct: 3, substituted: 0, inserted: 0, deleted: 0 })
  })
  it('치환 하나', () => {
    const c = countOps(alignOps([...'가나다'], [...'가너다']))
    expect(c).toEqual({ correct: 2, substituted: 1, inserted: 0, deleted: 0 })
  })
  it('누락(del)·삽입(ins)', () => {
    expect(countOps(alignOps([...'가나다'], [...'가다']))).toEqual({
      correct: 2,
      substituted: 0,
      inserted: 0,
      deleted: 1,
    })
    expect(countOps(alignOps([...'가다'], [...'가나다']))).toEqual({
      correct: 2,
      substituted: 0,
      inserted: 1,
      deleted: 0,
    })
  })
  it('빈 입력 = 전부 누락', () => {
    expect(countOps(alignOps([...'가나다'], []))).toEqual({
      correct: 0,
      substituted: 0,
      inserted: 0,
      deleted: 3,
    })
  })
})

describe('채점 단위', () => {
  it('음절 단위: "간"↔"가" 는 치환 1', () => {
    const c = countOps(alignOps(toUnits('간', 'syllable'), toUnits('가', 'syllable')))
    expect(c.substituted).toBe(1)
    expect(c.correct).toBe(0)
  })
  it('자모 단위: "간"↔"가" 는 누락 1 + 일치 2 (공정 채점)', () => {
    const c = countOps(alignOps(toUnits('간', 'jamo'), toUnits('가', 'jamo')))
    expect(c).toEqual({ correct: 2, substituted: 0, inserted: 0, deleted: 1 })
  })
  it('타수 단위: "값"↔"갑" 은 ㅅ 누락 1', () => {
    const c = countOps(alignOps(toUnits('값', 'keystroke'), toUnits('갑', 'keystroke')))
    expect(c).toEqual({ correct: 3, substituted: 0, inserted: 0, deleted: 1 })
  })
})

describe('diffChars 표시 병합', () => {
  it('연속 같은 연산은 병합', () => {
    expect(diffChars('가나다라', '가나')).toEqual([
      ['eq', '가나'],
      ['del', '다라'],
    ])
  })
})

describe('scoreSession', () => {
  it('낱개 모드 — 정확도·오류 집계', () => {
    const r = scoreSession({
      mode: 'discrete',
      targets: ['사과', '바나나'],
      answers: ['사과', '바난나'],
      options: opts(),
      elapsedMs: 60000,
    })
    expect(r.totalUnits).toBe(5)
    expect(r.correctUnits).toBe(4) // 사과 2 + 바나나 대비 "바난나": 바=eq, 난=sub, 나=eq... → 실제 정렬 결과 기준
    expect(r.accuracy).toBeCloseTo(4 / 5)
    expect(r.items[1].errors).toBeGreaterThan(0)
  })

  it('띄어쓰기 무시 옵션 켜면 공백 차이는 무오류', () => {
    const strict = scoreSession({
      mode: 'discrete',
      targets: ['안녕 하세요'],
      answers: ['안녕하세요'],
      options: opts({ ignoreSpace: false }),
      elapsedMs: 60000,
    })
    const lax = scoreSession({
      mode: 'discrete',
      targets: ['안녕 하세요'],
      answers: ['안녕하세요'],
      options: opts({ ignoreSpace: true }),
      elapsedMs: 60000,
    })
    expect(strict.accuracy).toBeLessThan(1)
    expect(lax.accuracy).toBe(1)
  })

  it('연속 모드 — 경계로 구간 분할', () => {
    // "사과바나나" 를 쳤고 사과 끝에서 경계 기록 (길이 2)
    const r = scoreSession({
      mode: 'continuous',
      targets: ['사과', '바나나'],
      fullText: '사과바나나',
      boundaries: [2],
      options: opts({ inputStyle: 'continuous' }),
      elapsedMs: 60000,
    })
    expect(r.accuracy).toBe(1)
    expect(r.items[0].input).toBe('사과')
    expect(r.items[1].input).toBe('바나나')
  })

  it('연속 모드 — 경계 역행에도 안전 (max 클램프)', () => {
    const r = scoreSession({
      mode: 'continuous',
      targets: ['가', '나'],
      fullText: '가나',
      boundaries: [0], // 잘못 기록된 경계
      options: opts({ inputStyle: 'continuous' }),
      elapsedMs: 60000,
    })
    expect(r.items.length).toBe(2)
  })

  it('KPM — 60초에 "한글" 이면 6타/분', () => {
    const r = scoreSession({
      mode: 'discrete',
      targets: ['한글'],
      answers: ['한글'],
      options: opts(),
      elapsedMs: 60000,
    })
    expect(r.kpm).toBeCloseTo(6)
  })
})
