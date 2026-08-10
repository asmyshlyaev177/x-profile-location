# CLAUDE.md — x-profile-location

Project-specific context. Read before editing any source file.

---

## How to comment

**The intent has to be readable without comments.** Names and tests carry it: a
function named for what it answers, a `describe`/`it` pair that reads as a
sentence. If a comment seems needed to explain what code does, rename or split it
until it isn't — a comment is not a substitute for either, and it is the only part
that can quietly stop being true. (`hasFacts` carried a docblock saying it was
true when there were _no_ facts. Nobody noticed, because nobody needed it.)

**If the name and what's around it already say it, say nothing.**
`RATE_PROMPT_IGNORED_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000` and `REVIEW_URL` need no
docblock; neither does `/** Whole days since the account was created. */` over
`accountAgeDays`. Deleting those is not losing anything — it is removing a second
copy of the name.

**Two lines is the ceiling**, and most comments should be none. What earns them:

- a constraint from outside — X's DOM, a browser bug, a spec, a store rule
- a measured fact a reader can't see (`all 57 User nodes carried an empty legacy`)
- a decision that reads as a mistake until you know why
- what broke last time

If the reasoning needs more than two lines, it is not a comment — it belongs in
**this file**, under the section for that area, and the source points at it by
name (`// … see "Localization" in CLAUDE.md`). That way it is findable by somebody
who isn't already looking at the line it hangs off, and there is one copy of it.
Source carries the note; CLAUDE.md carries the argument.

**Tests are the exception.** A spec file is where the reasoning belongs, and prose
is welcome there: why the case is worth pinning, what it regressed on, which
behaviour of X's forces the answer, what the bug looked like. The name still says
what is asserted — the comment says why anyone should care, which is the part a
reader cannot reconstruct from the assertion.

**A deleted comment often wants to become a test.** If it was describing
behaviour rather than a constraint, that is a missing assertion: the document
order `extractUsers` guarantees was a docblock nothing checked, and is now
`returns them in the order the timeline listed them`.

---

## Code quality

1. Avoid common anti-patterns — nested ternaries, `if`s nested more than 2 deep, and so on.
2. Maintain high readability and low complexity.
3. Reuse common helpers; don't copy-paste blindly.
4. Playwright tests for integration, unit tests for pure functions.
5. A value read in several places needs a single source of truth, not copies.

`pnpm lint` (oxlint) and `pnpm lint:dup` (jscpd) enforce the mechanical half of
this and the tree is at zero on both — keep it there. Where a rule is genuinely
wrong for the code in front of you, disable it **at the site with a one-line
reason** (`// oxlint-disable-next-line <rule>`, `/* jscpd:ignore-start */`)
rather than loosening the config. A JS-plugin rule needs its plugin prefix in the
disable comment (`sonarjs/cognitive-complexity`) — the bare name silently does
not match.

---

## What this extension does

Shows country flags / region abbreviations / VPN warnings inside X (Twitter) hover
cards and tweet articles. Location comes from X's own **`AboutAccountQuery`**
GraphQL endpoint, authenticated with the user's own session headers — no extra
credentials.

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

**Why two scripts?** The `fetch`/`XHR` wrappers must run in `world: MAIN` (same JS
context as the page) to intercept the page's own network calls. Content scripts
run isolated and cannot. Communication is via `window.dispatchEvent(new CustomEvent(...))`.

---

## Key files

| File                             | Purpose                                                                                                                        |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/scripts/page-script.ts`     | `world: MAIN`. Wraps `fetch` + `XMLHttpRequest`. Captures auth headers; extracts bios from HomeTimeline/TweetDetail.           |
| `src/scripts/content.tsx`        | Content script. Calls `AboutAccountQuery`, injects DOM rows, runs the MutationObserver, handles keyword/flag highlighting.     |
| `src/scripts/extract-users.ts`   | Recursive GraphQL walker. Finds `__typename: 'User'` nodes up to depth 20.                                                     |
| `src/scripts/cache.ts`           | IndexedDB wrapper (idb-keyval). 30-day TTL. Keys are lowercased usernames.                                                     |
| `src/scripts/prefetch-queue.ts`  | `CandidateQueue` (feed before replies, page order) plus the pacing arithmetic. No timers, no state of its own.                 |
| `src/scripts/lookup-broker.ts`   | Service worker. One queue per tab, one rate-limit ledger, one pace — the whole cross-tab decision, testable without a browser. |
| `src/scripts/prefetch-poller.ts` | Content script. Asks the broker what to look up, looks it up, asks again. Holds the clock the worker cannot.                   |
| `src/scripts/countries.ts`       | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR`, `REGION_MEMBERS` + every storage key.                                          |
| `src/scripts/profile.ts`         | Parses `AccountFacts` off a User node — timeline or AboutAccountQuery alike.                                                   |
| `src/scripts/source.ts`          | The single place X's `source` string is interpreted: platform + store country, plus the drawn SVG glyphs.                      |
| `src/scripts/settings.ts`        | Registry of every setting, its normalizer and its default. The only way to read one. Backs import/export.                      |
| `src/scripts/usage.ts`           | Active-day counter and the single rule deciding whether to ask for a store rating.                                             |
| `src/scripts/snapshot.ts`        | Clones a live element, inlines computed styles and images, renders to PNG via an SVG `foreignObject`.                          |
| `src/scripts/share-card.ts`      | Hand-drawn fallback card. Layout is pure (testable); drawing is not.                                                           |
| `src/scripts/watermark.ts`       | The mark both image paths put in the corner. Picks its ink from the backdrop it lands on.                                      |
| `src/scripts/grapheme.ts`        | Grapheme-cluster-aware substring search for keyword matching.                                                                  |
| `src/scripts/service-worker.ts`  | Sets `blockedCountries` defaults on install; owns the toolbar badge.                                                           |
| `src/pages/popup.tsx`            | Toolbar popup — master switch, feed flags, account card, filtered-post mode.                                                   |
| `src/pages/options.tsx`          | Preact settings page, five tabs (Display / Filters / Exceptions / Data & privacy / Advanced).                                  |
| `src/components/Autocomplete/`   | Reusable Preact autocomplete used in the options page.                                                                         |

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

`source` is `"web"`, `"Japan Android App"`, `"India App Store"`, or `null`.

