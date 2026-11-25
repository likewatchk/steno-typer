/** 소리자바 기본자리 연습 설정 — 기기별 로컬 기억 */
import { PICK_ALL, isValidPick, type AbbrPick } from './abbrReview.ts'
import { BASIC_STAGES, type CoursePart, type Minutes } from './basicCourses.ts'

export interface SjConfig {
  stage: number
  part: CoursePart
  /** 앞 단계 항목도 섞어 넣기 */
  cumulative: boolean
  /** 항목 섞기 (기본 켬) */
  shuffle: boolean
  /** 목표 타수 — 분당 음절 (10~400) */
  tasu: number
  /** 분량 — 'all' = 범위 전부 한 번씩, 숫자 = 목표 타수로 몇 분 치는 양인가 */
  minutes: Minutes
  /** flow = 타수 속도로 글이 나타남 / all = 처음부터 전부 보임 */
  reveal: 'flow' | 'all'
  /** 총정리(11단계) 약어 고르기 — 'all' · 's{n}'(교재 n단계 묶음) · 약어 id */
  pick: AbbrPick
}

export const TASU_MIN = 10
export const TASU_MAX = 400

export const DEFAULT_SJ: SjConfig = {
  stage: 1,
  part: 'words',
  cumulative: false,
  shuffle: true,
  tasu: 100,
  minutes: 'all',
  reveal: 'flow',
  pick: PICK_ALL,
}

const KEY = 'steno-sj-prefs'

export function clampTasu(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SJ.tasu
  return Math.min(TASU_MAX, Math.max(TASU_MIN, Math.round(n)))
}

export const MINUTES_CHOICES: readonly Minutes[] = ['all', 1, 2, 3, 5]
const PARTS: CoursePart[] = ['words', 'abbr', 'sentences', 'mix']

/** 저장값이 손상돼 있어도 안전한 설정으로 — 모든 필드를 화이트리스트/범위로 정리 */
export function sanitizeSj(raw: unknown): SjConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'string' ? Number(x) : typeof x === 'number' ? x : NaN)
  const bool = (x: unknown, dflt: boolean) => (typeof x === 'boolean' ? x : x === 'true' ? true : x === 'false' ? false : dflt)
  const stage = num(v.stage)
  const minutes = num(v.minutes)
  return {
    stage: Number.isFinite(stage) ? Math.min(BASIC_STAGES.length, Math.max(1, Math.round(stage))) : DEFAULT_SJ.stage,
    part: PARTS.includes(v.part as CoursePart) ? (v.part as CoursePart) : DEFAULT_SJ.part,
    cumulative: bool(v.cumulative, DEFAULT_SJ.cumulative),
    shuffle: bool(v.shuffle, DEFAULT_SJ.shuffle),
    tasu: clampTasu(num(v.tasu)),
    minutes: v.minutes === 'all' ? 'all' : (MINUTES_CHOICES as readonly unknown[]).includes(minutes) ? (minutes as Minutes) : DEFAULT_SJ.minutes,
    reveal: v.reveal === 'all' ? 'all' : 'flow',
    pick: isValidPick(v.pick) ? v.pick : DEFAULT_SJ.pick,
  }
}

export function loadSj(): SjConfig {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return DEFAULT_SJ
    return sanitizeSj(JSON.parse(raw))
  } catch {
    return DEFAULT_SJ
  }
}

export function saveSj(c: SjConfig): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(c))
  } catch {
    /* 기억 실패해도 연습은 된다 */
  }
}
