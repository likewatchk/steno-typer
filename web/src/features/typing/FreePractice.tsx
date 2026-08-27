/**
 * 자유연습 — 메모장형 백지. 속기 프로그램이 메모장을 팅기게 하는 문제의 대체재.
 * StenoInput 의 방어 규칙 그대로, 깜빡이 없이 입력만.
 * 카운터 갱신도 DOM 직접 기록 (타이핑 중 React 리렌더 0).
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import { countKeystrokes } from '../../lib/hangul.ts'
import StenoInput, { type StenoInputHandle } from './StenoInput.tsx'
import { diagCount, diagExport } from './diagnostics.ts'
import s from './FreePractice.module.css'

const SAVE_KEY = 'steno-free-text'

export default function FreePractice() {
  const { go } = useApp.getState()
  const inputFontPx = useApp((st) => st.settings.inputFontPx)
  const inputRef = useRef<StenoInputHandle>(null)
  const charsRef = useRef<HTMLSpanElement>(null)
  const strokesRef = useRef<HTMLSpanElement>(null)
  // 포커스 이탈 = 주입 유실의 1순위 원인 — 놓치지 않게 크게 표시
  const [focusLost, setFocusLost] = useState(false)
  const diagCountEl = useRef<HTMLSpanElement>(null)

  const pendingRef = useRef(false)
  const saveTimerRef = useRef(0)

  useEffect(() => {
    // 복원 — 비제어 textarea 라 DOM 에 직접
    const el = inputRef.current?.el()
    if (el) {
      try {
        el.value = localStorage.getItem(SAVE_KEY) ?? ''
      } catch {
        /* 복원 실패는 치명적이지 않음 */
      }
      updateCounters()
      el.focus()
    }
    return () => {
      window.clearTimeout(saveTimerRef.current)
      persist()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persist() {
    const v = inputRef.current?.value()
    if (v === undefined) return
    try {
      localStorage.setItem(SAVE_KEY, v)
    } catch {
      /* 용량 초과 등 — 다운로드 경로가 남아 있다 */
    }
  }

  function updateCounters() {
    const v = inputRef.current?.value() ?? ''
    if (charsRef.current) charsRef.current.textContent = `${[...v].length.toLocaleString()}자`
    if (strokesRef.current) strokesRef.current.textContent = `${countKeystrokes(v).toLocaleString()}타`
    if (diagCountEl.current) diagCountEl.current.textContent = diagCount().toLocaleString()
  }

  function onDirty() {
    // rAF 로 합쳐서 갱신 — 버스트 주입에도 이벤트당 O(1)
    if (!pendingRef.current) {
      pendingRef.current = true
      requestAnimationFrame(() => {
        pendingRef.current = false
        updateCounters()
      })
    }
    window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(persist, 800)
  }

  function downloadTxt() {
    const v = inputRef.current?.value() ?? ''
    const blob = new Blob([v], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `자유연습-${new Date().toISOString().slice(0, 10)}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  function clearAll() {
    if (!confirm('내용을 모두 지울까요?')) return
    inputRef.current?.clear()
    persist()
    updateCounters()
    inputRef.current?.focus()
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button
          className="ghost"
          onClick={() => {
            persist()
            go({ name: 'home' })
          }}
        >
          ← 홈
        </button>
        <span className={s.title}>자유연습</span>
        <span className={s.counters}>
          <span ref={charsRef} className="num" />
          <span ref={strokesRef} className="num" />
        </span>
      </header>

      {focusLost && (
        <button
          className={s.focusBanner}
          onClick={() => {
            inputRef.current?.focus()
          }}
        >
          ⚠️ 입력 포커스가 풀렸습니다 — 지금 치는 글자는 들어가지 않아요. 여기를 눌러 계속
        </button>
      )}

      <StenoInput
        ref={inputRef}
        className={s.input}
        style={{ fontSize: inputFontPx }}
        placeholder="자유롭게 연습하세요. 내용은 이 브라우저에 자동 저장됩니다."
        onDirty={onDirty}
        onBlurred={() => setFocusLost(true)}
        onFocused={() => setFocusLost(false)}
      />

      <footer className={s.footer}>
        {/* 버튼이 입력 포커스를 뺏지 않게 (방어 규칙 9) — 클릭 후에도 계속 칠 수 있다 */}
        <button onMouseDown={(e) => e.preventDefault()} onClick={downloadTxt}>
          .txt 저장
        </button>
        <button onClick={clearAll}>지우기</button>
        <label className={s.fontCtl}>
          글자
          <input
            type="range"
            min={16}
            max={48}
            step={1}
            value={inputFontPx}
            onChange={(e) => useApp.getState().patchSettings({ inputFontPx: +e.target.value })}
          />
          <span className="num">{inputFontPx}px</span>
        </label>
        <button onMouseDown={(e) => e.preventDefault()} onClick={() => diagExport()}>
          진단 내보내기 (<span ref={diagCountEl} className="num">0</span>)
        </button>
        <span className={s.hint}>안 쳐지는 순간이 있었다면 바로 [진단 내보내기]로 저장해 주세요</span>
      </footer>
    </div>
  )
}
