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
  normalizeAccountAge,
  normalizeHandleList,
  normalizeHideBlockedMode,
  normalizeRuleExceptions,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  LOOKUP_LIMIT_PER_WINDOW,
  MIN_CONFIDENCE_KEY,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
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
} from './countries'
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
  formatFollowers,
  parseAccountFacts,
} from './profile'
import type { AccountFacts } from './profile'
import { buildSourceGlyph, classifySource, platformLabel } from './source'
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

// Held canonicalised *and region-expanded*, and every location is canonicalised
// before it's tested against the set — so a list saved as "USA" or "Czech
// Republic" still blocks the "United States" / "Czechia" X reports, and a list
// holding "South Asia" blocks an account reported as Pakistan as well as one
// reported as the region itself.
//
// The expansion lives here rather than in storage on purpose: what the user
// picked and what that picks out are different things, and only the second
// belongs in a comparison. Storage keeps "Africa" as one entry the options page
// can render as one removable chip.
function toBlockedSet(stored: unknown): Set<string> {
  return expandLocations(Array.isArray(stored) ? (stored as string[]) : [])
}

function isBlockedLocation(loc: string): boolean {
  return blockedCountries.has(canonicalLocation(loc))
}

let highlightKeywords = new Set<string>()
let highlightFlagsEnabled = false
let highlightFlagsThreshold = 2
let highlightFlagsUniqueOnly = false
let showLocationInFeed = false
// How to treat tweets whose author's location is on the blocked list. Starts
// 'off' only as a pre-load placeholder (so nothing is hidden on a guess before
// settings arrive); the persisted default is 'collapse' — see
// normalizeHideBlockedMode, applied on the storage load below.
let hideMode: HideBlockedMode = 'off'
// Per-rule exemptions: which accounts each filter must skip. `highlight` is the
// old single-purpose exception list, generalised — see normalizeRuleExceptions.
let ruleExceptions: RuleExceptions = normalizeRuleExceptions(undefined)
// Accounts exempt from every rule at once.
let alwaysShow = new Set<string>()
// Parent-org handles whose badged accounts are filtered.
let blockedAffiliations = new Set<string>()
// Filter accounts younger than N days. Off unless the user turns it on.
let accountAgeFilter: AccountAgeFilter = normalizeAccountAge(undefined)
// Whether to render the one-click exception button on hover cards.
let showExceptionButton = true
// Whether hover cards get the account-facts card under the location row.
let showAccountCard = true
// Whether hover cards get the "Copy card" button.
let showShareButton = true
// Whether background location prefetching runs (options toggle; default on).
let prefetchEnabled = true
// Master switch. Everything this script does is gated on it, and flipping it
// off strips what is already on screen — a switch that only stopped *new* work
// would leave the page half-decorated and read as a bug.
let extensionEnabled = true

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
    extensionEnabled =
      EXTENSION_ENABLED_KEY in r ? Boolean(r[EXTENSION_ENABLED_KEY]) : true
    blockedCountries = toBlockedSet(r[BLOCKED_COUNTRIES_KEY])
    highlightKeywords = new Set<string>(
      Array.isArray(r[HIGHLIGHT_KEYWORDS_KEY])
        ? (r[HIGHLIGHT_KEYWORDS_KEY] as string[]).map((k) => k.toLowerCase())
        : [],
    )
    setKeywords([...highlightKeywords])
    updateKeywordEmojiStyle()
    const flags = r[HIGHLIGHT_FLAGS_KEY] as
      | { enabled?: boolean; threshold?: number; uniqueOnly?: boolean }
      | undefined
    highlightFlagsEnabled = flags?.enabled ?? false
    highlightFlagsThreshold = flags?.threshold ?? 2
    highlightFlagsUniqueOnly = flags?.uniqueOnly ?? false
    // Off by default — the user opts in from the options page. (Mobile users can
    // still swipe-right on any tweet to reveal a location without this enabled.)
    showLocationInFeed = Boolean(r[SHOW_LOCATION_IN_FEED_KEY])
    ruleExceptions = normalizeRuleExceptions(
      r[RULE_EXCEPTIONS_KEY],
      r[HIGHLIGHT_EXCEPTIONS_KEY],
    )
    alwaysShow = new Set(normalizeHandleList(r[ALWAYS_SHOW_KEY]))
    blockedAffiliations = new Set(
      normalizeHandleList(r[BLOCKED_AFFILIATIONS_KEY]),
    )
    accountAgeFilter = normalizeAccountAge(r[ACCOUNT_AGE_KEY])
    showExceptionButton =
      SHOW_EXCEPTION_BUTTON_KEY in r
        ? Boolean(r[SHOW_EXCEPTION_BUTTON_KEY])
        : true
    showAccountCard =
      SHOW_ACCOUNT_CARD_KEY in r ? Boolean(r[SHOW_ACCOUNT_CARD_KEY]) : true
    showShareButton =
      SHOW_SHARE_BUTTON_KEY in r ? Boolean(r[SHOW_SHARE_BUTTON_KEY]) : true
    hideMode = normalizeHideBlockedMode(r[HIDE_BLOCKED_LOCATIONS_KEY])
    prefetchEnabled =
      BACKGROUND_PREFETCH_KEY in r ? Boolean(r[BACKGROUND_PREFETCH_KEY]) : true
    prefetcher.setReserveFraction(normalizePrefetchShare(r[PREFETCH_SHARE_KEY]))
    prefetcher.setPacing(normalizePrefetchPacing(r[PREFETCH_PACING_KEY]))
    // Shared community cache is opt-in and defaults on; inert unless a server
    // URL is configured (see CACHE_API_BASE in constants.ts).
    setSharedCacheEnabled(
      SHARED_CACHE_KEY in r ? Boolean(r[SHARED_CACHE_KEY]) : true,
    )
    setMinConfidence(r[MIN_CONFIDENCE_KEY])

    // This settings load is async, so tweets may already be rendered (and their
    // bios buffered by page-script) before keywords/toggles were known — in
    // which case nothing was highlighted. Now that settings are loaded, re-scan
    // what's on screen and replay the buffered bios, so highlighting and feed
    // locations appear on initial load rather than only after a scroll.
    rehighlightAll()
    refreshFeedLocations()
    refreshHiddenTweets()
    syncPrefetcher()
    window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_USERS))
  })

