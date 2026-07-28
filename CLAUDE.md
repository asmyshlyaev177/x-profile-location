# CLAUDE.md — x-profile-location

Project-specific context for working in this codebase. Read this before editing any source file.

---

## What this extension does

Shows country flags / region abbreviations / VPN warnings inside X (Twitter) hover cards and tweet articles. Location data comes from X's own **`AboutAccountQuery`** GraphQL endpoint, authenticated with the user's own session headers — no extra credentials.

---

## Architecture: three-layer pipeline

```
Page context (world: MAIN)          Content script context           IndexedDB (idb-keyval)
─────────────────────────────       ──────────────────────────       ──────────────────────
page-script.ts                      content.tsx
  │  wraps window.fetch/XHR          │  listens for CustomEvents
  │                                  │  from page-script.ts
  ├─ captures auth headers ─────────►│  apiHeaders = captured headers
  │  (x-loc-headers-captured)        │
  └─ extracts users from ───────────►│  mergeCached(userName, { bio })
     HomeTimeline/TweetDetail         │
     (x-loc-users-data)              │  fetchLocationData(userName)
                                     │    → AboutAccountQuery HTTP GET
                                     │    → mergeCached(userName, locationData)
                                     │    → inject row into DOM
                                     │
                                     └─ cache.ts ──────────────────► IDB store
                                          getCached / setCached /        "x-profile-location"
                                          mergeCached / cleanupCache      "location-data"
```

**Why two scripts?** The `fetch`/`XHR` wrappers must run in `world: MAIN` (same JS context as the page) to intercept the page's own network calls. Content scripts run in an isolated context and cannot do this. Communication is via `window.dispatchEvent(new CustomEvent(...))`.

---

## Key files

| File                            | Purpose                                                                                                                                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/page-script.ts`    | Injected into `world: MAIN`. Wraps `fetch` + `XMLHttpRequest`. Captures auth headers; extracts bios from HomeTimeline/TweetDetail.                                                      |
| `src/scripts/content.tsx`       | Content script. Listens for events from page-script, calls `AboutAccountQuery`, injects DOM rows, runs MutationObserver, handles keyword/flag highlighting.                             |
| `src/scripts/extract-users.ts`  | Recursive GraphQL response walker. Finds `__typename: 'User'` nodes up to depth 20.                                                                                                     |
| `src/scripts/cache.ts`          | IndexedDB wrapper (idb-keyval). 30-day TTL. Keys are lowercased usernames.                                                                                                              |
| `src/scripts/prefetch-queue.ts` | `BackgroundPrefetcher`: two queues (feed before replies), most-followed first, paced evenly over its 70% share of the rate-limit window. Unit-tested via `runOnce()`.                   |
| `src/scripts/countries.ts`      | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR` maps + storage key constants.                                                                                                            |
| `src/scripts/grapheme.ts`       | Grapheme-cluster-aware substring search, used for keyword highlight matching.                                                                                                           |
| `src/scripts/service-worker.ts` | Background script. Sets `blockedCountries` defaults in `chrome.storage.local` on install.                                                                                               |
| `src/pages/options.tsx`         | Preact options page: blocked countries, keyword highlights, flag-count threshold, background lookups (prefetch share + pacing).                                                         |
| `src/components/Autocomplete/`  | Reusable Preact autocomplete used in the options page.                                                                                                                                  |

---

## API: AboutAccountQuery

```
GET https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery
    ?variables=%7B%22screenName%22%3A%22username%22%7D

Headers (captured from page's own requests):
  authorization: Bearer <token>
  x-csrf-token:  <ct0 cookie value>        ← falls back to cookie if header absent
  x-twitter-client-language: en
  x-twitter-active-user: yes
  content-type: application/json
```

**Response shape:**

```json
{
  "data": {
    "user_result_by_screen_name": {
      "result": {
        "about_profile": {
          "account_based_in": "United States",
          "location_accurate": true,
          "source": "web"
        }
      }
    }
  }
}
```

