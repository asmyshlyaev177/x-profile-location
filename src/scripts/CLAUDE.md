# `src/scripts` — runtime

Everything the extension does at runtime. Root `CLAUDE.md` has the pipeline diagram
and the file map; this is the detail behind it.

---

## Inventory

The one list — root `CLAUDE.md` carries a short orientation subset, nothing else
duplicates it.

| File                 | Purpose                                                                             |
| -------------------- | ----------------------------------------------------------------------------------- |
| `page-script.ts`     | `world: MAIN`. Wraps `fetch` + `XHR`; captures auth headers, extracts bios.         |
| `content.tsx`        | The MutationObserver, everything drawn into a post or card, and the redraw cycle.   |
| `content/tweet-dom`  | X's selectors and the readers over them — the one file a renamed testid breaks.     |
| `content/filters`    | The filter settings and the verdict: does a rule act on this account, and which.    |
| `content/highlight`  | The keyword/flag rule, its settings, and the marks it paints on a hover card.       |
| `content/lookup`     | One `AboutAccountQuery`, deduped and reported to the broker.                        |
| `content/overlays`   | The bottom-centre slot: rate-limit countdown, swipe answer, rating ask.             |
| `content/enabled`    | The master switch. One boolean, asked from everywhere.                              |
| `content/bio-cache`  | In-memory bio/facts LRU, so the highlight rule reads without awaiting IDB.          |
| `content/chips`      | `accountChips` — the account card's vocabulary, one builder per fact X returned.    |
| `content/resize`     | `whenSafeToResize` — collapse a post without X scrolling the window under it.       |
| `content/snapshot`   | `decorateSnapshot` — the post as it goes into a shared image.                       |
| `extract-users.ts`   | Recursive GraphQL walker. Finds `__typename: 'User'` nodes to depth 20.             |
| `cache/cache.ts`     | IndexedDB wrapper (idb-keyval). 30-day TTL, keys are lowercased usernames.          |
| `cache/shared-cache` | Client for the optional community cache; batch lookup + contribute, opt-in.         |
| `prefetch/queue`     | `CandidateQueue` plus the pacing arithmetic. No timers, no state of its own.        |
| `prefetch/broker`    | Service worker. One queue per tab, one ledger, one pace. No browser needed to test. |
| `prefetch/poller`    | Asks the broker, looks up, asks again. Holds the clock the worker cannot.           |
| `countries/*.ts`     | Country and region data only: flags, abbreviations, members, aliases.               |
| `countries/names`    | Country/region names per locale, from flag emoji via `Intl.DisplayNames`.           |
| `profile.ts`         | Parses `AccountFacts` off a User node — timeline or AboutAccountQuery alike.        |
| `source.ts`          | The one place X's `source` is read: platform + store country, plus the SVG glyphs.  |
| `settings.ts`        | Every setting, its normalizer and its default. The only way to read one.            |
| `usage.ts`           | Active-day counter and the single rule behind the store-rating ask.                 |
| `snapshot.ts`        | Clones an element, inlines styles and images, renders to PNG via `foreignObject`.   |
| `share-card.ts`      | Hand-drawn fallback card. Layout is pure (testable); drawing is not.                |
| `watermark.ts`       | The mark both image paths put in the corner. Picks its ink from the backdrop.       |
| `keywords.ts`        | Grapheme-aware keyword matching over `Intl.Segmenter` (was `grapheme.ts`).          |
| `constants.ts`       | Cross-context event names (`EVENTS`) and `CACHE_API_BASE`.                          |
| `device.ts`          | `isMobile` — touch points plus a 1024px screen width; gates the swipe.              |
| `i18n.ts`            | `t(key, …subs)` over `chrome.i18n`, plus `uiLocale()`. Honours a chosen language.   |
| `styles.ts`          | The injected stylesheet **and** the class/attribute names it is written against.    |
| `service-worker.ts`  | `blockedCountries` defaults on install; the toolbar badge; the broker's plumbing.   |

---

## API: AboutAccountQuery