/**
 * Undo every visible thing this script has done to the page.
 *
 * Attribute-and-CSS based throughout, so switching off is removing attributes
 * and a handful of injected nodes rather than trying to restore markup React
 * owns. Elements X has since recycled are simply not there to clean, which is
 * fine — they carry none of our attributes either.
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
      `.x-loc-info, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-exc-btn, .x-loc-card, .x-loc-cell-tag`,
    )
    .forEach((el) => el.remove())
  document.querySelectorAll(`[${HOVER_CARD_DONE_ATTR}]`).forEach((el) => {
    el.removeAttribute(HOVER_CARD_DONE_ATTR)
  })
  clearKeywordMarks()
  updateKeywordEmojiStyle()
  dismissLocationToast()
  document.getElementById('x-loc-rate-toast')?.remove()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[EXTENSION_ENABLED_KEY]) {
    extensionEnabled = Boolean(changes[EXTENSION_ENABLED_KEY].newValue)
    if (!extensionEnabled) {
      stripAllInjections()
      prefetcher.stop()
      return
    }
    // Back on: re-decorate what is already on screen rather than making the
    // user scroll to trigger the observer.
    rehighlightAll()
    refreshFeedLocations()
    refreshHiddenTweets()
    syncPrefetcher()
  }
  if (!extensionEnabled) return
  if (changes[BLOCKED_COUNTRIES_KEY]) {
    blockedCountries = toBlockedSet(changes[BLOCKED_COUNTRIES_KEY].newValue)
    // Editing the list can newly block (or unblock) locations already on screen.
    refreshHiddenTweets()
  }
  if (changes[HIGHLIGHT_KEYWORDS_KEY]) {
    const next = changes[HIGHLIGHT_KEYWORDS_KEY].newValue
    highlightKeywords = new Set<string>(
      Array.isArray(next) ? (next as string[]).map((k) => k.toLowerCase()) : [],
    )
    setKeywords([...highlightKeywords])
    updateKeywordEmojiStyle()
    rehighlightAll()
  }
  if (changes[HIGHLIGHT_FLAGS_KEY]) {
    const next = changes[HIGHLIGHT_FLAGS_KEY].newValue as
      | { enabled?: boolean; threshold?: number; uniqueOnly?: boolean }
      | undefined
    highlightFlagsEnabled = next?.enabled ?? false
    highlightFlagsThreshold = next?.threshold ?? 2
    highlightFlagsUniqueOnly = next?.uniqueOnly ?? false
    rehighlightAll()
  }
  if (changes[SHOW_LOCATION_IN_FEED_KEY]) {
    showLocationInFeed = Boolean(changes[SHOW_LOCATION_IN_FEED_KEY].newValue)
    refreshFeedLocations()
    syncPrefetcher()
  }
  // Both keys arrive in one `changes` object when written together, so the
  // general one is checked first and the legacy one is only a fallback — that
  // is what makes a *removal* stick. Deliberately synchronous: re-reading
  // storage here would let a highlight survive a frame past the edit that
  // removed it, and would make correctness depend on a second async hop.
  if (changes[RULE_EXCEPTIONS_KEY]) {
    // The write already folded in the legacy list (writeHighlightExceptions),
    // so merging it again here would resurrect anything just removed.
    ruleExceptions = normalizeRuleExceptions(
      changes[RULE_EXCEPTIONS_KEY].newValue,
    )
    rehighlightAll()
    refreshHiddenTweets()
  } else if (changes[HIGHLIGHT_EXCEPTIONS_KEY]) {
    // The old key moving on its own: an install still running the previous
    // version in another tab, or storage edited by hand.
    ruleExceptions = normalizeRuleExceptions(
      { ...ruleExceptions, highlight: [] },
      changes[HIGHLIGHT_EXCEPTIONS_KEY].newValue,
    )
    rehighlightAll()
    refreshHiddenTweets()
  }
  if (changes[ALWAYS_SHOW_KEY]) {
    alwaysShow = new Set(normalizeHandleList(changes[ALWAYS_SHOW_KEY].newValue))
    rehighlightAll()
    refreshHiddenTweets()
  }
  if (changes[BLOCKED_AFFILIATIONS_KEY]) {
    blockedAffiliations = new Set(
      normalizeHandleList(changes[BLOCKED_AFFILIATIONS_KEY].newValue),
    )
    refreshHiddenTweets()
  }
  if (changes[ACCOUNT_AGE_KEY]) {
    accountAgeFilter = normalizeAccountAge(changes[ACCOUNT_AGE_KEY].newValue)
    refreshHiddenTweets()
  }
  if (changes[SHOW_EXCEPTION_BUTTON_KEY]) {
    showExceptionButton = Boolean(changes[SHOW_EXCEPTION_BUTTON_KEY].newValue)
  }
  if (changes[SHOW_ACCOUNT_CARD_KEY]) {
    showAccountCard = Boolean(changes[SHOW_ACCOUNT_CARD_KEY].newValue)
  }
  if (changes[SHOW_SHARE_BUTTON_KEY]) {
    showShareButton = Boolean(changes[SHOW_SHARE_BUTTON_KEY].newValue)
  }
  if (changes[SHARED_CACHE_KEY]) {
    setSharedCacheEnabled(Boolean(changes[SHARED_CACHE_KEY].newValue))
    // Opting out of the community cache also stops background prefetch, which
    // exists to warm it — and opting back in restarts it.
    syncPrefetcher()
  }
  if (changes[MIN_CONFIDENCE_KEY]) {
    setMinConfidence(changes[MIN_CONFIDENCE_KEY].newValue)
  }
  if (changes[BACKGROUND_PREFETCH_KEY]) {
    prefetchEnabled = Boolean(changes[BACKGROUND_PREFETCH_KEY].newValue)
    syncPrefetcher()
  }
  if (changes[PREFETCH_SHARE_KEY]) {
    prefetcher.setReserveFraction(
      normalizePrefetchShare(changes[PREFETCH_SHARE_KEY].newValue),
    )
  }
  if (changes[PREFETCH_PACING_KEY]) {
    prefetcher.setPacing(
      normalizePrefetchPacing(changes[PREFETCH_PACING_KEY].newValue),
    )
  }
  if (changes[HIDE_BLOCKED_LOCATIONS_KEY]) {
    hideMode = normalizeHideBlockedMode(
      changes[HIDE_BLOCKED_LOCATIONS_KEY].newValue,
    )
    refreshHiddenTweets()
    syncPrefetcher()
  }
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

// Which blocked location (if any) a profile should be hidden for, or null.
// The App Store / Play Store country is the primary signal — the store region is
// hard to fake, so it's trusted over the stated account location. When there's no
// store signal, fall back to `account_based_in`, but only when it isn't flagged
// as inaccurate (VPN), since a VPN-masked location can't be trusted either way.
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
 * Every data-driven rule an account matches, exceptions ignored.
 *
 * Ordered least-surprising-first, since location is the rule the user almost
 * certainly set up deliberately. Split out of activeMatches so that the
 * exception button and the hide/collapse decision cannot disagree about what a
 * rule means: the button has to offer exactly the rules that are acting, *and*
 * to name one the user has already excepted so it can be undone — which is the
 * one thing activeMatches must never return.
 *
 * Highlighting is absent because it is judged from the bio rather than from
 * this record; activeRulesFor folds it back in.
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
 * The single decision point for "which rules are acting on this account".
 *
 * The allowlist and the per-rule exceptions are applied here and nowhere else,
 * so they cannot be applied in three subtly different ways — and so a
 * placeholder can always say which rule it was.
 */
