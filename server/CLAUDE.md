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

`scheduled()` deletes votes past `VOTE_RETENTION_MS`, then the profiles left with
no votes at all. A handle nobody looks at leaves the database; the next client to
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

`pnpm test` is the unit suite (fast, CI). `pnpm test:deploy` is the deploy scripts
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
below 1, so no row is written below 1, and `scheduled()` removes a profile rather than
zeroing it. What differs is cost — the filter cannot use the username index and drops to
a table scan (5.3ms against 0.05ms over 200k rows), and better-sqlite3 is synchronous, so
that gap is an event-loop stall.

The count is memoised for `STATS_TTL_MS` and clients are told the same, so the endpoint
costs one `COUNT` per minute rather than one per reader. `COUNT(*)` is a full scan (7.8ms
at 10k-user scale, README "Benchmarks") — the memo is not a nicety.

**The consensus recompute has no date filter.** `scheduled()` physically deletes votes
older than `VOTE_RETENTION_MS`, so every row still in the table is inside the window by
construction. That makes deletion the single source of truth for the 60-day bound and
lets the query ride the primary key. The retention `DELETE` itself has no `seen_at` index
to ride: a full scan spending the abundant read budget, deliberately traded against
taxing every insert's ~50x scarcer write budget.

Contributions over a client's budget are dropped **silently**, with `{ ok: true }`
either way — the client ignores the body, and a rejection would tell a poisoner when to
rotate its id.

## The contribution budget (contrib-limit.ts)

`POST /v1/loc` trusts whatever a client sends. That is fine while the expensive part —
actually looking a handle up on X — is what bounds a client, and it is: X allows ~50
lookups per 15 minutes, so an honest client cannot report many distinct handles. A
poisoner skips that step and posts any number under a fresh `clientId` per burst, and
open-sourcing publishes the endpoint and its body shape.

The guard caps **distinct handles per clientId per window**. It does not stop an attacker
minting an id per request — nothing short of attestation would — but it makes poisoning
scale with the ids they have to manufacture and rotate. Re-reporting a handle already
contributed this window is free: that is what an honest client does when a location
changes, and it cannot grow the table.

Held **in memory**, not in SQLite: counting a client's recent handles would need an index
on `client_id`, and schema.sql has the measurements for why a second index there is the
wrong trade — to defend a guardrail, not a security boundary. Node is one process, so the
count is exact; on Workers each isolate keeps its own, which weakens but does not break
it. `MAX_TRACKED_CLIENTS` stops the guard itself becoming a memory-exhaustion vector;
an evicted client's budget resets, which is where it would be with no guard at all.

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
is no index on `seen_at`, so it is a full scan: ~230ms over 5.4M votes, a synchronous
event-loop stall. Fine once a day; never on a request path. It counts _contributors_, a
floor on active users: counting readers would mean identifying lookups, which is exactly
what this server promises not to be able to do.
