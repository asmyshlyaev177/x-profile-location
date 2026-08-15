# `src/scripts/cache` — what we already know

`cache.ts` is the local answer (IndexedDB via idb-keyval, 30-day TTL, keys are lowercased
usernames, `mergeCached` deep-merges `facts`). `shared-cache.ts` is the optional community
one: a batch lookup before asking X, and a contribution after. Types are in
[`../CLAUDE.md`](../CLAUDE.md); the server is [`server/README.md`](../../../server/README.md).

## The community cache

Which backend a build talks to is a build-time switch, never a source edit: `pnpm build` →
the self-hosted Node+SQLite box (default), `pnpm build:worker` → the Cloudflare Worker,
`pnpm build:nocache` → inert. Self-hosted is the default because D1's free plan caps out
around 150 users on rows-written/day (see "Backend" in `server/README.md`); the Worker
build stays one command away, as the cheapest way to stand up an instance and what
already-installed extensions keep talking to until their users update.

**The empty case is deliberate.** `??` only falls back on an _unset_ variable, so an empty
`VITE_CACHE_API_BASE` disables the cache outright and the options page hides the toggle
(`isSharedCacheConfigured`). **The `?.` is for Playwright, not Vite**: the e2e suite
imports this module through Playwright's TypeScript loader, which leaves `import.meta.env`
undefined, and a bare property access throws at import time and takes the suite down with
it ("0 tests in 0 files").

**`minConfidence` — how many distinct clients must agree — is still 1, deliberately.**
Measured 2026-07-27, 52 of 4242 profiles had reached 2, so raising it would drop what the
cache can answer by ~99%, and a cache that answers nothing costs more than it protects.
`VOTE_CAP` keeps only the 10 newest votes per handle anyway, so 2 guards against one
honest-but-wrong client, not a poisoner who can mint ids. It lives under
`MIN_CONFIDENCE_KEY` rather than compiled in, so it can be raised on one install and
measured without shipping a build. Flip it once this is a majority:

```bash
sqlite3 /var/lib/x-loc-cache/x-loc-cache.db \
  'SELECT COUNT(*) AS profiles, SUM(location_confidence >= 2) AS ready FROM profiles;'
```

**The popup's count** (`GET /v1/stats` → `{ profiles }`, `fetchCacheCount`) is the only
request not driven by someone reading a timeline, so the only one that could arrive as a
crowd. Four things keep it cheap and none work without the others: it runs only while the
popup is open, and never while paused or with the cache off (that setting is a decision
not to talk to that server); `COUNT_POLL_MS` is 30s, under the server's `max-age`, so
roughly every other ask never leaves the machine, and it re-asks only while
`document.visibilityState` is `'visible'` (it exists for the Android build, where the
panel opens as a tab); the server memoises for 60s behind `Cache-Control: public,
max-age=60`; and the figure is remembered under `SHARED_CACHE_COUNT_KEY` so the panel
opens with a number, written only when it moves, since every write wakes the worker and
each open tab's storage listener. `at` is therefore when the number last _moved_, and one
that hasn't in a week is dropped rather than shown. A server that 404s reads as "no
answer": the line keeps what it had, or stays away. Nothing about the reader goes with the
request — a bodyless GET, same response for everyone.
