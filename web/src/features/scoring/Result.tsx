import { useApp } from '../../app/store.ts'
import * as repo from '../../lib/repo.ts'
import { prepareItems } from '../../lib/scheduler.ts'
import { initSound } from '../../lib/sound.ts'
import type { SessionRecord } from '../../lib/types.ts'
import s from './Result.module.css'

function fmtMs(ms: number): string {
  const sec = Math.round(ms / 1000)
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`
}

export default function Result({ record }: { record: SessionRecord }) {
  const { go, reloadWordsets, select, startPracticeWith } = useApp.getState()
  const settings = useApp((st) => st.settings)
  const result = record.result
  if (!result) return null

  const wrongTargets = [...new Set(result.items.filter((it) => it.errors > 0).map((it) => it.target))]

  function enterFullscreenMaybe() {
    initSound()
    if (settings.fullscreen && !document.fullscreenElement) {
      void document.documentElement.requestFullscreen?.().catch(() => {})
    }
  }

  async function retryWrong() {
    if (!wrongTargets.length) return
    const d = new Date()
    const stamp = `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    const ws = await repo.createWordset(`오답 — ${record.wordsetName} (${stamp})`, wrongTargets)
    await reloadWordsets()
    select(ws.id)
    enterFullscreenMaybe()
    startPracticeWith(ws, prepareItems(ws.items, { kind: 'all' }, settings.order, 1))
  }

  function retrySameSettings() {
    const { wordsets } = useApp.getState()
    if (!wordsets.some((w) => w.id === record.wordsetId)) {
      alert('원본 단어장이 삭제되어 다시 실행할 수 없습니다.')
      return
    }
    select(record.wordsetId)
    enterFullscreenMaybe()
    useApp.getState().startPractice()
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <button className="ghost" onClick={() => go({ name: 'home' })}>
          ← 홈
        </button>
        <span className={s.title}>{record.wordsetName} — 결과</span>
        <span className={s.subStats}>
          <span className="num">
            오타 {result.items.reduce((a, b) => a + b.substituted, 0)} · 누락{' '}
            {result.items.reduce((a, b) => a + b.deleted, 0)} · 삽입{' '}
            {result.items.reduce((a, b) => a + b.inserted, 0)}
          </span>
        </span>
      </header>

      <section className={s.stats}>
        <div className={s.stat}>
          <div className={`${s.statNum} num`}>{(result.accuracy * 100).toFixed(1)}%</div>
          <div className={s.statLabel}>정확도 ({result.correctUnits}/{result.totalUnits})</div>
        </div>
        <div className={s.stat}>
          <div className={`${s.statNum} num`}>{Math.round(result.kpm)}</div>
          <div className={s.statLabel}>타수/분</div>
        </div>
        <div className={s.stat}>
          <div className={`${s.statNum} num`}>{fmtMs(result.elapsedMs)}</div>
          <div className={s.statLabel}>연습 시간</div>
        </div>
      </section>

      <div className={s.legend}>
        <span className={s.sub}>오타</span>
        <span className={s.del}>누락</span>
        <span className={s.ins}>삽입</span>
      </div>

      <section className={s.list}>
        {result.items.map((it, i) => (
          <div key={i} className={s.row}>
            <span className={`${s.rowNo} num`}>{i + 1}</span>
            <div className={s.rowBody}>
              <div className={s.rowTarget}>{it.target}</div>
              <div className={s.rowDiff}>
                {it.input.trim() === '' && it.errors > 0 ? (
                  <span className={s.del}>(입력 없음)</span>
                ) : (
                  it.diff.map(([op, text], j) => (
                    <span key={j} className={s[op]}>
                      {text}
                    </span>
                  ))
                )}
              </div>
            </div>
            {it.errors === 0 ? (
              <span className={s.rowOk}>정확</span>
            ) : (
              <span className={`${s.rowErr} num`}>-{it.errors}</span>
            )}
          </div>
        ))}
      </section>

      <div className={s.actions}>
        <button className="primary" disabled={!wrongTargets.length} onClick={() => void retryWrong()}>
          오답만 다시 ({wrongTargets.length})
        </button>
        <button onClick={retrySameSettings}>같은 설정 다시</button>
        <button onClick={() => go({ name: 'home' })}>홈</button>
      </div>
    </div>
  )
}