```text
GET https://x.com/i/api/graphql/XRqGa7EeokUU5kppkh13EA/AboutAccountQuery
    ?variables=%7B%22screenName%22%3A%22username%22%7D
Headers, captured from the page's own requests: authorization: Bearer <token>,
x-csrf-token (falls back to the ct0 cookie), x-twitter-client-language,
x-twitter-active-user: yes, content-type: application/json

→ data.user_result_by_screen_name.result.about_profile
    { account_based_in: "United States", location_accurate: true, source: "web" }
```

`source` is `"web"`, `"Japan Android App"`, `"India App Store"`, or `null`.

**Rate limit: 50 requests / 15-minute window** (per-user, per-endpoint; measured
2026-07-25) — a limit on the **X session**, not a tab, so every open tab spends from the
same 50. X returns `x-rate-limit-limit` / `-remaining` / `-reset` on **every** response,
not just 429s; `content.tsx` passes them on (`readRateHeaders` → `LOOKUP_REPORT`) and the
worker keeps the one ledger covering hovers, swipes and prefetch across every tab.

Two features live in folders of their own, docs included: background lookups in
[`prefetch/`](prefetch/CLAUDE.md) — the queue, the pace, the cross-tab broker — and the
caches in [`cache/`](cache/CLAUDE.md), local and community. Country names, their aliases
and the picker's vocabulary are in [`countries/`](countries/CLAUDE.md); everything the extension
draws into X — the rows, the filters, the gestures — is in [`content/`](content/CLAUDE.md).

---

## Data types

```typescript
// cache.ts — stored as { data: LocationData, fetchedAt: number }, TTL 30 days
interface LocationData {
  location: string | null // "United States", "South Asia", …
  locationAccurate: boolean // false → VPN likely
  source: `${string} Android App` | `${string} App Store` | 'web' | null
  bio?: string | null
  displayName?: string | null
  facts?: Partial<AccountFacts>
}

// extract-users.ts
interface UserBio {
  userName: string // screen name, not display name
  displayName: string | null
  bio: string | null
  facts: Partial<AccountFacts> // only the fields this node carried
}

// profile.ts
interface AccountFacts {
  createdAt: number | null // epoch ms, parsed from X's own date format
  affiliation: Affiliation | null // { handle, name, badgeUrl }
  handleChanges: number | null // AboutAccountQuery only
  restId: string | null
  blueVerified: boolean | null
  verified: boolean | null
  identityVerified: boolean | null
  isProtected: boolean | null
  blockedBy: boolean | null // timeline nodes only; null ≠ false
}
```

**`facts` is merged, never replaced.** Each source knows a different subset — a timeline
node carries the relationship and no handle history, AboutAccountQuery the reverse.
`mergeCached` deep-merges that one key while shallow-spreading the rest, and
`definedFacts()` strips nulls on the way in, so a thin sighting cannot blank a richer one.

**`created_at` is parsed by hand** (`parseXDate`), not `Date.parse` — the format is
outside the spec, so V8 accepting it says nothing about Firefox or Safari, and a wrong
answer here is an account age shown next to somebody's name.

---

## extract-users.ts

Recurses object values and array items to **depth 20** (hard stop). A node is a User if
`obj.__typename === 'User'`. **screen_name:** `core.screen_name` · **bio:**
`profile_bio.description` → `legacy.description` · **display name:** `core.name`. Returns
`[]` for primitives, null/undefined, or when no screen_name is found.

⚠ **X's `legacy` object is not read any more.** Identity moved to `core`, bio to
`profile_bio`, verification to `verification`, privacy to `privacy`, the relationship to
`relationship_perspectives`. Measured August 2026: across 1021 User nodes in
`e2e/recordings/`, `legacy.screen_name` / `.name` / `.verified` / `.protected` /
`.created_at` / `.blocked_by` appear **zero** times; on 57 live nodes `legacy` is **empty
on every one**. `followers` went with it (X shows the count on its own card). Re-measure
before reinstating anything, and hook **both** `fetch` and `XMLHttpRequest` when you do —
X sends GraphQL over XHR, so a fetch-only hook records nothing and looks clean.

