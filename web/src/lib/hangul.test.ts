import { describe, expect, it } from 'vitest'
import {
  canBecomeSyllable,
  CHOSEONG,
  JONGSEONG,
  JUNGSEONG,
  composeSyllable,
  countKeystrokes,
  decomposeSyllable,
  toJamos,
  toKeystrokes,
} from './hangul.ts'

describe('hangul 분해/조합', () => {
  it('기본 분해', () => {
    expect(decomposeSyllable('가')).toEqual(['ㄱ', 'ㅏ', ''])
    expect(decomposeSyllable('간')).toEqual(['ㄱ', 'ㅏ', 'ㄴ'])
    expect(decomposeSyllable('값')).toEqual(['ㄱ', 'ㅏ', 'ㅄ'])
    expect(decomposeSyllable('뷁')).toEqual(['ㅂ', 'ㅞ', 'ㄺ'])
    expect(decomposeSyllable('a')).toBeNull()
    expect(decomposeSyllable('ㄱ')).toBeNull()
  })

  it('전체 11172자 왕복 (분해→조합 무손실)', () => {
    for (let code = 0xac00; code <= 0xd7a3; code++) {
      const ch = String.fromCodePoint(code)
      const parts = decomposeSyllable(ch)
      expect(parts).not.toBeNull()
      const [cho, jung, jong] = parts!
      expect(composeSyllable(cho, jung, jong)).toBe(ch)
    }
  })

  it('자모 테이블 크기', () => {
    expect(CHOSEONG.length).toBe(19)
    expect(JUNGSEONG.length).toBe(21)
    expect(JONGSEONG.length).toBe(28)
  })
})

describe('자모 시퀀스', () => {
  it('음절 → 자모 나열', () => {
    expect(toJamos('간')).toEqual(['ㄱ', 'ㅏ', 'ㄴ'])
    expect(toJamos('가')).toEqual(['ㄱ', 'ㅏ'])
    expect(toJamos('한글')).toEqual(['ㅎ', 'ㅏ', 'ㄴ', 'ㄱ', 'ㅡ', 'ㄹ'])
  })

  it('한글 아닌 문자는 그대로', () => {
    expect(toJamos('a간!')).toEqual(['a', 'ㄱ', 'ㅏ', 'ㄴ', '!'])
    expect(toJamos('낱말 뜻')).toEqual(['ㄴ', 'ㅏ', 'ㅌ', 'ㅁ', 'ㅏ', 'ㄹ', ' ', 'ㄸ', 'ㅡ', 'ㅅ'])
  })

  it('"간" vs "가" 는 자모 1개 차이 (채점 공정성의 핵심)', () => {
    expect(toJamos('간').length - toJamos('가').length).toBe(1)
  })
})

describe('타수', () => {
  it('단순 음절', () => {
    expect(countKeystrokes('한')).toBe(3) // ㅎㅏㄴ
    expect(countKeystrokes('한글')).toBe(6)
  })

  it('겹받침·겹모음은 2타', () => {
    expect(countKeystrokes('값')).toBe(4) // ㄱㅏㅂㅅ
    expect(toKeystrokes('와')).toEqual(['ㅇ', 'ㅗ', 'ㅏ'])
    expect(countKeystrokes('의')).toBe(3) // ㅇㅡㅣ
    expect(toKeystrokes('뷁')).toEqual(['ㅂ', 'ㅜ', 'ㅔ', 'ㄹ', 'ㄱ'])
  })

  it('쌍자음·ㅒㅖ 는 시프트 1타', () => {
    expect(countKeystrokes('까')).toBe(2) // ㄲㅏ
    expect(countKeystrokes('얘')).toBe(2) // ㅇㅒ
    expect(countKeystrokes('쌌')).toBe(3) // ㅆㅏㅆ
  })

  it('한글 외 문자·공백은 1타', () => {
    expect(countKeystrokes('a b')).toBe(3)
    expect(countKeystrokes('간 다')).toBe(6) // 3 + 1 + 2
  })
})

describe('canBecomeSyllable — 조합 중 글자가 아직 목표 음절이 될 수 있는가', () => {
  it('같은 초성의 홑자모 → 된다, 다른 초성·홑모음 → 안 된다', () => {
    expect(canBecomeSyllable('ㅊ', '치')).toBe(true)
    expect(canBecomeSyllable('ㅊ', '침')).toBe(true)
    expect(canBecomeSyllable('ㅌ', '치')).toBe(false)
    expect(canBecomeSyllable('ㅣ', '치')).toBe(false)
  })
  it('받침이 더 붙거나(치→침) 겹모음·겹받침이 이어질 수 있다', () => {
    expect(canBecomeSyllable('치', '침')).toBe(true)
    expect(canBecomeSyllable('고', '과')).toBe(true)
    expect(canBecomeSyllable('달', '닭')).toBe(true)
    expect(canBecomeSyllable('치', '치')).toBe(true)
  })
  it('받침이 다음 음절로 넘어가는 건 원문 다음 음절 초성이 그 받침일 때만', () => {
    expect(canBecomeSyllable('침', '치', '마')).toBe(true) // 치마
    expect(canBecomeSyllable('침', '치', '다')).toBe(false) // 치다 — 침은 이미 틀림
    expect(canBecomeSyllable('침', '치')).toBe(false) // 원문 끝
    expect(canBecomeSyllable('닭', '달', '가')).toBe(true) // 겹받침 뒤 자음 ㄱ 이 넘어감
    expect(canBecomeSyllable('닭', '달', '마')).toBe(false)
    // 겹받침은 뒤 자음만 넘어간다 — '닭'+ㅏ = '달가', '다…' 는 안 됨
    expect(canBecomeSyllable('닭', '다', '가')).toBe(false)
    expect(canBecomeSyllable('값', '가', '사')).toBe(false)
  })
  it('이미 틀린 완성형은 안 된다', () => {
    expect(canBecomeSyllable('티', '치')).toBe(false)
    expect(canBecomeSyllable('침', '칩')).toBe(false)
    expect(canBecomeSyllable('곰', '과')).toBe(false) // 받침이 있으면 겹모음으로 못 간다
    expect(canBecomeSyllable('가', '3')).toBe(false)
    expect(canBecomeSyllable('3', '3')).toBe(true)
  })
})
