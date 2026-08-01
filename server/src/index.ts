// Shared location cache — request handlers, backend-agnostic.
//
// The server never talks to X. Clients fetch location from X's AboutAccountQuery
// themselves (rate-limited, on hover) and contribute the result here; other
// clients read it back cheaply, skipping the X call. Bio/displayName are NOT
// handled here — clients get those free from the timeline.
//
// Endpoints (all CORS-open, no credentials):
//   POST /v1/loc/batch  { usernames: string[] }        -> { profiles: Served[] }
//   POST /v1/loc        { clientId, entries: Vote[] }   -> { ok: true }
//
// This module runs unmodified on two backends — Cloudflare Workers + D1
// (wrangler.toml) and Node + SQLite on a VPS (node-server.ts) — because it only
// ever touches `Env.DB` through the minimal interface in db-types.ts, which both
// satisfy. Keep it that way: no Worker globals, no node: imports.

import { admitContributions } from './contrib-limit.ts'
import { pickConsensus, type LocationVote } from './consensus.ts'
import type { Db, DbBoundStatement } from './db-types.ts'

export interface Env {
  DB: Db
}

const MAX_BATCH = 100
const VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const REVALIDATE_RATE = 0.05 // ~5% of served rows ask the client to re-verify
const USERNAME_RE = /^[a-z0-9_]{1,50}$/
const MAX_FIELD_LEN = 60

// Per-username vote cap. location_votes is keyed (username, client_id), so
// without a cap it grows as users × profiles-each-user-sees — the only
// superlinear term in the system, and the first thing that would exhaust a small
// VPS disk. Capping bounds it at distinct-profiles × VOTE_CAP instead, flat in
// user count.
//
// Pruning is not done at exactly VOTE_CAP: once a popular handle sits on the cap,
// every further contribution would evict one row, doubling writes on the hot path
// forever. Instead rows are allowed to pile up to VOTE_CAP + VOTE_CAP_SLACK and
// then pruned back to VOTE_CAP in one go, amortising the delete over SLACK votes.
//
// Eviction is oldest-first, which is also the behaviour you want on merit: the
// surviving window is the most recent observers, so a relocation propagates
// instead of being outvoted forever by stale votes. The cost is that poisoning
// gets cheaper — a flood of forged client ids only has to fill the window rather
// than out-number every honest vote ever cast. The client's confidence threshold
// (MIN_CONFIDENCE_KEY, src/scripts/shared-cache.ts) is the backstop there, and
// admitContributions below raises the price of manufacturing those ids.
const VOTE_CAP = 10
const VOTE_CAP_SLACK = 5

