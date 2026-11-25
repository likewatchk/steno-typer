import { describe, expect, it } from 'vitest'
import { decomposeSyllable } from '../../lib/hangul.ts'
import { ABBR_DRILLS, DRILL_GROUPS, drillsFor, isValidPick, pickOfStage } from './abbrReview.ts'
import { BASIC_STAGES, NEW_CHO, NEW_JONG, NEW_JUNG, buildSessionItems, scoreOptsFor, syllableCount } from './basicCourses.ts'

function allowedUpTo(table: Record<number, string>, stage: number): Set<string> {
  const set = new Set<string>()
  for (const [k, v] of Object.entries(table)) if (Number(k) <= stage) for (const c of v) set.add(c)
  return set
}

/** 약어가 찍어 주는 글자 (낱말 끝) — 배운 단계 이후로는 자리 검사에서 뺀다. 긴 꼴부터 */
const ABBR_FORMS: Record<number, string[]> = {
  2: ['이', '다', '고'],
  3: ['가', '지', '의'],
  4: ['는', '은', '로서', '로써'],
  5: ['를', '을', '므로', '으로', '로'],
  6: ['도', '입니다', '입니까', '한', '할'],
  7: ['서', '써', '으로서', '으로써'],
  8: ['와', '과', '에'],
  9: ['며', '면', '면서'],
  10: ['게', '습니다', '습니까'],
}
function formsUpTo(stage: number): string[] {
  return Object.entries(ABBR_FORMS)
    .filter(([k]) => Number(k) <= stage)
    .flatMap(([, v]) => v)
    .sort((a, b) => b.length - a.length)
}

/** 문장에서 그 단계까지 못 치는 글자 */
function outOfRange(sentence: string, stage: number): string[] {
  const cho = allowedUpTo(NEW_CHO, stage)
  const jung = allowedUpTo(NEW_JUNG, stage)
  const jong = allowedUpTo(NEW_JONG, stage)
  const forms = formsUpTo(stage)
  const bad: string[] = []
  for (const raw of sentence.split(/\s+/)) {
    // 부호: . , 는 1단계, ? 는 입니까?·습니까? 약어 안에서만(물음표 자체는 10단계), ! % - 는 10단계
    let w = raw.replace(/(입니까|습니까)\?/g, '$1')
    const marks = w.match(/[?!%-]/g)
    if (marks && stage < 10) bad.push(`${raw}(${marks.join('')})`)
    w = w.replace(/[.,?!%-]/g, '')
    if (stage >= 10) w = w.replace(/[0-9]/g, '')
    // 낱말 끝 약어는 약어가 찍어 준다 (에는 = 에+는 처럼 둘까지)
    for (let k = 0; k < 2; k++) {
      const f = forms.find((x) => w.length > 0 && w.endsWith(x))
      if (!f) break
      w = w.slice(0, -f.length)
    }
    for (const ch of w) {
      const d = decomposeSyllable(ch)
      if (!d) {
        bad.push(`${raw}(${ch})`)
        continue
      }
      const [c, v, f] = d
      if (!cho.has(c) || !jung.has(v) || (f && !jong.has(f))) bad.push(`${raw}(${ch})`)
    }
  }
  return bad
}

/** 문장에 그 약어가 실제로 들어 있는가 */
const HAS: Record<string, RegExp> = {
  space: / /,
  period: /\./,
  comma: /,/,
  i: /[가-힣]이(\s|[.,!?]|$)/,
  da: /다\./,
  go: /[가-힣]고(\s|[.,]|$)/,
  ga: /[가-힣]가(\s|[.,]|$)/,
  ji: /[가-힣]지(\s|[.,]|$)/,
  ui: /[가-힣]의\s/,
  neun: /[가-힣]는(\s|$)/,
  eun: /[가-힣]은(\s|$)/,
  roseo: /[가-힣]로서/,
  rosseo: /[가-힣]로써/,
  reul: /[가-힣][를을]\s/,
  meuro: /[가-힣](므로|으로)(?![서써])/,
  ro: /[^으므]로(\s|[.,]|$)|^[가-힣]*[^으므\s]로/,
  do: /[가-힣]도\s/,
  imnida: /입니다\./,
  imnikka: /입니까\?/,
  han: /[가-힣]한\s/,
  hal: /(^|[가-힣])할\s/,
  seo: /[가-힣]서(\s|[.,]|$)/,
  sseo: /[가-힣](?<!로)써(\s|[.,]|$)/,
  euroseo: /으로서/,
  eurosseo: /으로써/,
  wa: /[가-힣][와과]\s/,
  e: /[가-힣]에\s/,
  myeo: /[가-힣]며\s/,
  myeon: /[가-힣]면\s/,
  myeonseo: /[가-힣]면서\s/,
  ge: /[가-힣]게\s/,
  seumnida: /습니다\./,
  seumnikka: /습니까\?/,
  question: /(?<!입니까|습니까)\?/,
  exclaim: /!/,
  percent: /\d%/,
  hyphen: /[가-힣0-9]-[가-힣0-9]/,
}

