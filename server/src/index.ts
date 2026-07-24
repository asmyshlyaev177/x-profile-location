// Shared location cache — Cloudflare Worker + D1.
//
// The server never talks to X. Clients fetch location from X's AboutAccountQuery
// themselves (rate-limited, on hover) and contribute the result here; other
// clients read it back cheaply, skipping the X call. Bio/displayName are NOT
// handled here — clients get those free from the timeline.
//
// Endpoints (all CORS-open, no credentials):
//   POST /v1/loc/batch  { usernames: string[] }        -> { profiles: Served[] }
//   POST /v1/loc        { clientId, entries: Vote[] }   -> { ok: true }

import { pickConsensus, type LocationVote } from './consensus'

export interface Env {
  DB: D1Database
}

const MAX_BATCH = 100
const VOTE_RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // 60 days
const REVALIDATE_RATE = 0.05 // ~5% of served rows ask the client to re-verify
const USERNAME_RE = /^[a-z0-9_]{1,50}$/
const MAX_FIELD_LEN = 60

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
  const votes: {
    u: string
    loc: string | null
    src: string | null
    acc: number
  }[] = []
  const affected = new Set<string>()
  for (const e of rawEntries.slice(0, MAX_BATCH)) {
    if (!e || typeof e !== 'object') continue
    const rec = e as Record<string, unknown>
    const u = normUser(rec.u)
    if (!u) continue
    votes.push({
      u,
      loc: sanitizeField(rec.loc),
      src: sanitizeField(rec.src),
      acc: rec.acc === false ? 0 : 1,
    })
    affected.add(u)
  }
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

  // 2. Recompute consensus for every affected username from its live votes.
  const affectedList = [...affected]
  const ph = affectedList.map(() => '?').join(',')
  const { results } = await env.DB.prepare(
    `SELECT username, location, source, location_accurate, seen_at
       FROM location_votes
      WHERE username IN (${ph}) AND seen_at > ?`,
  )
    .bind(...affectedList, now - VOTE_RETENTION_MS)
    .all<VoteRow>()

  const byUser = new Map<string, LocationVote[]>()
  for (const r of results ?? []) {
    const arr = byUser.get(r.username) ?? []
    arr.push({
      location: r.location,
      source: r.source,
      locationAccurate: r.location_accurate !== 0,
      seenAt: r.seen_at,
    })
    byUser.set(r.username, arr)
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

  const profileStmts: D1PreparedStatement[] = []
  for (const u of affectedList) {
    const c = pickConsensus(byUser.get(u) ?? [])
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
    profileStmts.push(
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
  if (profileStmts.length > 0) await env.DB.batch(profileStmts)

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
}
