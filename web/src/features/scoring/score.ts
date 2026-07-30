/**
 * 세션 채점 — 순수 함수/클래스 (worker 와 테스트가 공유).
 *
 * 연속 모드의 핵심: 사람은 항목을 "보고 나서" 치므로 입력이 반 박자 늦는다.
 * 항목 전환 순간의 입력 길이(경계)로 딱 자르면 글자가 옆 항목으로 귀속된다.
 * → 경계는 힌트로만 쓰고, 정답 시퀀스를 입력 스트림에 순서대로
 *   최적 정합(prefix alignment + 커서, ±LAG 지연 허용)시켜 구간을 정한다.
 */
import { countKeystrokes } from '../../lib/hangul.ts'
import type { ItemScore, ScoringOptions, SessionResult } from '../../lib/types.ts'
import { alignOps, countOps, diffChars } from './align.ts'
import { normalizeText, toUnits } from './normalize.ts'

/** 타이핑 지연 허용 폭 (정규화 문자 수). 낱말 몇 개 분량. */
export const LAG_CHARS = 24

/**
 * 프로필 반영 — exam(속기 공인시험 기준)은 음절 단위 감점,
 * 띄어쓰기·문장부호 무시를 강제한다.
 */
export function effectiveScoring(o: ScoringOptions): ScoringOptions {
  if (o.profile !== 'exam') return o
  return { ...o, unit: 'syllable', ignoreSpace: true, ignorePunct: true }
}

/**
 * 정확도 공식.
 * custom: 맞은 단위 / 목표 단위 (첨가는 오류 수에만 반영)
 * exam:   (목표 글자수 − 오자·탈자·첨가) / 목표 글자수 — 공인시험식, 음수는 0으로
 */
export function computeAccuracy(
  correct: number,
  total: number,
  inserted: number,
  profile: ScoringOptions['profile'],
): number {
  if (total <= 0) return 0
  if (profile === 'exam') return Math.max(0, (correct - inserted) / total)
  return correct / total
}

export type ScoreRequest = {
  targets: string[]
  options: ScoringOptions
  elapsedMs: number
} & (
  | { mode: 'continuous'; fullText: string; boundaries: number[] } // boundaries[i] = i번째 항목 전환 순간의 입력 길이 (마지막 항목 제외)
  | { mode: 'discrete'; answers: string[] }
)

// ---------- 정규화 + 원본→정규화 위치 매핑 ----------

