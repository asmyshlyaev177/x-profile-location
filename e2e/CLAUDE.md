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

## Gotchas

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
