export const EVENTS = {
  HEADERS_CAPTURED: 'x-loc-headers-captured',
  REQUEST_HEADERS: 'x-loc-request-headers',
  USERS_DATA: 'x-loc-users-data',
  REQUEST_USERS: 'x-loc-request-users',
} as const

export const X_GRAPHQL_PATH = 'x.com/i/api/graphql'

// Base URL of the shared community location cache (../../server).
//
// Build-time switch, so which backend a build talks to is never a source edit:
//
//   pnpm build         → the self-hosted Node+SQLite box (default)
//   pnpm build:worker  → the Cloudflare Worker
//   pnpm build:nocache → feature fully inert
//
// The default is the self-hosted deployment because D1's free plan caps out
// around 150 users on rows-written/day, which is the ceiling this project
// outgrew; see "Backend" in server/README.md. The Worker build is kept working
// and one command away — it is still the cheapest way to stand up a new
// instance, and it is what already-installed extensions keep talking to until
// their users update.
//
// The empty case is deliberate and reachable: `??` only falls back on an *unset*
// variable, so exporting an empty VITE_CACHE_API_BASE disables the shared cache
// entirely — no requests are made to any server, and the options page hides the
// toggle (see isSharedCacheConfigured in shared-cache.ts).
//
// The `?.` is for Playwright, not for Vite. The e2e suite imports this module
// through Playwright's own TypeScript loader, which knows nothing of Vite and
// leaves `import.meta.env` undefined — so a bare property access throws at import
// time and takes the whole suite down with it ("0 tests in 0 files"). Vite still
// substitutes the full `import.meta.env.VITE_CACHE_API_BASE` expression, and an
// explicitly empty value is still an empty string rather than undefined, so the
// disable-the-cache case above is unaffected.
export const CACHE_API_BASE =
  import.meta.env?.VITE_CACHE_API_BASE ?? 'https://xloc.vmirrormanv.xyz'
