// Shared location cache - request handlers, backend-agnostic. The server never
// talks to X. See CLAUDE.md and README.md; endpoints are listed in both.

import { admitContributions } from './contrib-limit.ts'
import { pickConsensus, type LocationVote } from './consensus.ts'
import type { Db, DbBoundStatement } from './db-types.ts'
import { networkOf } from './network.ts'
import {
  countRange,
  forEachUsernameRange,
  WHOLE_TABLE,
  type ScanPolicy,
} from './scan.ts'

export interface Env {
  DB: Db
  /** Set by node-server.ts: better-sqlite3 holds every request for a distinct
   *  count, so there only walks move /v1/stats. */
  profilesCountedByWalks?: boolean
}

const MAX_BATCH = 100
/** Exported because deploy/backup.ts derives its verification baseline from it. */
export const VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const USERNAME_RE = /^[a-z0-9_]{1,50}$/
const MAX_FIELD_LEN = 60

// Per-username vote cap, a hard ceiling with the oldest evicted. It bounds
// location_votes at profiles x cap; CLAUDE.md, "Why the vote cap has no slack".
const VOTE_CAP = 10

// How long clients are told to keep a /v1/stats answer, and how old a Worker
// lets its count get before a request recounts it.
const STATS_TTL_MS = 180_000

interface Served {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
}

/** A vote as the batch lookup reads it, its label ids resolved to text. */
interface VoteRow {
  username: string
  location: string | null
  source: string | null
  location_accurate: number
  seen_at: number
}

/** What eviction needs to pick a vote and delete it. */
interface VoteStamp {
  username: string
  client_id: string
  net: number | null
  seen_at: number
}

/** Who sent a contribution: the install's own id, and its network's bucket. */
interface Sender {
  clientId: string
  net: number | null
}

// Helpers
function cors(resp: Response): Response {
  resp.headers.set('Access-Control-Allow-Origin', '*')
  resp.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  resp.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  resp.headers.set('Access-Control-Max-Age', '86400')
  return resp
}

function json(data: unknown, status = 200): Response {
  return cors(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' },
    }),
  )
}

function normUser(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const s = u.trim().toLowerCase()
  return USERNAME_RE.test(s) ? s : null
}

function sanitizeField(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  return s ? s.slice(0, MAX_FIELD_LEN) : null
}

function toLocationVote(r: VoteRow): LocationVote {
  return {
    location: r.location,
    source: r.source,
    locationAccurate: r.location_accurate !== 0,
    seenAt: r.seen_at,
  }
}

/** Rows affected by a `run()`, across both backends: better-sqlite3 returns
 *  `{ changes }`, D1 `{ meta: { changes } }`. Unrecognised shapes give 0. */
function rowsChanged(result: unknown): number {
  if (typeof result !== 'object' || result === null) return 0
  const direct = (result as { changes?: unknown }).changes
  if (typeof direct === 'number') return direct
  const meta = (result as { meta?: { changes?: unknown } }).meta
  if (typeof meta?.changes === 'number') return meta.changes
  return 0
}

function groupByUsername<T extends { username: string }>(
  rows: T[],
): Map<string, T[]> {
  const byUser = new Map<string, T[]>()
  for (const r of rows) {
    const list = byUser.get(r.username)
    if (list) list.push(r)
    else byUser.set(r.username, [r])
  }
  return byUser
}

/** Each username's consensus over the votes it has now: retention and the cap
 *  delete votes, so the answer follows them with nothing to recompute. */
function servedFrom(rows: VoteRow[]): Served[] {
  const served: Served[] = []
  for (const [u, votes] of groupByUsername(rows)) {
    const c = pickConsensus(votes.map(toLocationVote))
    if (!c) continue
    served.push({
      u,
      loc: c.location,
      src: c.source,
      acc: c.locationAccurate,
      conf: c.confidence,
    })
  }
  return served
}

