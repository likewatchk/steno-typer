/**
 * 클립보드 복사 — HTTP 배포라 navigator.clipboard(secure context 전용)를 못 믿는다.
 * clipboard API 시도 → 실패 시 숨김 textarea + execCommand 폴백.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* HTTP 등에서 실패 — 폴백으로 */
  }
  try {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.focus()
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  } catch {
    return false
  }
}
