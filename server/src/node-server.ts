// Node entry point for the SQLite backend.
//
// Adapts node:http to the fetch-style handler exported by index.ts, so the
// request logic is byte-identical to what runs on the Cloudflare Worker. Also
// owns the things the Workers platform used to provide for free: the cron
// trigger (retention), a body-size limit, and a per-IP rate limit — a bare VPS
// origin has no edge in front of it absorbing abuse.
//
// Run it directly, no build step (Node >= 22.6):
//   node --experimental-strip-types src/node-server.ts
// The flag is required below 22.18 and accepted, silently, at or above it.
//
// Everything is configured by XLOC_* environment variables; see README.md.

import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { mkdirSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import worker, { type Env } from './index.ts'
import { DEFAULT_SQLITE_CONFIG, openDatabase, type SqliteDb } from './sqlite.ts'
import { Stats } from './stats.ts'

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
function num(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) {
    throw new Error(
      `${name} must be a non-negative number, got ${JSON.stringify(raw)}`,
    )
  }
  return n
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  return raw === '1' || raw.toLowerCase() === 'true'
}

const config = {
  host: process.env.XLOC_HOST ?? '127.0.0.1',
  port: num('XLOC_PORT', 8787),
  dbPath: resolve(process.env.XLOC_DB ?? './data/x-loc-cache.db'),
  cacheMb: num('XLOC_CACHE_MB', DEFAULT_SQLITE_CONFIG.cacheMb),
  mmapMb: num('XLOC_MMAP_MB', DEFAULT_SQLITE_CONFIG.mmapMb),
  retentionHours: num('XLOC_RETENTION_INTERVAL_HOURS', 24),
  maxBodyBytes: num('XLOC_MAX_BODY_KB', 256) * 1024,
  rateLimit: num('XLOC_RATE_LIMIT', 600), // requests per window per IP; 0 = off
  rateWindowMs: num('XLOC_RATE_WINDOW_S', 60) * 1000,
  statsIntervalHours: num('XLOC_STATS_INTERVAL_HOURS', 24), // 0 = never log stats
  // Client IP comes from X-Forwarded-For when a reverse proxy terminates TLS,
  // which is the documented deployment. Only honour it when told to — a
  // directly-exposed server must not let clients forge their own identity.
  trustProxy: bool('XLOC_TRUST_PROXY', true),
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed window per IP
// ---------------------------------------------------------------------------
// Deliberately crude: an in-memory counter with no coordination, sized to stop a
// single host from saturating one vCPU rather than to enforce fair use.
//
// The default is generous on purpose, because one IP is not one user. Offices,
// universities and CGNAT put many installs behind a single address, and a false
// positive is expensive: shared-cache.ts counts a 429 as a failure, and three
// consecutive failures open its circuit breaker for ten minutes — so clipping a
// legitimate burst costs that user the shared cache far longer than the burst
// lasted. Against a real flood the ceiling still bites (10 req/s from one host),
// and against a distributed one no per-IP limit would have helped anyway.
//
// Budget: a heavy scroller bursts ~20-30 req/min (lookups are batched 100
// usernames at a time and deduped for 15 minutes; contributions are buffered for
// 30s), so 600/min leaves room for ~20 simultaneously-active users on one IP,
// and many more typical ones. Raise XLOC_RATE_LIMIT if you know you have a
// large NAT population, or set it to 0 and let the reverse proxy own this.
const buckets = new Map<string, { count: number; resetAt: number }>()

/** Returns 0 when allowed, else the seconds until the window rolls (Retry-After). */
function rateLimited(ip: string, now: number): number {
  if (config.rateLimit === 0) return 0
  const b = buckets.get(ip)
  if (!b || now >= b.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + config.rateWindowMs })
    return 0
  }
  b.count += 1
  if (b.count <= config.rateLimit) return 0
  return Math.max(1, Math.ceil((b.resetAt - now) / 1000))
}

/** Drop expired buckets so a spray of distinct source IPs can't grow the map. */
function sweepBuckets(now: number): void {
  for (const [ip, b] of buckets) {
    if (now >= b.resetAt) buckets.delete(ip)
  }
}

