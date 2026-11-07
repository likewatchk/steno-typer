/**
 * 소리자바 연습 가이드 — 기본자리연습 1~10단계.
 * 단계 고르기 → 범위·누적·섞기·타수·분량 설정 → 따라치기(SjPractice).
 */
import { useState } from 'react'
import { useApp } from '../../app/store.ts'
import {
  BASIC_STAGES,
  PART_LABEL,
  scoreOptsFor,
  stageItems,
  syllableCount,
  targetSyllablesFor,
  type CoursePart,
  type KeyRef,
} from './basicCourses.ts'
import { MINUTES_CHOICES, TASU_MAX, TASU_MIN, clampTasu, loadSj, saveSj, type SjConfig } from './sjPrefs.ts'
import s from './SoriJava.module.css'

/** 교재 그림 그대로의 소리자바 글쇠 배치 */
const LEFT = [
  ['ㅊ', 'ㅌ', 'ㅋ', 'ㅂ', 'ㅍ'],
  ['ㅅ', 'ㄷ', 'ㅈ', 'ㄱ', '㉿'],
  ['ㅁ', 'ㄹ', 'ㄴ', 'ㅎ', 'ㅢ'],
]
const RIGHT = [
  ['ㄲ', 'ㅎ', 'ㅌ', 'ㅊ', 'ㅍ'],
  ['ㄱ', 'ㄴ', 'ㄹ', 'ㅅ', 'ㅂ'],
  ['ㅆ', 'ㅇ', 'ㅁ', 'ㄷ', 'ㅈ'],
]
const THUMB_L = ['ㅗ', 'ㅏ', 'ㅜ']
const THUMB_R = ['ㅡ', 'ㅓ', 'ㅣ']

function SjKeyboard({ keys }: { keys: KeyRef[] }) {
  const on = new Set(keys.map((k) => `${k.side}:${k.key}`))
  const key = (side: KeyRef['side'], k: string) => (
    <span key={`${side}${k}`} className={`${s.key} ${on.has(`${side}:${k}`) ? s.keyOn : ''}`}>
      {k}
    </span>
  )
  return (
    <figure className={s.kbd} aria-label="소리자바 기본자리 글쇠 배치">
      <div className={s.hands}>
        <div className={s.hand}>
          <div className={s.handLabel}>왼손 · 초성</div>
          {LEFT.map((row, i) => (
            <div key={i} className={s.keyRow}>
              {row.map((k) => key('L', k))}
            </div>
          ))}
        </div>
        <div className={s.hand}>
          <div className={s.handLabel}>오른손 · 종성(받침)</div>
          {RIGHT.map((row, i) => (
            <div key={i} className={s.keyRow}>
              {row.map((k) => key('R', k))}
            </div>
          ))}
        </div>
      </div>
      <div className={s.thumbs}>
        <span className={s.handLabel}>왼엄지</span>
        {THUMB_L.map((k) => key('T', k))}
        <span className={s.thumbGap} />
        {THUMB_R.map((k) => key('T', k))}
        <span className={s.handLabel}>오른엄지</span>
      </div>
      <figcaption className={s.caption}>강조된 글쇠가 이 단계에서 새로 익히는 자리입니다</figcaption>
    </figure>
  )
}

const TASU_PRESETS = [30, 60, 100, 150, 200, 250, 300, 330, 400]
const PARTS: CoursePart[] = ['words', 'abbr', 'sentences', 'mix']

