import { describe, expect, it } from 'vitest'
import { DEFAULT_SJ, clampTasu, sanitizeSj } from './sjPrefs.ts'

describe('sjPrefs', () => {
  it('clampTasu — 10~400, 정수, 비정상은 기본값', () => {
    expect(clampTasu(5)).toBe(10)
    expect(clampTasu(9999)).toBe(400)
    expect(clampTasu(12.6)).toBe(13)
    expect(clampTasu(NaN)).toBe(DEFAULT_SJ.tasu)
  })

  it('sanitizeSj — 손상된 저장값을 전부 안전하게 정리', () => {
    expect(sanitizeSj({ part: 'zzz', minutes: 'abc', reveal: 'x', shuffle: 'no', tasu: '150', stage: '3' })).toEqual({
      ...DEFAULT_SJ,
      tasu: 150,
      stage: 3,
      shuffle: true,
    })
    expect(sanitizeSj(null)).toEqual(DEFAULT_SJ)
    expect(sanitizeSj('garbage')).toEqual(DEFAULT_SJ)
    expect(sanitizeSj({ minutes: 4 }).minutes).toBe(DEFAULT_SJ.minutes)
    expect(sanitizeSj({ minutes: 'all' }).minutes).toBe('all')
    expect(sanitizeSj({ minutes: '3' }).minutes).toBe(3)
    // 문자열 불리언은 양쪽 다 같은 규칙
    expect(sanitizeSj({ shuffle: 'false', cumulative: 'true' })).toMatchObject({ shuffle: false, cumulative: true })
    expect(sanitizeSj({ shuffle: 'maybe' }).shuffle).toBe(DEFAULT_SJ.shuffle)
    expect(sanitizeSj({ minutes: 5, cumulative: true, shuffle: false, reveal: 'all' })).toMatchObject({
      minutes: 5,
      cumulative: true,
      shuffle: false,
      reveal: 'all',
    })
  })
})
