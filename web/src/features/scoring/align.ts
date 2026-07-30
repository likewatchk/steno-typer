/**
 * Levenshtein 정렬.
 *
 * 성능 설계:
 * - 항목 단위로만 수행 (연속 입력의 항목 분할은 엔진이 기록한 경계로 이미 끝나 있다)
 * - 공통 접두/접미를 먼저 걷어낸다 — "대부분 맞게 친" 일반 케이스에서 DP 가 거의 0 이 된다
 * - 남은 코어가 그래도 크면(비정상적으로 긴 항목) DP 를 포기하고 근사 집계로 강등,
 *   메모리/시간 폭발을 원천 차단한다 (LIMIT = 4M 셀 ≈ Int32 16MB)
 */

export interface OpCounts {
  correct: number
  substituted: number
  inserted: number
  deleted: number
}

type Op = 'eq' | 'sub' | 'del' | 'ins'

const CELL_LIMIT = 4_000_000

/** target(a) 대비 input(b)의 편집 연산 시퀀스 */
export function alignOps(a: string[], b: string[]): Op[] {
  const n = a.length
  const m = b.length

  // ---- 공통 접두/접미 트리밍 ----
  let pre = 0
  while (pre < n && pre < m && a[pre] === b[pre]) pre++
  let suf = 0
  while (suf < n - pre && suf < m - pre && a[n - 1 - suf] === b[m - 1 - suf]) suf++

  const cn = n - pre - suf
  const cm = m - pre - suf

  let core: Op[]
  if (cn === 0 && cm === 0) {
    core = []
  } else if (cn === 0) {
    core = new Array<Op>(cm).fill('ins')
  } else if (cm === 0) {
    core = new Array<Op>(cn).fill('del')
  } else if (cn * cm > CELL_LIMIT) {
    // 강등 경로: 정밀 정렬 대신 근사 — min 은 치환, 나머지는 삽입/누락
    const subs = Math.min(cn, cm)
    core = new Array<Op>(subs).fill('sub')
    if (cn > cm) core = core.concat(new Array<Op>(cn - cm).fill('del'))
    else if (cm > cn) core = core.concat(new Array<Op>(cm - cn).fill('ins'))
  } else {
    core = dpAlign(a, b, pre, cn, cm)
  }

  const ops: Op[] = new Array<Op>(pre).fill('eq')
  ops.push(...core)
  for (let k = 0; k < suf; k++) ops.push('eq')
  return ops
}

function dpAlign(a: string[], b: string[], off: number, n: number, m: number): Op[] {
  const w = m + 1
  const dp = new Int32Array((n + 1) * w)
  for (let j = 1; j <= m; j++) dp[j] = j
  for (let i = 1; i <= n; i++) {
    dp[i * w] = i
    const ai = a[off + i - 1]
    for (let j = 1; j <= m; j++) {
      const cost = ai === b[off + j - 1] ? 0 : 1
      const sub = dp[(i - 1) * w + (j - 1)] + cost
      const del = dp[(i - 1) * w + j] + 1
      const ins = dp[i * w + (j - 1)] + 1
      dp[i * w + j] = sub <= del ? (sub <= ins ? sub : ins) : del <= ins ? del : ins
    }
  }
  // 역추적 — eq/sub 우선(대각), 그다음 del(누락), ins(삽입)
  const ops: Op[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const cur = dp[i * w + j]
    if (i > 0 && j > 0) {
      const diag = dp[(i - 1) * w + (j - 1)]
      const same = a[off + i - 1] === b[off + j - 1]
      if (cur === diag + (same ? 0 : 1)) {
        ops.push(same ? 'eq' : 'sub')
        i--
        j--
        continue
      }
    }
    if (i > 0 && cur === dp[(i - 1) * w + j] + 1) {
      ops.push('del')
      i--
      continue
    }
    ops.push('ins')
    j--
  }
  ops.reverse()
  return ops
}

export function countOps(ops: Op[]): OpCounts {
  const c: OpCounts = { correct: 0, substituted: 0, inserted: 0, deleted: 0 }
  for (const op of ops) {
    if (op === 'eq') c.correct++
    else if (op === 'sub') c.substituted++
    else if (op === 'ins') c.inserted++
    else c.deleted++
  }
  return c
}

/**
 * 표시용 diff — 음절(코드포인트) 단위, 같은 연산 구간은 병합.
 * del = 목표에 있는데 입력에 없음(누락, 목표 텍스트 표시)
 * ins = 입력에만 있음(삽입, 입력 텍스트 표시)
 * sub = 치환(입력 텍스트 표시)
 */
export function diffChars(target: string, input: string): Array<[Op, string]> {
  const a = [...target]
  const b = [...input]
  const ops = alignOps(a, b)
  const out: Array<[Op, string]> = []
  let i = 0
  let j = 0
  for (const op of ops) {
    const text = op === 'del' ? a[i] : b[j]
    if (op !== 'ins') i++
    if (op !== 'del') j++
    const last = out[out.length - 1]
    if (last && last[0] === op) last[1] += text
    else out.push([op, text])
  }
  return out
}
