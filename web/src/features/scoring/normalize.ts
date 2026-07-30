import { toJamos, toKeystrokes } from '../../lib/hangul.ts'
import type { ScoringUnit } from '../../lib/types.ts'

export interface NormalizeOptions {
  ignoreSpace: boolean
  ignorePunct: boolean
}

// 흔한 문장부호 + 한국어 문서에서 자주 쓰는 괄호/따옴표류
const PUNCT_RE = /[.,!?;:…·‥"'“”‘’()[\]{}<>「」『』【】—–\-~/\\]/gu

/** 채점 전 정규화. NFC 는 항상, 나머지는 옵션. */
export function normalizeText(text: string, opts: NormalizeOptions): string {
  let t = text.normalize('NFC')
  if (opts.ignorePunct) t = t.replace(PUNCT_RE, '')
  if (opts.ignoreSpace) {
    t = t.replace(/\s+/g, '')
  } else {
    // 줄바꿈 포함 연속 공백은 한 칸으로 통일
    t = t.replace(/\s+/g, ' ').trim()
  }
  return t
}

/** 정규화된 문자열 → 채점 단위 시퀀스 */
export function toUnits(text: string, unit: ScoringUnit): string[] {
  if (unit === 'jamo') return toJamos(text)
  if (unit === 'keystroke') return toKeystrokes(text)
  return [...text] // syllable: 코드포인트 단위
}