**Rate limit: 50 requests / 15-minute window** (per-user, per-endpoint; measured
2026-07-25). It is a limit on the **X session**, not on a tab — every open x.com
tab spends from the same 50. X returns `x-rate-limit-limit` / `-remaining` /
`-reset` on **every** response, not just 429s; `content.tsx` passes them to the
service worker (`readRateHeaders` → `LOOKUP_REPORT`), which keeps the one ledger
covering hovers + swipes + prefetch across every tab.

### Prefetch

- Uses at most **70%** of the window (`reserveFraction`, user-settable), stopping
  once `remaining` hits the user's reserved share.
- **Paced**: `nextDelayMs()` recomputes `msLeftInWindow / budget` before every
  lookup (≈26 s), clamped to `[1.5 s, 2 min]`. Self-correcting — hovers stretch
  the gap, a rolled-over window shrinks it. `pacing: 'instant'` opts out of
  spreading (same share, spent at `minSpacingMs`).
- **Two queues** (`PrefetchPriority`): `high` (`HomeTimeline`) drains completely
  before `low` (`TweetDetail`) gets a single lookup. Each is plain FIFO — **page
  order**, so locations fill in down the feed as the user reads. Dedup keeps the
  slot a name first earned, in the queue and in page-script's replay buffer alike.
  `low → high` promotes; `high` never demotes. `maxQueue` overflow sheds from the
  **bottom**, emptying `low` first.
- The tweet the user actually **opened** skips the queue — `processPrimaryTweet()`
  fetches it directly.
- The **community cache is the master switch**: `prefetchAllowedBySettings()`
  requires `SHARED_CACHE_KEY`, since prefetch exists to warm it. The gate only
  applies when a server is configured (`!isSharedCacheConfigured() || isSharedCacheEnabled()`),
  so a build with an empty `CACHE_API_BASE` still prefetches. The options page
  mirrors this — the cache toggle leads **Background lookups** and disables
  everything below it.

### Cross-tab lookup broker (`lookup-broker.ts`)

Everything above describes **one** budget. Until this existed each tab kept its
own copy of the queue, the pace and the rate-limit state, and three symptoms
followed from that: two tabs on the same feed each spent a request on the same
account; a 429 in one tab was something every other tab had to earn for itself;
and an account X answered with no location for was re-asked by every new tab,
because "already checked" lived in a `Set` that died with the tab.

The queue, the pace and the ledger now live in the **service worker**, one
instance for the browser. `lookup-broker.ts` is that state and its rules;
`service-worker.ts` is only the message plumbing around it.

**Tabs pull; the worker never pushes work.** The clock has to live somewhere
that stays alive, and an MV3 worker does not: Chromium tears it down after ~30 s
idle and **a pending `setTimeout` dies with it, silently**. The paced gap is
≈26 s at the default share, ~60 s at 0.3, and up to 15 minutes when the budget
is spent or a 429 is in force — so a worker-side timer would stop the trickle
outright, and only an unrelated event would ever restart it. (`chrome.alarms`
would also work, at the cost of a permission and a 30 s floor.) So `content.tsx`
keeps its timer, `prefetch-poller.ts` loops `LOOKUP_NEXT → fetch → repeat`, and
the worker only ever runs inside a message handler, where it cannot be evicted.

| Message           | Direction | Carries                                                      |
| ----------------- | --------- | ------------------------------------------------------------ |
| `LOOKUP_ENQUEUE`  | tab → SW  | candidates, already filtered against **that tab's** IDB      |
| `LOOKUP_NEXT`     | tab → SW  | → `{ userName }` or `{ waitMs }`                             |
| `LOOKUP_REPORT`   | tab → SW  | whether a request went out, and X's headers if one did       |
| `LOOKUP_RATE`     | SW → tabs | the ledger, so a 429 anywhere shows the countdown everywhere |
| `LOOKUP_RESOLVED` | SW → tabs | a handle to re-read from IDB and redraw                      |

Details that are load-bearing:

- **The worker cannot read the cache.** A content script's IndexedDB is x.com's
  storage, not the extension's, so `LOOKUP_ENQUEUE` has to arrive pre-filtered.
- **State is mirrored to `chrome.storage.session` on every mutation and read
  back at the top of every handler** — the eviction above happens constantly,
  not rarely. `storage.session` is memory-only, so none of this touches disk and
  a browser restart starts clean. The write is **awaited before the handler
  answers**: left floating it is exactly the write that gets cut off.
- **Grant order is global**, and whoever polls gets the best entry anywhere:
  focused tab's feed, other visible tabs' feed, hidden tabs' feed, then the same
  three for thread replies. The fetching tab need not be the tab that queued it
  — that is what `LOOKUP_RESOLVED` is for — which is why no hold-back rule is
  needed to keep a background tab from stealing the focused tab's slot.
- **Hidden tabs still prefetch.** They are warming the community cache, and the
  budget they spend is the same budget either way.
- **`asked` replaces `checkedThisSession`** and is the fix for the third symptom:
  a handle X has answered for is not asked about again **until the window rolls**.
  Nothing is persisted — a location X does not have today it may have next week,
  so a negative answer must never outlive the budget window that paid for it.
- **Hovers never go through the broker.** They fetch immediately and only report
  afterwards, so an evicted or wedged worker can never delay the row the user is
  waiting on. `prefetch-poller.ts` is the only caller that awaits its report.
- **Everything fails open.** A rejected `sendMessage` costs background lookups
  until the worker comes back (`UNREACHABLE_RETRY_MS`), and nothing else.

### Shared cache backends (`CACHE_API_BASE`, constants.ts)

Which backend a build talks to is a build-time switch, never a source edit:

| Command              | Backend                               |
| -------------------- | ------------------------------------- |
| `pnpm build`         | self-hosted Node+SQLite box (default) |
| `pnpm build:worker`  | the Cloudflare Worker                 |
| `pnpm build:nocache` | feature fully inert                   |

Self-hosted is the default because D1's free plan caps out around 150 users on
rows-written/day — the ceiling this project outgrew (see "Backend" in
`server/README.md`). The Worker build is kept working and one command away: it is
still the cheapest way to stand up a new instance, and it is what
already-installed extensions keep talking to until their users update.

**The empty case is deliberate and reachable.** `??` only falls back on an _unset_
variable, so an empty `VITE_CACHE_API_BASE` disables the shared cache outright —
no requests to any server, and the options page hides the toggle
(`isSharedCacheConfigured`).

**The `?.` is for Playwright, not Vite.** The e2e suite imports this module through
Playwright's own TypeScript loader, which knows nothing of Vite and leaves
`import.meta.env` undefined — a bare property access throws at import time and
takes the whole suite down with it ("0 tests in 0 files"). Vite still substitutes
the full expression, and an explicitly empty value is still `''` rather than
`undefined`, so the disable case is unaffected.

