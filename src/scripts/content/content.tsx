import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  EVENTS,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  MIN_CONFIDENCE_KEY,
  MSG,
  RATE_LIMIT_RESET_DEFAULT_MS,
  RATE_PROMPT_KEY,
  REGION_EXCLUSIONS_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
  USAGE_STATS_KEY,
  X_GRAPHQL_PATH,
} from '../constants'
// content.tsx — plain DOM, no React/Preact
import {
  cleanupCache,
  clearAllCache,
  getCached,
  mergeCached,
} from '../cache/cache'
import {
  emojiKeywords,
  findKeywordMatches,
  type Keyword,
  matchesAnyKeyword,
  setKeywords,
} from '../keywords'
import type { LocationData } from '../cache/cache'
import {
  canonicalLocation,
  COUNTRY_FLAGS,
  expandLocations,
  flagFor,
  REGION_ABBR,
  type RegionExclusions,
  REGION_FLAGS,
} from '../countries/countries'
import {
  type AccountAgeFilter,
  defaultSetting,
  FILTER_RULES,
  type FilterRule,
  type HideBlockedMode,
  normalizeRuleExceptions,
  readSetting,
  type RuleExceptions,
  ruleHides,
  type SettingKey,
  type SettingValue,
  settingValue,
} from '../settings'
import { initI18n, t, UI_LANGUAGE_KEY } from '../i18n'
import { localizedLocation } from '../countries/location-names'
import {
  contributeLocation,
  flushContributions,
  isSharedCacheConfigured,
  isSharedCacheEnabled,
  setMinConfidence,
  setSharedCacheEnabled,
  sharedBatchLookup,
} from '../cache/shared-cache'
import { PrefetchPoller } from '../prefetch/prefetch-poller'
import type {
  PrefetchCandidate,
  PrefetchPriority,
} from '../prefetch/prefetch-queue'
import type {
  LookupReport,
  NextInstruction,
  TabState,
} from '../prefetch/lookup-broker'
import {
  accountAgeDays,
  definedFacts,
  formatAccountAge,
  parseAccountFacts,
} from '../profile'
import type { AccountFacts } from '../profile'
import { buildSourceGlyph, classifySource, platformLabel } from '../source'
import {
  noteActiveDay,
  noteRatingAskShown,
  ratingAskDue,
  REVIEW_URL,
  setRatePromptState,
} from '../usage'
import toolbarIconUrl from '../../assets/icons/icon-32x32.png?inline'
import { deliverShareCard, renderShareCard } from '../share-card'
import { allowGrowth, snapshotElement } from '../snapshot'
import { drawWatermark, WATERMARK_BAND } from '../watermark'
import {
  CONTENT_CSS,
  emojiKeywordCss,
  HIDDEN_ATTR,
  HIDDEN_PLACEHOLDER_CLASS,
  KEYWORD_HIGHLIGHT_NAME,
  KEYWORD_MATCH_ATTR,
  LOCATION_TOAST_ID,
  PEOPLE_MATCH_ATTR,
  QUOTE_HIDDEN_ATTR,
  RATE_TOAST_ID,
  RATING_ASK_ID,
  TWEET_MARK_ATTR,
} from '../styles'

const QUERY_ID = 'XRqGa7EeokUU5kppkh13EA'
const API_BASE = `https://${X_GRAPHQL_PATH}`
const ABOUT_ACCOUNT_URL = `${API_BASE}/${QUERY_ID}/AboutAccountQuery`

// X related selectors
const SEL_HOVER_CARD = '[data-testid="HoverCard"]'
const SEL_USER_NAME = '[data-testid="UserName"] a[href]'
const SEL_USER_NAME_ALT = '[data-testid="User-Name"] a[href]'
const SEL_TWEET = 'article[data-testid="tweet"]'
const SEL_PRIMARY_TWEET = `${SEL_TWEET}[tabindex="-1"]`
const PRIMARY_TWEET_ATTR = 'data-x-loc-primary-done'
const QUOTE_HIGHLIGHT_ATTR = 'data-x-loc-quote-highlighted'
const HIDDEN_REVEALED_ATTR = 'data-x-loc-revealed'
// The "revealed" half of the quote pair; its hidden half is QUOTE_HIDDEN_ATTR,
// which lives in styles.ts with the CSS written against it.
const QUOTE_REVEALED_ATTR = 'data-x-loc-quote-revealed'
// Followers / Following / search-people rows.
const SEL_USER_CELL = '[data-testid="UserCell"]'
const PEOPLE_CELL_ATTR = 'data-x-loc-cell-done'

const RE_SCREEN_NAME_HREF = /^\/([A-Za-z0-9_]{1,50})$/
const RE_AT_MENTION = /^@[A-Za-z0-9_]{1,50}$/

// ---------------------------------------------------------------------------
// Blocked countries (loaded from chrome.storage.local, set via options page)
// ---------------------------------------------------------------------------
let blockedCountries = new Set<string>()
// The picks as the user made them, kept because either half of the expansion
// can change on its own and the other one is not in the storage event.
let blockedPicks: string[] = []
let regionExclusions: RegionExclusions = {}

// Expansion lives here, not in storage: what the user picked and what it picks
// out are different things, and only the second belongs in a comparison.
function rebuildBlockedSet(): void {
  blockedCountries = expandLocations(blockedPicks, regionExclusions)
}

function isBlockedLocation(loc: string): boolean {
  return blockedCountries.has(canonicalLocation(loc))
}

// Every default below comes from SETTINGS_REGISTRY, so a default lives in one
// place rather than here, in the popup and in the options page.
const DEFAULT_FLAGS = defaultSetting(HIGHLIGHT_FLAGS_KEY)

let highlightKeywords: Keyword[] = []
let highlightFlagsEnabled = DEFAULT_FLAGS.enabled
let highlightFlagsThreshold = DEFAULT_FLAGS.threshold
let highlightFlagsUniqueOnly = DEFAULT_FLAGS.uniqueOnly
let showLocationInFeed = defaultSetting(SHOW_LOCATION_IN_FEED_KEY)
// 'off' is a pre-load placeholder, not the stored default: nothing should be
// hidden on a guess before settings arrive.
let hideMode: HideBlockedMode = 'off'
// Per-rule exemptions: which accounts each filter must skip. `highlight` is the
// old single-purpose exception list, generalised — see normalizeRuleExceptions.
let ruleExceptions: RuleExceptions = normalizeRuleExceptions(undefined)
// Accounts exempt from every rule at once.
let alwaysShow = new Set<string>()
// Parent-org handles whose badged accounts are filtered.
let blockedAffiliations = new Set<string>()
// Filter accounts younger than N days. Off unless the user turns it on.
let accountAgeFilter: AccountAgeFilter = defaultSetting(ACCOUNT_AGE_KEY)
// Whether to render the one-click exception button on hover cards.
let showExceptionButton = defaultSetting(SHOW_EXCEPTION_BUTTON_KEY)
// Whether hover cards get the account-facts card under the location row.
let showAccountCard = defaultSetting(SHOW_ACCOUNT_CARD_KEY)
// Whether hover cards get the "Copy card" button.
let showShareButton = defaultSetting(SHOW_SHARE_BUTTON_KEY)
// Whether background location prefetching runs.
let prefetchEnabled = defaultSetting(BACKGROUND_PREFETCH_KEY)
// Flipping it off strips what is already on screen; a switch that only stopped
// new work would leave the page half-decorated.
let extensionEnabled = defaultSetting(EXTENSION_ENABLED_KEY)

function isAlwaysShown(userName: string): boolean {
  return alwaysShow.has(userName.toLowerCase())
}

/** Exempt from this one rule (and from all of them, via the allowlist). */
function isExcepted(rule: FilterRule, userName: string): boolean {
  const lc = userName.toLowerCase()
  return alwaysShow.has(lc) || ruleExceptions[rule].includes(lc)
}

chrome.storage.local
  .get([
    EXTENSION_ENABLED_KEY,
    BLOCKED_COUNTRIES_KEY,
    REGION_EXCLUSIONS_KEY,
    HIGHLIGHT_KEYWORDS_KEY,
    HIGHLIGHT_FLAGS_KEY,
    SHOW_LOCATION_IN_FEED_KEY,
    HIGHLIGHT_EXCEPTIONS_KEY,
    RULE_EXCEPTIONS_KEY,
    ALWAYS_SHOW_KEY,
    BLOCKED_AFFILIATIONS_KEY,
    ACCOUNT_AGE_KEY,
    SHOW_EXCEPTION_BUTTON_KEY,
    SHOW_ACCOUNT_CARD_KEY,
    SHOW_SHARE_BUTTON_KEY,
    SHARED_CACHE_KEY,
    MIN_CONFIDENCE_KEY,
    HIDE_BLOCKED_LOCATIONS_KEY,
    BACKGROUND_PREFETCH_KEY,
  ])
  .then((result) => {
    const r = result as Record<string, unknown>
    extensionEnabled = readSetting(EXTENSION_ENABLED_KEY, r)
    blockedPicks = readSetting(BLOCKED_COUNTRIES_KEY, r)
    regionExclusions = readSetting(REGION_EXCLUSIONS_KEY, r)
    rebuildBlockedSet()
    highlightKeywords = readSetting(HIGHLIGHT_KEYWORDS_KEY, r)
    setKeywords(highlightKeywords)
    updateKeywordEmojiStyle()
    const flags = readSetting(HIGHLIGHT_FLAGS_KEY, r)
    highlightFlagsEnabled = flags.enabled
    highlightFlagsThreshold = flags.threshold
    highlightFlagsUniqueOnly = flags.uniqueOnly
    showLocationInFeed = readSetting(SHOW_LOCATION_IN_FEED_KEY, r)
    ruleExceptions = normalizeRuleExceptions(
      r[RULE_EXCEPTIONS_KEY],
      r[HIGHLIGHT_EXCEPTIONS_KEY],
    )
    alwaysShow = new Set(readSetting(ALWAYS_SHOW_KEY, r))
    blockedAffiliations = new Set(readSetting(BLOCKED_AFFILIATIONS_KEY, r))
    accountAgeFilter = readSetting(ACCOUNT_AGE_KEY, r)
    showExceptionButton = readSetting(SHOW_EXCEPTION_BUTTON_KEY, r)
    showAccountCard = readSetting(SHOW_ACCOUNT_CARD_KEY, r)
    showShareButton = readSetting(SHOW_SHARE_BUTTON_KEY, r)
    hideMode = readSetting(HIDE_BLOCKED_LOCATIONS_KEY, r)
    prefetchEnabled = readSetting(BACKGROUND_PREFETCH_KEY, r)
    // The share and the pacing are the broker's, not this tab's — it reads them
    // itself so every tab is spending against one set of numbers.
    // Inert unless a server URL is configured (see CACHE_API_BASE in constants.ts).
    setSharedCacheEnabled(readSetting(SHARED_CACHE_KEY, r))
    setMinConfidence(r[MIN_CONFIDENCE_KEY])

    // Tweets can render before this resolves, so the first screen is decorated
    // here rather than waiting for a scroll.
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPoller()
    window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_USERS))
  })

/** Attributes and injected nodes only — never markup React owns. */
function stripAllInjections(): void {
  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    article.removeAttribute('data-x-loc-highlighted')
    article.removeAttribute(HIDDEN_ATTR)
    article.removeAttribute(TWEET_MARK_ATTR)
    article.removeAttribute(FEED_LOCATION_ATTR)
    article.removeAttribute(PRIMARY_TWEET_ATTR)
    const quote = getQuotedTweetEl(article)
    quote?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    quote?.removeAttribute(QUOTE_HIDDEN_ATTR)
    quote?.removeAttribute(TWEET_MARK_ATTR)
  }
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    cell.removeAttribute(PEOPLE_MATCH_ATTR)
  }
  document
    .querySelectorAll(
      `.x-loc-info, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-exc-btn, .x-loc-card, .x-loc-cell-tag, .x-loc-bio`,
    )
    .forEach((el) => el.remove())
  document.querySelectorAll(`[${HOVER_CARD_DONE_ATTR}]`).forEach((el) => {
    el.removeAttribute(HOVER_CARD_DONE_ATTR)
  })
  clearKeywordMarks()
  updateKeywordEmojiStyle()
  dismissLocationToast()
  dismissRatingAsk()
  document.getElementById(RATE_TOAST_ID)?.remove()
}

type StorageChanges = Record<string, chrome.storage.StorageChange>

/**
 * The shape every setting change follows: present in the batch, normalized
 * through the registry, then applied. A removed key arrives as an undefined
 * `newValue`, which the normalizer answers with the default.
 */
function onSettingChange<K extends SettingKey>(
  changes: StorageChanges,
  key: K,
  apply: (value: SettingValue<K>) => void,
): void {
  if (changes[key]) apply(settingValue(key, changes[key].newValue))
}

/** Returns whether the rest of the changes are worth applying at all. */
function applyMasterSwitch(changes: StorageChanges): boolean {
  if (changes[EXTENSION_ENABLED_KEY]) {
    extensionEnabled = settingValue(
      EXTENSION_ENABLED_KEY,
      changes[EXTENSION_ENABLED_KEY].newValue,
    )
    if (!extensionEnabled) {
      stripAllInjections()
      poller.stop()
      return false
    }
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPoller()
  }
  return extensionEnabled
}

