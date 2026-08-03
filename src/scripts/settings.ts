// Every user-facing setting, with the function that makes a stored value safe.
//
// Settings are written from three surfaces (options page, popup, imported file)
// and read by a fourth (the content script). Without a registry, "which keys are
// settings" drifts apart the first time one is added.
//
// An imported file is untrusted input — hand-edited, older, somebody else's — so
// import stores the normalizer's output, never the value it was given.

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

/** A stored value, cleaned. Returning undefined drops the key entirely. */
type Normalizer = (value: unknown) => unknown

const asBoolean: Normalizer = (v) => Boolean(v)

// Regions are not expanded here: that is a content-script concern, and baking it
// into storage would turn one removable chip into fifty-seven.
const asLocationList: Normalizer = (v) =>
  Array.isArray(v)
    ? [
        ...new Set(
          v
            .filter((x): x is string => typeof x === 'string')
            .map(canonicalLocation),
        ),
      ]
    : []

const asKeywordList: Normalizer = (v) =>
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

/**
 * The settings an export carries and an import may write, each with the
 * normalizer that has to agree with what the content script does on load.
 */
export const SETTINGS_REGISTRY: Record<string, Normalizer> = {
  [EXTENSION_ENABLED_KEY]: asBoolean,
  [BLOCKED_COUNTRIES_KEY]: asLocationList,
  [BLOCKED_AFFILIATIONS_KEY]: normalizeHandleList,
  [ACCOUNT_AGE_KEY]: normalizeAccountAge,
  [HIDE_BLOCKED_LOCATIONS_KEY]: normalizeHideBlockedMode,
  [HIGHLIGHT_KEYWORDS_KEY]: asKeywordList,
  [HIGHLIGHT_FLAGS_KEY]: normalizeHighlightFlags,
  [RULE_EXCEPTIONS_KEY]: (v) => normalizeRuleExceptions(v),
  [HIGHLIGHT_EXCEPTIONS_KEY]: normalizeHandleList,
  [ALWAYS_SHOW_KEY]: normalizeHandleList,
  [SHOW_LOCATION_IN_FEED_KEY]: asBoolean,
  [SHOW_ACCOUNT_CARD_KEY]: asBoolean,
  [SHOW_EXCEPTION_BUTTON_KEY]: asBoolean,
  [SHOW_SHARE_BUTTON_KEY]: asBoolean,
  [THEME_KEY]: normalizeTheme,
  [SHARED_CACHE_KEY]: asBoolean,
  [BACKGROUND_PREFETCH_KEY]: asBoolean,
  [PREFETCH_SHARE_KEY]: normalizePrefetchShare,
  [PREFETCH_PACING_KEY]: normalizePrefetchPacing,
  [MIN_CONFIDENCE_KEY]: normalizeMinConfidence,
}

export const SETTINGS_KEYS = Object.keys(SETTINGS_REGISTRY)

/** Bumped only if a future shape needs migrating on the way in. */
export const SETTINGS_FORMAT = 1

export interface SettingsFile {
  format: number
  exportedAt: string
  settings: Record<string, unknown>
}

/**
 * Everything the user has actually set, as pretty-printed JSON. Untouched keys
 * are left out: an export is a record of decisions, so importing it into a
 * future version can't pin today's defaults forever.
 *
 * Deliberately absent: the shared-cache client id, which would let two installs
 * be linked by importing one file into both, and the location cache, which
 * re-fetches itself.
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

/**
 * Apply a settings file, validating every value on the way in. Merges rather
 * than replaces, so a partial or older export doesn't silently reset everything
 * it fails to mention.
 */
export async function importSettings(raw: string): Promise<ImportResult> {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new SettingsImportError('That file is not valid JSON.')
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new SettingsImportError('That file is not a settings export.')
  }

  const file = parsed as Partial<SettingsFile>
  const settings = file.settings
  if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
    throw new SettingsImportError(
      'That file is missing its "settings" section, so it is not an export from this extension.',
    )
  }

  if (typeof file.format === 'number' && file.format > SETTINGS_FORMAT) {
    throw new SettingsImportError(
      `That file was written by a newer version (format ${file.format}). Update the extension first.`,
    )
  }

  const applied: string[] = []
  const ignored: string[] = []
  const patch: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(settings)) {
    const normalize = SETTINGS_REGISTRY[key]
    if (!normalize) {
      ignored.push(key)
      continue
    }
    patch[key] = normalize(value)
    applied.push(key)
  }

  if (applied.length === 0) {
    throw new SettingsImportError('That file contains no settings to import.')
  }

  // The old highlight list mirrors the rule list's highlight bucket. Setting one
  // and not the other lets merge-on-read resurrect the stale side.
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

/** A filename that sorts by date and says what it is. */
export function settingsFileName(now: Date = new Date()): string {
  return `x-pat-settings-${now.toISOString().slice(0, 10)}.json`
}