const PUNCT_RE_SINGLE = /[.,!?;:…·‥"'“”‘’()[\]{}<>「」『』【】—–\-~/\\]/u

interface NormMapped {
  text: string
  /** toNorm[i] = 원본(NFC) i번째 문자 직전까지 살아남은 정규화 문자 수 */
  toNorm: Int32Array
}

/**
 * normalizeText 와 동일한 결과를 내면서 위치 매핑을 함께 만든다.
 * (테스트로 동일성 보장 — score.test.ts)
 */
export function normalizeWithMap(raw: string, opts: ScoringOptions): NormMapped {
  const nfc = raw.normalize('NFC')
  const chars = [...nfc]
  const toNorm = new Int32Array(chars.length + 1)
  let out = ''
  let pendingSpace = false // ignoreSpace=false 일 때 연속 공백 1칸 압축용
  for (let i = 0; i < chars.length; i++) {
    toNorm[i] = out.length
    const ch = chars[i]
    if (opts.ignorePunct && PUNCT_RE_SINGLE.test(ch)) continue
    if (/\s/.test(ch)) {
      if (!opts.ignoreSpace) pendingSpace = out.length > 0 // 선행 공백은 trim
      continue
    }
    if (pendingSpace) {
      out += ' '
      pendingSpace = false
    }
    out += ch
  }
  toNorm[chars.length] = out.length
  return { text: out, toNorm }
}

// ---------- 자유 선두 정합: 목표 전체 vs 윈도 접두부 ----------

/**
 * target 을 window 안 어딘가에 정합시키고, 정합이 끝나는 소비 길이 j 를 찾는다.
 * 선두 건너뜀은 무료(dp[0][j]=0) — 이전 항목의 오타 잔해가 window 앞에 남아 있어도
 * 진짜 매칭을 포기하지 않는다 (건너뛴 글자는 answers 에 포함돼 삽입 오류로 집계됨).
 *
 * 선택 규칙:
 * - 최소 거리가 목표 길이와 같으면(사실상 아무것도 안 맞음) 소비 0 → 누락 처리.
 *   덕분에 건너뛴 항목이 다음 항목의 글자를 잡아먹지 않는다.
 * - 그 외 동률이면 |j - 목표길이| 최소(같으면 작은 j) — 끝 글자 오타는 치환으로
 *   흡수하면서, 같은 낱말이 연속되는 반복 연습에서 다음 항목을 먹지 않는다.
 */
export function bestCut(target: string[], window: string[]): [number, number] {
  const n = target.length
  const m = window.length
  if (n === 0) return [0, 0]
  let prev = new Int32Array(m + 1)
  let cur = new Int32Array(m + 1)
  // prev[j] = 0 — 선두 건너뜀 무료
  for (let i = 1; i <= n; i++) {
    cur[0] = i
    const ti = target[i - 1]
    for (let j = 1; j <= m; j++) {
      const sub = prev[j - 1] + (ti === window[j - 1] ? 0 : 1)
      const del = prev[j] + 1
      const ins = cur[j - 1] + 1
      cur[j] = sub <= del ? (sub <= ins ? sub : ins) : del <= ins ? del : ins
    }
    ;[prev, cur] = [cur, prev]
  }
  let bestD = prev[0]
  for (let j = 1; j <= m; j++) if (prev[j] < bestD) bestD = prev[j]
  if (bestD >= n) return [0, n] // 매칭 실질 없음 → 누락
  let bestJ = -1
  for (let j = 0; j <= m; j++) {
    if (prev[j] === bestD && (bestJ < 0 || Math.abs(j - n) < Math.abs(bestJ - n))) bestJ = j
  }
  return [bestJ, bestD]
}

// ---------- 연속 모드 채점기 (배치·실시간 공용) ----------

export class ContinuousScorer {
  private cursor = 0 // 정규화 문자 공간의 소비 위치
  private nextItem = 0
  private answers: string[] = []
  private scored: ItemScore[] = []
  private correctAcc = 0
  private totalAcc = 0
  private insertedAcc = 0
  private targetsNorm: string[]

  constructor(
    private targets: string[],
    options: ScoringOptions,
  ) {
    this.options = effectiveScoring(options)
    this.targetsNorm = targets.map((t) => normalizeText(t, this.options))
  }

  private options: ScoringOptions

  get scoredCount(): number {
    return this.nextItem
  }

  private windowFor(i: number, norm: string, boundNorm: number[], final: boolean): [number, number] {
    // 시작: 커서. 단, 커서가 명목 시작(직전 경계)보다 LAG 이상 뒤처지면 재정박
    // (중간에 대량 쓰레기 입력이 끼어도 이후 항목이 전부 무너지지 않게)
    const nominalStart = i > 0 ? (boundNorm[i - 1] ?? 0) : 0
    const start = Math.max(this.cursor, nominalStart - LAG_CHARS)
    // 끝: 다음 전환 경계 + LAG (마지막 항목이거나 finalize 면 스트림 끝까지)
    const cap =
      final || i >= this.targets.length - 1 || boundNorm[i] === undefined
        ? norm.length
        : Math.min(norm.length, boundNorm[i] + LAG_CHARS)
    // DP 폭 상한 (폭주 방지)
    const tLen = [...this.targetsNorm[i]].length
    const hardCap = start + tLen * 2 + LAG_CHARS * 2
    return [start, Math.max(start, Math.min(cap, hardCap))]
  }

  /**
   * 지금까지의 입력으로 "확정 가능한" 항목까지 전진 채점.
   * 항목 i 는 스트림이 그 윈도 상한(경계+LAG)을 지나야 확정한다 —
   * 늦게 도착할 글자가 남아 있는 항목을 성급히 자르지 않기 위해.
   * 반환: 새로 확정된 항목 수.
   */
  step(rawFullText: string, rawBoundaries: number[], uptoItem: number): number {
    const { text: norm, toNorm } = normalizeWithMap(rawFullText, this.options)
    const boundNorm = rawBoundaries.map((b) => toNorm[Math.max(0, Math.min(b, toNorm.length - 1))])
    let advanced = 0
    while (this.nextItem <= uptoItem && this.nextItem < this.targets.length - 1) {
      const i = this.nextItem
      // 확정 조건: 이 항목의 윈도 상한까지 입력이 이미 도착했는가
      if (boundNorm[i] === undefined || boundNorm[i] + LAG_CHARS > norm.length) break
      this.consume(i, norm, boundNorm, false)
      advanced++
    }
    return advanced
  }

  private consume(i: number, norm: string, boundNorm: number[], final: boolean): void {
    const [start, end] = this.windowFor(i, norm, boundNorm, final)
    const window = [...norm.slice(start, end)]
    const target = [...this.targetsNorm[i]]
    const [j] = bestCut(target, window)
    this.answers[i] = final && i === this.targets.length - 1
      ? norm.slice(start) // 마지막 항목은 잔여 전부
      : norm.slice(start, start + window.slice(0, j).join('').length)
    // slice+join 은 서로게이트 안전하게 j "문자"를 되돌리기 위함
    this.cursor = start + this.answers[i].length
    this.nextItem = i + 1
    const s = scoreItem(this.targetsNorm[i], this.answers[i], this.targets[i], this.options)
    this.scored[i] = s
    this.correctAcc += s.correct
    this.totalAcc += s.correct + s.substituted + s.deleted
    this.insertedAcc += s.inserted
  }

  /** 전 항목 확정 + ItemScore 배열 생성. 마지막 항목은 스트림 잔여 전부를 받는다. */
  finalize(rawFullText: string, rawBoundaries: number[]): ItemScore[] {
    const { text: norm, toNorm } = normalizeWithMap(rawFullText, this.options)
    const boundNorm = rawBoundaries.map((b) => toNorm[Math.max(0, Math.min(b, toNorm.length - 1))])
    while (this.nextItem < this.targets.length) {
      this.consume(this.nextItem, norm, boundNorm, this.nextItem === this.targets.length - 1)
    }
    return this.scored
  }

  /** 실시간 표시용 누계 (확정된 항목 기준, O(1)) */
  runningTotals(): { correct: number; total: number; inserted: number } {
    return { correct: this.correctAcc, total: this.totalAcc, inserted: this.insertedAcc }
  }
}

// ---------- 항목 하나 채점 ----------

/** 원시 입력을 정규화해 항목 하나를 채점 (낱개 모드·실시간용) */
export function scoreOneItem(target: string, answerRaw: string, rawOptions: ScoringOptions): ItemScore {
  const options = effectiveScoring(rawOptions)
  return scoreItem(normalizeText(target, options), normalizeText(answerRaw, options), target, options)
}

function scoreItem(targetNorm: string, answerNorm: string, targetRaw: string, options: ScoringOptions): ItemScore {
  const ops = alignOps(toUnits(targetNorm, options.unit), toUnits(answerNorm, options.unit))
  const c = countOps(ops)
  return {
    target: targetRaw,
    input: answerNorm,
    correct: c.correct,
    errors: c.substituted + c.inserted + c.deleted,
    substituted: c.substituted,
    inserted: c.inserted,
    deleted: c.deleted,
    diff: diffChars(targetNorm, answerNorm),
  }
}

// ---------- 배치 채점 ----------

export function scoreSession(req: ScoreRequest): SessionResult {
  const { targets, elapsedMs } = req
  const options = effectiveScoring(req.options)

  let items: ItemScore[]
  let rawTyped: string
  let typedText: string
  if (req.mode === 'discrete') {
    rawTyped = targets.map((_, i) => req.answers[i] ?? '').join('')
    typedText = targets.map((_, i) => req.answers[i] ?? '').join('\n')
    items = targets.map((t, i) =>
      scoreItem(normalizeText(t, options), normalizeText(req.answers[i] ?? '', options), t, options),
    )
  } else {
    rawTyped = req.fullText
    typedText = req.fullText
    items = new ContinuousScorer(targets, options).finalize(req.fullText, req.boundaries)
  }

  const totalUnits = items.reduce((s, it) => s + it.correct + it.substituted + it.deleted, 0) // = 목표 단위 수
  const correctUnits = items.reduce((s, it) => s + it.correct, 0)
  const insertedUnits = items.reduce((s, it) => s + it.inserted, 0)
  const minutes = Math.max(elapsedMs, 1000) / 60000
  return {
    accuracy: computeAccuracy(correctUnits, totalUnits, insertedUnits, options.profile),
    kpm: countKeystrokes(rawTyped) / minutes,
    elapsedMs,
    totalUnits,
    correctUnits,
    items,
    typedText,
  }
}
