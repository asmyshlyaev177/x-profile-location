// Client for the shared community location cache (../../server).
//
// Two directions:
//   - lookup:      batch-query locations for usernames seen on screen, so the
//                  extension can show a flag without a per-profile X call.
//   - contribute:  after a real AboutAccountQuery, send the result back so other
//                  users benefit (buffered + deduped, best-effort).
//
// Only location/source/accurate travel over the wire — never bios or who looked
// up whom. The feature is inert unless CACHE_API_BASE is configured and the user
// has opted in (setSharedCacheEnabled).
//
// This layer is best-effort and strictly optional: every request has a timeout,
// every failure (rate limit, 5xx, network error, timeout) resolves to "no data"
// so callers fall back to the direct X API, and a circuit breaker backs off
// after repeated failures so a down/limited server isn't hammered. Nothing here
// can break the extension's core location/highlighting features.

import type { LocationData } from './cache'
import { CACHE_API_BASE } from './constants'

// A location is only trusted once this many distinct clients agree (matches the
// server's consensus model; see server/README.md).
// TODO: set to 2 for production
export const MIN_CONFIDENCE = 1

const NEG_TTL_MS = 60 * 60 * 1000 // remember "server had nothing" for 1h
const QUERIED_TTL_MS = 15 * 60 * 1000 // don't re-query the same name within 15m
// Contributions are buffered and sent as one batched POST. A long window keeps the
// request count low even while the background prefetcher trickles in dozens of
// results over a session — they ride out together (or sooner if MAX_CONTRIB is
// hit, or the tab is hidden; see flushContributions). Sharing is best-effort, so a
// 30s delay before a result reaches the server is harmless.
export const FLUSH_DELAY_MS = 30_000
const MAX_CONTRIB = 50
const MAX_LOOKUP = 100
const CLIENT_ID_KEY = 'sharedCacheClientId'

const FETCH_TIMEOUT_MS = 5000
// Circuit breaker: after this many consecutive failures, stop calling the server
// for a cooldown, so an outage or a hit rate-limit produces one short burst of
// failed requests rather than a continuous stream. The extension keeps working
// via the direct X API throughout.
const BREAKER_THRESHOLD = 3
const BREAKER_COOLDOWN_MS = 10 * 60 * 1000

let enabled = false

/** Enable/disable at runtime from the stored setting. No-op without a server URL. */
export function setSharedCacheEnabled(value: boolean): void {
  enabled = value && CACHE_API_BASE.length > 0
}

export function isSharedCacheConfigured(): boolean {
  return CACHE_API_BASE.length > 0
}

// --- anonymous, per-install client id (only sent with contributions) ---------
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

// expiry-timestamp maps; entries are pruned lazily on read
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

// fetch with an abort-based timeout; rejects (→ handled as failure) if the
// server doesn't respond in time.
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

/**
 * Look up locations for a set of usernames. Filters out names we asked about
 * recently or that the server is known not to have, so repeated timeline scrolls
 * stay cheap. Returns only confirmed (confidence ≥ MIN_CONFIDENCE) hits.
 */
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
      if (p.conf < MIN_CONFIDENCE) continue
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
    // Names the server has nothing (confirmed) for: skip re-asking for a while.
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

/**
 * Queue an authoritative AboutAccountQuery result to share. Call only with a
 * real API result (not a cache hit). Deduped: the same value for a user is sent
 * at most once per session; buffered and flushed together.
 */
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
  // A fresh first-hand value overrides any stale "server had nothing".
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

  // Server known-down: drop this batch rather than pile on. The data is still in
  // local IDB and gets re-contributed in a later session (or by other users).
  if (breakerOpen(Date.now())) return

  try {
    const clientId = await getClientId()
    const resp = await fetchWithTimeout(`${CACHE_API_BASE}/v1/loc`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ clientId, entries }),
      credentials: 'omit',
      // Let a flush triggered as the tab unloads still reach the server.
      keepalive: true,
    })
    if (!resp.ok) {
      noteFailure()
      return
    }
    noteSuccess()
  } catch {
    // best-effort; drop on failure
    noteFailure()
  }
}

/**
 * Force any buffered contributions out now (best-effort). Called when the tab is
 * being hidden or closed, so the long batching window (FLUSH_DELAY_MS) doesn't
 * strand a batch until the next session. No-op when the buffer is empty.
 */
export function flushContributions(): void {
  void flush()
}

/** Test-only: reset in-memory caches/buffers. */
export function __resetSharedCache(): void {
  enabled = false
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
