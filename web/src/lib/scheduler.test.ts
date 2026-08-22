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

  it('무제한 모드 — 항목당 하루 (자동 전환 사실상 없음)', () => {
    expect(computeDuration('가나다', cfg({ durationMode: 'untimed' }))).toBe(86_400_000)
  })

  it('저속 배속 — 하한 0.2 클램프 + 느린 쪽에선 최대시간 상한도 확장', () => {
    // 100글자: 공식값 18600ms → 0.2배속 = 93000, 상한 8000/0.2=40000 에 클램프
    expect(computeDuration('가'.repeat(100), cfg({ durationMode: 'auto', autoSpeed: 0.2 }))).toBe(40000)
    // 하한 클램프: 0.05 → 0.2 와 동일
    expect(computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 0.05 }))).toBe(
      computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 0.2 })),
    )
    // 빠른 쪽 상한은 그대로 8000
    expect(computeDuration('가'.repeat(100), cfg({ durationMode: 'auto', autoSpeed: 1.5 }))).toBe(8000)
  })

  it('elapsedMs — 일시정지 제외 실경과 (무제한 KPM 용)', () => {
    const tl = new FlashTimeline(items(2), cfg({ durationMode: 'untimed' }), {
      onCountdown() {},
      onShow() {},
      onBlank() {},
      onProgress() {},
      onDone() {},
    })
    tl.start(0)
    expect(tl.elapsedMs(500)).toBe(500)
    tl.pause(600)
    expect(tl.elapsedMs(9999)).toBe(600)
    tl.resume(2000)
    expect(tl.elapsedMs(2500)).toBe(1100)
    // seekTo 는 타임라인 시각만 옮기고 실경과는 왜곡하지 않는다
    tl.seekTo(1, 2500)
    expect(tl.elapsedMs(3000)).toBe(1600)
  })

  it('배속(autoSpeed) — 시간 = 공식값 ÷ 배속, 클램프는 배속 후 적용', () => {
    const base = cfg({ durationMode: 'auto' })
    expect(computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 1 }))).toBe(1500)
    expect(computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 1.5 }))).toBe(1000)
    expect(computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 0.5 }))).toBe(3000)
    // 빨라져도 최소시간 밑으로는 안 내려감
    expect(computeDuration('가', cfg({ durationMode: 'auto', autoSpeed: 2 }))).toBe(1000)
    // 범위 밖 배속은 0.5~2 로 클램프
    expect(computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 99 }))).toBe(
      computeDuration('가나다라마', cfg({ durationMode: 'auto', autoSpeed: 2 })),
    )
    // 미지정 = 1배속
    expect(computeDuration('가나다라마', base)).toBe(1500)
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