// Handlers
async function handleBatch(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    usernames?: unknown
  } | null
  const raw = Array.isArray(body?.usernames) ? body!.usernames : []
  const names = [
    ...new Set(raw.map(normUser).filter((x): x is string => x !== null)),
  ].slice(0, MAX_BATCH)
  if (names.length === 0) return json({ profiles: [] })

  // LEFT JOINs: a vote whose location or source X left empty holds NULL there,
  // and is still a vote.
  const placeholders = names.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT v.username, loc.text AS location, src.text AS source,
            v.location_accurate, v.seen_at
       FROM location_votes v
       LEFT JOIN labels loc ON loc.id = v.location
       LEFT JOIN labels src ON src.id = v.source
      WHERE v.username IN (${placeholders})`,
  )
    .bind(...names)
    .all<VoteRow>()

  return json({ profiles: servedFrom(results ?? []) })
}

// Usernames with a vote and when they were counted. Module state, so on
// Workers it is per isolate.
let counted: { profiles: number; at: number } | null = null

/** The memo outlives a test otherwise, and the next one would read its number. */
export function __resetStats(): void {
  counted = null
}

/** Null when a request has to count. A Worker recounts an old number, as D1
 *  counts off the isolate's thread; node-server.ts counts before it listens. */
function servableCount(env: Env): number | null {
  if (counted === null) return null
  const isStale =
    !env.profilesCountedByWalks && Date.now() - counted.at >= STATS_TTL_MS
  return isStale ? null : counted.profiles
}

/** How many accounts the cache can answer for. */
async function handleStats(env: Env): Promise<Response> {
  let profiles = servableCount(env)
  if (profiles === null) {
    const { results } = await env.DB.prepare(
      'SELECT COUNT(DISTINCT username) AS n FROM location_votes',
    ).all<{ n: number }>()
    profiles = results?.[0]?.n ?? 0
    counted = { profiles, at: Date.now() }
  }
  const resp = json({ profiles })
  // The client re-asks on a timer while its popup is open; this is what keeps
  // most of those off the network entirely.
  resp.headers.set('Cache-Control', `public, max-age=${STATS_TTL_MS / 1000}`)
  return resp
}

interface ParsedVote {
  u: string
  loc: string | null
  src: string | null
  acc: number
}

/** Untrusted input from an install we cannot identify: anything unrecognisable
 *  is dropped rather than rejected. */
export function parseContribution(body: unknown): ParsedVote[] {
  const rec = (body ?? {}) as { entries?: unknown }
  const rawEntries = Array.isArray(rec.entries) ? rec.entries : []
  const parsed: ParsedVote[] = []
  for (const e of rawEntries.slice(0, MAX_BATCH)) {
    if (!e || typeof e !== 'object') continue
    const entry = e as Record<string, unknown>
    const u = normUser(entry.u)
    if (!u) continue
    parsed.push({
      u,
      loc: sanitizeField(entry.loc),
      src: sanitizeField(entry.src),
      acc: entry.acc === false ? 0 : 1,
    })
  }
  return parsed
}

/** Newest first; an exact tie goes by client_id so a rerun evicts the same. */
function newestFirst(a: VoteStamp, b: VoteStamp): number {
  if (a.seen_at !== b.seen_at) return b.seen_at - a.seen_at
  return a.client_id < b.client_id ? -1 : 1
}

/** Every vote after the newest from its network. NULL is no network we know,
 *  so two NULL votes are never repeats of each other. */
function repeatsOfNetwork(newest: VoteStamp[]): Set<VoteStamp> {
  const seen = new Set<number>()
  const repeats = new Set<VoteStamp>()
  for (const v of newest) {
    if (v.net === null) continue
    if (seen.has(v.net)) repeats.add(v)
    seen.add(v.net)
  }
  return repeats
}

/** Per username: one vote per network, its newest, then the newest VOTE_CAP of
 *  those. Without the first step, ten fresh ids on one machine fill the window. */
function votesToEvict(rows: VoteStamp[]): VoteStamp[] {
  const evictions: VoteStamp[] = []
  for (const list of groupByUsername(rows).values()) {
    list.sort(newestFirst)
    const repeats = repeatsOfNetwork(list)
    const kept = list.filter((v) => !repeats.has(v))
    evictions.push(...repeats, ...kept.slice(VOTE_CAP))
  }
  return evictions
}

// MAX: a clock stepping back must not lower used_at below a vote already written.
const UPSERT_LABEL = `INSERT INTO labels (text, used_at) VALUES (?, ?)
  ON CONFLICT(text) DO UPDATE SET used_at = MAX(used_at, excluded.used_at)`

// net is updated too: a client that moved networks takes its vote with it.
const UPSERT_VOTE = `INSERT INTO location_votes
    (username, client_id, location, source, location_accurate, seen_at, net)
  VALUES (?, ?, (SELECT id FROM labels WHERE text = ?),
          (SELECT id FROM labels WHERE text = ?), ?, ?, ?)
  ON CONFLICT(username, client_id) DO UPDATE SET
    location = excluded.location,
    source = excluded.source,
    location_accurate = excluded.location_accurate,
    seen_at = excluded.seen_at,
    net = excluded.net`

/** Labels, then the votes naming them, in one batch: a vote write lifts its
 *  labels' used_at to its seen_at atomically, which retention's labels DELETE needs. */
function voteWrites(
  env: Env,
  from: Sender,
  votes: ParsedVote[],
  now: number,
): DbBoundStatement[] {
  const texts = new Set(
    votes.flatMap((v) => [v.loc, v.src]).filter((t) => t !== null),
  )
  return [
    ...[...texts].map((t) => env.DB.prepare(UPSERT_LABEL).bind(t, now)),
    ...votes.map((v) =>
      env.DB.prepare(UPSERT_VOTE).bind(
        v.u,
        from.clientId,
        v.loc,
        v.src,
        v.acc,
        now,
        from.net,
      ),
    ),
  ]
}

/** Trims each username to one vote per network and VOTE_CAP in all, in a
 *  batch of its own. */
async function evict(env: Env, usernames: string[]): Promise<void> {
  const ph = usernames.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT username, client_id, net, seen_at FROM location_votes
      WHERE username IN (${ph})`,
  )
    .bind(...usernames)
    .all<VoteStamp>()
  const evictions = votesToEvict(results ?? [])
  if (evictions.length === 0) return
  await env.DB.batch(
    evictions.map((ev) =>
      env.DB.prepare(
        // seen_at too: on D1 the install may re-send between the read and here.
        'DELETE FROM location_votes WHERE username = ? AND client_id = ? AND seen_at = ?',
      ).bind(ev.username, ev.client_id, ev.seen_at),
    ),
  )
}

