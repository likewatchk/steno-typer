/**
 * 입력 진단 로거 — 속기계가 브라우저에 어떤 이벤트 시퀀스로 글자를 넣는지 기록.
 * 실물 속기계는 개발 환경에 없으므로, 문제가 생기면 이 로그가 유일한 증거다.
 *
 * 항상 기록한다 (설정 무관) — "방금 안 쳐졌어" 순간에 로그가 없으면 진단이 불가능하다.
 * 비용: 이벤트당 소형 객체 1개를 순환 버퍼에 기록 (shift 없는 진짜 링버퍼, O(1)).
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
const buf: (DiagEvent | undefined)[] = new Array(MAX)
let head = 0 // 다음 기록 위치
let total = 0

export function diagLog(ev: Omit<DiagEvent, 't'>): void {
  buf[head] = { t: Math.round(performance.now()), ...ev }
  head = (head + 1) % MAX
  total++
}

export function diagCount(): number {
  return Math.min(total, MAX)
}

export function diagClear(): void {
  buf.fill(undefined)
  head = 0
  total = 0
}

/** 시간순 이벤트 배열 (링 순서 복원) */
export function diagEvents(): DiagEvent[] {
  const out: DiagEvent[] = []
  for (let i = 0; i < MAX; i++) {
    const ev = buf[(head + i) % MAX]
    if (ev) out.push(ev)
  }
  return out
}

export interface DiagSummary {
  events: number
  /** 입력창 포커스 이탈 횟수 / 이탈 상태로 보낸 총 시간(ms) — 이탈 중 주입은 전부 유실된다 */
  blurCount: number
  blurTotalMs: number
  /** 문자 keydown(또는 IME Process) 후 120ms 안에 어떤 input 도 생성되지 않은 횟수
   *  — 주입기가 키 이벤트만 보내고 문자가 안 들어오는 방식이면 여기서 잡힌다 */
  keyWithoutInput: number
  /** 조합(composition)이 열린 채 3초 이상 방치된 구간 수 — IME 상태 꼬임 신호 */
  composingStuck: number
}

/** 유실 의심 패턴 자동 분석 — 내보내기 JSON 에 포함되고 화면 안내에도 쓴다 */
export function diagSummary(): DiagSummary {
  const evs = diagEvents()
  let blurCount = 0
  let blurTotalMs = 0
  let blurAt = -1
  let keyWithoutInput = 0
  let composingStuck = 0
  let compStart = -1

  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]
    if (e.type === 'blur') {
      blurCount++
      blurAt = e.t
    } else if (e.type === 'focus') {
      if (blurAt >= 0) blurTotalMs += Math.max(0, e.t - blurAt)
      blurAt = -1
    } else if (e.type === 'compositionstart') {
      compStart = e.t
    } else if (e.type === 'compositionend') {
      compStart = -1
    }
    // 문자 생성이 기대되는 keydown 인데 이후 120ms 내 beforeinput/input 이 전혀 없음
    if (e.type === 'keydown' && (e.key === 'Process' || (e.key?.length === 1 && e.key !== ' '))) {
      let produced = false
      for (let j = i + 1; j < evs.length && evs[j].t - e.t <= 120; j++) {
        if (evs[j].type === 'beforeinput' || evs[j].type === 'input') {
          produced = true
          break
        }
      }
      // 버퍼 끝(가장 최근)이라 판정 불가한 경우는 제외
      if (!produced && evs.length > 0 && evs[evs.length - 1].t - e.t > 120) keyWithoutInput++
    }
    if (compStart >= 0 && e.t - compStart > 3000) {
      composingStuck++
      compStart = -1
    }
  }
  const last = evs[evs.length - 1]
  if (blurAt >= 0 && last) blurTotalMs += Math.max(0, last.t - blurAt)
  return { events: evs.length, blurCount, blurTotalMs, keyWithoutInput, composingStuck }
}

export function diagExport(): void {
  downloadJson(`steno-diag-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, {
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    summary: diagSummary(),
    events: diagEvents(),
  })
}
