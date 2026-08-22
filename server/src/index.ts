// Shared location cache — request handlers, backend-agnostic. The server never
// talks to X. See CLAUDE.md and README.md; endpoints are listed in both.

import { admitContributions } from './contrib-limit.ts'
import { pickConsensus, type LocationVote } from './consensus.ts'
import type { Db, DbBoundStatement } from './db-types.ts'

export interface Env {
  DB: Db
}

const MAX_BATCH = 100
/** Exported because deploy/backup.ts derives its verification baseline from it. */
export const VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const USERNAME_RE = /^[a-z0-9_]{1,50}$/
const MAX_FIELD_LEN = 60

// Per-username vote cap, pruned at cap + slack, oldest-first — see "Why the vote
// cap has slack" in CLAUDE.md.
const VOTE_CAP = 10
const VOTE_CAP_SLACK = 5

// How long /v1/stats reuses a count, and how long clients are told to. Not a
// nicety — see "Two queries that look wrong" in CLAUDE.md.
const STATS_TTL_MS = 60_000

interface Served {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
}

interface ProfileRow {
  username: string
  location: string | null
  source: string | null
  location_accurate: number
  location_confidence: number
}

interface VoteRow {
  username: string
  client_id: string
  location: string | null
  source: string | null
  location_accurate: number
  seen_at: number
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

function toServed(r: ProfileRow): Served {
  return {
    u: r.username,
    loc: r.location,
    src: r.source,
    acc: r.location_accurate !== 0,
    conf: r.location_confidence,
  }
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

  const placeholders = names.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT username, location, source, location_accurate, location_confidence
       FROM profiles
      WHERE username IN (${placeholders}) AND location_confidence > 0`,
  )
    .bind(...names)
    .all<ProfileRow>()

  return json({ profiles: (results ?? []).map(toServed) })
}

// The last count and when it was taken. Module state, so on Workers it is per
// isolate — a cold isolate pays for one COUNT, as a restart does on Node.
let counted: { at: number; profiles: number } | null = null

/** The memo outlives a test otherwise, and the next one would read its number. */
export function __resetStats(): void {
  counted = null
}

/** How many accounts the cache can answer for. Unfiltered on purpose — see
 *  "Two queries that look wrong" in CLAUDE.md. */
async function handleStats(env: Env, now: number): Promise<Response> {
  if (counted === null || now - counted.at >= STATS_TTL_MS) {
    const { results } = await env.DB.prepare(
      'SELECT COUNT(*) AS n FROM profiles',
    ).all<{ n: number }>()
    counted = { at: now, profiles: results?.[0]?.n ?? 0 }
  }
  const resp = json({ profiles: counted.profiles })
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

/** Votes grouped by username and trimmed to VOTE_CAP, newest kept. */
export function groupAndCapVotes(rows: VoteRow[]): {
  byUser: Map<string, VoteRow[]>
  evictions: VoteRow[]
} {
  const byUser = new Map<string, VoteRow[]>()
  for (const r of rows) {
    const arr = byUser.get(r.username) ?? []
    arr.push(r)
    byUser.set(r.username, arr)
  }
  const evictions: VoteRow[] = []
  for (const list of byUser.values()) {
    if (list.length <= VOTE_CAP + VOTE_CAP_SLACK) continue
    list.sort((a, b) => b.seen_at - a.seen_at) // newest first
    evictions.push(...list.splice(VOTE_CAP)) // splice mutates the mapped array
  }
  return { byUser, evictions }
}

/** Whether the profile row already says exactly what the new consensus says. */
export function alreadyStored(
  cur: ProfileRow | undefined,
  c: {
    location: string | null
    source: string | null
    locationAccurate: boolean
    confidence: number
  },
): boolean {
  return (
    !!cur &&
    cur.location === c.location &&
    cur.source === c.source &&
    (cur.location_accurate !== 0) === c.locationAccurate &&
    cur.location_confidence === c.confidence
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
  const affected = new Set(votes.map((v) => v.u))
  if (votes.length === 0) return json({ ok: true })

  // 1. Record each client's (latest) vote — one row per (username, client_id).
  await env.DB.batch(
    votes.map((v) =>
      env.DB.prepare(
        `INSERT INTO location_votes
           (username, client_id, location, source, location_accurate, seen_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(username, client_id) DO UPDATE SET
           location = excluded.location,
           source = excluded.source,
           location_accurate = excluded.location_accurate,
           seen_at = excluded.seen_at`,
      ).bind(v.u, cid, v.loc, v.src, v.acc, now),
    ),
  )

  // 2. Recompute consensus from all of a username's votes — no date filter,
  //    see "Two queries that look wrong" in CLAUDE.md.
  const affectedList = [...affected]
  const ph = affectedList.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT username, client_id, location, source, location_accurate, seen_at
       FROM location_votes
      WHERE username IN (${ph})`,
  )
    .bind(...affectedList)
    .all<VoteRow>()

  // 2a. Enforce the per-username cap over the votes just read, so consensus is
  //     taken on what survives and matches the table.
  const { byUser, evictions } = groupAndCapVotes(results ?? [])

  // 3. Current consensus, so an unchanged profile is not rewritten: D1's write
  //    budget is ~50x scarcer than reads, and `updated_at` is never served.
  const { results: curRows } = await env.DB.prepare(
    `SELECT username, location, source, location_accurate, location_confidence
       FROM profiles
      WHERE username IN (${ph})`,
  )
    .bind(...affectedList)
    .all<ProfileRow>()
  const current = new Map<string, ProfileRow>()
  for (const r of curRows ?? []) current.set(r.username, r)

  const writes = [
    ...evictions.map((ev) =>
      env.DB.prepare(
        'DELETE FROM location_votes WHERE username = ? AND client_id = ?',
      ).bind(ev.username, ev.client_id),
    ),
    ...consensusWrites(env, { now, affected: affectedList, byUser, current }),
  ]
  if (writes.length > 0) await env.DB.batch(writes)

  return json({ ok: true })
}

/** One upsert per username whose consensus moved; see `alreadyStored`. */
export function consensusWrites(
  env: Env,
  ctx: {
    now: number
    affected: string[]
    byUser: Map<string, VoteRow[]>
    current: Map<string, ProfileRow>
  },
): DbBoundStatement[] {
  const writes: DbBoundStatement[] = []
  for (const u of ctx.affected) {
    const c = pickConsensus((ctx.byUser.get(u) ?? []).map(toLocationVote))
    if (!c || alreadyStored(ctx.current.get(u), c)) continue
    writes.push(
      env.DB.prepare(
        `INSERT INTO profiles
           (username, location, source, location_accurate, location_confidence, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(username) DO UPDATE SET
           location = excluded.location,
           source = excluded.source,
           location_accurate = excluded.location_accurate,
           location_confidence = excluded.location_confidence,
           updated_at = excluded.updated_at`,
      ).bind(
        u,
        c.location,
        c.source,
        c.locationAccurate ? 1 : 0,
        c.confidence,
        ctx.now,
      ),
    )
  }
  return writes
}

// Router
export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    if (req.method === 'OPTIONS') {
      return cors(new Response(null, { status: 204 }))
    }
    const url = new URL(req.url)
    try {
      if (req.method === 'POST' && url.pathname === '/v1/loc/batch') {
        return await handleBatch(req, env)
      }
      if (req.method === 'POST' && url.pathname === '/v1/loc') {
        return await handleContribute(req, env)
      }
      if (req.method === 'GET' && url.pathname === '/v1/stats') {
        return await handleStats(env, Date.now())
      }
      return cors(new Response('Not found', { status: 404 }))
    } catch {
      return json({ error: 'internal' }, 500)
    }
  },

  // Retention cleanup, the only thing that ages votes out — see CLAUDE.md.
  // `_controller` / `_ctx` stay loose so this file needs no workers-types.
  async scheduled(
    _controller: unknown,
    env: Env,
    _ctx?: unknown,
  ): Promise<number> {
    const result = await env.DB.prepare(
      'DELETE FROM location_votes WHERE seen_at < ?',
    )
      .bind(Date.now() - VOTE_RETENTION_MS)
      .run()

    // Then the profiles those votes were the last evidence for; `profiles` can
    // shrink, which deploy/backup.ts allows for. See CLAUDE.md.
    await env.DB.prepare(
      `DELETE FROM profiles
        WHERE NOT EXISTS (
                SELECT 1 FROM location_votes v WHERE v.username = profiles.username
              )`,
    ).run()

    return rowsChanged(result)
  },
}