export default function SoriJava() {
  const { go, setTrack } = useApp.getState()
  const [cfg, setCfg] = useState<SjConfig>(loadSj)
  const [tasuText, setTasuText] = useState(String(cfg.tasu))
  const stage = BASIC_STAGES.find((st) => st.no === cfg.stage)!

  function patch(p: Partial<SjConfig>) {
    const next = { ...cfg, ...p }
    setCfg(next)
    saveSj(next)
    if (p.tasu !== undefined) setTasuText(String(p.tasu))
  }

  /** 숫자 칸 확정 — 비워 두면 원래 값으로 되돌린다 */
  function commitTasu() {
    if (tasuText.trim() === '') {
      setTasuText(String(cfg.tasu))
      return
    }
    const n = Number(tasuText)
    if (!Number.isFinite(n)) {
      setTasuText(String(cfg.tasu))
      return
    }
    patch({ tasu: clampTasu(n) })
  }

  const ownCount = stageItems(stage, cfg.part).length
  const prevCount =
    cfg.cumulative && cfg.stage > 1
      ? BASIC_STAGES.filter((st) => st.no < cfg.stage).reduce((n, st) => n + stageItems(st, cfg.part).length, 0)
      : 0
  const scoreOpts = scoreOptsFor(cfg.part)
  const ownSyl = stageItems(stage, cfg.part).reduce((n, it) => n + syllableCount(it.t, scoreOpts), 0)
  const avgSyl = ownSyl / Math.max(1, ownCount)
  const target = targetSyllablesFor(cfg.tasu, cfg.minutes)
  // 전부: 현재 단계 전부 + (누적이면) 앞 단계에서 같은 수만큼 → 대략 두 배
  const volume = target === 'all' ? Math.round(ownSyl * (prevCount > 0 ? 2 : 1)) : target
  const estMin = volume / cfg.tasu

  function start() {
    saveSj(cfg)
    go({ name: 'sjPractice', config: { ...cfg } })
  }

  return (
    <div className={s.page}>
      <section className={s.hero}>
        <span className={s.eyebrow}>소리자바 속기</span>
        <h1 className={s.title}>기본자리연습 1~10단계</h1>
        <p className={s.lead}>
          교재 순서대로 자리를 익힙니다. 위에 이어지는 글을 아래에 따라 치면, 맞게 친 글자가 색으로 칠해지고 속기
          시험 기준으로 바로 채점됩니다. 목표 타수(분당 음절)로 속도를 정하세요.
        </p>
      </section>

      <SjKeyboard keys={stage.keys} />

      <div className={s.grid}>
        <section aria-label="연습 단계">
          <h2 className={s.h2}>연습 단계</h2>
          <ol className={s.steps}>
            {BASIC_STAGES.map((st) => (
              <li key={st.no}>
                <button
                  className={`${s.step} ${st.no === cfg.stage ? s.stepOn : ''}`}
                  aria-pressed={st.no === cfg.stage}
                  onClick={() => patch({ stage: st.no })}
                >
                  <span className={`${s.stepNo} num`}>{st.no}</span>
                  <span className={s.stepBody}>
                    <span className={s.stepTitle}>{st.title}</span>
                    <span className={s.stepDesc}>{st.focus}</span>
                  </span>
                  <span className={`${s.stepCount} num`}>{st.bookWords.length + st.extra.length}낱말</span>
                </button>
              </li>
            ))}
          </ol>
        </section>

        <section className={s.panel} aria-label="연습 설정">
          <div className={s.panelHead}>
            <span className={s.panelNo}>{stage.no}단계</span>
            <span className={s.panelTitle}>{stage.title}</span>
          </div>
          <div className={s.focus}>{stage.focus}</div>
          <ul className={s.tips}>
            {stage.tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>

          <div className={s.group}>
            <span className={s.label}>연습 범위</span>
            <div className={s.seg} role="group" aria-label="연습 범위">
              {PARTS.map((p) => (
                <button key={p} className={cfg.part === p ? s.segOn : ''} onClick={() => patch({ part: p })}>
                  {PART_LABEL[p]}
                </button>
              ))}
            </div>
          </div>

          {cfg.part === 'abbr' && <span className={s.dim}>약어 연습에서는 마침표·쉼표 같은 부호도 채점합니다.</span>}
          <div className={s.toggles}>
            <label className={s.check}>
              <input type="checkbox" checked={cfg.shuffle} onChange={(e) => patch({ shuffle: e.target.checked })} />
              섞기
            </label>
            <label className={s.check}>
              <input
                type="checkbox"
                checked={cfg.cumulative && cfg.stage > 1}
                disabled={cfg.stage === 1}
                onChange={(e) => patch({ cumulative: e.target.checked })}
              />
              누적 (앞 단계도 섞어서)
            </label>
          </div>

          <div className={s.group}>
            <span className={s.label}>
              목표 타수 <b className="num">{cfg.tasu}</b>타 <span className={s.dim}>· 분당 음절</span>
            </span>
            <div className={s.tasuRow}>
              <input
                type="range"
                min={TASU_MIN}
                max={TASU_MAX}
                step={5}
                value={cfg.tasu}
                aria-label="목표 타수"
                onChange={(e) => patch({ tasu: clampTasu(Number(e.target.value)) })}
              />
              <input
                className={s.tasuNum}
                type="number"
                inputMode="numeric"
                min={TASU_MIN}
                max={TASU_MAX}
                value={tasuText}
                aria-label="목표 타수 직접 입력"
                onChange={(e) => setTasuText(e.target.value)}
                onBlur={commitTasu}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitTasu()
                }}
              />
            </div>
            <div className={s.chips}>
              {TASU_PRESETS.map((t) => (
                <button key={t} className={`${s.chip} ${cfg.tasu === t ? s.chipOn : ''}`} onClick={() => patch({ tasu: t })}>
                  {t === 330 ? '330 · 1급' : t}
                </button>
              ))}
            </div>
          </div>

          <div className={s.group}>
            <span className={s.label}>분량</span>
            <div className={s.seg} role="group" aria-label="분량">
              {MINUTES_CHOICES.map((mm) => (
                <button key={mm} className={cfg.minutes === mm ? s.segOn : ''} onClick={() => patch({ minutes: mm })}>
                  {mm === 'all' ? '전부' : `${mm}분`}
                </button>
              ))}
            </div>
            <span className={s.dim}>
              {cfg.minutes === 'all'
                ? `이 범위 ${ownCount}항목 전부 한 번씩${prevCount > 0 ? ` + 앞 단계 ${prevCount}항목에서 ${ownCount}개` : ''} ≈ ${volume}음절 · ${cfg.tasu}타로 약 ${estMin < 1 ? '1분 미만' : `${Math.round(estMin)}분`}`
                : `${cfg.tasu}타로 ${cfg.minutes}분 ≈ ${volume}음절 · 이 범위 ${ownCount}항목(평균 ${avgSyl.toFixed(1)}음절)${prevCount > 0 ? ` + 앞 단계 ${prevCount}항목에서 같은 수만큼` : ''}`}
            </span>
          </div>

          <div className={s.group}>
            <span className={s.label}>글 나타나기</span>
            <div className={s.seg} role="group" aria-label="글 나타나기">
              <button className={cfg.reveal === 'flow' ? s.segOn : ''} onClick={() => patch({ reveal: 'flow' })}>
                타수만큼 흐르기
              </button>
              <button className={cfg.reveal === 'all' ? s.segOn : ''} onClick={() => patch({ reveal: 'all' })}>
                처음부터 전부
              </button>
            </div>
          </div>

          <button className={`primary ${s.start}`} onClick={start}>
            {stage.no}단계 연습 시작
          </button>
        </section>
      </div>

      <section className={s.later} aria-label="다음 과정">
        <h2 className={s.h2}>다음 과정</h2>
        <div className={s.laterRow}>
          <div className={s.card}>
            <div className={s.cardTitle}>응용약자 연습</div>
            <p className={s.cardDesc}>기본자리를 마친 뒤 응용약자를 집중 연습합니다.</p>
            <span className={s.soon}>준비 중</span>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>문장 단위 연습</div>
            <p className={s.cardDesc}>문장을 통째로 받아치는 실전형 연습입니다.</p>
            <span className={s.soon}>준비 중</span>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>자유연습</div>
            <p className={s.cardDesc}>메모장처럼 자유롭게 쳐 봅니다.</p>
            <button onClick={() => go({ name: 'free' })}>자유연습 열기</button>
          </div>
          <div className={s.card}>
            <div className={s.cardTitle}>예전 깜빡이</div>
            <p className={s.cardDesc}>기존 단어장·약어 깜빡이 연습.</p>
            <button onClick={() => setTrack('legacy')}>예전거로 가기</button>
          </div>
        </div>
      </section>
    </div>
  )
}