### Community cache consensus (`minConfidence`, shared-cache.ts)

How many distinct clients must agree before a served location is trusted.

**Still 1, deliberately.** Measured 2026-07-27, 52 of 4242 profiles had reached 2,
so raising it today would drop what the cache can answer by ~99% — and a cache that
answers nothing costs more than it protects. `VOTE_CAP` keeps only the 10 newest
votes per handle anyway, so 2 guards against one honest-but-wrong client, not a
poisoner who can mint ids. Flip it once this is a majority:

```bash
sqlite3 /var/lib/x-loc-cache/x-loc-cache.db \
  'SELECT COUNT(*) AS profiles, SUM(location_confidence >= 2) AS ready FROM profiles;'
```

Stored under `MIN_CONFIDENCE_KEY` rather than compiled in, so it can be raised on
one install and measured without shipping a build.

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

**`facts` is merged, never replaced.** Each source knows a different subset — a
timeline node carries the relationship and no handle history, AboutAccountQuery
the reverse. `mergeCached` deep-merges that one key while shallow-spreading the
rest, and `definedFacts()` strips nulls on the way in so a thin sighting cannot
blank what a richer one supplied.

**`created_at` is parsed by hand** (`parseXDate`), not `Date.parse` — the format
is outside the spec, so V8 accepting it says nothing about a Firefox or Safari
build, and a wrong answer here is an account age shown next to somebody's name.

---

## extract-users.ts — parsing rules

- Recurses object values / array items to **depth 20** (hard stop).
- A node is a User if `obj.__typename === 'User'`.
- **screen_name:** `core.screen_name` · **bio:** `profile_bio.description` →
  `legacy.description` · **display name:** `core.name`
- Returns `[]` for primitives, null/undefined, or when no screen_name is found.

⚠ **X's `legacy` object is not read anywhere any more.** Identity moved to `core`,
bio to `profile_bio`, verification to `verification`, privacy to `privacy`, the
relationship to `relationship_perspectives`. Measured August 2026: across 1021
User nodes in `e2e/recordings/`, `legacy.screen_name` / `.name` / `.verified` /
`.protected` / `.created_at` / `.blocked_by` appear **zero** times; on 57 live
nodes `legacy` itself is **empty on every one**. `followers` went with it (X shows
the count natively on its own hover card, so the chip was redundant anyway).

Re-measure before reinstating anything, and hook **both** `fetch` and
`XMLHttpRequest` when you do — X sends GraphQL over XHR, so a fetch-only hook
records nothing and looks like a clean result.

---

## content.tsx — module-level state

| Variable             | Type                            | Purpose                                                                                                 |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `apiHeaders`         | `Record<string,string> \| null` | Captured auth headers; settable via `setApiHeaders()`                                                   |
| `checkedThisSession` | `Set<string>`                   | Usernames already attempted **in this tab**; the cross-tab answer is the broker's `asked`               |
| `pendingMap`         | `NormalizedMap<Promise>`        | In-flight fetches; concurrent hovers share one promise                                                  |
| `rateLimitResetAt`   | `number`                        | ms until the rate limit lifts; 0 when clear. Set by a 429 here **or** by `LOOKUP_RATE` from another tab |
| `blockedCountries`   | `Set<string>`                   | From `chrome.storage.local`; reloaded on change                                                         |
| `highlightKeywords`  | `Set<string>`                   | Same; all lowercased                                                                                    |

**`__testResetState()`** is exported for tests — clears `checkedThisSession` and
resets `rateLimitResetAt`.

### The bio X declined to render

An account that **blocks the signed-in user** gets a stripped hover card: avatar,
name, handle, a Grok button — no bio, no follow button, no counts. The extension
still judges the highlight rule from the timeline/`TweetDetail` bio, so the post
would be marked with nothing on the card to explain it. Two pieces answer that:

- **`🚫 Blocked you`** — an `accountChips` entry with its own `block` tone, not
  the amber `warn` one (amber means "a trait worth doubting"; being blocked is
  where the reader stands with the account, not a trait of it). It leads the card.
- **`syncBioRow()`** puts the bio back, _before_ `.x-loc-hover` rather than inside
  it — that keeps it under the handle and in reach of `keywordRangesIn`, so the
  matched word gets marked as it would in a bio X had rendered.

