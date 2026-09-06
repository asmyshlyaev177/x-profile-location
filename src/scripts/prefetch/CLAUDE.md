# `src/scripts/prefetch` — background lookups

Six files, one feature: what to look up next, how fast, and who across the browser
gets to do it. Nothing here fetches — `content.tsx` does, and reports back.

| File                 | Purpose                                                                   |
| -------------------- | ------------------------------------------------------------------------- |
| `prefetch-queue.ts`  | `CandidateQueue` + the pacing arithmetic. No timers, no state of its own. |
| `lookup-broker.ts`   | The one queue, ledger and pace, in the service worker.                    |
| `prefetch-poller.ts` | The tab's loop: ask, look up, ask again. Holds the clock.                 |

The budget it spends is the 50 / 15 min in [`../CLAUDE.md`](../CLAUDE.md).

## The queue and the pace

- Uses at most **85%** of the window (`reserveFraction`, user-settable), stopping once
  `remaining` reaches the reserved share.
- **Paced**: `nextDelayMs()` recomputes `msLeftInWindow / budget` before every lookup
  (≈21 s), clamped to `[1.5 s, 2 min]` — self-correcting, since hovers stretch the gap
  and a rolled-over window shrinks it. `pacing: 'instant'` opts out (same share, spent at
  `minSpacingMs`).
- **The first `sprintShare` goes out at `sprintSpacingMs`, and only for `high`** — a
  quarter at 3 s, so 10 of the 42 land in the first half-minute rather than over four.
  The rest still covers the window and `msLeftInWindow / budget` absorbs the sprint
  (≈27 s after, not a hole). Measured against the **share**, so it holds at any
  `reserveFraction`; the budget spent is unchanged. Sits after the `'instant'` branch,
  never below `minSpacingMs`. The tier gate is the broker's: `sprintable` defaults
  **off** and `feedIsWaiting()` turns it on only while a tab holds a `high` candidate not
  in flight or `asked` — so threads alone pace the whole window, and a feed queue of names
  X has answered cannot buy the gap with them.
- **Two queues** (`PrefetchPriority`): `high` (`HomeTimeline`) drains completely before
  `low` (`TweetDetail`) gets a lookup. Within a batch it is **page order**; each new batch
  goes **in front** of the ones waiting, because an opened tweet is what the reader is
  looking at. Dedup keeps the slot a name already holds, in the queue and in page-script's
  replay buffer alike; `low → high` promotes, never the reverse.
- Overflow sheds the **oldest batch of whichever queue is longer**, `low` on a tie.
  Emptying `low` first wiped out every reply author behind a scrolled feed: `high`
  outproduces it by far and the pair drains at one per ~21 s.
- **`MAX_QUEUE` is 1000 per tab: a backstop, not a pace.** Drain is 42 per 15 min, so
  1000 is ~6 h of backlog and more only stores names whose turn never comes. The ceiling
  is that the **whole broker snapshot is re-serialized into `chrome.storage.session` on
  every message**, awaited. Measured 2026-08-15 on a loaded `dist/chrome`: 1000 per tab is
  157 KB and a 2.5 ms `set`; ten tabs of that is 1.6 MB, 31 ms, and 15% of the 10 MB
  `QUOTA_BYTES` (per extension, all keys). Chrome's accounting runs ~3.5×
  `JSON.stringify` length, so budget against `getBytesInUse()`. Going over is an **atomic
  reject** (`'Session storage quota bytes exceeded. Values were not stored.'`, old value
  intact), which here means `sendResponse(null)` and a snapshot frozen before the failure:
  one idle teardown later `asked` and `inflight` roll back and accounts are looked up
  twice, silently. Past ~1000, `saveBroker` needs to shed and retry first. ⚠ `QUOTA_BYTES`
  and `getBytesInUse` are **Firefox 131+**; the manifest floor is 128.
- The tweet the reader **opened** skips the queue — `processPrimaryTweet()` fetches it.
- The **community cache is the master switch**: `prefetchAllowedBySettings()` requires
  `SHARED_CACHE_KEY`, since prefetch exists to warm it. The gate applies only when a
  server is configured (`!isSharedCacheConfigured() || isSharedCacheEnabled()`), so an
  empty `CACHE_API_BASE` build still prefetches. The options page mirrors it.

## Revalidation

The queue only ever holds accounts **nobody has an answer for** — `content.tsx`
filters every batch against its own IDB before the broker sees it, and the
broker keeps `asked` on top of that. So a location was fetched once and then
believed until the 30-day cache TTL dropped it, and an account that moved
country stayed wrong for a month. Worse for the community cache: a value the
server handed over is cached locally the moment it arrives, which is exactly
the state in which this end will never look it up first-hand — so
`location_confidence` had no way to climb past the client that first reported it.

**5% of the share goes to accounts already known** — `revalidateBudget()`,
floored down, and at least 1. At the shipped defaults that is 2 of the 42
lookups a window. The reserve is measured against the _share_, not against
what is left of it, so it does not shrink as the window is spent.

Both halves are needed and neither can do it alone: only the tab can read
x.com's IndexedDB, and only the worker knows what the window can spare. The tab
**offers** every cached account in the batch on the `LOOKUP_ENQUEUE` message,
ranked; the broker **rations** — it keeps the newest `MAX_REVALIDATE` offers and
hands one back as `{ userName, revalidate: true }`. `fetchLocationData` takes
that flag straight past the "already in IDB" short-circuit — without it the
grant would resolve from the cache, report `spent: false`, and buy nothing.

