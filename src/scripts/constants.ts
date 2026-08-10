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
