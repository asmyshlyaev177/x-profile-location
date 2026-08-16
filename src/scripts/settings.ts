import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  MIN_CONFIDENCE_KEY,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
  THEME_KEY,
} from './constants'
// The vocabulary of every setting — its choices, its type and the normalizer
// that answers for `undefined`, which is what makes that answer the default.

/** A stored value as something to read fields off; anything else reads empty. */
function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

export interface HighlightFlagsSetting {
  enabled: boolean
  threshold: number
  uniqueOnly: boolean
}

export const DEFAULT_HIGHLIGHT_FLAGS: HighlightFlagsSetting = {
  enabled: false,
  threshold: 2,
  uniqueOnly: false,
}

/** A negative threshold would highlight every bio, which nobody chose. */
export function normalizeHighlightFlags(value: unknown): HighlightFlagsSetting {
  const v = asRecord(value)
  const threshold = finiteNumber(v.threshold)
  return {
    enabled: Boolean(v.enabled),
    threshold:
      threshold === null
        ? DEFAULT_HIGHLIGHT_FLAGS.threshold
        : Math.min(Math.max(Math.round(threshold), 0), 50),
    uniqueOnly: Boolean(v.uniqueOnly),
  }
}

export type HideBlockedMode = 'off' | 'collapse' | 'hide'

// Defaults to 'collapse' when nothing is stored. An explicitly-chosen 'off' is
// preserved (recognized here), so the user can still fully disable hiding.
export function normalizeHideBlockedMode(value: unknown): HideBlockedMode {
  return value === 'off' || value === 'collapse' || value === 'hide'
    ? value
    : 'collapse'
}

export interface SharedCacheCount {
  /** Accounts the server said it can answer for. */
  n: number
  /** Epoch ms it said so. */
  at: number
}

export function normalizeSharedCacheCount(
  value: unknown,
): SharedCacheCount | null {
  const v = asRecord(value)
  const n = finiteNumber(v.n)
  const at = finiteNumber(v.at)
  if (n === null || n < 0 || at === null || at <= 0) return null
  return { n: Math.floor(n), at }
}

// Measured live. A starting assumption and the figures the UI quotes — the real
// budget comes from the x-rate-limit-* response headers.
export const LOOKUP_LIMIT_PER_WINDOW = 50
export const LOOKUP_WINDOW_MINUTES = 15

export const DEFAULT_PREFETCH_SHARE = 0.8

/** The shares the options page offers, as fractions. */
export const PREFETCH_SHARE_CHOICES = [0.3, 0.5, 0.7, 0.8, 0.9] as const

// Hand-rolled because bare Number() turns null, '' and objects alike into 0.
export function finiteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || value.trim() === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

// Snapped to the nearest offered choice, ties to the smaller share, so storage,
// the options page and the content script can never disagree.
export function normalizePrefetchShare(value: unknown): number {
  const n = finiteNumber(value)
  if (n === null) return DEFAULT_PREFETCH_SHARE
  // Compared in whole percent: in fractions |0.3 - 0.4| > |0.5 - 0.4| by a float
  // hair, which would silently hand exact ties to the *larger* share.
  const pct = Math.round(n * 100)
  const distance = (choice: number) => Math.abs(Math.round(choice * 100) - pct)
  return PREFETCH_SHARE_CHOICES.reduce((best, choice) =>
    distance(choice) < distance(best) ? choice : best,
  )
}

export type PrefetchPacing = 'spread' | 'instant'

// Defaults to 'spread'; an explicitly-chosen 'instant' is preserved.
export function normalizePrefetchPacing(value: unknown): PrefetchPacing {
  return value === 'instant' ? 'instant' : 'spread'
}

export const DEFAULT_MIN_CONFIDENCE = 1

/** The thresholds the advanced options offer. */
export const MIN_CONFIDENCE_CHOICES = [1, 2, 3] as const

// Clamped rather than rejected: 0 or negative would trust anything, and an
// unreachable value would silently serve nothing forever.
export function normalizeMinConfidence(value: unknown): number {
  const n = finiteNumber(value)
  if (n === null) return DEFAULT_MIN_CONFIDENCE
  const rounded = Math.round(n)
  const lowest = MIN_CONFIDENCE_CHOICES[0]
  const highest = MIN_CONFIDENCE_CHOICES[MIN_CONFIDENCE_CHOICES.length - 1]
  return Math.min(Math.max(rounded, lowest), highest)
}

export const OPTIONS_TABS = [
  'display',
  'filters',
  'exceptions',
  'data',
  'advanced',
] as const

export type OptionsTabId = (typeof OPTIONS_TABS)[number]

export function normalizeOptionsTab(value: unknown): OptionsTabId {
  return OPTIONS_TABS.includes(value as OptionsTabId)
    ? (value as OptionsTabId)
    : 'display'
}

