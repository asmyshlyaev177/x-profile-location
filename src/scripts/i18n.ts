// Localized UI strings, from the browser's own i18n machinery — or from the
// language the reader picked.
//
// The catalogue lives in `public/_locales/<locale>/messages.json` and is copied
// verbatim into the build by Vite's publicDir, so the browser loads exactly one
// locale and the extension bundle carries no strings at all. That is also what
// makes the *store listing* localized: `default_locale` plus `__MSG_appName__`
// in the manifest tells Chrome and AMO to read the same files, so a translation
// lands on the listing and in the UI at once.
//
// `chrome.i18n` follows the browser's UI language and offers no way to override
// it, which is not good enough — plenty of people read Russian in an English
// Chrome. So a chosen language is honoured by loading that catalogue ourselves
// and answering from it first. The browser's own answer stays the default and
// the fallback, and costs nothing when nobody has chosen anything.

/** Locale directories, which are also the values `UI_LANGUAGE_KEY` stores. */
export const UI_LOCALES = [
  'en',
  'ar',
  'de',
  'es',
  'fil',
  'fr',
  'id',
  'ja',
  'ko',
  'pt_BR',
  'ru',
  'th',
  'tr',
  'vi',
  'zh_CN',
] as const

export type UiLocale = (typeof UI_LOCALES)[number]

/** '' means "whatever the browser is set to" — the default, and the way back. */
export const UI_LANGUAGE_KEY = 'uiLanguage'

export function normalizeUiLanguage(value: unknown): UiLocale | '' {
  return UI_LOCALES.includes(value as UiLocale) ? (value as UiLocale) : ''
}

/** `pt_BR` is a directory; `pt-BR` is what Intl and localeCompare want. */
export function localeTagOf(locale: string): string {
  return locale.replace('_', '-')
}

/**
 * The language's name in itself — "Русский", "日本語" — for the picker. Taken
 * from the same CLDR data the country names come from rather than a hand-kept
 * list, so it cannot go stale or disagree with them.
 */
export function nativeLanguageName(locale: string): string {
  const tag = localeTagOf(locale)
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
    // CLDR lowercases these in several languages, and a picker reads better
    // with them capitalised the way a name is.
    return name ? name[0].toLocaleUpperCase(tag) + name.slice(1) : tag
  } catch {
    return tag
  }
}

/**
 * Messages for contexts with no `chrome.i18n` — which in practice means the
 * happy-dom test environment. `tests.config.ts` fills this from the English
 * catalogue so assertions can keep reading real copy; in a browser it stays
 * null and every lookup goes to the browser or to the chosen language.
 */
let injected: Record<string, string> | null = null

export function __setMessages(messages: Record<string, string> | null): void {
  injected = messages
}

/** The chosen language's catalogue, once loaded. Null means "use the browser". */
let chosen: Record<string, string> | null = null

/** `$1`…`$9`, and `$$` for a literal dollar — the messages.json rules. */
function substitute(message: string, subs: string[]): string {
  return message.replace(/\$(\$|\d)/g, (_, token: string) =>
    token === '$' ? '$' : (subs[Number(token) - 1] ?? ''),
  )
}

/**
 * The localized string for `key`.
 *
 * Falls back to the key itself rather than throwing or rendering empty: a
 * missing message should be obvious in the UI and greppable in a bug report,
 * not an invisible gap. `messages.test.ts` is what actually keeps that from
 * happening — it checks every key used here exists in every locale.
 */
export function t(key: string, ...subs: (string | number)[]): string {
  const strings = subs.map(String)
  const local = injected?.[key] ?? chosen?.[key]
  if (local !== undefined) return substitute(local, strings)
  // `?.` on the whole chain: a content script in a page where the extension is
  // being torn down can lose `chrome` between one call and the next.
  const message = globalThis.chrome?.i18n?.getMessage?.(key, strings)
  return message ? message : key
}

/**
 * The locale the messages above are actually coming from, as a BCP 47 tag
 * ("ru", "pt-BR") — for the two things that need the locale itself rather than
 * a string: `Intl.DisplayNames` for country names, and `localeCompare` for
 * sorting them.
 *
 * Read out of the catalogue rather than asked of the browser, because the
 * browser gives a different answer. A Chrome started with `--lang=ru` serves
 * the `ru` catalogue while **both** `getUILanguage()` and `@@ui_locale` still
 * report `en_US` — which rendered every country name in English inside an
 * otherwise fully Russian settings page. `localeTag` cannot disagree with the
 * strings beside it, because it is one of them. `messages.test.ts` holds each
 * one to its own directory name.
 */
export function uiLocale(): string {
  const tag = t('localeTag')
  // `t` falls back to the key, which is not a locale anything can parse.
  return tag === 'localeTag' ? 'en' : tag
}

// ---------------------------------------------------------------------------
// Loading a chosen language
// ---------------------------------------------------------------------------
// Extension pages and the service worker can read their own files. A content
// script cannot: `fetch` on a `chrome-extension:` URL from x.com needs the file
// in `web_accessible_resources`, and a fetchable extension URL is something the
// page can probe for — the same reason the toolbar icon is inlined rather than
// exposed. So the content script asks the service worker, which has no such
// problem, and nothing under `_locales/` is reachable from the page.

function isExtensionPage(): boolean {
  return /^(chrome|moz|safari-web)-extension:$/.test(
    globalThis.location?.protocol ?? '',
  )
}

type Catalogue = Record<string, { message: string }>

function flatten(catalogue: Catalogue): Record<string, string> {
  return Object.fromEntries(
    Object.entries(catalogue).map(([key, entry]) => [key, entry.message]),
  )
}

/** Read a catalogue straight off disk. Extension pages and the worker only. */
export async function readCatalogue(
  locale: string,
): Promise<Record<string, string>> {
  const url = chrome.runtime.getURL(`_locales/${locale}/messages.json`)
  const response = await fetch(url)
  if (!response.ok) throw new Error(`no catalogue for ${locale}`)
  return flatten((await response.json()) as Catalogue)
}

async function loadMessages(
  locale: string,
): Promise<Record<string, string> | null> {
  try {
    if (isExtensionPage()) return await readCatalogue(locale)
    const reply = await chrome.runtime.sendMessage({
      type: 'GET_MESSAGES',
      locale,
    })
    return (reply as Record<string, string> | null) ?? null
  } catch {
    // A worker that is asleep and slow to wake, a locale directory that isn't
    // there. The browser's own language is a perfectly good answer.
    return null
  }
}

/**
 * Apply the stored language choice. Every entry point awaits this before it
 * renders — the strings are read synchronously afterwards, and a popup that
 * painted English and then swapped to Russian a frame later would be worse
 * than one that waited.
 *
 * Cheap when nothing is chosen, which is the common case: one storage read and
 * no fetch at all.
 *
 * Answers the locale now in effect, or '' for "whatever the browser said" —
 * which is how the content script knows whether anything it has already drawn
 * needs redrawing.
 */
export async function initI18n(): Promise<UiLocale | ''> {
  let choice: UiLocale | ''
  try {
    const stored = await chrome.storage.local.get(UI_LANGUAGE_KEY)
    choice = normalizeUiLanguage(stored[UI_LANGUAGE_KEY])
  } catch {
    return ''
  }
  chosen = choice ? await loadMessages(choice) : null
  return chosen ? choice : ''
}

/** Test seam, and how the service worker rebuilds its menu after a change. */
export function __setChosenMessages(
  messages: Record<string, string> | null,
): void {
  chosen = messages
}
