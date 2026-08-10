// Every user-facing setting, with the function that makes a stored value safe
// and — because it answers for `undefined` too — its default. Never read by hand.

import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  canonicalLocation,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  MIN_CONFIDENCE_KEY,
  normalizeAccountAge,
  normalizeHandleList,
  normalizeHideBlockedMode,
  normalizeHighlightFlags,
  normalizeMinConfidence,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  normalizeRuleExceptions,
  normalizeTheme,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
  THEME_KEY,
} from './countries'
import { normalizeUiLanguage, t, UI_LANGUAGE_KEY } from './i18n'

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

const asKeywordList = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map((k) => k.trim().toLowerCase())
            .filter(Boolean),
        ),
      ]
    : []

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

export function withKeyword(keywords: string[], keyword: string): string[] {
  const kw = keyword.trim().toLowerCase()
  if (!kw || keywords.includes(kw)) return keywords
  return [...keywords, kw].sort()
}

export function withoutKeyword(keywords: string[], keyword: string): string[] {
  const kw = keyword.trim().toLowerCase()
  return keywords.filter((k) => k !== kw)
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
