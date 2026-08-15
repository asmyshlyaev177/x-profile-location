// Request counters for the Node deployment.
//
// Cloudflare's dashboard gave this away for free; a self-hosted box has to
// produce it itself. Everything here is an in-process counter plus, at log
// time, a few COUNT(*) queries — no time-series store, no per-request rows, and
// nothing on disk beyond the log line.
//
// Counters are per *window*, reset each time they are logged, because the
// question is "what happened today", not "since when did this process last
// restart". A restart therefore loses the partial window, which is why
// node-server.ts also emits a snapshot on SIGTERM.
//
// On privacy: contributions carry an anonymous per-install clientId, already
// stored in location_votes, so distinct-users is derivable without recording
// anything new. Lookups carry no identity at all — there is deliberately no
// per-IP accounting in here, and adding some would make the server able to
// profile who looks up whom, which is exactly what it promises not to do.

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
  avgMs: number | null
  maxMs: number
}

/**
 * An install that sent nothing but junk clientIds could otherwise grow this set
 * without bound. Well past any real deployment, so hitting it means abuse, not
 * success — the count degrades to a floor rather than the process to an OOM.
 */
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
  #totalMs = 0
  #maxMs = 0
  #timed = 0

  /**
   * Record one handled request. `requestBody` / `responseBody` are the raw JSON
   * already in hand, re-parsed here rather than threaded out of the handlers —
   * that keeps index.ts free of instrumentation, which matters because it is
   * shared verbatim with the Worker build.
   */
  noteRequest(
    pathname: string,
    requestBody: string,
    responseBody: string,
    ms: number,
  ): void {
    this.#totalMs += ms
    this.#timed += 1
    if (ms > this.#maxMs) this.#maxMs = ms

    if (pathname === '/v1/loc/batch') {
      this.#lookups += 1
      this.#lookupNames += countArray(parseBody(requestBody), 'usernames')
      this.#lookupHits += countArray(parseBody(responseBody), 'profiles')
    } else if (pathname === '/v1/loc') {
      const body = parseBody(requestBody)
      this.#contributions += 1
      this.#contributedEntries += countArray(body, 'entries')
      // Distinct installs, counted from the clientId already on the wire. Doing
      // it here rather than as SELECT COUNT(DISTINCT client_id) keeps it free:
      // that query is a full scan of location_votes, measured at ~230ms over
      // 5.4M rows, and better-sqlite3 is synchronous, so it stalls every
      // in-flight request for the duration. See bench/load.ts.
      const cid = body?.clientId
      if (typeof cid === 'string' && cid !== '') {
        if (this.#clients.size < MAX_TRACKED_CLIENTS) this.#clients.add(cid)
        else this.#clientsCapped = true
      }
    } else if (pathname === '/v1/stats') {
      // Counted on its own rather than left in `other`, which is what says how
      // much scanner traffic this box is taking. Popups asking for a number
      // would drown that.
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
      avgMs:
        this.#timed === 0
          ? null
          : Math.round((this.#totalMs / this.#timed) * 100) / 100,
      maxMs: this.#maxMs,
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
    this.#totalMs = 0
    this.#maxMs = 0
    this.#timed = 0
    return snap
  }
}
