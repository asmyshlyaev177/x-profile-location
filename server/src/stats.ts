// Request counters for the Node deployment: in-process, per window, no per-IP
// accounting ever. See "Stats cost what they measure" in CLAUDE.md.

export interface StatsSnapshot {
  /** ISO timestamp the window opened. */
  since: string
  windowS: number
  /** POST /v1/loc/batch */
  lookups: number
  /** usernames asked about across those requests */
  lookupNames: number
  /** profiles actually served back */
  lookupHits: number
  /** lookupHits / lookupNames — the number that says whether the cache is working. */
  hitRate: number | null
  /** POST /v1/loc */
  contributions: number
  /** votes submitted across those requests */
  contributedEntries: number
  /** distinct anonymous installs that contributed during the window */
  users: number
  /** true if the distinct-install set hit its cap and the count is a floor */
  usersCapped?: true
  /** GET /v1/stats — popups asking how much the cache holds */
  statsReads: number
  /** requests to anything else (404s, probes, scanners) */
  other: number
  rateLimited: number
  tooLarge: number
  errors: number
  /** Fastest, median, mean and slowest handled request; all null when idle. */
  minMs: number | null
  medianMs: number | null
  avgMs: number | null
  maxMs: number | null
}

/** A cap on junk clientIds: past any real deployment, so the count degrades to
 *  a floor rather than the process to an OOM. */
const MAX_TRACKED_CLIENTS = 50_000

/** Body shapes we count. Parsed defensively — stats must never fail a request. */
function parseBody(json: string): Record<string, unknown> | null {
  if (json === '') return null
  try {
    const parsed = JSON.parse(json) as unknown
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}

function countArray(body: Record<string, unknown> | null, key: string): number {
  const arr = body?.[key]
  return Array.isArray(arr) ? arr.length : 0
}

interface LatencySummary {
  minMs: number | null
  medianMs: number | null
  avgMs: number | null
  maxMs: number | null
}

/** Median off a ms-resolution histogram: bounded by the slowest response ever
 *  seen in the window, not by request volume, so no sample cap is needed. */
function summarizeLatency(hist: Map<number, number>): LatencySummary {
  let count = 0
  let total = 0
  for (const [ms, n] of hist) {
    count += n
    total += ms * n
  }
  if (count === 0) {
    return { minMs: null, medianMs: null, avgMs: null, maxMs: null }
  }
  const keys = [...hist.keys()].sort((a, b) => a - b)
  const at = (rank: number): number => {
    let seen = 0
    for (const ms of keys) {
      seen += hist.get(ms)!
      if (rank < seen) return ms
    }
    return keys[keys.length - 1]!
  }
  const medianMs =
    count % 2 === 1
      ? at((count - 1) / 2)
      : (at(count / 2 - 1) + at(count / 2)) / 2
  return {
    minMs: keys[0]!,
    medianMs,
    avgMs: Math.round((total / count) * 100) / 100,
    maxMs: keys[keys.length - 1]!,
  }
}

export class Stats {
  #since = Date.now()
  #lookups = 0
  #lookupNames = 0
  #lookupHits = 0
  #contributions = 0
  #contributedEntries = 0
  #clients = new Set<string>()
  #clientsCapped = false
  #statsReads = 0
  #other = 0
  #rateLimited = 0
  #tooLarge = 0
  #errors = 0
  #latencyHist = new Map<number, number>()

  /** Bodies are re-parsed here rather than threaded out of the handlers, so
   *  index.ts stays free of instrumentation for the Worker build. */
  noteRequest(
    pathname: string,
    requestBody: string,
    responseBody: string,
    ms: number,
  ): void {
    const bucket = Math.max(0, Math.round(ms))
    this.#latencyHist.set(bucket, (this.#latencyHist.get(bucket) ?? 0) + 1)

    if (pathname === '/v1/loc/batch') {
      this.#lookups += 1
      this.#lookupNames += countArray(parseBody(requestBody), 'usernames')
      this.#lookupHits += countArray(parseBody(responseBody), 'profiles')
    } else if (pathname === '/v1/loc') {
      const body = parseBody(requestBody)
      this.#contributions += 1
      this.#contributedEntries += countArray(body, 'entries')
      // Counted from the clientId already on the wire; the SQL equivalent is a
      // ~230ms full scan that stalls the event loop. See bench/load.ts.
      const cid = body?.clientId
      if (typeof cid === 'string' && cid !== '') {
        if (this.#clients.size < MAX_TRACKED_CLIENTS) this.#clients.add(cid)
        else this.#clientsCapped = true
      }
    } else if (pathname === '/v1/stats') {
      // On its own, not in `other`: that is what says how much scanner traffic
      // this box takes, and popups asking for a number would drown it.
      this.#statsReads += 1
    } else {
      this.#other += 1
    }
  }

  noteRateLimited(): void {
    this.#rateLimited += 1
  }
  noteTooLarge(): void {
    this.#tooLarge += 1
  }
  noteError(): void {
    this.#errors += 1
  }

  snapshot(now = Date.now()): StatsSnapshot {
    return {
      since: new Date(this.#since).toISOString(),
      windowS: Math.round((now - this.#since) / 1000),
      lookups: this.#lookups,
      lookupNames: this.#lookupNames,
      lookupHits: this.#lookupHits,
      // Null rather than 0 when nothing was asked, so an idle window reads
      // as "no data" instead of "0% hit rate", which would look like an outage.
      hitRate:
        this.#lookupNames === 0
          ? null
          : Math.round((this.#lookupHits / this.#lookupNames) * 1000) / 1000,
      contributions: this.#contributions,
      contributedEntries: this.#contributedEntries,
      users: this.#clients.size,
      ...(this.#clientsCapped ? { usersCapped: true as const } : {}),
      statsReads: this.#statsReads,
      other: this.#other,
      rateLimited: this.#rateLimited,
      tooLarge: this.#tooLarge,
      errors: this.#errors,
      ...summarizeLatency(this.#latencyHist),
    }
  }

  /** Snapshot and start a fresh window, atomically. */
  drain(now = Date.now()): StatsSnapshot {
    const snap = this.snapshot(now)
    this.#since = now
    this.#lookups = 0
    this.#lookupNames = 0
    this.#lookupHits = 0
    this.#contributions = 0
    this.#contributedEntries = 0
    this.#clients.clear()
    this.#clientsCapped = false
    this.#statsReads = 0
    this.#other = 0
    this.#rateLimited = 0
    this.#tooLarge = 0
    this.#errors = 0
    this.#latencyHist.clear()
    return snap
  }
}
