export const EVENTS = {
  HEADERS_CAPTURED: 'x-loc-headers-captured',
  REQUEST_HEADERS: 'x-loc-request-headers',
  USERS_DATA: 'x-loc-users-data',
  REQUEST_USERS: 'x-loc-request-users',
} as const

export const X_GRAPHQL_PATH = 'x.com/i/api/graphql'

/** Every tab the content script runs in — `chrome.tabs.query` and nothing else. */
export const X_TAB_PATTERNS = [
  '*://*.x.com/*',
  '*://x.com/*',
  '*://*.twitter.com/*',
  '*://twitter.com/*',
] as const

/** How long a 429 pauses lookups when X sends no `x-rate-limit-reset`. */
export const RATE_LIMIT_RESET_DEFAULT_MS = 5 * 60 * 1000

// Content script ⇄ service worker. The three requests belong to the lookup
// broker; the two broadcasts are what it pushes back. See "Cross-tab lookup
// broker" in CLAUDE.md.
export const MSG = {
  CLEAR_CACHE: 'CLEAR_CACHE',
  SHARE_POST: 'SHARE_POST',
  GET_MESSAGES: 'GET_MESSAGES',
  /** Candidates this tab saw, already filtered against its own cache. */
  ENQUEUE: 'LOOKUP_ENQUEUE',
  /** "What should I look up?" — answered with a handle or a wait. */
  NEXT: 'LOOKUP_NEXT',
  /** What the lookup cost, and what X's headers said afterwards. */
  REPORT: 'LOOKUP_REPORT',
  /** Rate-limit ledger, pushed to every tab so a 429 pauses all of them. */
  RATE: 'LOOKUP_RATE',
  /** One tab resolved a handle; the rest re-read it from IDB and redraw. */
  RESOLVED: 'LOOKUP_RESOLVED',
} as const

// Which community-cache backend a build talks to, and empty to disable it
// entirely. See "Shared cache backends" in CLAUDE.md — including why `?.`.
export const CACHE_API_BASE =
  import.meta.env?.VITE_CACHE_API_BASE ?? 'https://xloc.vmirrormanv.xyz'

// Every chrome.storage.local key the extension owns. The value behind each one is
// read only through settings.ts — see "Storage keys" in countries/CLAUDE.md.
// Accounts exempt from every filter — never hidden, collapsed or highlighted.
// The blunt instrument, for people you always want to read.
// Per-rule exception lists: `{ location: ['someone'], age: [...] }`. Generalised
// from a single highlight-exception list, so a new filter doesn't mean a fourth
// parallel list, key and UI — or a user learning which one a name belongs in.
// Filter accounts younger than `days`. Off by default: this is the filter most
// likely to catch someone whose only offence is having joined recently.
// The parent handle, lowercased and without @: an org renames its badge freely,
// but not what it points at.
// The hover-card "Copy card" button. On by default: a feature reachable only by
// right-clicking is one most people never discover.
// On by default: the data rides along with responses we already receive.
// Collapsed by default but remembered: adding three countries shouldn't mean
// three re-opens in a ~300px popup.
// The extension's own pages only: what the content script draws follows X's
// theme, or a light card lands on a dark timeline.
// The only options-page UI state left to remember; an older version's
// `optionsSections` is never read.
// Whether the options page reveals Advanced. Off by default: what it holds are
// documented trade-offs, not preferences.
// A setting rather than a constant, and kept behind Advanced. See "Community
// cache consensus" in CLAUDE.md.
// How background prefetch spends its share.
//   'spread'  — trickle over the time left in the window (default)
//   'instant' — as fast as allowed, then wait the window out
// Fraction of the rate-limit window background prefetch may spend; 0.8 leaves 10
// of 50 for the user's own hovers. Feeds BackgroundPrefetcher.reserveFraction.
// Warm the caches for on-screen accounts in page order, so flags appear without
// hovering. Spends at most PREFETCH_SHARE_KEY of the rate-limit window.
// What the shared cache last said it holds, so the popup opens with a number
// instead of a gap and still has one to show when the server can't be reached.
// Not a setting — a remembered answer is not a decision, so it stays out of
// SETTINGS_REGISTRY and out of an export, like `usageStats`.
// Query the shared community cache and contribute results back. Inert unless
// CACHE_API_BASE is configured.
// What happens to a post whose author's location is on the blocked list.
//   'off'      — show normally
//   'collapse' — a slim placeholder with a "Show" (default)
//   'hide'     — remove silently, no trace
// Whether to show the one-click exception button on profile hover cards (and on
// the primary tweet of a status page, which X opens no hover card for).
// Usernames (lowercased) that should never be highlighted, even when they match
// a keyword or flag rule — e.g. accounts using a keyword sarcastically ("no NAFO").
// Off means X renders exactly as it would with the extension uninstalled.
export const EXTENSION_ENABLED_KEY = 'extensionEnabled'
export const BLOCKED_COUNTRIES_KEY = 'blockedCountries'
// Members unchecked under a blocked region — see RegionExclusions.
export const REGION_EXCLUSIONS_KEY = 'regionExclusions'
export const HIGHLIGHT_KEYWORDS_KEY = 'highlightKeywords'
export const HIGHLIGHT_FLAGS_KEY = 'highlightFlags'
export const SHOW_LOCATION_IN_FEED_KEY = 'showLocationInFeed'
export const HIGHLIGHT_EXCEPTIONS_KEY = 'highlightExceptions'
export const SHOW_EXCEPTION_BUTTON_KEY = 'showExceptionButton'
export const HIDE_BLOCKED_LOCATIONS_KEY = 'hideBlockedLocations'
export const SHARED_CACHE_KEY = 'sharedCacheEnabled'
export const SHARED_CACHE_COUNT_KEY = 'sharedCacheCount'
export const BACKGROUND_PREFETCH_KEY = 'backgroundPrefetch'
export const PREFETCH_SHARE_KEY = 'prefetchShare'
export const PREFETCH_PACING_KEY = 'prefetchPacing'
export const MIN_CONFIDENCE_KEY = 'sharedCacheMinConfidence'
export const SHOW_ADVANCED_KEY = 'showAdvancedOptions'
export const OPTIONS_TAB_KEY = 'optionsTab'
export const THEME_KEY = 'theme'
export const POPUP_SECTION_KEY = 'popupSection'
export const USAGE_STATS_KEY = 'usageStats'
export const RATE_PROMPT_KEY = 'ratePrompt'
export const SHOW_ACCOUNT_CARD_KEY = 'showAccountCard'
export const SHOW_SHARE_BUTTON_KEY = 'showShareButton'
export const BLOCKED_AFFILIATIONS_KEY = 'blockedAffiliations'
export const ACCOUNT_AGE_KEY = 'accountAgeFilter'
export const RULE_EXCEPTIONS_KEY = 'ruleExceptions'
export const ALWAYS_SHOW_KEY = 'alwaysShowAccounts'
