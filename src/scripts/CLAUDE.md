# `src/scripts` — runtime

Everything the extension does at runtime. Root `CLAUDE.md` has the pipeline
diagram and the file map; this is the detail behind it.

---

## Inventory

The one list — root `CLAUDE.md` carries a short orientation subset, nothing else
duplicates it.

| File                 | Purpose                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `page-script.ts`     | `world: MAIN`. Wraps `fetch` + `XMLHttpRequest`. Captures auth headers; extracts bios from HomeTimeline/TweetDetail.           |
| `content.tsx`        | Content script. Calls `AboutAccountQuery`, injects DOM rows, runs the MutationObserver, handles keyword/flag highlighting.     |
| `extract-users.ts`   | Recursive GraphQL walker. Finds `__typename: 'User'` nodes up to depth 20.                                                     |
| `cache.ts`           | IndexedDB wrapper (idb-keyval). 30-day TTL. Keys are lowercased usernames.                                                     |
| `shared-cache.ts`    | Client for the optional community location cache; batch lookup + contribute, opt-in.                                           |
| `prefetch-queue.ts`  | `CandidateQueue` (feed before replies, newest batch first) plus the pacing arithmetic. No timers, no state of its own.      |
| `lookup-broker.ts`   | Service worker. One queue per tab, one rate-limit ledger, one pace — the whole cross-tab decision, testable without a browser. |
| `prefetch-poller.ts` | Content script. Asks the broker what to look up, looks it up, asks again. Holds the clock the worker cannot.                   |
| `countries.ts`       | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR`, `REGION_MEMBERS` + every storage key.                                          |
| `location-names.ts`  | Country/region names per locale, derived from flag emoji via `Intl.DisplayNames`.                                              |
| `profile.ts`         | Parses `AccountFacts` off a User node — timeline or AboutAccountQuery alike.                                                   |
| `source.ts`          | The single place X's `source` string is interpreted: platform + store country, plus the drawn SVG glyphs.                      |
| `settings.ts`        | Registry of every setting, its normalizer and its default. The only way to read one. Backs import/export.                      |
| `usage.ts`           | Active-day counter and the single rule deciding whether to ask for a store rating.                                             |
| `snapshot.ts`        | Clones a live element, inlines computed styles and images, renders to PNG via an SVG `foreignObject`.                          |
| `share-card.ts`      | Hand-drawn fallback card. Layout is pure (testable); drawing is not.                                                           |
| `watermark.ts`       | The mark both image paths put in the corner. Picks its ink from the backdrop it lands on.                                      |
| `keywords.ts`        | Grapheme-aware keyword matching over `Intl.Segmenter` (this is what `grapheme.ts` used to be).                                 |
| `constants.ts`       | Cross-context event names (`EVENTS`) and `CACHE_API_BASE`.                                                                     |
| `device.ts`          | `isMobile` — touch points plus a 1024px screen width, which is what gates the swipe gesture.                                   |
| `i18n.ts`            | `t(key, …subs)` over `chrome.i18n`, plus `uiLocale()`. Honours a user-chosen language.                                         |
| `styles.ts`          | The injected stylesheet **and** the class/attribute names it is written against.                                               |
| `service-worker.ts`  | Sets `blockedCountries` defaults on install; owns the toolbar badge; the broker's message plumbing.                            |

---

## API: AboutAccountQuery

```text
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

- Uses at most **80%** of the window (`reserveFraction`, user-settable), stopping
  once `remaining` hits the user's reserved share.
- **Paced**: `nextDelayMs()` recomputes `msLeftInWindow / budget` before every
  lookup (≈22 s), clamped to `[1.5 s, 2 min]`. Self-correcting — hovers stretch
  the gap, a rolled-over window shrinks it. `pacing: 'instant'` opts out of
  spreading (same share, spent at `minSpacingMs`).
- **The first `sprintShare` of the budget goes out at `sprintSpacingMs`, and only
  for `high`** — a quarter of it at 3 s, so 10 of the 40 land in the first
  half-minute instead of trickling in over four. An even spread is right for the
  window and wrong for the screen the reader is on _now_; the remaining three
  quarters still cover the rest of the window, and `msLeftInWindow / budget`
  absorbs the sprint by itself (≈29 s afterwards, not a hole). The threshold is
  measured against the **share**, not the window, so it holds at any
  `reserveFraction`, and the budget spent is unchanged — this moves lookups
  earlier, it does not buy more of them. Sits after the `'instant'` branch, which
  is already faster, and never below `minSpacingMs`.
  The tier gate is the broker's: `nextDelayMs` takes `sprintable` and defaults it
  to **off**, and `feedIsWaiting()` turns it on only while some tab holds a `high`
  candidate that isn't already in flight or `asked`. A browser showing nothing but
  threads therefore paces the whole window, and a feed queue full of names X has
  already answered doesn't buy the gap with them.
- **Two queues** (`PrefetchPriority`): `high` (`HomeTimeline`) drains completely
  before `low` (`TweetDetail`) gets a single lookup. Within a batch it is **page
  order**, so locations fill in down the feed as the user reads — but each new
  batch goes **in front** of the ones already waiting: opening a tweet queues its
  accounts behind nothing, because that is what the user is looking at. Dedup
  keeps the slot a name already holds, in the queue and in page-script's replay
  buffer alike. `low → high` promotes; `high` never demotes. `maxQueue` overflow
  sheds from the **bottom** — the oldest batch — of whichever queue is **longer**,
  `low` on a tie. Emptying `low` first, as it used to, meant a scrolled feed wiped
  out every reply author queued behind it: `high` outproduces `low` by far and the
  pair drains at one lookup per ~22 s, so the cap was reached in minutes and
  nothing from a thread ever survived it.
