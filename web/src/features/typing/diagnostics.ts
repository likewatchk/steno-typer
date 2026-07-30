/**
 * 입력 진단 로거 — 속기계가 브라우저에 어떤 이벤트 시퀀스로 글자를 넣는지 기록.
 * 실물 속기계는 개발 환경에 없으므로, 문제가 생기면 이 로그가 유일한 증거다.
 * 링 버퍼 5000개, JSON 내보내기.
 */
import { downloadJson } from '../wordset/importText.ts'

export interface DiagEvent {
  t: number // performance.now()
  type: string // keydown | beforeinput | input | compositionstart | ...
  key?: string
  inputType?: string
  dataLen?: number
  composing?: boolean
  valueLen?: number
}

const MAX = 5000
let buf: DiagEvent[] = []
let enabled = false

export function setDiagEnabled(v: boolean): void {
  enabled = v
}

export function isDiagEnabled(): boolean {
  return enabled
}

export function diagLog(ev: Omit<DiagEvent, 't'>): void {
  if (!enabled) return
  if (buf.length >= MAX) buf.shift()
  buf.push({ t: Math.round(performance.now()), ...ev })
}

export function diagCount(): number {
  return buf.length
}

export function diagClear(): void {
  buf = []
}

export function diagExport(): void {
  downloadJson(`steno-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    events: buf,
  })
}
