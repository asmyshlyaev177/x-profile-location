// content.tsx — plain DOM, no React/Preact
import { cleanupCache, clearAllCache, getCached, mergeCached } from './cache'
import {
  emojiKeywords,
  findKeywordMatches,
  matchesAnyKeyword,
  setKeywords,
} from './keywords'
import type { LocationData } from './cache'
import {
  ACCOUNT_AGE_KEY,
  type AccountAgeFilter,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  canonicalLocation,
  COUNTRY_FLAGS,
  expandLocations,
  EXTENSION_ENABLED_KEY,
  FILTER_RULES,
  type FilterRule,
  HIDE_BLOCKED_LOCATIONS_KEY,
  type HideBlockedMode,
  normalizeRuleExceptions,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  LOOKUP_LIMIT_PER_WINDOW,
  MIN_CONFIDENCE_KEY,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RATE_PROMPT_KEY,
  REGION_ABBR,
  REGION_FLAGS,
  ruleHides,
  RULE_EXCEPTIONS_KEY,
  type RuleExceptions,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_SHARE_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  USAGE_STATS_KEY,
} from './countries'
import { defaultSetting, readSetting, settingValue } from './settings'
import { EVENTS, X_GRAPHQL_PATH } from './constants'
import {
  contributeLocation,
  flushContributions,
  isSharedCacheConfigured,
  isSharedCacheEnabled,
  setMinConfidence,
  setSharedCacheEnabled,
  sharedBatchLookup,
} from './shared-cache'
import { BackgroundPrefetcher } from './prefetch-queue'
import type { PrefetchPriority } from './prefetch-queue'
import {
  accountAgeDays,
  definedFacts,
  formatAccountAge,
  parseAccountFacts,
} from './profile'
import type { AccountFacts } from './profile'
import { buildSourceGlyph, classifySource, platformLabel } from './source'
import {
  noteActiveDay,
  noteRatingAskShown,
  ratingAskDue,
  REVIEW_URL,
  setRatePromptState,
} from './usage'
import toolbarIconUrl from '../assets/icons/icon-32x32.png?inline'
import { deliverShareCard, renderShareCard } from './share-card'
import { allowGrowth, snapshotElement } from './snapshot'
import {
  CONTENT_CSS,
  emojiKeywordCss,
  HIDDEN_ATTR,
  HIDDEN_PLACEHOLDER_CLASS,
  KEYWORD_HIGHLIGHT_NAME,
  KEYWORD_MATCH_ATTR,
  PEOPLE_MATCH_ATTR,
  QUOTE_HIDDEN_ATTR,
  RATING_ASK_ID,
  TWEET_MARK_ATTR,
} from './styles'

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

const RESET_DEFAULT = 60 * 5 * 1000
const RE_SCREEN_NAME_HREF = /^\/([A-Za-z0-9_]{1,50})$/
const RE_AT_MENTION = /^@[A-Za-z0-9_]{1,50}$/

// ---------------------------------------------------------------------------
// Blocked countries (loaded from chrome.storage.local, set via options page)
// ---------------------------------------------------------------------------
let blockedCountries = new Set<string>()

// Canonicalised and region-expanded, and every location is canonicalised before
// being tested — so a list saved as "USA" blocks the "United States" X reports,
// and one holding "South Asia" blocks Pakistan too.
//
// Expansion lives here, not in storage: what the user picked and what that picks
// out are different things, and only the second belongs in a comparison.
function toBlockedSet(stored: unknown): Set<string> {
  return expandLocations(settingValue(BLOCKED_COUNTRIES_KEY, stored))
}

function isBlockedLocation(loc: string): boolean {
  return blockedCountries.has(canonicalLocation(loc))
}

// Every default below comes from SETTINGS_REGISTRY, so a default lives in one
// place rather than here, in the popup and in the options page.
const DEFAULT_FLAGS = defaultSetting(HIGHLIGHT_FLAGS_KEY)

let highlightKeywords = new Set<string>()
let highlightFlagsEnabled = DEFAULT_FLAGS.enabled
let highlightFlagsThreshold = DEFAULT_FLAGS.threshold
let highlightFlagsUniqueOnly = DEFAULT_FLAGS.uniqueOnly
let showLocationInFeed = defaultSetting(SHOW_LOCATION_IN_FEED_KEY)
// How to treat tweets whose author's location is on the blocked list. Starts
// 'off' only as a pre-load placeholder — nothing should be hidden on a guess
// before settings arrive — so this is deliberately not the stored default
// ('collapse'), which the storage load below applies.
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
// Master switch. Everything this script does is gated on it, and flipping it
// off strips what is already on screen — a switch that only stopped *new* work
// would leave the page half-decorated and read as a bug.
let extensionEnabled = defaultSetting(EXTENSION_ENABLED_KEY)

/** Never filtered, never highlighted — the user said always show this account. */
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
    PREFETCH_SHARE_KEY,
    PREFETCH_PACING_KEY,
  ])
  .then((result) => {
    const r = result as Record<string, unknown>
    extensionEnabled = readSetting(EXTENSION_ENABLED_KEY, r)
    blockedCountries = toBlockedSet(r[BLOCKED_COUNTRIES_KEY])
    highlightKeywords = new Set(readSetting(HIGHLIGHT_KEYWORDS_KEY, r))
    setKeywords([...highlightKeywords])
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
    prefetcher.setReserveFraction(readSetting(PREFETCH_SHARE_KEY, r))
    prefetcher.setPacing(readSetting(PREFETCH_PACING_KEY, r))
    // Inert unless a server URL is configured (see CACHE_API_BASE in constants.ts).
    setSharedCacheEnabled(readSetting(SHARED_CACHE_KEY, r))
    setMinConfidence(r[MIN_CONFIDENCE_KEY])

    // Tweets can render before this async load resolves, in which case nothing
    // was highlighted. Re-scan and replay the buffered bios, so the first screen
    // is decorated without waiting for a scroll.
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPrefetcher()
    window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_USERS))
  })

/**
 * Undo every visible thing this script has done to the page. Attribute-and-CSS
 * throughout, so this is removing attributes and a few injected nodes rather
 * than restoring markup React owns.
 */
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
  document.getElementById('x-loc-rate-toast')?.remove()
}

type StorageChanges = Record<string, chrome.storage.StorageChange>

/**
 * The master switch, which is not like the others: turning it off strips the
 * page and skips every remaining setting, turning it back on re-decorates what
 * is already on screen rather than making the user scroll to trigger the
 * observer. Returns whether the rest of the changes are worth applying.
 */
function applyMasterSwitch(changes: StorageChanges): boolean {
  if (changes[EXTENSION_ENABLED_KEY]) {
    extensionEnabled = settingValue(
      EXTENSION_ENABLED_KEY,
      changes[EXTENSION_ENABLED_KEY].newValue,
    )
    if (!extensionEnabled) {
      stripAllInjections()
      prefetcher.stop()
      return false
    }
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPrefetcher()
  }
  return extensionEnabled
}

/** Which posts a rule catches, and what happens to one it caught. */
function applyFilterChanges(changes: StorageChanges): void {
  if (changes[BLOCKED_COUNTRIES_KEY]) {
    blockedCountries = toBlockedSet(changes[BLOCKED_COUNTRIES_KEY].newValue)
    // Editing the list can newly block (or unblock) locations already on screen.
    void refreshHiddenTweets()
  }
  // Both keys arrive in one `changes` object, so the general one wins and the
  // legacy one is only a fallback — that is what makes a *removal* stick.
  // Synchronous on purpose: re-reading storage would let a highlight survive a
  // frame past the edit that removed it.
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
  if (changes[ALWAYS_SHOW_KEY]) {
    alwaysShow = new Set(
      settingValue(ALWAYS_SHOW_KEY, changes[ALWAYS_SHOW_KEY].newValue),
    )
    rehighlightAll()
    void refreshHiddenTweets()
  }
  if (changes[BLOCKED_AFFILIATIONS_KEY]) {
    blockedAffiliations = new Set(
      settingValue(
        BLOCKED_AFFILIATIONS_KEY,
        changes[BLOCKED_AFFILIATIONS_KEY].newValue,
      ),
    )
    void refreshHiddenTweets()
  }
  if (changes[ACCOUNT_AGE_KEY]) {
    accountAgeFilter = settingValue(
      ACCOUNT_AGE_KEY,
      changes[ACCOUNT_AGE_KEY].newValue,
    )
    void refreshHiddenTweets()
  }
  if (changes[HIDE_BLOCKED_LOCATIONS_KEY]) {
    hideMode = settingValue(
      HIDE_BLOCKED_LOCATIONS_KEY,
      changes[HIDE_BLOCKED_LOCATIONS_KEY].newValue,
    )
    void refreshHiddenTweets()
    syncPrefetcher()
  }
}

