/**
 * 전체화면 연습 화면.
 *
 * 성능 원칙: 세션 중 React 리렌더 0.
 * 엔진 훅이 DOM ref 에 직접 쓴다 (textContent / opacity / transform).
 * React 상태는 오버레이 전환(일시정지·완료 등 드문 이벤트)에만 쓴다.
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import { computeFitSizes, type FitResult } from '../../lib/fit.ts'
import { newId } from '../../lib/db.ts'
import * as repo from '../../lib/repo.ts'
import { playTick } from '../../lib/sound.ts'
import { FlashTimeline, type TimelineConfig } from '../../lib/scheduler.ts'
import type { ResumeState, SessionRecord } from '../../lib/types.ts'
import StenoInput, { type StenoInputHandle } from '../typing/StenoInput.tsx'
import { setDiagEnabled } from '../typing/diagnostics.ts'
import { simulateBurst, simulateIme, simulatePaste } from '../typing/simulator.ts'
import { scoreSession, type ScoreRequest } from '../scoring/score.ts'
import type { SessionResult } from '../../lib/types.ts'
import type { WorkerIn, WorkerOut } from '../scoring/scoring.worker.ts'
import s from './Practice.module.css'

type Overlay = null | 'menu' | 'blur' | 'done' | 'scoring'

/**
 * 채점 워커 무응답 감시 시간. 워커가 죽거나 로드에 실패해도(예: 배포로 구버전
 * 자산이 사라진 열린 탭) 이 시간 안에 메인 스레드 채점으로 폴백한다 —
 * "채점 중…" 무한 로딩은 구조적으로 불가능. 테스트에서 짧게 조정 가능.
 */
export const SCORING_WATCHDOG = { ms: 8000 }

