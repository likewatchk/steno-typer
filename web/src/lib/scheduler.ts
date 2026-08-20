/**
 * 깜빡이 타임라인 엔진 — 순수 tick 구동.
 *
 * 세션 시작 시 모든 전환의 절대시각을 미리 산출하고, tick(now)은
 * "지금이 다음 전환시각을 지났으면 이벤트 발화"만 한다.
 * setInterval 드리프트가 원천적으로 없고, rAF 는 바깥(러너)에서 붙인다.
 * 루프 경로에 힙 할당 없음 — 이벤트 배열은 시작 시 1회 생성.
 */
import { toWordItem, type EngineItem, type RangeSpec, type Settings, type WordInput } from './types.ts'

export type { EngineItem }

export interface TimelineConfig {
  durationMode: 'auto' | 'fixed'
  fixedMs: number
  autoBaseMs: number
  autoPerCharMs: number
  autoMinMs: number
  autoMaxMs: number
  /** 자동 노출시간 배속 — 시간 = 공식값 ÷ 배속. 미지정 시 1 */
  autoSpeed?: number
  blankMs: number
  countdownMs: number // 0 이면 카운트다운 없음
}

export interface TimelineHooks {
  /** 카운트다운 숫자 표시 (3 → 2 → 1) */
  onCountdown(remaining: number): void
  /** i번째 항목 표시 시점 */
  onShow(index: number): void
  /** i번째 항목 깜빡(소등) 시점 */
  onBlank(index: number): void
  /** 매 tick 진행률 0~1 */
  onProgress(frac: number): void
  onDone(): void
}

type Ev = { t: number; kind: 0 | 1 | 2 | 3; index: number } // 0=countdown 1=show 2=blank 3=done

export function computeDuration(text: string, cfg: TimelineConfig): number {
  if (cfg.durationMode === 'fixed') return cfg.fixedMs
  const chars = [...text].length
  const speed = Math.min(2, Math.max(0.5, cfg.autoSpeed ?? 1))
  const ms = (cfg.autoBaseMs + cfg.autoPerCharMs * chars) / speed
  return Math.round(Math.min(cfg.autoMaxMs, Math.max(cfg.autoMinMs, ms)))
}

export class FlashTimeline {
  private events: Ev[] = []
  private ptr = 0
  private startWall = 0
  private pausedTotal = 0
  private pauseStartedWall = 0
  private _paused = false
  private _running = false
  private practiceStart = 0
  private practiceTotal = 1
  /** 항목별 show 절대시각·이벤트 인덱스 — 시킹/진행바 매핑용 (생성 시 1회 산출) */
  private showTimes: number[] = []
  private showEventIdx: number[] = []
  readonly durations: number[]

  constructor(
    readonly items: EngineItem[],
    cfg: TimelineConfig,
    private hooks: TimelineHooks,
  ) {
    this.durations = items.map((it) => computeDuration(it.text, cfg))
    let t = 0
    if (cfg.countdownMs > 0) {
      const secs = Math.ceil(cfg.countdownMs / 1000)
      for (let k = secs; k >= 1; k--) {
        this.events.push({ t: (secs - k) * 1000, kind: 0, index: k })
      }
      t = cfg.countdownMs
    }
    this.practiceStart = t
    for (let i = 0; i < items.length; i++) {
      this.showTimes.push(t)
      this.showEventIdx.push(this.events.length)
      this.events.push({ t, kind: 1, index: i })
      t += this.durations[i]
      if (i < items.length - 1) {
        this.events.push({ t, kind: 2, index: i })
        t += cfg.blankMs
      }
    }
    this.events.push({ t, kind: 3, index: items.length })
    this.practiceTotal = Math.max(1, t - this.practiceStart)
  }

  get running(): boolean {
    return this._running
  }

  /** 카운트다운 제외 총 연습 시간 (일시정지 무관 — 타임라인은 고정 길이) */
  get practiceMs(): number {
    return this.practiceTotal
  }

  get itemCount(): number {
    return this.items.length
  }

  /** 항목 → 진행률 (진행바 핸들 위치) */
  showFraction(index: number): number {
    const i = Math.max(0, Math.min(index, this.items.length - 1))
    const f = (this.showTimes[i] - this.practiceStart) / this.practiceTotal
    return f < 0 ? 0 : f > 1 ? 1 : f
  }

