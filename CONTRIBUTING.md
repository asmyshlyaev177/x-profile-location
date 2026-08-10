# Contributing

Thanks for looking. This file is the technical entry point — the
[README](README.md) is written for users and deliberately carries no
architecture.

The fastest way to understand the project is `pnpm test`. There are 319 unit tests here plus 44 for the
cache server, and a Playwright suite, and almost every non-obvious decision in the
codebase has a test pinning it. If you change behaviour and nothing goes red,
that's usually a missing test rather than a safe change.

## Quick start

```bash
pnpm install

pnpm dev       # build + watch for Chrome/Brave/Firefox/Safari
pnpm build     # production build (all browsers)
pnpm test      # vitest run --coverage
pnpm fix       # oxfmt + oxlint --fix
pnpm zip       # package extension ZIPs for store submission
```

Built output goes to `dist/<browser>/`. Load it unpacked from
`chrome://extensions` with developer mode on.

## How it works

Three layers, because the data the extension needs lives in two places the
extension can't reach directly.

1. **`src/scripts/page-script.ts`** runs in the page's own JS context
   (`world: MAIN`) and patches `fetch`/`XHR`. It does two jobs: capture the auth
   headers X attaches to its own GraphQL calls, and extract user bios out of
   `HomeTimeline` / `TweetDetail` responses as they fly past. Both are handed to
   the content script over `CustomEvent`.

   Only three non-secret headers are forwarded (`authorization`,
   `x-twitter-client-language`, `x-twitter-active-user`). **`x-csrf-token` is
   deliberately excluded** — the event is observable by the page and by any other
   extension's content script, so nothing sensitive may cross it. The content
   script reads `ct0` from `document.cookie` itself.

2. **`src/scripts/content.tsx`** is plain DOM, no Preact. It owns the cache, the
   rate-limit budget, the DOM injection, and the filtering. This is the big file
   and the one with the most tests.

3. **`src/scripts/service-worker.ts`** initialises defaults on install.

`src/pages/options.tsx` is the only Preact surface. It is currently also the
popup target, which is a known constraint — see the roadmap.

### Rate limiting is the core constraint

X's `AboutAccountQuery` allows **50 lookups per 15-minute window**, measured from
its own `x-rate-limit-*` response headers. Everything interesting in the design
follows from that number.

`src/scripts/prefetch-queue.ts` is a budget-aware background prefetcher. It
reserves a share of the window (default 30%) for the user's own hovers so a
manual hover is never starved, and spreads the rest evenly across the time left
in the window rather than spending it in a burst and idling. Two FIFO queues —
the feed being scrolled drains entirely before a thread's replies.

It is deliberately decoupled from the DOM: every effect is injected, so the
scheduling and budget logic is unit-testable via `runOnce()` and `nextDelayMs()`
without timers or a browser. **Keep it that way.** If you find yourself importing
anything DOM-shaped into that file, the design has gone wrong.

### The shared cache

`src/scripts/shared-cache.ts` talks to [`server/`](server/), a small crowdsourced
cache so users don't each spend a rate-limited X call on the same account. It is
strictly best-effort: every request has a timeout, every failure resolves to "no
data" so callers fall back to the direct X API, and a circuit breaker backs off
after repeated failures. Nothing in that file can break the core features.

Only `location`, `source` and `locationAccurate` travel over the wire — never
bios, never who looked up whom. Contributions carry an anonymous per-install
`clientId`; lookups carry no identifier at all, which is what stops the server
from being able to correlate an install with the handles it viewed.

The server has [its own README](server/README.md) covering the consensus model,
both deploy shapes, and benchmarks.

## Project structure

```text
src/
├── _config/
│   ├── bedframe.config.ts   # Bedframe configuration (browsers, pages, test setup)
│   └── tests.config.ts      # Vitest setup file
├── assets/icons/            # Extension icons (16, 32, 48, 128 px)
├── manifests/               # Browser-specific manifest definitions
│   ├── base.manifest.ts
│   ├── chrome.ts · brave.ts · firefox.ts · safari.ts
├── pages/
│   ├── options.html         # Options page entry
│   └── options.tsx          # Options page component (Preact)
├── scripts/
│   ├── content.tsx          # Content script — main extension logic
│   ├── page-script.ts       # MAIN-world fetch/XHR interception
│   ├── prefetch-queue.ts    # Rate-limit-aware background prefetcher
│   ├── shared-cache.ts      # Community cache client
│   ├── cache.ts             # IndexedDB cache via idb-keyval
│   ├── countries.ts         # Flags, regions, aliases, storage keys, defaults
│   ├── extract-users.ts     # Timeline JSON → user bios
│   ├── keywords.ts          # Bio keyword matching
│   └── service-worker.ts    # Background script
└── index.css

server/                      # Shared location cache (see server/README.md)
landing/                     # Vite + Preact landing page
```

