# `server` — what we already know

The shared location cache: `src/index.ts` is the whole API and runs unmodified on
Cloudflare Workers + D1 and on Node + SQLite (`src/node-server.ts`), because it
only ever touches `Env.DB` through [`src/db-types.ts`](src/db-types.ts). Keep it
that way — no Worker globals, no `node:` imports in `index.ts`.

[`README.md`](README.md) is the operator and rationale document (API, benchmarks,
deployment, backups, alerting). This file is the short version of what a change
here can quietly break. Deploy scripts have their own notes in
[`deploy/CLAUDE.md`](deploy/CLAUDE.md).

## Cached for 60 days, then re-earned

`pruneExpired()` — the Worker's cron, a daily interval on Node — deletes votes past
`VOTE_RETENTION_MS`, then the profiles left with no votes at all. A handle nobody looks at leaves the database; the next client to
want it misses, reads it from X on hover or in the background, and contributes it
back, which rebuilds the row. So a location is only as old as the last person who
looked at it, and dead accounts cost nothing.

Two consequences:

- **`profiles` can shrink.** Anything comparing row counts across time has to
  allow for it — see [`deploy/CLAUDE.md`](deploy/CLAUDE.md) for what the backup
  baseline does about it.
- **Confidence can overstate for one retention window.** Votes expire
  individually by `seen_at`, and retention does not recompute consensus, so a
  profile with votes at day 0 and day 10 still serves `conf: 2` between day 60
  and day 70 when one vote is left. Default `minConfidence` is 1, so it only
  reaches installs that raised it.

## Tests

`pnpm test` is the unit suite (fast, CI's `server` job — the extension's root `pnpm test`
never runs it). `pnpm test:deploy` is the deploy scripts
against real databases — separate config, never CI, see `deploy/CLAUDE.md`.

`src/sqlite.test.ts` drives `worker.fetch` through a real in-memory SQLite
database, which is what keeps the two backends honest about behaving identically.
Prefer adding a case there over mocking `Env.DB`.

## Why the vote cap has slack

`location_votes` is keyed `(username, client_id)`, so uncapped it grows as
users × profiles-each-user-sees — the only superlinear term here, and the first thing
that would fill a small VPS disk. `VOTE_CAP` bounds it at distinct-profiles × cap, flat
in user count.

Pruning happens at `VOTE_CAP + VOTE_CAP_SLACK`, not at the cap. On the cap, every
further contribution would evict a row and double writes on the hot path forever;
letting rows pile to the slack and pruning in one go amortises the delete.

Eviction is oldest-first, which is also right on merit: the surviving window is the most
recent observers, so a relocation propagates instead of being outvoted forever by stale
votes. The cost is that poisoning gets cheaper — forged ids only need to fill the window,
not out-number every honest vote ever cast. `minConfidence` on the client is the backstop,
and `contrib-limit.ts` raises the price of manufacturing ids.

## Two queries that look wrong and are not

**`/v1/stats` counts unfiltered**, though `/v1/loc/batch` serves only
`location_confidence > 0`. The counts are the same number: `pickConsensus` never returns
below 1, so no row is written below 1, and `pruneExpired()` removes a profile rather than
zeroing it. What differs is cost. The bare count adds up each page's row count, while the
filter decodes every row: 0.33 ms against 26 ms over 623k profiles (2026-10-05). better-sqlite3
is synchronous, so that gap is an event-loop stall.

