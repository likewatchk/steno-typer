/**
 * dev 전용 주입 시뮬레이터 — 실물 속기계 없이 입력 경로를 회귀 테스트한다.
 * 속기 프로그램의 3가지 주입 패턴을 재현:
 *  1) 고속 버스트 (keydown 없이 input 이벤트만 연사)
 *  2) 일괄 붙여넣기 (insertFromPaste 1회)
 *  3) IME 조합 시퀀스 (composition* + insertCompositionText)
 * 각 시뮬레이션 후 유실 여부를 콘솔에 보고한다.
 */
import type { StenoInputHandle } from './StenoInput.tsx'

function fire(el: HTMLTextAreaElement, text: string, inputType: string) {
  el.value += text
  el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType }))
}

function report(name: string, el: HTMLTextAreaElement, before: number, injected: number) {
  const got = el.value.length - before
  const ok = got === injected
  // eslint-disable-next-line no-console
  console[ok ? 'log' : 'error'](`[sim:${name}] 주입 ${injected}자 → 반영 ${got}자 ${ok ? 'OK' : '유실!'}`)
  if (!ok) alert(`[시뮬레이터] ${name}: ${injected - got}자 유실`)
}

export function simulateBurst(h: StenoInputHandle | null): void {
  const el = h?.el()
  if (!el) return
  const before = el.value.length
  const chunk = '속기연습깜빡이버스트'
  let sent = 0
  const timer = setInterval(() => {
    fire(el, chunk, 'insertText')
    sent += chunk.length
    if (sent >= chunk.length * 15) {
      clearInterval(timer)
      report('burst', el, before, sent)
    }
  }, 50)
}

export function simulatePaste(h: StenoInputHandle | null): void {
  const el = h?.el()
  if (!el) return
  const before = el.value.length
  const text = '한 번에 들어오는 붙여넣기 주입 경로 테스트 문자열입니다. '.repeat(5)
  fire(el, text, 'insertFromPaste')
  report('paste', el, before, text.length)
}

export async function simulateIme(h: StenoInputHandle | null): Promise<void> {
  const el = h?.el()
  if (!el) return
  const before = el.value.length
  const steps: Array<[string, string]> = [
    ['ㄱ', 'ㄱ'],
    ['가', '가'],
    ['간', '간'],
    ['간ㄴ', '갃'], // 오타 조합 흉내가 아니라 중간상태 교체 검증용
    ['간나', '간나'],
  ]
  el.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
  let cur = ''
  for (const [, composed] of steps) {
    // 조합 중엔 마지막 조합 문자열이 통째로 교체된다
    el.value = el.value.slice(0, before) + composed
    cur = composed
    el.dispatchEvent(new CompositionEvent('compositionupdate', { bubbles: true, data: composed }))
    el.dispatchEvent(new InputEvent('input', { bubbles: true, data: composed, inputType: 'insertCompositionText' }))
    await new Promise((r) => setTimeout(r, 60))
  }
  el.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: cur }))
  report('ime', el, before, cur.length)
}
