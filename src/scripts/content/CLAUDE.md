# `src/scripts/content` — what the reader sees

The content script and its unit tests. Everything the extension draws into X's own DOM
lives here: the location rows, the hover card, the filters, the swipe, the placeholders.
It fetches; the pace it fetches at is [`../prefetch/`](../prefetch/CLAUDE.md), the answers
it keeps are [`../cache/`](../cache/CLAUDE.md).

## Module state

Module state: `apiHeaders` (captured auth headers, settable via `setApiHeaders()`),
`checkedThisSession` (attempted in **this tab**; the cross-tab answer is the broker's
`asked`), `pendingMap` (in-flight fetches, so concurrent hovers share one promise),
`rateLimitResetAt` (ms until the limit lifts, 0 when clear — set by a 429 here or by
`LOOKUP_RATE` from another tab), `blockedCountries` and `highlightKeywords` (from
`chrome.storage.local`, reloaded on change, keywords lowercased and each carrying its own
match mode). `__testResetState()` is exported for tests: it clears `checkedThisSession`
and resets `rateLimitResetAt`.

## The bio X declined to render

An account that **blocks the signed-in user** gets a stripped hover card: avatar, name,
handle, a Grok button — no bio, no follow button, no counts. The extension still judges
the highlight rule from the timeline bio, so the post would be marked with nothing on the
card to explain it. Two pieces answer that: **`🚫 Blocked you`**, an `accountChips` entry
with its own `block` tone rather than the amber `warn` one (amber means "a trait worth
doubting"; being blocked is where the reader stands with the account), and
**`syncBioRow()`**, which puts the bio back _before_ `.x-loc-hover` rather than inside it
— that keeps it under the handle and in reach of `keywordRangesIn`, so the matched word is
marked as it would be in a bio X had rendered.

Gated on X's card not already showing a bio (`bioProbe` / `cardShowsBio`), not on the
block, so it covers whatever else X strips. The probe drops URLs first (a t.co display
form is the one part X doesn't render verbatim) and discards probes under four characters,
which would match a display name or one of our own chips. `syncBioRow` runs twice per card
and **rebuilds rather than appends**, so a card React fills in late doesn't end up with two
bios. `blockedBy` is `null` when X sent no relationship at all — not the same as `false`.

## The mobile swipe gesture

Swipe-right on a tweet looks up its author. It **commits mid-drag on `touchmove`**, not
`touchend` — waiting for the finger to lift spent the rest of the swipe before the lookup
started. `touchend` is a backstop for flicks where touchmove coalescing never reported a
position past the threshold; `touchcancel` abandons; a `handled` flag (reset on
`touchstart`) makes it fire at most once per gesture. The tweet is resolved from the
**`touchstart`** target and remembered — by the time the threshold is crossed the finger
may be off the article. `isCommittedSwipe(dx, dy)` (exported for tests): ≥40px rightward,
≤50px drift, **and** `dx >= |dy| * 1.5` — that last clause is what firing mid-drag made
necessary, since a vertical fling on a slight diagonal satisfies both raw thresholds long
before it is recognisably horizontal.

`renderLocationToast(text, pending)` backs the overlay. A `pending` toast has no
auto-dismiss timer, so **every pending toast must be resolved by a later call**.
`dismissLocationToast()` (show nothing) is for when the lookup couldn't be _attempted_ —
rate-limited, or no headers yet — as opposed to X having no answer: `#x-loc-rate-toast`
sits at the same `bottom: 24px`, so a `'No location'` toast would cover the countdown.

## Filters, hiding and marking

`expandLocations()` is applied in **content.tsx only**. Storage keeps the reader's literal
picks so "Africa" stays one removable chip; the content script expands it to the region's
members _plus the region name itself_, because X reports both.

`activeMatches()` is the single decision point for every filter (location, affiliation,
age), applying the allowlist and per-rule exceptions once. The matching itself is
`ruleMatches()`, which ignores exceptions and returns _all_ of them; `activeRulesFor()`
(which adds the bio-driven highlight rule) takes the lot, because the exception button must
be able to name a rule already excepted in order to undo it.

**Not every rule may hide.** `HIDING_RULES` is `location` and `affiliation`, the two the
reader named on purpose; account age is deliberately not on it, because "joined recently"
describes a farmed account and a person who signed up last month equally well. Three
readers: `hideMatchFor()`, first match _allowed_ to hide, driving `tryHideArticle` /
`tryHideQuote` and returning the rule the placeholder names; `markMatchFor()`, first match
that does _not_ hide, driving `tryMarkArticle` / `markTweetsForUser` and setting
`TWEET_MARK_ATTR`, deliberately **not** gated on `hideMode` (that setting answers "what
happens to a post a filter caught", and a rule that only marks never catches one in that
sense); and `cellMatchFor()`, first match of any kind, for people-list rows where
everything is marked and nothing removed.

**A lookup the reader started by hand never collapses on the spot.** `processCard` passes
`hideNow: false` to `applyFiltersForUser`, and the swipe applies no filters at all — a
hover card opens _at_ a post, and taking that post away is not an answer to the question it
asked. The verdict is still recorded, so every later post by that account is collapsed at
birth like any other.

**Marking the matched keyword** (`markKeywords`, `keywordRangesIn`) never touches a node X
owns — the hover card is React's and it re-renders. Text keywords use the **CSS Custom
Highlight API** (Ranges under `x-loc-keyword`, styled by `::highlight()`, no markup
changed). Emoji keywords can't: X renders emoji as `<img alt="🇷🇺">` with no text node to
range over, so those get a generated stylesheet (`#x-loc-kw-styles`) matching the alt,
scoped to cards carrying `KEYWORD_MATCH_ATTR`. **The alt is escaped on the way in — it is
user input reaching a selector.** `CSS.highlights` is absent before Firefox 140, where the
text half simply doesn't paint. `findKeywordMatches()` runs the same two matchers as
`matchesAnyKeyword()`, so a mark can never point at a word the rule didn't fire on.

**Each keyword carries its own mode**, `word` or `partial`, chosen from its badge in either
editor and stored with it (`{text, mode}[]` under `HIGHLIGHT_KEYWORDS_KEY`). One compiled
pattern holds the whole list, each keyword contributing an alternative with its own
boundaries — so name and bio need no setting between them, and "nft" can be found inside
"NFTguy" in the same list where "art" is not found inside "partido". A keyword stored
before 1.7.4 is a bare string and reads as `word`, which is what it meant.

The boundary is `\p{L}\p{N}`, deliberately not `\w`: an underscore is a separator, so
"nft_lover" and "nft.eth" are caught by a whole-word "nft" without anyone turning
anything on.

**One exception button, whatever the rule.** `buildExceptionButton(userName, rules)` covers
every rule acting on the account and names them only in its tooltip; the exceptions stay
per-rule underneath. Three places, via `syncExceptionButton()` or a direct call: hover
cards (`processCard`), the primary tweet of a status page (`syncPrimaryExceptionButton` — X
opens no hover card for it), and a post revealed from a collapse placeholder
(`placeRevealedException`). Any rule change re-syncs from `rehighlightAll()` **and**
`refreshHiddenTweets()`.

**The placeholder itself never carries it.** A collapsed post shows nothing to hover, so
the timeline has no other way to reach the button — but it is withheld until "Show", since
sparing an account is a judgement about what it posts and a collapsed post gives the reader
nothing to judge. On "Show" the placeholder goes and the button lands at the end of the
account's `.x-loc-feed-row`, beside the flags; with no such row (the reader turned it off,
or the rule that caught the post is one the row has nothing to say about) it goes where the
row would have been, after the name line. Never into the post's own body.

**⚠️ is the location rule showing, not a property of the country.**
`getLocationDisplay(loc, userName)` swaps the flag for ⚠️ only while that rule is _acting_
— `locationRuleActs()`, which is `isExcepted('location', …)` inverted, so the allowlist
counts too. Excepted, the row shows the country's own flag again; with no handle to judge
by it warns, the answer that cannot under-warn. Every caller has a handle:
`buildInfoRow(data, userName)` and `locationSummaryText(data, userName)`. Deliberately
_not_ affected: `ruleMatches()`' icons and `flagEmojiFor()` (the snapshot strip), which
never warn — a placeholder names the rule in words, and a warning in a reposted image reads
as something X said.

**The swap happens in place, on rows already drawn.** `refreshLocationFlags()` re-answers
it for every `.x-loc-info` from `data-user` on the row and `data-country` on each flag — no
cache read, so it runs synchronously from `refreshHiddenTweets()`, which every rule change
already goes through. Rebuilding the rows would take height out of a post and put it back,
which is what the section below is about; that is also why `.x-loc-icon-abbr` carries a
`min-height`, since a region is drawn as a word and the warning as an emoji, and without it
the swap was 12px of post height appearing and disappearing
(`visual/location-row.spec.ts` measures it).

## Resizing without moving the scroll

X's virtualised timeline compensates for a cell resized where the reader can't see it by
scrolling the window itself — one `window.scrollBy` per cell it saw resize, each carrying
the running total for the batch rather than that cell's own delta. One at a time is exact;
several in a frame scroll by a multiple of the height that changed. Collapsing seven
replies together moved the scroll 8244px for 2065px of content.

`whenSafeToResize(target, apply)` runs `apply` now when it cannot move the scroll, else
parks it on an `IntersectionObserver` until the target's top edge is safely in view.
Parking again replaces the pending call, so the newest verdict lands; `runNow` is the
counterpart for a node never laid out (a post collapsed at birth has no height to change).

**"Safe" starts below X's sticky header, not at the viewport top.** The header is **54px**,
desktop and mobile alike, and X compensates for a cell resized _under_ it exactly as for
one above the viewport. Measured on a status page with `window.scrollBy` wrapped: rows at
`top` 25 and 52 each moved the page by their own growth (83px, 63px, one `scrollBy` from
X's `c.scrollBy`); rows at 71 and below moved nothing. `FOLD_MARGIN_PX` is **56** — the
header plus two pixels for a fractional top landing on its edge. **A boxless target is
applied on the spot**: a silently hidden post is `display: none`, so its rect is all zeros,
and under a margin `top < margin` would park it on an observer that can never report a box,
leaving it hidden after the mode change back. **X re-anchors on scroll**, and a resize in
the same breath as one is not compensated for at all — which is why `hide-blocked.test.ts`
waits after placing a row under the header: without that wait the jump does not happen and
the test proves nothing (0px twice with the guard removed, 83px twice with it).

`extensionEnabled` is honoured by **stripping what is already on screen**
(`stripAllInjections`), not only by skipping new work.

`styles.ts` owns the injected stylesheet **and the class/attribute names it is written
against** (`HIDDEN_ATTR`, `KEYWORD_MATCH_ATTR`, …). Renaming one without the other turns a
rule into a selector that matches nothing, silently — and a test can render the real CSS
without importing `content.tsx`, which talks to chrome APIs the moment it loads. One
selector list covers highlighted posts, highlighted quote cards and marks, so a post
matching two rules has no cascade to resolve.
