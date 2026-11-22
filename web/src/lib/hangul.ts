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

/** 겹모음의 첫 모음 — 'ㅗ' 를 치는 중이면 아직 'ㅘ' 가 될 수 있다 */
const VOWEL_FIRST: Record<string, string> = { ㅘ: 'ㅗ', ㅙ: 'ㅗ', ㅚ: 'ㅗ', ㅝ: 'ㅜ', ㅞ: 'ㅜ', ㅟ: 'ㅜ', ㅢ: 'ㅡ' }
/** 겹받침 → [앞 자음, 뒤 자음] */
const JONG_SPLIT: Record<string, [string, string]> = {
  ㄳ: ['ㄱ', 'ㅅ'],
  ㄵ: ['ㄴ', 'ㅈ'],
  ㄶ: ['ㄴ', 'ㅎ'],
  ㄺ: ['ㄹ', 'ㄱ'],
  ㄻ: ['ㄹ', 'ㅁ'],
  ㄼ: ['ㄹ', 'ㅂ'],
  ㄽ: ['ㄹ', 'ㅅ'],
  ㄾ: ['ㄹ', 'ㅌ'],
  ㄿ: ['ㄹ', 'ㅍ'],
  ㅀ: ['ㄹ', 'ㅎ'],
  ㅄ: ['ㅂ', 'ㅅ'],
}

/**
 * 조합 중인 글자 `partial` 이 계속 치면 `target` 음절이 될 수 있는가.
 *
 * IME 는 다음 음절 첫 키가 들어올 때까지 앞 음절을 조합 상태로 두므로, 조합 중 글자를 그대로
 * 채점하면 '치마' 를 치는 동안 '침' 이 잠깐 오자로 보인다. 여기서 "아직 맞을 수 있는" 경우를 가려
 * 잠정 정답으로 보여 주기 위한 판정:
 * - 홑초성 'ㅊ' → '치'·'침' (초성이 같다)
 * - '치' → '침' (받침이 더 붙을 수 있다), '고' → '과' (겹모음), '달' → '닭' (겹받침)
 * - '침' → '치' — 받침 ㅁ 이 다음 음절 초성으로 넘어갈 때만. 그래서 원문 다음 음절 `next` 의
 *   초성이 그 받침이어야 한다 ('치마' 면 참, '치다' 면 거짓). '닭' → '달' 도 같은 규칙(뒤 자음 ㄱ).
 *   겹받침은 뒤 자음만 넘어가므로 '닭' 이 '다' 가 되지는 않는다.
 */
export function canBecomeSyllable(partial: string, target: string, next?: string): boolean {
  if (partial === target) return true
  const t = decomposeSyllable(target)
  if (!t) return false
  const p = decomposeSyllable(partial)
  if (!p) return (CHOSEONG as readonly string[]).includes(partial) && partial === t[0]
  if (p[0] !== t[0]) return false
  if (p[1] !== t[1]) return p[2] === '' && VOWEL_FIRST[t[1]] === p[1]
  if (p[2] === t[2] || p[2] === '') return true
  if (JONG_SPLIT[t[2]]?.[0] === p[2]) return true // 겹받침이 더 붙는다
  // 받침(의 뒤 자음)이 다음 음절 초성으로 넘어간다
  const carried = t[2] === '' ? (JONG_SPLIT[p[2]] ? null : p[2]) : JONG_SPLIT[p[2]]?.[0] === t[2] ? JONG_SPLIT[p[2]][1] : null
  if (!carried || next === undefined) return false
  const nx = decomposeSyllable(next)
  return nx !== null && nx[0] === carried
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
