// @vitest-environment jsdom
/**
 * 소리자바 따라치기 통합 — 입력 → 실시간 색칠·채점 → 완주/중단 결과.
 */
import 'fake-indexeddb/auto'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import App from '../../app/App.tsx'
import { useApp } from '../../app/store.ts'
import { BASIC_STAGES, buildSessionItems } from './basicCourses.ts'
import type { SjConfig } from './sjPrefs.ts'
import s from './SjPractice.module.css'

let container: HTMLDivElement
let root: Root

const CFG: SjConfig = {
  stage: 1,
  part: 'sentences',
  cumulative: false,
  shuffle: false,
  tasu: 30,
  minutes: 1,
  reveal: 'all',
}

beforeEach(async () => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    await useApp.getState().init()
  })
  useApp.setState({ screen: { name: 'home' }, plan: null, resumeFrom: null, track: 'sorijava' })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const text = () => container.textContent ?? ''
const frames = async (n = 3) => {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)))
    })
  }
}

async function typeAll(value: string) {
  const ta = container.querySelector('textarea')!
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, value)
    ta.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await frames()
}

async function open(cfg: SjConfig = CFG) {
  await act(async () => {
    useApp.getState().go({ name: 'sjPractice', config: cfg })
    root.render(<App />)
  })
}

const count = (cls: string) => container.querySelectorAll(`[data-testid="sj-target"] .${cls}`).length