/** What the extension draws, on a post or on a card. */
function applyDisplayChanges(changes: StorageChanges): void {
  if (changes[HIGHLIGHT_KEYWORDS_KEY]) {
    highlightKeywords = new Set(
      settingValue(
        HIGHLIGHT_KEYWORDS_KEY,
        changes[HIGHLIGHT_KEYWORDS_KEY].newValue,
      ),
    )
    setKeywords([...highlightKeywords])
    updateKeywordEmojiStyle()
    rehighlightAll()
  }
  if (changes[HIGHLIGHT_FLAGS_KEY]) {
    const next = settingValue(
      HIGHLIGHT_FLAGS_KEY,
      changes[HIGHLIGHT_FLAGS_KEY].newValue,
    )
    highlightFlagsEnabled = next.enabled
    highlightFlagsThreshold = next.threshold
    highlightFlagsUniqueOnly = next.uniqueOnly
    rehighlightAll()
  }
  if (changes[SHOW_LOCATION_IN_FEED_KEY]) {
    showLocationInFeed = settingValue(
      SHOW_LOCATION_IN_FEED_KEY,
      changes[SHOW_LOCATION_IN_FEED_KEY].newValue,
    )
    refreshFeedLocations()
    syncPrefetcher()
  }
  if (changes[SHOW_EXCEPTION_BUTTON_KEY]) {
    showExceptionButton = settingValue(
      SHOW_EXCEPTION_BUTTON_KEY,
      changes[SHOW_EXCEPTION_BUTTON_KEY].newValue,
    )
  }
  if (changes[SHOW_ACCOUNT_CARD_KEY]) {
    showAccountCard = settingValue(
      SHOW_ACCOUNT_CARD_KEY,
      changes[SHOW_ACCOUNT_CARD_KEY].newValue,
    )
  }
  if (changes[SHOW_SHARE_BUTTON_KEY]) {
    showShareButton = settingValue(
      SHOW_SHARE_BUTTON_KEY,
      changes[SHOW_SHARE_BUTTON_KEY].newValue,
    )
  }
}

/** Where a location may come from, and how hard the extension looks for one. */
function applyLookupChanges(changes: StorageChanges): void {
  if (changes[SHARED_CACHE_KEY]) {
    setSharedCacheEnabled(
      settingValue(SHARED_CACHE_KEY, changes[SHARED_CACHE_KEY].newValue),
    )
    // Opting out of the community cache also stops background prefetch, which
    // exists to warm it — and opting back in restarts it.
    syncPrefetcher()
  }
  if (changes[MIN_CONFIDENCE_KEY]) {
    setMinConfidence(changes[MIN_CONFIDENCE_KEY].newValue)
  }
  if (changes[BACKGROUND_PREFETCH_KEY]) {
    prefetchEnabled = settingValue(
      BACKGROUND_PREFETCH_KEY,
      changes[BACKGROUND_PREFETCH_KEY].newValue,
    )
    syncPrefetcher()
  }
  if (changes[PREFETCH_SHARE_KEY]) {
    prefetcher.setReserveFraction(
      settingValue(PREFETCH_SHARE_KEY, changes[PREFETCH_SHARE_KEY].newValue),
    )
  }
  if (changes[PREFETCH_PACING_KEY]) {
    prefetcher.setPacing(
      settingValue(PREFETCH_PACING_KEY, changes[PREFETCH_PACING_KEY].newValue),
    )
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (!applyMasterSwitch(changes)) return
  if (changes[USAGE_STATS_KEY] || changes[RATE_PROMPT_KEY]) {
    // The ask is decided once per page, at the first flag drawn. Re-arm it when
    // the two values that decide it move, or a tab open across the day that
    // earns the ask never asks — and X is precisely the page people leave open
    // for days at a time. Costs nothing: the re-check is one storage read on
    // the next flag, and it answers "no" for the rest of the page's life.
    ratingAskConsidered = false
  }
  applyFilterChanges(changes)
  applyDisplayChanges(changes)
  applyLookupChanges(changes)
})

function getLocationDisplay(loc: string): {
  emoji: string
  label: string
  isText?: boolean
} {
  if (isBlockedLocation(loc)) return { emoji: '⚠️', label: loc }
  // Flags are looked up by canonical name, so an alias X hasn't used before
  // ("Russia", "Vietnam") still gets its flag instead of the 🌐 fallback. The
  // label stays whatever X actually said.
  const key = canonicalLocation(loc)
  if (COUNTRY_FLAGS[key]) return { emoji: COUNTRY_FLAGS[key], label: loc }
  if (REGION_FLAGS[key]) {
    const abbr = REGION_ABBR[key]
    return abbr
      ? { emoji: abbr, label: loc, isText: true }
      : { emoji: REGION_FLAGS[key], label: loc }
  }
  return { emoji: '🌐', label: loc }
}

// Which blocked location a profile is hidden for, or null. The store country is
// the primary signal — a store region is hard to fake — so it outranks the stated
// location. Without one, fall back to `account_based_in`, but only when X hasn't
// flagged it inaccurate.
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
  /** What to name in the placeholder: a country, an org, an age. */
  label: string
  /** The flag or icon that goes with it. */
  icon: string
}

/**
 * Every data-driven rule an account matches, exceptions ignored. Location leads,
 * since it is the rule the user most certainly set up on purpose.
 *
 * Split out of activeMatches because the exception button has to be able to name
 * a rule the user has *already* excepted, in order to undo it — the one thing
 * activeMatches must never return. Highlighting is judged from the bio instead,
 * and activeRulesFor folds it back in.
 */
