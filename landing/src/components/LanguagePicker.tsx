import { DEFAULT_LOCALE, localePath, locales } from '../i18n/locales'
import { useI18n } from '../i18n/context'
import { localizedRoutes } from '../routes'

/**
 * The language menu.
 *
 * A native `<details>`, for the same reason the FAQ is one: this site defers
 * hydration to idle, and a JS dropdown would leave the only route out of the
 * wrong language behind a click that does nothing for the first second. The
 * entries are real `<a href>`s to real prerendered URLs, so it also works with
 * scripting off entirely — and a crawler follows them, which is half the point
 * of translating the site.
 *
 * Every entry carries `hreflang` and its own `lang`, so the endonym is
 * announced in its own language rather than read as mangled English.
 */
export function LanguagePicker() {
  const { locale, routePath, t } = useI18n()

  // The privacy policy and the 404 exist only in English. Offering "this page
  // in Thai" for them would link to something that was never rendered, so the
  // menu falls back to each language's homepage there.
  const translated = localizedRoutes.some((r) => r.path === routePath)
  const target = translated ? routePath : '/'

  return (
    <details class="lang relative">
      <summary
        aria-label={t.language.label}
        class="text-body hover:text-text hover:border-hair-strong border-hair inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full border px-3 text-[0.8125rem] font-medium transition-colors duration-150 [&::-webkit-details-marker]:hidden"
      >
        <GlobeIcon />
        <span lang={locale.htmlLang}>{locale.name}</span>
      </summary>

      {/* `end-0` rather than `right-0`: on the Arabic pages the whole header
          mirrors, and a menu pinned to the physical right would hang off the
          side it is no longer anchored to. */}
      <ul
        class="border-hair bg-void absolute end-0 top-11 z-[var(--z-sticky)] max-h-[70vh] w-52 overflow-y-auto rounded-xl border py-1.5 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.9)]"
        aria-label={t.language.choose}
      >
        {locales.map((l) => {
          const current = l.code === locale.code
          // English is the bare path, so choosing it looks identical to never
          // having chosen anything. `#hl=en` is what makes the difference
          // legible to the preference script in `index.html` — without it, a
          // German speaker who deliberately switches to English gets sent
          // back to /de on their next visit.
          const to =
            localePath(l.code, target) +
            (l.code === DEFAULT_LOCALE ? '#hl=en' : '')
          return (
            <li key={l.code}>
              <a
                href={to}
                lang={l.htmlLang}
                hrefLang={l.htmlLang}
                aria-current={current ? 'true' : undefined}
                class={`block px-4 py-2 text-[0.875rem] transition-colors duration-150 ${
                  current
                    ? 'text-signal font-semibold'
                    : 'text-body hover:text-text hover:bg-ink-2'
                }`}
              >
                {l.name}
              </a>
            </li>
          )
        })}
      </ul>
    </details>
  )
}

function GlobeIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      aria-hidden="true"
      class="shrink-0"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  )
}
