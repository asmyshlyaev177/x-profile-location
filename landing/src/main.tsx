/**
 * The client entry.
 *
 * Deliberately does not import `seo.ts`, `dicts.ts` or `prerender.tsx`. Those
 * reach every language at once, which is correct in Node and wrong here — one
 * import of any of them would put ~170 kB of copy the visitor cannot read into
 * the bundle. The one dictionary this page needs is fetched by `loadDict`, as
 * its own chunk.
 */
import { render } from 'preact'
import { App } from './app'
import { splitLocale } from './i18n/locales'
import { loadDict } from './i18n/load'

if (typeof window !== 'undefined') {
  const mount = async () => {
    const { locale } = splitLocale(window.location.pathname)
    const dict = await loadDict(locale.code)
    render(
      <App url={window.location.pathname} dict={dict} />,
      document.getElementById('app')!,
    )
  }

  // Every page is prerendered and every control in the markup already works
  // without JS: the install link is a real <a href>, the anchors are anchors,
  // the FAQ is a native <details>, and so is the language menu. So hydration
  // buys the carousel, the lightbox and the Brave check — none of which anyone
  // can reach in the first second. Running it on idle instead of immediately
  // keeps ~150 ms of scripting off the critical path, and it is also what
  // makes the dictionary fetch free: it happens while the page sits idle,
  // long after everything visible has painted.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => void mount(), { timeout: 1500 })
  } else {
    setTimeout(() => void mount(), 1)
  }
}
