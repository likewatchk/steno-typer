/**
 * 소리자바 따라치기 실시간 채점 — 속기 시험 기준.
 *
 * - 단위: 음절. 띄어쓰기·문장부호는 채점에서 뺀다 (부호 연습에서는 부호를 채점에 넣을 수 있다).
 * - 오자(치환)·탈자(빠뜨림)·첨가(더 침) 모두 1개씩 감점.
 * - 정확도 = (원문 글자수 − 오자 − 탈자 − 첨가) / 원문 글자수.
 *
 * 증분 DP: 입력 1음절 = 행 1개(O(원문 길이)). 앞부분이 그대로면 행을 재사용하므로
 * 타건마다 전체를 다시 계산하지 않는다. 원문 끝은 자유(semi-global) — 아직 안 친
 * 뒷부분은 감점하지 않고, 지금까지 친 곳이 원문 어디까지 왔는지(end)를 찾는다.
 */

const PUNCT_RE = /[.,!?;:…·‥"'“”‘’()[\]{}<>「」『』【】—–\-~/\\%]/u

export interface ScoreOpts {
  /** 문장부호도 채점 단위로 센다 (부호 연습용). 기본 false = 시험 기준 */
  punct?: boolean
}

/** 채점 대상 글자인가 (공백 제외, 부호는 옵션) */
export function isScored(ch: string, opts: ScoreOpts = {}): boolean {
  if (/\s/u.test(ch)) return false
  return opts.punct ? true : !PUNCT_RE.test(ch)
}

export function normalizeTyped(raw: string, opts: ScoreOpts = {}): string[] {
  return [...raw.normalize('NFC')].filter((ch) => isScored(ch, opts))
}

export interface TargetText {
  /** 화면 표시용 글자 (공백 포함) */
  chars: string[]
  /** 채점용 음절 열 */
  norm: string[]
  /** chars[i] 의 채점 인덱스, 채점 대상이 아니면 -1 */
  normOf: Int32Array
}

export function buildTarget(text: string, opts: ScoreOpts = {}): TargetText {
  const chars = [...text.normalize('NFC')]
  const normOf = new Int32Array(chars.length).fill(-1)
  const norm: string[] = []
  chars.forEach((ch, i) => {
    if (isScored(ch, opts)) {
      normOf[i] = norm.length
      norm.push(ch)
    }
  })
  return { chars, norm, normOf }
}

/** 원문 음절별 상태 */
export const ST_PENDING = 0
export const ST_OK = 1
export const ST_SUB = 2 // 오자
export const ST_MISS = 3 // 탈자

export interface AlignResult {
  /** 원문 음절별 상태 (ST_*) — end 이후는 PENDING */
  status: Uint8Array
  /** 입력이 원문 어디까지 왔는가 (채점 인덱스, 배타적) */
  end: number
  ok: number
  sub: number
  miss: number
  /** 첨가 */
  ins: number
  /** 채점에 들어간 입력 음절 수 */
  typed: number
  /** 마지막 입력이 없어도 이미 같은 비용으로 원문 끝에 닿아 있었다 — 마지막 입력은 꼬리 첨가 (자동 완주 금지 근거) */
  tailExtra: boolean
}

/** 입력 길이 상한 — 붙여넣기·주입 폭주로 메모리가 원문×입력으로 커지는 것을 막는다 (그 이상 첨가는 잡음) */
export function maxTypedFor(targetLen: number): number {
  return targetLen + 256
}

/** 비용은 최대 입력 길이(≤ m+256) 이내라 Uint16 으로 충분 — 메모리 = 입력×원문×2B */
export class LiveAligner {
  private readonly m: number
  private rows: Uint16Array[] = []
  private typed: string[] = []

  constructor(private readonly target: string[]) {
    this.m = target.length
    const r0 = new Uint16Array(this.m + 1)
    for (let j = 0; j <= this.m; j++) r0[j] = j
    this.rows.push(r0)
  }

  /** 현재 입력(정규화된 음절 열)으로 갱신하고 결과를 돌려준다 */
  update(typedIn: string[]): AlignResult {
    const cap = maxTypedFor(this.m)
    const typed = typedIn.length > cap ? typedIn.slice(0, cap) : typedIn
    // 공통 앞부분까지 행 재사용
    let k = 0
    const prev = this.typed
    while (k < prev.length && k < typed.length && prev[k] === typed[k]) k++
    this.rows.length = k + 1
    const t = this.target
    const m = this.m
    for (let i = k; i < typed.length; i++) {
      const up = this.rows[i]
      const row = new Uint16Array(m + 1)
      row[0] = i + 1
      const a = typed[i]
      for (let j = 1; j <= m; j++) {
        const diag = up[j - 1] + (t[j - 1] === a ? 0 : 1)
        const ins = up[j] + 1 // 첨가
        const del = row[j - 1] + 1 // 탈자
        row[j] = diag < ins ? (diag < del ? diag : del) : ins < del ? ins : del
      }
      this.rows.push(row)
    }
    this.typed = typed.slice()
    return this.result()
  }

  private result(): AlignResult {
    const n = this.typed.length
    const m = this.m
    const status = new Uint8Array(m)
    if (n === 0) return { status, end: 0, ok: 0, sub: 0, miss: 0, ins: 0, typed: 0, tailExtra: false }
    const last = this.rows[n]
    // 끝 위치: 비용 최소 중에서
    //  1) 마지막 입력이 원문과 '맞아떨어지는' 가장 먼 곳 — 사용자가 실제로 거기까지 쳤다는 뜻
    //  2) 그런 곳이 없으면(마지막이 오타) 가장 가까운 최소점에서 1만 더 — 틀린 한 글자는 그 자리에
    //     오자로 보여 주되(타자 교본식), 잡음이 여러 개여도 커서가 멀리 튀지 않게 나머지는 첨가로 센다.
    let best = last[0]
    for (let j = 1; j <= m; j++) if (last[j] < best) best = last[j]
    const lastTyped = this.typed[n - 1]
    const up = this.rows[n - 1]
    let end = -1
    for (let j = m; j >= 1; j--) {
      if (last[j] === best && this.target[j - 1] === lastTyped && up[j - 1] === best) {
        end = j
        break
      }
    }
    if (end < 0) {
      let nearest = 0
      while (last[nearest] !== best) nearest++
      end = nearest + 1 <= m && last[nearest + 1] === best ? nearest + 1 : nearest
    }
    // 역추적
    let i = n
    let j = end
    let ok = 0
    let sub = 0
    let miss = 0
    let ins = 0
    const t = this.target
    while (i > 0 || j > 0) {
      const cur = this.rows[i][j]
      if (i > 0 && j > 0) {
        const same = t[j - 1] === this.typed[i - 1]
        if (this.rows[i - 1][j - 1] + (same ? 0 : 1) === cur) {
          status[j - 1] = same ? ST_OK : ST_SUB
          if (same) ok++
          else sub++
          i--
          j--
          continue
        }
      }
      if (j > 0 && this.rows[i][j - 1] + 1 === cur) {
        status[j - 1] = ST_MISS
        miss++
        j--
        continue
      }
      ins++
      i--
    }
    // 직전 입력이 이미 끝에 닿아 있고 거기서 1(첨가)만 더한 것이 최적 비용이면, 지금 친 글자는 끝에 덧붙은 첨가다
    const tailExtra = end === m && n > 1 && this.rows[n - 1][m] + 1 === best
    return { status, end, ok, sub, miss, ins, typed: n, tailExtra }
  }
}

/** 시험식 정확도 — base 글자수 기준 (0~1) */
export function examAccuracy(r: Pick<AlignResult, 'sub' | 'miss' | 'ins'>, base: number): number {
  if (base <= 0) return 1
  return Math.max(0, (base - r.sub - r.miss - r.ins) / base)
}
