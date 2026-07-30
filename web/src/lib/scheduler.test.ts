import { describe, expect, it } from 'vitest'
import { FlashTimeline, computeDuration, prepareItems, type TimelineConfig } from './scheduler.ts'

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

const items = (n: number) => Array.from({ length: n }, (_, i) => ({ text: `w${i}`, sourceIndex: i }))

describe('computeDuration', () => {
  it('고정 모드', () => {
    expect(computeDuration('아무거나', cfg())).toBe(1000)
  })
  it('자동 모드 = clamp(base + perChar×글자수)', () => {
    const c = cfg({ durationMode: 'auto' })
    expect(computeDuration('가나다', c)).toBe(600 + 180 * 3 < 1000 ? 1000 : 600 + 180 * 3) // 1140
    expect(computeDuration('가', c)).toBe(1000) // min 클램프
    expect(computeDuration('가'.repeat(100), c)).toBe(8000) // max 클램프
  })
})

describe('FlashTimeline', () => {
  it('이벤트 순서: show→blank→…→마지막 show→done (마지막 blank 없음)', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    tl.start(0)
    for (let t = 0; t <= 5000; t += 50) tl.tick(t)
    expect(log).toEqual(['show0', 'blank0', 'show1', 'blank1', 'show2', 'done'])
  })

  it('전환 시각이 절대시각 기준 (드리프트 없음): tick 이 성기게 와도 이벤트 누락 없음', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(3), cfg(), hooks)
    tl.start(0)
    tl.tick(4999) // 한참 뒤 한 번만 tick — 밀린 이벤트 전부 발화
    expect(log).toEqual(['show0', 'blank0', 'show1', 'blank1', 'show2', 'done'])
  })

  it('카운트다운 3→2→1 후 시작', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(1), cfg({ countdownMs: 3000 }), hooks)
    tl.start(0)
    for (let t = 0; t <= 4100; t += 100) tl.tick(t)
    expect(log).toEqual(['cd3', 'cd2', 'cd1', 'show0', 'done'])
  })

  it('일시정지 시간은 타임라인에서 제외', () => {
    const { log, hooks } = collect()
    const tl = new FlashTimeline(items(2), cfg(), hooks)
    tl.start(0)
    tl.tick(500) // show0
    tl.pause(600)
    tl.tick(5000) // 정지 중 — 아무 일 없음
    expect(log).toEqual(['show0'])
    tl.resume(10600) // 10초 정지
    for (let t = 10600; t <= 13000; t += 50) tl.tick(t)
    // 실질 경과: blank0@1000 → show1@1150 → done@2150 (벽시계로는 +10000)
    expect(log).toEqual(['show0', 'blank0', 'show1', 'done'])
  })

  it('진행률은 0~1 로 클램프', () => {
    let last = -1
    const tl = new FlashTimeline(items(2), cfg({ countdownMs: 3000 }), {
      onCountdown() {},
      onShow() {},
      onBlank() {},
      onProgress(f) {
        expect(f).toBeGreaterThanOrEqual(0)
        expect(f).toBeLessThanOrEqual(1)
        expect(f).toBeGreaterThanOrEqual(last) // 단조 증가
        last = f
      },
      onDone() {},
    })
    tl.start(0)
    for (let t = 0; t <= 6000; t += 33) tl.tick(t)
    expect(last).toBe(1)
  })
})

describe('prepareItems', () => {
  const src = ['가', '나', '다', '라', '마']

  it('전체 + 순차 + 1회', () => {
    const out = prepareItems(src, { kind: 'all' }, 'seq', 1)
    expect(out.map((x) => x.text)).toEqual(src)
    expect(out.map((x) => x.sourceIndex)).toEqual([0, 1, 2, 3, 4])
  })

  it('구간 (1-기반, 양끝 포함)', () => {
    const out = prepareItems(src, { kind: 'span', from: 2, to: 4 }, 'seq', 1)
    expect(out.map((x) => x.text)).toEqual(['나', '다', '라'])
    expect(out.map((x) => x.sourceIndex)).toEqual([1, 2, 3])
  })

  it('랜덤 N — 중복 없이 N개', () => {
    const out = prepareItems(src, { kind: 'random', n: 3 }, 'seq', 1)
    expect(out.length).toBe(3)
    expect(new Set(out.map((x) => x.sourceIndex)).size).toBe(3)
  })

  it('반복 — 회차 단위로 이어붙음', () => {
    const out = prepareItems(src, { kind: 'span', from: 1, to: 2 }, 'seq', 3)
    expect(out.map((x) => x.text)).toEqual(['가', '나', '가', '나', '가', '나'])
  })

  it('셔플 반복 — 각 회차는 전체 항목을 포함', () => {
    const out = prepareItems(src, { kind: 'all' }, 'shuffle', 2)
    expect(out.length).toBe(10)
    const first = out.slice(0, 5).map((x) => x.sourceIndex)
    const second = out.slice(5).map((x) => x.sourceIndex)
    expect(new Set(first).size).toBe(5)
    expect(new Set(second).size).toBe(5)
  })

  it('범위가 목록보다 커도 안전', () => {
    const out = prepareItems(src, { kind: 'span', from: 3, to: 99 }, 'seq', 1)
    expect(out.map((x) => x.text)).toEqual(['다', '라', '마'])
    const rnd = prepareItems(src, { kind: 'random', n: 99 }, 'seq', 1)
    expect(rnd.length).toBe(5)
  })
})
