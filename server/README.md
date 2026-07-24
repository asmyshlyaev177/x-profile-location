# Shared location cache

A tiny, crowdsourced cache for X profile **locations**, backing the
[X Profile Location](../) extension. It runs on a **Cloudflare Worker + D1** and
costs **$0** on the free plan at extension scale.

## What it does (and doesn't)

The server **never talks to X**. Clients fetch a profile's location from X's own
`AboutAccountQuery` (rate-limited, on hover) and contribute the result here.
Other clients query the cache first and skip the X call when the location is
already known — which is what keeps everyone under X's rate limit.

Only the three fields that cost a rate-limited X call are stored:

- `location` (e.g. `JP`, `EUR`, or `null`)
- `source` (e.g. `Japan Android App`, or `null`)
- `locationAccurate` (X's "may be inaccurate" flag)

**Bio and display name are deliberately not stored** — clients already get those
for free from the timeline JSON, so there is nothing to share.

## Anti-poisoning: consensus

Anyone could POST a fake location. Defense: the value is only served once
**≥ `MIN_CONFIDENCE` distinct clients** (default 2, enforced client-side) report
the _same_ `(location, source, accurate)` tuple. Since the data comes from X's
own API, honest clients all report the identical tuple, so casual poisoning
needs several forged installs per target. Each install sends an anonymous random
`clientId`; the `location_votes` table keeps one (latest) vote per client per
username, so a single client can't stuff votes. See
[`src/consensus.ts`](src/consensus.ts).

## API

All endpoints are CORS-open and take/return JSON; no credentials.

| Method + path        | Body                             | Response                 |
| -------------------- | -------------------------------- | ------------------------ |
| `POST /v1/loc/batch` | `{ usernames: string[] }` (≤100) | `{ profiles: Served[] }` |
| `POST /v1/loc`       | `{ clientId, entries: Vote[] }`  | `{ ok: true }`           |

```ts
// Vote (contribution) — sent only after a real AboutAccountQuery
{ u: string; loc: string | null; src: string | null; acc: boolean }
// Served — compact so batches stay small
{ u: string; loc: string | null; src: string | null; acc: boolean; conf: number; rev?: boolean }
```

`rev: true` is a stochastic (~5%) hint asking the client to re-verify against X,
so relocations propagate without every client hammering the API.

## Deploy

```bash
cd server
pnpm install
pnpm db:create          # prints database_id -> paste into wrangler.toml
pnpm db:init            # applies schema.sql to remote D1
pnpm deploy             # prints the Worker URL
```

Then set that URL as `CACHE_API_BASE` in
[`../src/scripts/constants.ts`](../src/scripts/constants.ts) and rebuild the
extension. Leaving `CACHE_API_BASE` empty keeps the whole feature inert.

## Cost / scale

Read-heavy, tiny payloads, one indexed lookup per request. Free tiers: Workers
100k req/day, D1 5 GB + 5M row-reads/day. Batch reads (one request per timeline
scroll) plus the extension's local IndexedDB tier keep real traffic well under
those. If usage outgrows the free plan, Workers paid is $5/mo for 10M req/day.

## Dev / test

```bash
pnpm test        # consensus unit tests
pnpm typecheck
pnpm dev         # local Worker at http://localhost:8787 (uses local D1)
pnpm db:init:local
```