function ruleMatches(data: LocationData | null | undefined): FilterMatch[] {
  if (!data) return []
  const matches: FilterMatch[] = []

  const location = effectiveBlockedLocation(data)
  if (location) {
    const key = canonicalLocation(location)
    matches.push({
      rule: 'location',
      label: location,
      icon: COUNTRY_FLAGS[key] ?? REGION_FLAGS[key] ?? '🌐',
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

/**
 * The single decision point for "which rules are acting on this account". The
 * allowlist and the per-rule exceptions are applied here and nowhere else, so
 * they cannot be applied in three subtly different ways.
 */
function activeMatches(
  userName: string,
  data: LocationData | undefined,
): FilterMatch[] {
  if (isAlwaysShown(userName)) return []
  return ruleMatches(data).filter((m) => !isExcepted(m.rule, userName))
}

// Every hide judgement made this session, so the next sighting of the same
// account can be answered without waiting on IndexedDB. X recreates article
// nodes as you scroll — nothing the extension sets survives the unmount — and
// a post that comes back at full height and collapses a cache read later is a
// resize, which is what moves the page (see whenSafeToResize). Answered from
// here, it is collapsed in the microtask the node arrives in and never laid out
// at any other height.
//
// Bounded LRU-by-write like bioCache, and only ever a fast path: the answer is
// recomputed from the cache whenever it is missing, and dropped wholesale by
// refreshHiddenTweets, which every rule change goes through.
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

/**
 * The rule a post is hidden for, or null — the first that both fires and is
 * allowed to hide. An account matching only a marking rule (age) must not have
 * its post collapsed, which is the whole difference between the two kinds.
 */
function hideMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  const match =
    activeMatches(userName, data).find((m) => ruleHides(m.rule)) ?? null
  // Only a judgement made on a record we actually have. An account nothing is
  // known about yet has not been judged not to match — it has not been looked
  // up, and remembering that as "no" would keep it from ever being hidden.
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

/**
 * The rule to name on a people-list row, hiding or not. Rows are marked and
 * never removed, so the hide/mark distinction doesn't apply — the tag should say
 * "blocked location" even though that rule collapses a post elsewhere.
 */
function cellMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data)[0] ?? null
}

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------
export let apiHeaders: Record<string, string> | null = null
export function setApiHeaders(h: Record<string, string> | null) {
  apiHeaders = h
}

class NormalizedMap<V> {
  private map = new Map<string, V>()
  private key(name: string) {
    return name.toLowerCase()
  }
  has(name: string) {
    return this.map.has(this.key(name))
  }
  get(name: string) {
    return this.map.get(this.key(name))
  }
  set(name: string, value: V) {
    this.map.set(this.key(name), value)
  }
  delete(name: string) {
    return this.map.delete(this.key(name))
  }
  clear() {
    this.map.clear()
  }
}
// Tracks users whose location was already fetched via API this session,
// so repeat hovers skip the network and read from IDB instead.
const checkedThisSession = new Set<string>()
// Shared promises — lets concurrent processCard calls for the same user
// await the same in-flight fetch instead of getting null immediately.
const pendingMap = new NormalizedMap<Promise<LocationData | null>>()
let rateLimitResetAt = 0
let rateLimitToastInterval: ReturnType<typeof setInterval> | null = null
// The reset time of the window whose toast the user clicked away. Every blocked
// lookup calls showRateLimitToast, so without this the very next hover would
// undo the click.
let rateLimitToastDismissedUntil = 0

// Live AboutAccountQuery budget: seeded at the limit, decremented by every
// request (hover, swipe, prefetch alike) and corrected from x-rate-limit-*.
// Counting all of it is what lets the prefetcher stop short of the user's share.
let rateWindowLimit = LOOKUP_LIMIT_PER_WINDOW
let rateWindowRemaining = LOOKUP_LIMIT_PER_WINDOW
let rateWindowResetAt = 0

// Once X's reset time has passed, the window has rolled and the budget is full.
function rollRateWindowIfElapsed(): void {
  if (rateWindowResetAt !== 0 && Date.now() >= rateWindowResetAt) {
    rateWindowRemaining = rateWindowLimit
    rateWindowResetAt = 0
  }
}

// Single choke point, called just before every network AboutAccountQuery, so
// in-flight usage is counted optimistically; readRateHeaders makes it exact once
// the response lands.
function noteRequestSent(): void {
  rollRateWindowIfElapsed()
  if (rateWindowRemaining > 0) rateWindowRemaining -= 1
}

function readRateHeaders(resp: Response): void {
  const lim = resp.headers.get('x-rate-limit-limit')
  const rem = resp.headers.get('x-rate-limit-remaining')
  const rst = resp.headers.get('x-rate-limit-reset')
  if (lim) {
    const n = parseInt(lim)
    if (n > 0) rateWindowLimit = n
  }
  if (rem !== null) {
    const n = parseInt(rem)
    if (!Number.isNaN(n)) rateWindowRemaining = n
  }
  if (rst) {
    const n = parseInt(rst)
    if (n > 0) rateWindowResetAt = n * 1000
  }
}

// Snapshot for the prefetcher's budget.
function currentRateState() {
  rollRateWindowIfElapsed()
  return {
    remaining: rateWindowRemaining,
    limit: rateWindowLimit,
    resetAt: rateLimitResetAt,
    windowResetAt: rateWindowResetAt,
  }
}

// Bios captured from timeline JSON this session, in memory so highlighting reads
// them synchronously rather than racing mergeCached's async write. Without it, a
// fresh load highlights nothing until a reload has populated IDB.
//
// Bounded LRU-by-write, and only ever a fast path: every bio also lands in IDB,
// so an evicted entry (long since written) falls back to getCached — the same
// fallback that covers users first seen in an earlier session.
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

// Restore module-level state to its post-import value. The module is imported
// once per test file, so anything a test mutates leaks into every test after it
// and the suite passes only in the order it happens to run. Keep this
// exhaustive: a module-scope `let` missing here is a new order dependency.
export function __testResetState() {
  // settings, back to what the declarations above start them at
  blockedCountries = new Set()
  highlightKeywords = new Set()
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
  rateWindowLimit = LOOKUP_LIMIT_PER_WINDOW
  rateWindowRemaining = LOOKUP_LIMIT_PER_WINDOW
  rateWindowResetAt = 0

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
  if (message?.type === 'CLEAR_CACHE') {
    checkedThisSession.clear()
    clearAllCache()
  }
  if (message?.type === 'SHARE_POST') {
    void shareLastRightClickedPost()
  }
})

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
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`
}

// ---------------------------------------------------------------------------
// Rate limit toast
// ---------------------------------------------------------------------------
/** A click closes the countdown and keeps it closed for this window. */
function dismissRateLimitToast(): void {
  rateLimitToastDismissedUntil = rateLimitResetAt
  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
  rateLimitToastInterval = null
  document.getElementById('x-loc-rate-toast')?.remove()
}

/**
 * `force` un-dismisses first: an explicit gesture (a swipe) is the user asking
 * again, so the countdown comes back — and a click puts it away again. Passive
 * lookups (hover, prefetch) never force.
 */
function showRateLimitToast(force = false) {
  if (force) rateLimitToastDismissedUntil = 0

  // Closed by the user, and still the same window — the reset time hasn't
  // moved. A fresh window carries a later reset and shows again.
  if (rateLimitResetAt <= rateLimitToastDismissedUntil) return

  // Both are pinned to the same bottom-centre slot, and a countdown the user
  // needs beats a request they didn't ask for.
  dismissRatingAsk()

  let toast = document.getElementById('x-loc-rate-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'x-loc-rate-toast'
    // Interactive now, so it has to be reachable: a real role and tab stop,
    // and keys doing what the click does. The ticking text stays the
    // accessible name — the countdown is the content.
    toast.title = 'Click to dismiss'
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
    const t = document.getElementById('x-loc-rate-toast')
    if (remaining <= 0 || !t) {
      if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
      rateLimitToastInterval = null
      t?.remove()
      return
    }
    t.textContent = `⚠ Rate limit hit · resets in ${formatCountdown(remaining)}`
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
export function locationSummaryText(data: LocationData): string {
  const { country: sourceCountry } = classifySource(data.source)
  const corroborated = sourceCountry !== null && sourceCountry === data.location
  const country = sourceCountry ?? data.location

  const parts: string[] = []
  if (country) parts.push(`${getLocationDisplay(country).emoji} ${country}`)
  if (data.locationAccurate === false && !corroborated) parts.push('⚠ VPN')
  return parts.join(' · ')
}

/**
 * Render (or replace) the swipe overlay. `pending` has no auto-dismiss timer, so
 * every pending toast must be resolved by a later call or it never goes away.
 */
function dismissLocationToast() {
  document.getElementById('x-loc-location-toast')?.remove()
  if (locationToastTimer) clearTimeout(locationToastTimer)
  locationToastTimer = null
}

function renderLocationToast(text: string, pending = false) {
  dismissLocationToast()
  // Same slot again: the swipe answer is what the user just asked for.
  dismissRatingAsk()

  const toast = document.createElement('div')
  toast.id = 'x-loc-location-toast'
  toast.textContent = text
  if (pending) toast.dataset.pending = '1'
  document.body.appendChild(toast)

  if (!pending) {
    locationToastTimer = setTimeout(() => toast.remove(), LOCATION_TOAST_MS)
  }
}

function showLocationOverlay(data: LocationData) {
  const text = locationSummaryText(data)
  if (!text) return
  renderLocationToast(text)
}

// ---------------------------------------------------------------------------
// The rating ask
// ---------------------------------------------------------------------------
// The popup card reaches people who open the popup, which after the first day
// is almost nobody. This is the same ask where they actually are — once, on a
// page the extension has already done something useful on.
//
// Everything here is built to be easy to be rid of: it appears after a flag has
// been drawn (so it interrupts a working extension, not a blank one), both ways
// of saying no are one click, saying nothing at all snoozes it for days, and it
// gives up the screen to either of the toasts that carry information.

/** Long enough that the flag it is riding on has been read. */
const RATING_ASK_DELAY_MS = 6000

let ratingAskConsidered = false

function dismissRatingAsk(): void {
  document.getElementById(RATING_ASK_ID)?.remove()
}

/**
 * The toolbar icon itself, inlined at build time.
 *
 * `?inline` makes Vite emit it as a data URI, so it needs no entry in
 * `web_accessible_resources` — the manifest deliberately exposes nothing under
 * `assets/`, because a fetchable extension URL is something x.com can probe
 * for, passively, even while the extension is paused.
 *
 * It is the same file the manifest ships, which is the whole point: the user is
 * being asked to rate the thing behind that icon, so it has to be *that* icon
 * and not a second drawing of it. (The site's mark is a different one — see
 * `landing/src/data/brand-mark.json`.)
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

  // Named and marked, because this appears inside somebody else's page: an
  // unattributed bar over X reads as X asking, and nobody can rate what they
  // cannot identify.
  const message = document.createElement('span')
  message.className = 'x-loc-ask-msg'
  message.appendChild(buildBrandMark())

  const brand = document.createElement('strong')
  brand.textContent = 'X-Pat'
  message.appendChild(brand)

  const text = document.createElement('span')
  text.textContent = '— been useful? A store rating helps a lot.'
  message.appendChild(text)
  bar.appendChild(message)

  const answer = (status: 'later' | 'done') => {
    void setRatePromptState(status)
    dismissRatingAsk()
  }

  bar.appendChild(
    ratingAskButton('Rate it ★', false, () => {
      // window.open rather than a message to the service worker: this is inside
      // a click, so the popup blocker allows it, and it keeps the ask working
      // whether or not the worker happens to be alive.
      window.open(REVIEW_URL, '_blank', 'noopener')
      answer('done')
    }),
  )
  bar.appendChild(ratingAskButton('Later', true, () => answer('later')))
  bar.appendChild(ratingAskButton('No thanks', true, () => answer('done')))

  document.body.appendChild(bar)
  // No dismiss timer: it stays until one of the three buttons is pressed. A
  // timed one asked people who happened to be reading something else, then took
  // the question away before they could answer it — and it only ever appears
  // once, so it can afford to wait.
  //
  // Written before it can be answered, so a page navigated away from with the
  // bar still up counts as asked and does not hound them on the next one. The
  // answer buttons overwrite this.
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
    if (document.getElementById('x-loc-rate-toast')) return
    if (document.getElementById('x-loc-location-toast')) return
    showRatingAsk()
  }, RATING_ASK_DELAY_MS)
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------

/** The captured session headers, as AboutAccountQuery wants them. */
function aboutAccountHeaders(
  captured: Record<string, string>,
): Record<string, string> {
  const headers: Record<string, string> = {
    authorization: captured.authorization,
    'content-type': 'application/json',
    'x-twitter-client-language': captured['x-twitter-client-language'] ?? 'en',
    'x-twitter-active-user': captured['x-twitter-active-user'] ?? 'yes',
  }
  // page-script deliberately never forwards the csrf token, so in practice this
  // always comes from the ct0 cookie; the header is only used when a caller (a
  // test, say) supplied one directly.
  const csrf = captured['x-csrf-token'] || getCookie('ct0')
  if (csrf) headers['x-csrf-token'] = csrf
  return headers
}

/**
 * An AboutAccountQuery response as a cache record, or null when it carried no
 * profile at all — which is not the same as a profile saying "no location".
 */
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

export async function fetchLocationData(
  userName: string,
): Promise<LocationData | null> {
  if (pendingMap.has(userName)) return pendingMap.get(userName)!

  // Capture snapshot so the IIFE always uses the headers that were valid at
  // call time, even if apiHeaders is updated mid-flight.
  const capturedHeaders = apiHeaders

  const promise = (async (): Promise<LocationData | null> => {
    const stored = await getCached(userName)

    // Skip the network if location data is already in IDB.
    // Bio-only entries (location: null, source: null) fall through.
    if (stored?.location || stored?.source) return stored

    // Already ran the API lookup this session — return whatever IDB has (may include bio).
    if (checkedThisSession.has(userName.toLowerCase())) return stored ?? null

    // Don't attempt without intercepted headers — avoids failures before
    // the page-script captures the session.
    if (!capturedHeaders) return null

    if (rateLimitResetAt > Date.now()) {
      showRateLimitToast()
      return null
    }

    try {
      const variables = JSON.stringify({ screenName: userName })
      const url = `${ABOUT_ACCOUNT_URL}?variables=${encodeURIComponent(variables)}`

      noteRequestSent()
      const resp = await fetch(url, {
        method: 'GET',
        headers: aboutAccountHeaders(capturedHeaders),
        credentials: 'include',
      })
      readRateHeaders(resp)

      if (resp.status === 429) {
        const reset = resp.headers.get('x-rate-limit-reset')
        rateLimitResetAt = reset
          ? parseInt(reset) * 1000
          : Date.now() + RESET_DEFAULT
        showRateLimitToast()
        return null
      }

      if (!resp.ok) return null

      checkedThisSession.add(userName.toLowerCase())

      const data = toLocationData(await resp.json(), stored?.bio ?? null)
      if (!data) return stored ?? null

      rememberBio(userName, null, null, data.facts)
      await mergeCached(userName, data)
      // Share this first-hand result so other users can skip the X call.
      contributeLocation(userName, data)
      return data
    } catch {
      return null
    }
  })()

  pendingMap.set(userName, promise)
  promise.finally(() => pendingMap.delete(userName))
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

// The quoted tweet embedded inside an article is rendered as a clickable
// role="link" container that holds its own User-Name block (the quoted author).
// Returns that container, or null when the tweet doesn't quote another post.
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

// Quoted posts render the author as plain text, not links (the whole quote is a
// single role="link"), so the anchor-based extractor above finds nothing. Parse
// the name block instead: "<displayName>@<handle> · <time>".
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
// The bar says *that* an account matched; the hover card is where the reader
// finds out *why*, so the word responsible is marked in the bio.
//
// Nothing here touches the DOM X owns — a <mark> would mean restructuring text
// nodes inside a card React re-renders. Instead, text keywords are painted with
// the CSS Custom Highlight API (Ranges, no markup change), and emoji keywords,
// which X renders as <img alt="🇷🇺"> with no text node to range over, get a
// generated rule matching the alt.
//
// Both are cosmetic: without CSS.highlights (Firefox before 140) the text half
// simply does not paint.

/** The highlight registry, or null in a browser (or a test) without one. */
function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? CSS.highlights
    : null
}

/**
 * Ranges over every keyword occurrence in `root`.
 *
 * Text node by text node, so a keyword split across two is missed rather than
 * mismarked — X breaks bios up around links and emoji, and a Range spanning that
 * split underlines the wrong characters. Our own injected text is skipped, or
 * the extension ends up pointing at itself.
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

/**
 * Re-mark every hover card on screen. A full rescan, because the registry is one
 * global object — rebuilding it from what is open is the only version that can't
 * strand a mark from a closed card or a rule since turned off.
 */
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

/** Drop every mark, and the registry entry with it. */
function clearKeywordMarks(): void {
  highlightRegistry()?.delete(KEYWORD_HIGHLIGHT_NAME)
  document
    .querySelectorAll(`[${KEYWORD_MATCH_ATTR}]`)
    .forEach((el) => el.removeAttribute(KEYWORD_MATCH_ATTR))
}

/**
 * Rewrite the emoji half of the marking — a stylesheet rather than ranges. Kept
 * in its own <style> so the static rules stay static; the rule itself is built
 * in styles.ts, where a test can render the real thing.
 */
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
  if (highlightKeywords.size === 0 && !highlightFlagsEnabled) return
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
  // Keyword marks answer "why is this highlighted", so they follow the same
  // rule changes the highlighting itself does — including an exception added
  // from the card the marks are on.
  void markKeywords()
  // The primary tweet's exception button follows the same rules, so it is
  // re-evaluated on every rule change — including the clearing branch below,
  // where it has to disappear.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  if (highlightKeywords.size === 0 && !highlightFlagsEnabled) {
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

/**
 * Mark every tweet on screen by this account, and every quote of them — for when
 * a bio arrives after the tweets have already rendered.
 */
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

// A feed row grows the tweet, so injecting one above the viewport pushes
// everything below it down and the feed jumps. X positions timeline cells
// absolutely with a computed translateY and re-runs scroll restoration on
// navigation, which defeats native scroll anchoring — so tweets still above the
// fold are parked on an IntersectionObserver and injected on the way back.
// `let` rather than `const` only so __testResetState can swap in a fresh map.
let pendingFeedRows = new WeakMap<Element, LocationData>()
let feedRowObserver: IntersectionObserver | null = null

// True when the row's insertion point (just under the name line) sits entirely
// above the viewport top, i.e. placing the row here would shift the scroll.
function insertionAboveFold(article: Element): boolean {
  const anchor = getNameEl(article) ?? article
  return anchor.getBoundingClientRect().bottom < 0
}

function placeFeedRow(article: Element, data: LocationData): void {
  if (!showLocationInFeed) return
  if (article.querySelector('.x-loc-feed-row')) return
  const userNameEl = getNameEl(article)
  if (!userNameEl) return
  article.setAttribute(FEED_LOCATION_ATTR, '1')
  const row = buildInfoRow(data)
  row.classList.add('x-loc-feed-row')
  userNameEl.insertAdjacentElement('afterend', row)
}

function getFeedRowObserver(): IntersectionObserver {
  if (feedRowObserver) return feedRowObserver
  // Several thresholds so the callback re-fires as a parked tweet scrolls
  // through the viewport, letting us wait until its name line clears the fold
  // (rather than injecting the instant its bottom edge peeks in from the top).
  feedRowObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const article = entry.target
        const data = pendingFeedRows.get(article)
        if (!data || !showLocationInFeed) {
          pendingFeedRows.delete(article)
          feedRowObserver!.unobserve(article)
          continue
        }
        if (insertionAboveFold(article)) continue // still above the fold — wait
        pendingFeedRows.delete(article)
        feedRowObserver!.unobserve(article)
        placeFeedRow(article, data)
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  )
  return feedRowObserver
}

// Place the row now if doing so won't shift the scroll, otherwise park it until
// the tweet is scrolled into view (see pendingFeedRows / getFeedRowObserver).
function injectFeedRow(article: Element, data: LocationData): void {
  if (article.querySelector('.x-loc-feed-row')) return
  if (pendingFeedRows.has(article)) {
    pendingFeedRows.set(article, data)
    return
  }
  if (insertionAboveFold(article)) {
    pendingFeedRows.set(article, data)
    getFeedRowObserver().observe(article)
    return
  }
  placeFeedRow(article, data)
}

async function tryInjectFeedLocation(article: Element) {
  if (!showLocationInFeed) return
  if (article.getAttribute(FEED_LOCATION_ATTR)) return
  if (article.matches(SEL_PRIMARY_TWEET)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  article.setAttribute(FEED_LOCATION_ATTR, '1')

  const data = await getCached(userName)
  if (!data || (!data.location && data.locationAccurate && !data.source)) return

  injectFeedRow(article, data)
}

function injectFeedLocationForUser(userName: string, data: LocationData) {
  if (!showLocationInFeed) return
  if (!data.location && data.locationAccurate && !data.source) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (!getNameEl(article) || article.querySelector('.x-loc-feed-row')) return
    article.setAttribute(FEED_LOCATION_ATTR, '1')
    injectFeedRow(article, data)
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
// Collapse behind a placeholder rather than removing: a visible, reversible
// trace, and an attribute plus CSS survives React's re-renders where surgery on
// its nodes would not.
/** Everything of `match` a placeholder shows — so a change to it is visible. */
function placeholderKey(match: FilterMatch): string {
  return `${match.rule}|${match.icon}|${match.label}`
}

function buildHiddenPlaceholder(
  target: Element,
  userName: string,
  match: FilterMatch,
  reveal: (target: Element) => void,
): HTMLElement {
  const ph = document.createElement('div')
  ph.className = HIDDEN_PLACEHOLDER_CLASS
  // What this placeholder says, for hideArticle to compare against. Rebuilding
  // it on every refresh is what used to churn every post on the page for an
  // exception that concerned one account; never rebuilding it would leave it
  // naming a rule that has since stopped being the one that caught this post.
  ph.dataset.match = placeholderKey(match)

  const labelEl = document.createElement('span')
  labelEl.className = 'x-loc-hidden-label'
  labelEl.textContent = `🚫 Hidden · ${match.icon} ${match.label}`

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'x-loc-hidden-show'
  btn.textContent = 'Show'
  // Naming the rule matters more now that four of them can produce this
  // placeholder: "hidden — 🌱 3d old" is only actionable if you know which
  // setting to go and change.
  btn.title = `Reveal this post (${FILTER_RULE_LABEL[match.rule]}: ${match.label})`
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    reveal(target)
  })

  ph.appendChild(labelEl)
  ph.appendChild(btn)

  // A collapsed post leaves nothing to hover, so the hover card the button
  // normally lives in can't be opened here. "Show" spares this post; this spares
  // the account. Only the rule that hid it — the one it can name.
  if (showExceptionButton) {
    ph.appendChild(buildExceptionButton(userName, [match.rule]))
  }
  return ph
}

const FILTER_RULE_LABEL: Record<FilterRule, string> = {
  highlight: 'highlight rule',
  location: 'blocked location',
  affiliation: 'blocked affiliation',
  age: 'account age',
}

// --- resizing a post without moving the scroll ------------------------------
// Collapsing a post takes height out of the page from its top edge down. While
// that edge is above the viewport top the height leaves the scrollport, and X's
// timeline answers by scrolling the window itself to compensate. It issues one
// `window.scrollBy` per cell it saw resize, and each carries the running total
// for the batch rather than that cell's own delta — so one cell at a time is
// exact, and k cells resizing in the same frame scroll by roughly k× the height
// actually removed. Measured on a status page: seven replies collapsed together
// took out 2065px of content and moved the scroll 8244px. Growth is the same in
// reverse — eleven posts expanded at once added 774px and scrolled 13982px.
//
// Nothing above the fold has to be resized on the spot, so a change that would
// resize up there is parked until the post's top edge is back in view, where it
// only moves content the user can see and X compensates for nothing at all.
// The same deal pendingFeedRows strikes for the row it injects.
// `let` rather than `const` only so __testResetState can swap in fresh state.
let pendingResizes = new WeakMap<Element, () => void>()
let resizeObserverIO: IntersectionObserver | null = null

// Every 5%, rather than the quarters the feed row settles for. A post taller
// than the viewport holds a constant intersection ratio for the whole time its
// top edge is climbing to the fold, so coarse steps leave it parked well past
// the moment it became safe.
const RESIZE_THRESHOLDS = Array.from({ length: 21 }, (_, i) => i / 20)

/** True when resizing `target` would take height out of the scrollport. */
function resizeAboveFold(target: Element): boolean {
  return target.getBoundingClientRect().top < 0
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

/** Drop a parked change — the post was revealed, or no longer matches a rule. */
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

/** Take back a collapse the rules no longer call for; a no-op if there was none. */
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
// placeholder, so the post is on screen and the user is waiting on it.
function revealArticle(article: Element): void {
  cancelPendingResize(article)
  article.removeAttribute(HIDDEN_ATTR)
  article.setAttribute(HIDDEN_REVEALED_ATTR, '1')
  article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
}

// --- quoted posts -----------------------------------------------------------
// A quoted post has its own author, unrelated to whoever quoted them. Collapsing
// the whole row for the quoted account takes away a post the user never filtered
// (X-Posed shipped that and had to fix it), so the quote collapses alone.

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

/** The quoted-post half of unhideArticle. */
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
  quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
}

/**
 * Collapse a just-inserted post when this account has already been judged this
 * session, in the same microtask the node arrived in.
 *
 * X recreates article nodes as you scroll, and nothing the extension sets
 * survives the unmount — of eighteen tagged articles, none came back. So a post
 * that was collapsed returns at full height, and collapsing it again one
 * IndexedDB read later is a resize above the fold, which is what moves the page
 * on the way back up. Judged from hideVerdicts instead, the post is collapsed
 * before it is ever laid out and there is no height change at all: measured
 * over a sixteen-step scroll, that is the difference between 2188px of
 * uncommanded scroll and none.
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

// Hide every on-screen tweet by this user once their data is known (e.g. a
// shared-cache hit or a hover lookup resolved it), mirroring
// injectFeedLocationForUser.
function hideTweetsForUser(userName: string, data: LocationData): void {
  if (hideMode === 'off') return
  const match = hideMatchFor(userName, data)
  if (!match) return
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

/** What the rules say about one post, with the cache reads already done. */
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

// Re-evaluate every on-screen tweet after a rule change.
//
// Ask first, mutate second, and only where the answer changed. Stripping every
// attribute up front and asking the cache afterwards — which is what this did —
// sprang every collapsed post back to full height for as long as an IndexedDB
// read takes, then collapsed them all again: two page-wide resize storms, and
// the worst possible input to X's scroll compensation (see whenSafeToResize).
// An exception added for one account would move the whole page. Now it touches
// that account's posts and leaves every other post's DOM exactly as it was.
async function refreshHiddenTweets(): Promise<void> {
  if (!extensionEnabled) return
  // Every rule change comes through here, and every one of them can change what
  // a remembered verdict should have been — so this is where they are dropped.
  // judgePost re-fills the map as it goes.
  hideVerdicts.clear()
  // The one button covers these rules too, so a change to any of them can make
  // it appear, change what it offers, or go away — the same reason
  // rehighlightAll syncs it for the keyword rules.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  const verdicts = await Promise.all(articles.map(judgePost))
  // Bottom-up: collapsing a post moves everything after it, so working from the
  // end leaves each post's geometry — which whenSafeToResize is about to read —
  // untouched by the changes already applied.
  for (let i = verdicts.length - 1; i >= 0; i--) {
    if (verdicts[i].article.isConnected) applyPostVerdict(verdicts[i])
  }
  void refreshPeopleCells()
}

// ---------------------------------------------------------------------------
// Marking posts a rule points at rather than hides
// ---------------------------------------------------------------------------
// Same mechanism as hiding, but nothing is taken away — so no placeholder, no
// "Show", no revealed-flag, and no reason to skip the post a status page is
// about. A young author is worth knowing on the post you opened.

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

/**
 * Mark every post on screen by this account once their data arrives. A post is
 * judged when it first appears, usually before anything is known about the
 * author, so the answer from an empty cache has to be revisited.
 */
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
// Marked, never removed. Hiding rows breaks what the page exists to show: the
// count says 400 and you scroll past 380, with no way to tell whether the
// extension ate them or the list is stale.

/** The handle a people-list row is about, from its first profile link. */
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
  tag.textContent = `${match.icon} ${match.label}`
  tag.title = `Matches your ${FILTER_RULE_LABEL[match.rule]} — shown, not hidden`
  const nameEl = getNameEl(cell) ?? cell
  nameEl.insertAdjacentElement('beforeend', tag)
}

/**
 * A row is marked when first seen, usually before the account's data arrives — so
 * a resolving lookup has to re-judge the rows rather than leave them.
 */
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
 * Everything that happens when an account's data lands: the feed row, the
 * filters, the people rows. One function, so no caller wires up two of three.
 */
function applyFiltersForUser(userName: string, data: LocationData): void {
  injectFeedLocationForUser(userName, data)
  hideTweetsForUser(userName, data)
  markTweetsForUser(userName, data)
  markPeopleCellsForUser(userName, data)
}

/** Re-evaluate every people row after a rule change. */
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

function buildInfoRow(data: LocationData): HTMLElement {
  // Every surface that shows a flag — feed, hover card, primary tweet, swipe —
  // goes through here, which makes it the one place that means "the extension
  // did something visible today". The popup's rating ask counts those days.
  void noteActiveDay().then(considerRatingAsk)

  const row = document.createElement('div')
  row.className = 'x-loc-info'

  const { platform, country: sourceCountry } = classifySource(data?.source)

  if (sourceCountry) {
    const { emoji: storeFlag, isText: storeFlagIsText } =
      getLocationDisplay(sourceCountry)
    const block = document.createElement('span')
    block.className = 'x-loc-store-block'
    // The raw string is the honest tooltip: it names the store *and* which one,
    // where the glyph alone only shows the platform.
    block.title = data.source!
    block.setAttribute(
      'aria-label',
      `${platformLabel(platform)} region: ${sourceCountry}`,
    )

    const glyph = buildSourceGlyph(platform)
    if (glyph) block.appendChild(glyph)

    const flag = document.createElement('span')
    flag.className = `x-loc-icon-flag ${storeFlagIsText ? 'x-loc-icon-abbr' : ''}`
    flag.textContent = storeFlag

    block.appendChild(flag)
    row.appendChild(block)
  }

  if (data?.location) {
    const { emoji, label, isText } = getLocationDisplay(data.location)
    const icon = makeIcon(emoji, label)
    icon.classList.add('x-loc-icon-flag')
    if (isText) icon.classList.add('x-loc-icon-abbr')
    row.appendChild(icon)
  }

  if (data?.locationAccurate === false) {
    const vpn = document.createElement('span')
    vpn.className = 'x-loc-icon-vpn'
    vpn.title = 'VPN used, location can be inaccurate'
    vpn.textContent = '⚠ VPN'
    row.appendChild(vpn)
  }

  return row
}

// ---------------------------------------------------------------------------
// The exception button
// ---------------------------------------------------------------------------
// One button, whatever the reason. Keyword, country, affiliate badge, age — from
// the reader's side these are one complaint, "not this account", and four
// buttons would make them learn the extension's rule names first.
//
// So it covers every rule acting on the account and names them in its tooltip.
// The exceptions stay per-rule underneath; the button just writes to all of
// them.

/**
 * Persist the exception record to both keys. Reads merge the old
 * `HIGHLIGHT_EXCEPTIONS_KEY` into the general one, so writing only the new key
 * would let a *removal* come straight back from the stale copy — and keeping the
 * mirror also lets a downgrade find its exceptions.
 */
function writeRuleExceptions(next: RuleExceptions): void {
  ruleExceptions = next
  chrome.storage.local.set({
    [RULE_EXCEPTIONS_KEY]: next,
    [HIGHLIGHT_EXCEPTIONS_KEY]: next.highlight,
  })
}

/**
 * Every rule acting on an account right now, exceptions included — a rule already
 * excepted is exactly the one the button must keep offering, or a mistake could
 * only be undone from the options page. An account nothing applies to gets no
 * button rather than one that writes a setting with no effect.
 */
export function activeRulesFor(
  userName: string,
  data: LocationData | null | undefined,
  displayName: string,
  bio: string | null | undefined,
): FilterRule[] {
  // Nothing acts on an allowlisted account, so there is nothing to except it
  // from; a button here would only write a second, redundant entry for the user
  // to find later and wonder about.
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
const RULE_EXCEPTION_PHRASE: Record<FilterRule, string> = {
  highlight: 'keyword and flag highlighting',
  location: 'the blocked-location filter',
  affiliation: 'the blocked-affiliation filter',
  age: 'the account-age filter',
}

function joinPhrases(items: string[]): string {
  if (items.length < 2) return items[0] ?? ''
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`
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
    const phrase = joinPhrases(rules.map((rule) => RULE_EXCEPTION_PHRASE[rule]))
    // The label stays the same whatever the rule; only the tooltip names it.
    // Four different labels would make the same control look like four, which
    // is the thing this button exists to avoid.
    btn.textContent = excepted ? '✓ Exception (undo)' : '🚫 Add exception'
    btn.title = excepted
      ? `@${userName} is exempt from ${phrase} — click to undo`
      : `Exempt @${userName} from ${phrase}`
    btn.classList.toggle('x-loc-exc-active', excepted)
    // Read back by syncExceptionButton: a click here settles the state locally,
    // and the sync the resulting storage write triggers must not then rebuild
    // the button from the same state it already shows.
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
 * Put the button where it belongs in `host`, or take it away. Called more than
 * once per card — the highlight rule answers from the bio at once, the rest wait
 * on the lookup — and rebuilt rather than patched, so the label, tooltip and
 * handler always describe the same rule set.
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
// The facts X already sent, under the location row: age, affiliate badge,
// verification, handle history, reach. All of it rides along with responses the
// extension already receives, so the card costs no lookups — and nothing is
// inferred, each chip being a field X returned, phrased as X phrased it.

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
        text: '🚫 Blocked you',
        title: 'This account blocks your account',
        tone: 'block',
      }
    : null