`source` can be `"web"`, `"Japan Android App"`, `"India App Store"`, or `null`.  
Rate-limit response: **HTTP 429** + `x-rate-limit-reset` header (Unix seconds).

**Rate limit: 50 requests / 15-minute window** (per-user, per-endpoint; measured live 2026-07-25). X returns `x-rate-limit-limit` / `x-rate-limit-remaining` / `x-rate-limit-reset` on **every** response, not just 429s — `content.tsx` reads these on each call (`readRateHeaders`) and decrements a live `rateWindowRemaining` on every request via `noteRequestSent`, so the budget reflects hovers + swipes + background prefetch together. The `BackgroundPrefetcher` uses at most **70%** (`reserveFraction`, 35 of 50) of the window, stopping once `remaining` reaches the user's reserved share (the last 15).

It **paces** that share across the window rather than spending it back-to-back: before every lookup, `nextDelayMs()` recomputes the gap as `msLeftInWindow / budget` (≈26 s at 35 lookups / 15 min), clamped to `[minSpacingMs 1.5 s, maxSpacingMs 2 min]`. The recompute is self-correcting — hovers eat the shared budget and stretch the gap; a rolled-over window shrinks it back. `windowResetAt` is unknown until the first response, so a full window is assumed. The first lookup after `start()` fires immediately; after that `enqueue()` waking an idle queue still waits out the gap since `lastFetchAt`.

Candidates sit in **two queues** (`PrefetchPriority`): `high` — the feed being scrolled (`HomeTimeline`) — is drained completely before `low` — a thread's replies (`TweetDetail`) — gets a single lookup; most-followed first within each. `page-script.ts` tags every dispatched user with the priority of the response it came from (`BIO_INTERCEPT` maps operation → priority), and the tweet the user actually **opened** never goes through the queue at all — `processPrimaryTweet()` fetches it directly. A name queued `low` that later arrives `high` is promoted; the reverse never demotes, in the queue and in page-script's replay buffer alike. `maxQueue` overflow sheds from the bottom of `low` first.