---

---

## page-script.ts

The IIFE checks `window.__X_LOC_INJECTED__` and exits if set, preventing double-patching.
`headersCaptured` makes `x-loc-headers-captured` fire **once** per page load;
`storedHeaders` lets late subscribers dispatch `x-loc-request-headers` to have them
re-emitted.

---

## Localization (i18n.ts)

Catalogues live in `public/_locales/<locale>/messages.json`, copied verbatim by Vite's
publicDir, so the browser loads exactly one locale and the bundle carries no strings. That
is also what localizes the **store listing**: `default_locale` plus `__MSG_appName__` in
the manifest points Chrome and AMO at the same files.

`chrome.i18n` follows the browser's UI language with no override, which isn't good enough —
plenty of people read Russian in an English Chrome. A chosen language is honoured by loading
that catalogue ourselves and answering from it first (`chosen`); the browser stays the
default and the fallback, at one storage read when nobody has chosen.

**`uiLocale()` reads the locale out of the catalogue, not from the browser** — they
disagree. A Chrome started with `--lang=ru` serves the `ru` catalogue while _both_
`getUILanguage()` and `@@ui_locale` still report `en_US`, which rendered every country name
in English inside a fully Russian settings page. `localeTag` is one of the strings, so it
cannot disagree with the ones beside it; `messages.test.ts` holds each to its own directory.

**A content script can't read `_locales/` itself.** `fetch` on a `chrome-extension:` URL
from x.com needs the file in `web_accessible_resources`, and a fetchable extension URL is
something the page can probe for — the same reason the toolbar icon is inlined. So it asks
the worker (`GET_MESSAGES`), and nothing under `_locales/` is reachable from the page.

## Settings: keys, normalizers, defaults

```typescript
BLOCKED_COUNTRIES_KEY = 'blockedCountries'
HIGHLIGHT_KEYWORDS_KEY = 'highlightKeywords' // {text, mode}[]; mode default 'word'
HIGHLIGHT_FLAGS_KEY = 'highlightFlags'
SHOW_LOCATION_IN_FEED_KEY = 'showLocationInFeed' // default ON
HIDE_BLOCKED_LOCATIONS_KEY = 'hideBlockedLocations' // 'off' | 'collapse' | 'hide'; default 'collapse'
BACKGROUND_PREFETCH_KEY = 'backgroundPrefetch' // default ON
PREFETCH_SHARE_KEY = 'prefetchShare' // default 0.8
PREFETCH_PACING_KEY = 'prefetchPacing' // 'spread' | 'instant'; default 'spread'
SHARED_CACHE_KEY = 'sharedCacheEnabled' // default ON (inert without CACHE_API_BASE); master switch for prefetch

EXTENSION_ENABLED_KEY = 'extensionEnabled' // master switch; default ON
BLOCKED_AFFILIATIONS_KEY = 'blockedAffiliations' // parent-org handles
ACCOUNT_AGE_KEY = 'accountAgeFilter' // { enabled, days }; default off / 180; marks, never hides
RULE_EXCEPTIONS_KEY = 'ruleExceptions' // Record<FilterRule, string[]>
ALWAYS_SHOW_KEY = 'alwaysShowAccounts' // exempt from every rule
SHOW_ACCOUNT_CARD_KEY = 'showAccountCard' // default ON
SHOW_SHARE_BUTTON_KEY = 'showShareButton' // hover-card "Copy card" button; default ON
OPTIONS_TAB_KEY = 'optionsTab' // which settings tab is open
POPUP_SECTION_KEY = 'popupSection' // which popup accordion is open
THEME_KEY = 'theme' // 'system' | 'light' | 'dark'; default 'system'; extension pages only

USAGE_STATS_KEY = 'usageStats' // { activeDays, lastDay }
RATE_PROMPT_KEY = 'ratePrompt' // { status, snoozeUntil }
SHARED_CACHE_COUNT_KEY = 'sharedCacheCount' // { n, at }; what /v1/stats last said
```