describe('소리자바 따라치기', () => {
  it('위에 이어지는 본문, 아래 입력창 — 처음엔 전부 흐릿', async () => {
    await open()
    const expected = buildSessionItems({ ...CFG, targetSyllables: 30 }).map((i) => i.t).join(' ')
    expect(container.querySelector('[data-testid="sj-target"]')!.textContent).toBe(expected)
    expect(container.querySelector('textarea')).toBeTruthy()
    expect(count(s.ok)).toBe(0)
    expect(text()).toContain('첫 글자를 치면 시작')
  })

  it('맞게 친 글자는 색칠, 틀린 글자는 오자 표시 (띄어쓰기 무시)', async () => {
    await open()
    // 원문: 그자가 다 주고 가다. ...
    await typeAll('그자가다주')
    expect(count(s.ok)).toBeGreaterThanOrEqual(5)
    expect(count(s.sub)).toBe(0)
    await typeAll('그자가다주거')
    expect(count(s.sub)).toBe(1)
    expect(text()).toMatch(/정확도\s*\d/)
  })

  it('탈자 — 낱말을 건너뛰면 빠뜨린 글자에 탈자 표시', async () => {
    await open()
    await typeAll('그자가 주고 가다')
    expect(count(s.miss)).toBe(1) // '다'
  })

  it('끝까지 치면 완주 결과 (시험 기준 정확도)', async () => {
    await open()
    const full = buildSessionItems({ ...CFG, targetSyllables: 30 }).map((i) => i.t).join(' ')
    await typeAll(full)
    expect(text()).toContain('완주')
    expect(text()).toContain('100.0%')
  })

  it('중간에 그만하면 친 곳까지 정확도 + 페이스 기준(못 친 글자=탈자) 둘 다 보여주고, 마지막 입력도 반영', async () => {
    await open({ ...CFG, reveal: 'flow' })
    await typeAll('그자가다주고가다')
    // rAF 전에 바로 그만하기 — 아직 채점 안 된 마지막 입력('거기')까지 결과에 들어가야 한다
    const ta = container.querySelector('textarea')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '그자가다주고가다거기')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === '그만하기')!
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(text()).toContain('연습 결과')
    expect(text()).toContain('친 곳까지10자')
    expect(text()).toContain('페이스 기준')
    // 수동 종료는 버튼이 바로 활성
    const back = [...container.querySelectorAll('button')].find((b) => b.textContent === '가이드로')! as HTMLButtonElement
    expect(back.disabled).toBe(false)
    act(() => back.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(useApp.getState().screen.name).toBe('home')
  })

  it('마지막 글자를 틀리면 자동 완주되지 않고 고칠 수 있다 · 자동 완주 직후엔 버튼이 잠깐 잠긴다', async () => {
    await open()
    const full = buildSessionItems({ ...CFG, targetSyllables: 30 }).map((i) => i.t).join(' ')
    // 마지막 '음절'(부호 제외)을 틀리게
    const chars = [...full]
    let k = chars.length - 1
    while (k > 0 && !/[가-힣]/.test(chars[k])) k--
    chars[k] = '꽝'
    await typeAll(chars.join(''))
    expect(text()).not.toContain('완주')
    expect(count(s.sub)).toBe(1)
    await typeAll(full)
    expect(text()).toContain('완주')
    const again = [...container.querySelectorAll('button')].find((b) => b.textContent?.startsWith('다시 하기'))! as HTMLButtonElement
    expect(again.disabled).toBe(true)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 800))
    })
    expect(again.disabled).toBe(false)
  })

  it('같은 프레임에 마지막 글자가 두 번 들어와도(중복 타건) 완주로 치지 않는다', async () => {
    await open()
    const full = buildSessionItems({ ...CFG, targetSyllables: 30 }).map((i) => i.t).join(' ')
    const chars = [...full]
    let k = chars.length - 1
    while (k > 0 && !/[가-힣]/.test(chars[k])) k--
    chars.splice(k + 1, 0, chars[k])
    await typeAll(chars.join(''))
    expect(text()).not.toContain('완주')
    expect(text()).toContain('첨가 1')
  })

  it('그만하기 순간 조합 중이던 홑자모는 첨가로 세지 않는다', async () => {
    await open()
    await typeAll('그자가다')
    const ta = container.querySelector('textarea')!
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, '그자가다ㅈ')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === '그만하기')!
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(text()).toContain('연습 결과')
    expect(text()).toContain('0 · 0 · 0')
  })

  it("'처음부터 전부' 모드의 조기 종료 결과엔 페이스 기준 줄이 없다", async () => {
    await open({ ...CFG, reveal: 'all' })
    await typeAll('그자가')
    const btn = [...container.querySelectorAll('button')].find((b) => b.textContent === '그만하기')!
    act(() => btn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    expect(text()).toContain('연습 결과')
    expect(text()).not.toContain('페이스 기준')
  })

  it('IME 조합 중 Esc 는 종료가 아니다', async () => {
    await open()
    await typeAll('그자')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true }))
    })
    expect(text()).not.toContain('연습 결과')
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(text()).toContain('연습 결과')
  })

  it('약어 범위는 부호도 채점한다 (마침표 빠뜨리면 탈자)', async () => {
    await open({ ...CFG, stage: 1, part: 'abbr' })
    // 1단계 약어 첫 항목들: 가 자 다 사 고 저 더 / 가. 자. ...
    await typeAll('가자다사고저더가자.')
    expect(count(s.miss)).toBe(1)
  })

  it('흐르기 — 시작 전엔 앞 낱말만 보이고 나머지는 숨김', async () => {
    await open({ ...CFG, reveal: 'flow' })
    const hidden = count(s.hidden)
    expect(hidden).toBeGreaterThan(0)
    await typeAll('그자가다주고')
    expect(count(s.hidden)).toBeLessThan(hidden)
  })

  it('약어 범위는 현재 항목의 약어 타법 힌트를 보여준다', async () => {
    await open({ ...CFG, stage: 2, part: 'abbr' })
    await typeAll('시')
    expect(text()).toContain(BASIC_STAGES[1].abbr[0].h!)
  })
})

describe('소리자바 가이드', () => {
  it('단계 선택 → 시작하면 따라치기 화면', async () => {
    await act(async () => {
      root.render(<App />)
    })
    expect(text()).toContain('기본자리연습 1~10단계')
    const step3 = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('아랫줄 초성'))!
    act(() => step3.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const startBtn = [...container.querySelectorAll('button')].find((b) => b.textContent === '3단계 연습 시작')!
    act(() => startBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })))
    const sc = useApp.getState().screen
    expect(sc.name).toBe('sjPractice')
    if (sc.name === 'sjPractice') {
      expect(sc.config.stage).toBe(3)
      expect(sc.config.shuffle).toBe(true) // 섞기 기본
    }
  })
})