export default function Practice() {
  const plan = useApp((st) => st.plan)
  const [overlay, setOverlayState] = useState<Overlay>(null)
  const [pos, setPos] = useState(0) // 일시정지 메뉴의 현재 위치 표시 (정지 중에만 갱신)
  const overlayRef = useRef<Overlay>(null)
  const setOverlay = (o: Overlay) => {
    overlayRef.current = o
    setOverlayState(o)
  }

  const stageRef = useRef<HTMLDivElement>(null)
  const textRef = useRef<HTMLDivElement>(null)
  const barRef = useRef<HTMLDivElement>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const handleRef = useRef<HTMLDivElement>(null)
  const counterRef = useRef<HTMLDivElement>(null)
  const cdRef = useRef<HTMLDivElement>(null)
  const previewRef = useRef<HTMLDivElement>(null)
  const liveRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<StenoInputHandle>(null)

  const engineRef = useRef<FlashTimeline | null>(null)
  const doneStatsRef = useRef({ count: 0, ms: 0 })
  // 이펙트 내부 함수를 JSX 핸들러에 노출하기 위한 다리
  const seekRef = useRef<((index: number) => void) | null>(null)
  const pauseRef = useRef<(() => void) | null>(null)
  const saveResumeRef = useRef<(() => void) | null>(null)

  // 마운트 시점 스냅샷 — 이어하기면 저장해 둔 설정 그대로 재개
  const snapRef = useRef<{ settings: ReturnType<typeof useApp.getState>['settings']; resume: ResumeState | null } | null>(null)
  snapRef.current ??= (() => {
    const st = useApp.getState()
    return { settings: st.resumeFrom?.settings ?? st.settings, resume: st.resumeFrom }
  })()
  const settings = snapRef.current.settings
  const typing = settings.mode === 'typing'
  const noFade = settings.safeMode

  useEffect(() => {
    if (!plan) return
    const items = plan.items
    const texts = items.map((it) => it.text)
    setDiagEnabled(settings.diagnostics)

    // ---- 폰트 크기 사전 계산 (런 중 측정 0) ----
    const textAreaH = typing ? window.innerHeight * 0.5 : window.innerHeight
    const font = getComputedStyle(document.body).fontFamily
    let fits: FitResult[]
    try {
      fits = computeFitSizes(texts, window.innerWidth, textAreaH, font, settings.flashScale)
    } catch {
      fits = texts.map(() => ({ px: 64, wrap: true }))
    }

    // ---- 타이핑 세션 수집 버퍼 ----
    const boundaries: number[] = [] // continuous: i번째 항목 종료 시점의 입력 길이
    const answers: string[] = [] // discrete: 항목별 입력
    const startedAt = Date.now()
    const continuous = settings.scoring.inputStyle === 'continuous'
    // 실시간 표시 — 설정 토글, 안전 모드에선 강제 끔
    const liveStats = typing && settings.liveStats && !settings.safeMode
    let finished = false
    // 시킹이 일어나면 실시간 증분 채점(전진 전용 커서)을 끊고 최종은 batch 로
    let brokeLive = false

    // ---- 이어하기 복원 준비 ----
    const resumeState = snapRef.current!.resume
    const resumeIdx =
      resumeState && resumeState.wordsetId === plan.wordset.id
        ? Math.max(0, Math.min(resumeState.index, items.length - 1))
        : 0

    const cfg: TimelineConfig = {
      durationMode: settings.durationMode,
      fixedMs: settings.fixedMs,
      autoBaseMs: settings.autoBaseMs,
      autoPerCharMs: settings.autoPerCharMs,
      autoMinMs: settings.autoMinMs,
      autoMaxMs: settings.autoMaxMs,
      autoSpeed: settings.autoSpeed,
      blankMs: settings.blankMs,
      // 이어하기는 엔진 카운트다운 대신 UI 카운트다운 후 seek (아래 begin 참조)
      countdownMs: settings.countdown && resumeIdx === 0 ? 3000 : 0,
    }

    const sound = settings.sound && !settings.safeMode
    const preview = settings.previewNext && !settings.safeMode
    // 약어 힌트 — 항목에 힌트가 있고 모드가 켜져 있을 때만
    const hintsOn = settings.hintMode !== 'off' && items.some((it) => it.hint)
    let hintTimer = 0

    // ---- 채점 완료 경로 (워커 정상 / 폴백 공용) ----
    let finalized = false
    let watchdog = 0
    /** 폴백 채점용 — finishTyping 시점에 채워진다 */
    let finalReq: ScoreRequest | null = null

    function completeWith(result: SessionResult) {
      if (finalized) return
      finalized = true
      window.clearTimeout(watchdog)
      void repo.deleteResume(plan!.wordset.id) // 완주 — 이어하기 소멸
      const record: SessionRecord = {
        id: newId(),
        wordsetId: plan!.wordset.id,
        wordsetName: plan!.wordset.name,
        mode: 'typing',
        settings: {
          durationMode: settings.durationMode,
          fixedMs: settings.fixedMs,
          scoring: settings.scoring,
        },
        startedAt,
        endedAt: Date.now(),
        result,
        updatedAt: Date.now(),
      }
      useApp.getState().finishPractice(record)
    }

    /** 워커 무응답·사망 시 메인 스레드에서 직접 채점 — 무한 "채점 중" 차단 */
    function mainThreadFallback() {
      if (finalized || !finalReq) return
      try {
        completeWith(scoreSession(finalReq))
      } catch {
        // 최후의 탈출구 — 결과 없이라도 화면은 복귀시킨다
        finalized = true
        useApp.getState().finishPractice(null)
      }
    }

    // ---- 채점 워커 (타이핑 모드 전용, 마운트 시 1회 생성) ----
    let worker: Worker | null = null
    let workerDead = false
    if (typing) {
      try {
        worker = new Worker(new URL('../scoring/scoring.worker.ts', import.meta.url), { type: 'module' })
      } catch {
        worker = null
        workerDead = true
      }
      if (worker) {
        worker.onmessage = (e: MessageEvent<WorkerOut>) => {
          const msg = e.data
          if (msg.kind === 'live') {
            // 항목 전환마다 한 번, 작은 고정 요소의 textContent 갱신 — 프레임 영향 없음
            if (liveRef.current && msg.scoredCount > 0) {
              liveRef.current.textContent = `${(msg.accuracy * 100).toFixed(1)}% · ${Math.round(msg.kpm)}타/분`
            }
            return
          }
          completeWith(msg.result)
        }
        worker.onerror = () => {
          // 로드 실패(404 등)·스크립트 오류 — 실시간은 포기, 최종 채점은 폴백으로
          workerDead = true
          if (finalReq) mainThreadFallback()
        }
        if (liveStats) {
          const init: WorkerIn = continuous
            ? { kind: 'live-init', targets: texts, options: settings.scoring }
            : { kind: 'live-discrete-init', options: settings.scoring }
          worker.postMessage(init)
        }
      }
    }

    // 항목 i 표시 시점의 연습 경과(ms) — 타임라인이 고정이라 사전 계산 (일시정지 무관).
    // tl.durations 로 아래(엔진 생성 직후)에서 채운다.
    const elapsedAtShow: number[] = []

    function onItemBoundary(prevIndex: number) {
      const input = inputRef.current
      if (!typing || !input) return
      if (continuous) {
        boundaries[prevIndex] = input.value().length
        if (liveStats && worker && !brokeLive) {
          const msg: WorkerIn = {
            kind: 'live-step',
            fullText: input.value(),
            boundaries: boundaries.slice(),
            uptoItem: prevIndex,
            elapsedMs: elapsedAtShow[prevIndex + 1] ?? 1,
          }
          worker.postMessage(msg)
        }
      } else {
        answers[prevIndex] = input.takeAndClear()
        if (liveStats && worker && !brokeLive) {
          const msg: WorkerIn = {
            kind: 'live-discrete-step',
            target: texts[prevIndex],
            answer: answers[prevIndex],
            elapsedMs: elapsedAtShow[prevIndex + 1] ?? 1,
          }
          worker.postMessage(msg)
        }
      }
    }

    function finishTyping() {
      const input = inputRef.current
      if (!input || !engineRef.current) return
      setOverlay('scoring')
      const elapsedMs = engineRef.current.practiceMs

      // 폴백 채점에 쓸 요청을 먼저 확정 (워커가 죽어 있어도 채점 가능해야 한다)
      if (continuous) {
        finalReq = {
          mode: 'continuous',
          targets: texts,
          options: settings.scoring,
          elapsedMs,
          fullText: input.value(),
          boundaries: boundaries.slice(),
        }
      } else {
        answers[texts.length - 1] = input.takeAndClear()
        finalReq = { mode: 'discrete', targets: texts, options: settings.scoring, elapsedMs, answers: answers.slice() }
      }

      if (!worker || workerDead) {
        mainThreadFallback()
        return
      }
      const msg: WorkerIn =
        continuous && liveStats && !brokeLive
          ? { kind: 'live-final', fullText: finalReq.mode === 'continuous' ? finalReq.fullText : '', boundaries: boundaries.slice(), elapsedMs }
          : { kind: 'batch', req: finalReq }
      worker.postMessage(msg)
      watchdog = window.setTimeout(mainThreadFallback, SCORING_WATCHDOG.ms)
    }

    const tl = new FlashTimeline(items, cfg, {
      onCountdown(n) {
        const cd = cdRef.current
        if (cd) cd.textContent = String(n)
        if (sound) playTick()
      },
      onShow(i) {
        const cd = cdRef.current
        if (cd && cd.textContent) cd.textContent = ''
        if (i > 0) onItemBoundary(i - 1)
        const el = textRef.current
        if (el) {
          const fit = fits[i]
          el.style.fontSize = fit.px + 'px'
          el.classList.toggle(s.flashTextWrap, fit.wrap)
          el.textContent = texts[i]
          el.style.opacity = '1'
        }
        const counter = counterRef.current
        if (counter) counter.textContent = `${i + 1} / ${items.length}`
        if (preview && previewRef.current) previewRef.current.textContent = texts[i + 1] ?? ''
        if (hintsOn && hintRef.current) {
          window.clearTimeout(hintTimer)
          const hint = items[i].hint ?? ''
          if (settings.hintMode === 'show') {
            hintRef.current.textContent = hint
          } else {
            // 지연 표시 — 먼저 떠올려 보게 하고, N초 뒤에 답을 보여준다
            hintRef.current.textContent = ''
            if (hint) {
              hintTimer = window.setTimeout(() => {
                if (hintRef.current) hintRef.current.textContent = hint
              }, settings.hintDelayMs)
            }
          }
        }
        if (sound) playTick()
      },
      onBlank() {
        const el = textRef.current
        if (el) el.style.opacity = '0'
      },
      onProgress(frac) {
        const bar = barRef.current
        if (bar) bar.style.transform = `scaleX(${frac})`
      },
      onDone() {
        finished = true
        const el = textRef.current
        if (el) el.style.opacity = '0'
        if (typing) finishTyping()
        else {
          void repo.deleteResume(plan!.wordset.id) // 완주 — 이어하기 소멸
          doneStatsRef.current = { count: items.length, ms: tl.practiceMs }
          setOverlay('done')
        }
      },
    })
    engineRef.current = tl

    // elapsedAtShow 채움: 항목 i 가 뜨는 순간까지의 연습 경과
    {
      let acc = 0
      for (let i = 0; i < items.length; i++) {
        elapsedAtShow[i] = acc
        acc += tl.durations[i] + (i < items.length - 1 ? cfg.blankMs : 0)
      }
    }

    // ---- 이어하기: 타이핑 입력 복원 (엔진 시작 전에) ----
    if (resumeState && resumeIdx > 0 && typing && resumeState.typing) {
      const el = inputRef.current?.el()
      if (resumeState.typing.kind === 'continuous' && continuous && el) {
        el.value = resumeState.typing.fullText
        boundaries.push(...resumeState.typing.boundaries)
      } else if (resumeState.typing.kind === 'discrete' && !continuous) {
        answers.push(...resumeState.typing.answers)
      }
    }

    // ---- 진행바 핸들 (일시정지 중에만 보임 — left 갱신은 정지 상태라 레이아웃 비용 무해) ----
    const updateHandle = (idx: number) => {
      if (handleRef.current) handleRef.current.style.left = `${tl.showFraction(idx) * 100}%`
    }

    // ---- 위치 이동 (일시정지 중 전용) ----
    function doSeek(target: number) {
      if (finished) return
      const idx = Math.max(0, Math.min(target, items.length - 1))
      if (typing) {
        const input = inputRef.current
        if (input?.isComposing()) return // IME 조합 중엔 이동 금지 (조합 파괴 방지)
        brokeLive = true
        if (liveRef.current) liveRef.current.textContent = ''
        if (continuous) {
          if (idx <= boundaries.length) {
            // 되감기: 이동 지점 이후 입력·경계 삭제 (그 구간을 다시 친다 — 확정 스펙)
            boundaries.length = idx
            const keep = idx > 0 ? boundaries[idx - 1] : 0
            const el = input?.el()
            if (el) el.value = el.value.slice(0, keep)
          } else {
            // 앞으로 스킵: 건너뛴 항목 경계를 현재 길이로 기록 (빈 구간 = 누락 채점)
            const len = input?.value().length ?? 0
            while (boundaries.length < idx) boundaries.push(len)
          }
        } else {
          if (idx <= answers.length) answers.length = idx
          else while (answers.length < idx) answers.push('')
          input?.clear()
        }
      }
      tl.seekTo(idx, performance.now())
      setPos(idx)
      updateHandle(idx)
    }
    seekRef.current = doSeek

    // ---- 이어하기 저장 (종료·이탈 시) ----
    function saveResumeNow() {
      if (finished || finalized) return
      const index = Math.max(0, tl.currentIndex)
      const state: ResumeState = {
        wordsetId: plan!.wordset.id,
        wordsetName: plan!.wordset.name,
        items,
        index,
        settings,
        typing: typing
          ? continuous
            ? {
                kind: 'continuous',
                fullText: inputRef.current?.value() ?? '',
                boundaries: boundaries.slice(0, Math.min(boundaries.length, index)),
              }
            : { kind: 'discrete', answers: answers.slice(0, index) }
          : undefined,
        savedAt: Date.now(),
      }
      void repo.saveResume(state)
    }
    saveResumeRef.current = saveResumeNow

    // ---- rAF 러너 + 시작 (이어하기는 UI 카운트다운 후 seek) ----
    let raf = 0
    let resumeCdTimer = 0
    const loop = () => {
      tl.tick(performance.now())
      if (tl.running) raf = requestAnimationFrame(loop)
    }
    const begin = () => {
      const now = performance.now()
      tl.start(now)
      if (resumeIdx > 0) {
        tl.seekTo(resumeIdx, now)
        setPos(resumeIdx)
      }
      raf = requestAnimationFrame(loop)
      // 시작 시 1회만 포커스 (세션 중 프로그램적 refocus 금지)
      if (typing) inputRef.current?.focus()
    }
    if (resumeIdx > 0 && settings.countdown) {
      // 이어하기 카운트다운은 UI 로 (엔진 countdownMs 는 0)
      let n = 3
      const cd = cdRef.current
      if (cd) cd.textContent = String(n)
      resumeCdTimer = window.setInterval(() => {
        n -= 1
        if (n > 0) {
          if (cd) cd.textContent = String(n)
          if (sound) playTick()
        } else {
          window.clearInterval(resumeCdTimer)
          if (cd) cd.textContent = ''
          begin()
        }
      }, 1000)
    } else {
      begin()
    }

    const pauseWithOverlay = (kind: Overlay) => {
      if (!tl.running || tl.paused || finished) return
      tl.pause(performance.now())
      setPos(Math.max(0, tl.currentIndex))
      updateHandle(Math.max(0, tl.currentIndex))
      setOverlay(kind)
    }
    pauseRef.current = () => pauseWithOverlay('menu')

    const onKey = (e: KeyboardEvent) => {
      if (finished) return
      if (e.key === 'Escape') {
        // 어느 모드든 Esc = 일시정지 메뉴 (열려 있으면 재개는 버튼으로)
        if (overlayRef.current === null) pauseWithOverlay('menu')
        return
      }
      // 일시정지 메뉴에서 ←/→ = 한 항목씩 이동
      if (overlayRef.current === 'menu' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        doSeek((engineRef.current?.currentIndex ?? 0) + (e.key === 'ArrowRight' ? 1 : -1))
        return
      }
      // 보기 모드 전용 Space — 타이핑 모드에선 문자 키를 절대 건드리지 않는다
      if (!typing && e.code === 'Space' && overlayRef.current === null) {
        e.preventDefault()
        pauseWithOverlay('menu')
      }
    }
    const onVis = () => {
      if (!document.hidden) return
      saveResumeNow() // 앱 전환·탭 숨김 — 진행 자동 저장
      if (overlayRef.current === null) pauseWithOverlay('menu')
    }
    const onPageHide = () => saveResumeNow() // 탭 닫기·새로고침
    window.addEventListener('keydown', onKey)
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('pagehide', onPageHide)

    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('pagehide', onPageHide)
      cancelAnimationFrame(raf)
      window.clearInterval(resumeCdTimer)
      tl.stop()
      window.clearTimeout(watchdog)
      window.clearTimeout(hintTimer)
      worker?.terminate()
      worker = null
      seekRef.current = null
      pauseRef.current = null
      saveResumeRef.current = null
      if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {})
    }
    // 마운트 1회 세션 — plan/설정은 스냅샷 고정, planSeq 키로 리마운트
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!plan) return null

  function resume() {
    const tl = engineRef.current
    if (!tl) return
    setOverlay(null)
    tl.resume(performance.now())
    if (typing) inputRef.current?.focus() // 버튼 클릭 = 사용자 제스처 안에서의 포커스
  }

  function quit() {
    saveResumeRef.current?.() // 중간 종료 — 진행 저장 (완주면 내부에서 무시)
    useApp.getState().finishPractice(null)
  }

  function onTrackPointer(e: React.PointerEvent<HTMLDivElement>) {
    // 일시정지 중에만 스크럽 (확정 스펙)
    if (overlayRef.current !== 'menu') return
    if (e.type === 'pointerdown') e.currentTarget.setPointerCapture?.(e.pointerId)
    else if (e.buttons === 0) return // move 인데 누른 상태가 아니면 무시
    const rect = e.currentTarget.getBoundingClientRect()
    const frac = (e.clientX - rect.left) / rect.width
    const tl = engineRef.current
    if (!tl) return
    const idx = tl.indexAtFraction(frac)
    if (idx !== tl.currentIndex) seekRef.current?.(idx)
  }

  function retrySame() {
    const { startPracticeWith } = useApp.getState()
    startPracticeWith(plan!.wordset, plan!.items)
  }

  return (
    <div ref={stageRef} className={s.stage}>
      <div
        ref={trackRef}
        className={`${s.barTrack} ${overlay === 'menu' ? s.scrubbable : ''}`}
        onPointerDown={onTrackPointer}
        onPointerMove={onTrackPointer}
      >
        <div className={s.barClip}>
          <div ref={barRef} className={s.barFill} />
        </div>
        <div ref={handleRef} className={s.barHandle} />
      </div>
      <div ref={counterRef} className={`${s.counter} num`} />
      {overlay === null && (
        <button
          className={s.pauseBtn}
          tabIndex={-1}
          aria-label="일시정지"
          onMouseDown={(e) => e.preventDefault() /* 타이핑 포커스 유지 — 방어 규칙 9 */}
          onClick={() => pauseRef.current?.()}
        >
          ⏸
        </button>
      )}
      {typing && settings.liveStats && !settings.safeMode && (
        <div ref={liveRef} className={`${s.liveStats} num`} />
      )}

      <div className={s.textWrap}>
        <div ref={textRef} className={`${s.flashText} ${noFade ? s.noFade : ''}`} />
        {settings.hintMode !== 'off' && plan.items.some((it) => it.hint) && (
          <div ref={hintRef} className={s.hintSlot} />
        )}
        {settings.previewNext && !settings.safeMode && <div ref={previewRef} className={s.preview} />}
        <div ref={cdRef} className={`${s.countdown} num`} />
      </div>

      {typing && (
        <div className={s.inputArea}>
          <StenoInput
            ref={inputRef}
            style={{ fontSize: settings.inputFontPx }}
            className={s.input}
            placeholder=""
            onBlurred={() => {
              // 주입 도중 프로그램적 refocus 는 글자를 떨군다 — 오버레이로 사용자 클릭 유도
              if (overlayRef.current === null && engineRef.current?.running && !engineRef.current.paused) {
                engineRef.current.pause(performance.now())
                setOverlay('blur')
              }
            }}
          />
        </div>
      )}

      <div className={s.escHint}>{typing ? '⏸ 버튼·Esc 일시정지' : 'Space·⏸ 일시정지'}</div>

      {import.meta.env.DEV && typing && (
        <div className={s.simPanel}>
          <button onClick={() => simulateBurst(inputRef.current)}>주입버스트</button>
          <button onClick={() => simulatePaste(inputRef.current)}>붙여넣기</button>
          <button onClick={() => void simulateIme(inputRef.current)}>IME조합</button>
        </div>
      )}

      {overlay === 'menu' && (
        <div className={s.overlay}>
          <div className={s.overlayTitle}>일시정지</div>
          <div className={s.stepRow}>
            <button onClick={() => seekRef.current?.((engineRef.current?.currentIndex ?? 0) - 1)}>◀ 이전</button>
            <span className={`${s.stepPos} num`}>
              {pos + 1} / {plan.items.length}
            </span>
            <button onClick={() => seekRef.current?.((engineRef.current?.currentIndex ?? 0) + 1)}>다음 ▶</button>
          </div>
          <div className={s.stepHint}>←/→ 키 또는 상단 진행바를 눌러 시작 위치 조정</div>
          <div className={s.overlayRow}>
            <button className="primary" onClick={resume}>
              계속하기
            </button>
            <button onClick={quit}>종료 (진행 저장)</button>
          </div>
        </div>
      )}

      {overlay === 'blur' && (
        <div
          className={s.overlay}
          onClick={() => {
            // 사용자 클릭(제스처) 안에서만 재포커스
            resume()
          }}
        >
          <div className={s.overlayTitle}>입력 포커스가 풀렸습니다</div>
          <div className={s.overlayHint}>클릭해서 계속</div>
        </div>
      )}

      {overlay === 'scoring' && (
        <div className={s.overlay}>
          <div className={s.overlayTitle}>채점 중…</div>
        </div>
      )}

      {overlay === 'done' && (
        <div className={s.overlay}>
          <div className={s.overlayTitle}>완료</div>
          <div className={s.doneStats}>
            <div className={s.doneStat}>
              <div className={`${s.doneNum} num`}>{doneStatsRef.current.count}</div>
              <div className={s.doneLabel}>항목</div>
            </div>
            <div className={s.doneStat}>
              <div className={`${s.doneNum} num`}>
                {Math.floor(doneStatsRef.current.ms / 60000)}:
                {String(Math.round(doneStatsRef.current.ms / 1000) % 60).padStart(2, '0')}
              </div>
              <div className={s.doneLabel}>시간</div>
            </div>
          </div>
          <div className={s.overlayRow}>
            <button className="primary" onClick={retrySame}>
              같은 목록 다시
            </button>
            <button onClick={quit}>홈</button>
          </div>
        </div>
      )}
    </div>
  )
}