function activeMatches(
  userName: string,
  data: LocationData | undefined,
): FilterMatch[] {
  if (isAlwaysShown(userName)) return []
  return ruleMatches(data).filter((m) => !isExcepted(m.rule, userName))
}

/**
 * The rule a post is hidden for, or null — the first one that both fires and is
 * allowed to hide.
 *
 * An account can match a rule that only marks (age) and no rule that hides; the
 * filter above is what stops that from collapsing the post anyway, which is the
 * whole difference between the two kinds of rule.
 */
function hideMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data).find((m) => ruleHides(m.rule)) ?? null
}

/** The rule a post is marked for: the first one acting that does not hide. */
function markMatchFor(
  userName: string,
  data: LocationData | undefined,
): FilterMatch | null {
  return activeMatches(userName, data).find((m) => !ruleHides(m.rule)) ?? null
}

/**
 * The rule to name on a people-list row, hiding or not.
 *
 * Rows are marked and never removed, so the distinction that matters everywhere
 * else does not apply here: a row's tag should say "blocked location" when that
 * is what fired, even though the same rule collapses a post.
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

// Live AboutAccountQuery budget. Seeded at the limit and decremented on EVERY
// network request — manual hover, primary tweet, swipe, OR background prefetch —
// via noteRequestSent, then corrected from the authoritative x-rate-limit-*
// response headers. Tracking *all* usage (not just prefetch) is what lets the
// prefetcher stop before it eats into the user's reserved share of the window.
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

// Bio/displayName captured from timeline JSON this session, kept in memory so
// highlighting reads them synchronously the instant they arrive — never waiting
// on (or racing with) mergeCached's async get→set write to IndexedDB. Without
// this, on a fresh load (empty IDB) rehighlightAll's getCached can read the
// record before mergeCached's set lands, so nothing highlights until a reload
// pre-populates IDB.
//
// Bounded (LRU-by-write) so a long-lived X tab can't grow it without limit. It's
// only a fast path: every bio is also persisted to IDB by mergeCached, so an
// evicted entry (old enough that its IDB write has long landed — no race) simply
// falls back to getCached below. Same fallback covers users first seen in a
// prior session.
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

// Restore every piece of module-level state to the value it holds immediately
// after import, before the storage load resolves. This module is imported once
// per test file, so anything a test mutates — settings pushed through the
// storage.onChanged listener, session caches, the rate-limit window, live
// timers — otherwise leaks into every test that runs after it, and the suite
// only passes in the order it happens to run in. Keep this exhaustive: a new
// `let` at module scope that isn't reset here is a new order dependency.
export function __testResetState() {
  // settings (defaults must match the declarations above)
  blockedCountries = new Set()
  highlightKeywords = new Set()
  setKeywords([])
  highlightFlagsEnabled = false
  highlightFlagsThreshold = 2
  highlightFlagsUniqueOnly = false
  showLocationInFeed = false
  hideMode = 'off'
  ruleExceptions = normalizeRuleExceptions(undefined)
  alwaysShow = new Set()
  blockedAffiliations = new Set()
  accountAgeFilter = normalizeAccountAge(undefined)
  showAccountCard = true
  showShareButton = true
  showExceptionButton = true
  prefetchEnabled = true
  extensionEnabled = true

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
  feedRowObserver?.disconnect()
  feedRowObserver = null
  pendingFeedRows = new WeakMap()
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
function showRateLimitToast() {
  let toast = document.getElementById('x-loc-rate-toast')
  if (!toast) {
    toast = document.createElement('div')
    toast.id = 'x-loc-rate-toast'
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
 *
 * The App Store / Play Store country outranks the stated location (a store
 * region is hard to fake), and a store country that *matches* the stated
 * location corroborates it — so that pairing drops the VPN warning even when X
 * flagged the location as inaccurate. Exported for tests.
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
 * Render (or replace) the swipe overlay.
 *
 * `pending` keeps the toast up indefinitely instead of auto-dismissing — the
 * lookup is still in flight and a later call will overwrite the text. Every
 * pending toast must therefore be resolved by a second call, or it never goes
 * away.
 */
