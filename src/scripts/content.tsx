// content.tsx — plain DOM, no React/Preact
import { cleanupCache, clearAllCache, getCached, mergeCached } from './cache'
import { matchesAnyKeyword, setKeywords } from './keywords'
import type { LocationData } from './cache'
import {
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_COUNTRIES_KEY,
  COUNTRY_FLAGS,
  HIDE_BLOCKED_LOCATIONS_KEY,
  type HideBlockedMode,
  normalizeHideBlockedMode,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  REGION_ABBR,
  REGION_FLAGS,
  SHARED_CACHE_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from './countries'
import { EVENTS, X_GRAPHQL_PATH } from './constants'
import {
  contributeLocation,
  flushContributions,
  setSharedCacheEnabled,
  sharedBatchLookup,
} from './shared-cache'
import { BackgroundPrefetcher } from './prefetch-queue'

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
// Set on tweets collapsed by the "hide blocked locations" feature; a user "Show"
// click swaps it for HIDDEN_REVEALED_ATTR so the tweet is never re-hidden.
const HIDDEN_ATTR = 'data-x-loc-hidden'
const HIDDEN_REVEALED_ATTR = 'data-x-loc-revealed'
const HIDDEN_PLACEHOLDER_CLASS = 'x-loc-hidden-ph'
const RESET_DEFAULT = 60 * 5 * 1000
const RE_SCREEN_NAME_HREF = /^\/([A-Za-z0-9_]{1,50})$/
const RE_AT_MENTION = /^@[A-Za-z0-9_]{1,50}$/
const RE_MOBILE_SOURCE = /android\s+app|app\s+store/i
const RE_MOBILE_SOURCE_STRIP = /\s*(android\s+app|app\s+store)/i

// ---------------------------------------------------------------------------
// Blocked countries (loaded from chrome.storage.local, set via options page)
// ---------------------------------------------------------------------------
let blockedCountries = new Set<string>()
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
// Lowercased usernames excluded from keyword/flag highlighting.
let highlightExceptions = new Set<string>()
// Whether to render the "Don't highlight" toggle on hover cards.
let showExceptionButton = true
// Whether background location prefetching runs (options toggle; default on).
let prefetchEnabled = true

chrome.storage.local
  .get([
    BLOCKED_COUNTRIES_KEY,
    HIGHLIGHT_KEYWORDS_KEY,
    HIGHLIGHT_FLAGS_KEY,
    SHOW_LOCATION_IN_FEED_KEY,
    HIGHLIGHT_EXCEPTIONS_KEY,
    SHOW_EXCEPTION_BUTTON_KEY,
    SHARED_CACHE_KEY,
    HIDE_BLOCKED_LOCATIONS_KEY,
    BACKGROUND_PREFETCH_KEY,
  ])
  .then((result) => {
    const r = result as Record<string, unknown>
    blockedCountries = new Set<string>(
      Array.isArray(r[BLOCKED_COUNTRIES_KEY])
        ? (r[BLOCKED_COUNTRIES_KEY] as string[])
        : [],
    )
    highlightKeywords = new Set<string>(
      Array.isArray(r[HIGHLIGHT_KEYWORDS_KEY])
        ? (r[HIGHLIGHT_KEYWORDS_KEY] as string[]).map((k) => k.toLowerCase())
        : [],
    )
    setKeywords([...highlightKeywords])
    const flags = r[HIGHLIGHT_FLAGS_KEY] as
      | { enabled?: boolean; threshold?: number; uniqueOnly?: boolean }
      | undefined
    highlightFlagsEnabled = flags?.enabled ?? false
    highlightFlagsThreshold = flags?.threshold ?? 2
    highlightFlagsUniqueOnly = flags?.uniqueOnly ?? false
    // Off by default — the user opts in from the options page. (Mobile users can
    // still swipe-right on any tweet to reveal a location without this enabled.)
    showLocationInFeed = Boolean(r[SHOW_LOCATION_IN_FEED_KEY])
    highlightExceptions = new Set<string>(
      Array.isArray(r[HIGHLIGHT_EXCEPTIONS_KEY])
        ? (r[HIGHLIGHT_EXCEPTIONS_KEY] as string[]).map((u) => u.toLowerCase())
        : [],
    )
    showExceptionButton =
      SHOW_EXCEPTION_BUTTON_KEY in r
        ? Boolean(r[SHOW_EXCEPTION_BUTTON_KEY])
        : true
    hideMode = normalizeHideBlockedMode(r[HIDE_BLOCKED_LOCATIONS_KEY])
    prefetchEnabled =
      BACKGROUND_PREFETCH_KEY in r ? Boolean(r[BACKGROUND_PREFETCH_KEY]) : true
    // Shared community cache is opt-in and defaults on; inert unless a server
    // URL is configured (see CACHE_API_BASE in constants.ts).
    setSharedCacheEnabled(
      SHARED_CACHE_KEY in r ? Boolean(r[SHARED_CACHE_KEY]) : true,
    )

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

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[BLOCKED_COUNTRIES_KEY]) {
    const next = changes[BLOCKED_COUNTRIES_KEY].newValue
    blockedCountries = new Set<string>(Array.isArray(next) ? next : [])
    // Editing the list can newly block (or unblock) locations already on screen.
    refreshHiddenTweets()
  }
  if (changes[HIGHLIGHT_KEYWORDS_KEY]) {
    const next = changes[HIGHLIGHT_KEYWORDS_KEY].newValue
    highlightKeywords = new Set<string>(
      Array.isArray(next) ? (next as string[]).map((k) => k.toLowerCase()) : [],
    )
    setKeywords([...highlightKeywords])
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
  if (changes[HIGHLIGHT_EXCEPTIONS_KEY]) {
    const next = changes[HIGHLIGHT_EXCEPTIONS_KEY].newValue
    highlightExceptions = new Set<string>(
      Array.isArray(next) ? (next as string[]).map((u) => u.toLowerCase()) : [],
    )
    rehighlightAll()
  }
  if (changes[SHOW_EXCEPTION_BUTTON_KEY]) {
    showExceptionButton = Boolean(changes[SHOW_EXCEPTION_BUTTON_KEY].newValue)
  }
  if (changes[SHARED_CACHE_KEY]) {
    setSharedCacheEnabled(Boolean(changes[SHARED_CACHE_KEY].newValue))
  }
  if (changes[BACKGROUND_PREFETCH_KEY]) {
    prefetchEnabled = Boolean(changes[BACKGROUND_PREFETCH_KEY].newValue)
    syncPrefetcher()
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
  if (blockedCountries.has(loc)) return { emoji: '⚠️', label: loc }
  if (COUNTRY_FLAGS[loc]) return { emoji: COUNTRY_FLAGS[loc], label: loc }
  if (REGION_FLAGS[loc]) {
    const abbr = REGION_ABBR[loc]
    return abbr
      ? { emoji: abbr, label: loc, isText: true }
      : { emoji: REGION_FLAGS[loc], label: loc }
  }
  return { emoji: '🌐', label: loc }
}

// Which blocked location (if any) a profile should be hidden for, or null.
// The App Store / Play Store country is the primary signal — the store region is
// hard to fake, so it's trusted over the stated account location. When there's no
// store signal, fall back to `account_based_in`, but only when it isn't flagged
// as inaccurate (VPN), since a VPN-masked location can't be trusted either way.
function effectiveBlockedLocation(data: LocationData): string | null {
  const mobileSource = RE_MOBILE_SOURCE.test(data.source ?? '')
  const sourceCountry = mobileSource
    ? data.source?.replace(RE_MOBILE_SOURCE_STRIP, '').trim() || null
    : null
  if (sourceCountry) {
    return blockedCountries.has(sourceCountry) ? sourceCountry : null
  }
  if (data.location && data.locationAccurate !== false) {
    return blockedCountries.has(data.location) ? data.location : null
  }
  return null
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
// prefetcher stop before it eats into the user's reserved half of the window.
let rateWindowLimit = 50
let rateWindowRemaining = 50
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
const bioCache = new Map<
  string,
  { bio: string | null; displayName: string | null }
>()

function rememberBio(
  userName: string,
  bio: string | null,
  displayName: string | null,
): void {
  const key = userName.toLowerCase()
  const prev = bioCache.get(key)
  bioCache.delete(key) // re-insert to refresh LRU order
  bioCache.set(key, {
    bio: bio ?? prev?.bio ?? null,
    displayName: displayName ?? prev?.displayName ?? null,
  })
  if (bioCache.size > BIO_CACHE_CAP) {
    const oldest = bioCache.keys().next().value
    if (oldest !== undefined) bioCache.delete(oldest)
  }
}

async function getBioInfo(
  userName: string,
): Promise<{ bio: string | null; displayName: string | null }> {
  const mem = bioCache.get(userName.toLowerCase())
  if (mem) return mem
  const data = await getCached(userName)
  return { bio: data?.bio ?? null, displayName: data?.displayName ?? null }
}

export function __testResetState() {
  checkedThisSession.clear()
  bioCache.clear()
  rateLimitResetAt = 0
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CLEAR_CACHE') {
    checkedThisSession.clear()
    clearAllCache()
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
let locationToastTimer: ReturnType<typeof setTimeout> | null = null

function showLocationOverlay(data: LocationData) {
  const existing = document.getElementById('x-loc-location-toast')
  existing?.remove()
  if (locationToastTimer) clearTimeout(locationToastTimer)

  const mobileSource = RE_MOBILE_SOURCE.test(data.source ?? '')
  const sourceCountry = mobileSource
    ? data.source?.replace(RE_MOBILE_SOURCE_STRIP, '').trim() || null
    : null
  const vpn = data.locationAccurate === false

  let text = ''
  if (sourceCountry) {
    if (sourceCountry === data.location) {
      // AppStore and location agree — reliable, no VPN badge needed
      const { emoji } = getLocationDisplay(sourceCountry)
      text = `${emoji} ${sourceCountry}`
    } else {
      // AppStore and location differ — show AppStore country as more reliable signal
      const { emoji } = getLocationDisplay(sourceCountry)
      text = `${emoji} ${sourceCountry}`
      if (vpn) text += ' · ⚠ VPN'
    }
  } else {
    if (data.location) {
      const { emoji } = getLocationDisplay(data.location)
      text = `${emoji} ${data.location}`
    }
    if (vpn) text += (text ? ' · ' : '') + '⚠ VPN'
  }
  if (!text) return

  const toast = document.createElement('div')
  toast.id = 'x-loc-location-toast'
  toast.textContent = text
  document.body.appendChild(toast)

  locationToastTimer = setTimeout(() => toast.remove(), 2500)
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

      if (capturedHeaders['x-csrf-token']) {
        headers['x-csrf-token'] = capturedHeaders['x-csrf-token']
      } else {
        const ct0 = getCookie('ct0')
        if (ct0) headers['x-csrf-token'] = ct0
      }

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
      const profile =
        json?.data?.user_result_by_screen_name?.result?.about_profile ?? null

      if (!profile) return stored ?? null

      const data: LocationData = {
        bio: stored?.bio ?? null,
        location: profile.account_based_in ?? null,
        locationAccurate: profile.location_accurate !== false,
        source: profile.source ?? null,
      }
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
  style.textContent = `
.x-loc-info {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
}
.x-loc-icon {
  font-size: 20px;
  line-height: 1;
  cursor: default;
  display: inline-flex;
  align-items: center;
  user-select: none;
}
.x-loc-icon-flag {
  font-size: 26px;
}
.x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.x-loc-store-block .x-loc-icon-flag {
  font-size: 16px;
}
.x-loc-store-block .x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 11px;
}
.x-loc-store-block {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 4px;
  cursor: default;
  user-select: none;
}
.x-loc-icon-ratelimit {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(180, 120, 0, 0.12);
  color: rgb(160, 100, 0);
  border: 1px solid rgba(180, 120, 0, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
.x-loc-icon-vpn {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(220, 38, 38, 0.15);
  color: rgb(200, 25, 25);
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
#x-loc-rate-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(220, 38, 38, 0.55);
}
#x-loc-location-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(29, 155, 240, 0.55);
}
article[data-x-loc-highlighted] {
  border-left: 3px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.05) !important;
}
[data-x-loc-quote-highlighted] {
  border-left: 3px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.05) !important;
}
.x-loc-exc-btn {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: rgb(83, 100, 113);
  background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 9999px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.x-loc-exc-btn:hover {
  background: rgba(128, 128, 128, 0.14);
}
.x-loc-exc-btn.x-loc-exc-active {
  color: rgb(0, 150, 80);
  border-color: rgba(0, 150, 80, 0.5);
  background: rgba(0, 150, 80, 0.08);
}
article[${HIDDEN_ATTR}='hide'] {
  display: none !important;
}
article[${HIDDEN_ATTR}='collapse'] > :not(.${HIDDEN_PLACEHOLDER_CLASS}) {
  display: none !important;
}
.${HIDDEN_PLACEHOLDER_CLASS} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  color: rgb(113, 118, 123);
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}
.x-loc-hidden-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.x-loc-hidden-show {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: rgb(29, 155, 240);
  background: transparent;
  border: 1px solid rgba(29, 155, 240, 0.5);
  border-radius: 9999px;
  padding: 3px 12px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.x-loc-hidden-show:hover {
  background: rgba(29, 155, 240, 0.1);
}
`
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
  if (highlightExceptions.has(userName.toLowerCase())) return false
  return matchesHighlightRule(userName, displayName, bio)
}

async function tryHighlightArticle(article: Element) {
  if (highlightKeywords.size === 0 && !highlightFlagsEnabled) return
  if (!article.hasAttribute('data-x-loc-highlighted')) {
    const { userName, displayName } = extractTweetUserInfo(article)
    if (userName) {
      const info = await getBioInfo(userName)
      if (
        shouldHighlight(
          userName,
          displayName || info.displayName || '',
          info.bio,
        )
      ) {
        article.setAttribute('data-x-loc-highlighted', '1')
      }
    }
  }
  await tryHighlightQuote(article)
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
const pendingFeedRows = new WeakMap<Element, LocationData>()
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
function buildHiddenPlaceholder(article: Element, label: string): HTMLElement {
  const ph = document.createElement('div')
  ph.className = HIDDEN_PLACEHOLDER_CLASS

  const flag = COUNTRY_FLAGS[label] ?? REGION_FLAGS[label] ?? '🌐'
  const labelEl = document.createElement('span')
  labelEl.className = 'x-loc-hidden-label'
  labelEl.textContent = `🚫 Hidden · ${flag} ${label}`

  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'x-loc-hidden-show'
  btn.textContent = 'Show'
  btn.title = `Reveal this tweet from ${label}`
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    revealArticle(article)
  })

  ph.appendChild(labelEl)
  ph.appendChild(btn)
  return ph
}

function hideArticle(article: Element, label: string): void {
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
      article.appendChild(buildHiddenPlaceholder(article, label))
    }
    return
  }
  article.setAttribute(HIDDEN_ATTR, 'collapse')
  article.appendChild(buildHiddenPlaceholder(article, label))
}

// User clicked "Show" on a collapsed tweet: reveal it and never re-hide it (the
// marker lives only as long as this DOM node, which X recycles on scroll).
function revealArticle(article: Element): void {
  article.removeAttribute(HIDDEN_ATTR)
  article.setAttribute(HIDDEN_REVEALED_ATTR, '1')
  article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
}

async function tryHideArticle(article: Element) {
  if (hideMode === 'off') return
  if (article.matches(SEL_PRIMARY_TWEET)) return
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
  if (article.hasAttribute(HIDDEN_ATTR)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  const data = await getCached(userName)
  const label = data ? effectiveBlockedLocation(data) : null
  if (label) hideArticle(article, label)
}

// Hide every on-screen tweet by this user once their location is known (e.g. a
// shared-cache hit or a hover lookup resolved it), mirroring
// injectFeedLocationForUser.
function hideTweetsForUser(userName: string, data: LocationData): void {
  if (hideMode === 'off') return
  const label = effectiveBlockedLocation(data)
  if (!label) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
    if (article.hasAttribute(HIDDEN_ATTR)) return
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    hideArticle(article, label)
  })
}

// Re-evaluate every on-screen tweet: unhide first (the mode changed, or a
// location was removed from the list), then re-hide if still applicable.
// User-revealed tweets are left alone.
function refreshHiddenTweets() {
  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  articles.forEach((a) => {
    if (a.hasAttribute(HIDDEN_ATTR)) {
      a.removeAttribute(HIDDEN_ATTR)
      a.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
    }
    if (hideMode !== 'off') void tryHideArticle(a)
  })
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

  const mobileSource = RE_MOBILE_SOURCE.test(data?.source ?? '')
  const sourceCountry =
    (mobileSource && data.source?.replace(RE_MOBILE_SOURCE_STRIP, '').trim()) ||
    null

  if (sourceCountry) {
    const { emoji: storeFlag, isText: storeFlagIsText } =
      getLocationDisplay(sourceCountry)
    const block = document.createElement('span')
    block.className = 'x-loc-store-block'
    block.title = data.source!

    const phone = document.createElement('span')
    phone.textContent = '📱'

    const flag = document.createElement('span')
    flag.className = `x-loc-icon-flag ${storeFlagIsText ? 'x-loc-icon-abbr' : ''}`
    flag.textContent = storeFlag

    block.appendChild(phone)
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

// Toggle button shown on hover cards: adds/removes the user from the
// "never highlight" exception list. Useful for accounts that use a tracked
// keyword sarcastically (e.g. "no NAFO").
function buildExceptionButton(userName: string): HTMLElement {
  const lc = userName.toLowerCase()
  const btn = document.createElement('button')
  btn.className = 'x-loc-exc-btn'
  btn.type = 'button'

  function render() {
    const excluded = highlightExceptions.has(lc)
    btn.textContent = excluded
      ? '✓ Highlight exception (undo)'
      : "🚫 Don't highlight"
    btn.title = excluded
      ? `@${userName} is excluded from keyword/flag highlighting — click to undo`
      : `Never highlight @${userName}, even if it matches a keyword or flag`
    btn.classList.toggle('x-loc-exc-active', excluded)
  }
  render()

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    const next = new Set(highlightExceptions)
    if (next.has(lc)) next.delete(lc)
    else next.add(lc)
    highlightExceptions = next
    chrome.storage.local.set({ [HIGHLIGHT_EXCEPTIONS_KEY]: [...next] })
    render()
    rehighlightAll()
  })

  return btn
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

  // Offer the exception toggle only when the account matches a highlight rule
  // (so there's something to exclude), or is already excluded (so it can be undone).
  if (showExceptionButton) {
    const cached = await getCached(userName)
    const excluded = highlightExceptions.has(userName.toLowerCase())
    if (
      excluded ||
      matchesHighlightRule(userName, cached?.displayName ?? '', cached?.bio)
    ) {
      insertIntoCard(card, userName, buildExceptionButton(userName))
    }
  }

  const data = await fetchLocationData(userName)

  if (data === null && rateLimitResetAt > Date.now()) {
    insertIntoCard(card, userName, buildRateLimitRow())
    return
  }

  if (!data || (!data.location && data.locationAccurate && !data.source)) return

  const row = buildInfoRow(data)
  insertIntoCard(card, userName, row)
  injectFeedLocationForUser(userName, data)
  hideTweetsForUser(userName, data)
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

  const existing = userNameEl.querySelector('.x-loc-exc-btn')

  // getBioInfo, not getCached: it reads the same in-memory bio that decided the
  // highlight, so the button can never disagree with the highlight it undoes.
  const { bio, displayName } = await getBioInfo(userName)
  const wanted =
    showExceptionButton &&
    (highlightExceptions.has(userName.toLowerCase()) ||
      matchesHighlightRule(userName, displayName ?? '', bio))

  if (!wanted) {
    existing?.remove()
    return
  }

  // Rebuild instead of leaving it: the label carries the current exception
  // state, which the hover card for the same account can flip behind our back.
  existing?.remove()
  const anchor =
    userNameEl.querySelector('.x-loc-info') ?? userNameEl.children[1]
  const btn = buildExceptionButton(userName)
  if (anchor) anchor.insertAdjacentElement('afterend', btn)
  else userNameEl.appendChild(btn)
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
// MutationObserver
// ---------------------------------------------------------------------------
function startObserver() {
  const observer = new MutationObserver((mutations) => {
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
      } else {
        node.querySelectorAll<Element>(SEL_TWEET).forEach((t) => {
          tryHighlightArticle(t)
          tryInjectFeedLocation(t)
          tryHideArticle(t)
        })
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
function startSwipeListener() {
  let startX = 0
  let startY = 0

  document.body.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      startX = e.touches[0].clientX
      startY = e.touches[0].clientY
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchend',
    async (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX
      const dy = Math.abs(e.changedTouches[0].clientY - startY)

      // Require a clear rightward swipe, not a vertical scroll or tap
      if (dx < 40 || dy > 50) return

      const article = (e.target as Element).closest<Element>(SEL_TWEET)
      if (!article) return

      const { userName } = extractTweetUserInfo(article)
      if (!userName) return

      const data = await fetchLocationData(userName)
      if (
        !data ||
        (!data.location && data.locationAccurate !== false && !data.source)
      )
        return

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
      injectFeedLocationForUser(hit.userName, full)
      hideTweetsForUser(hit.userName, full)
    }
  }
}

// ---------------------------------------------------------------------------
// Background location prefetcher
// ---------------------------------------------------------------------------
// Trickle location lookups for on-screen accounts (most-followed first) using at
// most half the rate-limit window, so feed-location display and hide-by-location
// fill in without the user hovering every profile. See prefetch-queue.ts.
const prefetcher = new BackgroundPrefetcher({
  fetch: async (userName) => {
    const data = await fetchLocationData(userName)
    if (data) {
      injectFeedLocationForUser(userName, data)
      hideTweetsForUser(userName, data)
    }
  },
  isKnown: async (userName) => {
    if (checkedThisSession.has(userName.toLowerCase())) return true
    const cached = await getCached(userName)
    return Boolean(cached && (cached.location || cached.source))
  },
  rateState: currentRateState,
})

// Runs whenever enabled (options toggle, default on) and auth headers exist —
// independent of feed display, because a key purpose is warming the shared
// community cache so everyone sees flags without a per-profile X call.
function prefetchWanted(): boolean {
  return prefetchEnabled && apiHeaders !== null
}
function syncPrefetcher(): void {
  if (prefetchWanted()) prefetcher.start()
  else prefetcher.stop()
}

window.addEventListener(EVENTS.USERS_DATA, (e: Event) => {
  const users = (e as CustomEvent).detail?.users as
    | Array<{
        userName: string
        displayName: string | null
        bio: string | null
        followers?: number
      }>
    | undefined
  if (!users) return
  void applySharedHits(users.map((u) => u.userName))
  // Queue whenever prefetch is enabled (even before auth headers arrive); the
  // prefetcher only starts draining once syncPrefetcher() sees headers.
  if (prefetchEnabled) {
    prefetcher.enqueue(
      users.map((u) => ({ userName: u.userName, followers: u.followers ?? 0 })),
    )
  }
  for (const { userName, displayName, bio } of users) {
    // Record bio/displayName synchronously so highlighting can read them
    // immediately — before, and independent of, the async mergeCached write.
    rememberBio(userName, bio, displayName ?? null)

    const patch: Parameters<typeof mergeCached>[1] = { bio: bio ?? null }
    if (displayName) patch.displayName = displayName
    mergeCached(userName, patch)
    if (shouldHighlight(userName, displayName ?? '', bio)) {
      const lc = userName.toLowerCase()
      document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
        const sn = extractTweetUserInfo(article).userName ?? ''
        if (sn?.toLowerCase() === lc)
          article.setAttribute('data-x-loc-highlighted', '1')
        const quote = getQuotedTweetEl(article)
        if (
          quote &&
          extractQuotedTweetUserInfo(quote).userName?.toLowerCase() === lc
        )
          quote.setAttribute(QUOTE_HIGHLIGHT_ATTR, '1')
      })
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
