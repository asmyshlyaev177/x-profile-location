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
