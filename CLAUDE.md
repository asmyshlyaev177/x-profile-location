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

| File                            | Purpose                                                                                                                                                     |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/scripts/page-script.ts`    | Injected into `world: MAIN`. Wraps `fetch` + `XMLHttpRequest`. Captures auth headers; extracts bios from HomeTimeline/TweetDetail.                          |
| `src/scripts/content.tsx`       | Content script. Listens for events from page-script, calls `AboutAccountQuery`, injects DOM rows, runs MutationObserver, handles keyword/flag highlighting. |
| `src/scripts/extract-users.ts`  | Recursive GraphQL response walker. Finds `__typename: 'User'` nodes up to depth 20.                                                                         |
| `src/scripts/cache.ts`          | IndexedDB wrapper (idb-keyval). 14-day TTL. Keys are lowercased usernames.                                                                                   |
| `src/scripts/countries.ts`      | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR` maps + storage key constants.                                                                                |
| `src/scripts/grapheme.ts`       | Grapheme-cluster-aware substring search, used for keyword highlight matching.                                                                               |
| `src/scripts/service-worker.ts` | Background script. Sets `blockedCountries` defaults in `chrome.storage.local` on install.                                                                   |
| `src/pages/options.tsx`         | Preact options page: blocked countries, keyword highlights, flag-count threshold.                                                                           |
| `src/components/Autocomplete/`  | Reusable Preact autocomplete used in the options page.                                                                                                      |

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

`LocationData` is stored in IDB with `{ data: LocationData, fetchedAt: number }`. TTL is 14 days.

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

---

## Chrome storage keys (countries.ts)

```typescript
BLOCKED_COUNTRIES_KEY = 'blockedCountries'
HIGHLIGHT_KEYWORDS_KEY = 'highlightKeywords'
HIGHLIGHT_FLAGS_KEY = 'highlightFlags'
```

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
```

Test environment: **Vitest 4 + happy-dom**. Globals enabled (`describe`, `it`, `expect`, `vi` — no imports needed). Coverage via Istanbul to `coverage/`.