- **Least-corroborated first, not oldest-first.** The rank is
  `LocationData.votes` — the server's `conf` for a community-cache hit, plus one
  for each first-hand confirmation since. One client's word is what a second
  answer is worth most against. `fetchedAt` could not do it: every `mergeCached`
  rewrites it and a bio lands on every appearance in a timeline, so it dates the
  last time the account was _seen_, not the last time its location was
  _fetched_ — sorting on it would revalidate whoever posts least.
- **Ties are broken at random** (`shuffled()` before a stable sort). Equal
  counts are the common case, and a fixed order would re-offer the same names
  for the whole session while the rest of the feed is never re-asked about.
- **Ahead of the queues, not behind them.** Behind, it would never happen on the
  readers it is for: a scrolled feed outproduces a trickle of one per ~21s, so
  `high` is rarely empty. Ahead, it costs the feed the first two lookups of a
  window and nothing after.
- **Accounts answered this session are never offered.** They already cost a
  request, and `checkedThisSession` is what says so.
- A revalidation that spends nothing (the tab had it in flight, or headers went
  away) **hands the reserve back**, like any other grant that reports
  `spent: false`.

## The broker (`lookup-broker.ts`)

Everything above describes **one** budget. Per-tab copies of the queue, pace and ledger
gave three symptoms: two tabs each spent a request on the same account; a 429 in one tab
was something every other tab had to earn; and an account X had no location for was
re-asked by every new tab, because "already checked" lived in a `Set` that died with the
tab. All three now live in the **service worker**, one instance for the browser —
`lookup-broker.ts` is the state and its rules, `service-worker.ts` only the plumbing.

**Tabs pull; the worker never pushes work.** An MV3 worker is torn down after ~30 s idle
and **a pending `setTimeout` dies with it, silently**, while the paced gap runs from
≈26 s to 15 minutes. So `prefetch-poller.ts` keeps the clock and loops `LOOKUP_NEXT →
fetch → repeat`; the worker only runs inside a message handler, where it cannot be
evicted. (`chrome.alarms` would work too, at a permission and a 30 s floor.)

| Message           | Direction | Carries                                                      |
| ----------------- | --------- | ------------------------------------------------------------ |
| `LOOKUP_ENQUEUE`  | tab → SW  | candidates, already filtered against **that tab's** IDB      |
| `LOOKUP_NEXT`     | tab → SW  | → `{ userName }` or `{ waitMs }`                             |
| `LOOKUP_REPORT`   | tab → SW  | whether a request went out, and X's headers if one did       |
| `LOOKUP_RATE`     | SW → tabs | the ledger, so a 429 anywhere shows the countdown everywhere |
| `LOOKUP_RESOLVED` | SW → tabs | a handle to re-read from IDB and redraw                      |

- **The worker cannot read the cache.** A content script's IndexedDB is x.com's storage,
  not the extension's, so `LOOKUP_ENQUEUE` arrives pre-filtered.
- **State is mirrored to `chrome.storage.session` on every mutation and read back at the
  top of every handler** — eviction is constant, not rare. Memory-only, so nothing touches
  disk and a restart starts clean. The write is **awaited before the handler answers**:
  left floating it is exactly the write that gets cut off.
- **Grant order is global** — focused tab's feed, other visible tabs' feed, hidden tabs'
  feed, then the same three for replies. Whoever polls gets the best entry anywhere; the
  fetching tab need not be the one that queued it (`LOOKUP_RESOLVED`), which is why no
  hold-back rule is needed against background tabs. Hidden tabs still prefetch — they warm
  the community cache from the same budget.
- **`asked` replaces `checkedThisSession`**: a handle X has answered for is not asked
  about again **until the window rolls**. Never persisted — a location X does not have
  today it may have next week, so a negative answer must not outlive the window that paid
  for it.
- **Hovers never go through the broker.** They fetch immediately and report after, so a
  wedged worker cannot delay the row the reader is waiting on. `prefetch-poller.ts` is the
  only caller that awaits its report.
- **A discarded tab is a new tab.** Memory Saver gives the reload a different id, so
  `onRemoved` only ever names the new one and the old record outlives the tab —
  still ranked, its `high` candidates still buying `feedIsWaiting()`'s sprint gap
  for a tab that is gone. Hence `tabs.onReplaced`, called optionally because
  Firefox keeps the id and does not implement it. `TAB_TTL_MS` sweeps behind that,
  at **3 days**: a bound on growth, not a reaper. A live tab may go 15 min without
  polling (a spent window) and a frozen one far longer, and a sweep costs it its
  queue — so the number sits past any silence rather than near it.
- **Everything fails open.** A rejected `sendMessage` costs background lookups until the
  worker returns (`UNREACHABLE_RETRY_MS`), nothing else.
- **A `wake()` arriving during a poll is remembered, not scheduled.** The answer on its
  way was decided before those candidates existed, so scheduling on top only lets it
  overwrite the immediate re-poll — which it did: the first poll of a page asks an empty
  queue, is told to idle for `IDLE_POLL_MS`, and that 30 s landed after `wake()` had asked
  for another, so the first feed flag arrived half a minute late once in five loads.