function clientIp(req: IncomingMessage): string {
  if (config.trustProxy) {
    const raw = req.headers['x-forwarded-for']
    const xff = Array.isArray(raw) ? raw.join(',') : raw
    // The *last* entry, not the first. Caddy (and nginx's proxy_add_x_forwarded_for)
    // append the peer address to whatever the client sent, so the first entry is
    // attacker-controlled — a client sending `X-Forwarded-For: 1.2.3.4` would
    // otherwise get a fresh rate-limit bucket per request. The entry our own
    // proxy appended is the one that can be trusted.
    const hops = xff?.split(',') ?? []
    const last = hops[hops.length - 1]?.trim()
    if (last) return last
  }
  return req.socket.remoteAddress ?? 'unknown'
}

// ---------------------------------------------------------------------------
// node:http <-> fetch adapter
// ---------------------------------------------------------------------------
const BODYLESS = new Set(['GET', 'HEAD', 'OPTIONS', 'DELETE'])

/**
 * Methods a fetch Request cannot represent: undici throws rather than
 * constructing one. Nothing legitimate sends them here — TRACE and TRACK are
 * probes for cross-site tracing, CONNECT for an open proxy — so they get the
 * flat 405 the spec wants instead of being carried into the adapter.
 *
 * In practice only TRACE arrives: node:http routes CONNECT to the server's
 * `connect` event, and its parser answers TRACK itself with a bare 400. The set
 * lists all three because it describes what `new Request` rejects, and which of
 * them node happens to intercept first is not ours to depend on.
 */
const UNSUPPORTED_METHODS = new Set(['CONNECT', 'TRACE', 'TRACK'])

/** Request path minus the query, the shape the stats counters key on. */
function pathOf(req: IncomingMessage): string {
  return (req.url ?? '/').split('?')[0]!
}

/** Cheap pre-check: reject on the declared length before reading a byte. */
function declaredTooLarge(req: IncomingMessage, limit: number): boolean {
  const len = Number(req.headers['content-length'])
  return Number.isFinite(len) && len > limit
}

async function readBody(
  req: IncomingMessage,
  limit: number,
): Promise<string | null> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    size += (chunk as Buffer).length
    if (size > limit) {
      req.pause() // stop reading, but leave the socket alive to answer on
      return null // signals 413
    }
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/**
 * Null when the request has no fetch equivalent, which the caller answers 400.
 *
 * node:http accepts more than `new Request` does, and scanners live in the gap:
 * a request target of `//` parses as a scheme-relative URL with no host, and
 * header names node's parser tolerates can still be rejected by `Headers`.
 * Anything that throws in here is malformed input, not a server fault, so it is
 * caught wholesale — otherwise a port scan surfaced as a 500 and an entry in
 * the error counter.
 */
function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  return headers
}

function toRequest(req: IncomingMessage, body: string | null): Request | null {
  try {
    // The handlers only read `url.pathname`, so the authority is cosmetic — but
    // it has to parse, and req.headers.host is attacker-controlled.
    const url = new URL(req.url ?? '/', 'http://localhost')
    return new Request(url, {
      method: req.method,
      headers: toHeaders(req),
      body: body === null || body === '' ? undefined : body,
    })
  } catch {
    return null
  }
}

/** Returns the serialised body, which the caller feeds to the stats counters. */
async function send(res: ServerResponse, response: Response): Promise<string> {
  const headers: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    headers[key] = value
  })
  const body = Buffer.from(await response.arrayBuffer())
  res.writeHead(response.status, headers)
  res.end(body)
  return body.toString('utf8')
}

function plain(
  res: ServerResponse,
  status: number,
  text: string,
  extra?: Record<string, string>,
): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'access-control-allow-origin': '*',
    ...extra,
  })
  res.end(text)
}

/**
 * Answer 413 without reading the rest of the upload. The response has to flush
 * before the socket goes away, so the request is only destroyed once the
 * response is on the wire — destroying it first turns the 413 into a connection
 * reset the client can't distinguish from a crash.
 */
function rejectTooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.once('finish', () => req.destroy())
  plain(res, 413, 'Payload Too Large', { connection: 'close' })
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
mkdirSync(dirname(config.dbPath), { recursive: true })
const db: SqliteDb = openDatabase({
  path: config.dbPath,
  cacheMb: config.cacheMb,
  mmapMb: config.mmapMb,
})
const env: Env = { DB: db }
const stats = new Stats()