The row is gated on X's card not already showing a bio (`bioProbe` /
`cardShowsBio`), not on the block, so it covers whatever else X strips. The probe
drops URLs first (a t.co display form is the one part X doesn't render verbatim)
and discards probes under four characters, which would match a display name or
one of our own chips. `syncBioRow` runs twice per card and **rebuilds rather than
appends**, so a card React fills in late doesn't end up with two bios.

`blockedBy` is `null` when X sent no relationship at all (`AboutAccountQuery`
carries none) — deliberately not the same answer as `false`.

### The mobile swipe gesture

Swipe-right on a tweet looks up its author. It **commits mid-drag on `touchmove`**,
not `touchend` — waiting for the finger to lift spent the rest of the swipe before
the lookup started. `touchend` is a backstop for flicks where touchmove coalescing
never reported a position past the threshold; `touchcancel` abandons. A `handled`
flag (reset on `touchstart`) makes it fire at most once per gesture.

The tweet is resolved from the **`touchstart`** target and remembered — by the time
the threshold is crossed the finger may be off the article.

`isCommittedSwipe(dx, dy)` (exported for tests): ≥40px rightward, ≤50px drift,
**and** `dx >= |dy| * 1.5`. That last clause is what firing mid-drag made
necessary — a vertical fling on a slight diagonal satisfies both raw thresholds
long before it is recognisably horizontal.

`renderLocationToast(text, pending)` backs the overlay. A `pending` toast has no
auto-dismiss timer, so **every pending toast must be resolved by a later call**.
`dismissLocationToast()` (show nothing) is for when the lookup couldn't be
_attempted_ — rate-limited, or no headers yet — as opposed to X having no answer:
`#x-loc-rate-toast` sits at the same `bottom: 24px`, so a `'No location'` toast
would render on top of the countdown.

---

## page-script.ts — re-injection guard

The IIFE checks `window.__X_LOC_INJECTED__` and exits if set, preventing
double-patching. `headersCaptured` ensures `x-loc-headers-captured` fires **once**
per page load; `storedHeaders` lets late subscribers dispatch
`x-loc-request-headers` to have them re-emitted.

---

## Location names & aliases (countries.ts)

`COUNTRY_FLAGS` / `REGION_FLAGS` are keyed by the vocabulary X reports — ISO
spellings like `Russian Federation`, `Viet Nam`, `Korea`. Users don't type those,
so `LOCATION_ALIASES` maps each canonical name to its alternates (`USA`,
`Russia`, `Vietnam`, `Türkiye`, `DRC`, `Holland`, ISO codes, native names).

`canonicalLocation(name)` folds any of them case- and whitespace-insensitively;
unknown locations pass through trimmed, since a name we don't know yet must still
be blockable. **Every comparison against `blockedCountries` goes through it**
(`isBlockedLocation()`), and the set is canonicalised on load, so a list saved as
`Czech Republic` blocks a profile X reports as `Czechia`. Flag lookups
canonicalise too.

A few aliases (`Czech Republic`, `Macedonia`) are _also_ flag-map keys — kept for
direct display, filtered out of `CANONICAL_LOCATIONS` (the picker's list) via
`canonicalLocation(name) === name`. `countries.test.ts` asserts an alias that
shadows a real flag key carries the _same emoji_ as its canonical — that guard is
what stops a future `Ireland → United Kingdom` swallowing a country.

`Autocomplete` takes the table as its `aliases` prop and ranks whole-string →
prefix → substring, name before alias at each tier. `renderOption(opt, matchedAlias)`
gets the alias that earned the row its place, only when the name itself didn't match.

---

## Localization (i18n.ts)

Catalogues live in `public/_locales/<locale>/messages.json` and are copied verbatim
by Vite's publicDir, so the browser loads exactly one locale and the bundle carries
no strings. That is also what localizes the **store listing**: `default_locale` plus
`__MSG_appName__` in the manifest points Chrome and AMO at the same files, so a
translation lands on the listing and in the UI at once.

`chrome.i18n` follows the browser's UI language with no way to override it, which
isn't good enough — plenty of people read Russian in an English Chrome. A chosen
language is honoured by loading that catalogue ourselves and answering from it
first (`chosen`); the browser stays the default and the fallback, and costs one
storage read when nobody has chosen anything.

**`uiLocale()` reads the locale out of the catalogue, not from the browser** — they
disagree. A Chrome started with `--lang=ru` serves the `ru` catalogue while _both_
`getUILanguage()` and `@@ui_locale` still report `en_US`, which rendered every
country name in English inside an otherwise fully Russian settings page. `localeTag`
is one of the strings, so it cannot disagree with the ones beside it;
`messages.test.ts` holds each to its own directory name.

**A content script can't read `_locales/` itself.** `fetch` on a
`chrome-extension:` URL from x.com needs the file in `web_accessible_resources`,
and a fetchable extension URL is something the page can probe for — the same reason
the toolbar icon is inlined. So it asks the service worker (`GET_MESSAGES`), and
nothing under `_locales/` is reachable from the page.

---

## Chrome storage keys (countries.ts)

```typescript
BLOCKED_COUNTRIES_KEY = 'blockedCountries'
HIGHLIGHT_KEYWORDS_KEY = 'highlightKeywords'
HIGHLIGHT_FLAGS_KEY = 'highlightFlags'
SHOW_LOCATION_IN_FEED_KEY = 'showLocationInFeed' // default ON
HIDE_BLOCKED_LOCATIONS_KEY = 'hideBlockedLocations' // 'off' | 'collapse' | 'hide'; default 'collapse'
BACKGROUND_PREFETCH_KEY = 'backgroundPrefetch' // default ON
PREFETCH_SHARE_KEY = 'prefetchShare' // default 0.7
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
```

**Nobody reads one of these by hand.** `SETTINGS_REGISTRY` (settings.ts) maps each
key to the one function that turns storage into the value the code uses, and
because every normalizer answers for `undefined`, that is also where the
**default** lives. Three readers:

```typescript
readSetting(KEY, result) // from a chrome.storage.local.get()
settingValue(KEY, change.newValue) // from an onChanged entry
defaultSetting(KEY) // before storage has answered
```

This replaced `KEY in result ? Boolean(result[KEY]) : true` written out at every
reader, which had already drifted in two ways: the options page and content script
disagreed on one default, and a key **removed** from storage arrives as an
undefined `newValue`, which `Boolean()` turned into `false` for settings whose
absence means `true`.

The one deliberate exception: content.tsx starts `hideMode` at `'off'`, not the
stored default `'collapse'`, so nothing is hidden on a guess before the read resolves.

`USAGE_STATS_KEY` / `RATE_PROMPT_KEY` are **not settings** and are absent from the
registry — an export is a record of decisions, and "has used this five days" isn't
one. The counter lives in `buildInfoRow()`, the one place meaning "something
visible happened today"; `usage.ts` memoises the day so scrolling costs no reads.

### The rating ask

**Three surfaces show it, and `ratingAskDue()` is the only thing that decides**:
the toolbar badge (service-worker), the bar over X (`showRatingAsk`,
`RATING_ASK_ID`), and the popup card. They must agree, or a badge invites a click
into an empty popup — hence pausing clears the badge, and hence the hover card is
**not** one of them (transient, re-rendered, dozens of times a session).

- Decided **once per page, on the first flag drawn**, re-armed by a
  `usageStats`/`ratePrompt` storage change — X is the page people leave open for days.
- `noteRatingAskShown()` writes a three-day snooze the moment the bar renders, so
  navigating away doesn't re-ask. It only ever writes from `idle` — never shorten
  a fortnight the user chose.
- The bar has **no dismiss timer** and **yields the bottom-centre slot**:
  `showRateLimitToast` and `renderLocationToast` dismiss it.
- It **names itself** (icon, "X-Pat", sentence) — unattributed, it reads as X asking.
- The icon is the shipped PNG via Vite's `?inline` (a data URI).
  `chrome.runtime.getURL` would need it in `web_accessible_resources`, and the
  manifest deliberately exposes nothing under `assets/` — a fetchable extension
  URL is something x.com can probe for passively, even while paused.
- The popup footer's `Rate ★` link is **permanent** and ungated; clicking it
  records `done`.

⚠ **Two marks in this repo, not the same.** The extension icon
(`src/assets/icons/*.png`, blue X + question mark) and the site's mark
(`landing/src/data/brand-mark.json`, cyan X on a dark plate → `landing/public/favicon.svg`).
Anything showing "the icon" to a user uses the first; anything on the site, the second.

### Other storage notes

- `HIGHLIGHT_EXCEPTIONS_KEY` still exists and is **still written** — it mirrors
  `ruleExceptions.highlight`. Reads merge the old key in (`normalizeRuleExceptions`),
  so writing only the new key would let a _removal_ come back from the stale copy.
  `content.tsx` (`writeRuleExceptions`), the options page (`writeExceptions`) and
  the importer all keep them in agreement — a fourth writer must too.
- The popup and options page write the **same keys** and canonicalise identically
  (`canonicalLocation` before storing, keywords lowercased and sorted) via the
  shared `withKeyword` / `withLocation` helpers in settings.ts. A third editor has
  to match, or storage holds "USA" and "United States" as two filters.
- The popup's accordions are a button plus a conditional body, **not**
  `<details>`/`<summary>`: a `<details open>` fires `toggle` as it mounts, so
  restoring the remembered section wrote it straight back — the popup saved on
  every open. (happy-dom also doesn't implement summary-click toggling.) A test
  asserts that merely opening the popup writes nothing.
- `THEME_KEY` is applied by `src/pages/theme.ts`, which sets `data-theme` on
  `<html>` and nothing else. Palettes are `light-dark()` pairs per stylesheet, so
  'system' writes no attribute and CSS resolves the OS preference without waiting
  for storage. The content script's marks on X are excluded — they follow X's theme.
- `PREFETCH_SHARE_KEY` / `PREFETCH_PACING_KEY` apply live via
  `setReserveFraction()` / `setPacing()`, on load and from `onChanged`.
  `normalizePrefetchShare()` **snaps to the nearest `PREFETCH_SHARE_CHOICES`
  entry** (0.3/0.5/0.7/0.9, comparing in whole percent so ties go to the smaller),
  so storage, UI and content script can never hold a value the `<select>` can't
  display. `LOOKUP_LIMIT_PER_WINDOW` (50) and `LOOKUP_WINDOW_MINUTES` (15) are
  also in countries.ts.

Default blocked regions on install (service-worker.ts):
`['Africa', 'India', 'South Asia', 'Nigeria', 'Pakistan', 'Bangladesh']`

⚠️ This now **expands** — with `REGION_MEMBERS`, seeding `Africa` and `South Asia`
blocks ~60 countries on a fresh install. See `ROADMAP.md` §1; the recommendation
there is to ship `[]`.

---

## Snapshots (snapshot.ts)

Clone the node, inline every computed style, re-embed every image as a data URI,
then draw it through `<foreignObject>`. Steps two and three cannot be skipped: an
SVG data URL is a **restricted context**, where no stylesheet of the page applies
and no external resource is fetched. Anything still pointing at a URL silently
disappears; `<video>` cannot play, so it is swapped for its `poster`.

X's own webfont is behind such a URL too, so text falls back to the system sans
serif — close, not identical, and the reason `unclampText` exists: X sizes its
`text-overflow: ellipsis` boxes for its own font, and the wider fallback turns a
name that fitted into "Some Very Long Nam…".

Images are **fetched** rather than redrawn from the loaded element: X loads them
without `crossorigin`, so a canvas drawn from them is tainted and cannot be
exported at all. `credentials: 'omit'` — public CDN assets, and a snapshot has no
business carrying cookies. A refusal becomes a same-size placeholder.

Every step degrades rather than aborting, and the caller keeps the hand-drawn card
for when the whole thing fails.

---

## content.tsx — filters, hiding and marking

`expandLocations()` is applied in **content.tsx only**. Storage keeps the user's
literal picks so "Africa" stays one removable chip; the content script expands it
to the region's members _plus the region name itself_, because X reports accounts
under both.

`activeMatches()` is the single decision point for every filter (location,
affiliation, age), applying the allowlist and per-rule exceptions once. The
matching itself is `ruleMatches()`, which ignores exceptions and returns _all_ of
them; `activeRulesFor()` (which adds the bio-driven highlight rule) takes the lot,
because the exception button must be able to name a rule already excepted in order
to undo it.

**Not every rule may hide.** `HIDING_RULES` is the list allowed to take a post
away — `location` and `affiliation`, the two the user named on purpose. Account
age is deliberately not on it: "joined recently" describes a farmed account and a
person who signed up last month equally well. Three readers:

- `hideMatchFor()` — first match _allowed_ to hide. Drives `tryHideArticle` /
  `tryHideQuote`; returns the rule the placeholder names.
- `markMatchFor()` — first match that does _not_ hide. Drives `tryMarkArticle` /
  `markTweetsForUser`, setting `TWEET_MARK_ATTR`. Deliberately **not** gated on
  `hideMode`: that setting answers "what happens to a post a filter caught", and a
  rule that only marks never catches one in that sense.
- `cellMatchFor()` — first match of any kind, for people-list rows, where
  everything is marked and nothing is removed.

**A lookup the reader started by hand never collapses on the spot.** `processCard`
passes `hideNow: false` to `applyFiltersForUser`, and the swipe gesture applies no
filters at all — a hover card opens _at_ a post, and taking that post away is not
an answer to the question it asked. The verdict is still recorded, so every post
the account renders after it is collapsed at birth like any other.

**Marking the matched keyword** (`markKeywords`, `keywordRangesIn`) never touches
a node X owns — the hover card is React's and it re-renders. Text keywords use the
**CSS Custom Highlight API** (Ranges under `x-loc-keyword`, styled by
`::highlight()`, no markup changed). Emoji keywords can't: X renders emoji as
`<img alt="🇷🇺">` with no text node to range over, so those get a generated
stylesheet (`#x-loc-kw-styles`) matching the alt, scoped to cards carrying
`KEYWORD_MATCH_ATTR`. **The alt is escaped on the way in — it is user input
reaching a selector.** `CSS.highlights` is absent before Firefox 140, where the
text half simply doesn't paint. `findKeywordMatches()` runs the same two matchers
as `matchesAnyKeyword()`, so a mark can never point at a word the rule didn't fire on.

**One exception button, whatever the rule.** `buildExceptionButton(userName, rules)`
covers every rule acting on the account and names them only in its tooltip; the
exceptions stay per-rule underneath. Three places, via `syncExceptionButton()` or
a direct call: hover cards (`processCard`), the primary tweet of a status page
(`syncPrimaryExceptionButton` — X opens no hover card for it), and the collapse
placeholder (a collapsed post leaves nothing to hover). Any rule change re-syncs
from `rehighlightAll()` **and** `refreshHiddenTweets()`.

**⚠️ is the location rule showing, not a property of the country.**
`getLocationDisplay(loc, userName)` swaps the flag for ⚠️ only while that rule is
_acting_ on the account — `locationRuleActs()`, which is `isExcepted('location', …)`
inverted, so the allowlist counts too. Excepted, the row shows the country's own
flag again; with no handle to judge by it warns, which is the answer that cannot
under-warn. Every caller has a handle: `buildInfoRow(data, userName)` (feed rows,
hover cards, the primary tweet, the swipe) and `locationSummaryText(data, userName)`.
Deliberately _not_ affected: `ruleMatches()`' icons and `flagEmojiFor()` (the
snapshot strip), which never warn — a placeholder names the rule in words, and a
warning in a reposted image reads as something X said.

**The swap happens in place, on rows already drawn.** `refreshLocationFlags()`
re-answers it for every `.x-loc-info` on the page, from `data-user` on the row and
`data-country` on each flag — no cache read, so it runs synchronously from
`refreshHiddenTweets()`, which every rule change already goes through. Rebuilding
the rows instead would take height out of a post and put it back, which is exactly
what X's timeline compensates for by scrolling the window (see `whenSafeToResize`).
That invariant is why `.x-loc-icon-abbr` carries a `min-height`: a region is drawn
as a word and the warning as an emoji, and without it the swap was 12px of post
height appearing and disappearing (`visual/location-row.spec.ts` measures it).

`extensionEnabled` is honoured by **stripping what is already on screen**
(`stripAllInjections`), not only by skipping new work.

`src/scripts/styles.ts` owns the injected stylesheet **and the class/attribute
names it is written against** (`HIDDEN_ATTR`, `KEYWORD_MATCH_ATTR`, …). Renaming
one without the other turns a rule into a selector that matches nothing, silently
— and a test can render the real CSS without importing `content.tsx`, which talks
to chrome APIs the moment it loads. One selector list covers highlighted posts,
highlighted quote cards and marks, so a post matching two rules has no cascade to
resolve.

---

## Build & test

```bash
pnpm install
pnpm dev             # watch build for Chrome (default)
pnpm build           # production build all browsers → dist/<browser>/
pnpm test            # vitest run --coverage  (happy-dom, Istanbul)
pnpm test:visual     # playwright layout tests — headless, no session, no HARs
pnpm test:lighthouse # playwright + lighthouse over the built landing site
pnpm fix             # oxlint --fix, then oxfmt (that order)
pnpm lint:dup        # jscpd over src/ and server/src/
pnpm e2e:profile     # seed a real-browser profile for the e2e suite
pnpm test:e2e        # playwright, headless (E2E_HEADED=1 to watch it)
```

**`pnpm fix` lints before it formats.** `oxlint --fix` rewrites code, so formatting
first leaves the rewrite unformatted.

**Use pnpm 11 for `pnpm install`.** `node_modules` was written by pnpm 11, but
nvm's `pnpm` on `PATH` is 10.x and shadows it; installing with 10 aborts with
`ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY`. That error is about the version
mismatch, not about the dependency you're adding — and `CI=true` "fixes" it only
by letting the wipe happen. Run `/home/alex/.local/share/pnpm/bin/pnpm install`.

⚠️ **Run `pnpm test`, not `vitest run`.** They are not the same command: `pnpm test`
adds `--coverage`, and the instrumentation exposes failures a bare `vitest run`
never sees (the whole suite was green under one while 45 tests failed under the
other). The reason is in `src/_config/tests.config.ts` — happy-dom 20.8.9 keeps
each MutationObserver's dispatch closure in a `WeakRef` that nothing else
references, so the first GC silently stops mutation delivery for the rest of the
file, and Istanbul allocates enough to trigger one. The setup file makes that
WeakRef hold strongly. Never an extension bug — real browsers keep an observed
callback alive.

### Five suites, five different questions

| Suite                   | Asks                                    | Needs                             | In CI             |
| ----------------------- | --------------------------------------- | --------------------------------- | ----------------- |
| `pnpm test`             | Does the logic hold?                    | nothing                           | yes               |
| `pnpm test:visual`      | Interactions and styles as expected?    | a headless browser                | yes               |
| `pnpm test:integration` | Do the content script and worker agree? | a headless browser + `pnpm build` | yes               |
| `pnpm test:e2e`         | Does any of it survive contact with X?  | a session and the HARs            | no                |
| `pnpm test:lighthouse`  | Does the landing site still score 100?  | a headless browser                | `landing/**` only |

**What a new extension feature owes the first four.** They are not tiers of
thoroughness — a feature owes a test to each surface it touches:

- **A pure function** (matcher, parser, formatter) → `pnpm test`, nothing else.
- **Anything the extension draws into X** — a new element, class, chip or tone →
  a `visual/fixtures/*.html` entry **and** assertions in the matching spec.
  happy-dom resolves no cascade and reports no boxes, so a unit test cannot see
  that a thing has a border, sits in the right order, or fits its container.
- **Anything split across contexts** — a message between the content script and
  the service worker, anything about more than one tab → `pnpm test:integration`.
  Two halves that each pass their own unit tests can still disagree about the
  message between them, and no amount of mocking `chrome` can catch that.
- **Anything depending on X's own DOM or responses** — an insertion point, a
  `data-testid`, a GraphQL field → `pnpm test:e2e`, with a recording. This is the
  only suite that can notice X changed; the other three are built from markup we
  wrote ourselves and a copy cannot report that the original moved.

The blocked-account bio needed all three: `bioProbe` in `pnpm test`, the row's
border and stacking order in `visual/`, and "X really does strip the bio out of a
blocker's card" in `e2e/blocked-account.test.ts`.

`.github/workflows/tests.yml` runs the first two on every push and PR. The visual
step downloads Playwright's bundled chromium, uncached on purpose — a stale cache
failing a layout-regression suite costs more attention than the download saves. On
failure it uploads `test-results/` (DOM snapshot + resolved styles per failure).

### Unit test patterns

**page-script** — the IIFE runs at import time, so each test needs a fresh module:

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
})
```

Each import adds another `'x-loc-request-headers'` listener and happy-dom reuses
`window` within a file, so tests checking `x-loc-headers-captured` should
`vi.spyOn(window, 'dispatchEvent')` rather than rely on `addEventListener`.
`FakeXHR` fires its `load` listeners via `Promise.resolve().then(...)` from
`send()`, giving PatchedXHR time to register first.

**cache** — mock `idb-keyval` at the top of the file (hoisted); `'mock-store'` is
the `createStore` sentinel and should be the second argument everywhere. Several
tests pin an entry exactly on the 30-day boundary, where the answer flips if one
millisecond elapses, so the file freezes the clock (`vi.useFakeTimers()`) —
without it the suite fails intermittently, and only under load.

**content** — `chrome` must be hoisted before the import (module-level
`chrome.storage.local.get`):

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

Call `__testResetState()` in `beforeEach`. Swipe listeners attach to
`document.body` at import time, so the gesture is testable end-to-end — happy-dom
implements `TouchEvent` and accepts plain `{ clientX, clientY }` objects as
`touches`/`changedTouches`. Dispatch with `bubbles: true` from the article.

### integration/

Two real x.com tabs, the built extension, and the browser's own service worker.
It exists because everything the lookup broker does is a property of _more than
one tab_, and neither a unit test nor `visual/` can hold two of them.

- **Runs against `dist/chrome`**, so `pnpm build` (or `bedframe build chrome`)
  has to have run first. A stale `dist/` tests the previous commit and says
  nothing about this one.
- **x.com is a stub** (`integration/x-stub.ts`) served _at_ x.com URLs via
  `context.route` — `route.fulfill` keeps the origin, which is what makes the
  manifest match and the page-script attach. No session, no HAR, no live
  traffic, so unlike `e2e/` this runs on every push.
- **Route registration order runs backwards.** Playwright tries the most
  recently added route first, so the `https://x.com/**` catch-all is registered
  _before_ the AboutAccountQuery and HomeTimeline handlers, not after.
