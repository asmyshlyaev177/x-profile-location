// Country and region names in the reader's language.
//
// None of this is translated by hand. A flag emoji is a pair of regional
// indicators encoding the ISO 3166-1 alpha-2 code — 🇦🇫 is literally A+F — so
// COUNTRY_FLAGS already carries the code for every country the extension knows,
// and `Intl.DisplayNames` turns that into a name in any locale the browser
// ships. 232 countries and twelve of the fourteen regions, for no strings.
//
// Display only. What gets stored, compared and sent anywhere stays the
// canonical English name: it is the vocabulary X itself reports, so folding a
// localized name into storage would make a blocked-country list unreadable to
// the code that has to match it against X's own strings — and unportable
// between two browsers set to different languages.

import { COUNTRY_FLAGS } from './countries'
import { t, uiLocale } from './i18n'

const REGIONAL_INDICATOR_A = 0x1f1e6

/**
 * The ISO 3166-1 alpha-2 code inside a flag emoji, or null for anything that
 * isn't one — the globes and continents REGION_FLAGS uses, mostly.
 */
export function isoFromFlag(flag: string): string | null {
  const points = [...flag].map((c) => c.codePointAt(0)!)
  if (points.length !== 2) return null
  const letters = points.map((p) => p - REGIONAL_INDICATOR_A)
  if (letters.some((n) => n < 0 || n > 25)) return null
  return letters.map((n) => String.fromCharCode(65 + n)).join('')
}

/**
 * UN M49 codes for the regions the picker offers. `Intl.DisplayNames` accepts
 * these alongside country codes, so "South Asia" localizes from the same table
 * the countries do.
 *
 * `North America` is 003 rather than 021: REGION_MEMBERS puts Guatemala, Cuba
 * and Jamaica in it, which is the whole continent (003), not the northern part
 * of it (021). The two regions with no M49 equivalent are absent and fall
 * through to a message key instead.
 */
const REGION_M49: Record<string, string> = {
  Africa: '002',
  'North Africa': '015',
  Europe: '150',
  'Eastern Europe': '151',
  'North America': '003',
  'South America': '005',
  'East Asia': '030',
  'Central Asia': '143',
  'South Asia': '034',
  'Southeast Asia': '035',
  'West Asia': '145',
  Australasia: '053',
}

/** The two regions M49 has no code for, translated by hand instead. */
const REGION_MESSAGE: Record<string, string> = {
  'East Asia & Pacific': 'regionEastAsiaPacific',
  'Eastern Europe (Non-EU)': 'regionEasternEuropeNonEu',
}

/** Every canonical name that has a code, and the code to look it up by. */
function codeFor(canonical: string): string | null {
  const flag = COUNTRY_FLAGS[canonical]
  if (flag) return isoFromFlag(flag)
  return REGION_M49[canonical] ?? null
}

/**
 * CLDR carries three widths for a country name, and both of the other two earn
 * their place:
 *
 * - `long` is the formal name — "Соединенные Штаты", "Amerika Birleşik
 *   Devletleri", "中華人民共和国香港特別行政区".
 * - `short` is what people actually say and type — "США", "ABD", "香港".
 *
 * So `short` is what gets *displayed*, because these sit in chips and one-line
 * rows where the formal name of Hong Kong is thirteen characters of nobody's
 * time; and every width goes into what the picker *matches*, so whichever one
 * the reader reaches for finds the country.
 */
const STYLES = ['short', 'long', 'narrow'] as const

function displayNamesFor(
  locale: string,
  style: (typeof STYLES)[number],
): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], {
      type: 'region',
      style,
      fallback: 'none',
    })
  } catch {
    return null
  }
}

/** `display.of`, answering null rather than throwing on a code CLDR retired. */
function nameOf(display: Intl.DisplayNames, code: string): string | null {
  try {
    return display.of(code) ?? null
  } catch {
    return null
  }
}

interface Localized {
  /** What the reader sees: one name per location. */
  display: Map<string, string>
  /** What the picker matches on: every width CLDR knows, deduplicated. */
  search: Map<string, string[]>
}

