import { useEffect, useState } from 'preact/hooks'
import {
  DEFAULT_LOCALE,
  LANG_KEY,
  detectLocale,
  localePath,
  type LocaleDef,
} from '../i18n/locales'
import { useI18n } from '../i18n/context'
import { localizedRoutes } from '../routes'

/**
 * Offers the browser's language as a link, on the English pages.
 *
 * This replaced a redirect. `index.html` used to send a German browser from
 * `/` to `/de` before first paint; Google's guidance is that auto-redirecting
 * between language versions keeps crawlers and people from reaching the
 * others, so detection now produces an offer the reader takes or dismisses —
 * and either answer is remembered under the key the inline preference script
 * reads, so it is asked once.
 *
 * Client-only by construction: nothing renders until an effect has read
 * `navigator.languages`, so the prerendered document — what a crawler sees —
 * never contains it. A fixed toast rather than a bar above the header, so its
 * late arrival shifts no layout.
 */
export function LanguageSuggest() {
  const { locale, routePath } = useI18n()
  const [offer, setOffer] = useState<LocaleDef | null>(null)

  useEffect(() => {
    if (locale.code !== DEFAULT_LOCALE) return
    try {
      if (localStorage.getItem(LANG_KEY)) return
    } catch {
      return
    }
    const wanted = detectLocale(navigator.languages)
    if (wanted && wanted.code !== DEFAULT_LOCALE) setOffer(wanted)
  }, [locale.code])

  if (!offer) return null

  const dismiss = () => {
    try {
      localStorage.setItem(LANG_KEY, DEFAULT_LOCALE)
    } catch {
      // Storage denied: the toast still closes for this page.
    }
    setOffer(null)
  }
  // The privacy policy and the 404 exist only in English; offer the homepage.
  const translated = localizedRoutes.some((r) => r.path === routePath)

  return (
    <div
      lang={offer.htmlLang}
      dir={offer.dir}
      class="border-line bg-surface fixed inset-x-4 bottom-4 z-(--z-sticky) mx-auto flex max-w-md items-center justify-between gap-3 rounded-xl border py-2 ps-4 pe-2 text-[0.875rem] shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
    >
      <a
        href={localePath(offer.code, translated ? routePath : '/')}
        hrefLang={offer.htmlLang}
        class="text-link hover:text-ink font-medium underline decoration-1 underline-offset-4 transition-colors duration-150"
      >
        {offer.suggest}
      </a>
      <button
        type="button"
        onClick={dismiss}
        aria-label={offer.dismiss}
        class="text-muted hover:text-ink grid size-8 shrink-0 place-items-center rounded-full text-lg leading-none transition-colors duration-150"
      >
        ×
      </button>
    </div>
  )
}
