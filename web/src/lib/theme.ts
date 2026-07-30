export type ThemePref = 'system' | 'light' | 'dark'

const KEY = 'steno-theme'

export function getThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

export function setThemePref(pref: ThemePref): void {
  try {
    if (pref === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, pref)
  } catch {
    /* 저장 실패해도 적용은 한다 */
  }
  if (pref === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = pref
}

export function cycleTheme(): ThemePref {
  const order: ThemePref[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(getThemePref()) + 1) % order.length]
  setThemePref(next)
  return next
}