  /** 진행률 → 가장 가까운 항목 (진행바 스크럽 → 항목 스냅) */
  indexAtFraction(frac: number): number {
    const target = this.practiceStart + Math.max(0, Math.min(1, frac)) * this.practiceTotal
    // showTimes 는 오름차순 — target 이하의 마지막 항목을 이진탐색
    let lo = 0
    let hi = this.showTimes.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (this.showTimes[mid] <= target) lo = mid
      else hi = mid - 1
    }
    // 다음 항목 쪽이 더 가까우면 스냅
    if (lo < this.showTimes.length - 1 && this.showTimes[lo + 1] - target < target - this.showTimes[lo]) {
      return lo + 1
    }
    return lo
  }

  /**
   * k번째 항목의 show 시각으로 점프. 일시정지 중에도 동작하며 onShow/onProgress 를
   * 즉시 발화해 화면을 갱신한다 (paused 면 tick 이 돌지 않으므로).
   * 기준시각 재계산: 재개(또는 지금) 시점의 elapsed 가 정확히 그 항목의 show 시각이 되도록.
   */
  seekTo(index: number, now: number): void {
    if (this.items.length === 0) return
    const i = Math.max(0, Math.min(index, this.items.length - 1))
    const t = this.showTimes[i]
    const anchor = this._paused ? this.pauseStartedWall : now
    this.startWall = anchor - this.pausedTotal - t
    this.ptr = this.showEventIdx[i] + 1 // show 는 아래에서 직접 발화
    this._running = true // 완료 직전/직후에도 재개 가능
    this.currentIndex = i
    this.hooks.onShow(i)
    this.hooks.onProgress(this.showFraction(i))
  }

  get paused(): boolean {
    return this._paused
  }

  /** 진행 중인 항목의 인덱스 (아직 시작 전이면 -1) */
  currentIndex = -1

  start(now: number): void {
    this.startWall = now
    this._running = true
    this.tick(now)
  }

  pause(now: number): void {
    if (!this._running || this._paused) return
    this._paused = true
    this.pauseStartedWall = now
  }

  resume(now: number): void {
    if (!this._running || !this._paused) return
    this._paused = false
    this.pausedTotal += now - this.pauseStartedWall
  }

  stop(): void {
    this._running = false
  }

  /** 러너(rAF 또는 테스트)가 주기적으로 호출 */
  tick(now: number): void {
    if (!this._running || this._paused) return
    const elapsed = now - this.startWall - this.pausedTotal
    while (this.ptr < this.events.length && this.events[this.ptr].t <= elapsed) {
      const ev = this.events[this.ptr++]
      if (ev.kind === 0) this.hooks.onCountdown(ev.index)
      else if (ev.kind === 1) {
        this.currentIndex = ev.index
        this.hooks.onShow(ev.index)
      } else if (ev.kind === 2) this.hooks.onBlank(ev.index)
      else {
        this._running = false
        this.hooks.onProgress(1)
        this.hooks.onDone()
        return
      }
    }
    const frac = (elapsed - this.practiceStart) / this.practiceTotal
    this.hooks.onProgress(frac < 0 ? 0 : frac > 1 ? 1 : frac)
  }
}

// ---------- 세션 항목 준비 ----------

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

/** 범위 → 반복 → 순서 적용. 반복이 셔플과 결합되면 회차마다 독립 셔플. */
export function prepareItems(
  items: WordInput[],
  range: RangeSpec,
  order: Settings['order'],
  repeat: number,
): EngineItem[] {
  let picked: EngineItem[] = items.map((raw, sourceIndex) => {
    const it = toWordItem(raw)
    return it.h ? { text: it.t, hint: it.h, sourceIndex } : { text: it.t, sourceIndex }
  })
  if (range.kind === 'span') {
    const from = Math.max(1, Math.min(range.from, items.length))
    const to = Math.max(from, Math.min(range.to, items.length))
    picked = picked.slice(from - 1, to)
  } else if (range.kind === 'random') {
    const n = Math.max(1, Math.min(range.n, picked.length))
    picked = shuffleInPlace([...picked]).slice(0, n)
  }
  const reps = Math.max(1, Math.min(99, Math.floor(repeat)))
  const out: EngineItem[] = []
  for (let r = 0; r < reps; r++) {
    const block = [...picked]
    if (order === 'shuffle') shuffleInPlace(block)
    out.push(...block)
  }
  return out
}
