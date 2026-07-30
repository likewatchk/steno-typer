/** 공유 도메인 타입 */

export interface Wordset {
  id: string
  name: string
  items: string[]
  createdAt: number
  updatedAt: number
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
}

export interface Settings {
  mode: 'view' | 'typing'
  durationMode: 'auto' | 'fixed'
  fixedMs: number
  autoBaseMs: number
  autoPerCharMs: number
  autoMinMs: number
  autoMaxMs: number
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
  scoring: { ignoreSpace: true, ignorePunct: false, unit: 'syllable', inputStyle: 'continuous' },
  syncToken: '',
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