async function handleContribute(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    clientId?: unknown
  } | null
  const cid =
    typeof body?.clientId === 'string' ? body.clientId.slice(0, 64) : null
  if (!cid) return json({ ok: true })

  const now = Date.now()
  const parsed = parseContribution(body)
  if (parsed.length === 0) return json({ ok: true })

  // Charge the distinct handles to this client's budget; anything over it is
  // dropped silently (see contrib-limit.ts and CLAUDE.md).
  const allowed = new Set(
    admitContributions(cid, [...new Set(parsed.map((v) => v.u))], now),
  )
  const votes = parsed.filter((v) => allowed.has(v.u))
  if (votes.length === 0) return json({ ok: true })

  // Cloudflare sets the header and a client cannot; node-server.ts overwrites
  // it with the connection's address for the same reason.
  const from = {
    clientId: cid,
    net: networkOf(req.headers.get('cf-connecting-ip')),
  }
  await env.DB.batch(voteWrites(env, from, votes, now))
  await evict(env, [...new Set(votes.map((v) => v.u))])
  return json({ ok: true })
}

// Router. The table is exported so the Node server's stats count a request
// under the route that served it, not under its path.
export const ROUTES = [
  { route: 'lookup', method: 'POST', path: '/v1/loc/batch' },
  { route: 'contribution', method: 'POST', path: '/v1/loc' },
  { route: 'stats', method: 'GET', path: '/v1/stats' },
] as const

export type Route = (typeof ROUTES)[number]['route']

/** Null for a method and path no route serves, which the router answers 404. */
export function routeOf(method: string, pathname: string): Route | null {
  const match = ROUTES.find((r) => r.method === method && r.path === pathname)
  return match?.route ?? null
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }))
    }
    const url = new URL(req.url)
    try {
      switch (routeOf(req.method, url.pathname)) {
        case 'lookup':
          return await handleBatch(req, env)
        case 'contribution':
          return await handleContribute(req, env)
        case 'stats':
          return await handleStats(env)
        case null:
          return cors(new Response('Not found', { status: 404 }))
      }
    } catch {
      return json({ error: 'internal' }, 500)
    }
  },

  // Retention cleanup on the Worker's cron. `_controller` / `_ctx` stay loose
  // so this file needs no workers-types.
  async scheduled(
    _controller: unknown,
    env: Env,
    _ctx?: unknown,
  ): Promise<Pruned> {
    return pruneExpired(env, Date.now(), WHOLE_TABLE)
  },
}

export interface Pruned {
  /** Votes past the window, deleted by this pass. */
  deleted: number
  /** Usernames with a vote left, which /v1/stats serves until the next pass. */
  profiles: number
}

/** Retention, the only thing that ages votes out - see CLAUDE.md. */
export async function pruneExpired(
  env: Env,
  now: number,
  policy: ScanPolicy,
): Promise<Pruned> {
  const cutoff = now - VOTE_RETENTION_MS
  let deleted = 0
  let profiles = 0
  await forEachUsernameRange(env.DB, policy, async (after, upTo) => {
    deleted += rowsChanged(await deleteExpiredVotes(env, after, upTo, cutoff))
    profiles += (await countRange(env.DB, after, upTo)).profiles
  })
  // Only once the walk is complete: every vote left then has seen_at >= cutoff,
  // and writing it lifted its labels' used_at to at least that (voteWrites).
  await env.DB.prepare('DELETE FROM labels WHERE used_at < ?')
    .bind(cutoff)
    .run()
  counted = { profiles, at: Date.now() }
  return { deleted, profiles }
}

/** Sets /v1/stats between retention passes from a walk of its own. A username
 *  first voted on mid-walk is missed until the next walk unless its range is ahead. */
export async function recountProfiles(
  env: Env,
  policy: ScanPolicy,
): Promise<number> {
  let profiles = 0
  await forEachUsernameRange(env.DB, policy, async (after, upTo) => {
    profiles += (await countRange(env.DB, after, upTo)).profiles
  })
  counted = { profiles, at: Date.now() }
  return profiles
}

function deleteExpiredVotes(
  env: Env,
  after: string,
  upTo: string,
  cutoff: number,
): Promise<unknown> {
  return env.DB.prepare(
    'DELETE FROM location_votes WHERE username > ? AND username <= ? AND seen_at < ?',
  )
    .bind(after, upTo, cutoff)
    .run()
}
