/**
 * 연속 모드 지연 허용 정합 — 실사용에서 발견된 "반 박자 늦게 치기" 버그의 회귀 테스트.
 * (사용자 세션: 51번부터 '빛ㅅ'/'비누사'/'랑사진산' 같은 옆 항목 귀속 연쇄가 발생했음)
 */
import { describe, expect, it } from 'vitest'
import type { ScoringOptions } from '../../lib/types.ts'
import { normalizeText } from './normalize.ts'
import { ContinuousScorer, bestCut, normalizeWithMap, scoreSession } from './score.ts'

const opts = (over: Partial<ScoringOptions> = {}): ScoringOptions => ({
  ignoreSpace: true,
  ignorePunct: false,
  unit: 'syllable',
  inputStyle: 'continuous',
  ...over,
})

describe('normalizeWithMap — normalizeText 와 동일 결과 + 위치 매핑', () => {
  const samples = [
    '안녕 하세요',
    '  연속   공백\n줄바꿈  ',
    '문장부호, 있음! (괄호)…',
    '간'.normalize('NFD') + ' 조합',
    '가나다',
    '',
  ]
  for (const ignoreSpace of [true, false]) {
    for (const ignorePunct of [true, false]) {
      it(`동일성 ignoreSpace=${ignoreSpace} ignorePunct=${ignorePunct}`, () => {
        const o = opts({ ignoreSpace, ignorePunct })
        for (const s of samples) {
          expect(normalizeWithMap(s, o).text).toBe(normalizeText(s, o))
        }
      })
    }
  }

  it('매핑은 단조 증가하며 경계를 정규화 공간으로 옮긴다', () => {
    const o = opts({ ignoreSpace: true })
    const { text, toNorm } = normalizeWithMap('가 나 다', o)
    expect(text).toBe('가나다')
    expect(toNorm[0]).toBe(0) // '가' 앞
    expect(toNorm[2]).toBe(1) // '나' 앞 (공백 하나 제거됨)
    expect(toNorm[4]).toBe(2) // '다' 앞
    for (let i = 1; i < toNorm.length; i++) expect(toNorm[i]).toBeGreaterThanOrEqual(toNorm[i - 1])
  })
})

describe('bestCut (자유 선두 정합)', () => {
  it('정확히 앞에 있으면 그 길이만 소비', () => {
    expect(bestCut([...'불빛'], [...'불빛비누사'])).toEqual([2, 0])
  })
  it('선두 잔해를 건너뛰고 매칭 (잔해도 소비에 포함)', () => {
    const [j, d] = bestCut([...'바바'], [...'ㅁㅁㅁ바바자'])
    expect(j).toBe(5)
    expect(d).toBe(0)
  })
  it('없으면 소비 0 (누락 처리)', () => {
    const [j] = bestCut([...'다라'], [...'마바'])
    expect(j).toBe(0)
  })
  it('같은 낱말 반복 스트림에선 첫 번째 것만 소비 (동률 최소 j)', () => {
    const [j, d] = bestCut([...'불빛'], [...'불빛불빛'])
    expect(j).toBe(2)
    expect(d).toBe(0)
  })
  it('오타 1개 포함 매칭이 통째 누락보다 우선', () => {
    const [j, d] = bestCut([...'산길'], [...'산김새벽'])
    expect(j).toBe(2)
    expect(d).toBe(1)
  })
})

describe('반 박자 지연 스트림 (실사용 버그 재현)', () => {
  it('전 항목을 맞게 쳤으면 지연이 있어도 정확도 1', () => {
    // 항목 전환 순간엔 이전 항목 일부만 입력돼 있던 상황
    const targets = ['불빛', '비누', '사랑', '사진', '산길', '새벽']
    const fullText = '불빛비누사랑사진산길새벽'
    const boundaries = [1, 3, 5, 7, 9] // "불"|"빛비"|"누사"|"랑사"|"진산"|나머지
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts(), elapsedMs: 60000 })
    expect(r.accuracy).toBe(1)
    expect(r.items.map((it) => it.input)).toEqual(targets)
  })

  it('두 항목 분량까지 늦어도 복원 (LAG 내)', () => {
    const targets = ['가방', '나비', '다리', '라면']
    const fullText = '가방나비다리라면'
    const boundaries = [0, 2, 4] // 두 항목 뒤처짐
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts(), elapsedMs: 60000 })
    expect(r.accuracy).toBe(1)
  })
})

