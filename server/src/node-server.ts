// Node entry point: adapts node:http to index.ts's fetch handler and owns what
// Workers gave for free (cron, body limit, per-IP rate limit). See README.md.

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

// Config
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
  // Only honour X-Forwarded-For when told to: a directly-exposed server must
  // not let clients forge their own identity.
  trustProxy: bool('XLOC_TRUST_PROXY', true),
}

// Rate limiting — a crude fixed window per IP, generous because one IP is not
// one user. See "The Node deployment" in CLAUDE.md before lowering it.
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
    // The *last* entry: proxies append the peer address, so the first is
    // attacker-controlled and would buy a fresh bucket per request.
    const hops = xff?.split(',') ?? []
    const last = hops[hops.length - 1]?.trim()
    if (last) return last
  }
  return req.socket.remoteAddress ?? 'unknown'
}

// node:http <-> fetch adapter
const BODYLESS = new Set(['GET', 'HEAD', 'OPTIONS', 'DELETE'])

/** Methods `new Request` cannot represent, answered 405 rather than carried
 *  into the adapter. All three listed: node intercepts some of them first. */
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

function toHeaders(req: IncomingMessage): Headers {
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v)
    else if (value !== undefined) headers.set(key, value)
  }
  return headers
}

/** Null when the request has no fetch equivalent, which the caller answers 400.
 *  Scanners live in that gap — malformed input, not a server fault. */
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

/** Answer 413 without reading the rest of the upload; the request is destroyed
 *  only once the response is on the wire, or it reads as a crash. */
function rejectTooLarge(req: IncomingMessage, res: ServerResponse): void {
  res.once('finish', () => req.destroy())
  plain(res, 413, 'Payload Too Large', { connection: 'close' })
}

// Boot
mkdirSync(dirname(config.dbPath), { recursive: true })
const db: SqliteDb = openDatabase({
  path: config.dbPath,
  cacheMb: config.cacheMb,
  mmapMb: config.mmapMb,
})
const env: Env = { DB: db }
const stats = new Stats()

/** Distinct anonymous installs that contributed in the last `hours`: a full
 *  scan, once a day, never on a request path. See CLAUDE.md. */
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

/** One JSON line per window; counters are drained here, so each line describes
 *  its own window rather than everything since boot. */
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
      // Liveness probe for systemd/Caddy, uncounted: at one probe per 30s it
      // would drown the numbers that matter.
      if (req.method === 'GET' && req.url === '/healthz') {
        return plain(res, 200, 'ok')
      }
      // Retry-After is not politeness: without it a limited client retries into
      // the window and trips shared-cache.ts's breaker for ten minutes.
      const retryAfter = rateLimited(clientIp(req), Date.now())
      if (retryAfter > 0) {
        stats.noteRateLimited()
        return plain(res, 429, 'Too Many Requests', {
          'retry-after': String(retryAfter),
        })
      }
      // Counted as `other` with the 404s: scanner traffic is a number to have,
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

// Retention: an interval, run once shortly after boot so a box that reboots
// daily still prunes. unref() keeps it from holding the process open.
const retentionMs = config.retentionHours * 60 * 60 * 1000
async function runRetention(): Promise<void> {
  const startedAt = Date.now()
  try {
    const deleted = await worker.scheduled(null, env)
    sweepBuckets(Date.now())
    db.raw.pragma('wal_checkpoint(TRUNCATE)')
    // Logged even for `deleted 0`: without a success line, an absent log cannot
    // be told from a timer that never fired.
    console.log(
      `[x-loc-cache] retention: deleted ${deleted} vote(s) in ${Date.now() - startedAt}ms`,
    )
  } catch (err) {
    console.error('[x-loc-cache] retention failed:', err)
  }
}
setInterval(() => void runRetention(), retentionMs).unref()
setTimeout(() => void runRetention(), 60_000).unref()
// Buckets are also swept between retention runs; the map is small but the sweep
// is O(n) and there is no reason to let it sit for a whole day.
setInterval(() => sweepBuckets(Date.now()), config.rateWindowMs * 10).unref()

// Usage stats, on their own interval so the reporting cadence can be changed
// without touching how often data is pruned.
if (config.statsIntervalHours > 0) {
  setInterval(
    () => void logStats('interval'),
    config.statsIntervalHours * 60 * 60 * 1000,
  ).unref()
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
      // Flush the partial window: a box restarting daily would otherwise reset
      // the counters just before the interval that would have logged them.
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
