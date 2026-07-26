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
//   pnpm build                                          → the Cloudflare Worker (default)
//   VITE_CACHE_API_BASE=https://xloc.example.com pnpm build → a self-hosted Node+SQLite box
//   VITE_CACHE_API_BASE= pnpm build                     → feature fully inert
//
// The empty case is deliberate and reachable: `??` only falls back on an *unset*
// variable, so exporting an empty VITE_CACHE_API_BASE disables the shared cache
// entirely — no requests are made to any server, and the options page hides the
// toggle (see isSharedCacheConfigured in shared-cache.ts).
export const CACHE_API_BASE =
  import.meta.env.VITE_CACHE_API_BASE ??
  'https://x-loc-cache.asmyshlyaev177.workers.dev'
