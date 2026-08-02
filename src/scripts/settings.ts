// Every user-facing setting, in one place, with the function that makes a
// stored value safe to use.
//
// This exists because settings are now written from three surfaces (the options
// page, the popup, and an imported file) and read by a fourth (the content
// script). Without a registry, "which keys are settings" is a fact spread
// across four files that drift apart the first time one is added — and an
// import would happily write a key nobody validates.
//
// An imported file is untrusted input: it can be hand-edited, it can come from
// a much older or newer version, it can be somebody else's. So import never
// stores a value it was given; it stores the result of putting that value
// through the same normalizer the extension itself uses on load.

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
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
} from './countries'

/** A stored value, cleaned. Returning undefined drops the key entirely. */
type Normalizer = (value: unknown) => unknown

const asBoolean: Normalizer = (v) => Boolean(v)

// Locations keep the user's own picks — regions are *not* expanded here, since
// expansion is a content-script concern and baking it into storage would turn
// one removable chip into fifty-seven.
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
 * Everything the user has actually set, as a pretty-printed JSON file.
 *
 * Keys that were never touched are left out rather than exported at their
 * default: an export should be a record of decisions, so that importing it into
 * a future version doesn't silently pin today's defaults forever.
 *
 * Deliberately absent: the anonymous shared-cache client id, and the location
 * cache. The first would let two installs be linked by importing one file into
 * both, which is exactly the correlation the server is designed not to permit.
 * The second is derived data that re-fetches itself.
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
 * Apply a settings file, validating every value on the way in.
 *
 * Merges rather than replaces: a file that omits a key leaves that setting
 * alone. Replacing would mean importing a partial or older export silently
 * resets everything it doesn't mention, which is not what "import my settings"
 * has ever meant to anyone.
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

  // The old highlight list is a mirror of the rule list's highlight bucket (see
  // writeHighlightExceptions in content.tsx). An import that set one and not
  // the other would leave the two disagreeing, and the merge-on-read would then
  // resurrect whatever the stale side still held.
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
