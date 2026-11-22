/**
 * 소리자바 기본자리 따라치기 — 위: 따라 칠 글(이어지는 본문), 아래: 입력창.
 *
 * - 본문 글자는 흐릿하게 시작해서, 맞게 친 글자가 색으로 칠해진다 (오자 빨강·탈자 주황).
 * - 채점은 속기 시험 기준 실시간 (liveAlign.ts). 약어 범위에서는 부호도 채점한다.
 * - 목표 타수(분당 음절)로 페이스 표시가 움직이고, '흐르기'면 글이 그 속도로 나타난다.
 * - 입력은 StenoInput (속기계 주입 방어) — 값은 rAF 에서 한 번에 읽는다.
 * - 조합 중인 마지막 음절: 점수(오자·탈자·첨가·정확도)에는 넣지 않지만 화면에는 잠정 반영한다.
 *   IME 는 다음 음절 첫 키까지 앞 음절을 조합 상태로 두므로, 확정만 기다리면 화면이 항상 한 글자
 *   늦어 "고쳐 쳤는데 반영이 안 된다"고 느낀다. 아직 맞을 수 있으면 잠정 정답(.tent), 완성형인데
 *   이미 틀렸으면 오자로 바로 보여 준다.
 * - 본문(수천 span)은 채점·위치가 바뀔 때만 다시 그린다. 시계 틱은 통계만 갱신.
 */
import { memo, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useApp } from '../../app/store.ts'
import { canBecomeSyllable, decomposeSyllable } from '../../lib/hangul.ts'
import StenoInput, { type StenoInputHandle } from '../typing/StenoInput.tsx'
import { BASIC_STAGES, PART_LABEL, buildSessionItems, scoreOptsFor, targetSyllablesFor, type SjItem } from './basicCourses.ts'
import {
  LiveAligner,
  ST_MISS,
  ST_OK,
  ST_SUB,
  buildTarget,
  examAccuracy,
  normalizeTyped,
  type AlignResult,
  type ScoreOpts,
} from './liveAlign.ts'
import type { SjConfig } from './sjPrefs.ts'
import s from './SjPractice.module.css'

/** 결과 패널이 뜬 직후 버튼 무시 시간 — 자동 완주 순간 치던 띄어쓰기·엔터가 버튼을 누르지 않게 */
const RESULT_GUARD_MS = 700

interface Session {
  items: SjItem[]
  opts: ScoreOpts
  chars: string[]
  normOf: Int32Array
  norm: string[]
  /** 화면 글자 → 낱말 번호 (흐르기 공개 단위) */
  wordOfChar: Int32Array
  /** 채점 인덱스 → 낱말 번호 */
  wordOfNorm: Int32Array
  /** 채점 인덱스 → 항목 번호 (약어 힌트용) */
  itemOfNorm: Int32Array
  /** 채점 인덱스 → 화면 글자 인덱스 */
  charOfNorm: Int32Array
}

function makeSession(cfg: SjConfig): Session {
  const items = buildSessionItems({
    stage: cfg.stage,
    part: cfg.part,
    cumulative: cfg.cumulative,
    shuffle: cfg.shuffle,
    targetSyllables: targetSyllablesFor(cfg.tasu, cfg.minutes),
  })
  const opts: ScoreOpts = scoreOptsFor(cfg.part)
  const text = items.map((it) => it.t).join(' ')
  const t = buildTarget(text, opts)
  const wordOfChar = new Int32Array(t.chars.length)
  const itemOfChar = new Int32Array(t.chars.length)
  let w = 0
  t.chars.forEach((ch, i) => {
    if (/\s/u.test(ch)) w++
    wordOfChar[i] = w
  })
  // 항목 경계: 항목 텍스트 길이 + 사이 공백 1
  let pos = 0
  items.forEach((it, k) => {
    const len = [...it.t.normalize('NFC')].length
    for (let i = pos; i < pos + len + 1 && i < t.chars.length; i++) itemOfChar[i] = k
    pos += len + 1
  })
  const wordOfNorm = new Int32Array(t.norm.length)
  const itemOfNorm = new Int32Array(t.norm.length)
  const charOfNorm = new Int32Array(t.norm.length)
  t.normOf.forEach((n, i) => {
    if (n >= 0) {
      wordOfNorm[n] = wordOfChar[i]
      itemOfNorm[n] = itemOfChar[i]
      charOfNorm[n] = i
    }
  })
  return { items, opts, chars: t.chars, normOf: t.normOf, norm: t.norm, wordOfChar, wordOfNorm, itemOfNorm, charOfNorm }
}

