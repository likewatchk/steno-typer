// @vitest-environment jsdom
/**
 * 타이핑 세션 종료 → 결과 화면 흐름의 회귀 테스트.
 * 실사용 장애 재현: 워커가 영원히 침묵(배포로 청크 404)해도
 * 워치독이 메인 스레드 채점으로 폴백해 "채점 중…" 무한 로딩이 불가능함을 보장.
 */
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../../app/App.tsx'
import { useApp } from '../../app/store.ts'
import * as repo from '../../lib/repo.ts'
import { DEFAULT_SETTINGS } from '../../lib/types.ts'
import { scoreSession } from '../scoring/score.ts'
import type { WorkerIn, WorkerOut } from '../scoring/scoring.worker.ts'
import { SCORING_WATCHDOG } from './Practice.tsx'

/** 침묵 워커 — 청크 404 로 로드가 안 된 상태 재현 (메시지 큐잉만, 응답·에러 없음) */
class SilentWorker {
  onmessage: ((e: MessageEvent<WorkerOut>) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(): void {}
  terminate(): void {}
}

/** 에코 워커 — 실제 채점 로직으로 응답하는 정상 경로 */
class EchoWorker {
  onmessage: ((e: { data: WorkerOut }) => void) | null = null
  onerror: ((e: ErrorEvent) => void) | null = null
  postMessage(msg: WorkerIn): void {
    if (msg.kind === 'batch') {
      const result = scoreSession(msg.req)
      queueMicrotask(() => this.onmessage?.({ data: { kind: 'batch', result } }))
    } else if (msg.kind === 'live-final') {
      // 동등성 테스트로 배치와 동일함이 보장된 경로
      const result = scoreSession({
        mode: 'continuous',
        targets: lastInitTargets,
        options: lastInitOptions,
        elapsedMs: msg.elapsedMs,
        fullText: msg.fullText,
        boundaries: msg.boundaries,
      })
      queueMicrotask(() => this.onmessage?.({ data: { kind: 'final', result } }))
    } else if (msg.kind === 'live-init') {
      lastInitTargets = msg.targets
      lastInitOptions = msg.options
    }
    // live-step / discrete 스텝은 표시용 — 응답 생략해도 흐름과 무관
  }
  terminate(): void {}
}
let lastInitTargets: string[] = []
let lastInitOptions = DEFAULT_SETTINGS.scoring

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  SCORING_WATCHDOG.ms = 120 // 테스트에선 짧게
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    await useApp.getState().init()
  })
  // 빠른 세션 설정: 타이핑·카운트다운 없음·항목당 120ms
  useApp.setState({
    settings: {
      ...DEFAULT_SETTINGS,
      mode: 'typing',
      durationMode: 'fixed',
      fixedMs: 120,
      blankMs: 20,
      countdown: false,
      fullscreen: false,
      liveStats: false,
    },
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  act(() => root.unmount())
  container.remove()
})

async function runSessionAndWaitResult(): Promise<void> {
  const ws = await repo.createWordset(`흐름${Date.now()}`, ['가나', '다라'])
  await act(async () => {
    await useApp.getState().reloadWordsets()
    useApp.getState().select(ws.id)
    root.render(<App />)
  })
  act(() => {
    useApp.getState().startPractice()
  })
  const t0 = Date.now()
  while (useApp.getState().screen.name !== 'result') {
    if (Date.now() - t0 > 5000) {
      throw new Error(`결과 화면 미도달 — 현재: ${useApp.getState().screen.name} (채점 무한 로딩 회귀!)`)
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 25))
    })
  }
}

describe('타이핑 세션 종료 흐름', () => {
  it('정상 워커(에코): 세션 종료 → 결과 화면 + 기록 저장', async () => {
    vi.stubGlobal('Worker', EchoWorker)
    await runSessionAndWaitResult()
    const screen = useApp.getState().screen
    if (screen.name !== 'result') throw new Error('unreachable')
    expect(screen.record.result).not.toBeNull()
    expect(screen.record.result!.items.length).toBe(2)
    expect(screen.record.result!.typedText).toBe('') // 입력 없이 종료한 세션
  })

  it('침묵 워커(청크 404 재현): 워치독 폴백으로 반드시 결과 도달', async () => {
    vi.stubGlobal('Worker', SilentWorker)
    await runSessionAndWaitResult()
    const screen = useApp.getState().screen
    if (screen.name !== 'result') throw new Error('unreachable')
    expect(screen.record.result).not.toBeNull()
    expect(screen.record.result!.accuracy).toBe(0) // 빈 입력 = 전부 누락
  })

  it('실시간 켠 연속 모드도 에코 워커로 결과 도달', async () => {
    vi.stubGlobal('Worker', EchoWorker)
    useApp.setState((st) => ({ settings: { ...st.settings, liveStats: true } }))
    await runSessionAndWaitResult()
    expect(useApp.getState().screen.name).toBe('result')
  })

  it('워커 생성 자체가 불가능해도(생성자 throw) 결과 도달', async () => {
    vi.stubGlobal(
      'Worker',
      class {
        constructor() {
          throw new Error('no worker')
        }
      },
    )
    await runSessionAndWaitResult()
    expect(useApp.getState().screen.name).toBe('result')
  })
})