**Nobody reads one of these by hand.** `SETTINGS_REGISTRY` (settings.ts) maps each key to
the one function that turns storage into the value the code uses, and because every
normalizer answers for `undefined`, that is also where the **default** lives. Three
readers: `readSetting(KEY, result)` from a `get()`, `settingValue(KEY, change.newValue)`
from an `onChanged` entry, `defaultSetting(KEY)` before storage has answered. This replaced
`KEY in result ? Boolean(result[KEY]) : true` at every reader, which had drifted twice: the
options page and content script disagreed on one default, and a key **removed** from
storage arrives as an undefined `newValue`, which `Boolean()` turned into `false` for
settings whose absence means `true`. The one deliberate exception: content.tsx starts
`hideMode` at `'off'`, not the stored `'collapse'`, so nothing is hidden on a guess before
the read resolves.

`USAGE_STATS_KEY` / `RATE_PROMPT_KEY` / `SHARED_CACHE_COUNT_KEY` are **not settings** and
are absent from the registry — an export is a record of decisions, and "has used this five
days" isn't one. `SHARED_CACHE_COUNT_KEY` is the one key opening the popup may write, which
is why the "writes nothing merely by being opened" test names it. The counter lives in
`buildInfoRow()`, the one place meaning "something visible happened today"; `usage.ts`
memoises the day so scrolling costs no reads.

Other notes:

- `HIGHLIGHT_EXCEPTIONS_KEY` still exists and is **still written** — it mirrors
  `ruleExceptions.highlight`, and reads merge the old key in (`normalizeRuleExceptions`),
  so writing only the new key would let a _removal_ come back from the stale copy.
  `content.tsx`, the options page and the importer keep them in agreement — a fourth writer
  must too.
- The popup and options page write the **same keys** and canonicalise identically
  (`canonicalLocation` before storing, keywords lowercased and sorted) via the shared
  `withKeyword` / `withLocation` helpers in settings.ts, or storage holds "USA" and "United
  States" as two filters.
- The popup's accordions are a button plus a conditional body, **not**
  `<details>`/`<summary>`: a `<details open>` fires `toggle` as it mounts, so restoring the
  remembered section wrote it straight back — the popup saved on every open. (happy-dom
  also doesn't implement summary-click toggling.) A test asserts that merely opening the
  popup writes nothing.
- `THEME_KEY` is applied by `src/pages/theme.ts`, which sets `data-theme` on `<html>` and
  nothing else. Palettes are `light-dark()` pairs per stylesheet, so 'system' writes no
  attribute and CSS resolves the OS preference without waiting for storage. The content
  script's marks on X follow X's theme instead.
- `PREFETCH_SHARE_KEY` / `PREFETCH_PACING_KEY` apply live via `setReserveFraction()` /
  `setPacing()`. `normalizePrefetchShare()` **snaps to the nearest `PREFETCH_SHARE_CHOICES`
  entry** (0.3/0.5/0.7/0.9, compared in whole percent so ties go to the smaller), so
  storage, UI and content script can never hold a value the `<select>` can't display.
  `LOOKUP_LIMIT_PER_WINDOW` (50) and `LOOKUP_WINDOW_MINUTES` (15) are in `countries/`.

Default blocked regions on install (service-worker.ts): `['Africa', 'India', 'South Asia',
'Nigeria', 'Pakistan', 'Bangladesh']`. ⚠️ This now **expands** — with `REGION_MEMBERS`,
seeding `Africa` and `South Asia` blocks ~60 countries on a fresh install. See
`ROADMAP.md` §1; the recommendation there is to ship `[]`.

### The rating ask

**Three surfaces show it, and `ratingAskDue()` is the only thing that decides**: the
toolbar badge (service-worker), the bar over X (`showRatingAsk`, `RATING_ASK_ID`), and the
popup card. They must agree, or a badge invites a click into an empty popup — hence pausing
clears the badge, and hence the hover card is **not** one of them (transient, re-rendered
dozens of times a session). It is decided **once per page, on the first flag drawn**,
re-armed by a `usageStats`/`ratePrompt` storage change, because X is left open for days.

`noteRatingAskShown()` writes a three-day snooze the moment the bar renders, so navigating
away doesn't re-ask, and it only ever writes from `idle` — never shorten a fortnight the
reader chose. The bar has **no dismiss timer** and **yields the bottom-centre slot**
(`showRateLimitToast` and `renderLocationToast` dismiss it), and it **names itself** (icon,
"X-Pat", sentence) because unattributed it reads as X asking. The icon is the shipped PNG
via Vite's `?inline`: `chrome.runtime.getURL` would need it in `web_accessible_resources`,
and the manifest deliberately exposes nothing under `assets/` — a fetchable extension URL is
something x.com can probe for passively, even while paused. The popup footer's `Rate ★` link
is **permanent** and ungated; clicking it records `done`.

⚠ **Two marks in this repo, not the same.** The extension icon (`src/assets/icons/*.png`,
blue X + question mark) and the site's mark (`landing/src/data/brand-mark.json`, cyan X on a
dark plate → `landing/public/favicon.svg`). Anything showing "the icon" to a user uses the
first; anything on the site, the second.

