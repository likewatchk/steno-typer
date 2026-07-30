import { describe, expect, it } from 'vitest'
import { countKeystrokes, toJamos, toKeystrokes } from './hangul.ts'

describe('hangul 엣지', () => {
  it('빈 문자열', () => {
    expect(toJamos('')).toEqual([])
    expect(countKeystrokes('')).toBe(0)
  })

  it('낱자모(호환 자모) 입력은 그대로 통과 — 조합 안 된 입력 채점 대비', () => {
    expect(toJamos('ㄱㅏ')).toEqual(['ㄱ', 'ㅏ'])
    expect(countKeystrokes('ㄱㅏ')).toBe(2)
    expect(toKeystrokes('ㅘ')).toEqual(['ㅗ', 'ㅏ']) // 낱자모 겹모음도 분해
    expect(toKeystrokes('ㄳ')).toEqual(['ㄱ', 'ㅅ'])
  })

  it('영문·숫자·기호 혼합', () => {
    expect(countKeystrokes('a1!간')).toBe(6) // 1+1+1+3
  })

  it('서로게이트 쌍(이모지)은 1타로 취급', () => {
    expect(countKeystrokes('🙂')).toBe(1)
    expect(toJamos('가🙂나')).toEqual(['ㄱ', 'ㅏ', '🙂', 'ㄴ', 'ㅏ'])
  })

  it('모든 종성(27종) 타수 분해 검증 — 겹받침만 2타', () => {
    const doubles = new Set([...'ㄳㄵㄶㄺㄻㄼㄽㄾㄿㅀㅄ'])
    for (const jong of 'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ') {
      const strokes = toKeystrokes(jong).length
      expect(strokes, `종성 ${jong}`).toBe(doubles.has(jong) ? 2 : 1)
    }
  })

  it('모든 겹모음 분해 검증', () => {
    const compound: Record<string, number> = { ㅘ: 2, ㅙ: 2, ㅚ: 2, ㅝ: 2, ㅞ: 2, ㅟ: 2, ㅢ: 2 }
    for (const jung of 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ') {
      expect(toKeystrokes(jung).length, `모음 ${jung}`).toBe(compound[jung] ?? 1)
    }
  })

  it('NFD(자소 분리) 문자열은 그대로 두지 않는다는 전제 확인 — normalize 는 채점단에서', () => {
    const nfd = '간'.normalize('NFD')
    // NFD 는 첫가끝 자모(U+1100대)라 완성형 분해에 안 걸린다 — normalizeText 의 NFC 가 선행돼야 함
    expect(toJamos(nfd)).not.toEqual(['ㄱ', 'ㅏ', 'ㄴ'])
    expect(toJamos(nfd.normalize('NFC'))).toEqual(['ㄱ', 'ㅏ', 'ㄴ'])
  })
})
