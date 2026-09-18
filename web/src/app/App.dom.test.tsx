// @vitest-environment jsdom
/**
 * 앱 통합 스모크 — 홈 → 단어장 생성 → 연습 진입 → 일시정지 → 종료 흐름.
 * fake-indexeddb 위에서 전체 화면 전환이 실제로 도는지 검증한다.
 */
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from './App.tsx'
import { useApp } from './store.ts'
import * as repo from '../lib/repo.ts'

let container: HTMLDivElement
let root: Root

beforeEach(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    await useApp.getState().init()
  })
  // 싱글턴 스토어 — 이전 테스트 실패 시 화면 오염 방지
  useApp.setState({ screen: { name: 'home' }, plan: null, resumeFrom: null })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const text = () => container.textContent ?? ''

function clickByText(label: string) {
  const btn = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes(label))
  if (!btn) throw new Error(`버튼 없음: ${label} — 현재 화면: ${text().slice(0, 200)}`)
  act(() => {
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  })
}

/** 비동기 저장(IDB 타이머 스케줄링) 완료를 조건 폴링으로 대기 */
async function until(cond: () => boolean, ms = 3000) {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`until 타임아웃 — 현재 화면: ${text().slice(0, 200)}`)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10))
    })
  }
}

describe('앱 통합 스모크', () => {
  it('홈 렌더 — 빈 상태 안내', async () => {
    await act(async () => {
      root.render(<App />)
    })
    expect(text()).toContain('깜빡이')
    expect(text()).toContain('자유연습')
  })

  it('단어장 생성 → 홈 목록 반영 → 연습 시작 → Esc 일시정지 → 종료 → 홈 복귀', async () => {
    const ws = await repo.createWordset('스모크', ['하나', '둘', '셋'])
    await act(async () => {
      await useApp.getState().reloadWordsets()
      useApp.getState().select(ws.id)
      root.render(<App />)
    })
    expect(text()).toContain('스모크')
    expect(text()).toContain('연습 시작')

    clickByText('연습 시작')
    await act(async () => {}) // 엔진 마운트 flush
    expect(useApp.getState().screen.name).toBe('practice')
    expect(text()).toContain('일시정지') // 보기 모드 힌트

    // Esc → 일시정지 메뉴
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(text()).toContain('일시정지')
    expect(text()).toContain('계속하기')

    clickByText('종료')
    await act(async () => {})
    expect(useApp.getState().screen.name).toBe('home')
  })

  it('자유연습 진입/복귀', async () => {
    await act(async () => {
      root.render(<App />)
    })
    clickByText('자유연습')
    await act(async () => {})
    expect(useApp.getState().screen.name).toBe('free')
    expect(container.querySelector('textarea')).toBeTruthy()
    clickByText('← 홈')
    await act(async () => {})
    expect(useApp.getState().screen.name).toBe('home')
  })

  it('자유연습: 포커스가 풀리면 배너 표시, 클릭하면 복귀 (주입 유실 방어)', async () => {
    await act(async () => {
      root.render(<App />)
    })
    clickByText('자유연습')
    await act(async () => {})
    const ta = container.querySelector('textarea')!
    act(() => {
      ta.focus()
      ta.blur()
    })
    expect(text()).toContain('입력 포커스가 풀렸습니다')
    clickByText('여기를 눌러 계속')
    expect(document.activeElement).toBe(ta)
    expect(text()).not.toContain('입력 포커스가 풀렸습니다')
    clickByText('← 홈')
    await act(async () => {})
  })

  it('편집 화면 — 붙여넣기 분할 추가 → 저장 → 홈 목록 갱신', async () => {
    await act(async () => {
      root.render(<App />)
    })
    clickByText('새 단어장')
    await act(async () => {})
    expect(useApp.getState().screen.name).toBe('edit')

    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="단어장 이름"]')!
    const bulk = container.querySelector('textarea')!
    act(() => {
      // 제어 컴포넌트라 네이티브 setter 로 값 주입
      const setV = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
      setV.call(nameInput, '편집테스트')
      nameInput.dispatchEvent(new Event('input', { bubbles: true }))
      const setT = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
      setT.call(bulk, '가나\n다라\n마바')
      bulk.dispatchEvent(new Event('input', { bubbles: true }))
    })
    clickByText('목록에 추가')
    expect(text()).toContain('3개 항목')

    clickByText('저장')
    await until(() => useApp.getState().screen.name === 'home')
    expect(text()).toContain('편집테스트')
  })

  it('편집 화면 — 텍스트 편집 모드: 엔터로 나눈 통편집 → 저장', async () => {
    await act(async () => {
      root.render(<App />)
    })
    clickByText('새 단어장')
    await act(async () => {})

    const setV = (el: HTMLInputElement | HTMLTextAreaElement, v: string, proto: typeof HTMLInputElement.prototype | typeof HTMLTextAreaElement.prototype) => {
      Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, v)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    }
    const nameInput = container.querySelector<HTMLInputElement>('input[placeholder="단어장 이름"]')!
    act(() => setV(nameInput, '텍스트편집', HTMLInputElement.prototype))

    // 텍스트 편집으로 전환 → 한 textarea 에 엔터로 나눠 입력
    clickByText('텍스트 편집')
    const ta = [...container.querySelectorAll('textarea')].pop()!
    act(() => setV(ta, '문제 하나\n문제 둘\n문제 셋\n', HTMLTextAreaElement.prototype))
    expect(text()).toContain('3개 항목') // 빈 줄 제외 카운트

    clickByText('저장')
    await until(() => useApp.getState().screen.name === 'home')
    const ws = useApp.getState().wordsets.find((w) => w.name === '텍스트편집')!
    expect(ws.items.map((i) => i.t)).toEqual(['문제 하나', '문제 둘', '문제 셋'])
  })

  it('편집 화면 — 목록↔텍스트 왕복에서 항목 보존', async () => {
    const ws = await repo.createWordset('왕복', [{ t: '가' }, { t: '나', h: 'ㄴ' }])
    await act(async () => {
      await useApp.getState().reloadWordsets()
      root.render(<App />)
    })
    useApp.getState().go({ name: 'edit', wordsetId: ws.id })
    await act(async () => {})
    clickByText('텍스트 편집')
    const ta = [...container.querySelectorAll('textarea')].pop()!
    // 힌트는 "본문<Tab>힌트" 로 직렬화되어 왕복 보존
    expect(ta.value).toBe('가\n나\tㄴ')
    clickByText('목록 편집')
    clickByText('저장')
    await until(() => useApp.getState().screen.name === 'home')
    const after = useApp.getState().wordsets.find((w) => w.id === ws.id)!
    expect(after.items).toEqual([{ t: '가' }, { t: '나', h: 'ㄴ' }])
  })
})