const EMPTY: AlignResult = { status: new Uint8Array(0), end: 0, ok: 0, sub: 0, miss: 0, ins: 0, typed: 0, tailExtra: false, lastJ: -1 }

/** 화면용 정렬 — 확정 입력(res)과 달리 조합 중인 음절까지 넣은 결과 + 그 음절이 맞붙은 자리의 표시 방식 */
interface LiveView {
  res: AlignResult
  /** 조합 중 음절이 맞붙은 원문 채점 인덱스, 없으면 -1 */
  compAt: number
  /** 그 자리에 강제할 클래스 — 잠정 정답(.tent)·아직 모름(.pending). null 이면 정렬 결과(오자) 그대로 */
  compCls: string | null
}
const EMPTY_VIEW: LiveView = { res: EMPTY, compAt: -1, compCls: null }

/** 조합 중 글자 `comp` 를 원문 `target` 자리에 어떻게 보일지 */
function composingClass(comp: string, target: string): string | null {
  if (canBecomeSyllable(comp, target)) return s.tent
  // 완성형(또는 한글 아님)인데 못 맞추는 글자는 바로 오자로 — 홑자모는 아직 모르니 흐릿하게
  return decomposeSyllable(comp) || !/^[ㄱ-ㅎㅏ-ㅣ]$/u.test(comp) ? null : s.pending
}

/** 부호 타법 힌트인가 — 부호를 채점하지 않는 범위(전부 섞기)에서는 숨긴다 */
const PUNCT_HINT_RE = /띄어쓰기|마침표|쉼표|[!%-]:/

/** 종료 시 꼬리에 남은 미완성 자모(조합 중이던 것) 제거 — 버튼 클릭으로 포커스가 빠지며 확정된 홑자모는 입력이 아니다 */
function stripDanglingJamo(raw: string): string {
  return raw.replace(/[ㄱ-ㅎㅏ-ㅣ]+$/u, '')
}

