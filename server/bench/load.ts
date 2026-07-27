// Load benchmark for the SQLite backend.
//
//   node --experimental-strip-types bench/load.ts [--users N] [--profiles N] [--keep]
//
// Builds a database the size a real deployment would reach, then times every
// operation the server actually performs against it — the two request handlers,
// the retention pass, and the stats queries. Prints p50/p95/p99, because a mean
// hides exactly the stalls that matter on a synchronous driver: better-sqlite3
// blocks the event loop, so a slow query is not one slow request, it is every
// concurrent request waiting behind it.
//
// Defaults model ~10k users. Sizing rationale in DEFAULTS below.

import { rmSync } from 'node:fs'
import { statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import worker, { type Env } from '../src/index.ts'
import { openDatabase, type SqliteDb } from '../src/sqlite.ts'

const DEFAULTS = {
  // Distinct anonymous installs. The figure the sizing question is asked in.
  users: 10_000,
  // Distinct handles ever looked up. Not users × handles-per-user: timelines
  // overlap heavily, so this grows far slower than the user count. 200 distinct
  // handles per user with ~90% overlap across the population lands here.
  profiles: 2_000_000,
  // Votes are capped at 10 per handle (VOTE_CAP), but most handles are seen by
  // one or two installs. The generator below averages ~2.4, giving ~4.8M rows.
  voteAvg: 2.4,
}

const args = process.argv.slice(2)
function arg(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(args[i + 1])
}
const USERS = arg('users', DEFAULTS.users)
const PROFILES = arg('profiles', DEFAULTS.profiles)
const KEEP = args.includes('--keep')

const DB_PATH = join(tmpdir(), `x-loc-bench-${PROFILES}-${USERS}.db`)
const DAY = 24 * 60 * 60 * 1000
const VOTE_RETENTION_DAYS = 60

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------
const COUNTRIES = [
  'United States',
  'Japan',
  'Germany',
  'Brazil',
  'India',
  'Nigeria',
  'South Asia',
  'Europe',
  'United Kingdom',
  'France',
  null,
]
const SOURCES = ['web', 'Japan Android App', 'India App Store', null]

function generate(db: SqliteDb): void {
  const raw = db.raw
  const t0 = Date.now()

  raw.exec('BEGIN')
  const insProfile = raw.prepare(
    'INSERT OR IGNORE INTO profiles (username, location, source, location_accurate, location_confidence, updated_at)' +
      ' VALUES (?, ?, ?, ?, ?, ?)',
  )
  const insVote = raw.prepare(
    'INSERT OR IGNORE INTO location_votes (username, client_id, location, source, location_accurate, seen_at)' +
      ' VALUES (?, ?, ?, ?, ?, ?)',
  )

  const now = Date.now()
  let votes = 0
  for (let i = 0; i < PROFILES; i++) {
    const username = `user${i}`
    const loc = COUNTRIES[i % COUNTRIES.length]!
    const src = SOURCES[i % SOURCES.length]!
    // seen_at spread across the retention window, so a retention pass deletes
    // roughly one day's worth — the steady state, not a first-run backlog.
    const seenAt = now - Math.floor((i % VOTE_RETENTION_DAYS) * DAY)

    // A fifth of handles are "popular" and sit at the vote cap; the rest have
    // one or two. Averages ~2.4 votes/handle.
    const nVotes = i % 20 === 0 ? 10 : i % 3 === 0 ? 3 : 2
    insProfile.run(username, loc, src, 1, Math.min(nVotes, 10), seenAt)
    for (let j = 0; j < nVotes; j++) {
      insVote.run(
        username,
        `client-${(i * 7 + j) % USERS}`,
        loc,
        src,
        1,
        seenAt,
      )
      votes++
    }
    if (i % 250_000 === 0 && i > 0) {
      raw.exec('COMMIT')
      raw.exec('BEGIN')
      process.stdout.write(`  ${i.toLocaleString()} profiles…\r`)
    }
  }
  raw.exec('COMMIT')
  raw.exec('ANALYZE')
  console.log(
    `  generated ${PROFILES.toLocaleString()} profiles / ${votes.toLocaleString()} votes ` +
      `in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
interface Result {
  name: string
  n: number
  p50: number
  p95: number
  p99: number
  max: number
}

async function time(
  name: string,
  n: number,
  fn: (i: number) => Promise<unknown>,
): Promise<Result> {
  const samples: number[] = []
  for (let i = 0; i < n; i++) {
    const t = performance.now()
    await fn(i)
    samples.push(performance.now() - t)
  }
  samples.sort((a, b) => a - b)
  const at = (q: number) =>
    samples[Math.min(samples.length - 1, Math.floor(samples.length * q))]!
  return {
    name,
    n,
    p50: at(0.5),
    p95: at(0.95),
    p99: at(0.99),
    max: samples[samples.length - 1]!,
  }
}

const post = (path: string, body: unknown) =>
  new Request(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })

function names(start: number, count: number, missRate = 0): string[] {
  return Array.from({ length: count }, (_, k) => {
    const i = (start * 97 + k * 7919) % PROFILES
    return k / count < missRate ? `absent${i}` : `user${i}`
  })
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const fresh = (() => {
  try {
    return statSync(DB_PATH).size === 0
  } catch {
    return true
  }
})()

console.log(`db: ${DB_PATH}${fresh ? ' (generating)' : ' (reusing)'}`)
const db = openDatabase({ path: DB_PATH, cacheMb: 256, mmapMb: 512 })
const env: Env = { DB: db }
if (fresh) generate(db)

const sizeMb = statSync(DB_PATH).size / (1024 * 1024)
console.log(
  `size: ${sizeMb.toFixed(0)} MB  |  page cache: 256 MB  |  users: ${USERS.toLocaleString()}\n`,
)

const results: Result[] = []

// Cold: first touch after open, before the page cache holds anything.
results.push(
  await time('lookup 100 names (cold cache)', 20, (i) =>
    worker.fetch(post('/v1/loc/batch', { usernames: names(i, 100) }), env),
  ),
)

// Warm: the steady state a running server is in.
for (let i = 0; i < 200; i++) {
  await worker.fetch(post('/v1/loc/batch', { usernames: names(i, 100) }), env)
}

results.push(
  await time('lookup 100 names (all hits)', 300, (i) =>
    worker.fetch(post('/v1/loc/batch', { usernames: names(i, 100) }), env),
  ),
)
results.push(
  await time('lookup 100 names (50% miss)', 300, (i) =>
    worker.fetch(post('/v1/loc/batch', { usernames: names(i, 100, 0.5) }), env),
  ),
)
results.push(
  await time('contribute 50 entries', 200, (i) =>
    worker.fetch(
      post('/v1/loc', {
        clientId: `bench-${i % USERS}`,
        entries: names(i, 50).map((u) => ({
          u,
          loc: 'Japan',
          src: 'web',
          acc: true,
        })),
      }),
      env,
    ),
  ),
)

// Stats queries — full scans, no index. The reason this benchmark exists.
results.push(
  await time('stats: COUNT(DISTINCT client_id) 24h', 5, async () => {
    await db
      .prepare(
        'SELECT COUNT(DISTINCT client_id) AS n FROM location_votes WHERE seen_at >= ?',
      )
      .bind(Date.now() - DAY)
      .all()
  }),
)
results.push(
  await time('stats: COUNT(*) both tables', 5, async () => {
    await db
      .prepare(
        'SELECT (SELECT COUNT(*) FROM profiles) AS profiles, (SELECT COUNT(*) FROM location_votes) AS votes',
      )
      .all()
  }),
)

// Retention: one pass, deleting ~1 day of the window.
results.push(
  await time('retention pass (daily)', 1, () => worker.scheduled(null, env)),
)

const pad = (s: string, n: number) => s.padEnd(n)
const num = (v: number) => `${v.toFixed(2)}ms`.padStart(10)
console.log(
  pad('operation', 38) +
    'n'.padStart(5) +
    'p50'.padStart(10) +
    'p95'.padStart(10) +
    'p99'.padStart(10) +
    'max'.padStart(10),
)
console.log('-'.repeat(83))
for (const r of results) {
  console.log(
    pad(r.name, 38) +
      String(r.n).padStart(5) +
      num(r.p50) +
      num(r.p95) +
      num(r.p99) +
      num(r.max),
  )
}

console.log(`\nrss: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`)
db.close()
if (!KEEP) rmSync(DB_PATH, { force: true })