There are folder-level `AGENTS.md` files under `src/` with conventions specific
to each area. Read the nearest one before editing.

## Tests

```bash
pnpm test              # unit, with coverage
pnpm test:e2e          # Playwright, replay mode — headless, nothing appears on screen
pnpm e2e:profile       # one-time: hand a logged-in browser profile to Playwright
```

The e2e suite runs **headless**, which needs `channel: 'chromium'` to work at all:
Playwright's plain headless build is a separate binary with no extension support.
`E2E_HEADED=1` shows the browser when you want to watch a run — `test:e2e:ui` and
`test:e2e:record` set it for you, since both exist to be watched.

**Unit tests** use Vitest + Happy DOM. `content.test.ts` alone has 97 tests;
`prefetch-queue.test.ts` has 47 and drives the scheduler through injected clocks
rather than real timers.

**Tests must pass in any order.** CI runs the suite twice — once normally, once
with `--sequence.shuffle` (`pnpm test:shuffle`) — because both content scripts
keep module-level state that outlives a single test. Two traps, both of which
have bitten this repo:

- `vi.clearAllMocks()` clears call history but **not** implementations, so a
  `mockResolvedValue` set in one test stays installed for every test after it.
  `content.test.ts` restores the mock defaults in a file-level `beforeEach`.
- Re-importing a module after `vi.resetModules()` runs its top-level code again,
  and anything it registered on `window` from the previous import is still
  there. `page-script.test.ts` records and unhooks listeners per test.

If the shuffled run fails on its own, the seed it prints reproduces it exactly:
`npx vitest run --sequence.shuffle --sequence.seed=<seed>`. Fix the coupling —
don't add a retry.