function applyFilterChanges(changes: StorageChanges): void {
  onSettingChange(changes, BLOCKED_COUNTRIES_KEY, (value) => {
    blockedPicks = value
    rebuildBlockedSet()
    // Editing the list can newly block (or unblock) locations already on screen.
    void refreshHiddenTweets()
  })
  onSettingChange(changes, REGION_EXCLUSIONS_KEY, (value) => {
    regionExclusions = value
    rebuildBlockedSet()
    void refreshHiddenTweets()
  })
  // Both keys arrive together, so the general one wins and the legacy one is a
  // fallback — that is what makes a removal stick.
  if (changes[RULE_EXCEPTIONS_KEY]) {
    // The write already folded in the legacy list (writeHighlightExceptions),
    // so merging it again here would resurrect anything just removed.
    ruleExceptions = normalizeRuleExceptions(
      changes[RULE_EXCEPTIONS_KEY].newValue,
    )
    rehighlightAll()
    void refreshHiddenTweets()
  } else if (changes[HIGHLIGHT_EXCEPTIONS_KEY]) {
    // The old key moving on its own: an install still running the previous
    // version in another tab, or storage edited by hand.
    ruleExceptions = normalizeRuleExceptions(
      { ...ruleExceptions, highlight: [] },
      changes[HIGHLIGHT_EXCEPTIONS_KEY].newValue,
    )
    rehighlightAll()
    void refreshHiddenTweets()
  }
  onSettingChange(changes, ALWAYS_SHOW_KEY, (value) => {
    alwaysShow = new Set(value)
    rehighlightAll()
    void refreshHiddenTweets()
  })
  onSettingChange(changes, BLOCKED_AFFILIATIONS_KEY, (value) => {
    blockedAffiliations = new Set(value)
    void refreshHiddenTweets()
  })
  onSettingChange(changes, ACCOUNT_AGE_KEY, (value) => {
    accountAgeFilter = value
    void refreshHiddenTweets()
  })
  onSettingChange(changes, HIDE_BLOCKED_LOCATIONS_KEY, (value) => {
    hideMode = value
    void refreshHiddenTweets()
    syncPoller()
  })
}

function applyDisplayChanges(changes: StorageChanges): void {
  onSettingChange(changes, HIGHLIGHT_KEYWORDS_KEY, (value) => {
    highlightKeywords = value
    setKeywords(highlightKeywords)
    updateKeywordEmojiStyle()
    rehighlightAll()
  })
  onSettingChange(changes, HIGHLIGHT_FLAGS_KEY, (value) => {
    highlightFlagsEnabled = value.enabled
    highlightFlagsThreshold = value.threshold
    highlightFlagsUniqueOnly = value.uniqueOnly
    rehighlightAll()
  })
  onSettingChange(changes, SHOW_LOCATION_IN_FEED_KEY, (value) => {
    showLocationInFeed = value
    refreshFeedLocations()
    syncPoller()
  })
  onSettingChange(changes, SHOW_EXCEPTION_BUTTON_KEY, (value) => {
    showExceptionButton = value
  })
  onSettingChange(changes, SHOW_ACCOUNT_CARD_KEY, (value) => {
    showAccountCard = value
  })
  onSettingChange(changes, SHOW_SHARE_BUTTON_KEY, (value) => {
    showShareButton = value
  })
}

function applyLookupChanges(changes: StorageChanges): void {
  onSettingChange(changes, SHARED_CACHE_KEY, (value) => {
    setSharedCacheEnabled(value)
    // Opting out of the community cache also stops background prefetch, which
    // exists to warm it — and opting back in restarts it.
    syncPoller()
  })
  if (changes[MIN_CONFIDENCE_KEY]) {
    setMinConfidence(changes[MIN_CONFIDENCE_KEY].newValue)
  }
  onSettingChange(changes, BACKGROUND_PREFETCH_KEY, (value) => {
    prefetchEnabled = value
    syncPoller()
  })
}

/**
 * Everything on screen, redrawn. The incremental refreshes compare rules, and a
 * language change moves none of them — only the words.
 */
function relocalize(): void {
  if (!extensionEnabled) return
  stripAllInjections()
  rehighlightAll()
  refreshFeedLocations()
  void refreshHiddenTweets()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[UI_LANGUAGE_KEY]) {
    void initI18n().then(relocalize)
    return
  }
  if (!applyMasterSwitch(changes)) return
  if (changes[USAGE_STATS_KEY] || changes[RATE_PROMPT_KEY]) {
    // Re-arm, or a tab left open across the day that earns the ask never asks —
    // and X is exactly the page people leave open for days.
    ratingAskConsidered = false
  }
  applyFilterChanges(changes)
  applyDisplayChanges(changes)
  applyLookupChanges(changes)
})

/** With no handle to judge by, the rule counts as acting — it cannot under-warn. */
function locationRuleActs(userName?: string | null): boolean {
  return !userName || !isExcepted('location', userName)
}

function getLocationDisplay(
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
interface FilterMatch {
  rule: FilterRule
  label: string
  icon: string
}

/**
 * Every data-driven rule an account matches, exceptions ignored — the exception
 * button has to be able to name a rule already excepted, in order to undo it.
 */
function ruleMatches(data: LocationData | null | undefined): FilterMatch[] {
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
function activeMatches(
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

/** The first rule that both fires and is allowed to hide, or null. */
function hideMatchFor(
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
function markMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data).find((m) => !ruleHides(m.rule)) ?? null
}

/** Rows are marked and never removed, so the hide/mark split doesn't apply. */
function cellMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data)[0] ?? null
}

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------
let apiHeaders: Record<string, string> | null = null
export function setApiHeaders(h: Record<string, string> | null) {
  apiHeaders = h
}

// Tracks users whose location was already fetched via API this session,
// so repeat hovers skip the network and read from IDB instead.
const checkedThisSession = new Set<string>()
// Shared promises, keyed by lowercased handle — lets concurrent processCard
// calls for the same user await the same in-flight fetch instead of getting
// null immediately.
const pendingMap = new Map<string, Promise<LocationData | null>>()
let rateLimitResetAt = 0
let rateLimitToastInterval: ReturnType<typeof setInterval> | null = null
// Every blocked lookup calls showRateLimitToast, so without this the next hover
// would undo the click.
let rateLimitToastDismissedUntil = 0

function intHeader(resp: Response, name: string): number | null {
  const raw = resp.headers.get(name)
  if (raw === null) return null
  const n = parseInt(raw)
  return Number.isNaN(n) ? null : n
}

/**
 * The window is counted in the service worker, not here — every open x.com tab
 * spends from the same 50. All this side does is pass on what X answered, for
 * hovers and background lookups alike. See "Cross-tab lookup broker" in CLAUDE.md.
 */
function readRateHeaders(resp: Response): Partial<LookupReport> {
  return {
    status: resp.status,
    limit: intHeader(resp, 'x-rate-limit-limit'),
    remaining: intHeader(resp, 'x-rate-limit-remaining'),
    reset: intHeader(resp, 'x-rate-limit-reset'),
  }
}

function tabState(): TabState {
  return {
    focused: document.hasFocus(),
    visible: document.visibilityState !== 'hidden',
  }
}

async function askBroker<T>(message: object): Promise<T | null> {
  try {
    return (await chrome.runtime.sendMessage({
      ...message,
      tab: tabState(),
    })) as T
  } catch {
    // An evicted or reloading worker must never take a lookup down with it.
    return null
  }
}

function reportLookup(report: LookupReport): Promise<unknown> {
  return askBroker({ type: MSG.REPORT, report })
}

// In memory so highlighting reads synchronously rather than racing mergeCached.
// A fast path only — every bio also lands in IDB, and eviction falls back to it.
const BIO_CACHE_CAP = 1000

interface ProfileInfo {
  bio: string | null
  displayName: string | null
  facts: Partial<AccountFacts>
}

const bioCache = new Map<string, ProfileInfo>()

function rememberBio(
  userName: string,
  bio: string | null,
  displayName: string | null,
  facts: Partial<AccountFacts> = {},
): void {
  const key = userName.toLowerCase()
  const prev = bioCache.get(key)
  bioCache.delete(key) // re-insert to refresh LRU order
  bioCache.set(key, {
    bio: bio ?? prev?.bio ?? null,
    displayName: displayName ?? prev?.displayName ?? null,
    // Merged for the same reason mergeCached merges it: each sighting of an
    // account knows a different subset.
    facts: { ...prev?.facts, ...facts },
  })
  if (bioCache.size > BIO_CACHE_CAP) {
    const oldest = bioCache.keys().next().value
    if (oldest !== undefined) bioCache.delete(oldest)
  }
}

async function getBioInfo(userName: string): Promise<ProfileInfo> {
  const mem = bioCache.get(userName.toLowerCase())
  if (mem) return mem
  const data = await getCached(userName)
  return {
    bio: data?.bio ?? null,
    displayName: data?.displayName ?? null,
    facts: data?.facts ?? {},
  }
}

// Keep exhaustive: a module-scope `let` missing here is a new order dependency,
// and the suite would pass only in the order it happens to run.
export function __testResetState() {
  // settings, back to what the declarations above start them at
  blockedCountries = new Set()
  blockedPicks = []
  regionExclusions = {}
  highlightKeywords = []
  setKeywords([])
  highlightFlagsEnabled = DEFAULT_FLAGS.enabled
  highlightFlagsThreshold = DEFAULT_FLAGS.threshold
  highlightFlagsUniqueOnly = DEFAULT_FLAGS.uniqueOnly
  showLocationInFeed = defaultSetting(SHOW_LOCATION_IN_FEED_KEY)
  hideMode = 'off'
  ruleExceptions = normalizeRuleExceptions(undefined)
  alwaysShow = new Set()
  blockedAffiliations = new Set()
  accountAgeFilter = defaultSetting(ACCOUNT_AGE_KEY)
  showAccountCard = defaultSetting(SHOW_ACCOUNT_CARD_KEY)
  showShareButton = defaultSetting(SHOW_SHARE_BUTTON_KEY)
  showExceptionButton = defaultSetting(SHOW_EXCEPTION_BUTTON_KEY)
  prefetchEnabled = defaultSetting(BACKGROUND_PREFETCH_KEY)
  extensionEnabled = defaultSetting(EXTENSION_ENABLED_KEY)

  clearKeywordMarks()
  updateKeywordEmojiStyle()

  // session caches and in-flight work
  lastRightClickedTweet = null
  lastHoveredTweet = null
  checkedThisSession.clear()
  pendingMap.clear()
  bioCache.clear()
  apiHeaders = null

  // rate-limit window
  rateLimitResetAt = 0
  rateLimitToastDismissedUntil = 0

  // live timers and observers, so nothing fires into the next test's DOM
  if (rateLimitToastInterval !== null) {
    clearInterval(rateLimitToastInterval)
    rateLimitToastInterval = null
  }
  if (locationToastTimer !== null) {
    clearTimeout(locationToastTimer)
    locationToastTimer = null
  }
  dismissRatingAsk()
  ratingAskConsidered = false

  feedRowObserver?.disconnect()
  feedRowObserver = null
  pendingFeedRows = new WeakMap()

  resizeObserverIO?.disconnect()
  resizeObserverIO = null
  pendingResizes = new WeakMap()
  hideVerdicts.clear()
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.CLEAR_CACHE) {
    checkedThisSession.clear()
    clearAllCache()
  }
  if (message?.type === MSG.SHARE_POST) {
    void shareLastRightClickedPost()
  }
  // Another tab hit the limit. The countdown belongs in every tab, not just the
  // one that happened to be polling.
  if (message?.type === MSG.RATE) {
    const resetAt = Number(message.rate?.resetAt) || 0
    if (resetAt > rateLimitResetAt) {
      rateLimitResetAt = resetAt
      showRateLimitToast()
    }
  }
  // Another tab resolved a handle this one may also be showing.
  if (message?.type === MSG.RESOLVED && typeof message.userName === 'string') {
    void applyResolved(message.userName)
  }
})

async function applyResolved(userName: string): Promise<void> {
  if (!extensionEnabled) return
  // The broadcast goes to every tab, this one included. A tab that did the
  // lookup itself has already applied it — and applied it the way its own path
  // called for, which for a hover means deliberately leaving the post the card
  // was opened from where it is. Redrawing here would take that post away.
  if (checkedThisSession.has(userName.toLowerCase())) return
  const data = await getCached(userName)
  if (data) applyFiltersForUser(userName, data)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCookie(name: string): string | null {
  const match = document.cookie.match(
    new RegExp('(?:^|; )' + name + '=([^;]*)'),
  )
  return match ? decodeURIComponent(match[1]) : null
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? t('countdownMinSec', m, sec) : t('countdownSec', sec)
}

// ---------------------------------------------------------------------------
// Rate limit toast
// ---------------------------------------------------------------------------
/** A click closes the countdown and keeps it closed for this window. */
function dismissRateLimitToast(): void {
  rateLimitToastDismissedUntil = rateLimitResetAt
  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
  rateLimitToastInterval = null
  document.getElementById(RATE_TOAST_ID)?.remove()
}

/** `force` un-dismisses: a swipe is the user asking again. Hovers never force. */
function showRateLimitToast(force = false) {
  if (force) rateLimitToastDismissedUntil = 0

  // Closed by the user, and still the same window — the reset time hasn't
  // moved. A fresh window carries a later reset and shows again.
  if (rateLimitResetAt <= rateLimitToastDismissedUntil) return

  // Both are pinned to the same bottom-centre slot, and a countdown the user
  // needs beats a request they didn't ask for.
  dismissRatingAsk()

  let toast = document.getElementById(RATE_TOAST_ID)
  if (!toast) {
    toast = document.createElement('div')
    toast.id = RATE_TOAST_ID
    // Interactive, so it needs a role, a tab stop and keys doing what a click does.
    toast.title = t('toastDismiss')
    toast.setAttribute('role', 'button')
    toast.tabIndex = 0
    toast.addEventListener('click', dismissRateLimitToast)
    toast.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        dismissRateLimitToast()
      }
    })
    document.body.appendChild(toast)
  }

  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)

  function tick() {
    const remaining = rateLimitResetAt - Date.now()
    const el = document.getElementById(RATE_TOAST_ID)
    if (remaining <= 0 || !el) {
      if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
      rateLimitToastInterval = null
      el?.remove()
      return
    }
    el.textContent = t('toastRateLimit', formatCountdown(remaining))
  }

  tick()
  rateLimitToastInterval = setInterval(tick, 1000)
}

