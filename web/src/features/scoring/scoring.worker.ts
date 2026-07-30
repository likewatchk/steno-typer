/// <reference lib="webworker" />
/**
 * 채점 워커 — 배치(세션 종료) + 실시간(항목 전환마다) 겸용.
 * 실시간은 ContinuousScorer 의 커서 상태를 유지하며 확정 가능한 항목만 전진 채점하므로
 * 세션 길이와 무관하게 스텝당 비용이 일정하고, 최종 결과는 배치와 완전히 동일하다.
 */
import { countKeystrokes } from '../../lib/hangul.ts'
import type { ItemScore, ScoringOptions, SessionResult } from '../../lib/types.ts'
import { ContinuousScorer, computeAccuracy, scoreOneItem, scoreSession, type ScoreRequest } from './score.ts'

export type WorkerIn =
  | { kind: 'batch'; req: ScoreRequest }
  | { kind: 'live-init'; targets: string[]; options: ScoringOptions }
  | { kind: 'live-step'; fullText: string; boundaries: number[]; uptoItem: number; elapsedMs: number }
  | { kind: 'live-final'; fullText: string; boundaries: number[]; elapsedMs: number }
  | { kind: 'live-discrete-init'; options: ScoringOptions }
  | { kind: 'live-discrete-step'; target: string; answer: string; elapsedMs: number }

export type WorkerOut =
  | { kind: 'batch'; result: SessionResult }
  | { kind: 'live'; scoredCount: number; accuracy: number; kpm: number }
  | { kind: 'final'; result: SessionResult }

let live: ContinuousScorer | null = null
let liveProfile: ScoringOptions['profile'] = 'custom'

// 낱개 모드 실시간 누계
let dOptions: ScoringOptions | null = null
let dScored: ItemScore[] = []
let dCorrect = 0
let dTotal = 0
let dInserted = 0
let dKeystrokes = 0

function buildResult(
  items: ItemScore[],
  kpm: number,
  elapsedMs: number,
  profile: ScoringOptions['profile'],
  typedText: string,
): SessionResult {
  const totalUnits = items.reduce((s, it) => s + it.correct + it.substituted + it.deleted, 0)
  const correctUnits = items.reduce((s, it) => s + it.correct, 0)
  const insertedUnits = items.reduce((s, it) => s + it.inserted, 0)
  return {
    accuracy: computeAccuracy(correctUnits, totalUnits, insertedUnits, profile),
    kpm,
    elapsedMs,
    totalUnits,
    correctUnits,
    items,
    typedText,
  }
}

self.onmessage = (e: MessageEvent<WorkerIn>) => {
  const msg = e.data
  switch (msg.kind) {
    case 'batch':
      self.postMessage({ kind: 'batch', result: scoreSession(msg.req) } satisfies WorkerOut)
      return

    case 'live-init':
      live = new ContinuousScorer(msg.targets, msg.options)
      liveProfile = msg.options.profile
      return

    case 'live-step': {
      if (!live) return
      live.step(msg.fullText, msg.boundaries, msg.uptoItem)
      const { correct, total, inserted } = live.runningTotals()
      const minutes = Math.max(msg.elapsedMs, 1000) / 60000
      self.postMessage({
        kind: 'live',
        scoredCount: live.scoredCount,
        accuracy: computeAccuracy(correct, total, inserted, liveProfile),
        kpm: countKeystrokes(msg.fullText) / minutes,
      } satisfies WorkerOut)
      return
    }

    case 'live-final': {
      if (!live) return
      const items = live.finalize(msg.fullText, msg.boundaries)
      const minutes = Math.max(msg.elapsedMs, 1000) / 60000
      const result = buildResult(
        items,
        countKeystrokes(msg.fullText) / minutes,
        msg.elapsedMs,
        liveProfile,
        msg.fullText,
      )
      live = null
      self.postMessage({ kind: 'final', result } satisfies WorkerOut)
      return
    }

    case 'live-discrete-init':
      dOptions = msg.options
      dScored = []
      dCorrect = 0
      dTotal = 0
      dInserted = 0
      dKeystrokes = 0
      return

    case 'live-discrete-step': {
      if (!dOptions) return
      const s = scoreOneItem(msg.target, msg.answer, dOptions)
      dScored.push(s)
      dCorrect += s.correct
      dTotal += s.correct + s.substituted + s.deleted
      dInserted += s.inserted
      dKeystrokes += countKeystrokes(msg.answer)
      const minutes = Math.max(msg.elapsedMs, 1000) / 60000
      self.postMessage({
        kind: 'live',
        scoredCount: dScored.length,
        accuracy: computeAccuracy(dCorrect, dTotal, dInserted, dOptions.profile),
        kpm: dKeystrokes / minutes,
      } satisfies WorkerOut)
      return
    }
  }
}