export const THEMES = ['system', 'light', 'dark'] as const

export type ThemePreference = (typeof THEMES)[number]

export function normalizeTheme(value: unknown): ThemePreference {
  return THEMES.includes(value as ThemePreference)
    ? (value as ThemePreference)
    : 'system'
}

export const POPUP_SECTIONS = ['locations', 'keywords'] as const

export type PopupSection = (typeof POPUP_SECTIONS)[number]

/** The section to open, or null for all collapsed — which is also the default. */
export function normalizePopupSection(value: unknown): PopupSection | null {
  return POPUP_SECTIONS.includes(value as PopupSection)
    ? (value as PopupSection)
    : null
}

// ---------------------------------------------------------------------------
// Use, and the one thing the popup asks for
// ---------------------------------------------------------------------------
// Neither key is a setting: not exported, not importable, not editable. They
// count days of use, because an install that never resolved a profile has no
// opinion to give.

export interface UsageStats {
  /** Local calendar days on which the content script did visible work. */
  activeDays: number
  /** The most recent of them, `YYYY-MM-DD`, so a day is counted once. */
  lastDay: string
}

export function normalizeUsageStats(value: unknown): UsageStats {
  const v = asRecord(value)
  const days = finiteNumber(v.activeDays)
  return {
    activeDays: days === null || days < 0 ? 0 : Math.floor(days),
    lastDay: typeof v.lastDay === 'string' ? v.lastDay : '',
  }
}

/** 'done' covers rating and refusing alike: a second ask loses the install. */
export interface RatePromptState {
  status: 'idle' | 'later' | 'done'
  /** Epoch ms the snooze expires. Meaningless unless status is 'later'. */
  snoozeUntil: number
}

export function normalizeRatePrompt(value: unknown): RatePromptState {
  const v = asRecord(value)
  const until = finiteNumber(v.snoozeUntil)
  return {
    status:
      v.status === 'later' || v.status === 'done'
        ? (v.status as 'later' | 'done')
        : 'idle',
    snoozeUntil: until === null || until < 0 ? 0 : until,
  }
}

// ---------------------------------------------------------------------------
// Filters, exceptions, and the allowlist
// ---------------------------------------------------------------------------

export interface AccountAgeFilter {
  enabled: boolean
  days: number
}

export const DEFAULT_ACCOUNT_AGE_DAYS = 180

/**
 * Months and years, not weeks: farmed accounts are registered in batches and
 * left to age, and a week-old account is visibly new without a filter.
 */
export const ACCOUNT_AGE_CHOICES = [90, 180, 365, 1095] as const

/** How a threshold is written in the UI: months up to a year, then years. */
export function formatAgeChoice(days: number): string {
  if (days < 60) return t('ageDays', days)
  if (days < 365) return t('ageMonths', Math.round(days / 30))
  const years = Math.round((days / 365) * 10) / 10
  return years === 1 ? t('ageYear') : t('ageYears', years)
}

export function normalizeAccountAge(value: unknown): AccountAgeFilter {
  const v = asRecord(value)
  const days = finiteNumber(v.days)
  return {
    enabled: Boolean(v.enabled),
    // Clamped, not snapped: the <select> choices are convenience, not the
    // domain, and snapping would quietly widen somebody's filter.
    days:
      days === null || days < 1
        ? DEFAULT_ACCOUNT_AGE_DAYS
        : Math.min(Math.round(days), 3650),
  }
}

// Every rule an account can be exempted from, individually.
export const FILTER_RULES = [
  'highlight',
  'location',
  'affiliation',
  'age',
] as const

export type FilterRule = (typeof FILTER_RULES)[number]

/**
 * Account age is deliberately absent: location and affiliation catch what the
 * user named on purpose, where "joined recently" catches whoever falls under it.
 */
export const HIDING_RULES: readonly FilterRule[] = ['location', 'affiliation']

/** Whether a rule may hide a post, as opposed to only marking it. */
export function ruleHides(rule: FilterRule): boolean {
  return HIDING_RULES.includes(rule)
}

export type RuleExceptions = Record<FilterRule, string[]>

/** A handle as it is stored and compared: lowercased, no leading @. */
export function normalizeHandle(value: string): string {
  return value.trim().replace(/^@+/, '').toLowerCase()
}

/** A stored handle list, cleaned of blanks and duplicates, order preserved. */
export function normalizeHandleList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of value) {
    if (typeof raw !== 'string') continue
    const handle = normalizeHandle(raw)
    if (!handle || seen.has(handle)) continue
    seen.add(handle)
    out.push(handle)
  }
  return out
}

