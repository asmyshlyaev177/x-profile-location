# X Profile Location

A browser extension that shows a country flag (or region abbreviation) in X hover cards and profile pages, sourced from X's own location API.

Live landing page: [x-profile-location.pages.dev](https://x-profile-location.pages.dev)

## How it works

1. **`page-script.ts`** — runs in the page's own JS context (`world: MAIN`) to intercept `fetch`/`XHR`. Captures auth headers from outgoing `x.com/i/api/graphql` requests and extracts user bios from `HomeTimeline` and `TweetDetail` responses, dispatching both to the content script via custom events.
2. **`content.tsx`** — injected into every X page. Listens for captured headers and bio data from `page-script.ts`, fetches location via `AboutAccountQuery` on hover, merges everything into an IndexedDB cache, and injects a location row into hover cards and tweet articles.
3. **`service-worker.ts`** — background script. Initialises the blocked-countries list in `chrome.storage.local` on install and tracks install/update analytics events.
4. **`options.tsx`** — embedded options page where users configure which countries/regions to block.

### Data sources

- **Location & VPN flag** — fetched on demand from X's `AboutAccountQuery` GraphQL endpoint using the session's own auth headers (no extra credentials needed).
- **Bio** — extracted passively from `HomeTimeline` / `TweetDetail` responses as the user browses; no additional network requests.
- **Store badge** — derived from the `source` field returned by `AboutAccountQuery` (e.g. `Japan Android App` → `📱 🇯🇵`).

### Icon display order (left → right)

`📱 <store-country>` → `<location flag or region abbr>` → `⚠ VPN`

- **Store badge** — app store country the account was created with (e.g. `📱 🇯🇵`)
- **Location** — country flag emoji for countries; 3-letter abbreviation (e.g. `NAM`, `EUR`) for regions, with the full name on hover
- **VPN badge** — shown when X flags the location as potentially inaccurate

## Project structure

```text
src/
├── _config/
│   ├── bedframe.config.ts   # Bedframe configuration (browsers, pages, test setup)
│   └── tests.config.ts      # Vitest setup file
├── assets/icons/            # Extension icons (16, 32, 48, 128 px)
├── manifests/               # Browser-specific manifest definitions
│   ├── base.manifest.ts
│   ├── chrome.ts
│   ├── brave.ts
│   ├── firefox.ts
│   └── safari.ts
├── pages/
│   ├── main.html            # Overlay entry point (unused UI shell)
│   ├── options.html         # Options page entry
│   └── options.tsx          # Options page component (Preact)
├── scripts/
│   ├── content.tsx          # Content script — main extension logic
│   ├── countries.ts         # COUNTRY_FLAGS, REGION_FLAGS, REGION_ABBR, blocked defaults
│   ├── cache.ts             # IndexedDB cache via idb-keyval
│   ├── page-script.ts       # Injected into page context to intercept XHR/fetch
│   ├── service-worker.ts    # Background script
│   └── analytics.ts         # Event tracking helpers
├── messages/                # i18n message files
├── index.css                # Global styles
└── main.tsx                 # Overlay entry (minimal)

landing/                     # Separate Vite + Preact landing page (see landing/README.md)
```

## Quick start

```bash
pnpm install

pnpm dev       # build + watch for Chrome/Brave/Firefox/Safari
pnpm build     # production build (all browsers)
pnpm test      # vitest run --coverage
pnpm fix       # oxfmt + oxlint --fix
pnpm zip       # package extension ZIPs for store submission
```

Built output goes to `dist/<browser>/`.

## E2E tests

```bash
pnpm e2e:profile   # one-time: log in to X in a real browser, hand the profile to Playwright
pnpm test:e2e      # run the suite (xvfb, replay mode by default)
```

X flags Playwright's bundled Chromium, so the suite runs on a profile you log
into by hand. `pnpm e2e:profile` opens Brave (or `--browser=chromium|chrome|<path>`)
on its own profile under `e2e/.auth/`; log in, close the window, and it copies the
profile plus a note of which binary made it. From then on the tests launch that
same browser with a clone of that profile. Re-run it when X invalidates the
session. Nothing under `e2e/.auth/` is committed — it holds a live session.

## Tech stack

| Concern         | Tool                             |
| --------------- | -------------------------------- |
| Framework       | [Bedframe](https://bedframe.dev) |
| UI              | Preact + TSX                     |
| Build           | Vite                             |
| Styling         | Tailwind CSS v4                  |
| Tests           | Vitest + Happy DOM               |
| Lint/format     | Oxlint + oxfmt                   |
| Package manager | pnpm                             |

## Browsers

Chrome, Brave, Firefox, Safari.

Firefox needs Gecko 128+ (`content_scripts[].world: "MAIN"`) and runs the background
module as `background.scripts` rather than a service worker, which Firefox doesn't
implement. `vite.config.ts` passes `browser: 'firefox'` to crxjs on that build mode so
the emitted loader and `web_accessible_resources` match. Before a first AMO submission,
the manifest still needs a `browser_specific_settings.gecko.data_collection_permissions`
declaration.

The Playwright suite is Chrome-only — Playwright cannot install a Firefox extension or
open `moz-extension://` pages. Check Firefox by hand instead:

```bash
pnpm dev:firefox   # builds dist/firefox, runs it in Firefox via web-ext, opens x.com
```

It keeps a profile at `e2e/.auth/firefox-profile`, so you log in to X once. Firefox MV3
treats host permissions as user-granted, so allow x.com from the extensions button on
the first run — real users have to do this too.