**E2E** runs against recorded HAR fixtures via
[`test-proxy-recorder`](https://github.com/asmyshlyaev177/test-proxy-recorder),
so the suite is deterministic and sends no request to X.

**It still needs a real logged-in session**, which is why it runs locally rather
than in CI. That is less obvious than it sounds, so it is worth writing down:
X's SPA decides on the client whether it is logged in, before issuing anything.
With no session it routes to the login flow; with a _fake_ one it takes a third
path and asks for endpoints the recordings don't hold — measured at 96 unmatched
requests against 24 for a real session, with the app shell never rendering.
Replaying responses doesn't help when the page never sends the requests. Don't
spend an afternoon on the synthetic-session shortcut; it was tried.

Two practical consequences:

- **Don't interrupt `pnpm test:e2e`.** A killed run skips the proxy teardown and
  can leave a `.har` partially rewritten. Completed runs never touch them, so if
  `git status` shows a dirty recording after a Ctrl-C, restore it rather than
  committing it.
- Recordings are keyed to test titles, so **renaming a test orphans its `.har`**.

X flags Playwright's bundled Chromium, so recording runs on a profile you log
into by hand. `pnpm e2e:profile` opens Brave (or `--browser=chromium|chrome|<path>`)
on its own profile under `e2e/.auth/`; log in, close the window, and it copies the
profile plus a note of which binary made it. Re-run it when X invalidates the
session. **Nothing under `e2e/.auth/` is ever committed** — it holds a live session.

### Recordings must be scrubbed

```bash
pnpm scrub          # pseudonymise every account in e2e/recordings/
pnpm scrub:check    # what CI runs; exits 1 on anything unscrubbed
```

A capture is a slice of a real logged-in session, so a raw HAR carries hundreds of
real accounts with their display names, bios, avatars and post text. Session
credentials are already redacted by the recorder — that covers credentials, not
identity.

You should not normally have to run `pnpm scrub` by hand. Three things run it for
you, in the order they can catch a mistake:

1. **`pnpm test:e2e:record`** scrubs as soon as the Playwright UI exits, so the
   normal record loop leaves a clean working tree.
2. **The pre-commit hook** scrubs and re-stages if anything under
   `e2e/recordings/` is staged. This is the one that matters: once a raw capture
   is committed, scrubbing the working tree no longer helps, because history
   keeps the original.
3. **CI** runs `pnpm scrub:check` and fails the build. A backstop, not a fix.

Run `pnpm test:e2e` after a recording session to confirm replay still passes
against the scrubbed fixtures.

Which accounts keep their real handle is _derived, not configured_: an account
survives exactly when a test source names it, because that is what "the suite
asserts against this account" looks like. Everyone else is pseudonymised to
`user_<hash>`. Two consequences worth knowing:

- **Never put a real handle in `e2e/scrub.config.json`.** It's committed, so a
  handle there republishes the identity the scrub exists to remove.
- **Referencing an account in a test keeps it in the recordings.** If you stop
  naming one, the next scrub anonymises it — which is the intended direction.

Country, app-store source, `location_accurate` and account creation date are never
touched. They're the data under test.

## Browsers

Chrome, Brave, Firefox, Safari.

Firefox needs Gecko 128+ (for `content_scripts[].world: "MAIN"`) and runs the
background module as `background.scripts` rather than a service worker, which
Firefox doesn't implement. `vite.config.ts` passes `browser: 'firefox'` to crxjs
on that build mode so the emitted loader and `web_accessible_resources` match.

The Playwright suite is **Chrome-only** — Playwright cannot install a Firefox
extension or open `moz-extension://` pages. Check Firefox by hand:

```bash
pnpm dev:firefox   # builds dist/firefox, runs it in Firefox via web-ext, opens x.com
```

It keeps a profile at `e2e/.auth/firefox-profile`, so you log in to X once.
Firefox MV3 treats host permissions as user-granted, so allow x.com from the
extensions button on the first run — real users have to do this too.

## Seeing the rating ask without waiting three days

It shows after three separate days on which a flag was actually drawn, so it
will not appear on a fresh profile. **Seed the storage rather than patching the
condition** — a patched `ratingAskDue()` moves the badge and the in-page bar but
not the popup card, which calls `shouldAskForRating` directly, so you end up
testing two thirds of it and drawing the wrong conclusion.

In the service worker's console (`chrome://extensions` → **service worker**), or
any extension page's:

```js
const d = new Date()
const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
await chrome.storage.local.set({
  usageStats: { activeDays: 5, lastDay: day },
  ratePrompt: { status: 'idle', snoozeUntil: 0 },
})
```

`lastDay` has to be the **local** date — `usage.ts` counts local days, so an ISO
string (UTC) is a different day for half the world and the counter would move
under you.

The badge appears at once: the write fires `storage.onChanged`, which is what
the service worker syncs it on. For the bar, reload an x.com tab and hover a
profile — it needs a flag on screen, then waits six seconds.

Two things that will make it look broken when it isn't:

- **The bar records a three-day snooze the moment it renders.** Re-run the
  snippet before each attempt or you get exactly one.
- **`dist/` is not rebuilt for you.** `pnpm dev` rebuilds on save; a plain
  `pnpm build` is a snapshot, and an extension reloaded against a stale `dist`
  is the usual reason a change appears to do nothing.

## Pointing a build at a cache backend

`CACHE_API_BASE` is a **build-time** value, never a source edit:

```bash
pnpm build                                              # self-hosted Node+SQLite (default)
pnpm build:worker                                       # the Cloudflare Worker
pnpm build:nocache                                      # shared cache compiled out entirely
VITE_CACHE_API_BASE=http://127.0.0.1:8787 pnpm build    # a local server
```

The empty case is reachable on purpose: the fallback applies only to an _unset_
variable, so an explicitly empty value ships a build that never contacts any
server and hides the options-page toggle.

## Conventions

- **Oxlint + oxfmt**, run via `pnpm fix`. A pre-commit hook runs lint-staged.
- **Comments explain why, not what.** The codebase leans heavily on this — most
  non-obvious constants carry the measurement or the bug that motivated them.
  Match that; a comment restating the code will be asked about in review.
- **No new dependencies** without a reason in the PR description. The extension
  ships two runtime deps (`preact`, `idb-keyval`) and that's a feature.
- Don't broaden `web_accessible_resources` or manifest permissions without
  saying why. The current set is minimal on purpose so x.com can't fingerprint
  or probe the extension.

## Pull requests

- One concern per PR.
- Tests for behaviour changes. If it's genuinely untestable, say why.
- `pnpm test && pnpm fix` before pushing.
- Note anything that touches the rate-limit budget, the shared-cache wire format,
  or the captured-header path explicitly — those three are where a subtle change
  does the most damage.

## Reporting bugs

X changes its GraphQL query IDs, response shapes and page markup without notice,
and any of those can break the extension overnight. When reporting:

- Browser and version, extension version
- What you expected vs what happened
- Whether the community cache is on
- Console output if there is any (the extension is quiet by default)

Screenshots help. Redact handles you don't want in a public issue.