// ---------------------------------------------------------------------------
// Location overlay toast (mobile swipe feedback)
// ---------------------------------------------------------------------------
const LOCATION_TOAST_MS = 2500

let locationToastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * One-line summary for the swipe overlay, or '' when there is nothing to say.
 * The store country outranks the stated location, and one that *matches* it
 * corroborates it — so that pairing drops the VPN warning even when X flagged
 * the location inaccurate. Exported for tests.
 */
export function locationSummaryText(
  data: LocationData,
  userName?: string | null,
): string {
  const { country: sourceCountry } = classifySource(data.source)
  const corroborated = sourceCountry !== null && sourceCountry === data.location
  const country = sourceCountry ?? data.location

  const parts: string[] = []
  if (country) {
    const { emoji, label } = getLocationDisplay(country, userName)
    parts.push(`${emoji} ${label}`)
  }
  if (data.locationAccurate === false && !corroborated)
    parts.push(t('vpnBadge'))
  return parts.join(' · ')
}

/** A `pending` toast has no dismiss timer: a later call must resolve it. */
function dismissLocationToast() {
  document.getElementById(LOCATION_TOAST_ID)?.remove()
  if (locationToastTimer) clearTimeout(locationToastTimer)
  locationToastTimer = null
}

function renderLocationToast(text: string, pending = false) {
  dismissLocationToast()
  // Same slot again: the swipe answer is what the user just asked for.
  dismissRatingAsk()

  const toast = document.createElement('div')
  toast.id = LOCATION_TOAST_ID
  toast.textContent = text
  if (pending) toast.dataset.pending = '1'
  document.body.appendChild(toast)

  if (!pending) {
    locationToastTimer = setTimeout(() => toast.remove(), LOCATION_TOAST_MS)
  }
}

function showLocationOverlay(data: LocationData, userName?: string | null) {
  const text = locationSummaryText(data, userName)
  if (!text) return
  renderLocationToast(text)
}

// ---------------------------------------------------------------------------
// The rating ask
// ---------------------------------------------------------------------------
// The popup's ask, put where people actually are. See "The rating ask" in
// CLAUDE.md for the rules it has to keep.

/** Long enough that the flag it is riding on has been read. */
const RATING_ASK_DELAY_MS = 6000

let ratingAskConsidered = false

function dismissRatingAsk(): void {
  document.getElementById(RATING_ASK_ID)?.remove()
}

/**
 * The manifest's own icon, inlined by `?inline` — a fetchable extension URL is
 * something x.com can probe for, even while the extension is paused.
 */
function buildBrandMark(): HTMLImageElement {
  const img = document.createElement('img')
  img.src = toolbarIconUrl
  img.width = 16
  img.height = 16
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  return img
}

function ratingAskButton(
  label: string,
  quiet: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = label
  if (quiet) btn.className = 'x-loc-ask-quiet'
  btn.addEventListener('click', onClick)
  return btn
}

function showRatingAsk(): void {
  if (document.getElementById(RATING_ASK_ID)) return

  const bar = document.createElement('div')
  bar.id = RATING_ASK_ID
  bar.setAttribute('role', 'status')

  // Named, because an unattributed bar over X reads as X asking.
  const message = document.createElement('span')
  message.className = 'x-loc-ask-msg'
  message.appendChild(buildBrandMark())

  const brand = document.createElement('strong')
  brand.textContent = 'X-Pat'
  message.appendChild(brand)

  const text = document.createElement('span')
  text.textContent = t('rateAskInline')
  message.appendChild(text)
  bar.appendChild(message)

  const answer = (status: 'later' | 'done') => {
    void setRatePromptState(status)
    dismissRatingAsk()
  }

  bar.appendChild(
    ratingAskButton(t('rateAskYes'), false, () => {
      // Inside a click, so the popup blocker allows it and no worker need be awake.
      window.open(REVIEW_URL, '_blank', 'noopener')
      answer('done')
    }),
  )
  bar.appendChild(
    ratingAskButton(t('rateAskLater'), true, () => answer('later')),
  )
  bar.appendChild(ratingAskButton(t('rateAskNo'), true, () => answer('done')))

  document.body.appendChild(bar)
  // Written before it can be answered, so a page navigated away from still
  // counts as asked. The answer buttons overwrite it.
  void noteRatingAskShown()
}

/**
 * Called once per page, after the day has been counted — the count is what
 * decides the ask, so checking before it lands would be a day behind.
 */
async function considerRatingAsk(): Promise<void> {
  if (ratingAskConsidered) return
  ratingAskConsidered = true

  if (!extensionEnabled) return
  if (!(await ratingAskDue())) return

  setTimeout(() => {
    // Both can have changed during the wait, and the other two toasts carry
    // information where this carries a request.
    if (!extensionEnabled) return
    if (document.getElementById(RATE_TOAST_ID)) return
    if (document.getElementById(LOCATION_TOAST_ID)) return
    showRatingAsk()
  }, RATING_ASK_DELAY_MS)
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

function aboutAccountHeaders(
  captured: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: captured.authorization,
    'content-type': 'application/json',
    'x-twitter-client-language': captured['x-twitter-client-language'] ?? 'en',
    'x-twitter-active-user': captured['x-twitter-active-user'] ?? 'yes',
  }
  // page-script never forwards the csrf token, so in practice this is the cookie.
  const csrf = captured['x-csrf-token'] || getCookie('ct0')
  if (csrf) headers['x-csrf-token'] = csrf
  return headers
}

/** Null means no profile at all, which is not "a profile with no location". */
function toLocationData(
  json: any,
  storedBio: string | null,
): LocationData | null {
  const result = json?.data?.user_result_by_screen_name?.result ?? null
  const profile = result?.about_profile ?? null
  if (!profile) return null
  return {
    bio: storedBio,
    location: profile.account_based_in ?? null,
    locationAccurate: profile.location_accurate !== false,
    source: profile.source ?? null,
    // Same response, already paid for. This is the only place handle-change
    // history is available at all — timeline nodes don't carry it.
    facts: definedFacts(parseAccountFacts(result)),
  }
}

/** What a lookup ended up costing the shared window, for the broker's ledger. */
type LookupCost = Omit<LookupReport, 'userName'>

const NOTHING_SPENT: LookupCost = { spent: false }

async function runLookup(
  userName: string,
  capturedHeaders: Record<string, string> | null,
): Promise<{ data: LocationData | null; cost: LookupCost }> {
  const stored = await getCached(userName)

  // Skip the network if location data is already in IDB.
  // Bio-only entries (location: null, source: null) fall through.
  if (stored?.location || stored?.source) {
    return { data: stored, cost: NOTHING_SPENT }
  }

  // Already ran the API lookup this session — return whatever IDB has (may include bio).
  if (checkedThisSession.has(userName.toLowerCase())) {
    return { data: stored ?? null, cost: NOTHING_SPENT }
  }

  // Don't attempt without intercepted headers — avoids failures before
  // the page-script captures the session.
  if (!capturedHeaders) return { data: null, cost: NOTHING_SPENT }

  if (rateLimitResetAt > Date.now()) {
    showRateLimitToast()
    return { data: null, cost: NOTHING_SPENT }
  }

  try {
    const variables = JSON.stringify({ screenName: userName })
    const url = `${ABOUT_ACCOUNT_URL}?variables=${encodeURIComponent(variables)}`

    const resp = await fetch(url, {
      method: 'GET',
      headers: aboutAccountHeaders(capturedHeaders),
      credentials: 'include',
    })
    const cost: LookupCost = { spent: true, ...readRateHeaders(resp) }

    if (resp.status === 429) {
      rateLimitResetAt = cost.reset
        ? cost.reset * 1000
        : Date.now() + RATE_LIMIT_RESET_DEFAULT_MS
      showRateLimitToast()
      return { data: null, cost }
    }

    if (!resp.ok) return { data: null, cost }

    checkedThisSession.add(userName.toLowerCase())
    cost.ok = true

    const data = toLocationData(await resp.json(), stored?.bio ?? null)
    if (!data) return { data: stored ?? null, cost }

    rememberBio(userName, null, null, data.facts)
    await mergeCached(userName, data)
    // Share this first-hand result so other users can skip the X call.
    contributeLocation(userName, data)
    return { data, cost }
  } catch {
    // A request that threw still left the window; only X can say by how much.
    return { data: null, cost: { spent: true } }
  }
}

export async function fetchLocationData(
  userName: string,
  opts: { granted?: boolean } = {},
): Promise<LocationData | null> {
  const key = userName.toLowerCase()
  if (pendingMap.has(key)) {
    // The broker is holding this handle for us and no request will follow, so
    // hand the slot straight back rather than let it time out.
    if (opts.granted) await reportLookup({ userName, spent: false })
    return pendingMap.get(key)!
  }

  // Capture snapshot so the IIFE always uses the headers that were valid at
  // call time, even if apiHeaders is updated mid-flight.
  const capturedHeaders = apiHeaders

  const promise = (async (): Promise<LocationData | null> => {
    const { data, cost } = await runLookup(userName, capturedHeaders)
    // Nothing went out and the broker is holding nothing for us — every hover
    // over a cached account lands here, and each report would wake the worker.
    if (!cost.spent && !opts.granted) return data

    const reported = reportLookup({ userName, ...cost })
    // A granted lookup waits: the poller asks for the next handle the moment
    // this resolves, and the broker has to have been told what this one cost.
    // A hover never waits — that would put an evicted worker's cold start in
    // front of the row the user is looking at.
    if (opts.granted) await reported
    return data
  })()

  pendingMap.set(key, promise)
  promise.finally(() => pendingMap.delete(key))
  return promise
}

// ---------------------------------------------------------------------------
// Inject CSS once
// ---------------------------------------------------------------------------
function injectStyles() {
  if (document.getElementById('x-loc-styles')) return
  const style = document.createElement('style')
  style.id = 'x-loc-styles'
  style.textContent = CONTENT_CSS
  ;(document.head || document.documentElement).appendChild(style)
}

// ---------------------------------------------------------------------------
// Keyword highlight helpers
// ---------------------------------------------------------------------------

function getNameEl(el: Element): Element | null {
  return (
    el.querySelector('[data-testid="User-Name"]') ??
    el.querySelector('[data-testid="UserName"]')
  )
}

// X renders a quote as a role="link" container holding its own User-Name block.
function getQuotedTweetEl(article: Element): Element | null {
  for (const link of Array.from(
    article.querySelectorAll<Element>('div[role="link"]'),
  )) {
    if (getNameEl(link)) return link
  }
  return null
}

function countFlagsInBio(bio: string): number {
  const matches = bio.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) ?? []
  return highlightFlagsUniqueOnly ? new Set(matches).size : matches.length
}

// textContent drops emoji: X renders them as <img alt="🏳️‍⚧️">. Walk the node
// and substitute each emoji <img> with its alt so keyword matching sees them.
function textWithEmoji(
  el: Element,
  skip?: (child: Element) => boolean,
): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
    } else if (node instanceof HTMLImageElement) {
      out += node.getAttribute('alt') ?? ''
    } else if (node instanceof Element && !skip?.(node)) {
      out += textWithEmoji(node, skip)
    }
  }
  return out
}

function extractTweetUserInfo(article: Element): {
  userName: string | null
  displayName: string
} {
  const userNameEl = getNameEl(article)
  if (!userNameEl) return { userName: null, displayName: '' }
  let userName: string | null = null
  let displayName = ''
  for (const link of Array.from(
    userNameEl.querySelectorAll<HTMLAnchorElement>('a[href]'),
  )) {
    const href = link.getAttribute('href') ?? ''
    const m = href.match(RE_SCREEN_NAME_HREF)
    if (!m) continue
    if (!userName) userName = m[1]
    const text = textWithEmoji(link).trim()
    if (text && !text.startsWith('@') && !displayName) displayName = text
  }
  return { userName, displayName }
}

// A quote's author is plain text, not links, so the extractor above finds
// nothing. The name block reads "<displayName>@<handle> · <time>".
function extractQuotedTweetUserInfo(quote: Element): {
  userName: string | null
  displayName: string
} {
  const userNameEl = getNameEl(quote)
  if (!userNameEl) return { userName: null, displayName: '' }
  const full = textWithEmoji(userNameEl).trim()
  // The handle is the last @-token (a display name may itself contain '@').
  const handles = [...full.matchAll(/@([A-Za-z0-9_]{1,50})/g)]
  const userName = handles.length ? handles[handles.length - 1][1] : null
  const at = userName
    ? full.toLowerCase().lastIndexOf(`@${userName.toLowerCase()}`)
    : -1
  const displayName = (at > 0 ? full.slice(0, at) : full).trim()
  return { userName, displayName }
}

// Whether the account matches a keyword/flag rule, ignoring the exceptions list.
// Used both for highlighting and to decide when to offer the hover-card button.
function matchesHighlightRule(
  userName: string,
  displayName: string,
  bio: string | null | undefined,
): boolean {
  // Joined, not concatenated: a keyword may not span the gap between a handle
  // and the name beside it.
  if (matchesAnyKeyword(`${userName} ${displayName} ${bio ?? ''}`)) return true
  if (
    highlightFlagsEnabled &&
    countFlagsInBio(`${userName} ${displayName} ${bio ?? ''}`) >
      highlightFlagsThreshold
  )
    return true
  return false
}

function shouldHighlight(
  userName: string,
  displayName: string,
  bio: string | null | undefined,
): boolean {
  if (isExcepted('highlight', userName)) return false
  return matchesHighlightRule(userName, displayName, bio)
}

// ---------------------------------------------------------------------------
// Marking the matched keyword in a hover card
// ---------------------------------------------------------------------------
// Nothing here touches the DOM X owns. Cosmetic either way — see "Marking the
// matched keyword" in CLAUDE.md.

function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? CSS.highlights
    : null
}

/**
 * Text node by text node, so a keyword split across two is missed rather than
 * mismarked. Our own injected text is skipped, or we point at ourselves.
 */