// ---------------------------------------------------------------------------
// Usage reporting
// ---------------------------------------------------------------------------
/**
 * Distinct anonymous installs that contributed in the last `hours`.
 *
 * This needs no new tracking: location_votes already stores an anonymous
 * per-install client_id alongside seen_at, so the figure falls out of a query.
 * Unlike the window count in stats.ts it survives restarts and is independent
 * of the logging cadence, which is what it is here for.
 *
 * It is also the expensive half of a stats line. There is no index on seen_at
 * (deliberately — see schema.sql), so this is a full scan: ~230ms over 5.4M
 * votes, measured in bench/load.ts, growing linearly from there. better-sqlite3
 * is synchronous, so that time is an event-loop stall, not just a slow query.
 * Acceptable once a day; do not move it onto a request path, and if the stats
 * interval is ever shortened to minutes, drop these two fields and keep the
 * free per-window `users` count instead.
 *
 * It counts *contributors*, which is a floor on active users rather than an
 * exact count — a session served entirely from the cache makes no contribution
 * and so is invisible here. Counting readers instead would mean having clients
 * send an identifier on lookups too, which is precisely what would let this
 * server correlate an install with the handles it viewed. The undercount is the
 * price of not being able to do that.
 */
async function activeUsers(hours: number): Promise<number> {
  const { results } = await db
    .prepare(
      'SELECT COUNT(DISTINCT client_id) AS n FROM location_votes WHERE seen_at >= ?',
    )
    .bind(Date.now() - hours * 60 * 60 * 1000)
    .all<{ n: number }>()
  return results?.[0]?.n ?? 0
}

/** Bytes on disk, main file plus the WAL that has not been checkpointed yet. */
function dbBytes(): number {
  let total = 0
  for (const suffix of ['', '-wal']) {
    try {
      total += statSync(config.dbPath + suffix).size
    } catch {
      // -wal is absent between checkpoints; the main file cannot be.
    }
  }
  return total
}

/**
 * One JSON line per window, greppable and jq-able:
 *   journalctl -u x-loc-cache | grep 'stats ' | sed 's/.*stats //' | jq .
 *
 * Counters are drained (reset) here, so each line describes its own window
 * rather than everything since boot.
 */
async function logStats(reason: 'interval' | 'shutdown'): Promise<void> {
  try {
    const counters = stats.drain()
    const { results } = await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM profiles) AS profiles,' +
          ' (SELECT COUNT(*) FROM location_votes) AS votes',
      )
      .all<{ profiles: number; votes: number }>()
    const totals = results?.[0]
    console.log(
      `[x-loc-cache] stats ${JSON.stringify({
        reason,
        ...counters,
        users24h: await activeUsers(24),
        users7d: await activeUsers(24 * 7),
        profiles: totals?.profiles ?? 0,
        votes: totals?.votes ?? 0,
        dbMb: Math.round((dbBytes() / (1024 * 1024)) * 100) / 100,
        rssMb: Math.round(process.memoryUsage().rss / (1024 * 1024)),
      })}`,
    )
  } catch (err) {
    console.error('[x-loc-cache] stats failed:', err)
  }
}

