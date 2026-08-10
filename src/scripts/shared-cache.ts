// Client for the community location cache (../../server). Only
// location/source/accurate go over the wire — never bios or who looked up whom.

import type { LocationData } from './cache'
import { CACHE_API_BASE } from './constants'
import {
  DEFAULT_MIN_CONFIDENCE,
  finiteNumber,
  normalizeMinConfidence,
  normalizeSharedCacheCount,
  SHARED_CACHE_COUNT_KEY,
} from './countries'

// Distinct clients that must agree before a location is trusted. Still 1 on
// purpose — see "Community cache consensus" in CLAUDE.md.
export let minConfidence: number = DEFAULT_MIN_CONFIDENCE

export function setMinConfidence(value: unknown): void {
  minConfidence = normalizeMinConfidence(value)
}

const NEG_TTL_MS = 60 * 60 * 1000 // remember "server had nothing" for 1h
const QUERIED_TTL_MS = 15 * 60 * 1000 // don't re-query the same name within 15m
// Sent sooner on MAX_CONTRIB or a hidden tab.
export const FLUSH_DELAY_MS = 30_000
const MAX_CONTRIB = 50
const MAX_LOOKUP = 100
const CLIENT_ID_KEY = 'sharedCacheClientId'

const FETCH_TIMEOUT_MS = 5000
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000

let enabled = false

/** No-op without a server URL. */
export function setSharedCacheEnabled(value: boolean): void {
  enabled = value && CACHE_API_BASE.length > 0
}

export function isSharedCacheConfigured(): boolean {
  return CACHE_API_BASE.length > 0
}

export function isSharedCacheEnabled(): boolean {
  return enabled
}

// --- anonymous, per-install client id (contributions only) -------------------
let clientIdPromise: Promise<string> | null = null
function getClientId(): Promise<string> {
  if (!clientIdPromise) {
    clientIdPromise = (async () => {
      const r = await chrome.storage.local.get(CLIENT_ID_KEY)
      let id = r[CLIENT_ID_KEY] as string | undefined
      if (!id) {
        id = crypto.randomUUID()
        await chrome.storage.local.set({ [CLIENT_ID_KEY]: id })
      }
      return id
    })()
  }
  return clientIdPromise
}

// Expiry timestamps, pruned lazily on read.
const negativeCache = new Map<string, number>()
const recentlyQueried = new Map<string, number>()

// --- resilience: timeout + circuit breaker -----------------------------------
let consecutiveFailures = 0
let breakerOpenUntil = 0

function breakerOpen(now: number): boolean {
  return now < breakerOpenUntil
}
function noteFailure(): void {
  consecutiveFailures += 1
  if (consecutiveFailures >= BREAKER_THRESHOLD) {
    breakerOpenUntil = Date.now() + BREAKER_COOLDOWN_MS
  }
}
function noteSuccess(): void {
  consecutiveFailures = 0
  breakerOpenUntil = 0
}

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

interface ServedProfile {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
  rev?: boolean
}

export interface SharedHit {
  userName: string
  data: LocationData
  /** Server asked us to re-verify this value against X (stochastic freshness). */
  revalidate: boolean
}

/** Skips names asked about recently or known-missing, so scrolls stay cheap. */
export async function sharedBatchLookup(
  userNames: string[],
): Promise<SharedHit[]> {
  if (!enabled) return []
  const now = Date.now()
  if (breakerOpen(now)) return []

  const names = [...new Set(userNames.map((u) => u.toLowerCase()))].filter(
    (u) => {
      const neg = negativeCache.get(u)
      if (neg !== undefined) {
        if (neg > now) return false
        negativeCache.delete(u)
      }
      const rq = recentlyQueried.get(u)
      if (rq !== undefined && rq > now) return false
      return true
    },
  )
  if (names.length === 0) return []

  const batch = names.slice(0, MAX_LOOKUP)
  for (const u of batch) recentlyQueried.set(u, now + QUERIED_TTL_MS)

  try {
    const resp = await fetchWithTimeout(`${CACHE_API_BASE}/v1/loc/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ usernames: batch }),
      credentials: 'omit',
    })
    if (!resp.ok) {
      noteFailure()
      return []
    }
    const body = (await resp.json()) as { profiles?: ServedProfile[] }
    noteSuccess()
    const profiles = body.profiles ?? []

    const found = new Set<string>()
    const hits: SharedHit[] = []
    for (const p of profiles) {
      found.add(p.u)
      if (p.conf < minConfidence) continue
      hits.push({
        userName: p.u,
        data: {
          location: p.loc,
          locationAccurate: p.acc,
          source: p.src as LocationData['source'],
        },
        revalidate: p.rev === true,
      })
    }
    // Confirmed-missing: don't re-ask for NEG_TTL_MS.
    for (const u of batch) {
      if (!found.has(u)) negativeCache.set(u, now + NEG_TTL_MS)
    }
    return hits
  } catch {
    noteFailure()
    return []
  }
}

// --- contributions -----------------------------------------------------------
interface OutVote {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
}

const outBuffer = new Map<string, OutVote>()
const lastSent = new Map<string, string>()
let flushTimer: ReturnType<typeof setTimeout> | null = null

function signature(data: LocationData): string {
  return `${data.location ?? ''}|${data.source ?? ''}|${data.locationAccurate}`
}

/** A real AboutAccountQuery result, never a cache hit. Deduped per session. */
export function contributeLocation(userName: string, data: LocationData): void {
  if (!enabled) return
  const u = userName.toLowerCase()
  const sig = signature(data)
  if (lastSent.get(u) === sig) return
  lastSent.set(u, sig)

  outBuffer.set(u, {
    u,
    loc: data.location,
    src: data.source,
    acc: data.locationAccurate,
  })
  // First-hand beats a stale "server had nothing".
  negativeCache.delete(u)
  recentlyQueried.delete(u)

  if (outBuffer.size >= MAX_CONTRIB) {
    void flush()
  } else if (flushTimer === null) {
    flushTimer = setTimeout(() => void flush(), FLUSH_DELAY_MS)
  }
}

async function flush(): Promise<void> {
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (outBuffer.size === 0) return
  const entries = [...outBuffer.values()]
  outBuffer.clear()

  // Still in local IDB, so it gets re-contributed in a later session.
  if (breakerOpen(Date.now())) return

  try {
    const clientId = await getClientId()
    const resp = await fetchWithTimeout(`${CACHE_API_BASE}/v1/loc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, entries }),
      credentials: 'omit',
      // So a flush triggered as the tab unloads still lands.
      keepalive: true,
    })
    if (!resp.ok) {
      noteFailure()
      return
    }
    noteSuccess()
  } catch {
    noteFailure()
  }
}

