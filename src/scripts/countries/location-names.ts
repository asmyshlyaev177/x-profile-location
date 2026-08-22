// Country and region names in the reader's language, from CLDR rather than by
// hand. Display only — see "Location names & aliases" in CLAUDE.md.

import { COUNTRY_FLAGS } from './countries'
import { t, uiLocale } from '../i18n'

const REGIONAL_INDICATOR_A = 0x1f1e6

/** A flag emoji is its ISO 3166-1 alpha-2 code: 🇦🇫 is literally A+F. */
export function isoFromFlag(flag: string): string | null {
  const points = [...flag].map((c) => c.codePointAt(0)!)
  if (points.length !== 2) return null
  const letters = points.map((p) => p - REGIONAL_INDICATOR_A)
  if (letters.some((n) => n < 0 || n > 25)) return null
  return letters.map((n) => String.fromCharCode(65 + n)).join('')
}

// `North America` is 003, the whole continent, because REGION_MEMBERS puts
// Guatemala and Cuba in it — 021 is only the northern part.

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

function codeFor(canonical: string): string | null {
  const flag = COUNTRY_FLAGS[canonical]
  if (flag) return isoFromFlag(flag)
  return REGION_M49[canonical] ?? null
}

// Short-first: `short` is displayed ("США"), every width is searchable, so
// whichever the reader reaches for finds the country.

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

  // Identity case. CLDR would rename things — "Myanmar (Burma)" — where the
  // extension says what X says.
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
    // STYLES is short-first, so `names[0]` is the shortest CLDR offers.
    const names = [
      ...new Set(byStyle.flatMap((d) => (d ? (nameOf(d, code) ?? []) : []))),
    ]
    if (names.length === 0) continue
    display.set(canonical, names[0])
    search.set(canonical, names)
  }

  return { display, search }
}

// Per locale, not per render: ~750 lookups inside a list that re-renders on
// every keystroke of the picker.
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

export function __resetLocationNames(): void {
  cache = null
}

/** Unchanged when there is no translation — including anything X made up. */
export function localizedLocation(canonical: string): string {
  return displayNames().get(canonical) ?? canonical
}

/** By what the reader sees: the canonical list is alphabetical in English. */
export function sortByLocalizedName(canonicals: readonly string[]): string[] {
  const locale = uiLocale()
  return [...canonicals].sort((a, b) =>
    localizedLocation(a).localeCompare(localizedLocation(b), locale),
  )
}

/** Undefined when the alias is just the label again — that would be noise. */
export function aliasNote(
  canonical: string,
  alias: string | undefined,
): string | undefined {
  return alias && alias !== localizedLocation(canonical) ? alias : undefined
}

/** Localized names folded into the alias table additively: "Япония", "Japan"
 *  and "JP" all find Japan. */
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