function fmtTime(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

/** 타수 표시 — 너무 짧은 시간(붙여넣기 등)엔 0 */
function tasuOf(count: number, minutes: number): number {
  return minutes > 0.02 ? Math.round(count / minutes) : 0
}

export default function SjPractice({ config }: { config: SjConfig }) {
  const [round, setRound] = useState(0)
  // 다시 하기 = 새로 섞은 본문으로 통째 리마운트
  return <Run key={round} config={config} onRestart={() => setRound((r) => r + 1)} />
}

type Ended = { at: number; auto: boolean }

function Run({ config, onRestart }: { config: SjConfig; onRestart: () => void }) {
  const { go } = useApp.getState()
  const inputFontPx = useApp((st) => st.settings.inputFontPx)
  // 세션 본문은 state 로 한 번만 만든다 (섞기 결과와 채점기의 원문이 항상 같은 것을 가리키게)
  const [sess] = useState(() => makeSession(config))
  const [aligner] = useState(() => new LiveAligner(sess.norm))
  // 조합 중 음절까지 넣은 화면용 정렬기 — 확정 정렬기와 행을 따로 가져 타건마다 1행씩만 더 계산한다
  const [viewAligner] = useState(() => new LiveAligner(sess.norm))
  const m = sess.norm.length
  const stage = BASIC_STAGES.find((st) => st.no === config.stage)!

  const inputRef = useRef<StenoInputHandle>(null)
  const boxRef = useRef<HTMLDivElement>(null)

  const [res, setRes] = useState<AlignResult>(EMPTY)
  const [view, setView] = useState<LiveView>(EMPTY_VIEW)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(0)
  const [ended, setEnded] = useState<Ended | null>(null)
  const [focusLost, setFocusLost] = useState(false)
  const pendingRef = useRef(false)
  const startedRef = useRef<number | null>(null)
  const endedRef = useRef(false)

  // ---- 입력 → 채점 (rAF 로 합침) ----
  /** @param final 종료 시점 — 조합 중인 음절도 포함해 마지막 입력까지 반영 */
  function score(final: boolean): AlignResult | null {
    const h = inputRef.current
    if (!h) return null
    const raw = final ? stripDanglingJamo(h.value()) : h.value()
    const all = normalizeTyped(raw, sess.opts)
    // 조합 중인 마지막 음절은 아직 미완성 — 점수에서는 뺀다 (종료 시엔 포함)
    const composing = !final && h.isComposing() && all.length > 0
    const typed = composing ? all.slice(0, -1) : all
    const t = performance.now()
    if (startedRef.current === null && raw.trim().length > 0) {
      startedRef.current = t
      setStartedAt(t)
    }
    setNow(t) // 내 타수가 시계 틱(0.1초)을 기다리지 않게
    const r = aligner.update(typed)
    setRes(r)
    if (!composing) {
      setView({ res: r, compAt: -1, compCls: null })
    } else {
      // 화면은 조합 중 음절까지 — 고쳐 치는 즉시 색이 바뀌고 커서가 나아간다
      const v = viewAligner.update(all)
      const comp = all[all.length - 1]
      // 중복 타건(이미 맞은 자리에 다시 맞붙고 커서도 안 나아감)은 그 글자를 잠정으로 되돌리지 않는다
      const dup = v.lastJ >= 0 && v.end <= r.end && r.status[v.lastJ] === ST_OK
      const compAt = dup ? -1 : v.lastJ
      setView({ res: v, compAt, compCls: compAt >= 0 ? composingClass(comp, sess.norm[compAt]) : null })
    }
    return r
  }

  function recompute() {
    pendingRef.current = false
    if (endedRef.current) return
    const h = inputRef.current
    const r = score(false)
    if (!r || !h) return
    // 자동 완주: 끝까지 왔고 마지막 글자가 맞았을 때만 — 끝 직전 오타·중복 타건(꼬리 첨가)은 고칠 기회를 준다
    if (m > 0 && r.end >= m && r.status[m - 1] === ST_OK && !r.tailExtra && !h.isComposing()) finish(true)
  }

  function onDirty() {
    if (!pendingRef.current) {
      pendingRef.current = true
      requestAnimationFrame(recompute)
    }
  }

  function finish(auto: boolean) {
    if (endedRef.current) return
    if (!auto) score(true) // 그만하기·Esc — 아직 반영 안 된 마지막 입력까지 채점
    endedRef.current = true
    setEnded({ at: performance.now(), auto })
  }

  // 조합 확정 뒤에 input 이 안 올 수 있다 — compositionend 에서도 다시 채점
  useEffect(() => {
    const el = inputRef.current?.el()
    if (!el) return
    el.focus()
    const onEnd = () => onDirty()
    el.addEventListener('compositionend', onEnd)
    return () => el.removeEventListener('compositionend', onEnd)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- 시계 (시작 후 ~ 끝까지) ----
  useEffect(() => {
    if (startedAt === null || ended !== null) return
    const id = window.setInterval(() => setNow(performance.now()), 100)
    return () => window.clearInterval(id)
  }, [startedAt, ended])

  // Esc = 그만하고 결과 보기 (IME 조합 취소용 Esc 는 무시)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.keyCode === 229) return
      if (endedRef.current) go({ name: 'home' })
      else if (startedRef.current !== null) finish(false)
      else go({ name: 'home' })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const elapsed = startedAt === null ? 0 : (ended?.at ?? now) - startedAt
  const minutes = elapsed / 60000
  const pace = startedAt === null ? 0 : Math.min(m, Math.floor(minutes * config.tasu))
  const myTasu = tasuOf(res.typed, minutes)
  const liveAcc = examAccuracy(res, res.end)
  // 위치(커서·진행·페이스 차·공개 범위)는 조합 중 음절까지 반영한 화면용 결과로
  const viewEnd = view.res.end
  const gap = viewEnd - pace

  // 흐르기: 페이스(또는 내 위치) 낱말 + 다음 낱말까지만 보인다
  const revealWord =
    config.reveal === 'all' || ended !== null
      ? Number.MAX_SAFE_INTEGER
      : (m === 0 ? 0 : sess.wordOfNorm[Math.min(Math.max(pace, viewEnd), m - 1)]) + 1
  const curChar = viewEnd < m ? sess.charOfNorm[viewEnd] : sess.chars.length
  const paceChar = startedAt !== null && pace < m ? sess.charOfNorm[pace] : -1
  const curItem = sess.items[sess.itemOfNorm[Math.min(viewEnd, m - 1)] ?? 0]

  // 현재 위치가 보이도록 본문 스크롤
  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box) return
    const el = box.querySelector<HTMLElement>(`[data-i="${Math.min(curChar, sess.chars.length - 1)}"]`)
    if (!el) return
    const top = el.offsetTop - box.scrollTop
    if (top < box.clientHeight * 0.1 || top > box.clientHeight * 0.6) {
      box.scrollTop = Math.max(0, el.offsetTop - box.clientHeight * 0.3)
    }
  }, [curChar, sess.chars.length])

  const title = `${config.stage}단계 ${stage.title} · ${PART_LABEL[config.part]}${config.cumulative && config.stage > 1 ? ' · 누적' : ''}`
  const running = startedAt !== null && ended === null

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className="ghost" onClick={() => go({ name: 'home' })}>
          ← 가이드
        </button>
        <span className={s.title}>{title}</span>
        <div className={s.stats} aria-live="off">
          <span className={s.stat}>
            목표 <b className="num">{config.tasu}</b>타
          </span>
          <span className={s.stat}>
            내 타수 <b className="num">{myTasu}</b>
          </span>
          <span className={s.stat}>
            정확도 <b className="num">{res.end > 0 ? (liveAcc * 100).toFixed(1) : '—'}</b>%
          </span>
          <span className={`${s.stat} num`}>{fmtTime(elapsed)}</span>
          {running && (
            <span className={`${s.gap} ${gap >= 0 ? s.ahead : s.behind}`}>
              {gap >= 0 ? `페이스 +${gap}` : `페이스 ${gap}`}
            </span>
          )}
        </div>
        {ended === null && (
          <button onClick={() => (startedRef.current === null ? go({ name: 'home' }) : finish(false))}>그만하기</button>
        )}
      </header>

      <div className={s.progress} aria-hidden>
        <div className={s.progressMine} style={{ width: `${m ? (viewEnd / m) * 100 : 0}%` }} />
        {startedAt !== null && <div className={s.progressPace} style={{ left: `${m ? (pace / m) * 100 : 0}%` }} />}
      </div>

      <div ref={boxRef} className={s.target} data-testid="sj-target">
        <TargetText
          chars={sess.chars}
          normOf={sess.normOf}
          wordOfChar={sess.wordOfChar}
          res={view.res}
          compAt={view.compAt}
          compCls={view.compCls}
          curChar={ended === null ? curChar : -1}
          paceChar={paceChar}
          revealWord={revealWord}
        />
      </div>

      <div className={s.hintBar}>
        {startedAt === null ? (
          <span>
            첫 글자를 치면 시작합니다 · 목표 {config.tasu}타 = 1분에 {config.tasu}음절
            {sess.opts.punct && ' · 약어 연습은 부호도 채점합니다'}
          </span>
        ) : (
          <span>
            오자 <b className={s.subTxt}>{res.sub}</b> · 탈자 <b className={s.missTxt}>{res.miss}</b> · 첨가{' '}
            <b>{res.ins}</b>
            {curItem?.h && ended === null && (sess.opts.punct || !PUNCT_HINT_RE.test(curItem.h)) && (
              <>
                {'\u00a0\u00a0·\u00a0\u00a0'}약어 <b>{curItem.t}</b> — {curItem.h}
              </>
            )}
          </span>
        )}
      </div>

      <div className={s.inputWrap}>
        <StenoInput
          ref={inputRef}
          className={s.input}
          style={{ fontSize: inputFontPx }}
          placeholder="여기에 따라 치세요"
          onDirty={onDirty}
          onBlurred={() => endedRef.current || setFocusLost(true)}
          onFocused={() => setFocusLost(false)}
        />
        {focusLost && ended === null && (
          <button
            className={s.focusBanner}
            onClick={() => {
              inputRef.current?.focus()
              setFocusLost(false)
            }}
          >
            입력 포커스가 풀렸습니다 — 여기를 눌러 계속
          </button>
        )}
      </div>

      {ended !== null && (
        <ResultPanel
          res={res}
          total={m}
          pace={pace}
          elapsed={elapsed}
          tasu={config.tasu}
          auto={ended.auto}
          showPace={config.reveal === 'flow'}
          punct={sess.opts.punct === true}
          onRestart={onRestart}
          onExit={() => go({ name: 'home' })}
        />
      )}
    </div>
  )
}