const server = createServer((req, res) => {
  void (async () => {
    const startedAt = Date.now()
    try {
      // Cheap liveness probe for systemd/Caddy. Not part of the Worker's routes,
      // so it lives here rather than in the shared handler. Deliberately not
      // counted: at one probe every 30s it would be most of the traffic and
      // would drown the numbers that matter.
      if (req.method === 'GET' && req.url === '/healthz') {
        return plain(res, 200, 'ok')
      }
      // Retry-After is not just politeness: without it a limited client keeps
      // retrying into the window and burns through shared-cache.ts's three-strike
      // circuit breaker, losing the cache for ten minutes over a one-second spike.
      const retryAfter = rateLimited(clientIp(req), Date.now())
      if (retryAfter > 0) {
        stats.noteRateLimited()
        return plain(res, 429, 'Too Many Requests', {
          'retry-after': String(retryAfter),
        })
      }
      // Rejected ahead of the adapter, and counted as `other` alongside the
      // 404s: these are scanner traffic, which is a thing to have a number for,
      // not an error to page anyone about.
      if (UNSUPPORTED_METHODS.has(req.method ?? '')) {
        stats.noteRequest(pathOf(req), '', '', Date.now() - startedAt)
        return plain(res, 405, 'Method Not Allowed', {
          allow: 'GET, POST, OPTIONS',
        })
      }
      if (declaredTooLarge(req, config.maxBodyBytes)) {
        stats.noteTooLarge()
        return rejectTooLarge(req, res)
      }
      const body = BODYLESS.has(req.method ?? 'GET')
        ? ''
        : await readBody(req, config.maxBodyBytes)
      if (body === null) {
        stats.noteTooLarge()
        return rejectTooLarge(req, res)
      }

      const request = toRequest(req, body)
      if (request === null) {
        stats.noteRequest(pathOf(req), '', '', Date.now() - startedAt)
        return plain(res, 400, 'Bad Request')
      }

      const responseBody = await send(res, await worker.fetch(request, env))
      stats.noteRequest(pathOf(req), body, responseBody, Date.now() - startedAt)
    } catch (err) {
      stats.noteError()
      console.error('[x-loc-cache] request failed:', err)
      if (!res.headersSent) plain(res, 500, 'Internal Server Error')
      else res.end()
    }
  })()
})

// Sitting behind a reverse proxy, keep-alive should outlive the proxy's own idle
// timeout so it is the proxy that closes idle connections, not us mid-request.
server.keepAliveTimeout = 61_000
server.headersTimeout = 65_000

// Retention. The Worker gets this from a cron trigger in wrangler.toml; here it
// is just an interval, run once shortly after boot so a box that reboots daily
// still prunes. unref() keeps it from holding the process open on shutdown.
const retentionMs = config.retentionHours * 60 * 60 * 1000
async function runRetention(): Promise<void> {
  const startedAt = Date.now()
  try {
    const deleted = await worker.scheduled(null, env)
    sweepBuckets(Date.now())
    db.raw.pragma('wal_checkpoint(TRUNCATE)')
    // Logged unconditionally, including the common `deleted 0` case: this runs
    // once a day, and without a success line an absent log is indistinguishable
    // from a timer that never fired. `journalctl -u x-loc-cache | grep retention`
    // is then a real answer to "is cleanup running".
    console.log(
      `[x-loc-cache] retention: deleted ${deleted} vote(s) in ${Date.now() - startedAt}ms`,
    )
  } catch (err) {
    console.error('[x-loc-cache] retention failed:', err)
  }
}
const retentionTimer = setInterval(() => void runRetention(), retentionMs)
retentionTimer.unref()
const bootTimer = setTimeout(() => void runRetention(), 60_000)
bootTimer.unref()
// Buckets are also swept between retention runs; the map is small but the sweep
// is O(n) and there is no reason to let it sit for a whole day.
const sweepTimer = setInterval(
  () => sweepBuckets(Date.now()),
  config.rateWindowMs * 10,
)
sweepTimer.unref()

// Usage stats, on their own interval so the reporting cadence can be changed
// without touching how often data is pruned.
if (config.statsIntervalHours > 0) {
  const statsTimer = setInterval(
    () => void logStats('interval'),
    config.statsIntervalHours * 60 * 60 * 1000,
  )
  statsTimer.unref()
}

server.listen(config.port, config.host, () => {
  console.log(
    `[x-loc-cache] listening on http://${config.host}:${config.port} — db ${config.dbPath} ` +
      `(cache ${config.cacheMb}MB, mmap ${config.mmapMb}MB)`,
  )
})

let closing = false
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.on(signal, () => {
    if (closing) return
    closing = true
    console.log(`[x-loc-cache] ${signal} — draining`)
    server.close(() => {
      // Flush the partial window before it is lost. Without this a box that
      // restarts daily would reset the counters just before the interval that
      // would have logged them, and they would never be seen at all.
      void logStats('shutdown').finally(() => {
        db.close()
        process.exit(0)
      })
    })
    // Don't let a hung keep-alive connection block the restart.
    setTimeout(() => {
      db.close()
      process.exit(0)
    }, 5000).unref()
  })
}
