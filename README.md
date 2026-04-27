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

pnpm dev       # build + watch for Chrome/Brave/Safari
pnpm build     # production build (all browsers)
pnpm test      # vitest run --coverage
pnpm fix       # oxfmt + oxlint --fix
pnpm zip       # package extension ZIPs for store submission
```

Built output goes to `dist/<browser>/`.

## Tech stack

| Concern | Tool |
| --- | --- |
| Framework | [Bedframe](https://bedframe.dev) |
| UI | Preact + TSX |
| Build | Vite |
| Styling | Tailwind CSS v4 |
| Tests | Vitest + Happy DOM |
| Lint/format | Oxlint + oxfmt |
| Package manager | pnpm |

## Browsers

Chrome, Brave, Safari. (Firefox manifest exists but is not included in the active Bedframe config.)