/** 본문 — 채점·커서·페이스·공개 범위가 바뀔 때만 다시 그린다 (시계 틱엔 안 그림) */
const TargetText = memo(function TargetText(p: {
  chars: string[]
  normOf: Int32Array
  wordOfChar: Int32Array
  /** 조합 중 음절까지 넣은 화면용 정렬 결과 */
  res: AlignResult
  /** 조합 중 음절이 맞붙은 채점 인덱스(-1 = 없음)와 그 자리에 강제할 클래스 */
  compAt: number
  compCls: string | null
  /** -1 = 커서 표시 안 함 (종료) */
  curChar: number
  paceChar: number
  revealWord: number
}) {
  const { res } = p
  const status = res.status
  const cursorAt = p.curChar < 0 ? p.chars.length : p.curChar
  return (
    <>
      {p.chars.map((ch, i) => {
        const n = p.normOf[i]
        let cls = s.pending
        if (n >= 0) {
          const st = n < res.end ? status[n] : 0
          if (n === p.compAt && p.compCls) cls = p.compCls
          else if (st === ST_OK) cls = s.ok
          else if (st === ST_SUB) cls = s.sub
          else if (st === ST_MISS) cls = s.miss
        } else if (i < cursorAt) cls = s.ok // 지나온 공백·부호
        const classes = [cls]
        if (i === p.curChar) classes.push(s.cur)
        if (i === p.paceChar) classes.push(s.pace)
        if (p.wordOfChar[i] > p.revealWord) classes.push(s.hidden)
        return (
          <span key={i} data-i={i} className={classes.join(' ')}>
            {ch}
          </span>
        )
      })}
    </>
  )
})

