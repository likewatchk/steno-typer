import { describe, expect, it } from 'vitest'
import { alignOps, countOps, diffChars } from './align.ts'

describe('alignOps 엣지', () => {
  it('둘 다 빈 배열', () => {
    expect(alignOps([], [])).toEqual([])
  })

  it('접두/접미 트리밍이 결과를 왜곡하지 않는다', () => {
    // 공통 접두 "가나" + 코어 + 공통 접미 "바사"
    const a = [...'가나다라바사']
    const b = [...'가나따라바사']
    const ops = alignOps(a, b)
    expect(ops).toEqual(['eq', 'eq', 'sub', 'eq', 'eq', 'eq'])
  })

  it('전부 접두로 소진되고 입력이 남는 경우', () => {
    expect(alignOps([...'가나'], [...'가나다라'])).toEqual(['eq', 'eq', 'ins', 'ins'])
  })

  it('전부 접미로 소진되고 목표가 남는 경우', () => {
    expect(alignOps([...'가나다라'], [...'다라'])).toEqual(['del', 'del', 'eq', 'eq'])
  })

  it('접두·접미가 겹치는 반복 문자열도 안전 ("가가가" vs "가가")', () => {
    const c = countOps(alignOps([...'가가가'], [...'가가']))
    expect(c).toEqual({ correct: 2, substituted: 0, inserted: 0, deleted: 1 })
  })

  it('완전 불일치', () => {
    const c = countOps(alignOps([...'가나다'], [...'라마바']))
    expect(c.correct).toBe(0)
    expect(c.substituted).toBe(3)
  })

  it('강등 가드: 4M 셀 초과 코어도 즉시 완료 + 집계 보존', () => {
    // 서로 전혀 다른 3000 vs 2000 단위 → 코어 6M 셀 > 4M 리밋 → 근사 경로
    const a = Array.from({ length: 3000 }, (_, i) => `a${i}`)
    const b = Array.from({ length: 2000 }, (_, i) => `b${i}`)
    const t0 = performance.now()
    const c = countOps(alignOps(a, b))
    expect(performance.now() - t0).toBeLessThan(200)
    expect(c.substituted).toBe(2000)
    expect(c.deleted).toBe(1000)
    expect(c.correct + c.substituted + c.deleted).toBe(3000) // 목표 단위 보존
  })

  it('대부분 일치하는 10만 단위는 트리밍으로 즉시 처리', () => {
    const a = Array.from({ length: 100_000 }, (_, i) => `u${i}`)
    const b = [...a]
    b[50_000] = 'X' // 가운데 한 글자만 오타
    const t0 = performance.now()
    const c = countOps(alignOps(a, b))
    expect(performance.now() - t0).toBeLessThan(300)
    expect(c).toEqual({ correct: 99_999, substituted: 1, inserted: 0, deleted: 0 })
  })
})

describe('diffChars 엣지', () => {
  it('빈 목표 + 입력만', () => {
    expect(diffChars('', '가나')).toEqual([['ins', '가나']])
  })
  it('빈 입력 + 목표만', () => {
    expect(diffChars('가나', '')).toEqual([['del', '가나']])
  })
  it('둘 다 빈 문자열', () => {
    expect(diffChars('', '')).toEqual([])
  })
  it('서로게이트 쌍(이모지)도 코드포인트 단위로 안전', () => {
    expect(diffChars('가🙂나', '가🙂나')).toEqual([['eq', '가🙂나']])
    const c = countOps(alignOps([...'🙂'], [...'🙃']))
    expect(c.substituted).toBe(1)
  })
})
