# `src/scripts`

This folder contains Bedframe runtime script source files.

## Working rules

- Keep script paths aligned with the manifest source and actual files on disk.
- The service worker is the default background/runtime entrypoint in a standard Bedframe scaffold.
- Only add content scripts or extra runtime files when the extension shape or feature actually requires them.
- Do not move runtime files without re-checking `src/manifests/*` and `src/_config/bedframe.config.ts`.

## Current project shape

- Extension type: `overlay`
- Framework: `preact`

## Script inventory

| File                 | Context                         | Role                                                                                                     |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `page-script.ts`     | `world: MAIN` (page JS context) | Wraps `fetch` + `XHR`; captures auth headers; extracts user bios from timeline/tweet API responses       |
| `content.tsx`        | Content script                  | Fetches location via `AboutAccountQuery`; injects DOM rows into hover cards/tweets; cache + highlighting |
| `extract-users.ts`   | Shared utility                  | Recursively walks GraphQL JSON to find `__typename: 'User'` nodes (depth limit: 20)                      |
| `cache.ts`           | Shared utility                  | IndexedDB CRUD via idb-keyval; 30-day TTL; keys are lowercased usernames                                 |
| `shared-cache.ts`    | Shared utility                  | Client for the optional crowdsourced location cache (`../../server`); batch lookup + contribute, opt-in  |
| `countries.ts`       | Shared data                     | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR` maps; `chrome.storage` key constants                      |
| `i18n.ts`            | Shared utility                  | `t(key, …subs)` over `chrome.i18n`; `uiLocale()`                                                         |
| `location-names.ts`  | Shared utility                  | Country/region names per locale, derived from flag emoji via `Intl.DisplayNames`                         |
| `grapheme.ts`        | Shared utility                  | Grapheme-cluster-aware substring search for keyword highlight matching                                   |
| `lookup-broker.ts`   | Service worker                  | One lookup queue, rate-limit ledger and pace shared by every open x.com tab                              |
| `prefetch-poller.ts` | Content script                  | Asks the broker what to look up next, fetches it, asks again — the clock the worker cannot hold          |
| `service-worker.ts`  | Background script               | `chrome.storage.local` init on install; toolbar badge; the lookup broker's message plumbing              |
| `analytics.ts`       | Shared utility                  | Thin wrapper for analytics event tracking                                                                |

## Cross-context communication

`page-script.ts` (`world: MAIN`) and `content.tsx` cannot share module state. They communicate via `window.dispatchEvent(new CustomEvent(...))`:

| Event                    | Direction             | Payload                                        |
| ------------------------ | --------------------- | ---------------------------------------------- |
| `x-loc-headers-captured` | page-script → content | `{ headers: Record<string, string> }`          |
| `x-loc-request-headers`  | content → page-script | _(empty — triggers re-emit of stored headers)_ |
| `x-loc-users-data`       | page-script → content | `{ users: (UserBio & { priority })[] }`        |

The content script and the service worker talk over `chrome.runtime` /
`chrome.tabs` instead; every message name is in `constants.ts` as `MSG`, and the
lookup ones are described under "Cross-tab lookup broker" in `CLAUDE.md`.

## UI strings

All user-facing copy lives in `public/_locales/<locale>/messages.json` and is
read with `t('key')` from `i18n.ts`. Never hardcode a string in a component.

- **Spell it `t('key')`, always literally.** Building the key from a variable
  hides it from `messages.test.ts`, which is what catches an unused or missing
  message. Where a lookup has to be lazy — and most do, since the language can
  change under a loaded page — use a record of thunks: `{ location: () =>
t('ruleLocation') }`. `FILTER_RULE_LABEL` in `content.tsx` is the pattern.
- **Nothing may call `t()` at module scope.** The chosen language is loaded
  asynchronously, so a constant built at import time captures the wrong one.
- **`default_locale` + `__MSG_*__` in the manifest** is what makes the _store
  listing_ localized, not just the UI — Chrome and AMO resolve those against
  the same catalogue. `appName` must stay under 50 characters in every locale;
  AMO rejects longer.
- **`localeTag`** is the one message that is not a translation. `uiLocale()`
  reads it because the browser lies: with `--lang=ru` Chrome serves the `ru`
  catalogue while both `getUILanguage()` and `@@ui_locale` still say `en_US`.
- **Country names are never translated by hand.** A flag emoji encodes its ISO
  code, so `location-names.ts` derives all 232 from `Intl.DisplayNames` — the
  `short` width for display, every width for the picker's search, which is
  where "США" and "ABD" come from. Display only: storage, comparison and the
  shared cache keep the canonical English name X itself reports.
- **`description` belongs to `en` alone.** The browser ignores it, and it is a
  note for whoever translates — so it lives in the file they translate _from_.
  Add one when it says something the key and the message do not: a length cap,
  a word to leave in English, what a `$1` holds, the grammatical case a phrase
  has to read in. Do not add one that restates the key; "Settings card title."
  taught nobody anything and trained translators to stop reading the field.
- `messages.test.ts` enforces key parity across all fifteen locales, `$1`
  preservation, no descriptions outside `en`, no unused or missing keys, and
  the AMO name cap. Run it before merging any translation, and `pnpm locales`
  (`scripts/sync-locales.mjs`) after one — a message added while a translation
  pass was in flight comes back missing, and `--write` fills the gap from
  English and drops any description that came with it.
- The build strips `en`'s descriptions from the shipped catalogue
  (`leanLocales` in `vite.config.ts`).

### The language picker

`UI_LANGUAGE_KEY` holds a locale directory name, or `''` for "follow the
browser" — the default. `chrome.i18n` cannot be overridden, so a chosen
language is honoured by loading that catalogue directly and answering from it
before the browser's.

Extension pages read the file themselves; **the content script asks the service
worker** (`GET_MESSAGES`), because `fetch` on an extension URL from x.com would
need `_locales/` in `web_accessible_resources`, and a fetchable extension URL
is something the page can probe for. Do not shortcut this.

Changing the language reloads the options page and the popup, and makes the
content script strip and redraw its injections — the incremental refreshes
compare a post's _rule_, which a language change does not move.

## Critical constants

- **`QUERY_ID`** in `content.tsx` (`XRqGa7EeokUU5kppkh13EA`) — GraphQL operation ID for `AboutAccountQuery`. May rotate when X updates their API; verify against live traffic when the extension breaks.
- **Depth limit 20** in `extract-users.ts` — guards against deeply nested or circular GraphQL responses. Do not lower without checking real HomeTimeline nesting depth.
- **`world: MAIN`** in manifests — must stay on `page-script.ts`. Removing it breaks header capture.

## Tests

Each script has a co-located `*.test.ts`. For test patterns (FakeXHR, `vi.resetModules`, idb-keyval mock, chrome global hoisting) see `CLAUDE.md` at the project root.

## Read next

- Root `AGENTS.md`
- `CLAUDE.md` (architecture, API details, test patterns)
- `src/manifests/AGENTS.md`
- `.agents/skills/bedframe`
