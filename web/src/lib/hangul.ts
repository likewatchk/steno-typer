/**
 * 한글 분해 유틸 — 채점 단위(음절/자모/타수) 변환의 기반.
 *
 * - 자모: 초·중·종성을 호환 자모(U+3131~)로 분해. "간"↔"가" 를 1자모 차이로 다루기 위함.
 * - 타수: 한국 타자 관례. 겹모음(ㅘ→ㅗ+ㅏ)·겹받침(ㄳ→ㄱ+ㅅ)은 2타,
 *   쌍자음(ㄲ ㄸ …)은 시프트 1타. 한글 외 문자는 1타.
 */

const SYLLABLE_BASE = 0xac00
const SYLLABLE_END = 0xd7a3

export const CHOSEONG = [...'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'] as const
export const JUNGSEONG = [...'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'] as const
// index 0 = 받침 없음
export const JONGSEONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'] as const

/** 겹모음·겹받침·쌍자음의 타수 분해 (자모 → 키 입력 시퀀스) */
const KEYSTROKES: Record<string, string> = {
  ㅘ: 'ㅗㅏ',
  ㅙ: 'ㅗㅐ',
  ㅚ: 'ㅗㅣ',
  ㅝ: 'ㅜㅓ',
  ㅞ: 'ㅜㅔ',
  ㅟ: 'ㅜㅣ',
  ㅢ: 'ㅡㅣ',
  ㄳ: 'ㄱㅅ',
  ㄵ: 'ㄴㅈ',
  ㄶ: 'ㄴㅎ',
  ㄺ: 'ㄹㄱ',
  ㄻ: 'ㄹㅁ',
  ㄼ: 'ㄹㅂ',
  ㄽ: 'ㄹㅅ',
  ㄾ: 'ㄹㅌ',
  ㄿ: 'ㄹㅍ',
  ㅀ: 'ㄹㅎ',
  ㅄ: 'ㅂㅅ',
  // 쌍자음(ㄲㄸㅃㅆㅉ)·ㅒㅖ 는 시프트 조합 = 1타이므로 분해하지 않는다.
}

export function isHangulSyllable(code: number): boolean {
  return code >= SYLLABLE_BASE && code <= SYLLABLE_END
}

/** 완성형 음절 1자 → [초, 중, 종] (종성 없으면 ''). 한글 음절이 아니면 null. */
export function decomposeSyllable(ch: string): [string, string, string] | null {
  const code = ch.codePointAt(0)
  if (code === undefined || !isHangulSyllable(code)) return null
  const idx = code - SYLLABLE_BASE
  const cho = CHOSEONG[Math.floor(idx / (21 * 28))]
  const jung = JUNGSEONG[Math.floor(idx / 28) % 21]
  const jong = JONGSEONG[idx % 28]
  return [cho, jung, jong]
}

/** [초, 중, 종] → 완성형 음절. 잘못된 조합이면 null. */
export function composeSyllable(cho: string, jung: string, jong: string): string | null {
  const ci = (CHOSEONG as readonly string[]).indexOf(cho)
  const ji = (JUNGSEONG as readonly string[]).indexOf(jung)
  const ti = (JONGSEONG as readonly string[]).indexOf(jong)
  if (ci < 0 || ji < 0 || ti < 0) return null
  return String.fromCodePoint(SYLLABLE_BASE + ci * 21 * 28 + ji * 28 + ti)
}

/** 문자열 → 자모 시퀀스. 한글 음절은 초/중/종으로 펼치고 그 외 문자는 그대로. */
export function toJamos(text: string): string[] {
  const out: string[] = []
  for (const ch of text) {
    const parts = decomposeSyllable(ch)
    if (parts) {
      out.push(parts[0], parts[1])
      if (parts[2]) out.push(parts[2])
    } else {
      out.push(ch)
    }
  }
  return out
}

/** 문자열 → 타수 시퀀스 (겹모음·겹받침 분해 포함). */
export function toKeystrokes(text: string): string[] {
  const out: string[] = []
  for (const jamo of toJamos(text)) {
    const expanded = KEYSTROKES[jamo]
    if (expanded) out.push(...expanded)
    else out.push(jamo)
  }
  return out
}

/** 총 타수 (KPM 분자). */
export function countKeystrokes(text: string): number {
  return toKeystrokes(text).length
}
