/**
 * 자유연습 — 메모장형 백지. 속기 프로그램이 메모장을 팅기게 하는 문제의 대체재.
 * StenoInput 의 방어 규칙 그대로, 깜빡이 없이 입력만.
 * 카운터 갱신도 DOM 직접 기록 (타이핑 중 React 리렌더 0).
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import { countKeystrokes } from '../../lib/hangul.ts'
import StenoInput, { type StenoInputHandle } from './StenoInput.tsx'
import { diagCount, diagExport, setDiagEnabled } from './diagnostics.ts'
import s from './FreePractice.module.css'

const SAVE_KEY = 'steno-free-text'

export default function FreePractice() {
  const { go } = useApp.getState()
  const diagnostics = useApp((st) => st.settings.diagnostics)
  const inputFontPx = useApp((st) => st.settings.inputFontPx)
  const inputRef = useRef<StenoInputHandle>(null)
  const charsRef = useRef<HTMLSpanElement>(null)
  const strokesRef = useRef<HTMLSpanElement>(null)
  const [, forceRender] = useState(0)

  const pendingRef = useRef(false)
  const saveTimerRef = useRef(0)

  useEffect(() => {
    setDiagEnabled(diagnostics)
  }, [diagnostics])

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

      <StenoInput
        ref={inputRef}
        className={s.input}
        style={{ fontSize: inputFontPx }}
        placeholder="자유롭게 연습하세요. 내용은 이 브라우저에 자동 저장됩니다."
        onDirty={onDirty}
      />

      <footer className={s.footer}>
        <button onClick={downloadTxt}>.txt 저장</button>
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
        {diagnostics && (
          <button
            onClick={() => {
              diagExport()
              forceRender((n) => n + 1)
            }}
          >
            진단 로그 내보내기 ({diagCount().toLocaleString()})
          </button>
        )}
        <span className={s.hint}>새로고침해도 내용이 남습니다 · 저장은 .txt 다운로드</span>
      </footer>
    </div>
  )
}
