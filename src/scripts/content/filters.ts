// Whether a rule acts on an account, and what to call it when it does. Owns the
// settings that decide it — nothing here draws anything. See "Filters, hiding
// and marking" in CLAUDE.md.

import {
  ACCOUNT_AGE_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  RULE_EXCEPTIONS_KEY,
} from '../constants'
import type { LocationData } from '../cache/cache'
import {
  canonicalLocation,
  COUNTRY_FLAGS,
  expandLocations,
  flagEmojiFor,
  REGION_ABBR,
  type RegionExclusions,
  REGION_FLAGS,
} from '../countries/countries'
import { localizedLocation } from '../countries/location-names'
import { t } from '../i18n'
import { accountAgeDays, formatAccountAge } from '../profile'
import {
  type AccountAgeFilter,
  defaultSetting,
  type FilterRule,
  normalizeRuleExceptions,
  type RuleExceptions,
  ruleHides,
} from '../settings'
import { classifySource } from '../source'

let blockedCountries = new Set<string>()
// The picks as the user made them, kept because either half of the expansion
// can change on its own and the other one is not in the storage event.
let blockedPicks: string[] = []
let regionExclusions: RegionExclusions = {}
// Per-rule exemptions: which accounts each filter must skip. `highlight` is the
// old single-purpose exception list, generalised — see normalizeRuleExceptions.
let ruleExceptions: RuleExceptions = normalizeRuleExceptions(undefined)
// Accounts exempt from every rule at once.
let alwaysShow = new Set<string>()
// Parent-org handles whose badged accounts are filtered.
let blockedAffiliations = new Set<string>()
// Filter accounts younger than N days. Off unless the user turns it on.
let accountAgeFilter: AccountAgeFilter = defaultSetting(ACCOUNT_AGE_KEY)

// Expansion lives here, not in storage: what the user picked and what it picks
// out are different things, and only the second belongs in a comparison.
function rebuildBlockedSet(): void {
  blockedCountries = expandLocations(blockedPicks, regionExclusions)
}

export function setBlockedPicks(picks: string[]): void {
  blockedPicks = picks
  rebuildBlockedSet()
}

export function setRegionExclusions(exclusions: RegionExclusions): void {
  regionExclusions = exclusions
  rebuildBlockedSet()
}

export function setAlwaysShow(handles: string[]): void {
  alwaysShow = new Set(handles)
}

export function setBlockedAffiliations(handles: string[]): void {
  blockedAffiliations = new Set(handles)
}

export function setAccountAgeFilter(filter: AccountAgeFilter): void {
  accountAgeFilter = filter
}

export function currentRuleExceptions(): RuleExceptions {
  return ruleExceptions
}

export function setRuleExceptions(next: RuleExceptions): void {
  ruleExceptions = next
}

/**
 * Both keys: reads merge the legacy one in, so writing only the new key would let
 * a removal come straight back — and a downgrade still finds its exceptions.
 */
export function writeRuleExceptions(next: RuleExceptions): void {
  ruleExceptions = next
  chrome.storage.local.set({
    [RULE_EXCEPTIONS_KEY]: next,
    [HIGHLIGHT_EXCEPTIONS_KEY]: next.highlight,
  })
}

export function isBlockedLocation(loc: string): boolean {
  return blockedCountries.has(canonicalLocation(loc))
}

export function isAlwaysShown(userName: string): boolean {
  return alwaysShow.has(userName.toLowerCase())
}

/** Exempt from this one rule (and from all of them, via the allowlist). */
export function isExcepted(rule: FilterRule, userName: string): boolean {
  const lc = userName.toLowerCase()
  return alwaysShow.has(lc) || ruleExceptions[rule].includes(lc)
}

/** Adds the account to every named rule's exception list, or drops it from all. */
export function toggleRuleExceptions(
  userName: string,
  rules: FilterRule[],
  excepted: boolean,
): void {
  const lc = userName.toLowerCase()
  const next = { ...ruleExceptions }
  for (const rule of rules) {
    if (!excepted) next[rule] = next[rule].filter((u) => u !== lc)
    else if (!next[rule].includes(lc)) next[rule] = [...next[rule], lc]
  }
  writeRuleExceptions(next)
}

/** Already exempt from everything the button covers — so it reads as "undo". */
export function exceptedFromAll(
  userName: string,
  rules: FilterRule[],
): boolean {
  const lc = userName.toLowerCase()
  return rules.every((rule) => ruleExceptions[rule].includes(lc))
}

/** With no handle to judge by, the rule counts as acting — it cannot under-warn. */
export function locationRuleActs(userName?: string | null): boolean {
  return !userName || !isExcepted('location', userName)
}

export function getLocationDisplay(
  loc: string,
  userName?: string | null,
): {
  emoji: string
  label: string
  isText?: boolean
} {
  // Flags are looked up by canonical name, so an alias X hasn't used before
  // ("Russia", "Vietnam") still gets its flag instead of the 🌐 fallback.
  const key = canonicalLocation(loc)
  // The one value here for reading rather than matching, so the one translated.
  const label = localizedLocation(key)

  // ⚠️ is the rule showing, not a property of the country: once the reader has
  // excepted the account, nothing is being filtered for it to warn about.
  if (isBlockedLocation(loc) && locationRuleActs(userName)) {
    return { emoji: '⚠️', label }
  }
  if (COUNTRY_FLAGS[key]) return { emoji: COUNTRY_FLAGS[key], label }
  if (REGION_FLAGS[key]) {
    const abbr = REGION_ABBR[key]
    return abbr
      ? { emoji: abbr, label, isText: true }
      : { emoji: REGION_FLAGS[key], label }
  }
  return { emoji: '🌐', label }
}

