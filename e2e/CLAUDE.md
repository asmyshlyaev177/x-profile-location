# `e2e` — the recorded x.com suite

The only suite that can notice X changed. Not in CI: it needs a real session and
the HARs. `pnpm test:e2e` (`E2E_HEADED=1` to watch it).

## Recording proxy (`test-proxy-recorder`)

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

## Recording, end to end

`pnpm test:e2e:record` is the interactive route: headed, `--ui`, and it runs
`pnpm scrub` for you afterwards. Without a UI, flip `MODE` in `fixtures.ts` to
`'record'`, run the one test (`pnpm exec playwright test <file> -g "<title>"`),
then **`pnpm run scrub`**, then flip `MODE` back and re-run under replay to prove
the capture is usable. A recorded-but-unscrubbed HAR must never be committed.

**Let the run end before closing UI mode.** The global teardown is what strips
cookies and auth headers from the HARs, one plain `writeFile` each. Closing the UI
while it ran (2026-09-30) cut 11 recordings at 512 KiB boundaries and left 21
holding the live session cookie (`grep -l auth_token= e2e/recordings/*.har`). Any
later CLI run's teardown redacts whatever parses; re-record what doesn't.

Scrubbing is a pass over **every** recording, not only the new one: it
pseudonymises handles, names, bios and avatars across the corpus, so it routinely
rewrites HARs the current change never touched. Those diffs are the process
working — commit them, don't revert them, and don't report them as churn.
`pnpm scrub:check` is the gate ("no unscrubbed identities"); handles named in a
test file are kept, which is why it scans the specs too.

## Headless

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

## Browser profile

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
- **Replay runs on this login too, not only recording.** X's sign-in cannot be
  mocked, so a replayed page has to match the seeded session: never rewrite its
  cookies (`twid` and the rest) in a fixture, and never scrub the account id a page
  carries. Rewriting that id failed every x.com spec at its first tweet
  (2026-09-30). When the x.com specs fail on login, re-seed with `pnpm e2e:profile`.

## Gotchas

- **A new test that loads x.com needs its own recording.** Sessions are named
  `<file>__<test-title>` (`generateSessionId`, from `testInfo.titlePath`) with no
  override, so a test with no capture fails at the fixture with `ENOENT … .har`.
  Record with `pnpm test:e2e:record`, then `pnpm scrub`. **Renaming a test orphans
  its recording.**
- **Record it; don't borrow one.** A test that visits the same page as an existing
  one still gets its own capture. Copying a HAR under a second name, or faking
  `titlePath` so two tests share a session id, is not the shortcut it looks like:
  the recording stops describing what the test does, and the next re-record has
  two owners writing one file. 15MB of HAR is the price of the suite.
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
  `tweetArticles()` / `waitForReplies()` / `mostLikedReply()` /
  `mostRepliedReplyPath()` from `helpers.ts`. Both pickers count only rows
  **below** the page's own tweet: a reply's page renders its parent above it, and
  the parent outscores every reply. `mostLikedReply()` re-anchors on the author's
  handle, because X's virtualised timeline recycles rows out from under a handle.
- Pick replies by rank, never by position. X ranks replies per viewer, so a
  positional pick lands elsewhere after a re-record: "reply 2" opened a page with
  no replies for the new recording account (2026-09-30).
- **A block is mocked, not recorded.** No account blocks the recording account
  made in September 2026, so `mockBlockedBy()` rewrites `blocked_by` in every
  GraphQL answer as the page reads it; the recording keeps X's real answer. It is
  the one field a real block changed (compared on a recording made while
  `@jpotisch` blocked the old account).
- **A test needs an account's bio? Name the account.** The scrub blanks the bio of
  every account no test source names, so a reply picked at random has none after
  `pnpm scrub` (two tests passed only while X's new user shape leaked bios).
- `addKeyword` / `removeKeyword` live in `helpers.ts` — they open the options page,
  so they cost no x.com traffic.
- **Two runs at once break each other.** Both want the proxy on :8100, and
  `reuseExistingServer` hands the second run the first run's proxy, which dies when
  that run ends. Every test after reports `Error setting proxy mode: fetch failed`
  (`ECONNREFUSED`). Check `ss -ltn | grep 8100` before starting one.
- **Never `route.fulfill` a Chrome Web Store navigation** - Chromium 147 crashes
  outright, taking the context with it. `route.abort()` it (`rating-ask.test.ts`).

## Firefox is checked by hand, not by Playwright

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

## Marketing frames

`screenshots.test.ts` writes two sets, both gated on `SHOOT`:

- the landing and store images (`pnpm shots`), which blur who an account is and
  keep the page otherwise as it was recorded;
- the promo-video frames (`pnpm promo:shots`, titles prefixed `promo:`), which
  go to `landing/extension_store/promo/` and are consumed by
  `landing/scripts/promo-video.mjs`.

The two sets are deliberately different pictures — a listing whose video replays
its own five screenshots wastes the slot — and the promo set is fabricated
rather than blurred. `fictionalise()` overwrites every name, handle, avatar, bio
and follower count with a cast of invented people, leaving every `.x-loc-*` node
(the subject of the shot) alone. `.x-loc-bio` is the one exception: the bio the
extension restores is the account's real one.

Handles are not written down anywhere here. An invented handle may belong to
somebody, so `fictionalise` derives one in the scrubber's own `user_<hex>`
namespace — the same shape `scripts/scrub-recordings.mjs` guarantees is
synthetic.

Two things about capturing at `SHOT_DPR=2`, both found the hard way:

- **An element screenshot of a hover card comes back doubled and scaled.** The
  card is captured through `page.screenshot({ clip })` instead (`shootCard`).
- **The card's plate reads as translucent at 2×**, so the profile page behind it
  prints through whatever the card says. `shootCard` hides every sibling on the
  way up from the card and puts white behind it; the pointer-and-tooltip layer
  is exempt by `data-shot-hint`.