export function keywordRangesIn(root: Element): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.x-loc-hover')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue
    if (!text) continue
    for (const { start, end } of findKeywordMatches(text)) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, end)
      ranges.push(range)
    }
  }
  return ranges
}

/** A full rescan: the registry is one global object, so nothing can be stranded. */
async function markKeywords(): Promise<void> {
  const registry = highlightRegistry()
  const cards = Array.from(document.querySelectorAll<Element>(SEL_HOVER_CARD))
  const ranges: Range[] = []

  for (const card of cards) {
    const userName = extensionEnabled ? extractScreenName(card) : null
    const info = userName ? await getBioInfo(userName) : null
    if (
      !userName ||
      !info ||
      !shouldHighlight(userName, info.displayName ?? '', info.bio)
    ) {
      card.removeAttribute(KEYWORD_MATCH_ATTR)
      continue
    }
    card.setAttribute(KEYWORD_MATCH_ATTR, '1')
    ranges.push(...keywordRangesIn(card))
  }

  if (!registry) return
  if (ranges.length === 0) registry.delete(KEYWORD_HIGHLIGHT_NAME)
  else registry.set(KEYWORD_HIGHLIGHT_NAME, new Highlight(...ranges))
}

function clearKeywordMarks(): void {
  highlightRegistry()?.delete(KEYWORD_HIGHLIGHT_NAME)
  document
    .querySelectorAll(`[${KEYWORD_MATCH_ATTR}]`)
    .forEach((el) => el.removeAttribute(KEYWORD_MATCH_ATTR))
}

/** Its own <style>, so the static rules stay static. */
function updateKeywordEmojiStyle(): void {
  const emoji = extensionEnabled ? emojiKeywords() : []
  let style = document.getElementById('x-loc-kw-styles')
  if (emoji.length === 0) {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = 'x-loc-kw-styles'
    ;(document.head || document.documentElement).appendChild(style)
  }
  style.textContent = emojiKeywordCss(emoji)
}

async function tryHighlightArticle(article: Element) {
  if (highlightKeywords.length === 0 && !highlightFlagsEnabled) return
  // The tweet's own author and the author of anything it quotes are judged
  // independently — either, both, or neither can match.
  await tryHighlightTweet(article)
  await tryHighlightQuote(article)
}

async function tryHighlightTweet(article: Element) {
  if (article.hasAttribute('data-x-loc-highlighted')) return
  const { userName, displayName } = extractTweetUserInfo(article)
  if (!userName) return
  const info = await getBioInfo(userName)
  const name = displayName || info.displayName || ''
  if (!shouldHighlight(userName, name, info.bio)) return
  article.setAttribute('data-x-loc-highlighted', '1')
}

// Highlight the embedded quoted post when its author matches a keyword/flag
// rule — independent of whether the outer tweet's author matches.
async function tryHighlightQuote(article: Element) {
  const quote = getQuotedTweetEl(article)
  if (!quote || quote.hasAttribute(QUOTE_HIGHLIGHT_ATTR)) return
  const { userName, displayName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return
  const info = await getBioInfo(userName)
  if (
    shouldHighlight(userName, displayName || info.displayName || '', info.bio)
  ) {
    quote.setAttribute(QUOTE_HIGHLIGHT_ATTR, '1')
  }
}

function rehighlightAll() {
  if (!extensionEnabled) return
  // Marks answer "why is this highlighted", so they follow the same changes.
  void markKeywords()
  // Also on the clearing branch below, where the button has to disappear.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  if (highlightKeywords.length === 0 && !highlightFlagsEnabled) {
    articles.forEach((a) => {
      a.removeAttribute('data-x-loc-highlighted')
      getQuotedTweetEl(a)?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    })
    return
  }
  articles.forEach((a) => {
    a.removeAttribute('data-x-loc-highlighted')
    getQuotedTweetEl(a)?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    tryHighlightArticle(a)
  })
}

/** For a bio that arrives after the tweets have already rendered. */
function markHighlightedArticles(userName: string) {
  const lc = userName.toLowerCase()
  for (const article of document.querySelectorAll<Element>(SEL_TWEET)) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      article.setAttribute('data-x-loc-highlighted', '1')
    }
    const quote = getQuotedTweetEl(article)
    const quoted = quote && extractQuotedTweetUserInfo(quote).userName
    if (quote && quoted?.toLowerCase() === lc) {
      quote.setAttribute(QUOTE_HIGHLIGHT_ATTR, '1')
    }
  }
}

const FEED_LOCATION_ATTR = 'data-x-loc-feed-done'

// Feed rows land *after* the name line, the primary tweet's *inside* it, so
// neither sees the other's row without looking at the parent of both.
function nameLineHasInfoRow(userNameEl: Element): boolean {
  return !!userNameEl.parentElement?.querySelector('.x-loc-info')
}

// A row grows the tweet, so one injected above the viewport jumps the feed. See
// "Resizing without moving the scroll" in CLAUDE.md.
let pendingFeedRows = new WeakMap<Element, FeedRowPlan>()
let feedRowObserver: IntersectionObserver | null = null

interface FeedRowPlan {
  data: LocationData
  userName: string | null
}

// True when the row's insertion point (just under the name line) sits entirely
// above the viewport top, i.e. placing the row here would shift the scroll.
function insertionAboveFold(article: Element): boolean {
  const anchor = getNameEl(article) ?? article
  return anchor.getBoundingClientRect().bottom < 0
}

function placeFeedRow(article: Element, plan: FeedRowPlan): void {
  if (!showLocationInFeed) return
  if (article.querySelector('.x-loc-feed-row')) return
  const userNameEl = getNameEl(article)
  if (!userNameEl) return
  article.setAttribute(FEED_LOCATION_ATTR, '1')
  const row = buildInfoRow(plan.data, plan.userName)
  row.classList.add('x-loc-feed-row')
  userNameEl.insertAdjacentElement('afterend', row)
}

function getFeedRowObserver(): IntersectionObserver {
  if (feedRowObserver) return feedRowObserver
  // Several thresholds, so the callback re-fires until the name line clears the
  // fold rather than firing the instant the bottom edge peeks in.
  feedRowObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const article = entry.target
        const plan = pendingFeedRows.get(article)
        if (!plan || !showLocationInFeed) {
          pendingFeedRows.delete(article)
          feedRowObserver!.unobserve(article)
          continue
        }
        if (insertionAboveFold(article)) continue // still above the fold — wait
        pendingFeedRows.delete(article)
        feedRowObserver!.unobserve(article)
        placeFeedRow(article, plan)
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  )
  return feedRowObserver
}

// Place the row now if doing so won't shift the scroll, otherwise park it until
// the tweet is scrolled into view (see pendingFeedRows / getFeedRowObserver).
function injectFeedRow(article: Element, plan: FeedRowPlan): void {
  if (article.querySelector('.x-loc-feed-row')) return
  if (pendingFeedRows.has(article)) {
    pendingFeedRows.set(article, plan)
    return
  }
  if (insertionAboveFold(article)) {
    pendingFeedRows.set(article, plan)
    getFeedRowObserver().observe(article)
    return
  }
  placeFeedRow(article, plan)
}

/** Whether a record carries anything the location row would draw. */
function hasLocationToShow(
  data: LocationData | null | undefined,
): data is LocationData {
  return Boolean(
    data && (data.location || !data.locationAccurate || data.source),
  )
}

async function tryInjectFeedLocation(article: Element) {
  if (!showLocationInFeed) return
  if (article.getAttribute(FEED_LOCATION_ATTR)) return
  if (article.matches(SEL_PRIMARY_TWEET)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  article.setAttribute(FEED_LOCATION_ATTR, '1')

  const data = await getCached(userName)
  if (!hasLocationToShow(data)) return

  injectFeedRow(article, { data, userName })
}

function injectFeedLocationForUser(userName: string, data: LocationData) {
  if (!showLocationInFeed) return
  if (!hasLocationToShow(data)) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (!getNameEl(article) || article.querySelector('.x-loc-feed-row')) return
    article.setAttribute(FEED_LOCATION_ATTR, '1')
    injectFeedRow(article, { data, userName })
  })
}

function refreshFeedLocations() {
  if (!extensionEnabled) return
  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  if (!showLocationInFeed) {
    articles.forEach((a) => {
      a.removeAttribute(FEED_LOCATION_ATTR)
      a.querySelectorAll('.x-loc-feed-row').forEach((el) => el.remove())
    })
    return
  }
  articles.forEach((a) => {
    a.removeAttribute(FEED_LOCATION_ATTR)
    tryInjectFeedLocation(a)
  })
}

// ---------------------------------------------------------------------------
// Hide tweets from blocked locations
// ---------------------------------------------------------------------------
// Collapsed behind a placeholder, never removed: attribute-and-CSS survives
// React's re-renders where surgery on its nodes would not.
/** Everything of `match` a placeholder shows — so a change to it is visible. */
function placeholderKey(match: FilterMatch): string {
  return `${match.rule}|${match.icon}|${match.label}`
}

function buildHiddenLabel(match: FilterMatch): HTMLElement {
  const labelEl = document.createElement('span')
  labelEl.className = 'x-loc-hidden-label'
  labelEl.textContent = t('hiddenLabel', match.icon, matchLabel(match))
  return labelEl
}

function buildShowButton(match: FilterMatch, onShow: () => void): HTMLElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'x-loc-hidden-show'
  btn.textContent = t('hiddenShow')
  // Four rules can produce this placeholder, and "🌱 3d old" is only actionable
  // if you know which setting to go and change.
  btn.title = t(
    'hiddenShowTitle',
    FILTER_RULE_LABEL[match.rule](),
    matchLabel(match),
  )
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onShow()
  })
  return btn
}

/**
 * The exception button, once "Show" has put the post on screen. A collapsed
 * post leaves nothing to hover, so the card the button otherwise lives in
 * cannot be opened from a timeline — but sparing an account is a judgement
 * about what it posts, and until the post is readable there is nothing to
 * judge. It rides at the end of the flags row, where everything else this
 * extension says about the account already is.
 */
function placeRevealedException(
  target: Element,
  userName: string,
  match: FilterMatch,
): void {
  if (target.querySelector('.x-loc-exc-btn')) return
  const btn = buildExceptionButton(userName, [match.rule])
  btn.classList.add('x-loc-exc-inline')

  // No row when the reader turned it off, or when the rule that caught the post
  // is one the row has nothing to say about — then it goes where the row would.
  const row = target.querySelector('.x-loc-feed-row')
  if (row) {
    row.appendChild(btn)
    return
  }
  const nameEl = getNameEl(target)
  if (nameEl) nameEl.insertAdjacentElement('afterend', btn)
  else target.appendChild(btn)
}

function buildHiddenPlaceholder(
  target: Element,
  userName: string,
  match: FilterMatch,
  reveal: (target: Element) => void,
): HTMLElement {
  const ph = document.createElement('div')
  ph.className = HIDDEN_PLACEHOLDER_CLASS
  // For hideArticle to compare against: rebuilding every refresh churned the
  // whole page, never rebuilding left it naming the wrong rule.
  ph.dataset.match = placeholderKey(match)

  const onShow = () => {
    reveal(target)
    ph.remove()
    if (showExceptionButton) placeRevealedException(target, userName, match)
  }

  ph.append(buildHiddenLabel(match), buildShowButton(match, onShow))
  return ph
}

// Thunks, because the language can change while this script stays loaded — and
// still spelled `t('key')`, so messages.test.ts can see which keys are used.
const FILTER_RULE_LABEL: Record<FilterRule, () => string> = {
  highlight: () => t('ruleNameHighlight'),
  location: () => t('ruleNameLocation'),
  affiliation: () => t('ruleNameAffiliation'),
  age: () => t('ruleNameAge'),
}

/** Only the location rule names something translatable; the rest are X's own. */
function matchLabel(match: FilterMatch): string {
  return match.rule === 'location'
    ? localizedLocation(canonicalLocation(match.label))
    : match.label
}

// --- resizing a post without moving the scroll ------------------------------
// A resize above the fold makes X's timeline scroll the window by a multiple of
// the height that changed. See "Resizing without moving the scroll" in CLAUDE.md.
let pendingResizes = new WeakMap<Element, () => void>()
let resizeObserverIO: IntersectionObserver | null = null

// Every 5%: a post taller than the viewport holds a constant ratio while its top
// edge climbs, so coarse steps leave it parked long past being safe.
const RESIZE_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

// X's sticky header is 54px, and a row resized under it is compensated for too.
const FOLD_MARGIN_PX = 56

function resizeAboveFold(target: Element): boolean {
  const rect = target.getBoundingClientRect()
  // No box: nothing to judge, and an observer would never report one.
  if (rect.width === 0 && rect.height === 0) return false
  return rect.top < FOLD_MARGIN_PX
}

function getResizeObserver(): IntersectionObserver {
  if (resizeObserverIO) return resizeObserverIO
  resizeObserverIO = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const target = entry.target
        const apply = pendingResizes.get(target)
        if (!apply) {
          resizeObserverIO!.unobserve(target)
          continue
        }
        // Re-read rather than trust entry.boundingClientRect: an earlier apply
        // in this same batch may have pushed this one back above the fold.
        if (resizeAboveFold(target)) continue
        pendingResizes.delete(target)
        resizeObserverIO!.unobserve(target)
        apply()
      }
    },
    { threshold: RESIZE_THRESHOLDS },
  )
  return resizeObserverIO
}

/**
 * Run `apply` now when it won't move the scroll, otherwise when `target` next
 * has its top edge in view. Parking again replaces the pending call, so it is
 * always the newest verdict that lands.
 */
function whenSafeToResize(target: Element, apply: () => void): void {
  if (!resizeAboveFold(target)) {
    cancelPendingResize(target)
    apply()
    return
  }
  const parked = pendingResizes.has(target)
  pendingResizes.set(target, apply)
  if (!parked) getResizeObserver().observe(target)
}

function cancelPendingResize(target: Element): void {
  if (!pendingResizes.has(target)) return
  pendingResizes.delete(target)
  resizeObserverIO?.unobserve(target)
}

