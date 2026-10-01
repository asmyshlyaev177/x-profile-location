// Load benchmark: `node --experimental-strip-types bench/load.ts [--users N]`.
// p50/p95/p99, because a mean hides the event-loop stalls that matter here.

import { constants, copyFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { monitorEventLoopDelay } from 'node:perf_hooks'
import { setTimeout as sleep } from 'node:timers/promises'
import worker, {
  __resetStats,
  type Env,
  pruneExpired,
  VOTE_RETENTION_MS,
} from '../src/index.ts'
import {
  DEFAULT_SQLITE_CONFIG,
  openDatabase,
  type SqliteDb,
  yieldingScan,
} from '../src/sqlite.ts'
import { countTotals } from '../src/stats.ts'

const DEFAULTS = {
  // Distinct anonymous installs. The figure the sizing question is asked in.
  users: 10_000,
  // Distinct handles ever looked up — timelines overlap heavily, so this grows
  // far slower than the user count.
  profiles: 2_000_000,
  // Most handles are seen by one install: on 2026-10-01 production had more
  // than one vote on ~6% of profiles, and none expected past 20%.
  multiPct: 6,
}

const args = process.argv.slice(2)
function arg(name: string, fallback: number): number {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? fallback : Number(args[i + 1])
}
const USERS = arg('users', DEFAULTS.users)
const PROFILES = arg('profiles', DEFAULTS.profiles)
const MULTI_PCT = arg('multi-pct', DEFAULTS.multiPct)
const KEEP = args.includes('--keep')

const DB_PATH = join(
  tmpdir(),
  `x-loc-bench-${PROFILES}-${USERS}-${MULTI_PCT}pct.db`,
)
// Measurements write to a copy: the retention pass and the contributions change
// the data, and --keep promises the next run the same data this one saw.
const RUN_PATH = `${DB_PATH}.run`
const DAY = 24 * 60 * 60 * 1000
const RETENTION_DAYS = VOTE_RETENTION_MS / DAY

// Generation

/** Votes on profile `i`: one, or for MULTI_PCT of profiles two or three, with
 *  one in 20 of those at the vote cap (VOTE_CAP) — ~2.7 on average. */
function votesOn(i: number): number {
  if (i % 100 >= MULTI_PCT) return 1
  const nth = Math.floor(i / 100) * MULTI_PCT + (i % 100)
  if (nth % 20 === 0) return 10
  if (nth % 3 === 0) return 3
  return 2
}

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
    // seen_at spread over the retention window plus one day, so a retention
    // pass deletes that oldest day — the steady state, not a first-run backlog.
    // Without the extra day nothing is past the cutoff and the pass times only
    // its scans.
    const seenAt = now - (i % (RETENTION_DAYS + 1)) * DAY

    const nVotes = votesOn(i)
    insProfile.run(username, loc, src, 1, nVotes, seenAt)
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
  // The day buckets count back from this, so a rerun a week later must use it
  // as "now" too, or its retention pass deletes eight days instead of one.
  raw.exec('CREATE TABLE bench_meta (generated_at INTEGER NOT NULL)')
  raw.prepare('INSERT INTO bench_meta VALUES (?)').run(now)
  raw.exec('ANALYZE')
  console.log(
    `  generated ${PROFILES.toLocaleString()} profiles / ${votes.toLocaleString()} votes ` +
      `in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  )
}

// Timing
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

// Run
const fresh = (() => {
  try {
    return statSync(DB_PATH).size === 0
  } catch {
    return true
  }
})()

console.log(`db: ${DB_PATH}${fresh ? ' (generating)' : ' (reusing)'}`)
// Same knobs as the deployment, so a run can stand in for a smaller box.
const CACHE_MB = Number(
  process.env.XLOC_CACHE_MB ?? DEFAULT_SQLITE_CONFIG.cacheMb,
)
const MMAP_MB = Number(process.env.XLOC_MMAP_MB ?? DEFAULT_SQLITE_CONFIG.mmapMb)
/** With its WAL files: a -wal left by an interrupted run would be replayed
 *  into the next copy. */
function removeRunCopy(): void {
  for (const suffix of ['', '-wal', '-shm']) {
    rmSync(RUN_PATH + suffix, { force: true })
  }
}

if (fresh) {
  const gen = openDatabase({
    path: DB_PATH,
    cacheMb: CACHE_MB,
    mmapMb: MMAP_MB,
  })
  generate(gen)
  gen.close()
}
removeRunCopy()
// A reflink where the filesystem supports one (btrfs, xfs): instant, and the
// copy starts with nothing in the page cache, so "cold cache" needs no root.
copyFileSync(DB_PATH, RUN_PATH, constants.COPYFILE_FICLONE)
const db = openDatabase({ path: RUN_PATH, cacheMb: CACHE_MB, mmapMb: MMAP_MB })
const env: Env = { DB: db }
const generatedAt = (() => {
  try {
    return db.raw
      .prepare('SELECT generated_at FROM bench_meta')
      .pluck()
      .get() as number
  } catch {
    throw new Error(`${DB_PATH} predates bench_meta: delete it to regenerate`)
  }
})()
// One ms past generation: the oldest bucket is then just past the cutoff.
const dataNow = generatedAt + 1

const sizeMb = statSync(RUN_PATH).size / (1024 * 1024)
console.log(
  `size: ${sizeMb.toFixed(0)} MB  |  page cache: ${CACHE_MB} MB  |  mmap: ${MMAP_MB} MB  |  users: ${USERS.toLocaleString()}\n`,
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

// /v1/stats counts profiles in one statement on the request path, at most
// once per STATS_TTL_MS.
results.push(
  await time('GET /v1/stats, count not cached', 5, async () => {
    __resetStats()
    await worker.fetch(new Request('http://localhost/v1/stats'), env)
  }),
)

/** Total time, and the longest the event loop went without a turn: what a
 *  request arriving mid-pass waits behind. */
async function maintenance<T>(
  fn: () => Promise<T>,
): Promise<{ value: T; ms: number; stallMs: number }> {
  const loop = monitorEventLoopDelay({ resolution: 1 })
  loop.enable()
  // It records nothing until its timer first fires, which a pass would delay.
  await sleep(5)
  const startedAt = performance.now()
  const value = await fn()
  const ms = performance.now() - startedAt
  // The monitor records a stall when its timer next fires, not before.
  await sleep(5)
  loop.disable()
  return { value, ms, stallMs: loop.max / 1e6 }
}

// The daily tick, chunked as node-server.ts runs it: the stats line's totals,
// then retention deleting the generator's oldest day.
const statsLine = await maintenance(() =>
  countTotals(db, dataNow, yieldingScan()),
)
const retention = await maintenance(() =>
  pruneExpired(env, dataNow, yieldingScan()),
)
const votesBefore = statsLine.value.votes
const votesDeleted = retention.value

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

for (const [name, run] of [
  ['stats line totals (chunked)', statsLine],
  ['retention pass (chunked)', retention],
] as const) {
  console.log(
    `${pad(name, 38)}total ${num(run.ms)}   longest stall ${num(run.stallMs)}`,
  )
}

const deletedPct = (100 * votesDeleted) / Math.max(1, votesBefore)
console.log(
  `\nretention deleted ${votesDeleted.toLocaleString()} of ${votesBefore.toLocaleString()} votes (${deletedPct.toFixed(1)}%)`,
)
console.log(`rss: ${Math.round(process.memoryUsage().rss / 1024 / 1024)} MB`)
db.close()
removeRunCopy()
if (!KEEP) rmSync(DB_PATH, { force: true })
if (votesDeleted === 0) {
  console.error(
    'retention deleted nothing, so its row timed only the scans: the oldest generated day must be past VOTE_RETENTION_MS',
  )
  process.exitCode = 1
}