- **The stub's timeline fetch is repeated on a short timer**, and has to be.
  page-script is built as a loader that `import()`s the real chunk, so its
  `fetch` wrapper is not in place at parse time — a stub that fetched the moment
  it parsed would beat the extension to it every run. On x.com the race is
  invisible, because X's own timeline call comes long after its bundle.
- **A test that passes with the mechanism removed is not a test.** The
  duplicate-suppression one needs a _slow_ answer (3s, clear of the 1.5s pacing
  floor): with an instant one the shared IndexedDB dedups on its own and the
  test passes whether or not anything is coordinating.

### visual/

Exists because happy-dom has no layout engine — no boxes, no cascade, no CSS
Custom Highlight API. Every bug the injected UI has shipped with (buttons
stretched by X's flex column, pieces inserted in reverse order, a placeholder
margin knocking a button out of its row) was invisible to a unit test.

Fixtures are **hardcoded HTML** standing in for X's DOM with our markup in it. The
stylesheet is **not** a copy — `openFixture()` imports `CONTENT_CSS` from
`src/scripts/styles.ts`, so the suite fails when shipped rules change. Anything a
fixture needs a rule of its own to look right is a rule that belongs in the extension.

`popup.html` is our own page and its stylesheet is a CSS module, so
`openPopupFixture()` reads `src/pages/popup.module.css` off disk (Vite hashes
those names and Playwright's loader wouldn't resolve the import). Rename a class
in one place only and the element goes unstyled — which is why
`the fixture is wearing the real stylesheet` asserts two concrete values first.

