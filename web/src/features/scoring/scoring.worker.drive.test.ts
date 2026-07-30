/**
 * 워커 모듈 자체를 self 심으로 구동 — 프로토콜 왕복 회귀 테스트.
 * (jsdom 에는 Worker 가 없어 vitest 로는 이 방식이 실제 워커 코드를 커버하는 유일한 길)
 */
import { beforeAll, describe, expect, it } from 'vitest'
import type { ScoringOptions } from '../../lib/types.ts'
import type { WorkerIn, WorkerOut } from './scoring.worker.ts'

const replies: WorkerOut[] = []
let handler: ((e: MessageEvent<WorkerIn>) => void) | null = null

beforeAll(async () => {
  ;(globalThis as Record<string, unknown>).self = {
    set onmessage(fn: typeof handler) {
      handler = fn
    },
    postMessage: (m: WorkerOut) => replies.push(m),
  }
  await import('./scoring.worker.ts')
})

function send(data: WorkerIn): void {
  handler?.({ data } as MessageEvent<WorkerIn>)
}

const options: ScoringOptions = {
  ignoreSpace: true,
  ignorePunct: false,
  unit: 'syllable',
  inputStyle: 'continuous',
  profile: 'custom',
}
const targets = ['불빛', '비누', '사랑', '사진', '산길', '새벽']

describe('scoring.worker 프로토콜 왕복', () => {
  it('연속 + 실시간: step 마다 live, final 에 최종 결과', () => {
    replies.length = 0
    send({ kind: 'live-init', targets, options })
    send({ kind: 'live-step', fullText: '불', boundaries: [1], uptoItem: 0, elapsedMs: 2000 })
    send({ kind: 'live-step', fullText: '불빛비누사랑사', boundaries: [1, 3, 5, 7], uptoItem: 3, elapsedMs: 8000 })
    send({ kind: 'live-final', fullText: '불빛비누사랑사진산길새벽', boundaries: [1, 3, 5, 7, 9], elapsedMs: 12000 })

    expect(replies.map((r) => r.kind)).toEqual(['live', 'live', 'final'])
    const final = replies[2]
    if (final.kind !== 'final') throw new Error('unreachable')
    expect(final.result.accuracy).toBe(1)
    expect(final.result.items.length).toBe(6)
    expect(final.result.typedText).toBe('불빛비누사랑사진산길새벽')
  })

  it('낱개 + 실시간: discrete-step 누계 + batch 최종', () => {
    replies.length = 0
    const dOpts: ScoringOptions = { ...options, inputStyle: 'discrete' }
    send({ kind: 'live-discrete-init', options: dOpts })
    send({ kind: 'live-discrete-step', target: '불빛', answer: '불빛', elapsedMs: 2000 })
    send({ kind: 'live-discrete-step', target: '비누', answer: '비니', elapsedMs: 4000 })
    send({
      kind: 'batch',
      req: { mode: 'discrete', targets: ['불빛', '비누'], answers: ['불빛', '비니'], options: dOpts, elapsedMs: 5000 },
    })

    expect(replies.map((r) => r.kind)).toEqual(['live', 'live', 'batch'])
    const live2 = replies[1]
    if (live2.kind !== 'live') throw new Error('unreachable')
    expect(live2.accuracy).toBeCloseTo(3 / 4) // 4음절 중 3
    const batch = replies[2]
    if (batch.kind !== 'batch') throw new Error('unreachable')
    expect(batch.result.accuracy).toBeCloseTo(3 / 4)
    expect(batch.result.typedText).toBe('불빛\n비니')
  })

  it('실시간 없이 batch 단독 (연속)', () => {
    replies.length = 0
    send({
      kind: 'batch',
      req: {
        mode: 'continuous',
        targets,
        fullText: '불빛비누사랑사진산길새벽',
        boundaries: [1, 3, 5, 7, 9],
        options,
        elapsedMs: 12000,
      },
    })
    expect(replies.length).toBe(1)
    const only = replies[0]
    if (only.kind !== 'batch') throw new Error('unreachable')
    expect(only.result.accuracy).toBe(1)
  })

  it('공인시험 프로필도 워커 경유로 동일 동작', () => {
    replies.length = 0
    send({
      kind: 'batch',
      req: {
        mode: 'discrete',
        targets: ['안녕 하세요.'],
        answers: ['안녕하세요'],
        options: { ...options, inputStyle: 'discrete', profile: 'exam' },
        elapsedMs: 5000,
      },
    })
    const only = replies[0]
    if (only.kind !== 'batch') throw new Error('unreachable')
    expect(only.result.accuracy).toBe(1)
  })
})
