// @vitest-environment jsdom
/**
 * StenoInput 방어 규칙의 동작 검증 (jsdom).
 * 속기계 주입 패턴(키 없는 input, 일괄 삽입, IME 조합)을 이벤트로 재현한다.
 */
import { act } from 'react'
import { createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import StenoInput, { type StenoInputHandle } from './StenoInput.tsx'

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  ;(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function mount(props: Parameters<typeof StenoInput>[0] = {}) {
  const ref = createRef<StenoInputHandle>()
  act(() => {
    root.render(<StenoInput ref={ref} {...props} />)
  })
  const el = container.querySelector('textarea')!
  return { ref, el }
}

function injectText(el: HTMLTextAreaElement, text: string, inputType = 'insertText') {
  el.value += text
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType }))
}

describe('StenoInput 방어 속성', () => {
  it('자동수정·맞춤법·확장 간섭 차단 속성이 전부 붙어 있다', () => {
    const { el } = mount()
    expect(el.getAttribute('spellcheck')).toBe('false')
    expect(el.getAttribute('autocomplete')).toBe('off')
    expect(el.getAttribute('autocorrect')).toBe('off')
    expect(el.getAttribute('autocapitalize')).toBe('off')
    expect(el.getAttribute('data-gramm')).toBe('false')
    // Windows Edge 텍스트 예측 차단
    expect(el.getAttribute('writingsuggestions')).toBe('false')
  })

  it('textarea 를 쓴다 (contenteditable 금지 규칙)', () => {
    const { el } = mount()
    expect(el.tagName).toBe('TEXTAREA')
    expect(el.getAttribute('contenteditable')).toBeNull()
  })
})

describe('입력 경로 (키 이벤트 없이 input 만 — 주입형)', () => {
  it('keydown 없이 input 이벤트만으로 값이 읽힌다', () => {
    const onDirty = vi.fn()
    const { ref, el } = mount({ onDirty })
    act(() => injectText(el, '속기주입'))
    expect(ref.current!.value()).toBe('속기주입')
    expect(onDirty).toHaveBeenCalledTimes(1)
  })

  it('일괄 붙여넣기(insertFromPaste·여러 글자 1이벤트)도 동일 경로', () => {
    const onDirty = vi.fn()
    const { ref, el } = mount({ onDirty })
    act(() => injectText(el, '가나다라마바사아자차'.repeat(30), 'insertFromPaste'))
    expect(ref.current!.value().length).toBe(300)
    expect(onDirty).toHaveBeenCalledTimes(1)
  })

  it('키를 막지 않는다 — keydown 에 preventDefault 하지 않음', () => {
    const { el } = mount()
    let prevented = false
    act(() => {
      const ev = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true })
      el.dispatchEvent(ev)
      prevented = ev.defaultPrevented
    })
    expect(prevented).toBe(false)
  })

  it('50ms 버스트 100회(2,000자) 유실 0', () => {
    const { ref, el } = mount()
    act(() => {
      for (let i = 0; i < 100; i++) injectText(el, '속기연습깜빡이버스트혼합주입테스트더미글자'.slice(0, 20))
    })
    expect(ref.current!.value().length).toBe(2000)
  })
})

describe('IME 조합 방어', () => {
  it('조합 중 isComposing 추적', () => {
    const { ref, el } = mount()
    act(() => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    })
    expect(ref.current!.isComposing()).toBe(true)
    act(() => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '가' }))
    })
    expect(ref.current!.isComposing()).toBe(false)
  })

  it('조합 중 takeAndClear 는 값을 반환하되 클리어를 조합 확정까지 미룬다', () => {
    const { ref, el } = mount()
    act(() => injectText(el, '사과'))
    act(() => {
      el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
      el.value += 'ㅂ'
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'ㅂ', inputType: 'insertCompositionText' }))
    })
    let taken = ''
    act(() => {
      taken = ref.current!.takeAndClear()
    })
    expect(taken).toBe('사과ㅂ') // 조합 중 값 포함 스냅샷
    expect(ref.current!.value()).toBe('사과ㅂ') // 아직 클리어 안 됨 (IME 보호)
    act(() => {
      el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: '바' }))
    })
    expect(ref.current!.value()).toBe('') // 확정 직후 클리어 실행
  })

  it('조합 중이 아니면 takeAndClear 는 즉시 비운다', () => {
    const { ref, el } = mount()
    act(() => injectText(el, '사과'))
    let taken = ''
    act(() => {
      taken = ref.current!.takeAndClear()
    })
    expect(taken).toBe('사과')
    expect(ref.current!.value()).toBe('')
  })

  it('blur 는 통지만 하고 프로그램적 refocus 를 하지 않는다', () => {
    const onBlurred = vi.fn()
    const { el } = mount({ onBlurred })
    act(() => {
      el.focus()
      el.blur()
    })
    expect(onBlurred).toHaveBeenCalled()
    expect(document.activeElement).not.toBe(el)
  })
})
