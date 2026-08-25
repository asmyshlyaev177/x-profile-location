# CLAUDE.md — x-profile-location

Project-specific context. Read before editing any source file.

**Detail lives next to the code it describes.** Claude loads these when you open a
file in that folder; read one directly when you need it first.

- **`src/scripts/CLAUDE.md`** — runtime: the API and its rate limit, data types,
  filters and hiding, resizing without moving the scroll, i18n, snapshots, the
  unit-test patterns. The full file inventory is here too.
- **`src/scripts/prefetch/CLAUDE.md`** — the queue, the pace, the cross-tab broker.
- **`src/scripts/cache/CLAUDE.md`** — the local IDB cache and the community one.
- **`src/scripts/countries/CLAUDE.md`** — country names, regions and aliases.
- **`src/scripts/content/CLAUDE.md`** — the rows, filters, gestures and scroll rules.
- **`src/manifests/CLAUDE.md`** — the store listing title and its 50-char cap.
- **`integration/CLAUDE.md`** — two tabs against the built extension.
- **`visual/CLAUDE.md`** — the layout suite.
- **`e2e/CLAUDE.md`** — the recorded x.com suite, browser profile, Firefox.
- **`landing/CLAUDE.md`** — the site and its Lighthouse gate.
- **`server/README.md`** — backend choice, `/v1/stats`.

This is a **Bedframe** extension: `src/_config/bedframe.config.ts` is the canonical
project definition and `src/manifests/*` the manifest source. Load
`.claude/skills/bedframe/SKILL.md` before touching either. Day-to-day work uses the
`pnpm` scripts below, not `bedframe` directly; CI is `.github/workflows/tests.yml`, which
runs two jobs — `extension` and `audits` (Bedframe's standard `mvp.yml` release
path is not set up here).

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
**the CLAUDE.md for that folder**, under the section for that area, and the source
points at it by name (`// … see "Localization" in src/scripts/CLAUDE.md`). That way
it is findable by somebody who isn't already looking at the line it hangs off, and
there is one copy of it. Source carries the note; CLAUDE.md carries the argument.

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

## Architecture: three-layer pipeline

```text
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

## Key files

Enough to orient. The full inventory — every file in `src/scripts`, with the
reasoning behind each — is in `src/scripts/CLAUDE.md`.

| File                           | Purpose                                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------- |
| `src/scripts/page-script.ts`   | `world: MAIN`. Wraps `fetch` + `XHR`; captures auth headers, extracts bios.            |
| `src/scripts/content/`         | Content script. Calls `AboutAccountQuery`, injects rows, runs the MutationObserver.    |
| `src/scripts/prefetch/`        | Service worker broker + queue + poller: one pace for every open tab.                   |
| `src/scripts/cache/`           | Local IndexedDB cache (30-day TTL) and the community cache client.                     |
| `src/scripts/countries/`       | Flag and region maps, aliases, canonical names.                                        |
| `src/scripts/settings.ts`      | Every setting, its normalizer and its default. The only way to read one.               |
| `src/scripts/styles.ts`        | The injected stylesheet **and** the class/attribute names it is written against.       |
| `src/pages/popup.tsx`          | Toolbar popup — master switch, feed flags, account card, filtered-post mode.           |
| `src/pages/options.tsx`        | Settings page, five tabs (Display / Filters / Exceptions / Data & privacy / Advanced). |
| `src/pages/theme.ts`           | Applies `THEME_KEY` — sets `data-theme` on `<html>`, nothing else.                     |
| `src/components/Autocomplete/` | Reusable Preact autocomplete used in the options page.                                 |

---

## Build & test

```bash
pnpm install
pnpm dev             # watch build for Chrome (default)
pnpm build           # production build all browsers → dist/<browser>/
pnpm test            # vitest run --coverage  (happy-dom, Istanbul)
pnpm test:visual     # playwright layout tests — headless, no session, no HARs
pnpm test:popup-window # the real action popup's width, under Xvfb (needs pnpm build)
pnpm test:audits     # token contract, contrast and lighthouse over the built landing site
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
| `pnpm test:audits`      | Does the landing site still score 100?  | a headless browser                | `landing/**` only |

`pnpm test:popup-window` is the odd one out, and not a suite: it opens the **real
browser-action popup** and checks the window keeps its width as the panel grows.
Chrome sizes that window to the document, so a scrollbar appearing moves the
whole popup — and nothing else here can see it. Playwright cannot open a popup
(this drives `chrome.action.openPopup()` over raw CDP), an unfocused window
refuses to show one (hence Xvfb and `wmctrl`), and headless Chromium has overlay
scrollbars, which take no width at all. Run it after touching `popup.module.css`,
against a current `dist/chrome`.

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
