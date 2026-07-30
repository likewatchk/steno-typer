import { describe, expect, it } from 'vitest'
import { MAX_PX, MIN_PX, MIN_SINGLE_PX, computeFitSizes, type MeasureFn } from './fit.ts'

// 가짜 측정기: 100px 기준 글자당 100px (정사각 글꼴 가정)
const squareMeasure: MeasureFn = (text) => [...text].length * 100

const BOX_W = 1000 // availW = 900
const BOX_H = 800 // availH = 480

function fit(texts: string[], scale = 1) {
  return computeFitSizes(texts, BOX_W, BOX_H, 'test', scale, squareMeasure)
}

describe('computeFitSizes — 한 줄 모드', () => {
  it('짧은 낱말은 MAX_PX 로 캡', () => {
    const [r] = fit(['가나']) // single = 900/200*100 = 450 → cap 200
    expect(r).toEqual({ px: MAX_PX, wrap: false })
  })

  it('길이에 따라 폭에 맞춰 줄어든다', () => {
    const [r] = fit(['가나다라마바']) // 6자 → single = 150
    expect(r.wrap).toBe(false)
    expect(r.px).toBe(150)
  })

  it('폭 fit 크기가 MIN_SINGLE_PX 이상이면 한 줄 유지', () => {
    // 16자 → single = 56.25 ≥ 56
    const [r] = fit(['가'.repeat(16)])
    expect(r.wrap).toBe(false)
    expect(r.px).toBe(56)
  })
})

describe('computeFitSizes — 줄바꿈 모드', () => {
  it('한 줄 크기가 임계 미만이면 줄바꿈 전환', () => {
    const [r] = fit(['가'.repeat(17)]) // single ≈ 52.9 < 56
    expect(r.wrap).toBe(true)
    expect(r.px).toBeGreaterThanOrEqual(MIN_PX)
    expect(r.px).toBeLessThanOrEqual(MIN_SINGLE_PX)
  })

  it('긴 문장도 세로 안에 들어가는 크기를 찾는다', () => {
    const [r] = fit(['가'.repeat(200)])
    expect(r.wrap).toBe(true)
    const lines = Math.ceil((200 * r.px) / 900)
    expect(lines * r.px * 1.35).toBeLessThanOrEqual(480 + r.px * 1.35) // 탐색 스텝 여유
    expect(r.px).toBeGreaterThanOrEqual(MIN_PX)
  })

  it('극단적으로 길어도 MIN_PX 바닥', () => {
    const [r] = fit(['가'.repeat(5000)])
    expect(r.px).toBe(MIN_PX)
    expect(r.wrap).toBe(true)
  })
})

describe('computeFitSizes — 사용자 배율', () => {
  it('축소 배율은 한 줄 크기를 줄인다', () => {
    const [base] = fit(['가나'])
    const [half] = fit(['가나'], 0.5)
    expect(half.px).toBe(Math.round(MAX_PX * 0.5))
    expect(half.px).toBeLessThan(base.px)
  })

  it('확대 배율은 폭 한계까지만 커진다', () => {
    const [r] = fit(['가나다라마바'], 1.5) // single=150 < 200*1.5=300 → 150 유지
    expect(r.px).toBe(150)
    const [short] = fit(['가'], 1.5) // single=900 → target 300
    expect(short.px).toBe(300)
  })

  it('줄바꿈 모드에서 확대는 무시(세로 fit 보호), 축소만 반영', () => {
    const [base] = fit(['가'.repeat(30)])
    const [up] = fit(['가'.repeat(30)], 1.5)
    const [down] = fit(['가'.repeat(30)], 0.5)
    expect(up.px).toBe(base.px)
    expect(down.px).toBe(Math.max(MIN_PX, Math.round(base.px * 0.5)))
  })

  it('배율은 0.5~1.5 로 클램프', () => {
    const [r] = fit(['가'], 99)
    expect(r.px).toBe(MAX_PX * 1.5)
  })
})

describe('computeFitSizes — 캐시', () => {
  it('동일 텍스트는 측정 1회', () => {
    let calls = 0
    const counting: MeasureFn = (t) => {
      calls++
      return [...t].length * 100
    }
    computeFitSizes(['가', '가', '가', '나'], BOX_W, BOX_H, 'test', 1, counting)
    expect(calls).toBe(2)
  })
})