- **`MAX_QUEUE` is 1000 per tab, and it is a backstop rather than a pace.** The
  drain rate is the window, not the queue — 40 lookups per 15 min, so 1000 is ~6 h
  of backlog and raising it further only stores names their turn never comes for.
  What sets the ceiling is that the **whole broker snapshot is re-serialized into
  `chrome.storage.session` on every message** and the handler awaits it. Measured
  2026-08-15 against a loaded `dist/chrome` (median of 15, `getBytesInUse`):

  | per tab | tabs | bytes  | of quota | `set` | `get` |
  | ------- | ---- | ------ | -------- | ----- | ----- |
  | 300     | 1    | 48 KB  | 0.5%     | 0.8ms | 0.4ms |
  | 1000    | 1    | 157 KB | 1.5%     | 2.5ms | 1.2ms |
  | 1000    | 10   | 1.6 MB | 15%      | 31ms  | 22ms  |
  | 3000    | 10   | 4.7 MB | 46%      | 90ms  | 66ms  |

  The quota is 10 MB (`QUOTA_BYTES`, per extension, all keys). Chrome's accounting
  runs ~3.5× `JSON.stringify` length, so budget against `getBytesInUse()`. Going
  over is an **atomic reject** — `'Session storage quota bytes exceeded. Values
  were not stored.'`, the old value intact — which here would surface as
  `sendResponse(null)` and a snapshot frozen before the failure: after the next
  idle teardown `asked` and `inflight` roll back and accounts are looked up twice,
  silently. Anything above ~1000 needs `saveBroker` to shed and retry first.
  ⚠ `QUOTA_BYTES` and `getBytesInUse` only exist in **Firefox 131+**, and the
  manifest's floor is 128 — neither can be read without a fallback.
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

### How much the cache holds (`/v1/stats`, popup)

The popup's last line is how many accounts the community cache can answer for —
`GET /v1/stats` → `{ profiles }`, `fetchCacheCount` in shared-cache.ts. It is the
only request in the extension that isn't driven by someone reading a timeline,
so it is the only one that could arrive as a crowd. Four things keep it cheap,
and none of them work without the others:

- **Only while the popup is open.** The effect lives in popup.tsx and is torn
  down with the panel. Nothing polls in the background, and nothing asks while
  the extension is paused or the shared cache is switched off — that setting is
  a decision not to talk to that server, and a number is not a reason to go
  behind it.
- **`COUNT_POLL_MS` is 30s**, under the server's `max-age`, so roughly every
  other ask is answered by the browser's own cache and never leaves the machine.
  A popup is usually open for seconds; this is for the Android build, where the
  same page opens as a tab. It re-asks only while `document.visibilityState` is
  `'visible'`.
- **The server memoises for 60s** and answers `Cache-Control: public,
max-age=60`. One `COUNT(*)` a minute, however many people are looking.
- **The count is remembered** under `SHARED_CACHE_COUNT_KEY`, so the panel opens
  with a number instead of growing a line under the cursor a moment later. It is
  written only when the figure moves — every write wakes the service worker and
  each open x.com tab's storage listener, and this runs on a timer. `at` is
  therefore when the number last _moved_, and one that hasn't in a week is
  dropped rather than shown.

A server that 404s (every deployment older than this) reads as "no answer": the
line keeps whatever it had, or stays away. Nothing about the reader goes with the
request — it is a bodyless GET, and the response is the same for everyone.

Why the server counts without a `WHERE` clause, though it serves with one, is in
[`server/README.md`](../../server/README.md#api): the two are the same number, and
the filtered form costs a table scan.

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

### Filters, hiding and marking

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

`styles.ts` owns the injected stylesheet **and the class/attribute names it is
written against** (`HIDDEN_ATTR`, `KEYWORD_MATCH_ATTR`, …). Renaming one without
the other turns a rule into a selector that matches nothing, silently — and a test
can render the real CSS without importing `content.tsx`, which talks to chrome
APIs the moment it loads. One selector list covers highlighted posts, highlighted
quote cards and marks, so a post matching two rules has no cascade to resolve.

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

`USAGE_STATS_KEY` / `RATE_PROMPT_KEY` / `SHARED_CACHE_COUNT_KEY` are **not
settings** and are absent from the registry — an export is a record of decisions,
and "has used this five days" isn't one, nor is what a server answered.
`SHARED_CACHE_COUNT_KEY` is the one key opening the popup may write, which is why
the "writes nothing merely by being opened" test now names it. The counter lives in
`buildInfoRow()`, the one place meaning "something visible happened today";
`usage.ts` memoises the day so scrolling costs no reads.

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

## Unit test patterns

The 21 `*.test.ts` files beside this one run under `pnpm test` (vitest, happy-dom,
Istanbul). Run `pnpm test`, never a bare `vitest run` — the reason is in the root
`CLAUDE.md` under Build & test, and it is not cosmetic.

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