/** So a tab being closed doesn't strand a batch until the next session. */
export function flushContributions(): void {
  void flush()
}

// --- how much the cache holds ------------------------------------------------
// The popup shows this, and only while it is open. Three things keep it off the
// server: nobody asks unless a popup is on screen, the answer carries a
// `max-age` so a re-ask inside that window never leaves the browser, and the
// server memoises the count for the same window — so what does get through
// costs one `COUNT(*)` between every reader, not one each.

/** How often the popup re-asks while it is open. Under the server's max-age. */
export const COUNT_POLL_MS = 30_000

/** Older than this, a remembered number says more about the gap than the cache. */
const COUNT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Accounts the shared cache can answer for, or null when there is nobody to ask
 * or the answer didn't come. Outside the circuit breaker on purpose: the breaker
 * exists to stop a scrolling timeline retrying a struggling server, and this
 * asks at most twice a minute while a popup is open — it also must not go blank
 * because lookups in a different tab tripped it.
 */
export async function fetchCacheCount(): Promise<number | null> {
  if (!isSharedCacheConfigured()) return null
  try {
    const resp = await fetchWithTimeout(`${CACHE_API_BASE}/v1/stats`, {
      credentials: 'omit',
    })
    // Includes the 404 from a server too old to have the route, which is the
    // one every install talked to until this shipped.
    if (!resp.ok) return null
    const body = (await resp.json()) as { profiles?: unknown }
    const n = finiteNumber(body.profiles)
    return n === null || n < 0 ? null : Math.floor(n)
  } catch {
    return null
  }
}

/**
 * The last answer, if it is recent enough to still mean something. `at` is when
 * the number last *moved*, so a cache whose count has stood still for a week is
 * one nothing is contributing to — and a stale figure is worse than the second
 * of blank before the live one lands.
 */
export function rememberedCount(
  stored: Record<string, unknown>,
  now = Date.now(),
): number | null {
  const count = normalizeSharedCacheCount(stored[SHARED_CACHE_COUNT_KEY])
  if (count === null || now - count.at > COUNT_MAX_AGE_MS) return null
  return count.n
}

/**
 * Ask, and remember the answer for the next popup. Stored only when the number
 * actually moved — every write wakes the service worker and each open x.com
 * tab's storage listener, and this runs on a timer.
 */
export async function refreshCacheCount(): Promise<number | null> {
  const n = await fetchCacheCount()
  if (n === null) return null
  const stored = await chrome.storage.local.get(SHARED_CACHE_COUNT_KEY)
  if (normalizeSharedCacheCount(stored[SHARED_CACHE_COUNT_KEY])?.n !== n) {
    await chrome.storage.local.set({
      [SHARED_CACHE_COUNT_KEY]: { n, at: Date.now() },
    })
  }
  return n
}

export function __resetSharedCache(): void {
  enabled = false
  minConfidence = DEFAULT_MIN_CONFIDENCE
  clientIdPromise = null
  negativeCache.clear()
  recentlyQueried.clear()
  outBuffer.clear()
  lastSent.clear()
  consecutiveFailures = 0
  breakerOpenUntil = 0
  if (flushTimer !== null) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
}
