export const EVENTS = {
  HEADERS_CAPTURED: 'x-loc-headers-captured',
  REQUEST_HEADERS: 'x-loc-request-headers',
  USERS_DATA: 'x-loc-users-data',
  REQUEST_USERS: 'x-loc-request-users',
} as const

export const X_GRAPHQL_PATH = 'x.com/i/api/graphql'

// Which community-cache backend a build talks to, and empty to disable it
// entirely. See "Shared cache backends" in CLAUDE.md — including why `?.`.
export const CACHE_API_BASE =
  import.meta.env?.VITE_CACHE_API_BASE ?? 'https://xloc.vmirrormanv.xyz'