interface Served {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
  rev?: boolean
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
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

/**
 * Rows affected by a `run()`, across both backends. The two drivers report it
 * differently — better-sqlite3 returns `{ changes }`, D1 nests it as
 * `{ meta: { changes } }` — and db-types.ts deliberately types `run()` as
 * `unknown` rather than committing the shared handlers to either shape. Returns
 * 0 for anything unrecognised, so a driver change degrades the log line rather
 * than the cleanup.
 */
function rowsChanged(result: unknown): number {
  if (typeof result !== 'object' || result === null) return 0
  const direct = (result as { changes?: unknown }).changes
  if (typeof direct === 'number') return direct
  const meta = (result as { meta?: { changes?: unknown } }).meta
  if (typeof meta?.changes === 'number') return meta.changes
  return 0
}

function toServed(r: ProfileRow): Served {
  const served: Served = {
    u: r.username,
    loc: r.location,
    src: r.source,
    acc: r.location_accurate !== 0,
    conf: r.location_confidence,
  }
  if (Math.random() < REVALIDATE_RATE) served.rev = true
  return served
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
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

async function handleContribute(req: Request, env: Env): Promise<Response> {
  const body = (await req.json().catch(() => null)) as {
    clientId?: unknown
    entries?: unknown
  } | null
  const cid =
    typeof body?.clientId === 'string' ? body.clientId.slice(0, 64) : null
  const rawEntries = Array.isArray(body?.entries) ? body!.entries : []
  if (!cid || rawEntries.length === 0) return json({ ok: true })

  const now = Date.now()
  const parsed: {
    u: string
    loc: string | null
    src: string | null
    acc: number
  }[] = []
  for (const e of rawEntries.slice(0, MAX_BATCH)) {
    if (!e || typeof e !== 'object') continue
    const rec = e as Record<string, unknown>
    const u = normUser(rec.u)
    if (!u) continue
    parsed.push({
      u,
      loc: sanitizeField(rec.loc),
      src: sanitizeField(rec.src),
      acc: rec.acc === false ? 0 : 1,
    })
  }

  // Charge the distinct handles to this client's budget and keep only what it
  // can still afford (see contrib-limit.ts). Anything over budget is dropped
  // silently and the response is still `{ ok: true }`: contributions are
  // best-effort and the client ignores the body either way, so there is no
  // reason to hand a poisoner a signal telling it when to rotate its id.
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

  // 2. Recompute consensus for every affected username from all its votes.
  //    No date filter here: the scheduled() retention job physically deletes
  //    votes older than VOTE_RETENTION_MS, so every row still in the table is
  //    within the window by construction. That makes deletion the single source
  //    of truth for the 60-day bound (rather than a filter here *and* a delete)
  //    and lets the query ride the (username, client_id) primary key directly.
  const affectedList = [...affected]
  const ph = affectedList.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT username, client_id, location, source, location_accurate, seen_at
       FROM location_votes
      WHERE username IN (${ph})`,
  )
    .bind(...affectedList)
    .all<VoteRow>()

  const byUser = new Map<string, VoteRow[]>()
  for (const r of results ?? []) {
    const arr = byUser.get(r.username) ?? []
    arr.push(r)
    byUser.set(r.username, arr)
  }

  // 2a. Enforce the per-username cap (see VOTE_CAP). Rows to drop are computed
  //     from the votes we just read — no extra SELECT — and consensus below is
  //     then taken over what *survives*, so the served profile always reflects
  //     the rows that remain in the table.
  const evictions: VoteRow[] = []
  for (const list of byUser.values()) {
    if (list.length <= VOTE_CAP + VOTE_CAP_SLACK) continue
    list.sort((a, b) => b.seen_at - a.seen_at) // newest first
    evictions.push(...list.splice(VOTE_CAP)) // splice mutates the mapped array
  }

  // 3. Current consensus for the affected users, so we can skip rewriting a
  //    profile row whose value hasn't actually changed (e.g. a client
  //    re-affirming the same location in a later session). Trading this read for
  //    a skipped write is a win: D1's write budget is ~50x scarcer than reads,
  //    and `updated_at` is write-only (never served), so a skipped bump is inert.
  const { results: curRows } = await env.DB.prepare(
    `SELECT username, location, source, location_accurate, location_confidence
       FROM profiles
      WHERE username IN (${ph})`,
  )
    .bind(...affectedList)
    .all<ProfileRow>()
  const current = new Map<string, ProfileRow>()
  for (const r of curRows ?? []) current.set(r.username, r)

  const writes: DbBoundStatement[] = []
  for (const ev of evictions) {
    writes.push(
      env.DB.prepare(
        'DELETE FROM location_votes WHERE username = ? AND client_id = ?',
      ).bind(ev.username, ev.client_id),
    )
  }

  for (const u of affectedList) {
    const c = pickConsensus((byUser.get(u) ?? []).map(toLocationVote))
    if (!c) continue
    const cur = current.get(u)
    if (
      cur &&
      cur.location === c.location &&
      cur.source === c.source &&
      (cur.location_accurate !== 0) === c.locationAccurate &&
      cur.location_confidence === c.confidence
    ) {
      continue // unchanged consensus — no write needed
    }
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
        now,
      ),
    )
  }
  if (writes.length > 0) await env.DB.batch(writes)

  return json({ ok: true })
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
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
      return cors(new Response('Not found', { status: 404 }))
    } catch {
      return json({ error: 'internal' }, 500)
    }
  },

  // Retention cleanup. D1 never evicts data on its own, so location_votes would
  // grow without bound. This physically deletes votes older than
  // VOTE_RETENTION_MS and is now the *only* thing that ages votes out — the
  // consensus recompute above reads whatever remains. Runs on the cron schedule
  // in wrangler.toml. One DELETE is issued; the table has no seen_at index, so
  // it's a full scan that spends the abundant read budget — deliberately traded
  // against not taxing every insert's ~50x scarcer write budget with an index.
  // `_controller` / `_ctx` are typed loosely rather than as Cloudflare's
  // ScheduledController / ExecutionContext so this file needs no workers-types;
  // both are unused, and node-server.ts calls it with nothing.
  //
  // Returns the number of votes deleted, which node-server.ts logs. Workers
  // ignores a scheduled() return value, so this costs the Worker build nothing.
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
    return rowsChanged(result)
  },
}
