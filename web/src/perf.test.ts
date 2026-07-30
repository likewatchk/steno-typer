/**
 * 성능 예산 테스트 — O(n²) 폭발·회귀를 잡기 위한 상한 검증.
 * 기준 시나리오(플랜 §1): 10,000항목 단어장 / 100,000자 세션.
 * 예산은 CI 변동을 감안해 실측의 ~10배 여유 — 통과 실패는 복잡도 회귀를 뜻한다.
 */
import { describe, expect, it } from 'vitest'
import { countKeystrokes } from './lib/hangul.ts'
import { FlashTimeline, prepareItems, type TimelineConfig } from './lib/scheduler.ts'
import { computeFitSizes, type MeasureFn } from './lib/fit.ts'
import { scoreSession } from './features/scoring/score.ts'
import type { ScoringOptions } from './lib/types.ts'

const SYLL = [...'가나다라마바사아자차카타파하고노도로모보소오조초코토포호']
function word(i: number, len: number): string {
  let out = ''
  for (let k = 0; k < len; k++) out += SYLL[(i * 7 + k * 13) % SYLL.length]
  return out
}

const cfg: TimelineConfig = {
  durationMode: 'auto',
  fixedMs: 2000,
  autoBaseMs: 600,
  autoPerCharMs: 180,
  autoMinMs: 1000,
  autoMaxMs: 8000,
  blankMs: 150,
  countdownMs: 3000,
}

const opts: ScoringOptions = { ignoreSpace: true, ignorePunct: false, unit: 'jamo', inputStyle: 'continuous' }

describe('성능 예산 — 10,000항목 / 100,000자', () => {
  const N = 10_000
  const targets = Array.from({ length: N }, (_, i) => word(i, 6)) // 6만 자

  it('prepareItems: 10k 항목 × 5회 반복 셔플 < 300ms', () => {
    const t0 = performance.now()
    const out = prepareItems(targets, { kind: 'all' }, 'shuffle', 5)
    expect(performance.now() - t0).toBeLessThan(300)
    expect(out.length).toBe(N * 5)
  })

  it('FlashTimeline 생성(전 절대시각 산출): 10k 항목 < 100ms', () => {
    const items = targets.map((text, sourceIndex) => ({ text, sourceIndex }))
    const t0 = performance.now()
    const tl = new FlashTimeline(items, cfg, {
      onCountdown() {},
      onShow() {},
      onBlank() {},
      onProgress() {},
      onDone() {},
    })
    expect(performance.now() - t0).toBeLessThan(100)
    expect(tl.durations.length).toBe(N)
  })

  it('FlashTimeline 전체 진행 tick 스윕(10k 항목, 33ms 간격 프레임) < 500ms', () => {
    const items = targets.map((text, sourceIndex) => ({ text, sourceIndex }))
    let shows = 0
    const tl = new FlashTimeline(items, cfg, {
      onCountdown() {},
      onShow() {
        shows++
      },
      onBlank() {},
      onProgress() {},
      onDone() {},
    })
    const total = tl.practiceMs + 4000
    const t0 = performance.now()
    tl.start(0)
    for (let t = 0; t <= total && tl.running; t += 33) tl.tick(t)
    expect(performance.now() - t0).toBeLessThan(500)
    expect(shows).toBe(N)
  })

  it('computeFitSizes 사전 계산: 10k 항목 < 300ms (가짜 측정기)', () => {
    const m: MeasureFn = (t) => [...t].length * 100
    const t0 = performance.now()
    const out = computeFitSizes(targets, 1920, 1080, 'test', 1, m)
    expect(performance.now() - t0).toBeLessThan(300)
    expect(out.length).toBe(N)
  })

  it('countKeystrokes: 100,000자 < 1s', () => {
    const text = word(1, 100_000)
    const t0 = performance.now()
    const n = countKeystrokes(text)
    expect(performance.now() - t0).toBeLessThan(1000)
    expect(n).toBeGreaterThan(100_000) // 자모 분해로 글자수보다 많다
  })

  it('scoreSession 낱개: 10k 항목, 오타 10% 섞음, 자모 단위 < 3s', () => {
    const answers = targets.map((t, i) => (i % 10 === 0 ? t.slice(0, -1) + '흫' : t))
    const t0 = performance.now()
    const r = scoreSession({ mode: 'discrete', targets, answers, options: opts, elapsedMs: 600_000 })
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(r.items.length).toBe(N)
    expect(r.accuracy).toBeGreaterThan(0.9)
    expect(r.accuracy).toBeLessThan(1)
  })

  it('scoreSession 연속: 100,000자 입력 + 10k 경계 < 3s', () => {
    const fullText = targets.join('')
    const boundaries: number[] = []
    let acc = 0
    for (let i = 0; i < N - 1; i++) {
      acc += [...targets[i]].length
      boundaries.push(acc)
    }
    const t0 = performance.now()
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts, elapsedMs: 600_000 })
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(r.accuracy).toBe(1)
    expect(fullText.length).toBeGreaterThanOrEqual(60_000)
  })

  it('scoreSession: 한 항목이 통째로 밀린 경계(전부 오답)에도 시간 폭발 없음 < 5s', () => {
    // 최악: 경계가 모두 0 → 마지막 항목에 10만 자가 몰림 → 강등 가드 경로
    const fullText = targets.join('')
    const boundaries = new Array<number>(N - 1).fill(0)
    const t0 = performance.now()
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts, elapsedMs: 600_000 })
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(r.items.length).toBe(N)
  })
})