function ResultPanel(props: {
  res: AlignResult
  total: number
  /** 종료 시점의 목표 페이스 위치 — 조기 종료 시 '불러줬는데 못 친' 분량의 기준 */
  pace: number
  elapsed: number
  tasu: number
  auto: boolean
  /** 흐르기 모드였을 때만 '페이스 기준' 줄 — 전부 보기에선 불러준 분량이란 게 없다 */
  showPace: boolean
  punct: boolean
  onRestart(): void
  onExit(): void
}) {
  const { res, total, elapsed, tasu } = props
  const minutes = elapsed / 60000
  const myTasu = tasuOf(res.typed, minutes)
  const done = res.end >= total
  const accReached = examAccuracy(res, res.end)
  // 조기 종료: 시험처럼 '불러준(페이스) 곳까지' 중 못 친 글자를 탈자로 본다. 아직 안 불러준 뒷부분은 감점 아님
  const dictated = Math.max(res.end, Math.min(total, props.pace))
  const left = dictated - res.end
  const accDictated = examAccuracy({ sub: res.sub, miss: res.miss + left, ins: res.ins }, dictated)
  // 자동 완주 직후엔 버튼을 잠깐 잠근다 — 치던 띄어쓰기(ㄴㄹ)·엔터가 '다시 하기'를 누르지 않게
  const [armed, setArmed] = useState(!props.auto)
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (armed) return
    const id = window.setTimeout(() => setArmed(true), RESULT_GUARD_MS)
    return () => window.clearTimeout(id)
  }, [armed])
  // 버튼이 열리면 패널로 포커스 — 입력창에 계속 쳐지지 않게, 스크린리더에도 결과가 읽히게
  useEffect(() => {
    if (armed) panelRef.current?.focus()
  }, [armed])

  return (
    <div className={s.resultBack} role="dialog" aria-modal="true" aria-label="연습 결과">
      <div ref={panelRef} tabIndex={-1} className={s.result}>
        <div className={s.resultTitle}>{done ? '완주!' : '연습 결과'}</div>
        <div className={s.resultGrid}>
          <div className={s.big}>
            <div className={`${s.bigNum} num`}>{(accReached * 100).toFixed(1)}%</div>
            <div className={s.bigLabel}>정확도 (시험 기준{done ? '' : ' · 친 곳까지'})</div>
          </div>
          <div className={s.big}>
            <div className={`${s.bigNum} num`}>{myTasu}</div>
            <div className={s.bigLabel}>타수 (목표 {tasu})</div>
          </div>
        </div>
        <dl className={s.detail}>
          <dt>원문</dt>
          <dd className="num">{total}자</dd>
          <dt>친 곳까지</dt>
          <dd className="num">{res.end}자</dd>
          <dt>오자 · 탈자 · 첨가</dt>
          <dd className="num">
            {res.sub} · {res.miss} · {res.ins}
          </dd>
          {!done && props.showPace && (
            <>
              <dt>페이스 기준</dt>
              <dd className="num">
                {dictated}자 중 못 친 {left}자 → {(accDictated * 100).toFixed(1)}%
              </dd>
            </>
          )}
          <dt>걸린 시간</dt>
          <dd className="num">{fmtTime(elapsed)}</dd>
        </dl>
        <p className={s.note}>
          정확도 = (글자수 − 오자 − 탈자 − 첨가) ÷ 글자수 · 띄어쓰기 제외{props.punct ? ' · 부호 포함(약어 연습)' : ' · 문장부호 제외'} ·
          타수 = 분당 음절
        </p>
        <div className={s.resultBtns}>
          <button className="primary" disabled={!armed} onClick={props.onRestart}>
            다시 하기 (새로 섞기)
          </button>
          <button disabled={!armed} onClick={props.onExit}>
            가이드로
          </button>
        </div>
      </div>
    </div>
  )
}
