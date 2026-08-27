/**
 * 속기계 대응 방어 입력 컴포넌트 — 앱의 모든 연습용 입력은 이 컴포넌트만 쓴다.
 *
 * 방어 규칙 (플랜 §5):
 * 1. 비제어 textarea + ref — 세션 중 React value 바인딩 금지 (IME 유실·캐럿 리셋 방지)
 * 2. input 이벤트로만 읽기 — 주입형 입력은 keydown 이 아예 안 올 수 있다
 * 3. 텍스트 생성 키 preventDefault 금지 — 여기서는 어떤 키도 막지 않는다
 * 4. contenteditable 미사용
 * 5. composition 추적 — 조합 중 채점·클리어 금지
 * 6. 핸들러는 dirty 통지만 O(1) — 값 소비는 부모가 rAF 등에서
 * 7. 1 이벤트 = 1 글자 가정 없음 (붙여넣기·일괄 주입 동일 경로)
 * 8. 자동수정·맞춤법·확장 간섭 차단 속성
 * 9. 프로그램적 refocus 금지 — blur 는 부모에 알리기만
 */
import { forwardRef, useImperativeHandle, useRef } from 'react'
import { diagLog } from './diagnostics.ts'

export interface StenoInputHandle {
  value(): string
  /** discrete 모드용: 현재 값을 반환하고 비운다. 조합 중이면 조합 확정 후 비운다. */
  takeAndClear(): string
  clear(): void
  focus(): void
  isComposing(): boolean
  el(): HTMLTextAreaElement | null
}

interface Props {
  className?: string
  style?: React.CSSProperties
  placeholder?: string
  autoFocus?: boolean
  /** input 이벤트마다 호출 — O(1) 작업만 할 것 */
  onDirty?: () => void
  onBlurred?: () => void
  onFocused?: () => void
}

const StenoInput = forwardRef<StenoInputHandle, Props>(function StenoInput(props, ref) {
  const elRef = useRef<HTMLTextAreaElement>(null)
  const composingRef = useRef(false)
  const pendingClearRef = useRef(false)

  useImperativeHandle(ref, () => ({
    value: () => elRef.current?.value ?? '',
    takeAndClear() {
      const el = elRef.current
      if (!el) return ''
      const v = el.value
      if (composingRef.current) {
        // 조합 중 클리어는 IME 상태를 깨뜨린다 — 확정 시점으로 미룬다.
        // (경계 이후 조합이 이어져 확정된 여분은 버려진다 — 항목이 이미 넘어간 뒤의 꼬리)
        pendingClearRef.current = true
      } else {
        el.value = ''
      }
      return v
    },
    clear() {
      if (elRef.current && !composingRef.current) elRef.current.value = ''
      else pendingClearRef.current = true
    },
    focus: () => elRef.current?.focus(),
    isComposing: () => composingRef.current,
    el: () => elRef.current,
  }))

  return (
    <textarea
      ref={elRef}
      className={props.className}
      style={props.style}
      placeholder={props.placeholder}
      autoFocus={props.autoFocus}
      spellCheck={false}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      data-gramm="false"
      data-gramm_editor="false"
      data-enable-grammarly="false"
      // Windows Edge 의 '텍스트 예측' — textarea 에 제안을 끼워 넣어 주입 텍스트와 충돌
      {...{ writingsuggestions: 'false' }}
      onKeyDown={(e) => {
        // 어떤 키도 막지 않는다 — 기록만.
        diagLog({ type: 'keydown', key: e.key, composing: e.nativeEvent.isComposing })
      }}
      onBeforeInput={(e) => {
        const ne = e.nativeEvent as InputEvent
        diagLog({
          type: 'beforeinput',
          inputType: ne.inputType,
          dataLen: ne.data?.length ?? 0,
          composing: ne.isComposing,
        })
      }}
      onInput={(e) => {
        const ne = e.nativeEvent as InputEvent
        diagLog({
          type: 'input',
          inputType: ne.inputType,
          dataLen: ne.data?.length ?? 0,
          composing: ne.isComposing,
          valueLen: e.currentTarget.value.length,
        })
        props.onDirty?.()
      }}
      onCompositionStart={() => {
        composingRef.current = true
        diagLog({ type: 'compositionstart' })
      }}
      onCompositionEnd={(e) => {
        composingRef.current = false
        diagLog({ type: 'compositionend', dataLen: e.data.length, valueLen: e.currentTarget.value.length })
        if (pendingClearRef.current) {
          pendingClearRef.current = false
          e.currentTarget.value = ''
          props.onDirty?.()
        }
      }}
      onBlur={() => {
        diagLog({ type: 'blur' })
        props.onBlurred?.()
      }}
      onFocus={() => {
        diagLog({ type: 'focus' })
        props.onFocused?.()
      }}
    />
  )
})

export default StenoInput