const ageChip: ChipBuilder = (facts, now) => {
  const age = formatAccountAge(facts.createdAt, now)
  if (!age) return null
  const days = accountAgeDays(facts.createdAt, now) ?? 0
  const created = new Date(facts.createdAt!).toISOString().slice(0, 10)
  return {
    text: `🎂 ${age}`,
    title: `Account created ${created}`,
    // Under three months is the one age worth flagging visually: it is the
    // single strongest tell for a bought or freshly farmed account, and it is
    // also just what a new user looks like — hence a tint, not a warning.
    tone: days < 90 ? 'warn' : 'plain',
  }
}

const affiliationChip: ChipBuilder = (facts) => {
  if (!facts.affiliation) return null
  const { name, handle } = facts.affiliation
  const shown = name || (handle ? `@${handle}` : null)
  if (!shown) return null
  return {
    text: `🏢 ${shown}`,
    title: handle
      ? `X shows an affiliate badge linking to @${handle}`
      : 'X shows an affiliate badge on this account',
  }
}

// No chip for plain Premium: X already draws the blue check. These two earn
// their place by being invisible otherwise — X renders identity and legacy
// verification with the same badge as a paid one.
const verificationChip: ChipBuilder = (facts) => {
  if (facts.identityVerified) {
    return { text: '🪪 ID verified', title: 'X verified an identity document' }
  }
  if (facts.verified) {
    return { text: '✔ Verified', title: 'Legacy verification' }
  }
  return null
}