---

## Snapshots (snapshot.ts)

Clone the node, inline every computed style, re-embed every image as a data URI, then draw
it through `<foreignObject>`. Steps two and three cannot be skipped: an SVG data URL is a
**restricted context**, where no stylesheet of the page applies and no external resource is
fetched. Anything still pointing at a URL silently disappears; `<video>` cannot play, so it
is swapped for its `poster`. X's own webfont is behind such a URL too, so text falls back to
the system sans serif — close, not identical, and the reason `unclampText` exists: X sizes
its `text-overflow: ellipsis` boxes for its own font, and the wider fallback turns a name
that fitted into "Some Very Long Nam…".

Images are **fetched** rather than redrawn from the loaded element: X loads them without
`crossorigin`, so a canvas drawn from them is tainted and cannot be exported at all.
`credentials: 'omit'` — public CDN assets, and a snapshot has no business carrying cookies.
A refusal becomes a same-size placeholder. Every step degrades rather than aborting, and the
caller keeps the hand-drawn card for when the whole thing fails.

---

## Unit test patterns

The `*.test.ts` files beside this one run under `pnpm test` (vitest, happy-dom, Istanbul).
Run `pnpm test`, never a bare `vitest run` — the reason is in the root `CLAUDE.md` under
Build & test, and it is not cosmetic.

**page-script** — the IIFE runs at import time, so each test needs a fresh module:
`vi.resetModules()`, `delete window.__X_LOC_INJECTED__` and `vi.stubGlobal` for both `fetch`
and `XMLHttpRequest` in `beforeEach`, `vi.unstubAllGlobals()` after. Each import adds
another `'x-loc-request-headers'` listener and happy-dom reuses `window` within a file, so
tests checking `x-loc-headers-captured` should `vi.spyOn(window, 'dispatchEvent')` rather
than rely on `addEventListener`. `FakeXHR` fires its `load` listeners via
`Promise.resolve().then(...)` from `send()`, giving PatchedXHR time to register first.

**cache** — mock `idb-keyval` at the top of the file (hoisted); `'mock-store'` is the
`createStore` sentinel and should be the second argument everywhere. Several tests pin an
entry exactly on the 30-day boundary, where the answer flips if one millisecond elapses, so
the file freezes the clock (`vi.useFakeTimers()`) — without it the suite fails
intermittently, and only under load.

**content** — `chrome` must be hoisted before the import (`chrome.storage.local.get` runs at
module level), with `storage.local.get` and `storage.onChanged.addListener` stubbed. Call
`__testResetState()` in `beforeEach`. Swipe listeners attach to `document.body` at import
time, so the gesture is testable end-to-end — happy-dom implements `TouchEvent` and accepts
plain `{ clientX, clientY }` objects as `touches`/`changedTouches`. Dispatch with
`bubbles: true` from the article.
