import { normalizeTheme } from '../scripts/settings'
import { THEME_KEY } from '../scripts/constants'
// One attribute on <html>; the palettes are `light-dark()` pairs in the page's
// own stylesheet. 'system' is the attribute's absence, so CSS follows the OS.

import { type ThemePreference } from '../scripts/countries/countries'

export function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/** Applies the stored theme, then keeps this page on it. */
export function startThemeSync(): void {
  chrome.storage.local.get([THEME_KEY]).then((stored) => {
    applyTheme(normalizeTheme(stored[THEME_KEY]))
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[THEME_KEY]) return
    applyTheme(normalizeTheme(changes[THEME_KEY].newValue))
  })
}
