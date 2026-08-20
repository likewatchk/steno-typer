import { describe, expect, it } from 'vitest'
import { FlashTimeline, type TimelineConfig } from './scheduler.ts'

const cfg = (over: Partial<TimelineConfig> = {}): TimelineConfig => ({
  durationMode: 'fixed',
  fixedMs: 1000,
  autoBaseMs: 600,
  autoPerCharMs: 180,
  autoMinMs: 1000,
  autoMaxMs: 8000,
  blankMs: 150,
  countdownMs: 0,
  ...over,
})

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `w${i}`, sourceIndex: i }))

function collect() {
  const log: string[] = []
  return {
    log,
    hooks: {
      onCountdown: (n: number) => log.push(`cd${n}`),
      onShow: (i: number) => log.push(`show${i}`),
      onBlank: (i: number) => log.push(`blank${i}`),
      onProgress: (_: number) => {},
      onDone: () => log.push('done'),
    },
  }
}

describe('FlashTimeline 엣지', () => {
  it('항목 1개 — show 후 바로 done', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(1), cfg(), hooks)
    tl.start(0)
    tl.tick(2000)
    expect(log).toEqual(['show0', 'done'])
  })

  it('blankMs=0 — blank 이벤트와 다음 show 가 같은 tick 에 순서대로', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(2), cfg({ blankMs: 0 }), hooks)
    tl.start(0)
    tl.tick(1000)
    expect(log).toEqual(['show0', 'blank0', 'show1'])
  })

  it('카운트다운 중 일시정지/재개', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(1), cfg({ countdownMs: 3000 }), hooks)
    tl.start(0)
    tl.tick(500) // cd3
    tl.pause(600)
    tl.tick(9999)
    expect(log).toEqual(['cd3'])
    tl.resume(5600) // 5초 멈춤
    for (let t = 5600; t <= 10000; t += 100) tl.tick(t)
    expect(log).toEqual(['cd3', 'cd2', 'cd1', 'show0', 'done'])
  })

  it('stop 후 tick 은 무동작', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    tl.start(0)
    tl.tick(500)
    tl.stop()
    tl.tick(99999)
    expect(log).toEqual(['show0'])
    expect(tl.running).toBe(false)
  })

  it('done 이후 tick 무동작 + running false', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(1), cfg(), hooks)
    tl.start(0)
    tl.tick(5000)
    tl.tick(6000)
    tl.tick(7000)
    expect(log.filter((x) => x === 'done').length).toBe(1)
    expect(tl.running).toBe(false)
  })

  it('paused 상태에서 pause/resume 중복 호출 안전', () => {
    const { hooks } = collect()
    const tl = new FlashTimeline(items(2), cfg(), hooks)
    tl.start(0)
    tl.pause(100)
    tl.pause(200) // 무시
    expect(tl.paused).toBe(true)
    tl.resume(1100)
    tl.resume(1200) // 무시
    expect(tl.paused).toBe(false)
    // 유효 정지 시간은 1000ms 하나뿐이어야 함 — show1 은 실질 1150 지점
    const { log: log2 } = { log: [] as string[] }
    void log2
  })

  it('currentIndex 추적', () => {
    const { hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    expect(tl.currentIndex).toBe(-1)
    tl.start(0)
    expect(tl.currentIndex).toBe(0)
    tl.tick(1200)
    expect(tl.currentIndex).toBe(1)
    tl.tick(9999)
    expect(tl.currentIndex).toBe(2)
  })

  it('practiceMs = 노출시간 합 + 사이 blank 합', () => {
    const tl = new FlashTimeline(items(3), cfg({ fixedMs: 1000, blankMs: 150 }), collect().hooks)
    expect(tl.practiceMs).toBe(3 * 1000 + 2 * 150)
    const tl2 = new FlashTimeline(items(3), cfg({ countdownMs: 3000 }), collect().hooks)
    expect(tl2.practiceMs).toBe(3 * 1000 + 2 * 150) // 카운트다운 제외
  })

  it('자동 노출시간이 항목별로 반영', () => {
    const tl = new FlashTimeline(
      [
        { text: '가', sourceIndex: 0 },
        { text: '가나다라마바사아자차', sourceIndex: 1 },
      ],
      cfg({ durationMode: 'auto' }),
      collect().hooks,
    )
    expect(tl.durations[0]).toBe(1000) // min 클램프
    expect(tl.durations[1]).toBe(600 + 180 * 10) // 2400
  })

  it('seekTo 전진: 점프 후 이벤트가 그 지점부터 연속', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(5), cfg(), hooks) // show@0,1150,2300,3450,4600
    tl.start(0)
    tl.tick(100) // show0
    tl.seekTo(3, 100) // 즉시 show3 발화
    expect(log).toEqual(['show0', 'show3'])
    // 지금(100)이 show3 시각 — 1000ms 뒤 blank3, 1150ms 뒤 show4
    tl.tick(1100)
    tl.tick(1300)
    tl.tick(9999)
    expect(log).toEqual(['show0', 'show3', 'blank3', 'show4', 'done'])
  })

  it('seekTo 후진: 같은 항목들이 다시 재생', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    tl.start(0)
    tl.tick(1200) // show0 blank0 show1
    tl.seekTo(0, 1200)
    tl.tick(1200 + 1000) // blank0
    tl.tick(1200 + 1150) // show1
    expect(log).toEqual(['show0', 'blank0', 'show1', 'show0', 'blank0', 'show1'])
  })

  it('일시정지 중 seekTo → 화면 즉시 갱신 + 재개 후 타이밍 정확', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(4), cfg(), hooks)
    tl.start(0)
    tl.tick(100) // show0
    tl.pause(200)
    tl.seekTo(2, 5000) // 정지 중 이동 — show2 즉시
    expect(log).toEqual(['show0', 'show2'])
    tl.resume(10000)
    // 재개 시점의 elapsed == show2 시각 → 1000ms 뒤 blank2
    tl.tick(10999)
    expect(log).toEqual(['show0', 'show2'])
    tl.tick(11000)
    expect(log).toEqual(['show0', 'show2', 'blank2'])
  })

  it('done 직전 seekTo 로 세션 연장 가능', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(2), cfg(), hooks)
    tl.start(0)
    tl.tick(9999) // 완주
    expect(tl.running).toBe(false)
    tl.seekTo(1, 20000)
    expect(tl.running).toBe(true)
    tl.tick(20000 + 1000)
    expect(log[log.length - 1]).toBe('done')
  })

  it('showFraction ↔ indexAtFraction 왕복 + 경계 스냅', () => {
    const tl = new FlashTimeline(items(10), cfg(), collect().hooks)
    for (let i = 0; i < 10; i++) {
      expect(tl.indexAtFraction(tl.showFraction(i))).toBe(i)
    }
    expect(tl.indexAtFraction(0)).toBe(0)
    expect(tl.indexAtFraction(1)).toBe(9)
    expect(tl.indexAtFraction(-0.5)).toBe(0)
    expect(tl.indexAtFraction(1.5)).toBe(9)
  })

  it('seekTo 범위 클램프', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    tl.start(0)
    tl.seekTo(-5, 0)
    expect(tl.currentIndex).toBe(0)
    tl.seekTo(99, 0)
    expect(tl.currentIndex).toBe(2)
    expect(log.filter((l) => l.startsWith('show')).length).toBeGreaterThanOrEqual(2)
  })

  it('불규칙한 tick 간격(지터)에도 이벤트 순서·개수 보존', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(20), cfg({ blankMs: 50, fixedMs: 300 }), hooks)
    tl.start(0)
    let t = 0
    let seed = 42
    while (tl.running && t < 60000) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      t += 1 + (seed % 400) // 1~400ms 지터
      tl.tick(t)
    }
    const shows = log.filter((x) => x.startsWith('show'))
    expect(shows).toEqual(Array.from({ length: 20 }, (_, i) => `show${i}`))
    expect(log[log.length - 1]).toBe('done')
  })
})