const handleChangesChip: ChipBuilder = (facts) => {
  const changes = facts.handleChanges
  if (typeof changes !== 'number' || changes <= 0) return null
  return {
    text: `✎ ${changes} handle${changes === 1 ? '' : 's'}`,
    title: `This account has changed its @handle ${changes} time(s)`,
    tone: changes >= 3 ? 'warn' : 'plain',
  }
}

const protectedChip: ChipBuilder = (facts) =>
  facts.isProtected
    ? { text: '🔒 Protected', title: 'Posts are protected' }
    : null

/**
 * Every chip an account can earn, in the order they are worth reading — the
 * blocked-you one first, because it explains everything the card is missing.
 *
 * A table rather than a run of `if`s: each rule answers independently from the
 * same facts, so the order is the only thing they share, and this is the one
 * place it is stated.
 */
const CHIP_BUILDERS: ChipBuilder[] = [
  blockedByChip,
  ageChip,
  affiliationChip,
  verificationChip,
  handleChangesChip,
  protectedChip,
]

/** The chips an account's facts earn. */
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

function buildRateLimitRow(): HTMLElement {
  const row = document.createElement('div')
  row.className = 'x-loc-info'

  const badge = document.createElement('span')
  badge.className = 'x-loc-icon-ratelimit'
  badge.title = 'X API rate limit reached — location lookups paused until reset'
  badge.textContent = `⏱ ${formatCountdown(rateLimitResetAt - Date.now())}`
  row.appendChild(badge)

  const interval = setInterval(() => {
    const remaining = rateLimitResetAt - Date.now()
    if (remaining <= 0 || !badge.isConnected) {
      clearInterval(interval)
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
// An account that blocks the reader gets a stripped hover card — no bio, no
// follow button, no counts — but the bio is still in the timeline response the
// extension already read, and the highlight rule still fires on it. Without
// this the card carries a mark and no reason for it.

/**
 * A slice of `bio` distinctive enough to look for in a card, or '' if there
 * isn't one.
 *
 * URLs come out first: they are the one part of a bio X does not render
 * verbatim — it substitutes a t.co display form — so leaving them in would
 * report a bio as missing from a card that is showing it.
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

/**
 * Put the bio back when X's card carries none.
 *
 * Rebuilt rather than appended, and run again once the lookup returns, so a
 * card React filled in late ends up with X's own bio rather than two of them.
 */
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
  el.title = "Bio from X's API — this card doesn't show one"
  // Before the wrap, not inside it: this is the account's own words and belongs
  // under the handle, above anything the extension has to say. Sitting outside
  // .x-loc-hover also puts it back in reach of keywordRangesIn, so the word that
  // matched is marked here the way it would be in a bio X had rendered.
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

/**
 * The "Copy card" button, in the flags row rather than under it: an action on
 * exactly what that row shows, and a hover card is short on vertical space. No
 * row means nothing to copy but a handle.
 */
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

  // One container, filled as each piece resolves. Inserted separately they came
  // out backwards: insertIntoCard anchors every call to the same node, so each
  // new element landed above the last.
  const wrap = document.createElement('div')
  wrap.className = 'x-loc-hover'
  insertIntoCard(card, userName, wrap)

  // The highlight rule answers from the bio alone, so the button can go in
  // before the lookup — a hover card gets a second or two of attention and the
  // lookup can eat all of it. Synced again below for the other rules.
  const place = (btn: HTMLElement) => wrap.appendChild(btn)
  const known = await getBioInfo(userName)
  syncBioRow(wrap, card, known.bio)
  syncExceptionButton({ host: wrap, userName, data: null, info: known, place })
  void markKeywords()

  const data = await fetchLocationData(userName)

  if (data === null && rateLimitResetAt > Date.now()) {
    wrap.prepend(buildRateLimitRow())
    return
  }

  // The location row needs a location; the account card does not, so an account
  // X has no country for can still show its age and badges.
  const infoRow =
    data && (data.location || !data.locationAccurate || data.source)
      ? buildInfoRow(data)
      : null
  if (infoRow) wrap.prepend(infoRow)

  // getBioInfo, not `data`: the in-memory record is the merged view, so a hover
  // shows the follower count the timeline supplied alongside the handle history
  // only AboutAccountQuery carries.
  const info = await getBioInfo(userName)

  // Again, now that React has had the length of the lookup to render the card:
  // whichever answer is right by this point is the one that stays.
  syncBioRow(wrap, card, info.bio)

  syncAccountCard(wrap, card, infoRow, info.facts)
  syncShareButton(card, infoRow, userName, info.displayName ?? '')

  // Now that the country, the badge and the age are known, the button may cover
  // more rules than the bio alone could offer — or become the first thing worth
  // offering at all.
  syncExceptionButton({ host: wrap, userName, data, info, place })
  // Again: React often fills the card in after the first pass, and the bio is
  // the part being marked.
  void markKeywords()

  if (!data) return
  applyFiltersForUser(userName, data)
}

// ---------------------------------------------------------------------------
// Process primary tweet author on status pages
// ---------------------------------------------------------------------------
/** The account a status page is about, or null when this isn't one. */
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

// The button goes inline under the name line on a status page, because X cannot
// be relied on to open a hover card for the account the page is *about*. It
// sometimes does — measured August 2026 — but a control that appears only when
// X feels like opening a card is not a control. Synced rather than injected
// once: the keyword that makes it relevant often arrives long after the page
// settled, and removing it must take the button away again.
async function syncPrimaryExceptionButton(): Promise<void> {
  const target = primaryTweetTarget()
  if (!target) return
  const { userNameEl, userName } = target

  // getBioInfo, not getCached, for the bio: it reads the same in-memory record
  // that decided the highlight, so the button can never disagree with the
  // highlight it undoes. The location data has no such in-memory view, and this
  // runs on every rule change — so it reads the cache rather than the network.
  const [info, data] = await Promise.all([
    getBioInfo(userName),
    getCached(userName),
  ])

  // Re-queried after the awaits, not before: two rule changes in quick
  // succession put two of these in flight, and a stale handle to "the existing
  // button" means the second run appends a duplicate instead of replacing it.
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
    row = buildRateLimitRow()
  } else if (data && (data.location || !data.locationAccurate || data.source)) {
    row = buildInfoRow(data)
  }

  if (!row) return

  // Guard against double-injection if React re-renders before await resolves.
  // Searched rather than read off handleDiv.nextElementSibling: the exception
  // button can already sit between the two.
  if (userNameEl.querySelector('.x-loc-info')) return

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

// The post a hover card was opened from. The card carries only the account, and
// X gives it no link back to the post the pointer was on — so the anchor is
// remembered as the pointer enters the profile link that will open it.
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

/**
 * The post this account is being copied from, or null. The remembered hover
 * anchor first, then any post by the same account still on screen — which covers
 * a card opened from a mention or the profile header.
 */
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

/**
 * The flag for a location, ignoring the blocked list. getLocationDisplay swaps in
 * ⚠️ for a filtered location, which is right on the page and wrong in a shared
 * image, where the reader would take the warning for something X said.
 */
function flagEmojiFor(location: string): string {
  const key = canonicalLocation(location)
  return COUNTRY_FLAGS[key] ?? REGION_FLAGS[key] ?? '🌐'
}

/**
 * The location strip added to a snapshot: country names in words, next to their
 * flags. A flag is hoverable on screen; in a reposted image it is a small
 * coloured rectangle, and plenty are near-identical at that size. Reusing
 * `shareChips` keeps the wording identical to the drawn card.
 *
 * Every style is inline: this is added after the computed styles are copied, and
 * no stylesheet reaches inside the SVG.
 */
function buildSnapshotLocationRow(data: LocationData): HTMLElement {
  const row = document.createElement('div')
  // Laid out exactly like the row on the page — the same strip the user already
  // reads, not a new component. No `color`, so it inherits X's own from the
  // inlined ancestor styles and reads correctly on either theme.
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
    label.textContent = `${flagEmojiFor(storeCountry)} ${storeCountry}`
    block.appendChild(label)
    row.appendChild(block)
  }

  if (data.location) {
    const loc = document.createElement('span')
    loc.textContent = `${flagEmojiFor(data.location)} ${data.location}`
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
    vpn.textContent = '⚠ VPN'
    row.appendChild(vpn)
  }

  return row
}

/** Buttons aimed at the reader rather than part of the post. */
const RE_READER_ACTION = /^(subscribe|follow|following|unfollow)$/i

/** Strip our own on-page furniture from a clone, then add the location strip. */
export function decorateSnapshot(clone: Element, data: LocationData): void {
  clone
    .querySelectorAll(
      `.x-loc-share-btn, .x-loc-exc-btn, .x-loc-card, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-info`,
    )
    .forEach((el) => el.remove())

  // The ⋯ menu, Grok, Subscribe/Follow: controls pointed at whoever is looking,
  // not part of the post, and in a shared image an invitation to click something
  // that cannot work. Grok is matched on a substring of its aria-label, since X
  // localises the label but not the product name inside it.
  clone
    .querySelectorAll('[data-testid="caret"], [aria-label*="Grok" i]')
    .forEach((el) => el.remove())
  for (const btn of Array.from(
    clone.querySelectorAll<HTMLElement>('[role="button"]'),
  )) {
    if (RE_READER_ACTION.test(btn.textContent?.trim() ?? '')) btn.remove()
  }

  const row = buildSnapshotLocationRow(data)

  // Where the extension places it on the page, which differs by layout: after
  // the name block in a feed or reply (placeFeedRow), inside it and straight
  // after the handle on a status page (processPrimaryTweet). Inserting after the
  // block in both cases left the detail-page flags floating away from the
  // account, since that layout sizes the block's bottom spacing for the text.
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
 * Render and deliver a card. One path for both entry points, so the toast
 * wording, the "never spend a lookup" rule and the failure handling can't drift.
 *
 * Snapshots the real post when there is one, for X's own layout and media. The
 * drawn card stays as the fallback — the snapshot renders in a restricted
 * context on a page we don't control, so it has more ways to fail.
 */
async function shareCardFor(
  userName: string,
  displayName: string,
  article: Element | null,
): Promise<void> {
  renderLocationToast(`Rendering @${userName} …`, true)

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
      where === 'clipboard' ? '✓ Copied to clipboard' : '✓ Image saved',
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
    try {
      await deliver(
        await snapshotElement(article, {
          background: getComputedStyle(document.body).backgroundColor || '#fff',
          decorate: (clone) => decorateSnapshot(clone, data),
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
    renderLocationToast('Could not render that card')
  }
}

async function shareLastRightClickedPost(): Promise<void> {
  if (!extensionEnabled) return
  const article =
    lastRightClickedTweet ?? document.querySelector(SEL_PRIMARY_TWEET)
  if (!article) {
    renderLocationToast('Right-click a post to share it')
    return
  }

  const { userName, displayName } = extractTweetUserInfo(article)
  if (!userName) {
    renderLocationToast('Could not read that post')
    return
  }

  await shareCardFor(userName, displayName, article)
}

/**
 * The copy button that rides in the hover card's flags row — on that line to keep
 * the card short. The context menu was the only way in, and a feature reachable
 * solely by right-clicking is one most people never find.
 *
 * Copies the post the card was opened from (postTextForAccount), falling back to
 * an account-only card.
 */
function buildShareButton(userName: string, displayName: string): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'x-loc-share-btn'
  btn.type = 'button'
  btn.textContent = '🖼 Copy'
  btn.title = `Copy this post and what X reports for @${userName} as an image`

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
/**
 * `fn` on the node itself when it matches, otherwise on every match inside it.
 * A node added to the timeline is sometimes the article and sometimes the
 * container it arrived in, and every caller here has to handle both.
 */
function eachMatching(
  node: Element,
  selector: string,
  fn: (el: Element) => void,
): void {
  if (node.matches(selector)) fn(node)
  else node.querySelectorAll<Element>(selector).forEach(fn)
}

/** Everything the extension does to a tweet the moment it appears. */
function decorateTweet(article: Element): void {
  // First, and synchronously: a post whose account is already judged is
  // collapsed here, before this node has been laid out even once. Everything
  // below waits on a cache read, by which time collapsing it is a resize.
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

/**
 * Far enough and straight enough to be a deliberate rightward swipe rather than a
 * tap or a scroll? The dominance ratio earns its place mid-drag, where a vertical
 * fling starting on a diagonal briefly satisfies the raw thresholds.
 */
export function isCommittedSwipe(dx: number, dy: number): boolean {
  const drift = Math.abs(dy)
  if (dx < SWIPE_MIN_X || drift > SWIPE_MAX_Y) return false
  return dx >= drift * SWIPE_X_DOMINANCE
}

function tweetFromTouch(e: TouchEvent): Element | null {
  const target = e.target
  return target instanceof Element ? target.closest<Element>(SEL_TWEET) : null
}

/** Look up the swiped tweet's author and show the result. */
async function revealLocationForSwipe(article: Element) {
  if (!extensionEnabled) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  // Acknowledge the gesture now; the lookup may take a network round trip and
  // a swipe that appears to do nothing invites the user to swipe again.
  renderLocationToast(`@${userName} …`, true)

  const data = await fetchLocationData(userName)
  if (!data || !locationSummaryText(data)) {
    // Separate "X knows nothing about this account" from "we couldn't ask":
    // the rate-limit toast owns the same corner and explains itself, and a
    // swipe before the session headers land is transient.
    const rateLimited = rateLimitResetAt > Date.now()
    if (rateLimited || apiHeaders === null) {
      dismissLocationToast()
      // The explanation the corner promises, even if the user clicked it away
      // earlier — the swipe asked for it back.
      if (rateLimited) showRateLimitToast(true)
    } else {
      renderLocationToast('No location')
    }
    return
  }

  // Inject below username even if showLocationInFeed is off — user explicitly swiped
  if (!article.querySelector('.x-loc-feed-row')) {
    const userNameEl = getNameEl(article)
    if (userNameEl) {
      article.setAttribute(FEED_LOCATION_ATTR, '1')
      const row = buildInfoRow(data)
      row.classList.add('x-loc-feed-row')
      userNameEl.insertAdjacentElement('afterend', row)
    }
  }

  showLocationOverlay(data)
}

/**
 * The gesture commits mid-drag, not on touchend: waiting for the lift spent the
 * rest of the swipe — usually longer than the lookup — before starting. touchend
 * stays as a backstop for flicks no touchmove reported past the threshold.
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
    // Auth just became available — a wanted prefetcher can start now.
    syncPrefetcher()
  }
})

// ---------------------------------------------------------------------------
// Listen for user bio data intercepted from timeline/tweet API responses
// ---------------------------------------------------------------------------
// Look up a batch of just-loaded usernames in the shared cache and apply the
// confirmed hits, so a flag can show without a per-profile X call. Bios arrive
// free with the timeline JSON (the USERS_DATA handler below).
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
// Background location prefetcher
// ---------------------------------------------------------------------------
// Trickle lookups for on-screen accounts in feed order, paced across the
// rate-limit window and using at most 70% of it. See prefetch-queue.ts.
const prefetcher = new BackgroundPrefetcher({
  fetch: async (userName) => {
    const data = await fetchLocationData(userName)
    if (data) {
      applyFiltersForUser(userName, data)
    }
  },
  isKnown: async (userName) => {
    if (checkedThisSession.has(userName.toLowerCase())) return true
    const cached = await getCached(userName)
    return Boolean(cached && (cached.location || cached.source))
  },
  rateState: currentRateState,
})

// Prefetch exists to warm the shared cache, so opting out of that switches it
// off too. A build with no cache server can't be opted out of (the toggle isn't
// shown), so there the setting gates nothing.
//
// Settings-level answer only — prefetchWanted() adds the runtime requirement of
// captured headers. Independent of feed display, since the cache is worth warming
// either way.
function prefetchAllowedBySettings(): boolean {
  if (!extensionEnabled) return false
  if (!prefetchEnabled) return false
  return !isSharedCacheConfigured() || isSharedCacheEnabled()
}
function prefetchWanted(): boolean {
  return prefetchAllowedBySettings() && apiHeaders !== null
}
function syncPrefetcher(): void {
  if (prefetchWanted()) prefetcher.start()
  else prefetcher.stop()
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
  // Queue even before auth headers arrive; syncPrefetcher() starts the draining.
  // The array is in timeline order and the queue is FIFO, so lookups follow the
  // feed down. page-script tags each user with the queue they belong in.
  if (prefetchAllowedBySettings()) {
    prefetcher.enqueue(
      users.map((u) => ({
        userName: u.userName,
        priority: u.priority ?? 'high',
      })),
    )
  }
  for (const { userName, displayName, bio, facts } of users) {
    // Record bio/displayName/facts synchronously so highlighting and the
    // account filters can read them immediately — before, and independent of,
    // the async mergeCached write.
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
// Send any buffered community-cache contributions before the tab goes away, so
// the long 30s batching window doesn't strand a batch until the next session.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushContributions()
})
window.addEventListener('pagehide', () => flushContributions())
// Replay auth headers captured before this content script (document_idle)
// attached its listener. (The parallel REQUEST_USERS replay for bios is fired
// from the settings-load callback above instead — it must wait until keywords
// are loaded, or the replayed bios would be evaluated against empty settings.)
window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_HEADERS))
