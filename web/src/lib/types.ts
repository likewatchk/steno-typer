/** 공유 도메인 타입 */

/** 단어장 항목 — t: 원말(채점 대상), h: 힌트(약어 타법 등, 표시 전용) */
export interface WordItem {
  t: string
  h?: string
}

/** 입력 유연성: 문자열(레거시·간편)과 구조형 모두 허용 */
export type WordInput = string | WordItem

export function toWordItem(x: WordInput): WordItem {
  if (typeof x === 'string') return { t: x }
  return x.h ? { t: x.t, h: x.h } : { t: x.t }
}

export interface Wordset {
  id: string
  name: string
  items: WordItem[]
  createdAt: number
  updatedAt: number
}

/** 연습 엔진에 태워지는 항목 (scheduler 가 재수출) */
export interface EngineItem {
  text: string
  /** 약어 타법 등 표시 전용 힌트 */
  hint?: string
  /** 원본 단어장에서의 0-기반 위치 (오답 단어장 생성용) */
  sourceIndex: number
}

export type RangeSpec =
  | { kind: 'all' }
  | { kind: 'span'; from: number; to: number } // 1-기반, 양끝 포함
  | { kind: 'random'; n: number }

export type ScoringUnit = 'syllable' | 'jamo' | 'keystroke'

export interface ScoringOptions {
  ignoreSpace: boolean
  ignorePunct: boolean
  unit: ScoringUnit
  inputStyle: 'continuous' | 'discrete'
  /**
   * exam = 속기 공인시험 기준: 음절 단위 감점, 띄어쓰기·문장부호 무시 강제,
   * 첨가(삽입)도 감점 — 정확률 = (원문 글자수 − 오자·탈자·첨가) / 원문 글자수.
   * 생략 시 custom.
   */
  profile?: 'custom' | 'exam'
}

export interface Settings {
  mode: 'view' | 'typing'
  /** untimed = 시간 무제한, 맞게 치면 다음으로 (타이핑 모드 전용) */
  durationMode: 'auto' | 'fixed' | 'untimed'
  fixedMs: number
  autoBaseMs: number
  autoPerCharMs: number
  autoMinMs: number
  autoMaxMs: number
  /** 자동 노출시간 배속 (0.2=완전 여유 ~ 2.0=빡세게). 시간 = 공식값 ÷ 배속 */
  autoSpeed: number
  blankMs: number
  order: 'seq' | 'shuffle'
  repeat: number // 1~99
  range: RangeSpec
  countdown: boolean
  sound: boolean
  fullscreen: boolean
  previewNext: boolean
  safeMode: boolean
  diagnostics: boolean
  /** 깜빡이 글자 크기 배율 (자동 맞춤 결과에 곱함, 0.5~1.5) */
  flashScale: number
  /** 입력창(타이핑·자유연습) 글자 크기 px */
  inputFontPx: number
  /** 연습 중 실시간 정확도·타수 표시 (실전처럼 가리려면 끔) */
  liveStats: boolean
  /** 약어 힌트 표시 — off: 안 보임(실전) / show: 바로 / delayed: N초 뒤(회상 훈련) */
  hintMode: 'off' | 'show' | 'delayed'
  hintDelayMs: number
  scoring: ScoringOptions
  syncToken: string
}

export const DEFAULT_SETTINGS: Settings = {
  mode: 'view',
  durationMode: 'auto',
  fixedMs: 2000,
  autoBaseMs: 600,
  autoPerCharMs: 180,
  autoMinMs: 1000,
  autoMaxMs: 8000,
  autoSpeed: 1,
  blankMs: 150,
  order: 'seq',
  repeat: 1,
  range: { kind: 'all' },
  countdown: true,
  sound: false,
  fullscreen: true,
  previewNext: false,
  safeMode: false,
  diagnostics: false,
  flashScale: 1,
  inputFontPx: 26,
  liveStats: true,
  hintMode: 'show',
  hintDelayMs: 1000,
  scoring: { ignoreSpace: true, ignorePunct: false, unit: 'syllable', inputStyle: 'continuous', profile: 'custom' },
  syncToken: '',
}

/**
 * 이어하기 스냅샷 — 연습을 중간 종료할 때 저장 (단어장별 1개, 로컬 전용).
 * items 를 통째로 저장하므로 이후 단어장이 편집돼도 이어하기가 깨지지 않는다.
 */
export interface ResumeState {
  wordsetId: string
  wordsetName: string
  items: EngineItem[]
  /** 다시 시작할 항목 인덱스 (0-기반) */
  index: number
  /** 세션에 쓰던 설정 그대로 재개 */
  settings: Settings
  typing?:
    | { kind: 'continuous'; fullText: string; boundaries: number[] }
    | { kind: 'discrete'; answers: string[] }
  /** 무제한 모드: 지금까지의 실경과 누적 (이어하기 후 KPM 정확성) */
  elapsedMs?: number
  savedAt: number
}

/** 항목별 채점 결과 */
export interface ItemScore {
  target: string
  input: string
  correct: number // 일치 단위 수
  errors: number // 치환+삽입+누락
  substituted: number
  inserted: number
  deleted: number
  /** 표시용 음절 diff: [종류, 텍스트] — eq/sub/del(누락)/ins(삽입) */
  diff: Array<['eq' | 'sub' | 'del' | 'ins', string]>
}

export interface SessionResult {
  accuracy: number // 0~1
  kpm: number
  elapsedMs: number
  totalUnits: number
  correctUnits: number
  items: ItemScore[]
  /** 사용자가 실제 친 원문 전체 (연속: 스트림 그대로, 낱개: 줄바꿈 결합) — 결과 화면 전문 보기·복사용 */
  typedText: string
}

export interface SessionRecord {
  id: string
  wordsetId: string
  wordsetName: string
  mode: 'view' | 'typing'
  settings: Pick<Settings, 'durationMode' | 'fixedMs' | 'scoring'>
  startedAt: number
  endedAt: number
  result: SessionResult | null // view 모드는 null
  updatedAt: number
}