function dismissLocationToast() {
  document.getElementById('x-loc-location-toast')?.remove()
  if (locationToastTimer) clearTimeout(locationToastTimer)
  locationToastTimer = null
}

function renderLocationToast(text: string, pending = false) {
  dismissLocationToast()

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
// API fetch
// ---------------------------------------------------------------------------
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

      const headers: Record<string, string> = {
        authorization: capturedHeaders.authorization,
        'content-type': 'application/json',
        'x-twitter-client-language':
          capturedHeaders['x-twitter-client-language'] ?? 'en',
        'x-twitter-active-user':
          capturedHeaders['x-twitter-active-user'] ?? 'yes',
      }

      // page-script deliberately never forwards the csrf token, so in practice
      // this always comes from the ct0 cookie; the header is only used when a
      // caller (a test, say) supplied one directly.
      const csrf = capturedHeaders['x-csrf-token'] || getCookie('ct0')
      if (csrf) headers['x-csrf-token'] = csrf

      noteRequestSent()
      const resp = await fetch(url, {
        method: 'GET',
        headers,
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

      const json = await resp.json()
      const result = json?.data?.user_result_by_screen_name?.result ?? null
      const profile = result?.about_profile ?? null

      if (!profile) return stored ?? null

      const data: LocationData = {
        bio: stored?.bio ?? null,
        location: profile.account_based_in ?? null,
        locationAccurate: profile.location_accurate !== false,
        source: profile.source ?? null,
        // Same response, already paid for. This is the only place handle-change
        // history is available at all — timeline nodes don't carry it.
        facts: definedFacts(parseAccountFacts(result)),
      }
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
function textWithEmoji(el: Element): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
    } else if (node instanceof HTMLImageElement) {
      out += node.getAttribute('alt') ?? ''
    } else if (node instanceof Element) {
      out += textWithEmoji(node)
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
// An orange bar down the side of a post says *that* an account matched. The
// hover card is where the reader finds out *why*, so the word responsible is
// marked in the bio it was found in.
//
// Nothing here touches the DOM X owns. Wrapping the word in a <mark> would mean
// restructuring text nodes inside a card React re-renders and then tears down —
// the one thing the rest of this file is careful never to do. Instead:
//
//   * text keywords are painted with the CSS Custom Highlight API, which styles
//     Ranges the script registers and leaves the markup alone;
//   * emoji keywords can't be: X renders emoji as <img alt="🇷🇺">, so there is no
//     text node to put a Range over. Those get a generated CSS rule matching the
//     alt instead, scoped to cards carrying KEYWORD_MATCH_ATTR.
//
// Both are cosmetic. Where CSS.highlights is missing (Firefox before 140) the
// text half simply does not paint, which is the right failure for an
// explanation of something the reader can already see.

/** The highlight registry, or null in a browser (or a test) without one. */
function highlightRegistry(): HighlightRegistry | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? CSS.highlights
    : null
}

/**
 * Ranges over every keyword occurrence in `root`.
 *
 * Text node by text node, so a keyword split across two of them is missed
 * rather than mismarked — X breaks bios up around links and emoji, and a Range
 * assembled across that split would underline the wrong characters.
 *
 * Our own injected text is skipped: the account card and the location row can
 * easily contain a word the user tracks, and marking those would be the
 * extension pointing at itself.
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
 * Re-mark every hover card on screen.
 *
 * A full rescan rather than a per-card update, because the registry is one
 * global object: rebuilding it from what is currently open is the only version
 * that cannot leave a mark behind from a card that has gone, or from a rule the
 * user has since turned off.
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
 * Rewrite the emoji half of the marking, which is a stylesheet rather than a
 * set of ranges.
 *
 * Regenerated whenever the keyword list changes, in its own <style> so the
 * static rules stay static. The rule itself is built in styles.ts, next to the
 * rest of the CSS and where a test can render the real thing.
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
 * Mark every tweet on screen written by this account — and every quoted tweet
 * quoting them. Used when a bio arrives and turns out to match a rule, after
 * the tweets themselves have already been rendered.
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

// Injecting a feed-location row grows the tweet's height. Doing that to a tweet
// sitting ABOVE the viewport — e.g. flags that resolve async right after a
// back-navigation has restored the scroll position — pushes every tweet below it
// (including the one under the reader's eyes) downward, so the feed appears to
// jump. X positions each timeline cell absolutely with a JS-computed translateY
// and re-runs scroll restoration on navigation, which defeats the browser's
// native scroll anchoring; so we avoid the above-the-fold height change
// ourselves. Only place the row once the tweet's name line is at or below the
// viewport top — tweets still above the fold are parked on an IntersectionObserver
// and injected when scrolled back into view. Injecting into tweets that are
// on-screen or below the fold is always safe: nothing above the scroll position
// changes height.
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
// Collapse the tweet behind a slim placeholder rather than removing it: keeps a
// visible, reversible trace and avoids fighting X's virtualised timeline (React
// owns the tweet nodes; a foreign data-attribute + CSS survives its re-renders,
// same approach as highlighting).
function buildHiddenPlaceholder(
  target: Element,
  userName: string,
  match: FilterMatch,
  reveal: (target: Element) => void,
): HTMLElement {
  const ph = document.createElement('div')
  ph.className = HIDDEN_PLACEHOLDER_CLASS

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

  // The other home for the exception button, and the one that matters most for
  // the rules that hide things: a collapsed post shows nothing to hover, so the
  // hover card — where the button otherwise lives — cannot be opened from here
  // at all. "Show" spares this one post; this spares the account.
  //
  // Only the rule that hid the post, because that is the one the placeholder is
  // about and the only one it can name from what it was handed.
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

function hideArticle(
  article: Element,
  userName: string,
  match: FilterMatch,
): void {
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return

  if (hideMode === 'hide') {
    // Silent: CSS collapses the whole article, no placeholder.
    article.setAttribute(HIDDEN_ATTR, 'hide')
    return
  }

  // collapse: re-inject the placeholder if a React re-render dropped it but left
  // our attr; otherwise mark and inject once.
  if (article.getAttribute(HIDDEN_ATTR) === 'collapse') {
    if (!article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)) {
      article.appendChild(
        buildHiddenPlaceholder(article, userName, match, revealArticle),
      )
    }
    return
  }
  article.setAttribute(HIDDEN_ATTR, 'collapse')
  article.appendChild(
    buildHiddenPlaceholder(article, userName, match, revealArticle),
  )
}

// User clicked "Show" on a collapsed tweet: reveal it and never re-hide it (the
// marker lives only as long as this DOM node, which X recycles on scroll).
function revealArticle(article: Element): void {
  article.removeAttribute(HIDDEN_ATTR)
  article.setAttribute(HIDDEN_REVEALED_ATTR, '1')
  article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
}

// --- quoted posts -----------------------------------------------------------
// A quoted post has its own author, who has nothing to do with the author of
// the post quoting them. Collapsing the whole row because of the quoted account
// takes away a post the user never filtered — X-Posed shipped exactly that and
// had to fix it after complaints — so the quote card is collapsed on its own and
// the surrounding post stays readable.

function hideQuote(quote: Element, userName: string, match: FilterMatch): void {
  if (quote.hasAttribute(QUOTE_REVEALED_ATTR)) return

  if (hideMode === 'hide') {
    quote.setAttribute(QUOTE_HIDDEN_ATTR, 'hide')
    return
  }
  if (quote.getAttribute(QUOTE_HIDDEN_ATTR) === 'collapse') {
    if (!quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)) {
      quote.appendChild(
        buildHiddenPlaceholder(quote, userName, match, revealQuote),
      )
    }
    return
  }
  quote.setAttribute(QUOTE_HIDDEN_ATTR, 'collapse')
  quote.appendChild(buildHiddenPlaceholder(quote, userName, match, revealQuote))
}

function revealQuote(quote: Element): void {
  quote.removeAttribute(QUOTE_HIDDEN_ATTR)
  quote.setAttribute(QUOTE_REVEALED_ATTR, '1')
  quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
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

// Re-evaluate every on-screen tweet after a rule change: strip what the last
// answer put there, then ask again. User-revealed tweets are left alone.
function refreshHiddenTweets() {
  if (!extensionEnabled) return
  // The one button covers these rules too, so a change to any of them can make
  // it appear, change what it offers, or go away — the same reason
  // rehighlightAll syncs it for the keyword rules.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  articles.forEach((a) => {
    if (a.hasAttribute(HIDDEN_ATTR)) {
      a.removeAttribute(HIDDEN_ATTR)
      a.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
    }
    const quote = getQuotedTweetEl(a)
    if (quote?.hasAttribute(QUOTE_HIDDEN_ATTR)) {
      quote.removeAttribute(QUOTE_HIDDEN_ATTR)
      quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
    }
    a.removeAttribute(TWEET_MARK_ATTR)
    quote?.removeAttribute(TWEET_MARK_ATTR)

    if (hideMode !== 'off') void tryHideArticle(a)
    // Not gated on hideMode: that setting says what to do with posts a filter
    // caught, and a rule that marks never catches one in that sense. Someone
    // running with hiding switched off entirely still wants the mark.
    void tryMarkArticle(a)
  })
  void refreshPeopleCells()
}

// ---------------------------------------------------------------------------
// Marking posts a rule points at rather than hides
// ---------------------------------------------------------------------------
// Same mechanism as hiding — an attribute React's re-renders leave alone, plus
// a CSS rule — but nothing is taken away, so none of the hiding machinery
// applies: no placeholder to build, no "Show" to offer, no revealed-flag to
// remember, and no reason to skip the post a status page is about. A young
// author is worth knowing about on the post you deliberately opened.

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
 * Mark every post on screen by this account once their data arrives.
 *
 * A post is judged when it first appears, which is usually before anything is
 * known about who wrote it — so the answer it got from an empty cache has to be
 * revisited, the same way hideTweetsForUser and markPeopleCellsForUser do.
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
// Marked, never removed. Hiding rows here breaks the thing the page exists to
// show: the count says 400 and you can only scroll past 380, with no way to
// tell whether the extension ate them or the follower list is simply stale.
// A list is something you audit, so the answer is to point at the matches, not
// to take them away.

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
 * A row is marked when it is first seen, usually before the account's data has
 * arrived — so when a lookup finally resolves, the rows for that account have
 * to be re-judged rather than left at the answer they got from an empty cache.
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
 * Everything that has to happen when an account's data lands: fill in the feed
 * row, collapse what the filters caught, mark the people rows. One function so
 * a future caller cannot wire up two of the three and quietly lose the other.
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
// One button, whatever the reason. An account can be highlighted for a keyword,
// collapsed for its country, its affiliate badge or its age — and from the
// reader's side those are all the same complaint: "not this account". Four
// buttons (or one that only ever knew about keywords, which is what this was)
// makes the user learn the extension's internal rule names before they can act
// on what they are looking at.
//
// So the button covers every rule currently acting on the account and says
// which in its tooltip. The exceptions themselves stay per-rule underneath —
// exempting someone from the country filter should not also stop highlighting
// them — the single button just writes to all of the ones that apply.

/**
 * Persist the exception record to both keys.
 *
 * `HIGHLIGHT_EXCEPTIONS_KEY` is the old single-purpose list; `RULE_EXCEPTIONS_KEY`
 * is the general one that superseded it. Reads merge the old into the new
 * (normalizeRuleExceptions), so writing only the new one would let a *removal*
 * come straight back on the next load from the copy still sitting in the old
 * key. Keeping the old key as a mirror of the highlight bucket also means an
 * install that downgrades still finds its exceptions where it expects them.
 */
function writeRuleExceptions(next: RuleExceptions): void {
  ruleExceptions = next
  chrome.storage.local.set({
    [RULE_EXCEPTIONS_KEY]: next,
    [HIGHLIGHT_EXCEPTIONS_KEY]: next.highlight,
  })
}

/**
 * Every rule acting on an account right now, exceptions included.
 *
 * Included, not ignored: a rule the user has already excepted is exactly the
 * one the button has to keep offering, or an exception added by mistake could
 * only be undone from the options page. The account's own data is what decides
 * the rest — so an account nothing applies to gets no button at all rather than
 * a control that would write a setting with no effect.
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
    refreshHiddenTweets()
  })

  return btn
}

/**
 * Put the button where it belongs in `host`, or take it away.
 *
 * Called more than once per card: the highlight rule can be answered from the
 * bio immediately, while the location, affiliation and age rules need the
 * lookup to come back. Rebuilding on a changed rule set (rather than patching)
 * keeps the label, the tooltip and the click handler describing the same set.
 */
function syncExceptionButton(
  host: Element,
  userName: string,
  data: LocationData | null | undefined,
  info: { bio: string | null; displayName: string | null },
  place: (btn: HTMLElement) => void,
): void {
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
// The facts X already sent, laid out under the location row: age, affiliate
// badge, verification, handle history, reach. Every one of these arrives with
// a response the extension already receives, so the card costs no lookups and
// nothing here is inferred — each chip is a field X returned, phrased as X
// phrased it. Reading anything into the combination is the user's business.

interface Chip {
  text: string
  title: string
  tone?: 'plain' | 'warn'
}

/** The chips an account's facts earn, in the order they are worth reading. */
export function accountChips(
  facts: Partial<AccountFacts> | undefined,
  now: number = Date.now(),
): Chip[] {
  if (!facts) return []
  const chips: Chip[] = []

  const age = formatAccountAge(facts.createdAt, now)
  if (age) {
    const days = accountAgeDays(facts.createdAt, now) ?? 0
    const created = new Date(facts.createdAt!).toISOString().slice(0, 10)
    chips.push({
      text: `🎂 ${age}`,
      title: `Account created ${created}`,
      // Under three months is the one age worth flagging visually: it is the
      // single strongest tell for a bought or freshly farmed account, and it is
      // also just what a new user looks like — hence a tint, not a warning.
      tone: days < 90 ? 'warn' : 'plain',
    })
  }

  if (facts.affiliation) {
    const { name, handle } = facts.affiliation
    const shown = name || (handle ? `@${handle}` : null)
    if (shown) {
      chips.push({
        text: `🏢 ${shown}`,
        title: handle
          ? `X shows an affiliate badge linking to @${handle}`
          : 'X shows an affiliate badge on this account',
      })
    }
  }

  // No chip for plain Premium (`is_blue_verified`). X already draws the blue
  // check next to the name, so a chip repeating it spends a row of the card
  // telling the reader what they can already see. The two below earn their
  // place by being invisible otherwise — X renders identity and legacy
  // verification with the same badge as a paid one, so the distinction only
  // exists here.
  if (facts.identityVerified) {
    chips.push({
      text: '🪪 ID verified',
      title: 'X verified an identity document',
    })
  } else if (facts.verified) {
    chips.push({ text: '✔ Verified', title: 'Legacy verification' })
  }

  if (typeof facts.handleChanges === 'number' && facts.handleChanges > 0) {
    chips.push({
      text: `✎ ${facts.handleChanges} handle${facts.handleChanges === 1 ? '' : 's'}`,
      title: `This account has changed its @handle ${facts.handleChanges} time(s)`,
      tone: facts.handleChanges >= 3 ? 'warn' : 'plain',
    })
  }

  const followers = formatFollowers(facts.followers)
  if (followers) {
    chips.push({
      text: `👥 ${followers}`,
      title: `${facts.followers} followers`,
    })
  }

  if (facts.isProtected) {
    chips.push({ text: '🔒 Protected', title: 'Posts are protected' })
  }

  return chips
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
    el.className = `x-loc-chip${chip.tone === 'warn' ? ' x-loc-chip-warn' : ''}`
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
// Process a hover card
// ---------------------------------------------------------------------------
const HOVER_CARD_DONE_ATTR = 'data-x-loc-done'

async function processCard(card: Element) {
  if (card.getAttribute(HOVER_CARD_DONE_ATTR)) return

  const userName = extractScreenName(card)
  // Don't mark done yet — card content may not be rendered. The observer will
  // retry when React adds content inside the card.
  if (!userName) return

  card.setAttribute(HOVER_CARD_DONE_ATTR, '1')

  // One container, inserted once and filled as each piece resolves.
  //
  // Everything used to be inserted separately, and insertIntoCard anchors every
  // call to the same node — so each new element landed *above* the previous
  // one and the visual order came out backwards (the share button ended up over
  // the flags rather than with them). Appending into a wrapper makes the order
  // the order it is written in.
  const wrap = document.createElement('div')
  wrap.className = 'x-loc-hover'
  insertIntoCard(card, userName, wrap)

  // The highlight rule is answerable from the bio alone, so the button can go
  // in before the lookup rather than after it — a hover card is a second or two
  // of the user's attention and the lookup can eat all of it. It is synced
  // again below, once the account's data can speak for the other rules.
  const place = (btn: HTMLElement) => wrap.appendChild(btn)
  syncExceptionButton(wrap, userName, null, await getBioInfo(userName), place)
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

  if (showAccountCard) {
    const accountCard = buildAccountCard(info.facts)
    if (accountCard && !card.querySelector('.x-loc-card')) {
      // After the flags, before the exception button.
      infoRow ? infoRow.after(accountCard) : wrap.prepend(accountCard)
    }
  }

  // The copy button rides *in* the flags row rather than under it: it is an
  // action on exactly what that row shows, and a hover card is short on
  // vertical space. No row means nothing X told us about the account, which is
  // also the case where the card would be a handle and nothing else.
  if (showShareButton && infoRow && !card.querySelector('.x-loc-share-btn')) {
    infoRow.appendChild(buildShareButton(userName, info.displayName ?? ''))
  }

  // Now that the country, the badge and the age are known, the button may cover
  // more rules than the bio alone could offer — or become the first thing worth
  // offering at all.
  syncExceptionButton(wrap, userName, data, info, place)
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

// The hover card is the usual home for the exception toggle, but X opens no
// hover card for the account a status page is *about* — so on that one tweet the
// same button goes inline, under the name line next to the location row.
// Synced rather than injected once: the keyword that makes it relevant is often
// added long after the page settled, and removing that keyword must take the
// button with it.
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
  syncExceptionButton(userNameEl, userName, data, info, (btn) => {
    const anchor =
      userNameEl.querySelector('.x-loc-info') ?? userNameEl.children[1]
    if (anchor) anchor.insertAdjacentElement('afterend', btn)
    else userNameEl.appendChild(btn)
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
// not the element — so the post has to be remembered here, at the moment of the
// right-click, before the menu opens.
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

// The post a hover card was opened from.
//
// A hover card carries only the account, but the user got to it by pointing at
// a name inside a post — so that post is what they have in mind when they copy.
// X gives the card no link back to it, so the anchor is remembered here, at the
// moment the pointer enters the profile link that will open it.
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
 * The post this account is being copied from, or null.
 *
 * The remembered hover anchor first, since that is the post the pointer is
 * actually on. Failing that, any post by the same account still on screen —
 * which covers a card opened from somewhere without an anchor (a mention, the
 * profile header) while still copying something true about the account. If
 * neither, the card is account-only.
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
 * The flag for a location, ignoring the blocked list.
 *
 * getLocationDisplay swaps in ⚠️ for a location the user filters, which is
 * right on the page — it is their own setting showing through — but wrong in a
 * shared image, where the reader has no idea what the sender filters and would
 * read the warning as something X said.
 */
function flagEmojiFor(location: string): string {
  const key = canonicalLocation(location)
  return COUNTRY_FLAGS[key] ?? REGION_FLAGS[key] ?? '🌐'
}

/**
 * The location strip added to a snapshot: country names in words, next to their
 * flags.
 *
 * A flag on its own is fine on screen, where you can hover it — in an image
 * that gets reposted it is a small coloured rectangle the reader has to
 * recognise, and plenty of flags are near-identical at that size. So the
 * snapshot spells the country out. `shareChips` already produces exactly that
 * pairing, and reusing it keeps the wording identical to the drawn card.
 *
 * Every style here is inline: this element is added after the computed styles
 * have been copied onto the clone, and nothing from the page's stylesheets
 * applies inside the SVG the snapshot renders in.
 */
function buildSnapshotLocationRow(data: LocationData): HTMLElement {
  const row = document.createElement('div')
  // One line, laid out exactly like the row on the page: store block, then the
  // account location, then the VPN badge. `nowrap` because it has to stay one
  // line — this is the same strip the user already reads, not a new component.
  //
  // No `color` here on purpose: it inherits X's own text colour from the
  // inlined styles on the ancestor, so the strip reads correctly on whichever
  // theme the snapshot was taken in.
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

  // The top-right block — the ⋯ menu, the Grok button, any Subscribe/Follow
  // button. None of it is part of the post: they are controls pointed at
  // whoever is looking, and in a shared image they are an invitation to click
  // something that cannot do anything, about a relationship the reader doesn't
  // have.
  //
  // Grok is matched on a substring of its aria-label rather than the exact
  // string: X localises that label, but not the product name inside it.
  clone
    .querySelectorAll('[data-testid="caret"], [aria-label*="Grok" i]')
    .forEach((el) => el.remove())
  for (const btn of Array.from(
    clone.querySelectorAll<HTMLElement>('[role="button"]'),
  )) {
    if (RE_READER_ACTION.test(btn.textContent?.trim() ?? '')) btn.remove()
  }

  const row = buildSnapshotLocationRow(data)

  // Placed exactly where the extension places it on the page, which is not the
  // same spot in both layouts:
  //
  //   - In a feed or a reply, the name and handle share one line and the row
  //     goes *after* the whole name block (placeFeedRow).
  //   - On a status page the author's name and handle are stacked, and the row
  //     goes *inside* that block, straight after the handle
  //     (processPrimaryTweet).
  //
  // Inserting after the block in both cases is what left a gap under the author
  // of a detail page but not under the replies: on that layout the block's
  // bottom spacing is sized for the post text, so the flags floated away from
  // the account they belong to.
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
 * Render and deliver a card. One path for both entry points — the hover-card
 * button and the context menu — so the toast wording, the "never spend a
 * lookup" rule and the failure handling can't drift apart.
 *
 * Snapshots the real post when there is one, so the image carries X's own
 * layout, avatar, badges and media rather than an approximation of them. The
 * hand-drawn card stays as the fallback: the snapshot renders in a restricted
 * context on a page we do not control, so it has more ways to fail, and a
 * plainer image beats no image.
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
 * The copy button that rides in the hover card's flags row.
 *
 * The context menu was the only way in, which meant nobody found it — a feature
 * reachable solely by right-clicking is one most people never learn exists. So
 * the button goes where the flags already are, on the same line to keep a hover
 * card short.
 *
 * It copies the post the card was opened from, flags and all — resolved by
 * postTextForAccount — falling back to an account-only card when there is no
 * post to point at.
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

    // Highlight newly added tweets and inject cached feed locations
    for (const node of nodes) {
      if (node.matches(SEL_TWEET)) {
        tryHighlightArticle(node)
        tryInjectFeedLocation(node)
        tryHideArticle(node)
        tryMarkArticle(node)
      } else {
        node.querySelectorAll<Element>(SEL_TWEET).forEach((t) => {
          tryHighlightArticle(t)
          tryInjectFeedLocation(t)
          tryHideArticle(t)
          tryMarkArticle(t)
        })
      }

      // People rows are their own surface — Followers/Following/search have no
      // tweet articles at all, so they'd otherwise never be looked at.
      if (node.matches(SEL_USER_CELL)) {
        void tryMarkPeopleCell(node)
      } else {
        node
          .querySelectorAll<Element>(SEL_USER_CELL)
          .forEach((c) => void tryMarkPeopleCell(c))
      }
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
 * Has the finger travelled far enough, and straight enough, to be a deliberate
 * rightward swipe rather than a tap or a scroll?
 *
 * The dominance ratio matters more here than it did when this only ran on
 * touchend: mid-drag, a vertical fling that starts with a slight diagonal can
 * briefly satisfy the raw distance thresholds. Exported for tests.
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
    const couldNotAsk = rateLimitResetAt > Date.now() || apiHeaders === null
    if (couldNotAsk) dismissLocationToast()
    else renderLocationToast('No location')
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
 * The gesture commits mid-drag rather than on touchend. Waiting for the lift
 * spent the whole remainder of the swipe — usually longer than the lookup
 * itself — before anything started. touchend stays on as a backstop for flicks
 * short enough that no touchmove ever crossed the threshold.
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
// Look up locations for a batch of just-loaded usernames in the shared cache and
// apply any confirmed hits locally — so a flag can show without a per-profile X
// call. Bios/displayNames are not fetched here; they arrive free with the
// timeline JSON (merged in the USERS_DATA handler below).
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
// Trickle location lookups for on-screen accounts in the order they appear in
// the feed, paced across the rate-limit window and using at most 70% of it, so
// feed-location display and hide-by-location fill in without the user hovering
// every profile.
// See prefetch-queue.ts.
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

// Prefetch exists first and foremost to warm the shared community cache, so
// opting out of that switches it off too — no point spending the user's lookup
// budget on accounts they aren't scrolling past. A build with no cache server
// configured can't be opted out of (the toggle isn't even shown), so there the
// setting never gates anything.
//
// Settings-level answer only; prefetchWanted() adds the runtime requirement of
// captured auth headers. Independent of feed display, since warming the cache
// is worthwhile whether or not locations are shown in the feed.
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
  // Queue whenever the settings allow prefetch (even before auth headers
  // arrive); the prefetcher only starts draining once syncPrefetcher() sees
  // headers. The array is in timeline order, and the queue is FIFO, so lookups
  // follow the feed down. page-script tags each user by where they came from:
  // feed tweets go to the high queue, a thread's replies to the low one.
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