/**
 * whenSafeToResize's counterpart for a node that has just been inserted and not
 * yet laid out. There is no height to change there — the post is collapsed
 * before it has ever been anything else — so there is nothing to wait for, and
 * waiting would itself create the resize this is all trying to avoid.
 */
function runNow(_target: Element, apply: () => void): void {
  apply()
}

function hideArticle(
  article: Element,
  userName: string,
  match: FilterMatch,
  bornHidden = false,
): void {
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
  const schedule = bornHidden ? runNow : whenSafeToResize

  if (hideMode === 'hide') {
    // Silent: CSS takes the whole article, so this mode has no placeholder —
    // and one left behind by collapse mode has to go with it. `display: none`
    // hides it either way, which is why it could sit there unnoticed; switching
    // back would then find it and build a second one underneath.
    if (isHiddenSilently(article, HIDDEN_ATTR)) return
    schedule(article, () => {
      article.setAttribute(HIDDEN_ATTR, 'hide')
      ownPlaceholder(article)?.remove()
    })
    return
  }

  // collapse: build the placeholder when there isn't one — a React re-render
  // dropped it, or the post was in 'hide' mode until now — and when the one
  // there names a rule that is no longer the one catching this post. Otherwise
  // leave it exactly as it is, which is what keeps a rule change off every
  // post it doesn't concern.
  if (isCollapsedFor(article, HIDDEN_ATTR, match)) return
  schedule(article, () => {
    article.setAttribute(HIDDEN_ATTR, 'collapse')
    ownPlaceholder(article)?.remove()
    article.appendChild(
      buildHiddenPlaceholder(article, userName, match, revealArticle),
    )
  })
}

/**
 * The placeholder this target owns — a direct child, which is how they are
 * built. A plain descendant query would also find the one a collapsed quote
 * inside the article owns, and answer for the wrong post.
 */
function ownPlaceholder(target: Element): HTMLElement | null {
  for (const child of Array.from(target.children)) {
    if (child.classList.contains(HIDDEN_PLACEHOLDER_CLASS)) {
      return child as HTMLElement
    }
  }
  return null
}

/** Silently hidden already, with no placeholder left over from collapse mode. */
function isHiddenSilently(target: Element, attr: string): boolean {
  return target.getAttribute(attr) === 'hide' && !ownPlaceholder(target)
}

/** Already collapsed behind a placeholder saying what `match` would say. */
function isCollapsedFor(
  target: Element,
  attr: string,
  match: FilterMatch,
): boolean {
  if (target.getAttribute(attr) !== 'collapse') return false
  return ownPlaceholder(target)?.dataset.match === placeholderKey(match)
}

function unhideArticle(article: Element): void {
  cancelPendingResize(article)
  if (!article.hasAttribute(HIDDEN_ATTR)) return
  whenSafeToResize(article, () => {
    article.removeAttribute(HIDDEN_ATTR)
    article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
  })
}

// User clicked "Show" on a collapsed tweet: reveal it and never re-hide it (the
// marker lives only as long as this DOM node, which X recycles on scroll).
// Deliberately immediate, parked change dropped: the click came from the
// placeholder, so the post is on screen and the user is waiting on it. The
// placeholder is taken down by the click that got here — see onShow.
function revealArticle(article: Element): void {
  cancelPendingResize(article)
  article.removeAttribute(HIDDEN_ATTR)
  article.setAttribute(HIDDEN_REVEALED_ATTR, '1')
}

// --- quoted posts -----------------------------------------------------------
// The quote collapses alone: taking the whole row removes a post the reader
// never filtered. X-Posed shipped that and had to fix it.

function hideQuote(
  quote: Element,
  userName: string,
  match: FilterMatch,
  bornHidden = false,
): void {
  if (quote.hasAttribute(QUOTE_REVEALED_ATTR)) return
  const schedule = bornHidden ? runNow : whenSafeToResize

  if (hideMode === 'hide') {
    if (isHiddenSilently(quote, QUOTE_HIDDEN_ATTR)) return
    schedule(quote, () => {
      quote.setAttribute(QUOTE_HIDDEN_ATTR, 'hide')
      ownPlaceholder(quote)?.remove()
    })
    return
  }
  if (isCollapsedFor(quote, QUOTE_HIDDEN_ATTR, match)) return
  schedule(quote, () => {
    quote.setAttribute(QUOTE_HIDDEN_ATTR, 'collapse')
    ownPlaceholder(quote)?.remove()
    quote.appendChild(
      buildHiddenPlaceholder(quote, userName, match, revealQuote),
    )
  })
}

function unhideQuote(quote: Element): void {
  cancelPendingResize(quote)
  if (!quote.hasAttribute(QUOTE_HIDDEN_ATTR)) return
  whenSafeToResize(quote, () => {
    quote.removeAttribute(QUOTE_HIDDEN_ATTR)
    quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
  })
}

function revealQuote(quote: Element): void {
  cancelPendingResize(quote)
  quote.removeAttribute(QUOTE_HIDDEN_ATTR)
  quote.setAttribute(QUOTE_REVEALED_ATTR, '1')
}

/**
 * Collapse a just-inserted post in the microtask it arrived in, so it is never
 * laid out at full height. Worth 2188px of uncommanded scroll — see CLAUDE.md.
 */
function applyKnownHide(article: Element): void {
  if (hideMode === 'off') return

  const quote = getQuotedTweetEl(article)
  if (quote && !quote.hasAttribute(QUOTE_HIDDEN_ATTR)) {
    const quoted = extractQuotedTweetUserInfo(quote).userName
    const known = quoted ? hideVerdicts.get(quoted.toLowerCase()) : null
    if (known && quoted) hideQuote(quote, quoted, known, true)
  }

  if (article.matches(SEL_PRIMARY_TWEET)) return
  if (article.hasAttribute(HIDDEN_ATTR)) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return
  // undefined (never judged) and null (judged, not hidden) both mean "leave it".
  const known = hideVerdicts.get(userName.toLowerCase())
  if (known) hideArticle(article, userName, known, true)
}

async function tryHideQuote(article: Element) {
  if (hideMode === 'off') return
  const quote = getQuotedTweetEl(article)
  if (!quote) return
  if (quote.hasAttribute(QUOTE_REVEALED_ATTR)) return
  if (quote.hasAttribute(QUOTE_HIDDEN_ATTR)) return

  const { userName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return

  const match = hideMatchFor(userName, await getCached(userName))
  if (match) hideQuote(quote, userName, match)
}

async function tryHideArticle(article: Element) {
  if (hideMode === 'off') return
  // The quote is judged separately from its host, and a host that survives can
  // still be quoting someone filtered.
  void tryHideQuote(article)

  if (article.matches(SEL_PRIMARY_TWEET)) return
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
  if (article.hasAttribute(HIDDEN_ATTR)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  const match = hideMatchFor(userName, await getCached(userName))
  if (match) hideArticle(article, userName, match)
}

// For data arriving after the posts did — a cache hit, a resolved prefetch.
// `hideNow: false` judges without collapsing.
function hideTweetsForUser(
  userName: string,
  data: LocationData,
  hideNow = true,
): void {
  if (hideMode === 'off') return
  const match = hideMatchFor(userName, data)
  if (!match || !hideNow) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    const quote = getQuotedTweetEl(article)
    if (
      quote &&
      extractQuotedTweetUserInfo(quote).userName?.toLowerCase() === lc &&
      !quote.hasAttribute(QUOTE_REVEALED_ATTR) &&
      !quote.hasAttribute(QUOTE_HIDDEN_ATTR)
    ) {
      hideQuote(quote, userName, match)
    }

    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
    if (article.hasAttribute(HIDDEN_ATTR)) return
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    hideArticle(article, userName, match)
  })
}

interface PostVerdict {
  article: Element
  quote: Element | null
  userName: string | null
  quoteUserName: string | null
  articleHide: FilterMatch | null
  quoteHide: FilterMatch | null
  articleMark: FilterMatch | null
  quoteMark: FilterMatch | null
}

/** Everything the rules have to say about one post — DOM untouched. */
async function judgePost(article: Element): Promise<PostVerdict> {
  const quote = getQuotedTweetEl(article)
  const { userName } = extractTweetUserInfo(article)
  const quoteUserName = quote
    ? extractQuotedTweetUserInfo(quote).userName
    : null
  const [data, quoteData] = await Promise.all([
    userName ? getCached(userName) : undefined,
    quoteUserName ? getCached(quoteUserName) : undefined,
  ])
  // The post a status page is about is never collapsed — but it is still
  // marked, which is the whole difference between the two kinds of rule.
  const collapsible = hideMode !== 'off' && !article.matches(SEL_PRIMARY_TWEET)
  return {
    article,
    quote,
    userName,
    quoteUserName,
    articleHide: collapsible && userName ? hideMatchFor(userName, data) : null,
    quoteHide:
      hideMode !== 'off' && quoteUserName
        ? hideMatchFor(quoteUserName, quoteData)
        : null,
    articleMark: userName ? markMatchFor(userName, data) : null,
    quoteMark: quoteUserName ? markMatchFor(quoteUserName, quoteData) : null,
  }
}

/** A mark is a left border, so it costs no height and needs no scroll care. */
function setMark(target: Element, match: FilterMatch | null): void {
  if (!match) {
    target.removeAttribute(TWEET_MARK_ATTR)
    return
  }
  if (target.getAttribute(TWEET_MARK_ATTR) !== match.rule) {
    target.setAttribute(TWEET_MARK_ATTR, match.rule)
  }
}

function applyPostVerdict(v: PostVerdict): void {
  if (v.articleHide && v.userName) {
    hideArticle(v.article, v.userName, v.articleHide)
  } else {
    unhideArticle(v.article)
  }

  if (v.quote) {
    if (v.quoteHide && v.quoteUserName) {
      hideQuote(v.quote, v.quoteUserName, v.quoteHide)
    } else {
      unhideQuote(v.quote)
    }
    setMark(v.quote, v.quoteMark)
  }
  setMark(v.article, v.articleMark)
}

// Ask first, mutate second, and only where the answer changed. Stripping every
// attribute up front made an exception for one account move the whole page.
async function refreshHiddenTweets(): Promise<void> {
  if (!extensionEnabled) return
  // Every rule change comes through here, and any of them can change a remembered
  // verdict. judgePost re-fills the map as it goes.
  hideVerdicts.clear()
  // Before the awaits, so the glyph turns over in the task the click landed in.
  refreshLocationFlags()
  // A rule change can make the button appear, change what it offers, or go away.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  const verdicts = await Promise.all(articles.map(judgePost))
  // Bottom-up, so the geometry whenSafeToResize is about to read is untouched by
  // the changes already applied.
  for (let i = verdicts.length - 1; i >= 0; i--) {
    if (verdicts[i].article.isConnected) applyPostVerdict(verdicts[i])
  }
  void refreshPeopleCells()
}

// ---------------------------------------------------------------------------
// Marking posts a rule points at rather than hides
// ---------------------------------------------------------------------------
// Nothing is taken away, so no placeholder and no reason to skip the post a
// status page is about — a young author is worth knowing on the post you opened.

async function tryMarkArticle(article: Element) {
  // The quote's author is judged on their own, exactly as they are for hiding
  // and highlighting — either, both or neither can be new.
  void tryMarkQuote(article)

  if (article.hasAttribute(TWEET_MARK_ATTR)) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  const match = markMatchFor(userName, await getCached(userName))
  if (match) article.setAttribute(TWEET_MARK_ATTR, match.rule)
}

async function tryMarkQuote(article: Element) {
  const quote = getQuotedTweetEl(article)
  if (!quote || quote.hasAttribute(TWEET_MARK_ATTR)) return
  const { userName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return

  const match = markMatchFor(userName, await getCached(userName))
  if (match) quote.setAttribute(TWEET_MARK_ATTR, match.rule)
}

/** A post is judged before its author is known, so the answer is revisited. */
function markTweetsForUser(userName: string, data: LocationData): void {
  const match = markMatchFor(userName, data)
  if (!match) return
  const lc = userName.toLowerCase()
  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      article.setAttribute(TWEET_MARK_ATTR, match.rule)
    }
    const quote = getQuotedTweetEl(article)
    if (
      quote &&
      extractQuotedTweetUserInfo(quote).userName?.toLowerCase() === lc
    ) {
      quote.setAttribute(TWEET_MARK_ATTR, match.rule)
    }
  }
}

// ---------------------------------------------------------------------------
// People lists (Followers / Following / the People tab of search)
// ---------------------------------------------------------------------------
// Marked, never removed: hiding rows means the count says 400, you scroll past
// 380, and nothing says whether the extension ate them or the list is stale.

function userCellName(cell: Element): string | null {
  for (const link of Array.from(
    cell.querySelectorAll<HTMLAnchorElement>('a[href]'),
  )) {
    const m = (link.getAttribute('href') ?? '').match(RE_SCREEN_NAME_HREF)
    if (m) return m[1]
  }
  return null
}

async function tryMarkPeopleCell(cell: Element) {
  if (cell.hasAttribute(PEOPLE_CELL_ATTR)) return
  const userName = userCellName(cell)
  if (!userName) return
  cell.setAttribute(PEOPLE_CELL_ATTR, '1')

  const data = await getCached(userName)
  const match = cellMatchFor(userName, data)
  if (!match) return

  cell.setAttribute(PEOPLE_MATCH_ATTR, match.rule)

  if (cell.querySelector('.x-loc-cell-tag')) return
  const tag = document.createElement('span')
  tag.className = 'x-loc-cell-tag'
  tag.textContent = `${match.icon} ${matchLabel(match)}`
  tag.title = t('cellTagTitle', FILTER_RULE_LABEL[match.rule]())
  const nameEl = getNameEl(cell) ?? cell
  nameEl.insertAdjacentElement('beforeend', tag)
}