/**
 * Per-rule exceptions, with `HIGHLIGHT_EXCEPTIONS_KEY` folded into the
 * `highlight` bucket. Read forever rather than migrated once: a storage rewrite
 * on load is a data-loss bug waiting for the install where it half-completes,
 * and leaving the old key also lets a downgrade find its exceptions.
 */
export function normalizeRuleExceptions(
  value: unknown,
  legacyHighlight?: unknown,
): RuleExceptions {
  const stored = asRecord(value)

  const out = {} as RuleExceptions
  for (const rule of FILTER_RULES) {
    out[rule] = normalizeHandleList(stored[rule])
  }

  if (legacyHighlight !== undefined) {
    const legacy = normalizeHandleList(legacyHighlight)
    if (legacy.length > 0) {
      out.highlight = normalizeHandleList([...out.highlight, ...legacy])
    }
  }
  return out
}

// Every user-facing setting, with the function that makes a stored value safe
// and — because it answers for `undefined` too — its default. Never read by hand.

import { canonicalLocation } from './countries/countries'
import { normalizeUiLanguage, t, UI_LANGUAGE_KEY } from './i18n'
// Type-only, so the keyword matcher stays out of the popup and options bundles.
import type { Keyword, MatchMode } from './keywords'

/** A stored value, cleaned. Returning undefined drops the key entirely. */
type Normalizer = (value: unknown) => unknown

// `undefined` is the only value meaning "never set": chrome.storage omits absent
// keys, and a removed one arrives as an undefined `newValue`.

const asBoolean =
  (fallback: boolean) =>
  (value: unknown): boolean =>
    value === undefined ? fallback : Boolean(value)

// Regions are deliberately not expanded here — that would turn one removable
// chip into fifty-seven. content.tsx expands them.
const asLocationList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map(canonicalLocation),
        ),
      ]
    : []

const asMatchMode = (value: unknown): MatchMode =>
  value === 'partial' ? 'partial' : 'word'

// Versions up to 1.7.3 stored a bare string per keyword, and a string still
// arrives from an export of one — it reads as the whole-word mode it had.
function asKeyword(value: unknown): Keyword | null {
  const v = typeof value === 'string' ? { text: value } : asRecord(value)
  if (typeof v.text !== 'string') return null
  const text = v.text.trim().toLowerCase()
  return text ? { text, mode: asMatchMode(v.mode) } : null
}

const asKeywordList = (v: unknown): Keyword[] => {
  if (!Array.isArray(v)) return []
  const seen = new Set<string>()
  return v.map(asKeyword).filter((kw): kw is Keyword => {
    if (!kw || seen.has(kw.text)) return false
    seen.add(kw.text)
    return true
  })
}

/** The one place a default is written down: every normalizer is total. */
export const SETTINGS_REGISTRY = {
  [EXTENSION_ENABLED_KEY]: asBoolean(true),
  [BLOCKED_COUNTRIES_KEY]: asLocationList,
  [BLOCKED_AFFILIATIONS_KEY]: normalizeHandleList,
  [ACCOUNT_AGE_KEY]: normalizeAccountAge,
  [HIDE_BLOCKED_LOCATIONS_KEY]: normalizeHideBlockedMode,
  [HIGHLIGHT_KEYWORDS_KEY]: asKeywordList,
  [HIGHLIGHT_FLAGS_KEY]: normalizeHighlightFlags,
  [RULE_EXCEPTIONS_KEY]: (v: unknown) => normalizeRuleExceptions(v),
  [HIGHLIGHT_EXCEPTIONS_KEY]: normalizeHandleList,
  [ALWAYS_SHOW_KEY]: normalizeHandleList,
  [SHOW_LOCATION_IN_FEED_KEY]: asBoolean(true),
  [SHOW_ACCOUNT_CARD_KEY]: asBoolean(true),
  [SHOW_EXCEPTION_BUTTON_KEY]: asBoolean(true),
  [SHOW_SHARE_BUTTON_KEY]: asBoolean(true),
  [THEME_KEY]: normalizeTheme,
  [UI_LANGUAGE_KEY]: normalizeUiLanguage,
  [SHARED_CACHE_KEY]: asBoolean(true),
  [BACKGROUND_PREFETCH_KEY]: asBoolean(true),
  [PREFETCH_SHARE_KEY]: normalizePrefetchShare,
  [PREFETCH_PACING_KEY]: normalizePrefetchPacing,
  [MIN_CONFIDENCE_KEY]: normalizeMinConfidence,
} satisfies Record<string, Normalizer>

export const SETTINGS_KEYS = Object.keys(SETTINGS_REGISTRY)

export type SettingKey = keyof typeof SETTINGS_REGISTRY
export type SettingValue<K extends SettingKey> = ReturnType<
  (typeof SETTINGS_REGISTRY)[K]
>