The count is memoised for `STATS_TTL_MS` and clients are told the same, so the endpoint
costs one `COUNT` per 3 minutes rather than one per reader. `COUNT(*)` still reads every page
of `profiles`, which took up to 0.95 s at 1361 MB past the memory limit (README "Where it slows
down", on the old layout) — the memo is not a nicety.

**The consensus recompute has no date filter.** `pruneExpired()` physically deletes votes
older than `VOTE_RETENTION_MS`, so every row still in the table is inside the window by
construction. That makes deletion the single source of truth for the 60-day bound and
lets the query ride the primary key. The retention `DELETE` itself has no `seen_at` index
to ride: a full scan spending the abundant read budget, deliberately traded against
taxing every insert's ~50x scarcer write budget. It walks the table in username ranges,
so the scan never needs one either — see "Maintenance walks username ranges".

Contributions over a client's budget are dropped **silently**, with `{ ok: true }`
either way — the client ignores the body, and a rejection would tell a poisoner when to
rotate its id.

## Tables are WITHOUT ROWID

- Each primary key is its table. With a rowid it was a second b-tree holding the keys
  again, so every vote stored its username and 36-character client id twice.
- Measured 2026-10-05 on a copy of production (623k profiles, 693k votes), on the laptop:
  165 MB with rowid tables, 111 MB converted. Retention went from 1.08 s to 0.42 s and the
  stats walk from 0.79 s to 0.35 s, deleting and counting the same rows.
- `CREATE TABLE IF NOT EXISTS` never changes a table that exists, so a file made earlier
  keeps its rowid until `deploy/vacuum.ts` converts it, by hand after a backup (README
  "Compacting the database"). On that copy the service was down 2.9 s.
- Not at boot: `update.ts` rolls back when `/healthz` is slow, and the code it rolls back
  to cannot read the new tables. A boot rebuild that committed late left that code running
  with retention failing every day (reproduced in review, 2026-10-05).
- Until then the code runs on rowid tables, and an archive from before restores to them, so
  `sqlite.test.ts` runs the walk on both layouts.
- One-way: code from before walks rowid ranges, and on the new tables its retention and
  stats line fail. The way back is the `.replaced-<stamp>` file `vacuum.ts` keeps, which is
  deleted by hand once the new one has proven out, or an older archive.

## Maintenance walks username ranges (scan.ts)

Retention and the stats line's totals read whole tables once a day; both intervals start
at boot with the same period. On better-sqlite3 a statement holds the
event loop for as long as it runs, so as single statements they were one long silence:
on one core under `MemoryMax=640M`, 12 s at 554 MB and 40-58 s at 1.1 GB, every request
in it timing out (2026-09-30).

- `forEachUsernameRange` splits the work into ranges of the primary key, which both
  tables lead with, so it needs no extra index. A `LIMIT`-chunked DELETE re-reads the table
  from the start for every chunk, which is why chunking once looked like it needed a
  `seen_at` index. Until 2026-10-05 the ranges were rowids, which the tables no longer have.
- Its one bound is `MAX(username)`, read alone. SQLite seeks for a lone MIN or MAX, but
  `SELECT MIN(x), MAX(x)` together is a full scan, the one stall chunking exists to avoid.
  `sqlite.test.ts` fails on any `SCAN` in a statement the walks prepare, on both layouts.
- Ranges are half-open, `username > after AND username <= upTo`, from `''`: a username has
  one character at least. `upTo` comes from an `OFFSET` that steps through the range's rows,
  so every range is read twice. A range ends on a whole username, so a votes range can run
  up to 14 rows over.
- Node passes `yieldingScan()`: 250 rows a statement and a turn of the event loop every
  10 ms. The measurements behind both numbers sit beside them in `sqlite.ts`, taken on
  rowid ranges.
- `node-server.ts` runs the two walks through `oneAtATime()`: back to back, so the stats
  line counts what retention left and one walk holds the loop at a time, and a pass still
  running when its interval fires again is skipped, not stacked.
- The Worker's `scheduled()` passes `WHOLE_TABLE`: per table, its last username and one
  DELETE, with no `OFFSET`. D1 caps the queries one invocation may run, and a long D1 query
  blocks nothing. `scheduled.test.ts` fails if the cron starts chunking.
- The profile sweep stays a sweep of every profile, not of the ones this pass emptied: a
  pass cut short by a restart is finished by the next, and a profile that never had a
  vote still goes (`sqlite.test.ts`).
- A distinct count cannot be summed across chunks, so `countTotals` keeps each install's
  last `seen_at` in a map — only installs seen in the last 7 days, tens of thousands.
- The shutdown stats line takes `WHOLE_TABLE`: no connection is left to serve by then, and
  a scan that yields would let the 5 s exit timer cut it short.
- Measured after (2026-10-01, same box): with the file at 1.1 GB in 640 MB the slowest
  chunk took 0.56 s, and no request in the tick timed out up to 1.36 GB. Past the memory
  limit what grows is latency — README "Where it slows down".

## The contribution budget (contrib-limit.ts)

`POST /v1/loc` trusts whatever a client sends. That is fine while the expensive part —
actually looking a handle up on X — is what bounds a client, and it is: X allows
`LOOKUP_LIMIT_PER_WINDOW` (50) lookups per `LOOKUP_WINDOW_MS` (15 minutes), so an honest
client cannot report many distinct handles. Both live in `x-lookup-budget.ts`, which the
extension imports too, so a new measurement moves both sides at once. A
poisoner skips that step and posts any number under a fresh `clientId` per burst, and
open-sourcing publishes the endpoint and its body shape.

The guard caps **distinct handles per clientId per window**. It does not stop an attacker
minting an id per request — nothing short of attestation would — but it makes poisoning
scale with the ids they have to manufacture and rotate. Re-reporting a handle already
contributed this window is free: that is what an honest client does when a location
changes, and it cannot grow the table.

**The cap is `LOOKUP_LIMIT_PER_WINDOW × 2.2`, 110.** X's window is fixed and resets on
its own clock, while a budget window here starts at the client's first contribution. One
budget window can therefore hold a full X budget spent just before a reset and another
just after: 100 honest handles, never more while X allows 50. 2.2 is those two plus 10%
headroom; at exactly 50 the second budget is dropped silently.

Held **in memory**, not in SQLite: counting a client's recent handles would need an index
on `client_id`, and schema.sql has the measurements for why a second index there is the
wrong trade — to defend a guardrail, not a security boundary. Node is one process, so the
count is exact; on Workers each isolate keeps its own, which weakens but does not break
it. An evicted client's budget resets, which is where it would be with no guard at all.

Memory, measured 2026-09-23 (~60 B per handle held):

- Budgets whose window has passed are dropped as they reach the front of the map, since
  an expired budget admits exactly what no budget would. Before that, 10k clients × 50
  handles held 29 MB for good.
- `MAX_TRACKED_CLIENTS` bounds one window at 50k clients × 110 handles, ~330 MB: under
  `MemoryMax` beside the server's ~75 MB, but most of it. At the old cap of 200 it was
  ~560 MB, above it.

If legitimate users start hitting the limit, raise it rather than letting it drop data.

## The Node deployment (node-server.ts, sqlite.ts, stats.ts)

**better-sqlite3 is synchronous**, so every query blocks the event loop for the
microseconds it takes. That is the right trade for single-index lookups on a small
table: no connection pool, no await interleaving, and a `batch()` that is a real
transaction rather than a best-effort sequence. The `async` wrappers exist only so a
driver error surfaces as a rejection, which is D1's contract. WAL plus
`synchronous=NORMAL` trades an fsync per commit for write throughput; a crash can lose
the last few contributions, which a best-effort cache can afford, and WAL still recovers
cleanly.

**Rate limiting is deliberately crude** — an in-memory fixed window per IP, sized to stop
one host saturating a vCPU, not to enforce fair use. The default is generous because one
IP is not one user: offices, universities and CGNAT share addresses, and a false positive
is expensive, since shared-cache.ts counts a 429 as a failure and three open its circuit
breaker for ten minutes. `Retry-After` is load-bearing for the same reason. Trust
`X-Forwarded-For` only when configured, and read its **last** entry — proxies append the
peer address, so the first is attacker-controlled.

**Scanner traffic is input, not failure.** `new Request` rejects things node:http accepts
(a `//` target, header names node tolerates), and TRACE/TRACK/CONNECT cannot be
represented at all; these answer 405 or 400 and count as `other` rather than surfacing as
500s. `/healthz` is uncounted — at one probe per 30s it would drown the real numbers.

**Stats cost what they measure.** Per-window counters are in-process and reset on each log
line, so a restart loses the partial window (hence the SIGTERM flush). The distinct-installs
figure comes from the `client_id` already in `location_votes` — no new tracking — but there
is no index on `seen_at`, so it is a full scan, walked in chunks that give way to requests
("Maintenance walks username ranges"). Once a day; never on a request path. It counts _contributors_, a
floor on active users: counting readers would mean identifying lookups, which is exactly
what this server promises not to be able to do.

**The service runs `dist/node-server.js`, and git carries it.** `pnpm build` bundles
`src/` with esbuild; the result is committed because the VPS deploys by `git pull` and
installs with `--omit=dev`, so it has no build tool, and a rollback to any commit brings
back the bundle that matches it. `bundle.test.ts` fails when the bundle no longer matches
`src/`, and runs it under plain `node` with type stripping off.

**Memory is set by three knobs, not by the data.** Measured 2026-09-23 on a 600k-profile
copy after 20k requests and a retention pass; anonymous memory went from 340 MB to 73 MB.

- `XLOC_CACHE_MB` 16, not 256. With `mmap_size` covering the file, reads never enter
  SQLite's page cache; writes and the retention `DELETE`'s write cursors do. At 256,
  20k lookups added 24 MB in all and that one retention pass 91 MB. It held ~200 MB more
  in Node, Bun and Go alike, and `pnpm bench` p50s did not move. At 2 the retention pass
  doubled. Re-check: `XLOC_CACHE_MB=256 pnpm bench` against the default, `rss` line.
- `--max-semi-space-size=1` in `ExecStart`. V8 grew the young generation to 32-64 MB
  under load and kept it; `pnpm bench` p50s did not move with the cap.
- The bundle, not `.ts`: Node loads its type stripper (swc built to WASM) for the first
  `.ts` file and keeps it, ~20 MB. An idle process is 50 MB RSS as `.js`, 70 MB as `.ts`;
  under load, 73 MB anonymous as the bundle, 89 MB as `.ts`.
- Other runtimes on the same database, load and cache (anonymous MB): Go + mattn/go-sqlite3
  49, Go + modernc 64, Deno 71, Node as `.js` with the V8 flag 74, Bun 79, txiki.js 87.
  Go's 25 MB does not pay for a second implementation of `index.ts`, which the Worker
  still runs.
