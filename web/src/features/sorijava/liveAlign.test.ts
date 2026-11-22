import { describe, expect, it } from 'vitest'
import { LiveAligner, ST_MISS, ST_OK, ST_PENDING, ST_SUB, buildTarget, examAccuracy, normalizeTyped } from './liveAlign.ts'

const run = (target: string, typed: string) => {
  const t = buildTarget(target)
  return new LiveAligner(t.norm).update(normalizeTyped(typed))
}

describe('buildTarget', () => {
  it('공백·부호는 채점에서 빠진다', () => {
    const t = buildTarget('가다. 오고, 가자')
    expect(t.norm.join('')).toBe('가다오고가자')
    expect(t.normOf[2]).toBe(-1) // '.'
    expect(t.normOf[3]).toBe(-1) // ' '
    expect(t.normOf[4]).toBe(2)
  })
})

describe('LiveAligner — 시험 기준', () => {
  it('완전 일치', () => {
    const r = run('가자 다사', '가자다사')
    expect(r).toMatchObject({ end: 4, ok: 4, sub: 0, miss: 0, ins: 0 })
  })

  it('띄어쓰기·부호 차이는 무시', () => {
    const r = run('가다. 오고, 가자', '가다 오고가자.')
    expect(r).toMatchObject({ ok: 6, sub: 0, miss: 0, ins: 0 })
  })

  it('아직 안 친 뒷부분은 감점하지 않는다', () => {
    const r = run('가자 다사 고기', '가자다')
    expect(r.end).toBe(3)
    expect(r.miss).toBe(0)
    expect(r.status[3]).toBe(ST_PENDING)
  })

  it('오자', () => {
    const r = run('가자 다사', '가저다사')
    expect(r).toMatchObject({ ok: 3, sub: 1, miss: 0, ins: 0 })
    expect(r.status[1]).toBe(ST_SUB)
  })

  it('탈자 — 낱말 하나를 건너뛰고 계속 침', () => {
    const r = run('가자 다사 고기 도시', '가자고기도시')
    expect(r).toMatchObject({ ok: 6, sub: 0, miss: 2, ins: 0, end: 8 })
    expect(r.status[2]).toBe(ST_MISS)
    expect(r.status[3]).toBe(ST_MISS)
    expect(r.status[4]).toBe(ST_OK)
  })

  it('첨가', () => {
    const r = run('가자 다사', '가자자다사')
    expect(r).toMatchObject({ ok: 4, sub: 0, miss: 0, ins: 1 })
  })

  it('틀린 한 글자는 그 자리 오자로 보이고, 잡음이 여러 개면 커서가 1만 전진 (나머지 첨가)', () => {
    const one = run('가나다라마', '가나ㅋ')
    expect(one).toMatchObject({ end: 3, sub: 1, ins: 0 })
    expect(one.status[2]).toBe(ST_SUB)
    const two = run('가나다라마', '가나ㅋㅋ')
    expect(two.end).toBe(3)
    expect(two.sub + two.ins).toBe(2)
    expect(two.status[3]).toBe(ST_PENDING) // '라'는 아직 안 친 것
  })

  it('끝 직전 중복 타건은 첨가로 보고 끝까지 간 것으로 치지 않는다 (자동 완주 안 됨)', () => {
    const r = run('가나다라마바사', '가나다라마바바')
    expect(r).toMatchObject({ end: 6, ins: 1, sub: 0 })
    expect(r.status[6]).toBe(ST_PENDING)
    // 마지막 글자 오타 — 그 자리에 오자, 끝까지는 왔지만 OK 가 아님 (화면이 완주로 안 봄)
    const r2 = run('가나다', '가나라')
    expect(r2).toMatchObject({ end: 3, sub: 1 })
    expect(r2.status[2]).toBe(ST_SUB)
  })

  it('마지막 입력이 원문과 맞으면 거기까지 간 것으로 본다 (중간 탈자 1 > 첨가 해석)', () => {
    const t = buildTarget('가. 자. 다.', { punct: true })
    const r = new LiveAligner(t.norm).update(normalizeTyped('가자.', { punct: true }))
    expect(r).toMatchObject({ end: 4, miss: 1, ins: 0, sub: 0 })
    // 반복 낱말에서도 끝까지 간 것으로
    const r2 = run('하하 허허 하하', '하하허허하하')
    expect(r2).toMatchObject({ end: 6, ok: 6 })
  })

  it('부호 채점 옵션 — 부호 연습에서는 마침표·쉼표도 센다', () => {
    const t = buildTarget('가. 자,', { punct: true })
    expect(t.norm).toEqual(['가', '.', '자', ','])
    const r = new LiveAligner(t.norm).update(normalizeTyped('가 자,', { punct: true }))
    expect(r.miss).toBe(1)
  })

  it('입력 길이 상한 — 원문+256 을 넘는 입력은 잘라서 채점', () => {
    const t = buildTarget('가나다')
    const r = new LiveAligner(t.norm).update(normalizeTyped('가나다' + 'ㅋ'.repeat(5000)))
    expect(r.typed).toBe(3 + 256)
  })

  it('꼬리 첨가 — 끝까지 다 친 뒤 마지막 글자를 한 번 더 쳐도 "끝에 닿은 것"으로 완주 처리하지 않는다', () => {
    const t = buildTarget('가나다 라마자')
    const al = new LiveAligner(t.norm)
    expect(al.update(normalizeTyped('가나다라마자')).tailExtra).toBe(false)
    const r = al.update(normalizeTyped('가나다라마자자'))
    expect(r.end).toBe(6)
    expect(r.ins).toBe(1)
    expect(r.tailExtra).toBe(true)
    // 반복 낱말의 정상 진행은 꼬리 첨가가 아니다
    const t2 = buildTarget('자자')
    expect(new LiveAligner(t2.norm).update(normalizeTyped('자자')).tailExtra).toBe(false)
  })

  it('% 는 부호 — 시험 기준에서는 제외, 약어 연습에서는 채점', () => {
    expect(buildTarget('30% 굵다').norm.join('')).toBe('30굵다')
    expect(buildTarget('25%', { punct: true }).norm.join('')).toBe('25%')
  })

  it('lastJ — 마지막 입력이 맞붙은 원문 자리 (첨가면 -1)', () => {
    expect(run('가나다', '가나').lastJ).toBe(1)
    expect(run('가나다', '가노').lastJ).toBe(1) // 오자 자리
    // 중복 타건은 비용이 같은 두 해석 중 역추적이 '뒤의 바 = 정답, 앞의 바 = 첨가' 를 고른다 (end 는 안 나아감)
    expect(run('가나다라마바사', '가나다라마바바')).toMatchObject({ lastJ: 5, end: 6, ins: 1 })
    expect(run('가나다', '가나다ㅋ').lastJ).toBe(-1) // 끝 넘어 잡음은 첨가
    expect(run('가나다', '').lastJ).toBe(-1)
    // 사진 사례: '앞치마' 를 '앞티라치' 로 — 마지막 '치' 가 원문 '치' 에 맞붙고 티·라는 첨가
    const r = run('덮다 앞치마 높다', '덮다앞티라치')
    expect(r).toMatchObject({ end: 4, ins: 2, sub: 0, lastJ: 3 })
    expect(r.status[3]).toBe(ST_OK)
  })

  it('증분 갱신 = 처음부터 계산과 같다 (백스페이스 포함)', () => {
    const t = buildTarget('소시지 자두 가지 우거지 어디서 오고')
    const al = new LiveAligner(t.norm)
    const steps = ['소', '소시', '소시자', '소시', '소시지', '소시지자두', '소시지자두가지우', '소시지자두가지우거지어디']
    for (const s of steps) {
      const inc = al.update(normalizeTyped(s))
      const fresh = new LiveAligner(t.norm).update(normalizeTyped(s))
      expect(inc).toEqual(fresh)
    }
  })

  it('정확도 = (원문 − 오자 − 탈자 − 첨가) / 원문', () => {
    expect(examAccuracy({ sub: 1, miss: 1, ins: 1 }, 100)).toBeCloseTo(0.97)
    expect(examAccuracy({ sub: 5, miss: 0, ins: 0 }, 3)).toBe(0)
  })

  it('긴 원문(2000자)·긴 입력에서도 증분 갱신이 빠르다', () => {
    const base = '가자다사고기도시'
    const text = Array.from({ length: 250 }, () => base).join(' ')
    const t = buildTarget(text)
    const al = new LiveAligner(t.norm)
    const typed = normalizeTyped(text)
    const t0 = performance.now()
    for (let i = 1; i <= typed.length; i += 1) al.update(typed.slice(0, i))
    const per = (performance.now() - t0) / typed.length
    expect(per).toBeLessThan(5) // 타건당 ms
  })
})
