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

describe('일시정지·시킹·이어하기', () => {
  async function mountSession(items: string[], over: Partial<typeof DEFAULT_SETTINGS> = {}) {
    vi.stubGlobal('Worker', EchoWorker)
    useApp.setState((st) => ({ settings: { ...st.settings, ...over } }))
    const ws = await repo.createWordset(`제어${Date.now()}${Math.random()}`, items)
    await act(async () => {
      await useApp.getState().reloadWordsets()
      useApp.getState().select(ws.id)
      root.render(<App />)
    })
    act(() => {
      useApp.getState().startPractice()
    })
    await act(async () => {})
    return ws
  }
  const click = (label: string) => {
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
    if (!btn) throw new Error(`버튼 없음: ${label}`)
    act(() => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    })
  }

  it('⏸ 버튼 → 일시정지 메뉴, ◀▶ 스텝으로 위치 이동, 화살표 키도 동작', async () => {
    await mountSession(['하나', '둘', '셋', '넷'], { fixedMs: 60_000, countdown: false }) // 자동 전환 없음·즉시 시작
    click('⏸')
    expect(container.textContent).toContain('1 / 4')

    click('다음 ▶')
    expect(container.textContent).toContain('2 / 4')
    click('다음 ▶')
    expect(container.textContent).toContain('3 / 4')
    click('◀ 이전')
    expect(container.textContent).toContain('2 / 4')

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    })
    expect(container.textContent).toContain('3 / 4')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    })
    expect(container.textContent).toContain('2 / 4')
  })

  it('종료(진행 저장) → resume 저장, 이어서 시작 → 해당 항목부터', async () => {
    const ws = await mountSession(['하나', '둘', '셋', '넷'], { fixedMs: 60_000, mode: 'view', countdown: false })
    click('⏸')
    click('다음 ▶')
    click('다음 ▶') // index 2
    click('종료 (진행 저장)')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(useApp.getState().screen.name).toBe('home')
    const saved = await repo.getResume(ws.id)
    expect(saved?.index).toBe(2)
    expect(saved?.items.length).toBe(4)

    // 이어서 시작 → 3/4 부터
    act(() => {
      useApp.getState().startPracticeResume(saved!)
    })
    await act(async () => {})
    expect(useApp.getState().screen.name).toBe('practice')
    expect(container.textContent).toContain('3 / 4')
  })

  it('완주하면 resume 삭제', async () => {
    const ws = await mountSession(['가나', '다라'], { mode: 'view', fixedMs: 120, blankMs: 20, countdown: false })
    // 미리 가짜 resume 심어두고 완주가 지우는지 확인
    await repo.saveResume({
      wordsetId: ws.id,
      wordsetName: ws.name,
      items: [{ text: '가나', sourceIndex: 0 }],
      index: 0,
      settings: useApp.getState().settings,
      savedAt: Date.now(),
    })
    const t0 = Date.now()
    while (useApp.getState().screen.name === 'practice') {
      if (Date.now() - t0 > 5000) throw new Error('완주 미도달')
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
      // 보기 모드 완료 오버레이 → 홈
      const homeBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '홈')
      if (homeBtn) {
        act(() => {
          homeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
      }
    }
    await act(async () => {
      await new Promise((r) => setTimeout(r, 30))
    })
    expect(await repo.getResume(ws.id)).toBeUndefined()
  })

  it('타이핑 연속 모드: 되감기 시 이동 지점 이후 입력 삭제', async () => {
    await mountSession(['가나', '다라', '마바'], {
      mode: 'typing',
      fixedMs: 60_000,
      liveStats: false,
      countdown: false,
    })
    const ta = container.querySelector('textarea')!
    // 항목 1(가나) 입력 흉내
    act(() => {
      ta.value = '가나'
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: '가나', inputType: 'insertText' }))
    })
    click('⏸')
    click('다음 ▶') // → 항목 2 로 이동 (경계 기록: boundaries[0]=2)
    act(() => {
      ta.value = '가나다라'
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: '다라', inputType: 'insertText' }))
    })
    click('◀ 이전') // 항목 1 로 되감기 → boundaries[0] 이후 삭제
    expect(ta.value).toBe('')
    // 처음(항목 1)으로 돌아왔으니 전체 재입력 상태
    expect(container.textContent).toContain('1 / 3')
  })
})

describe('무제한 모드 (맞추면 넘어가기)', () => {
  const type = (ta: HTMLTextAreaElement, text: string) => {
    act(() => {
      ta.value = text
      ta.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }))
    })
  }
  const waitFor = async (cond: () => boolean, why: string) => {
    const t0 = Date.now()
    while (!cond()) {
      if (Date.now() - t0 > 5000) throw new Error(`대기 초과: ${why}`)
      await act(async () => {
        await new Promise((r) => setTimeout(r, 25))
      })
    }
  }

  it('연속 모드: 정답 입력(띄어쓰기 확정) → 자동 다음, 마지막 정답 → 결과 화면', async () => {
    vi.stubGlobal('Worker', EchoWorker)
    useApp.setState((st) => ({
      settings: {
        ...st.settings,
        mode: 'typing',
        durationMode: 'untimed',
        countdown: false,
        fullscreen: false,
        liveStats: false,
      },
    }))
    const ws = await repo.createWordset(`무제한${Date.now()}`, ['가나', '다라'])
    await act(async () => {
      await useApp.getState().reloadWordsets()
      useApp.getState().select(ws.id)
      root.render(<App />)
    })
    act(() => {
      useApp.getState().startPractice()
    })
    await act(async () => {})
    const ta = container.querySelector('textarea')!

    // 오답 상태에선 넘어가지 않는다
    type(ta, '가')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 60))
    })
    expect(container.textContent).toContain('1 / 2')

    // 정답 + 공백 확정 → 다음 항목
    type(ta, '가나 ')
    await waitFor(() => container.textContent?.includes('2 / 2') ?? false, '항목 2 진입')

    // 마지막 정답 → 채점 → 결과 화면
    type(ta, '가나 다라 ')
    await waitFor(() => useApp.getState().screen.name === 'result', '결과 화면')
    const screen = useApp.getState().screen
    if (screen.name !== 'result') throw new Error('unreachable')
    expect(screen.record.result!.accuracy).toBe(1)
    // 실경과 기반 KPM — 명목 타임라인(하루/항목)이 아니라 초 단위여야 함
    expect(screen.record.result!.elapsedMs).toBeLessThan(60_000)
  })
})

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
