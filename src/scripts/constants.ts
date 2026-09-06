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

// Measured live; the real budget comes from the x-rate-limit-* headers.
// Everything that counts in windows derives from these.
export const LOOKUP_LIMIT_PER_WINDOW = 50
export const LOOKUP_WINDOW_MINUTES = 15
export const LOOKUP_WINDOW_MS = LOOKUP_WINDOW_MINUTES * 60 * 1000

export const DEFAULT_PREFETCH_SHARE = 0.85

/** How long a 429 pauses lookups when X sends no `x-rate-limit-reset`. */
export const RATE_LIMIT_RESET_DEFAULT_MS = LOOKUP_WINDOW_MS / 3

// Content script ⇄ service worker — see "Cross-tab lookup broker" in CLAUDE.md.
export const MSG = {
  CLEAR_CACHE: 'CLEAR_CACHE',
  SHARE_POST: 'SHARE_POST',
  /** An x-pat-opened utility tab asking to be closed (about-page copy). */
  CLOSE_TAB: 'CLOSE_TAB',
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

// Every chrome.storage.local key the extension owns, read only through
// settings.ts — see "Settings: keys, normalizers, defaults" in CLAUDE.md.
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
export const SHOW_ABOUT_COPY_KEY = 'showAboutCopyButton'
export const BLOCKED_AFFILIATIONS_KEY = 'blockedAffiliations'
export const ACCOUNT_AGE_KEY = 'accountAgeFilter'
export const RULE_EXCEPTIONS_KEY = 'ruleExceptions'
export const ALWAYS_SHOW_KEY = 'alwaysShowAccounts'
