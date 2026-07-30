/** 파일/텍스트 가져오기 — 인코딩 방어 + 분할 규칙 */

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

export function parseFileContent(fileName: string, buf: ArrayBuffer): string[] {
  const text = decodeTextBuffer(buf)
  if (/\.csv$/i.test(fileName)) {
    return text
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((l) => firstCsvCell(l).trim())
      .filter(Boolean)
  }
  return splitText(text, 'line')
}

/** 단어장 JSON 내보내기 형식 */
export interface WordsetExport {
  name: string
  items: string[]
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
    const items = rawItems.filter((x): x is string => typeof x === 'string').map((s) => s.trim()).filter(Boolean)
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