describe('11단계 기본약어 총정리 데이터', () => {
  it('교재 표 36개 + 로 — 약어마다 문장 10개, id 중복 없음', () => {
    expect(ABBR_DRILLS.length).toBe(37)
    expect(new Set(ABBR_DRILLS.map((d) => d.id)).size).toBe(37)
    for (const d of ABBR_DRILLS) {
      expect(d.sentences.length, d.id).toBe(10)
      expect(new Set(d.sentences).size, `${d.id} 중복 문장`).toBe(10)
    }
  })

  it('표 순서대로 1→10단계', () => {
    const stages = ABBR_DRILLS.map((d) => d.stage)
    expect(stages).toEqual(stages.slice().sort((a, b) => a - b))
    expect(DRILL_GROUPS.map((g) => g.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  for (const d of ABBR_DRILLS) {
    it(`${d.stage}단계 '${d.label}' — 문장마다 약어가 있고, ${d.stage}단계까지 배운 자리만 쓴다`, () => {
      const re = HAS[d.id]
      expect(re, `${d.id} 검사식`).toBeDefined()
      expect(d.sentences.filter((t) => !re.test(t)), '약어가 안 들어간 문장').toEqual([])
      expect(d.sentences.flatMap((t) => outOfRange(t, d.stage)), '아직 안 배운 자리').toEqual([])
    })
  }
})

describe('1~10단계와 일관성', () => {
  it('1~10단계 약어 힌트는 11단계와 같은 문구', () => {
    const drillHints = new Set(ABBR_DRILLS.map((d) => `${d.label}: ${d.h}`))
    const stageHints = BASIC_STAGES.filter((s) => s.no <= 10).flatMap((s) => s.abbr.map((a) => a.h!))
    const unknown = [...new Set(stageHints)].filter((h) => !drillHints.has(h) && h !== '을·로·으로')
    expect(unknown).toEqual([])
  })

  it('각 약어는 그 약어를 배운 단계의 약어 연습에도 있다', () => {
    for (const d of ABBR_DRILLS) {
      const st = BASIC_STAGES.find((s) => s.no === d.stage)!
      expect(
        st.abbr.some((a) => a.h === `${d.label}: ${d.h}`),
        `${d.stage}단계 약어 연습에 '${d.label}'`,
      ).toBe(true)
    }
  })
})

describe('11단계 본문 — 차례로 복습', () => {
  const seeded = () => {
    let x = 7
    return () => ((x = (x * 1103515245 + 12345) % 2 ** 31) / 2 ** 31)
  }
  const base = { stage: 11, part: 'words' as const, cumulative: true, shuffle: true }

  it('전체·전부 — 모든 문장이 한 번씩, 섞어도 1→10단계 순서', () => {
    const items = buildSessionItems({ ...base, targetSyllables: 'all', rand: seeded() })
    expect(items.length).toBe(ABBR_DRILLS.length * 10)
    const gs = items.map((i) => i.g!)
    expect(gs).toEqual(gs.slice().sort((a, b) => a - b))
    // 누적·범위(part) 설정은 무시 — 총정리는 늘 약어 문장
    expect(items.every((i) => i.k)).toBe(true)
  })

  it('분량이 적어도 1단계부터 10단계까지 고루 닿는다', () => {
    const items = buildSessionItems({ ...base, targetSyllables: 300, rand: seeded() })
    expect(new Set(items.map((i) => i.g))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    const gs = items.map((i) => i.g!)
    expect(gs).toEqual(gs.slice().sort((a, b) => a - b))
    const total = items.reduce((n, i) => n + syllableCount(i.t, scoreOptsFor('abbr')), 0)
    expect(total).toBeGreaterThanOrEqual(300)
  })

  it('분량을 줄여도 약어가 고루 — 묶음 안 약어를 돌아가며 뽑는다 (섞기 꺼도)', () => {
    for (const shuffle of [false, true]) {
      const small = buildSessionItems({ ...base, shuffle, targetSyllables: 300, rand: seeded() })
      // 묶음마다 뽑힌 문장 수만큼은 서로 다른 약어
      for (const g of DRILL_GROUPS) {
        const ks = small.filter((i) => i.g === g.stage).map((i) => i.k)
        expect(new Set(ks).size, `${g.stage}단계 묶음`).toBe(Math.min(ks.length, g.drills.length))
      }
      const big = buildSessionItems({ ...base, shuffle, targetSyllables: 1500, rand: seeded() })
      expect(new Set(big.map((i) => i.k)).size).toBe(ABBR_DRILLS.length)
    }
  })

  it('단계 하나만 골라도 분량 목표를 채운다', () => {
    for (const pick of ['s1', 's10', 'seumnikka']) {
      for (const target of [30, 200, 300]) {
        const items = buildSessionItems({ ...base, pick, targetSyllables: target, rand: seeded() })
        const total = items.reduce((n, i) => n + syllableCount(i.t, scoreOptsFor('abbr')), 0)
        const all = buildSessionItems({ ...base, pick, targetSyllables: 'all' })
        const max = all.reduce((n, i) => n + syllableCount(i.t, scoreOptsFor('abbr')), 0)
        expect(total, `${pick} ${target}`).toBeGreaterThanOrEqual(Math.min(target, max))
      }
    }
  })

  it('약어 하나·단계 묶음 고르기', () => {
    const one = buildSessionItems({ ...base, targetSyllables: 'all', pick: 'seumnikka' })
    expect(one.length).toBe(10)
    expect(one.every((i) => i.t.includes('습니까?'))).toBe(true)
    const g = buildSessionItems({ ...base, targetSyllables: 'all', pick: pickOfStage(4) })
    expect(g.length).toBe(drillsFor(pickOfStage(4)).length * 10)
    expect(g.every((i) => i.g === 4)).toBe(true)
  })

  it('고르기 값 검사', () => {
    expect(isValidPick('all')).toBe(true)
    expect(isValidPick('s7')).toBe(true)
    expect(isValidPick('ro')).toBe(true)
    expect(isValidPick('s11')).toBe(false)
    expect(isValidPick('zzz')).toBe(false)
    expect(isValidPick(3)).toBe(false)
  })
})
