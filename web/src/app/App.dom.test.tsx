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
    expect(text()).toContain('Space 일시정지') // 보기 모드 힌트

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
})