export function settingValue<K extends SettingKey>(
  key: K,
  stored: unknown,
): SettingValue<K> {
  return SETTINGS_REGISTRY[key](stored) as SettingValue<K>
}

export function readSetting<K extends SettingKey>(
  key: K,
  stored: Record<string, unknown>,
): SettingValue<K> {
  return settingValue(key, stored[key])
}

export function defaultSetting<K extends SettingKey>(key: K): SettingValue<K> {
  return settingValue(key, undefined)
}

// ---------------------------------------------------------------------------
// The two list edits both editors make
// ---------------------------------------------------------------------------
// Shared by the popup and the options page, which must agree on more than the
// key. Each returns the list it was given when nothing changed, so a caller
// comparing by identity knows whether it has anything to write.

// Whole-word unless the editor says otherwise, which is what every keyword
// stored before 1.7.4 meant. Changed afterwards from the chip — withKeywordMode.
export function withKeyword(
  keywords: Keyword[],
  keyword: string,
  mode: MatchMode = 'word',
): Keyword[] {
  const text = keyword.trim().toLowerCase()
  if (!text || keywords.some((k) => k.text === text)) return keywords
  return [...keywords, { text, mode }].sort((a, b) =>
    a.text < b.text ? -1 : 1,
  )
}

export function withoutKeyword(
  keywords: Keyword[],
  keyword: string,
): Keyword[] {
  const text = keyword.trim().toLowerCase()
  return keywords.filter((k) => k.text !== text)
}

export function withKeywordMode(
  keywords: Keyword[],
  keyword: string,
  mode: MatchMode,
): Keyword[] {
  const text = keyword.trim().toLowerCase()
  if (!keywords.some((k) => k.text === text && k.mode !== mode)) return keywords
  return keywords.map((k) => (k.text === text ? { text, mode } : k))
}

export function withLocation(blocked: string[], name: string): string[] {
  const location = canonicalLocation(name)
  if (!location || blocked.includes(location)) return blocked
  return [...blocked, location]
}

export function withoutLocation(blocked: string[], name: string): string[] {
  const location = canonicalLocation(name)
  return blocked.filter((l) => l !== location)
}

export const SETTINGS_FORMAT = 1

export interface SettingsFile {
  format: number
  exportedAt: string
  settings: Record<string, unknown>
}

/**
 * Only keys the user has actually set, so importing into a future version can't
 * pin today's defaults. Never the client id — it would link two installs.
 */
export async function exportSettings(): Promise<SettingsFile> {
  const stored = await chrome.storage.local.get(SETTINGS_KEYS)
  const settings: Record<string, unknown> = {}
  for (const key of SETTINGS_KEYS) {
    if (key in stored) settings[key] = stored[key]
  }
  return {
    format: SETTINGS_FORMAT,
    exportedAt: new Date().toISOString(),
    settings,
  }
}

export interface ImportResult {
  applied: string[]
  /** Keys in the file that this version has no setting for. */
  ignored: string[]
}

export class SettingsImportError extends Error {}

/** Merges rather than replaces: an older export must not reset what it omits. */
export async function importSettings(raw: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SettingsImportError(t('errNotJson'))
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SettingsImportError(t('errNotExport'))
  }

  const file = parsed as Partial<SettingsFile>
  const settings = file.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new SettingsImportError(t('errNoSection'))
  }

  if (typeof file.format === 'number' && file.format > SETTINGS_FORMAT) {
    throw new SettingsImportError(t('errNewerFormat', file.format))
  }

  const applied: string[] = []
  const ignored: string[] = []
  const patch: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(settings)) {
    // A file's keys are arbitrary strings: an older export, a newer one, a typo.
    const normalize = (SETTINGS_REGISTRY as Record<string, Normalizer>)[key] as
      | Normalizer
      | undefined
    if (!normalize) {
      ignored.push(key)
      continue
    }
    patch[key] = normalize(value)
    applied.push(key)
  }

  if (applied.length === 0) {
    throw new SettingsImportError(t('errNoSettings'))
  }

  // Setting one and not the other lets merge-on-read resurrect the stale side.
  if (RULE_EXCEPTIONS_KEY in patch) {
    const rules = patch[RULE_EXCEPTIONS_KEY] as { highlight: string[] }
    patch[HIGHLIGHT_EXCEPTIONS_KEY] = rules.highlight
  } else if (HIGHLIGHT_EXCEPTIONS_KEY in patch) {
    patch[RULE_EXCEPTIONS_KEY] = normalizeRuleExceptions(
      undefined,
      patch[HIGHLIGHT_EXCEPTIONS_KEY],
    )
  }

  await chrome.storage.local.set(patch)
  return { applied, ignored }
}

export function settingsFileName(now: Date = new Date()): string {
  return `x-pat-settings-${now.toISOString().slice(0, 10)}.json`
}