// The store country outranks the stated location — a store region is hard to
// fake — and a stated one X flagged inaccurate does not count at all.
function effectiveBlockedLocation(data: LocationData): string | null {
  const { country: sourceCountry } = classifySource(data.source)
  if (sourceCountry) {
    return isBlockedLocation(sourceCountry) ? sourceCountry : null
  }
  if (data.location && data.locationAccurate !== false) {
    return isBlockedLocation(data.location) ? data.location : null
  }
  return null
}

/** Why a post is being collapsed or hidden, for the placeholder to explain. */
export interface FilterMatch {
  rule: FilterRule
  label: string
  icon: string
}

/**
 * Every data-driven rule an account matches, exceptions ignored — the exception
 * button has to be able to name a rule already excepted, in order to undo it.
 */
export function ruleMatches(
  data: LocationData | null | undefined,
): FilterMatch[] {
  if (!data) return []
  const matches: FilterMatch[] = []

  const location = effectiveBlockedLocation(data)
  if (location) {
    matches.push({
      rule: 'location',
      label: location,
      icon: flagEmojiFor(location),
    })
  }

  const affiliation = data.facts?.affiliation
  if (affiliation?.handle && blockedAffiliations.has(affiliation.handle)) {
    matches.push({
      rule: 'affiliation',
      label: affiliation.name || `@${affiliation.handle}`,
      icon: '🏢',
    })
  }

  if (accountAgeFilter.enabled) {
    const days = accountAgeDays(data.facts?.createdAt)
    if (days !== null && days < accountAgeFilter.days) {
      matches.push({
        rule: 'age',
        label: `${formatAccountAge(data.facts?.createdAt) ?? `${days}d`} old`,
        icon: '🌱',
      })
    }
  }

  return matches
}

/** The one place the allowlist and the per-rule exceptions are applied. */
export function activeMatches(
  userName: string,
  data: LocationData | undefined,
): FilterMatch[] {
  if (isAlwaysShown(userName)) return []
  return ruleMatches(data).filter((m) => !isExcepted(m.rule, userName))
}

// Answered without waiting on IndexedDB, so a recycled post is collapsed in the
// microtask it arrives in and never laid out at another height.
const HIDE_VERDICT_CAP = 1000
const hideVerdicts = new Map<string, FilterMatch | null>()

function rememberHideVerdict(
  userName: string,
  match: FilterMatch | null,
): void {
  const key = userName.toLowerCase()
  hideVerdicts.delete(key) // re-insert to refresh LRU order
  hideVerdicts.set(key, match)
  if (hideVerdicts.size > HIDE_VERDICT_CAP) {
    const oldest = hideVerdicts.keys().next().value
    if (oldest !== undefined) hideVerdicts.delete(oldest)
  }
}

/** The last hide verdict for the account, or `undefined` if never judged. */
export function knownHideVerdict(
  userName: string,
): FilterMatch | null | undefined {
  return hideVerdicts.get(userName.toLowerCase())
}

export function forgetHideVerdicts(): void {
  hideVerdicts.clear()
}

/** The first rule that both fires and is allowed to hide, or null. */
export function hideMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  const match =
    activeMatches(userName, data).find((m) => ruleHides(m.rule)) ?? null
  // Only judgements made on a record we have: remembering "not looked up yet"
  // as "no" would keep the account from ever being hidden.
  if (data) rememberHideVerdict(userName, match)
  return match
}

/** The rule a post is marked for: the first one acting that does not hide. */
export function markMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data).find((m) => !ruleHides(m.rule)) ?? null
}

/** Rows are marked and never removed, so the hide/mark split doesn't apply. */
export function cellMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data)[0] ?? null
}

// Thunks, because the language can change while this script stays loaded — and
// still spelled `t('key')`, so messages.test.ts can see which keys are used.
export const FILTER_RULE_LABEL: Record<FilterRule, () => string> = {
  highlight: () => t('ruleNameHighlight'),
  location: () => t('ruleNameLocation'),
  affiliation: () => t('ruleNameAffiliation'),
  age: () => t('ruleNameAge'),
}

// What the tooltip calls each rule, phrased to read after "exempt @user from".
export const RULE_EXCEPTION_PHRASE: Record<FilterRule, () => string> = {
  highlight: () => t('excPhraseHighlight'),
  location: () => t('excPhraseLocation'),
  affiliation: () => t('excPhraseAffiliation'),
  age: () => t('excPhraseAge'),
}

export function joinPhrases(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  return t('joinAnd', items.slice(0, -1).join(', '), items[items.length - 1])
}

/** Only the location rule names something translatable; the rest are X's own. */
export function matchLabel(match: FilterMatch): string {
  return match.rule === 'location'
    ? localizedLocation(canonicalLocation(match.label))
    : match.label
}

export function __resetFilters(): void {
  blockedCountries = new Set()
  blockedPicks = []
  regionExclusions = {}
  ruleExceptions = normalizeRuleExceptions(undefined)
  alwaysShow = new Set()
  blockedAffiliations = new Set()
  accountAgeFilter = defaultSetting(ACCOUNT_AGE_KEY)
  hideVerdicts.clear()
}
