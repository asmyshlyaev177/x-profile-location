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
// Best-effort and strictly optional: every request has a timeout, every failure
// resolves to "no data" so callers fall back to the direct X API, and a circuit
// breaker backs off after repeated failures. Nothing here can break the core.

import type { LocationData } from './cache'
import { CACHE_API_BASE } from './constants'
import { DEFAULT_MIN_CONFIDENCE, normalizeMinConfidence } from './countries'

// Distinct clients that must agree before a location is trusted (the server's
// consensus model; see server/README.md).
//
// Still 1, deliberately: measured 2026-07-27, 52 of 4242 profiles had reached 2,
// so raising it today would drop what the cache can answer by ~99% — and a cache
// that answers nothing costs more than it protects. VOTE_CAP keeps only the 10
// newest votes per handle anyway, so 2 guards against one honest-but-wrong
// client, not a poisoner who can mint ids.
//
// Flip to 2 once this is a majority:
// sqlite3 /var/lib/x-loc-cache/x-loc-cache.db 'SELECT COUNT(*) AS profiles, SUM(location_confidence >= 2) AS ready FROM profiles;'
//
// Stored (MIN_CONFIDENCE_KEY) rather than compiled in, so it can be raised on one
// install and measured without shipping a build.
export let minConfidence: number = DEFAULT_MIN_CONFIDENCE

/** Apply the stored threshold. Anything unusable falls back to the default. */
export function setMinConfidence(value: unknown): void {
  minConfidence = normalizeMinConfidence(value)
}

const NEG_TTL_MS = 60 * 60 * 1000 // remember "server had nothing" for 1h
const QUERIED_TTL_MS = 15 * 60 * 1000 // don't re-query the same name within 15m
// Contributions ride out as one batched POST, so a session of prefetch results
// costs a handful of requests. Sent sooner on MAX_CONTRIB or a hidden tab; a 30s
// delay is harmless for something best-effort.
export const FLUSH_DELAY_MS = 30_000
const MAX_CONTRIB = 50
const MAX_LOOKUP = 100
const CLIENT_ID_KEY = 'sharedCacheClientId'

const FETCH_TIMEOUT_MS = 5000
// Circuit breaker: after this many consecutive failures, back off for a cooldown,
// so an outage costs one short burst rather than a continuous stream.
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

/** Whether sharing is actually live — opted in *and* a server configured. */
export function isSharedCacheEnabled(): boolean {
  return enabled
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
 * Look up locations for a set of usernames, skipping names asked about recently
 * or known-missing so repeated scrolls stay cheap. Confirmed hits only.
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
 * Queue an authoritative AboutAccountQuery result to share — a real API result,
 * never a cache hit. Deduped to once per user per session.
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

  // Server known-down: drop the batch. It is still in local IDB and gets
  // re-contributed in a later session.
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
 * Force buffered contributions out now, so a tab being hidden or closed doesn't
 * strand a batch until the next session.
 */
export function flushContributions(): void {
  void flush()
}

/** Test-only: reset in-memory caches/buffers. */
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