The **community cache is the master switch** for all of this. Prefetch exists to warm it, so `prefetchAllowedBySettings()` in content.tsx requires `SHARED_CACHE_KEY` — turning the cache off stops the prefetcher (via `syncPrefetcher()` on the storage change) and stops queueing candidates. The gate only applies when a server is configured: `!isSharedCacheConfigured() || isSharedCacheEnabled()`, so a build with an empty `CACHE_API_BASE` (where the toggle isn't rendered) still prefetches. The options page mirrors this — the cache toggle leads the **Background lookups** section and disables everything below it (`cacheOff`).

Both dials are user-settable (options page → **Background lookups**) and applied live. `pacing: 'instant'` opts out of spreading — same share, spent at `minSpacingMs` until it runs out, then idle until the window rolls. The share and the backoff/budget branches of `nextDelayMs()` behave identically in both modes.

---

## Data types

```typescript
// cache.ts
interface LocationData {
  location: string | null // "United States", "South Asia", …
  locationAccurate: boolean // false → VPN likely
  source: `${string} Android App` | `${string} App Store` | 'web' | null
  bio?: string | null
  displayName?: string | null
}

// extract-users.ts
interface UserBio {
  userName: string // screen name, not display name
  displayName: string | null
  bio: string | null
}
```

`LocationData` is stored in IDB with `{ data: LocationData, fetchedAt: number }`. TTL is 30 days.

---

## extract-users.ts — parsing rules

- Recurses all object values / array items up to **depth 20** (hard stop).
- A node is a User if `obj.__typename === 'User'`.
- **screen_name priority:** `core.screen_name` → `legacy.screen_name`
- **bio priority:** `profile_bio.description` → `core.description` → `legacy.description`
- **display name:** `core.name` → `legacy.name`
- Returns `[]` for primitives, null, undefined, or if no screen_name is found.

---

## content.tsx — important module-level state

These are module-level `let` variables that persist for the life of the content script:

| Variable             | Type                            | Purpose                                                                             |
| -------------------- | ------------------------------- | ----------------------------------------------------------------------------------- |
| `apiHeaders`         | `Record<string,string> \| null` | Captured auth headers; exported + settable via `setApiHeaders()`                    |
| `checkedThisSession` | `Set<string>`                   | Usernames whose API call was already attempted; prevents duplicate network requests |
| `pendingMap`         | `NormalizedMap<Promise>`        | In-flight fetch promises; concurrent hover for same user shares one promise         |
| `rateLimitResetAt`   | `number`                        | `Date.now()` ms until rate limit lifts; 0 when clear                                |
| `blockedCountries`   | `Set<string>`                   | Loaded from `chrome.storage.local`; reloaded on storage change                      |
| `highlightKeywords`  | `Set<string>`                   | Same; all lowercased                                                                |

**`__testResetState()`** is exported for tests only — clears `checkedThisSession` and resets `rateLimitResetAt` to 0.

---

## content.tsx — the mobile swipe gesture

Swipe-right on a tweet looks up its author. The gesture **commits mid-drag, on `touchmove`**, not on `touchend`: waiting for the finger to lift spent the whole remainder of the swipe before the lookup even started, which is usually longer than the lookup itself. `touchend` is kept as a backstop for flicks fast enough that touchmove coalescing never reported a position past the threshold, and `touchcancel` abandons the gesture. A `handled` flag (reset on `touchstart`) makes it fire at most once per gesture, whichever listener gets there first.

The tweet is resolved from the **`touchstart`** target and remembered — by the time the threshold is crossed the finger may have travelled off the article.

`isCommittedSwipe(dx, dy)` (exported for tests) is the predicate: ≥40px rightward, ≤50px drift, **and** `dx >= |dy| * 1.5`. That last clause is the one firing mid-drag made necessary — a vertical fling that starts on a slight diagonal can satisfy both raw thresholds long before it is recognisably horizontal.

`renderLocationToast(text, pending)` backs the overlay. A `pending` toast has no auto-dismiss timer, so **every pending toast must be resolved by a later call** or it never goes away — `revealLocationForSwipe` shows `@handle …` immediately, then replaces it with the result, `'No location'`, or nothing. "Nothing" (`dismissLocationToast()`) is for when the lookup couldn't be *attempted* — rate-limited, or headers not yet captured — as opposed to X having no answer. That distinction is load-bearing: `#x-loc-rate-toast` is a separate element pinned to the same `bottom: 24px`, so a `'No location'` toast would render on top of the countdown.

---

## page-script.ts — re-injection guard

The IIFE checks `window.__X_LOC_INJECTED__` and exits immediately if set. This prevents double-patching if the script somehow loads twice.

`headersCaptured` (module-level bool) ensures `x-loc-headers-captured` is dispatched **once** per page load, even if many graphql requests fire. `storedHeaders` is kept so late subscribers can call `window.dispatchEvent(new CustomEvent('x-loc-request-headers'))` to get the headers re-emitted.

---

## Test patterns

### page-script tests (`page-script.test.ts`)

The IIFE runs at import time, so each test needs a fresh module:

```typescript
beforeEach(() => {
  vi.resetModules()
  delete (window as any).__X_LOC_INJECTED__
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  )
  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})
afterEach(() => vi.unstubAllGlobals())

it('...', async () => {
  await import('./page-script') // triggers IIFE fresh
  // window.fetch is now the patched version
})
```

**Window listener accumulation gotcha:** each test import adds a new `'x-loc-request-headers'` listener to `window`. happy-dom reuses `window` within a file. Tests that check `x-loc-headers-captured` events should use `vi.spyOn(window, 'dispatchEvent')` to inspect calls synchronously rather than relying on `addEventListener` to receive only the expected event.

**FakeXHR:** a minimal class that records `addEventListener('load', cb)` calls and fires them via `Promise.resolve().then(...)` from its `send()` method — giving PatchedXHR time to register the listener before it fires.

### cache tests (`cache.test.ts`)

Mock `idb-keyval` at the top of the file (hoisted by Vitest):

```typescript
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => 'mock-store'),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  entries: vi.fn(),
}))
```

Per-test setup uses `vi.mocked(get).mockResolvedValue(...)` etc. The store key `'mock-store'` is the sentinel returned by `createStore` and should appear as the second argument in all `get`/`set`/`del`/`entries` calls.

### content tests (`content.test.ts`)

`chrome` global must be hoisted before `content.tsx` is imported (module-level `chrome.storage.local.get` call):

```typescript
vi.hoisted(() => {
  ;(globalThis as any).chrome = {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}) },
      onChanged: { addListener: vi.fn() },
    },
  }
})
```

Call `__testResetState()` in `beforeEach` to avoid `rateLimitResetAt` / `checkedThisSession` leaking between tests.

The swipe listeners are attached to `document.body` at import time, so the gesture is testable end-to-end — happy-dom implements `TouchEvent`, and plain `{ clientX, clientY }` objects are accepted as `touches` / `changedTouches`. Dispatch with `bubbles: true` from the article so the event reaches `body`.

### cache tests and the TTL boundary

Several tests pin an entry exactly on the 30-day boundary (`fetchedAt: Date.now() - THIRTY_DAYS_MS`), where the expected answer flips if one millisecond elapses before `cache.ts` reads its own `Date.now()`. The file freezes the clock (`vi.useFakeTimers()` in a top-level `beforeEach`) for that reason — without it the suite fails intermittently, and only under load.

---

## Location names & aliases (countries.ts)

`COUNTRY_FLAGS` / `REGION_FLAGS` are keyed by the vocabulary X itself reports —
ISO-official spellings like `Russian Federation`, `Viet Nam`, `Korea`. Users don't
type those, and X may not always report the same one, so `LOCATION_ALIASES` maps
each canonical name to its alternates (`USA` / `America`, `Russia`, `Vietnam`,
`Türkiye`, `DRC`, `Holland`, ISO codes, common native names).

`canonicalLocation(name)` folds any of them — case- and whitespace-insensitively —
onto the canonical name; unknown locations pass through trimmed, since X's
vocabulary isn't ours to police and a name we don't know yet must still be
blockable. **Every comparison against `blockedCountries` goes through it**
(`isBlockedLocation()` in content.tsx), and the set itself is canonicalised on
load, so a list saved as `Czech Republic` blocks a profile X reports as `Czechia`
and vice versa. Flag lookups canonicalise too, so an alias gets its flag rather
than the 🌐 fallback.

A handful of aliases (`Czech Republic`, `Macedonia`) are *also* flag-map keys —
they stay there for direct display but resolve to one canonical entry, and
`CANONICAL_LOCATIONS` (what the options-page picker offers) filters them out via
`canonicalLocation(name) === name`. Aliases win over their own identity mapping,
which is why `countries.test.ts` asserts an alias that shadows a real flag key
must carry the *same emoji* as its canonical — that guard is what stops a future
`Ireland → United Kingdom` from silently swallowing a country.

The `Autocomplete` takes the table as its `aliases` prop and ranks matches
whole-string → prefix → substring, name before alias at each tier ("us" offers
United States before Belarus). `renderOption(opt, matchedAlias)` gets the alias
that earned the row its place — only when the name itself didn't match — and the
options page shows it muted on the right.

## Chrome storage keys (countries.ts)

```typescript
BLOCKED_COUNTRIES_KEY = 'blockedCountries'
HIGHLIGHT_KEYWORDS_KEY = 'highlightKeywords'
HIGHLIGHT_FLAGS_KEY = 'highlightFlags'
SHOW_LOCATION_IN_FEED_KEY = 'showLocationInFeed' // default OFF
HIDE_BLOCKED_LOCATIONS_KEY = 'hideBlockedLocations' // 'off' | 'collapse' | 'hide'; default 'collapse'
BACKGROUND_PREFETCH_KEY = 'backgroundPrefetch' // default ON
PREFETCH_SHARE_KEY = 'prefetchShare' // fraction of the window prefetch may use; default 0.7
PREFETCH_PACING_KEY = 'prefetchPacing' // 'spread' | 'instant'; default 'spread'
SHARED_CACHE_KEY = 'sharedCacheEnabled' // default ON (inert without CACHE_API_BASE); master switch for prefetch
OPTIONS_SECTIONS_KEY = 'optionsSections' // options-page accordion open/closed state
```

`PREFETCH_SHARE_KEY` / `PREFETCH_PACING_KEY` are the options page's two prefetch dials, both applied live (no reload): `content.tsx` pushes them into the prefetcher via `setReserveFraction()` / `setPacing()` on load and again from `chrome.storage.onChanged`. `normalizePrefetchShare()` **snaps to the nearest `PREFETCH_SHARE_CHOICES` entry** (0.3 / 0.5 / 0.7 / 0.9, comparing in whole percent so exact ties go to the smaller share) — so storage, UI and content script can never hold a value the `<select>` can't display. `LOOKUP_LIMIT_PER_WINDOW` (50) and `LOOKUP_WINDOW_MINUTES` (15) also live in countries.ts; the first seeds content.tsx's live budget, and both are the figures the options page quotes and derives its "one lookup every Ns" estimate from.

`OPTIONS_SECTIONS_KEY` holds `Record<OptionsSectionId, boolean>` (`keywords` | `flags` | `exceptions` | `prefetch` | `blocked`); `normalizeOptionsSections()` merges it over `DEFAULT_OPTIONS_SECTIONS` and drops unknown ids. Restoring it flips `details.open` programmatically, which **also fires `toggle`** — so `toggleSection()` in `options.tsx` must use a functional `setSections` update, or that event clobbers the freshly loaded state with a stale closure.

Default blocked regions set on install (service-worker.ts):  
`['Africa', 'India', 'South Asia', 'Nigeria', 'Pakistan', 'Bangladesh']`

---

## Build & test

```bash
pnpm install
pnpm dev         # watch build for Chrome (default)
pnpm build       # production build all browsers → dist/<browser>/
pnpm test        # vitest run --coverage  (happy-dom, Istanbul)
pnpm fix         # oxfmt + oxlint --fix
pnpm e2e:profile # seed a real-browser profile for the e2e suite (see below)
pnpm test:e2e    # playwright under xvfb
```

Test environment: **Vitest 4 + happy-dom**. Globals enabled (`describe`, `it`, `expect`, `vi` — no imports needed). Coverage via Istanbul to `coverage/`.

**Use pnpm 11 for `pnpm install`.** `node_modules` here was written by pnpm 11, but nvm's `pnpm` on `PATH` is 10.x and shadows it. Installing with 10 aborts with `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` — pnpm wanting to wipe and rebuild a modules dir from a different major, and unable to prompt. That error is about the version mismatch, not about anything wrong with the dependency you are adding; `CI=true` "fixes" it only by letting the wipe happen. Run `/home/alex/.local/share/pnpm/bin/pnpm install` (11.0.9) instead.

### E2E recording proxy (`test-proxy-recorder`)

Replay/record is [`test-proxy-recorder`](https://test-proxy-recorder.dev) — `playwrightProxy.before(page, testInfo, MODE, { url })` in `fixtures.ts`, plus the `webServer` block in `playwright.config.ts` pointing at `http://localhost:8100/__control`.

It ships agent skills (`proxy-setup`, `nextjs-ssr`, `tanstack-start`) via `@tanstack/intent`; the discovery block at the top of `AGENTS.md` is what points an agent at them. Before changing fixtures, the config, or the record/replay wiring, load the relevant one:

```bash
pnpm dlx @tanstack/intent@latest list
pnpm dlx @tanstack/intent@latest load test-proxy-recorder#proxy-setup
```

`proxy-setup` is the relevant one — the other two are Next.js / TanStack Start SSR and don't apply to an extension. `intent.skills` in `package.json` is the allowlist of packages whose skills may surface; without it the tool warns that a future version will require one.

Note that **secret redaction has been on by default since 1.0.2** — Authorization / Cookie / Set-Cookie headers are stripped when *recording*. Replaying existing HARs is unaffected.

### E2E browser profile

X blocks Playwright's bundled Chromium, so `e2e/scripts/seed-profile.mjs` launches a **real** Brave/Chromium on its own profile dir (`e2e/.auth/seed-profile`), you log in manually, and closing the window copies the profile to `e2e/.auth/profile` + writes `e2e/.auth/profile.json` (`{ browser, executablePath, profileDir, seededAt }`).

`fixtures.ts` reads that manifest: present → clone the profile to a temp dir and launch **that binary** via `executablePath` (no `state.json` cookie replay); absent → the old bundled-Chromium + `state.json` path. `E2E_SEED_PROFILE=0` forces the old path for one run.

Gotchas:

- Options-page accordions persist their open/closed state, so never click a `summary` blind to open a section — a click closes one that a default or a previous step already opened. Use `setSectionOpen(page, section, true)` from `helpers.ts`, which clicks only when needed and waits for the storage write. `setCheckboxOption()` handles this on its own — a collapsed section is `display:none`, so it force-opens the checkbox's `<details>` ancestor before clicking.
- Scope options-page locators to their section (`optionsSection(page, 'blocked').locator('select')`). A bare `locator('select')` was unique until the prefetch share dropdown shipped, then failed strict mode — the same trap waits for any `input`/`button` locator.
- Don't index into the article list — use `TWEET_ARTICLE` / `PRIMARY_TWEET` / `tweetArticles()` / `waitForReplies()` / `nthReply(page, n)` from `helpers.ts`. `nthReply` counts **replies**, sidestepping the off-by-one a raw `.nth()` walks into: when the page's own tweet is itself a reply, its parent renders *above* it, so replies don't start at a fixed row. `mostLikedReply()` goes further and re-anchors on the author's handle, because X's virtualised timeline recycles rows out from under an `nth()` handle.
- Which reply a test picks is often pinned by its recording, not free choice — the HAR only holds the pages that were visited at record time. The second-level-reply test needs reply **2** specifically (reply 1 has no thread under it); say so at the call site so nobody "fixes" it to reply 1.
- Seeding must launch with `--password-store=basic` — Playwright always does, and cookies encrypted against the OS keyring can't be decrypted without it.
- Cookies are only committed to SQLite on clean shutdown (or a ~30 s timer), so the browser must be **closed**, not killed.
- Branded Google Chrome ≥ M137 ignores `--load-extension`; the extension silently never loads. Use Brave or Chromium.
- Anti-detection args in the fixture: `--disable-blink-features=AutomationControlled` + `ignoreDefaultArgs: ['--enable-automation']` → `navigator.webdriver === false`.

### Firefox is checked by hand, not by Playwright

`pnpm dev:firefox` builds the Firefox target and hands it to `web-ext run` on a
persistent profile under `e2e/.auth/firefox-profile` (gitignored — it holds a live X
session), starting at x.com. Log in once and the profile carries it forward. Firefox
MV3 treats `host_permissions` as **user-granted**, so on the first run the extension
does nothing until you allow x.com from the extensions button — that is the platform's
model, not a bug, and it applies to real users too.

**Do not try to point the Playwright suite at Firefox.** Verified against Playwright
1.59.1 / Firefox 148, in this order:

- Playwright has no API to install a Firefox extension — not in the main surface, not
  in its BiDi path.
- Sideloading an XPI into `<profile>/extensions/` is silently ignored (Firefox removed
  that in 74). The profile's `extensions.json` comes back holding only Mozilla built-ins.
- Installing over the remote debugging protocol (`installTemporaryAddon`, what web-ext
  uses) **does** work, and `extensions.webextensions.uuids` pins the `moz-extension`
  UUID so the options URL is predictable.
- But Playwright cannot navigate to `moz-extension://` pages at all — `page.goto` never
  commits and the target closes, under `load`/`domcontentloaded`/`commit`, headless and
  headed alike. That kills it: `openOptionsPage()` drives four of the six spec files,
  `extensionId` scrapes `chrome://extensions/`, and `pinExtension()` needs
  `chrome.developerPrivate`.