/** Rows are marked before their data arrives, so a lookup must re-judge them. */
function markPeopleCellsForUser(userName: string, data: LocationData): void {
  if (!cellMatchFor(userName, data)) return
  const lc = userName.toLowerCase()
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    if (cell.hasAttribute(PEOPLE_MATCH_ATTR)) continue
    if (userCellName(cell)?.toLowerCase() !== lc) continue
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    void tryMarkPeopleCell(cell)
  }
}

/**
 * One function, so no caller wires up two of three. `hideNow: false` judges
 * without collapsing — a hover card opens at a post, and asking is not filtering.
 */
function applyFiltersForUser(
  userName: string,
  data: LocationData,
  { hideNow = true }: { hideNow?: boolean } = {},
): void {
  injectFeedLocationForUser(userName, data)
  hideTweetsForUser(userName, data, hideNow)
  markTweetsForUser(userName, data)
  markPeopleCellsForUser(userName, data)
}

async function refreshPeopleCells() {
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    cell.removeAttribute(PEOPLE_MATCH_ATTR)
    cell.querySelectorAll('.x-loc-cell-tag').forEach((el) => el.remove())
    void tryMarkPeopleCell(cell)
  }
}

// ---------------------------------------------------------------------------
// Extract screen name from hover card
// ---------------------------------------------------------------------------
function extractScreenName(card: Element): string | null {
  // Try data-testid="UserName" or "User-Name"
  const nameEl =
    card.querySelector(SEL_USER_NAME) ?? card.querySelector(SEL_USER_NAME_ALT)
  if (nameEl) {
    const href = nameEl.getAttribute('href') ?? ''
    const match = href.match(RE_SCREEN_NAME_HREF)
    if (match) return match[1]
  }

  // Fallback: find a span with @username text
  const spans = card.querySelectorAll('span')
  for (const span of Array.from(spans)) {
    const text = span.textContent?.trim() ?? ''
    if (RE_AT_MENTION.test(text)) {
      return text.slice(1)
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Build info row DOM element
// ---------------------------------------------------------------------------
function makeIcon(emoji: string, tooltip: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'x-loc-icon'
  span.textContent = emoji
  span.title = tooltip
  return span
}

function buildInfoRow(
  data: LocationData,
  userName?: string | null,
): HTMLElement {
  // The one place meaning "the extension did something visible today", which is
  // what the rating ask counts.
  void noteActiveDay().then(considerRatingAsk)

  const row = document.createElement('div')
  row.className = 'x-loc-info'
  // This and the `country` below are read back by refreshLocationFlags, which
  // re-answers the row without a cache read.
  if (userName) row.dataset.user = userName

  const { platform, country: sourceCountry } = classifySource(data?.source)

  if (sourceCountry) {
    const { emoji: storeFlag, isText: storeFlagIsText } = getLocationDisplay(
      sourceCountry,
      userName,
    )
    const block = document.createElement('span')
    block.className = 'x-loc-store-block'
    // The raw string is the honest tooltip: it names the store *and* which one,
    // where the glyph alone only shows the platform.
    block.title = data.source!
    block.setAttribute(
      'aria-label',
      t(
        'storeRegionLabel',
        platformLabel(platform),
        getLocationDisplay(sourceCountry).label,
      ),
    )

    const glyph = buildSourceGlyph(platform)
    if (glyph) block.appendChild(glyph)

    const flag = document.createElement('span')
    flag.className = `x-loc-icon-flag ${storeFlagIsText ? 'x-loc-icon-abbr' : ''}`
    flag.textContent = storeFlag
    flag.dataset.country = sourceCountry

    block.appendChild(flag)
    row.appendChild(block)
  }

  if (data?.location) {
    const { emoji, label, isText } = getLocationDisplay(data.location, userName)
    const icon = makeIcon(emoji, label)
    icon.classList.add('x-loc-icon-flag')
    if (isText) icon.classList.add('x-loc-icon-abbr')
    icon.dataset.country = data.location
    row.appendChild(icon)
  }

  if (data?.locationAccurate === false) {
    const vpn = document.createElement('span')
    vpn.className = 'x-loc-icon-vpn'
    vpn.title = t('vpnTitle')
    vpn.textContent = t('vpnBadge')
    row.appendChild(vpn)
  }

  return row
}

/**
 * Redraw every flag already on the page, for a rule change that moved one.
 *
 * One glyph, swapped where it stands: rebuilding the rows would take height out
 * of a post and put it back, which is the resize X's timeline answers by
 * scrolling the window (see whenSafeToResize).
 */
function refreshLocationFlags(): void {
  for (const row of Array.from(
    document.querySelectorAll<HTMLElement>('.x-loc-info'),
  )) {
    const userName = row.dataset.user
    for (const flag of Array.from(
      row.querySelectorAll<HTMLElement>('.x-loc-icon-flag'),
    )) {
      const country = flag.dataset.country
      if (!country) continue
      const { emoji, isText } = getLocationDisplay(country, userName)
      if (flag.textContent !== emoji) flag.textContent = emoji
      flag.classList.toggle('x-loc-icon-abbr', Boolean(isText))
    }
  }
}

// ---------------------------------------------------------------------------
// The exception button
// ---------------------------------------------------------------------------
// One button whatever the rule: from the reader's side these are one complaint,
// "not this account". The exceptions stay per-rule underneath.

/**
 * Both keys: reads merge the legacy one in, so writing only the new key would let
 * a removal come straight back — and a downgrade still finds its exceptions.
 */
function writeRuleExceptions(next: RuleExceptions): void {
  ruleExceptions = next
  chrome.storage.local.set({
    [RULE_EXCEPTIONS_KEY]: next,
    [HIGHLIGHT_EXCEPTIONS_KEY]: next.highlight,
  })
}

/**
 * Exceptions included: a rule already excepted is the one the button must keep
 * offering, or a mistake could only be undone from the options page.
 */
function activeRulesFor(
  userName: string,
  data: LocationData | null | undefined,
  displayName: string,
  bio: string | null | undefined,
): FilterRule[] {
  // Nothing acts on an allowlisted account, so there is nothing to except.
  if (isAlwaysShown(userName)) return []

  const lc = userName.toLowerCase()
  const hit = new Set<FilterRule>()

  for (const rule of FILTER_RULES) {
    if (ruleExceptions[rule].includes(lc)) hit.add(rule)
  }
  if (matchesHighlightRule(userName, displayName, bio)) hit.add('highlight')
  for (const match of ruleMatches(data)) hit.add(match.rule)

  return FILTER_RULES.filter((rule) => hit.has(rule))
}

// What the tooltip calls each rule, phrased to read after "exempt @user from".
const RULE_EXCEPTION_PHRASE: Record<FilterRule, () => string> = {
  highlight: () => t('excPhraseHighlight'),
  location: () => t('excPhraseLocation'),
  affiliation: () => t('excPhraseAffiliation'),
  age: () => t('excPhraseAge'),
}

function joinPhrases(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  return t('joinAnd', items.slice(0, -1).join(', '), items[items.length - 1])
}

/** Already exempt from everything the button covers — so it reads as "undo". */
function exceptedFromAll(userName: string, rules: FilterRule[]): boolean {
  const lc = userName.toLowerCase()
  return rules.every((rule) => ruleExceptions[rule].includes(lc))
}

function buildExceptionButton(
  userName: string,
  rules: FilterRule[],
): HTMLElement {
  const lc = userName.toLowerCase()
  const btn = document.createElement('button')
  btn.className = 'x-loc-exc-btn'
  btn.type = 'button'
  // Also what syncExceptionButton compares against to decide whether the set of
  // rules has changed under it.
  btn.dataset.rules = rules.join(' ')

  function render() {
    const excepted = exceptedFromAll(userName, rules)
    const phrase = joinPhrases(rules.map((r) => RULE_EXCEPTION_PHRASE[r]()))
    // One label whatever the rule — four would make one control look like four.
    btn.textContent = excepted ? t('excUndo') : t('excAdd')
    btn.title = excepted
      ? t('excUndoTitle', userName, phrase)
      : t('excAddTitle', userName, phrase)
    btn.classList.toggle('x-loc-exc-active', excepted)
    // Read back by syncExceptionButton, so the storage write a click triggers
    // doesn't rebuild the button from the state it already shows.
    btn.dataset.excepted = excepted ? '1' : '0'
  }
  render()

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const undo = exceptedFromAll(userName, rules)
    const next = { ...ruleExceptions }
    for (const rule of rules) {
      if (undo) next[rule] = next[rule].filter((u) => u !== lc)
      else if (!next[rule].includes(lc)) next[rule] = [...next[rule], lc]
    }
    writeRuleExceptions(next)
    render()
    // Both, because the button now covers rules on either side of that line:
    // highlighting is re-run, and anything hidden or collapsed is re-judged.
    rehighlightAll()
    void refreshHiddenTweets()
  })

  return btn
}

/**
 * Called more than once per card — the bio answers before the lookup does — and
 * rebuilt rather than patched, so label, tooltip and handler never disagree.
 */
function syncExceptionButton({
  host,
  userName,
  data,
  info,
  place,
}: {
  host: Element
  userName: string
  data: LocationData | null | undefined
  info: { bio: string | null; displayName: string | null }
  /** Where in `host` the button goes — every caller puts it somewhere else. */
  place: (btn: HTMLElement) => void
}): void {
  const existing = host.querySelector<HTMLElement>('.x-loc-exc-btn')
  const rules = showExceptionButton
    ? activeRulesFor(userName, data, info.displayName ?? '', info.bio)
    : []

  if (rules.length === 0) {
    existing?.remove()
    return
  }
  // The exception state is part of the comparison, not just the rule set: the
  // same account's hover card can add the exception this button would undo.
  if (
    existing?.dataset.rules === rules.join(' ') &&
    existing.dataset.excepted === (exceptedFromAll(userName, rules) ? '1' : '0')
  ) {
    return
  }

  existing?.remove()
  place(buildExceptionButton(userName, rules))
}

// ---------------------------------------------------------------------------
// Account card
// ---------------------------------------------------------------------------
// Nothing here is inferred: every chip is a field X returned, phrased as X
// phrased it, out of a response the extension already had.

interface Chip {
  text: string
  title: string
  tone?: 'plain' | 'warn' | 'block'
}

type ChipBuilder = (facts: Partial<AccountFacts>, now: number) => Chip | null

// X strips the bio, the follow button and the counts out of a blocker's hover
// card, so without this the card looks broken rather than answered.
const blockedByChip: ChipBuilder = (facts) =>
  facts.blockedBy
    ? {
        text: t('chipBlockedYou'),
        title: t('chipBlockedYouTitle'),
        tone: 'block',
      }
    : null

const ageChip: ChipBuilder = (facts, now) => {
  const age = formatAccountAge(facts.createdAt, now)
  if (!age) return null
  const days = accountAgeDays(facts.createdAt, now) ?? 0
  const created = new Date(facts.createdAt!).toISOString().slice(0, 10)
  return {
    text: t('chipAge', age),
    title: t('chipAgeTitle', created),
    // The strongest tell for a farmed account, and also just what a new user
    // looks like — hence a tint rather than a warning.
    tone: days < 90 ? 'warn' : 'plain',
  }
}

const affiliationChip: ChipBuilder = (facts) => {
  if (!facts.affiliation) return null
  const { name, handle } = facts.affiliation
  const shown = name || (handle ? `@${handle}` : null)
  if (!shown) return null
  return {
    text: t('chipAffiliation', shown),
    title: handle
      ? t('chipAffiliationTitleHandle', handle)
      : t('chipAffiliationTitle'),
  }
}

// No chip for plain Premium — X draws that. These two are invisible otherwise:
// X renders identity and legacy verification with the same badge as a paid one.
const verificationChip: ChipBuilder = (facts) => {
  if (facts.identityVerified) {
    return { text: t('chipIdVerified'), title: t('chipIdVerifiedTitle') }
  }
  if (facts.verified) {
    return { text: t('chipVerified'), title: t('chipVerifiedTitle') }
  }
  return null
}

const handleChangesChip: ChipBuilder = (facts) => {
  const changes = facts.handleChanges
  if (typeof changes !== 'number' || changes <= 0) return null
  return {
    text: changes === 1 ? t('chipHandle1') : t('chipHandles', changes),
    title: t('chipHandlesTitle', changes),
    tone: changes >= 3 ? 'warn' : 'plain',
  }
}

const protectedChip: ChipBuilder = (facts) =>
  facts.isProtected
    ? { text: t('chipProtected'), title: t('chipProtectedTitle') }
    : null

/**
 * In the order they are worth reading — blocked-you first, because it explains
 * everything else the card is missing. The order is all these rules share.
 */
const CHIP_BUILDERS: ChipBuilder[] = [
  blockedByChip,
  ageChip,
  affiliationChip,
  verificationChip,
  handleChangesChip,
  protectedChip,
]

export function accountChips(
  facts: Partial<AccountFacts> | undefined,
  now: number = Date.now(),
): Chip[] {
  if (!facts) return []
  return CHIP_BUILDERS.map((build) => build(facts, now)).filter(
    (chip) => chip !== null,
  )
}

function buildAccountCard(
  facts: Partial<AccountFacts> | undefined,
): HTMLElement | null {
  const chips = accountChips(facts)
  if (chips.length === 0) return null

  const card = document.createElement('div')
  card.className = 'x-loc-card'
  for (const chip of chips) {
    const el = document.createElement('span')
    el.className =
      chip.tone && chip.tone !== 'plain'
        ? `x-loc-chip x-loc-chip-${chip.tone}`
        : 'x-loc-chip'
    el.textContent = chip.text
    el.title = chip.title
    card.appendChild(el)
  }
  return card
}

/** `onExpiry` fires when the countdown reaches zero; the row is gone by then. */
function buildRateLimitRow(onExpiry: () => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'x-loc-info'

  const badge = document.createElement('span')
  badge.className = 'x-loc-icon-ratelimit'
  badge.title = t('rateLimitBadgeTitle')
  badge.textContent = `⏱ ${formatCountdown(rateLimitResetAt - Date.now())}`
  row.appendChild(badge)

  const interval = setInterval(() => {
    // Taken off the page by something else — a hover card closing, the master
    // switch stripping the page. Whatever removed it did not ask for a lookup.
    if (!badge.isConnected) {
      clearInterval(interval)
      return
    }
    const remaining = rateLimitResetAt - Date.now()
    if (remaining <= 0) {
      clearInterval(interval)
      row.remove()
      onExpiry()
      return
    }
    badge.textContent = `⏱ ${formatCountdown(remaining)}`
  }, 1000)

  return row
}

// ---------------------------------------------------------------------------
// Insert a row element into a hover card at the right position
// ---------------------------------------------------------------------------
function insertIntoCard(card: Element, userName: string, el: HTMLElement) {
  const atSpan = Array.from(card.querySelectorAll('span')).find(
    (s) => s.textContent?.trim().toLowerCase() === `@${userName.toLowerCase()}`,
  )

  if (atSpan) {
    let node: Element | null = atSpan
    while (node && node !== card) {
      const parent: Element | null = node.parentElement
      if (!parent || parent === card) break
      if (parent.children.length >= 3) {
        parent.insertBefore(el, node.nextSibling)
        return
      }
      node = parent
    }
  }

  ;(card.querySelector('div > div > div') ?? card).appendChild(el)
}

// ---------------------------------------------------------------------------
// The bio X declined to render
// ---------------------------------------------------------------------------
// A blocker's card is stripped of its bio, but the highlight rule still fires on
// the bio the timeline response carried — so the card would show a mark and no
// reason for it.

/**
 * A slice distinctive enough to look for in a card. URLs come out first: X
 * substitutes a t.co display form, so they never match verbatim.
 */
export function bioProbe(bio: string): string {
  const plain = bio
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  // Too short to identify a bio by — a three-character probe matches a display
  // name or one of our own chips as easily as the bio itself.
  return plain.length < 4 ? '' : plain.slice(0, 40)
}

/** Whether the card is already showing this bio, ignoring what we injected. */
function cardShowsBio(card: Element, probe: string): boolean {
  const text = textWithEmoji(card, (child) =>
    child.classList.contains('x-loc-hover'),
  )
  return text.replace(/\s+/g, ' ').trim().toLowerCase().includes(probe)
}

/** Rebuilt rather than appended: a card React fills in late must not end up
 * with two bios. */
function syncBioRow(
  wrap: HTMLElement,
  card: Element,
  bio: string | null | undefined,
): void {
  card.querySelector('.x-loc-bio')?.remove()
  if (!bio || !wrap.isConnected) return
  const probe = bioProbe(bio)
  if (probe === '' || cardShowsBio(card, probe)) return

  const el = document.createElement('div')
  el.className = 'x-loc-bio'
  el.textContent = bio
  el.title = t('bioTitle')
  // Outside .x-loc-hover, or keywordRangesIn skips it as our own furniture and
  // the word that matched goes unmarked.
  wrap.before(el)
}

// ---------------------------------------------------------------------------
// Process a hover card
// ---------------------------------------------------------------------------
const HOVER_CARD_DONE_ATTR = 'data-x-loc-done'

/** The account-facts card: after the flags, before the exception button. */
function syncAccountCard(
  wrap: HTMLElement,
  card: Element,
  infoRow: HTMLElement | null,
  facts: Partial<AccountFacts>,
): void {
  if (!showAccountCard) return
  const accountCard = buildAccountCard(facts)
  if (!accountCard || card.querySelector('.x-loc-card')) return
  if (infoRow) infoRow.after(accountCard)
  else wrap.prepend(accountCard)
}

/** In the flags row, not under it: a hover card is short on vertical space. */
function syncShareButton(
  card: Element,
  infoRow: HTMLElement | null,
  userName: string,
  displayName: string,
): void {
  if (!showShareButton || !infoRow) return
  if (card.querySelector('.x-loc-share-btn')) return
  infoRow.appendChild(buildShareButton(userName, displayName))
}

async function processCard(card: Element) {
  if (card.getAttribute(HOVER_CARD_DONE_ATTR)) return

  const userName = extractScreenName(card)
  // Don't mark done yet — card content may not be rendered. The observer will
  // retry when React adds content inside the card.
  if (!userName) return

  card.setAttribute(HOVER_CARD_DONE_ATTR, '1')

  // One container: insertIntoCard anchors every call to the same node, so
  // separate inserts came out backwards.
  const wrap = document.createElement('div')
  wrap.className = 'x-loc-hover'
  insertIntoCard(card, userName, wrap)

  // The bio answers the highlight rule on its own, and a hover card only gets a
  // second or two of attention. Synced again below for the other rules.
  const place = (btn: HTMLElement) => wrap.appendChild(btn)
  const known = await getBioInfo(userName)
  syncBioRow(wrap, card, known.bio)
  syncExceptionButton({ host: wrap, userName, data: null, info: known, place })
  void markKeywords()

  const data = await fetchLocationData(userName)

  if (data === null && rateLimitResetAt > Date.now()) {
    // The whole pass starts again rather than the row being patched: by the
    // time the window ends the card may be showing a different account
    wrap.prepend(
      buildRateLimitRow(() => {
        wrap.remove()
        card.removeAttribute(HOVER_CARD_DONE_ATTR)
        void processCard(card)
      }),
    )
    return
  }

  // The location row needs a location; the account card does not, so an account
  // X has no country for can still show its age and badges.
  const infoRow = hasLocationToShow(data) ? buildInfoRow(data, userName) : null
  if (infoRow) wrap.prepend(infoRow)

  // The merged view: the timeline's follower count beside the handle history
  // only AboutAccountQuery carries.
  const info = await getBioInfo(userName)

  // Again, now that React has had the length of the lookup to render the card:
  // whichever answer is right by this point is the one that stays.
  syncBioRow(wrap, card, info.bio)

  syncAccountCard(wrap, card, infoRow, info.facts)
  syncShareButton(card, infoRow, userName, info.displayName ?? '')

  // The lookup may have added rules the bio alone could not offer.
  syncExceptionButton({ host: wrap, userName, data, info, place })
  // Again: React often fills the card in after the first pass, and the bio is
  // the part being marked.
  void markKeywords()

  if (!data) return
  applyFiltersForUser(userName, data, { hideNow: false })
}

// ---------------------------------------------------------------------------
// Process primary tweet author on status pages
// ---------------------------------------------------------------------------
function primaryTweetTarget(): {
  tweet: Element
  userNameEl: Element
  userName: string
} | null {
  if (!/\/status\/\d+/.test(location.pathname)) return null

  const tweet = document.querySelector(SEL_PRIMARY_TWEET)
  if (!tweet) return null

  const userNameEl = getNameEl(tweet)
  if (!userNameEl) return null

  const href = userNameEl.querySelector('a[href]')?.getAttribute('href') ?? ''
  const m = href.match(RE_SCREEN_NAME_HREF)
  if (!m) return null

  return { tweet, userNameEl, userName: m[1] }
}

// Inline, because X only sometimes opens a hover card for the account a status
// page is about — measured August 2026 — and that is no place for a control.
async function syncPrimaryExceptionButton(): Promise<void> {
  const target = primaryTweetTarget()
  if (!target) return
  const { userNameEl, userName } = target

  // getBioInfo reads the record that decided the highlight, so the button cannot
  // disagree with what it undoes. The location has no such view, so: the cache.
  const [info, data] = await Promise.all([
    getBioInfo(userName),
    getCached(userName),
  ])

  // After the awaits: two rule changes in quick succession put two of these in
  // flight, and a stale handle appends a duplicate instead of replacing it.
  syncExceptionButton({
    host: userNameEl,
    userName,
    data,
    info,
    place: (btn) => {
      const anchor =
        userNameEl.querySelector('.x-loc-info') ?? userNameEl.children[1]
      if (anchor) anchor.insertAdjacentElement('afterend', btn)
      else userNameEl.appendChild(btn)
    },
  })
}

async function processPrimaryTweet() {
  const target = primaryTweetTarget()
  if (!target) return

  const { tweet, userNameEl, userName } = target
  if (tweet.getAttribute(PRIMARY_TWEET_ATTR)) return
  tweet.setAttribute(PRIMARY_TWEET_ATTR, '1')

  void syncPrimaryExceptionButton()

  const data = await fetchLocationData(userName)

  let row: HTMLElement | null = null
  if (data === null && rateLimitResetAt > Date.now()) {
    row = buildRateLimitRow(() => {
      tweet.removeAttribute(PRIMARY_TWEET_ATTR)
      void processPrimaryTweet()
    })
  } else if (hasLocationToShow(data)) {
    row = buildInfoRow(data, userName)
  }

  if (!row) return

  // Searched, not read off nextElementSibling: the exception button can already
  // sit between the two.
  if (nameLineHasInfoRow(userNameEl)) return

  const handleDiv = userNameEl.children[1] as Element | undefined
  ;(row as HTMLElement).style.marginTop = '2px'
  if (handleDiv) {
    handleDiv.insertAdjacentElement('afterend', row)
  } else {
    userNameEl.appendChild(row)
  }
}

// ---------------------------------------------------------------------------
// Share a post with its location flags
// ---------------------------------------------------------------------------
// The context-menu click arrives in the service worker, which knows the tab but
// not the element — so the post is remembered here, as the menu opens.
let lastRightClickedTweet: Element | null = null

document.addEventListener(
  'contextmenu',
  (e) => {
    const target = e.target
    lastRightClickedTweet =
      target instanceof Element ? target.closest(SEL_TWEET) : null
  },
  true,
)

// X gives a card no link back to the post the pointer was on, so the anchor is
// remembered as the pointer enters the profile link.
let lastHoveredTweet: { article: Element; userName: string } | null = null

document.addEventListener(
  'mouseover',
  (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    const link = target.closest('a[href]')
    if (!link) return
    const m = (link.getAttribute('href') ?? '').match(RE_SCREEN_NAME_HREF)
    if (!m) return
    const article = link.closest(SEL_TWEET)
    if (article) lastHoveredTweet = { article, userName: m[1] }
  },
  true,
)

/** The hover anchor first, then any post by the account still on screen. */
function postElementForAccount(userName: string): Element | null {
  const lc = userName.toLowerCase()

  if (
    lastHoveredTweet &&
    lastHoveredTweet.userName.toLowerCase() === lc &&
    lastHoveredTweet.article.isConnected
  ) {
    return lastHoveredTweet.article
  }

  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      return article
    }
  }
  return null
}