describe('누락·잔해 격리', () => {
  it('한 항목을 통째로 건너뛰어도 그 항목만 0점, 이후는 정상', () => {
    const targets = ['가나', '다라', '마바']
    const fullText = '가나마바' // 다라 를 안 침
    const boundaries = [2, 2]
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts(), elapsedMs: 60000 })
    expect(r.items[0].errors).toBe(0)
    expect(r.items[1].deleted).toBe(2) // 누락
    expect(r.items[1].input).toBe('')
    expect(r.items[2].errors).toBe(0) // ← 연쇄 오염 없음
  })

  it('짧은 오타 잔해는 해당 항목의 삽입으로 흡수되고 매칭은 유지', () => {
    const targets = ['아아', '바바', '자자']
    const fullText = '아아ㅁㅁㅁ바바자자'
    const boundaries = [2, 7]
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts(), elapsedMs: 60000 })
    expect(r.items[0].errors).toBe(0)
    expect(r.items[1].correct).toBe(2) // 바바 매칭 유지
    expect(r.items[1].inserted).toBe(3) // 잔해는 삽입으로
    expect(r.items[2].errors).toBe(0)
    expect(r.accuracy).toBe(1) // 정확도 = 목표 단위 기준 (삽입은 오류 수에만)
  })

  it('긴 쓰레기 버스트 후에도 경계 재정박으로 이후 항목 복구', () => {
    const targets = ['아아', '바바', '자자', '카카', '타타']
    const garbage = 'ㄱ'.repeat(60)
    const fullText = '아아바바' + garbage + '자자카카타타'
    const boundaries = [2, 4, 4 + 60 + 2, 4 + 60 + 4]
    const r = scoreSession({ mode: 'continuous', targets, fullText, boundaries, options: opts(), elapsedMs: 60000 })
    expect(r.items[0].errors).toBe(0)
    expect(r.items[1].errors).toBe(0)
    // 쓰레기 한복판 항목 하나는 잃을 수 있지만 (윈도 밖), 마지막 항목들은 복구돼야 한다
    expect(r.items[3].correct + r.items[4].correct).toBeGreaterThanOrEqual(3)
    expect(r.items[4].correct).toBe(2)
  })
})

describe('실시간(증분) == 배치 동등성', () => {
  it('항목 전환마다 step 해도 최종 결과가 배치 finalize 와 동일', () => {
    const targets = ['불빛', '비누', '사랑', '사진', '산길', '새벽', '생각', '서점']
    const full = '불빛비누사랑사진산길새벽생각서점'
    // 지연 시뮬레이션: 전환 시점 입력 길이 = 실제보다 1~2 뒤
    const boundaries = [1, 3, 6, 7, 10, 11, 13]
    const o = opts()

    // 배치
    const batch = new ContinuousScorer(targets, o).finalize(full, boundaries)

    // 증분: 전환마다 그 시점까지의 입력만 보이는 상태로 step
    const inc = new ContinuousScorer(targets, o)
    for (let i = 1; i < targets.length; i++) {
      const visible = full.slice(0, boundaries[i - 1] ?? full.length)
      inc.step(visible, boundaries.slice(0, i), i - 1)
    }
    const incItems = inc.finalize(full, boundaries)

    expect(incItems).toEqual(batch)
  })

  it('runningTotals 는 확정 항목 누계와 일치 (O(1) 캐시)', () => {
    const targets = ['가나', '다라', '마바', '사아']
    const full = '가나다라마바사아'
    const boundaries = [2, 4, 6]
    const sc = new ContinuousScorer(targets, opts())
    sc.step(full, boundaries, 2)
    const t = sc.runningTotals()
    expect(t.correct).toBe(sc.scoredCount * 2)
    expect(t.total).toBe(sc.scoredCount * 2)
  })
})
