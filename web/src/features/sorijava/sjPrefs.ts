/** 소리자바 기본자리 연습 설정 — 기기별 로컬 기억 */
import type { CoursePart } from './basicCourses.ts'

export interface SjConfig {
  stage: number
  part: CoursePart
  /** 앞 단계 항목도 섞어 넣기 */
  cumulative: boolean
  /** 항목 섞기 (기본 켬) */
  shuffle: boolean
  /** 목표 타수 — 분당 음절 (10~400) */
  tasu: number
  /** 분량 — 목표 타수로 몇 분 치는 양인가 */
  minutes: number
  /** flow = 타수 속도로 글이 나타남 / all = 처음부터 전부 보임 */
  reveal: 'flow' | 'all'
}

export const TASU_MIN = 10
export const TASU_MAX = 400

export const DEFAULT_SJ: SjConfig = {
  stage: 1,
  part: 'words',
  cumulative: false,
  shuffle: true,
  tasu: 100,
  minutes: 1,
  reveal: 'flow',
}

const KEY = 'steno-sj-prefs'

export function clampTasu(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SJ.tasu
  return Math.min(TASU_MAX, Math.max(TASU_MIN, Math.round(n)))
}

export const MINUTES_CHOICES = [1, 2, 3, 5] as const
const PARTS: CoursePart[] = ['words', 'abbr', 'sentences', 'mix']

/** 저장값이 손상돼 있어도 안전한 설정으로 — 모든 필드를 화이트리스트/범위로 정리 */
export function sanitizeSj(raw: unknown): SjConfig {
  const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const num = (x: unknown) => (typeof x === 'string' ? Number(x) : typeof x === 'number' ? x : NaN)
  const bool = (x: unknown, dflt: boolean) => (typeof x === 'boolean' ? x : x === 'true' ? true : x === 'false' ? false : dflt)
  const stage = num(v.stage)
  const minutes = num(v.minutes)
  return {
    stage: Number.isFinite(stage) ? Math.min(10, Math.max(1, Math.round(stage))) : DEFAULT_SJ.stage,
    part: PARTS.includes(v.part as CoursePart) ? (v.part as CoursePart) : DEFAULT_SJ.part,
    cumulative: bool(v.cumulative, DEFAULT_SJ.cumulative),
    shuffle: bool(v.shuffle, DEFAULT_SJ.shuffle),
    tasu: clampTasu(num(v.tasu)),
    minutes: (MINUTES_CHOICES as readonly number[]).includes(minutes) ? minutes : DEFAULT_SJ.minutes,
    reveal: v.reveal === 'all' ? 'all' : 'flow',
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