/** The post's own text, with emoji restored from their <img alt>. */
function tweetText(article: Element): string {
  const el = article.querySelector('[data-testid="tweetText"]')
  return el ? textWithEmoji(el).trim() : ''
}

/** Ignores the blocked list: in a shared image a ⚠️ reads as something X said. */
function flagEmojiFor(location: string): string {
  return flagFor(canonicalLocation(location))
}

/**
 * Names in words, because a flag in a reposted image is a coloured rectangle
 * nobody can hover. Inline styles — no stylesheet reaches inside the SVG.
 */
function buildSnapshotLocationRow(data: LocationData): HTMLElement {
  const row = document.createElement('div')
  // No `color`: it inherits X's own from the inlined ancestor styles, so it
  // reads correctly on either theme.
  row.setAttribute(
    'style',
    'display:flex;align-items:center;flex-wrap:nowrap;gap:8px;' +
      'margin:0 0 4px;white-space:nowrap;font-size:14px;font-weight:600;' +
      'line-height:1.2;font-family:system-ui,-apple-system,sans-serif;',
  )

  const { platform, country: storeCountry } = classifySource(data.source)

  if (storeCountry) {
    const block = document.createElement('span')
    block.setAttribute(
      'style',
      'display:inline-flex;align-items:center;gap:5px;' +
        'border:1px solid rgba(128,128,128,0.35);border-radius:6px;' +
        'padding:2px 8px;',
    )
    const glyph = buildSourceGlyph(platform)
    if (glyph) {
      // The class the page styles it with means nothing here, so the box is
      // given directly.
      glyph.setAttribute('style', 'width:16px;height:16px;display:block;')
      block.appendChild(glyph)
    }
    const label = document.createElement('span')
    label.textContent = `${flagEmojiFor(storeCountry)} ${localizedLocation(
      canonicalLocation(storeCountry),
    )}`
    block.appendChild(label)
    row.appendChild(block)
  }

  if (data.location) {
    const loc = document.createElement('span')
    loc.textContent = `${flagEmojiFor(data.location)} ${localizedLocation(
      canonicalLocation(data.location),
    )}`
    row.appendChild(loc)
  }

  if (data.locationAccurate === false) {
    const vpn = document.createElement('span')
    // The on-page badge's colours, so the image says it the same way.
    vpn.setAttribute(
      'style',
      'display:inline-flex;align-items:center;font-size:12px;font-weight:700;' +
        'background:rgba(220,38,38,0.15);color:rgb(200,25,25);' +
        'border:1px solid rgba(220,38,38,0.4);border-radius:4px;padding:2px 6px;',
    )
    vpn.textContent = t('vpnBadge')
    row.appendChild(vpn)
  }

  return row
}

/** Buttons aimed at the reader rather than part of the post. */
const RE_READER_ACTION = /^(subscribe|follow|following|unfollow)$/i