function buildNames(locale: string): Localized {
  const display = new Map<string, string>()
  const search = new Map<string, string[]>()

  // An English UI is the identity case, and going through DisplayNames for it
  // would quietly rename things: CLDR calls Myanmar "Myanmar (Burma)" and
  // Palestine "Palestinian Territories", where X — and so this extension —
  // says what X says.
  if (locale.toLowerCase().startsWith('en')) return { display, search }

  // Translated by hand, so these two work even where Intl has no data at all.
  for (const [canonical, key] of Object.entries(REGION_MESSAGE)) {
    display.set(canonical, t(key))
    search.set(canonical, [t(key)])
  }

  const byStyle = STYLES.map((style) => displayNamesFor(locale, style))
  if (byStyle.every((d) => d === null)) return { display, search }

  for (const canonical of [
    ...Object.keys(COUNTRY_FLAGS),
    ...Object.keys(REGION_M49),
  ]) {
    const code = codeFor(canonical)
    if (!code) continue
    // STYLES is short-first, so `names[0]` is the shortest CLDR offers and the
    // one worth putting on screen.
    const names = [
      ...new Set(byStyle.flatMap((d) => (d ? (nameOf(d, code) ?? []) : []))),
    ]
    if (names.length === 0) continue
    display.set(canonical, names[0])
    search.set(canonical, names)
  }

  return { display, search }
}

// Built once per locale rather than per render: ~750 DisplayNames lookups is
// nothing on its own and a great deal inside a list that re-renders on every
// keystroke of the picker's search box.
let cache: { locale: string; localized: Localized } | null = null

function localized(): Localized {
  const locale = uiLocale()
  if (cache?.locale !== locale) {
    cache = { locale, localized: buildNames(locale) }
  }
  return cache.localized
}

function displayNames(): Map<string, string> {
  return localized().display
}

/** Test seam: locale is read once and cached, so a test changing it needs this. */
export function __resetLocationNames(): void {
  cache = null
}

/**
 * `canonical` in the reader's language, or unchanged when there is no
 * translation for it — an English UI, a browser without the locale data, or a
 * string X reported that isn't a country the extension knows.
 */
export function localizedLocation(canonical: string): string {
  return displayNames().get(canonical) ?? canonical
}

/**
 * Sort by what the reader actually sees. The canonical list is alphabetical in
 * English, which puts a Russian picker in an order with no relation to the
 * names down its left edge — and a Japanese one in codepoint order rather than
 * by kana.
 */
export function sortByLocalizedName(canonicals: readonly string[]): string[] {
  const locale = uiLocale()
  return [...canonicals].sort((a, b) =>
    localizedLocation(a).localeCompare(localizedLocation(b), locale),
  )
}

/**
 * The alias worth showing beside a row in the picker, or undefined.
 *
 * The localized name is already the row's label, so repeating it underneath as
 * "this is why it matched" is noise — but "USA" or "Österreich" still is worth
 * saying.
 */
export function aliasNote(
  canonical: string,
  alias: string | undefined,
): string | undefined {
  return alias && alias !== localizedLocation(canonical) ? alias : undefined
}

/**
 * The picker's alias table with each option's localized name folded in, so a
 * Russian reader can find Japan by typing "Япония" and not only "Japan".
 *
 * Additive on purpose: the English name and the existing aliases ("USA", "BR",
 * "Österreich") keep working, which matters for anyone who set their browser to
 * one language and thinks about countries in another.
 */
export function withLocalizedAliases(
  base: Record<string, string[]>,
): Record<string, string[]> {
  const { search } = localized()
  if (search.size === 0) return base

  const out: Record<string, string[]> = { ...base }
  for (const [canonical, forms] of search) {
    const merged = [...(out[canonical] ?? [])]
    for (const form of forms) {
      if (form !== canonical && !merged.includes(form)) merged.push(form)
    }
    if (merged.length > 0) out[canonical] = merged
  }
  return out
}
