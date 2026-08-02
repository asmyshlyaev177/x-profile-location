// Puts the stored colour-scheme preference onto an extension page.
//
// The whole mechanism is one attribute on <html>. No colours live here: both
// palettes stay in the page's own stylesheet as `light-dark()` pairs, and this
// only decides which half of each pair the browser reads. That split is why
// 'system' needs no JavaScript to look right — the attribute is simply absent
// and CSS follows the OS by itself.

import {
  normalizeTheme,
  THEME_KEY,
  type ThemePreference,
} from '../scripts/countries'

export function applyTheme(theme: ThemePreference): void {
  if (theme === 'system') {
    document.documentElement.removeAttribute('data-theme')
  } else {
    document.documentElement.setAttribute('data-theme', theme)
  }
}

/**
 * Applies the stored theme, then keeps this page on it.
 *
 * The listener is what makes an open popup follow a change made in the options
 * tab: `chrome.storage.onChanged` fires in every extension page, so neither
 * surface has to know the other is there.
 */
export function startThemeSync(): void {
  chrome.storage.local.get([THEME_KEY]).then((stored) => {
    applyTheme(normalizeTheme(stored[THEME_KEY]))
  })

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[THEME_KEY]) return
    applyTheme(normalizeTheme(changes[THEME_KEY].newValue))
  })
}
