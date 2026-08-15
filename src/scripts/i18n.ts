import { MSG } from './constants'

// Localized strings: the reader's chosen catalogue first, the browser's own
// answer as default and fallback. See "Localization" in CLAUDE.md.

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

export function nativeLanguageName(locale: string): string {
  const tag = localeTagOf(locale)
  try {
    const name = new Intl.DisplayNames([tag], { type: 'language' }).of(tag)
    // CLDR lowercases these in several languages; a name reads better capitalised.
    return name ? name[0].toLocaleUpperCase(tag) + name.slice(1) : tag
  } catch {
    return tag
  }
}

/** For contexts with no `chrome.i18n`, i.e. happy-dom. Null in a browser. */
let injected: Record<string, string> | null = null

export function __setMessages(messages: Record<string, string> | null): void {
  injected = messages
}

/** Null means "use the browser". */
let chosen: Record<string, string> | null = null

/** `$1`…`$9`, and `$$` for a literal dollar — the messages.json rules. */
function substitute(message: string, subs: string[]): string {
  return message.replace(/\$(\$|\d)/g, (_, token: string) =>
    token === '$' ? '$' : (subs[Number(token) - 1] ?? ''),
  )
}

/**
 * The localized string for `key`, falling back to the key itself — a missing
 * message should be greppable in a bug report rather than an invisible gap.
 */
export function t(key: string, ...subs: (string | number)[]): string {
  const strings = subs.map(String)
  const local = injected?.[key] ?? chosen?.[key]
  if (local !== undefined) return substitute(local, strings)
  // `?.` throughout: a content script in a page being torn down can lose
  // `chrome` between one call and the next.
  const message = globalThis.chrome?.i18n?.getMessage?.(key, strings)
  return message ? message : key
}

/**
 * Which locale the strings are coming from, read out of the catalogue rather
 * than asked of the browser — which answers differently, see CLAUDE.md.
 */
export function uiLocale(): string {
  const tag = t('localeTag')
  // `t` falls back to the key, which is not a locale anything can parse.
  return tag === 'localeTag' ? 'en' : tag
}

// ---------------------------------------------------------------------------
// Loading a chosen language
// ---------------------------------------------------------------------------
// A content script cannot read `_locales/` without exposing it to x.com, so it
// asks the service worker instead. See "Localization" in CLAUDE.md.

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

/** Extension pages and the worker only — a content script cannot. */
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
      type: MSG.GET_MESSAGES,
      locale,
    })
    return (reply as Record<string, string> | null) ?? null
  } catch {
    // A sleeping worker, a missing directory: the browser's language will do.
    return null
  }
}

/** Every entry point awaits this before its first paint. */
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
