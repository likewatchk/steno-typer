import { describe, expect, it } from 'vitest'
import { decodeTextBuffer, parseWordsetJson, splitText } from './importText.ts'

describe('decodeTextBuffer', () => {
  it('UTF-8 정상 디코드', () => {
    const buf = new TextEncoder().encode('한글 테스트').buffer
    expect(decodeTextBuffer(buf as ArrayBuffer)).toBe('한글 테스트')
  })

  it('CP949(EUC-KR) 폴백 — "안녕하세요"', () => {
    // "안녕하세요" 의 EUC-KR 바이트
    const euckr = new Uint8Array([0xbe, 0xc8, 0xb3, 0xe7, 0xc7, 0xcf, 0xbc, 0xbc, 0xbf, 0xe4])
    expect(decodeTextBuffer(euckr.buffer)).toBe('안녕하세요')
  })
})

describe('splitText', () => {
  it('줄 단위 — 빈 줄 제거, 공백 정리', () => {
    expect(splitText('사과\n\n  배 \n포도  ', 'line')).toEqual(['사과', '배', '포도'])
  })

  it('CRLF 처리', () => {
    expect(splitText('사과\r\n배\r포도', 'line')).toEqual(['사과', '배', '포도'])
  })

  it('문장 단위 — 종결부호 유지', () => {
    expect(splitText('간다. 온다! 볼까? 그래…', 'sentence')).toEqual(['간다.', '온다!', '볼까?', '그래…'])
  })

  it('N어절 묶기', () => {
    expect(splitText('가 나 다 라 마', 'eojeol', 2)).toEqual(['가 나', '다 라', '마'])
    expect(splitText('가 나 다 라 마 바', 'eojeol', 3)).toEqual(['가 나 다', '라 마 바'])
  })
})

describe('parseWordsetJson', () => {
  it('단일/배열 모두 허용', () => {
    expect(parseWordsetJson('{"name":"A","items":["가","나"]}')).toEqual([{ name: 'A', items: ['가', '나'] }])
    expect(parseWordsetJson('[{"name":"A","items":["가"]},{"name":"B","items":["나"]}]').length).toBe(2)
  })

  it('items 없으면 오류', () => {
    expect(() => parseWordsetJson('{"name":"A"}')).toThrow()
  })
})
