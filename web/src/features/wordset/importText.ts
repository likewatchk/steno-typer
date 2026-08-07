/** 파일/텍스트 가져오기 — 인코딩 방어 + 분할 규칙 + 힌트 지원 */
import { toWordItem, type WordItem } from '../../lib/types.ts'

/**
 * 국내 .txt 는 CP949(EUC-KR)가 흔하다.
 * UTF-8 을 fatal 로 시도하고 실패하면 euc-kr 로 재시도한다.
 * (euc-kr 은 Encoding Standard 필수 라벨 — 전 브라우저 지원)
 */
export function decodeTextBuffer(buf: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('euc-kr').decode(buf)
  }
}

export type SplitMode = 'line' | 'sentence' | 'eojeol'

/** 붙여넣기/파일 본문 → 항목 배열 */
export function splitText(text: string, mode: SplitMode, eojeolN = 2): string[] {
  const clean = text.replace(/\r\n?/g, '\n').replace(/﻿/g, '')
  let parts: string[]
  if (mode === 'line') {
    parts = clean.split('\n')
  } else if (mode === 'sentence') {
    // 문장부호(.!?…) 또는 줄바꿈 뒤에서 자른다. 종결부호는 문장에 남긴다.
    parts = clean.split(/(?<=[.!?…])\s+|\n/)
  } else {
    // N어절씩 묶기 — 공백 단위로 쪼갠 뒤 N개씩
    const words = clean.split(/\s+/).filter(Boolean)
    parts = []
    for (let i = 0; i < words.length; i += eojeolN) {
      parts.push(words.slice(i, i + eojeolN).join(' '))
    }
  }
  return parts.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

/** .csv 한 줄에서 첫 셀만 취한다 (따옴표 이스케이프 지원하는 최소 파서). */
function firstCsvCell(line: string): string {
  if (!line.startsWith('"')) {
    const comma = line.indexOf(',')
    return comma < 0 ? line : line.slice(0, comma)
  }
  let out = ''
  for (let i = 1; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (line[i + 1] === '"') {
        out += '"'
        i++
      } else break
    } else out += ch
  }
  return out
}

/** 두 번째 CSV 셀 (힌트용) — 없으면 undefined */
function secondCsvCell(line: string): string | undefined {
  // 첫 셀을 걷어낸 나머지에서 첫 번째 셀만 다시 취한다 (간단 파서)
  let rest: string
  if (line.startsWith('"')) {
    let i = 1
    for (; i < line.length; i++) {
      if (line[i] === '"') {
        if (line[i + 1] === '"') i++
        else break
      }
    }
    rest = line.slice(i + 1)
  } else {
    const comma = line.indexOf(',')
    rest = comma < 0 ? '' : line.slice(comma)
  }
  if (!rest.startsWith(',')) return undefined
  const cell = firstCsvCell(rest.slice(1)).trim()
  return cell || undefined
}

/**
 * 파일 → 항목. 힌트 지원:
 * - .csv: 1열 = 원말, 2열 = 힌트
 * - .txt: 탭으로 "원말<TAB>힌트" 표기 시 힌트 인식
 */
export function parseFileContent(fileName: string, buf: ArrayBuffer): WordItem[] {
  const text = decodeTextBuffer(buf)
  if (/\.csv$/i.test(fileName)) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => {
        const t = firstCsvCell(l).trim()
        if (!t) return null
        const h = secondCsvCell(l)
        return h ? { t, h } : { t }
      })
      .filter((x): x is WordItem => x !== null)
  }
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const tab = line.indexOf('\t')
      if (tab >= 0) {
        const t = line.slice(0, tab).replace(/\s+/g, ' ').trim()
        const h = line.slice(tab + 1).trim()
        return t ? (h ? { t, h } : { t }) : null
      }
      const t = line.replace(/\s+/g, ' ').trim()
      return t ? { t } : null
    })
    .filter((x): x is WordItem => x !== null)
}

/** 단어장 JSON 내보내기 형식 */
export interface WordsetExport {
  name: string
  items: WordItem[]
}

export function parseWordsetJson(text: string): WordsetExport[] {
  const data: unknown = JSON.parse(text)
  const list = Array.isArray(data) ? data : [data]
  return list.map((entry) => {
    if (typeof entry !== 'object' || entry === null) throw new Error('형식이 올바르지 않습니다')
    const obj = entry as Record<string, unknown>
    const name = typeof obj.name === 'string' && obj.name.trim() ? obj.name.trim() : '가져온 단어장'
    const rawItems = obj.items
    if (!Array.isArray(rawItems)) throw new Error('items 배열이 없습니다')
    const items = rawItems
      .map((x): WordItem | null => {
        if (typeof x === 'string') return x.trim() ? { t: x.trim() } : null
        if (typeof x === 'object' && x !== null) {
          const o = x as Record<string, unknown>
          const t = typeof o.t === 'string' ? o.t : typeof o.text === 'string' ? o.text : ''
          const h = typeof o.h === 'string' ? o.h : typeof o.hint === 'string' ? o.hint : undefined
          return t.trim() ? toWordItem({ t: t.trim(), h: h?.trim() || undefined }) : null
        }
        return null
      })
      .filter((x): x is WordItem => x !== null)
    return { name, items }
  })
}

/** Blob 다운로드 (clipboard API 는 secure context 전용 — HTTP 라 파일 다운로드로) */
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
