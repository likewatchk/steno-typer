/** 진단 로거 — 링버퍼 무결성 + 유실 패턴 자동 분석 */
import { beforeEach, describe, expect, it } from 'vitest'
import { diagClear, diagCount, diagEvents, diagLog, diagSummary } from './diagnostics.ts'

// performance.now 를 직접 제어하기 어려우므로 t 를 조작해 이벤트를 심는다
function seed(events: Array<{ type: string; t: number; key?: string }>): void {
  diagClear()
  for (const e of events) {
    diagLog({ type: e.type, key: e.key })
  }
  // 기록된 t 를 시나리오 값으로 덮어씀 (버퍼 순서는 유지)
  const evs = diagEvents()
  evs.forEach((ev, i) => {
    ev.t = events[i].t
  })
}

beforeEach(() => diagClear())

describe('링버퍼', () => {
  it('용량 초과 시 가장 오래된 것부터 밀려나고 순서 유지', () => {
    for (let i = 0; i < 5010; i++) diagLog({ type: 'input', dataLen: i })
    expect(diagCount()).toBe(5000)
    const evs = diagEvents()
    expect(evs.length).toBe(5000)
    expect(evs[0].dataLen).toBe(10) // 0~9 밀려남
    expect(evs[4999].dataLen).toBe(5009)
  })

  it('clear 후 비어 있음', () => {
    diagLog({ type: 'input' })
    diagClear()
    expect(diagCount()).toBe(0)
    expect(diagEvents()).toEqual([])
  })
})

describe('diagSummary — 유실 의심 패턴', () => {
  it('포커스 이탈 횟수·시간 집계', () => {
    seed([
      { type: 'focus', t: 0 },
      { type: 'input', t: 100 },
      { type: 'blur', t: 1000 },
      { type: 'focus', t: 3000 },
      { type: 'blur', t: 5000 },
      { type: 'input', t: 6000 }, // 이탈 상태로 종료 → 마지막 이벤트까지 가산
    ])
    const s = diagSummary()
    expect(s.blurCount).toBe(2)
    expect(s.blurTotalMs).toBe(2000 + 1000)
  })

  it('문자 keydown 후 input 미생성 감지 (키만 보내는 주입 방식)', () => {
    seed([
      { type: 'keydown', key: 'Process', t: 0 },
      // 120ms 내 input 없음
      { type: 'keydown', key: 'Process', t: 500 },
      { type: 'input', t: 510 }, // 이건 생성됨
      { type: 'keydown', key: 'a', t: 1000 },
      { type: 'input', t: 2000 }, // 120ms 밖 — 미생성 판정
    ])
    const s = diagSummary()
    expect(s.keyWithoutInput).toBe(2)
  })

  it('수식 키(Shift 등)는 미생성 판정에서 제외', () => {
    seed([
      { type: 'keydown', key: 'Shift', t: 0 },
      { type: 'keydown', key: 'Escape', t: 50 },
      { type: 'input', t: 5000 },
    ])
    expect(diagSummary().keyWithoutInput).toBe(0)
  })

  it('조합이 3초 이상 열려 있으면 IME 꼬임 신호', () => {
    seed([
      { type: 'compositionstart', t: 0 },
      { type: 'input', t: 100 },
      { type: 'input', t: 4000 }, // 3초 초과
      { type: 'compositionend', t: 4100 },
      { type: 'compositionstart', t: 5000 },
      { type: 'compositionend', t: 5200 }, // 정상
    ])
    expect(diagSummary().composingStuck).toBe(1)
  })
})