function decorateSnapshot(clone: Element, data: LocationData): void {
  clone
    .querySelectorAll(
      `.x-loc-share-btn, .x-loc-exc-btn, .x-loc-card, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-info`,
    )
    .forEach((el) => el.remove())

  // Controls aimed at the reader, which in a shared image invite a click that
  // cannot work. Grok by substring: X localises the label, not the name in it.
  clone
    .querySelectorAll('[data-testid="caret"], [aria-label*="Grok" i]')
    .forEach((el) => el.remove())
  for (const btn of Array.from(
    clone.querySelectorAll<HTMLElement>('[role="button"]'),
  )) {
    if (RE_READER_ACTION.test(btn.textContent?.trim() ?? '')) btn.remove()
  }

  const row = buildSnapshotLocationRow(data)

  // Where the page puts it, which differs by layout — after the block in a feed,
  // inside it on a status page, whose block is sized for the text.
  const nameEl = getNameEl(clone)
  const handleDiv = clone.matches(SEL_PRIMARY_TWEET)
    ? (nameEl?.children[1] ?? null)
    : null

  if (handleDiv) {
    handleDiv.insertAdjacentElement('afterend', row)
  } else if (nameEl) {
    nameEl.insertAdjacentElement('afterend', row)
    // Same reasoning, for the layout where the row does sit outside the block.
    if (nameEl instanceof HTMLElement) {
      nameEl.style.marginBottom = '0'
      nameEl.style.paddingBottom = '0'
    }
  } else {
    clone.prepend(row)
  }

  // Without this the row has nowhere to go: every ancestor is carrying the
  // pixel height it had before the row existed.
  allowGrowth(row.parentElement ?? clone, clone)
}

/**
 * One path for both entry points, so the wording and the "never spend a lookup"
 * rule can't drift. The drawn card is the fallback: a snapshot has more ways to
 * fail, rendering in a restricted context on a page we don't control.
 */
async function shareCardFor(
  userName: string,
  displayName: string,
  article: Element | null,
): Promise<void> {
  renderLocationToast(t('toastRendering', userName), true)

  // Whatever is already known. A share must not trigger a lookup: it would
  // spend a slice of the rate-limit window on a card, which is the one thing
  // this extension is built not to do.
  const data = (await getCached(userName)) ?? {
    location: null,
    locationAccurate: true,
    source: null,
  }

  const deliver = async (blob: Blob) => {
    const where = await deliverShareCard(blob, `x-pat-${userName}.png`)
    renderLocationToast(
      where === 'clipboard' ? t('toastCopied') : t('toastSaved'),
    )
  }

  // A post the user collapsed is rendered collapsed — the computed styles that
  // hide it get copied along with everything else — so that one goes to the
  // drawn card instead of producing an image of a placeholder.
  const snapshotable =
    article &&
    !article.hasAttribute(HIDDEN_ATTR) &&
    !article.hasAttribute(HIDDEN_REVEALED_ATTR)

  if (snapshotable) {
    const background = getComputedStyle(document.body).backgroundColor || '#fff'
    try {
      await deliver(
        await snapshotElement(article, {
          background,
          decorate: (clone) => decorateSnapshot(clone, data),
          finish: {
            height: WATERMARK_BAND,
            draw: (ctx, size) => drawWatermark(ctx, { ...size, background }),
          },
        }),
      )
      return
    } catch {
      // Fall through to the drawn card.
    }
  }

  try {
    await deliver(
      await renderShareCard({
        userName,
        displayName:
          displayName || (await getBioInfo(userName)).displayName || '',
        text: article ? tweetText(article) : '',
        data,
      }),
    )
  } catch {
    renderLocationToast(t('toastRenderFail'))
  }
}

async function shareLastRightClickedPost(): Promise<void> {
  if (!extensionEnabled) return
  const article =
    lastRightClickedTweet ?? document.querySelector(SEL_PRIMARY_TWEET)
  if (!article) {
    renderLocationToast(t('toastRightClick'))
    return
  }

  const { userName, displayName } = extractTweetUserInfo(article)
  if (!userName) {
    renderLocationToast(t('toastReadFail'))
    return
  }

  await shareCardFor(userName, displayName, article)
}

/** A second way in: a feature reachable only by right-clicking goes unfound. */
function buildShareButton(userName: string, displayName: string): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'x-loc-share-btn'
  btn.type = 'button'
  btn.textContent = t('shareBtn')
  btn.title = t('shareBtnTitle', userName)

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void shareCardFor(userName, displayName, postElementForAccount(userName))
  })

  return btn
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------
/** A node added to the timeline is sometimes the article, sometimes its container. */
function eachMatching(
  node: Element,
  selector: string,
  fn: (el: Element) => void,
): void {
  if (node.matches(selector)) fn(node)
  else node.querySelectorAll<Element>(selector).forEach(fn)
}

function decorateTweet(article: Element): void {
  // First and synchronously, before this node is laid out even once: everything
  // below waits on a cache read, by which time collapsing is a resize.
  applyKnownHide(article)
  tryHighlightArticle(article)
  tryInjectFeedLocation(article)
  tryHideArticle(article)
  tryMarkArticle(article)
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    // One gate for the whole script: with the master switch off nothing is
    // injected, nothing is looked up, and X renders as if uninstalled.
    if (!extensionEnabled) return
    // Deduplicate within a single batch so we don't call processCard twice
    // for the same card if multiple child nodes are added in one mutation.
    const seen = new Set<Element>()

    function tryProcess(card: Element) {
      if (!seen.has(card)) {
        seen.add(card)
        processCard(card)
      }
    }

    const nodes = mutations
      .flatMap((m) => Array.from(m.addedNodes))
      .filter((n): n is Element => n instanceof Element)

    for (const node of nodes) {
      eachMatching(node, SEL_TWEET, decorateTweet)
      // People rows are their own surface — Followers/Following/search have no
      // tweet articles at all, so they'd otherwise never be looked at.
      eachMatching(node, SEL_USER_CELL, (cell) => void tryMarkPeopleCell(cell))
    }

    for (const node of nodes) {
      const card =
        node.closest(SEL_HOVER_CARD) ?? node.querySelector(SEL_HOVER_CARD)
      if (card) {
        tryProcess(card as Element)
        break
      }

      if (node.matches(SEL_TWEET) || node.querySelector(SEL_TWEET)) {
        processPrimaryTweet()
        break
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// ---------------------------------------------------------------------------
// Swipe-right on a tweet to fetch location (mobile)
// ---------------------------------------------------------------------------
const SWIPE_MIN_X = 40 // px of rightward travel before the gesture commits
const SWIPE_MAX_Y = 50 // px of vertical drift still counted as horizontal
const SWIPE_X_DOMINANCE = 1.5 // dx must beat dy by this factor

/** The dominance ratio is for mid-drag, where a vertical fling starts diagonal. */
export function isCommittedSwipe(dx: number, dy: number): boolean {
  const drift = Math.abs(dy)
  if (dx < SWIPE_MIN_X || drift > SWIPE_MAX_Y) return false
  return dx >= drift * SWIPE_X_DOMINANCE
}

function tweetFromTouch(e: TouchEvent): Element | null {
  const target = e.target
  return target instanceof Element ? target.closest<Element>(SEL_TWEET) : null
}

async function revealLocationForSwipe(article: Element) {
  if (!extensionEnabled) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  // Acknowledge the gesture now; the lookup may take a network round trip and
  // a swipe that appears to do nothing invites the user to swipe again.
  renderLocationToast(t('toastLookingUp', userName), true)

  const data = await fetchLocationData(userName)
  if (!data || !locationSummaryText(data, userName)) {
    // "X knows nothing" and "we couldn't ask" are different answers, and the
    // rate-limit toast owns this corner when it is the second.
    const rateLimited = rateLimitResetAt > Date.now()
    if (rateLimited || apiHeaders === null) {
      dismissLocationToast()
      // The explanation the corner promises, even if the user clicked it away
      // earlier — the swipe asked for it back.
      if (rateLimited) showRateLimitToast(true)
    } else {
      renderLocationToast(t('toastNoLocation'))
    }
    return
  }

  // Inject below username even if showLocationInFeed is off — user explicitly swiped
  const userNameEl = getNameEl(article)
  if (userNameEl && !nameLineHasInfoRow(userNameEl)) {
    article.setAttribute(FEED_LOCATION_ATTR, '1')
    const row = buildInfoRow(data, userName)
    row.classList.add('x-loc-feed-row')
    userNameEl.insertAdjacentElement('afterend', row)
  }

  showLocationOverlay(data, userName)
}

/**
 * Commits mid-drag: waiting for the lift spent the rest of the swipe, usually
 * longer than the lookup. touchend is the backstop for an unreported flick.
 */
function startSwipeListener() {
  let startX = 0
  let startY = 0
  let article: Element | null = null
  let handled = true

  document.body.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      // A second finger is a pinch or a two-finger scroll, never a swipe — and
      // it would otherwise re-origin the gesture already in progress.
      if (e.touches.length > 1) {
        handled = true
        article = null
        return
      }
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      article = tweetFromTouch(e)
      handled = false
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (handled || !article) return
      const touch = e.touches[0]
      if (!touch) return
      if (!isCommittedSwipe(touch.clientX - startX, touch.clientY - startY)) {
        return
      }
      handled = true
      void revealLocationForSwipe(article)
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const swiped = article
      article = null
      if (handled || !swiped) return
      handled = true

      const touch = e.changedTouches[0]
      if (!touch) return
      if (!isCommittedSwipe(touch.clientX - startX, touch.clientY - startY)) {
        return
      }
      void revealLocationForSwipe(swiped)
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchcancel',
    () => {
      handled = true
      article = null
    },
    { passive: true },
  )
}

// ---------------------------------------------------------------------------
// Listen for captured headers from page-script
// ---------------------------------------------------------------------------
window.addEventListener(EVENTS.HEADERS_CAPTURED, (e: Event) => {
  const headers = (e as CustomEvent).detail?.headers
  if (headers?.authorization) {
    apiHeaders = headers
    // Auth just became available — a wanted poller can start now.
    syncPoller()
  }
})

// ---------------------------------------------------------------------------
// Listen for user bio data intercepted from timeline/tweet API responses
// ---------------------------------------------------------------------------
// Confirmed hits only, so a flag can show without a per-profile X call.
async function applySharedHits(userNames: string[]) {
  const hits = await sharedBatchLookup(userNames)
  for (const hit of hits) {
    await mergeCached(hit.userName, hit.data)
    const full = await getCached(hit.userName)
    if (full) {
      applyFiltersForUser(hit.userName, full)
    }
  }
}

// ---------------------------------------------------------------------------
// Background location lookups
// ---------------------------------------------------------------------------
// The queue and the pace live in the service worker, so every open x.com tab
// trickles from one shared budget. This end only asks and fetches.
const poller = new PrefetchPoller({
  next: () => askBroker<NextInstruction>({ type: MSG.NEXT }),
  fetch: async (userName) => {
    const data = await fetchLocationData(userName, { granted: true })
    if (data) {
      applyFiltersForUser(userName, data)
    }
  },
})

/**
 * Names this tab already has an answer for never reach the broker's queue — it
 * cannot check for itself, since the cache is x.com's IndexedDB rather than the
 * extension's. A whole timeline response arrives at once, so the reads go out
 * together rather than one await at a time.
 */
async function unknownOnly(
  candidates: PrefetchCandidate[],
): Promise<PrefetchCandidate[]> {
  const known = await Promise.all(
    candidates.map(async (candidate) => {
      if (checkedThisSession.has(candidate.userName.toLowerCase())) return true
      const cached = await getCached(candidate.userName)
      return Boolean(cached && (cached.location || cached.source))
    }),
  )
  return candidates.filter((_, i) => !known[i])
}

async function enqueueForLookup(
  candidates: PrefetchCandidate[],
): Promise<void> {
  const unknown = await unknownOnly(candidates)
  if (unknown.length === 0) return
  await askBroker({ type: MSG.ENQUEUE, candidates: unknown })
  poller.wake()
}

// Prefetch exists to warm the shared cache, so opting out of that switches it
// off too. Settings only — prefetchWanted() adds the runtime requirements.
function prefetchAllowedBySettings(): boolean {
  if (!extensionEnabled) return false
  if (!prefetchEnabled) return false
  return !isSharedCacheConfigured() || isSharedCacheEnabled()
}
function prefetchWanted(): boolean {
  return prefetchAllowedBySettings() && apiHeaders !== null
}
function syncPoller(): void {
  if (prefetchWanted()) poller.start()
  else poller.stop()
}

window.addEventListener(EVENTS.USERS_DATA, (e: Event) => {
  if (!extensionEnabled) return
  const users = (e as CustomEvent).detail?.users as
    | Array<{
        userName: string
        displayName: string | null
        bio: string | null
        facts?: Partial<AccountFacts>
        priority?: PrefetchPriority
      }>
    | undefined
  if (!users) return
  void applySharedHits(users.map((u) => u.userName))
  // Queued before auth headers arrive; syncPoller() starts the draining.
  // Timeline order within the batch; the batch itself jumps the queue.
  if (prefetchAllowedBySettings()) {
    void enqueueForLookup(
      users.map((u) => ({
        userName: u.userName,
        priority: u.priority ?? 'high',
      })),
    )
  }
  for (const { userName, displayName, bio, facts } of users) {
    // Synchronously, so highlighting can read them without racing mergeCached.
    rememberBio(userName, bio, displayName ?? null, facts)

    const patch: Parameters<typeof mergeCached>[1] = { bio: bio ?? null }
    if (displayName) patch.displayName = displayName
    if (facts && Object.keys(facts).length > 0) patch.facts = facts
    mergeCached(userName, patch)
    if (shouldHighlight(userName, displayName ?? '', bio)) {
      markHighlightedArticles(userName)
    }
  }

  // Bios land here, so this is the first moment the primary tweet's account can
  // be known to match a rule — processPrimaryTweet usually runs before it.
  void syncPrimaryExceptionButton()
})

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
injectStyles()
startObserver()
startSwipeListener()
cleanupCache()
// Nothing is gated on this: it only redraws when the reader chose a language
// the browser would not have picked.
void initI18n().then((chosen) => {
  if (chosen) relocalize()
})
// Send any buffered community-cache contributions before the tab goes away, so
// the long 30s batching window doesn't strand a batch until the next session.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushContributions()
})
window.addEventListener('pagehide', () => flushContributions())
// Replays headers captured before this script attached its listener. The bios
// replay waits for the settings load, or it runs against empty keywords.
window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_HEADERS))
