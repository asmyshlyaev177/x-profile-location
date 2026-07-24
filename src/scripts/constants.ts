export const EVENTS = {
  HEADERS_CAPTURED: 'x-loc-headers-captured',
  REQUEST_HEADERS: 'x-loc-request-headers',
  USERS_DATA: 'x-loc-users-data',
  REQUEST_USERS: 'x-loc-request-users',
} as const

export const X_GRAPHQL_PATH = 'x.com/i/api/graphql'

// Base URL of the shared community location cache (Cloudflare Worker in ../server).
// Leave empty to disable the feature entirely — no requests are made to any
// server until this is set to a deployed Worker origin, e.g.
//   'https://x-loc-cache.<your-subdomain>.workers.dev'
export const CACHE_API_BASE = 'https://x-loc-cache.asmyshlyaev177.workers.dev'
