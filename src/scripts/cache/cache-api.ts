import { CACHE_API_BASE, MSG } from '../constants'

// Every request to the community cache is made by the service worker. x.com may
// send Connection-Allowlist, which in Chrome blocks a content script's fetches
// to any origin it does not list (checked 2026-10-21, Chrome 155); it never
// covers the worker. See "Who calls the server" in ./CLAUDE.md.

export const CACHE_ROUTES = ['/v1/loc/batch', '/v1/loc', '/v1/stats'] as const
export type CacheRoute = (typeof CACHE_ROUTES)[number]

export interface CacheApiRequest {
  type: typeof MSG.CACHE_API
  route: CacheRoute
  /** Sent as a JSON POST; without one the request is a bodyless GET. */
  body?: unknown
}

/** `body` is the parsed JSON, and only set when `ok`. */
export interface CacheApiReply {
  ok: boolean
  status: number
  body: unknown
}

const FETCH_TIMEOUT_MS = 5000
const UNANSWERED: CacheApiReply = { ok: false, status: 0, body: null }

function isCacheRoute(value: unknown): value is CacheRoute {
  return (CACHE_ROUTES as readonly unknown[]).includes(value)
}

export function isCacheApiRequest(
  message: unknown,
): message is CacheApiRequest {
  const m = message as Partial<CacheApiRequest> | null
  return m?.type === MSG.CACHE_API && isCacheRoute(m.route)
}

/** Worker side. Never throws: a timeout or a dead network is `UNANSWERED`. */
export async function answerCacheApi(
  request: CacheApiRequest,
): Promise<CacheApiReply> {
  const hasBody = request.body !== undefined
  // Not AbortSignal.timeout: its timer is one fake timers cannot advance.
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const resp = await fetch(`${CACHE_API_BASE}${request.route}`, {
      method: hasBody ? 'POST' : 'GET',
      headers: hasBody ? { 'content-type': 'application/json' } : undefined,
      body: hasBody ? JSON.stringify(request.body) : undefined,
      credentials: 'omit',
      signal: controller.signal,
    })
    if (!resp.ok) return { ok: false, status: resp.status, body: null }
    return { ok: true, status: resp.status, body: await resp.json() }
  } catch {
    return UNANSWERED
  } finally {
    clearTimeout(timer)
  }
}

/** Tab and popup side. A worker that cannot be reached is `UNANSWERED` too. */
export async function askCacheApi(
  route: CacheRoute,
  body?: unknown,
): Promise<CacheApiReply> {
  const request: CacheApiRequest = { type: MSG.CACHE_API, route, body }
  try {
    const reply = (await chrome.runtime.sendMessage(request)) as
      | CacheApiReply
      | undefined
    return reply ?? UNANSWERED
  } catch {
    return UNANSWERED
  }
}