Assertions are **layout facts** (boxes, computed styles), never pixel diffs — a
screenshot baseline compares font rendering as much as layout and teaches everyone
to re-baseline without looking. `expectSameRow`, `right()`, `styleOf()` in
`visual/helpers.ts` are the vocabulary.

⚠️ Two traps:

- **`outline-width` is not a signal** — Chrome computes it as `medium` (3px)
  whether or not anything is drawn. Assert `outline-style`.
- **`sheet.cssRules` throws on a `file://` `<link>`** (cross-origin for CSSOM).
  Wrap the walk in try/catch.

---

## E2E

### Recording proxy (`test-proxy-recorder`)

Replay/record is [`test-proxy-recorder`](https://test-proxy-recorder.dev) —
`playwrightProxy.before(page, testInfo, MODE, { url })` in `fixtures.ts`, plus the
`webServer` block in `playwright.config.ts` pointing at
`http://localhost:8100/__control`.

Before changing fixtures, the config, or the record/replay wiring, load its skill:

```bash
pnpm dlx @tanstack/intent@latest load test-proxy-recorder#proxy-setup
```

(`proxy-setup` is the relevant one — `nextjs-ssr` and `tanstack-start` don't apply
to an extension. `intent.skills` in `package.json` is the allowlist.)

Secret redaction has been on by default since 1.0.2 — Authorization / Cookie /
Set-Cookie are stripped when _recording_. Replaying existing HARs is unaffected.

### Headless

The suite runs headless and shows nothing on screen. It used to be `headless:
false` under `xvfb-run`, which only works from the one npm script — anything else
(a bare `playwright test`, the VS Code extension, an IDE gutter button) put a
browser window on the real display for every test, thirty-odd times a run.

**Plain `headless: true` is not enough, and fails in a way that looks unrelated.**
Since 1.49 Playwright serves headless `chromium` from `chromium_headless_shell`,
a separate binary with no extension support: `--load-extension` is ignored and
`chrome://extensions` is not even a valid URL there, so the `extensionId` fixture
throws `net::ERR_INVALID_URL` before a single test runs. `channel: 'chromium'`
asks for the full browser instead, whose new headless mode loads an extension
exactly as a headed one does — `navigator.webdriver` included. A seeded profile
supplies its own real binary, and takes `headless: true` without a channel (both
are verified in `e2e/fixtures.ts`; passing `channel` _and_ `executablePath` is
what to avoid).

`E2E_HEADED=1` (`e2e/headed.ts`) shows the browser. `test:e2e:ui`,
`test:e2e:record` and `shots` set it — the first two exist to be watched, and the
screenshots are shipped assets that should keep being taken the way they always
were. `auth.setup.ts` ignores the flag and is always headed: it is a human
logging in.

### Browser profile

X blocks Playwright's bundled Chromium, so `e2e/scripts/seed-profile.mjs` launches
a **real** Brave/Chromium on its own profile dir, you log in manually, and closing
the window copies it to `e2e/.auth/profile` + writes `e2e/.auth/profile.json`.
`fixtures.ts` reads that manifest: present → clone to a temp dir and launch that
binary via `executablePath`; absent → bundled Chromium + `state.json`.
`E2E_SEED_PROFILE=0` forces the old path.

- Seeding must use `--password-store=basic` — cookies encrypted against the OS
  keyring can't be decrypted without it.
- Cookies commit to SQLite only on clean shutdown (or a ~30 s timer), so the
  browser must be **closed**, not killed.
- Branded Google Chrome ≥ M137 ignores `--load-extension` and the extension
  silently never loads. Use Brave or Chromium.
- Anti-detection: `--disable-blink-features=AutomationControlled` +
  `ignoreDefaultArgs: ['--enable-automation']` → `navigator.webdriver === false`.

### Gotchas

- **A new test that loads x.com needs its own recording.** Sessions are named
  `<file>__<test-title>` (`generateSessionId`, from `testInfo.titlePath`) with no
  override, so a test with no capture fails at the fixture with `ENOENT … .har`.
  Record with `pnpm test:e2e:record`, then `pnpm scrub`. **Renaming a test orphans
  its recording.**
- Tests that never load x.com (popup, options page) need no recording — the fast
  ones to iterate on.
- The **popup** opens as an ordinary tab (`openPopupPage`) — Playwright can't open
  a browser action popup, and it costs nothing. Its filter sections are collapsed;
  `openPopupSection` expands one. Each test gets a fresh `userDataDir`.
- Options-page sections live behind **tabs** and are only in the DOM while
  selected. `optionsSection(page, section)` selects the tab first (hence `async`);
  `setCheckboxOption()` tries each tab. Nothing to expand — the accordions are gone.
- **Scope options-page locators to their section**. A bare `locator('select')` was
  unique until the prefetch dropdown shipped, then failed strict mode.
- Don't index into the article list — use `TWEET_ARTICLE` / `PRIMARY_TWEET` /
  `tweetArticles()` / `waitForReplies()` / `nthReply(page, n)` from `helpers.ts`.
  `nthReply` counts **replies**, sidestepping the off-by-one a raw `.nth()` hits
  when the page's own tweet is itself a reply. `mostLikedReply()` re-anchors on the
  author's handle, because X's virtualised timeline recycles rows out from under a handle.
- Which reply a test picks is often pinned by its recording — the HAR only holds
  pages visited at record time. The second-level-reply test needs reply **2**
  specifically (reply 1 has no thread under it); say so at the call site.
- A few recordings depend on the **relationship between the recording session and
  the account under test**. `blocked-account.test.ts` only captures anything worth
  replaying if `@jpotisch` still blocks the recording account. Re-cut the
  recording (or swap the archetype) rather than loosening assertions.
- `addKeyword` / `removeKeyword` live in `helpers.ts` — they open the options page,
  so they cost no x.com traffic.

### Firefox is checked by hand, not by Playwright

`pnpm dev:firefox` builds the Firefox target and hands it to `web-ext run` on a
persistent profile under `e2e/.auth/firefox-profile` (gitignored — it holds a live
X session). Firefox MV3 treats `host_permissions` as **user-granted**, so on first
run the extension does nothing until you allow x.com from the extensions button —
the platform's model, and it applies to real users too.

**Do not try to point the Playwright suite at Firefox.** Verified against
Playwright 1.59.1 / Firefox 148: there is no API to install a Firefox extension;
sideloading an XPI into `<profile>/extensions/` is silently ignored (removed in
74); `installTemporaryAddon` over the debugging protocol _does_ work — but
Playwright cannot navigate to `moz-extension://` pages at all (`page.goto` never
commits, under every wait state, headless and headed). That kills it —
`openOptionsPage()` drives four of six spec files.

---

## Store listing (base.manifest.ts)

`name` is the **store listing title** on Chrome and AMO, not just the in-browser
label, so it carries the search keywords. `short_name` is what the browser shows
when space is tight.

Two halves, deliberately: "X profile location" is the exact phrase people search
and doubles as what the extension reveals; "filter and highlight" are verbs, so
the title says what you _do_ rather than listing topics. **No "VPN"** — the
weakest of the three signals, it reads as a VPN product in a store search, and
over-claiming fights the neutral posture the brand is built on. It stays in the
store description and the landing copy, both of which are indexed.

Currently 48 characters. **AMO caps the name at 50**, Chrome at 75 — check any
edit against 50, not 75. (Edge caps at 45; we publish to Chrome and AMO only.)

The text lives in `public/_locales/*/messages.json`, which is what localizes the
listing as well as the UI: both stores resolve `__MSG_*__` against the catalogue
the extension reads. `messages.test.ts` holds `appDesc` to `pkg.description`, so
the two cannot drift the way a hand-copied string would.

---

## Landing site — Lighthouse

`pnpm test:lighthouse` → `landing/tests/lighthouse.spec.ts`, driven by
`landing/playwright.lighthouse.config.ts`. Everything (including the ~100 MB
`lighthouse` dependency) lives in `landing/`; `.github/workflows/lighthouse.yml`
runs it on changes under `landing/**` and nowhere else.

It audits the **production build**, never `vite dev`: `webServer` runs
`pnpm build && pnpm preview:lighthouse` on **port 5174** — deliberately not 5173,
which both `dev` and `preview` use, so a dev server left running can't be silently
accepted in place of the build. Preview also applies `serveFlatHtml`, which makes
`/about` resolve to `about.html` the way Pages does; under the dev server every
subroute falls through to the SPA fallback and the suite would audit the homepage
six times over.

**Pages come from `routes.ts`**, which is already the site's one source of pages
(head, canonical, prerender list, sitemap), so a new page is audited the moment it
exists.

**Desktop config, four categories, 100 on each** — all six pages, measured August 2026. Mobile is not what runs (`/` reproduces at 99). Lighthouse 13's fifth
category `agentic-browsing` scores 100 everywhere but is deliberately not gated:
Google is still moving its weights.

**The two `noindex` pages cannot score 100 on SEO** and are not asked to.
`is-crawlable` is _meant_ to fail on `/privacy-policy` and `/404`. Rather than
exempt them and lose the rest of the category, the spec names the one audit
allowed to fail:

```ts
expect(failed).toEqual(['is-crawlable'])
```

That asserts both halves — that `noindex: true` really reached the shipped
document, and that nothing else in SEO regressed.

⚠ `opts.onlyCategories` is **pinned explicitly**. `playAudit` otherwise derives it
from the threshold keys, so dropping `seo` for the `noindex` pages would stop the
category running at all and take `is-crawlable` with it — the assertion would pass
against an empty array and check nothing.

⚠ The landing build rewrites the comparison table in the repo `README.md`
(`readmeComparison` in `landing/vite.config.ts`). CI builds the site, so that
write must stay **idempotent**.
