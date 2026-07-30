/**
 * 항목별 표시 폰트 크기 사전 계산.
 * 세션 시작 시 canvas measureText 로 전 항목을 한 번에 산출해 두므로
 * 연습 런 중에는 DOM 측정(레이아웃)이 전혀 없다.
 */

export interface FitResult {
  px: number
  /** true 면 한 줄로는 너무 길어 줄바꿈 표시 */
  wrap: boolean
}

export const MAX_PX = 200
export const MIN_SINGLE_PX = 56 // 이보다 작아지면 줄바꿈 모드로 전환
export const MIN_PX = 28
const LINE_HEIGHT = 1.35

/** 100px 기준 텍스트 폭 측정 함수 — 테스트에서 주입 가능 */
export type MeasureFn = (text: string) => number

let ctx: CanvasRenderingContext2D | null = null

function canvasMeasure(fontFamily: string): MeasureFn {
  return (text) => {
    if (!ctx) {
      ctx = document.createElement('canvas').getContext('2d')
      if (!ctx) return text.length * 100 // 극단적 폴백: 글자폭≈크기
    }
    ctx.font = `700 100px ${fontFamily}`
    return ctx.measureText(text).width || 1
  }
}

/**
 * @param scale 사용자 글자 크기 배율 (0.5~1.5).
 *   한 줄 모드: 목표 크기(MAX_PX×scale)를 키우되 화면 폭 초과는 불가.
 *   줄바꿈 모드: 축소만 허용 (확대는 세로 fit 을 깨뜨린다).
 */
export function computeFitSizes(
  texts: string[],
  boxW: number,
  boxH: number,
  fontFamily: string,
  scale = 1,
  measure: MeasureFn = canvasMeasure(fontFamily),
): FitResult[] {
  const availW = Math.max(1, boxW * 0.9)
  const availH = Math.max(1, boxH * 0.6)
  const clampedScale = Math.min(1.5, Math.max(0.5, scale))
  const cache = new Map<string, FitResult>()
  return texts.map((text) => {
    const hit = cache.get(text)
    if (hit) return hit
    const w100 = Math.max(1, measure(text))
    const single = (availW / w100) * 100
    let result: FitResult
    if (single >= MIN_SINGLE_PX) {
      const target = Math.round(MAX_PX * clampedScale)
      result = { px: Math.max(MIN_PX, Math.min(target, Math.floor(single))), wrap: false }
    } else {
      // 줄바꿈 모드: 예상 줄수 × 줄높이가 세로에 들어가는 최대 크기를 탐색
      let px = MIN_SINGLE_PX
      while (px > MIN_PX) {
        const lines = Math.ceil((w100 * px) / 100 / availW)
        if (lines * px * LINE_HEIGHT <= availH) break
        px -= 2
      }
      const shrink = Math.min(1, clampedScale)
      result = { px: Math.max(MIN_PX, Math.round(px * shrink)), wrap: true }
    }
    cache.set(text, result)
    return result
  })
}
