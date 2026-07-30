/**
 * 세션 채점 — 순수 함수 (worker 와 테스트가 공유).
 */
import { countKeystrokes } from '../../lib/hangul.ts'
import type { ItemScore, ScoringOptions, SessionResult } from '../../lib/types.ts'
import { alignOps, countOps, diffChars } from './align.ts'
import { normalizeText, toUnits } from './normalize.ts'

export type ScoreRequest = {
  targets: string[]
  options: ScoringOptions
  elapsedMs: number
} & (
  | { mode: 'continuous'; fullText: string; boundaries: number[] } // boundaries[i] = i번째 항목이 끝난 시점의 입력 길이 (마지막 항목 제외)
  | { mode: 'discrete'; answers: string[] }
)

export function scoreSession(req: ScoreRequest): SessionResult {
  const { targets, options, elapsedMs } = req

  // 항목별 입력 구간 확정
  let answers: string[]
  let rawTyped: string
  if (req.mode === 'discrete') {
    answers = targets.map((_, i) => req.answers[i] ?? '')
    rawTyped = answers.join('')
  } else {
    rawTyped = req.fullText
    answers = []
    let prev = 0
    for (let i = 0; i < targets.length; i++) {
      const end = i < targets.length - 1 ? Math.max(prev, req.boundaries[i] ?? prev) : req.fullText.length
      answers.push(req.fullText.slice(prev, end))
      prev = end
    }
  }

  const items: ItemScore[] = targets.map((target, i) => {
    const nt = normalizeText(target, options)
    const ni = normalizeText(answers[i], options)
    const ops = alignOps(toUnits(nt, options.unit), toUnits(ni, options.unit))
    const c = countOps(ops)
    return {
      target,
      input: answers[i],
      correct: c.correct,
      errors: c.substituted + c.inserted + c.deleted,
      substituted: c.substituted,
      inserted: c.inserted,
      deleted: c.deleted,
      diff: diffChars(nt, ni),
    }
  })

  const totalUnits = items.reduce((s, it) => s + it.correct + it.substituted + it.deleted, 0) // = 목표 단위 수
  const correctUnits = items.reduce((s, it) => s + it.correct, 0)
  const minutes = Math.max(elapsedMs, 1000) / 60000
  return {
    accuracy: totalUnits > 0 ? correctUnits / totalUnits : 0,
    kpm: countKeystrokes(rawTyped) / minutes,
    elapsedMs,
    totalUnits,
    correctUnits,
    items,
  }
}
