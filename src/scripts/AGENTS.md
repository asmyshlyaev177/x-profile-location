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

| File                | Context                         | Role                                                                                                     |
| ------------------- | ------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `page-script.ts`    | `world: MAIN` (page JS context) | Wraps `fetch` + `XHR`; captures auth headers; extracts user bios from timeline/tweet API responses       |
| `content.tsx`       | Content script                  | Fetches location via `AboutAccountQuery`; injects DOM rows into hover cards/tweets; cache + highlighting |
| `extract-users.ts`  | Shared utility                  | Recursively walks GraphQL JSON to find `__typename: 'User'` nodes (depth limit: 20)                      |
| `cache.ts`          | Shared utility                  | IndexedDB CRUD via idb-keyval; 30-day TTL; keys are lowercased usernames                                 |
| `shared-cache.ts`   | Shared utility                  | Client for the optional crowdsourced location cache (`../../server`); batch lookup + contribute, opt-in  |
| `countries.ts`      | Shared data                     | `COUNTRY_FLAGS`, `REGION_FLAGS`, `REGION_ABBR` maps; `chrome.storage` key constants                      |
| `grapheme.ts`       | Shared utility                  | Grapheme-cluster-aware substring search for keyword highlight matching                                   |
| `service-worker.ts` | Background script               | `chrome.storage.local` init on install; analytics                                                        |
| `analytics.ts`      | Shared utility                  | Thin wrapper for analytics event tracking                                                                |

## Cross-context communication

`page-script.ts` (`world: MAIN`) and `content.tsx` cannot share module state. They communicate via `window.dispatchEvent(new CustomEvent(...))`:

| Event                    | Direction             | Payload                                        |
| ------------------------ | --------------------- | ---------------------------------------------- |
| `x-loc-headers-captured` | page-script → content | `{ headers: Record<string, string> }`          |
| `x-loc-request-headers`  | content → page-script | _(empty — triggers re-emit of stored headers)_ |
| `x-loc-users-data`       | page-script → content | `{ users: (UserBio & { priority })[] }`        |

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
