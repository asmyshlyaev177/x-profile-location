import { extractUsers } from './extract-users'
import type { UserBio } from './extract-users'
import type { PrefetchPriority } from './prefetch-queue'
import { EVENTS, X_GRAPHQL_PATH } from './constants'

;(function () {
  if ((window as any).__X_LOC_INJECTED__) return
  ;(window as any).__X_LOC_INJECTED__ = true

  let headersCaptured = false
  let storedHeaders: Record<string, string> | null = null

  // An allowlist of non-secrets: the CustomEvent carrying these is observable by
  // the page. Anything X adds later is dropped by omission rather than leaked.
  const FORWARDED_HEADERS = [
    'authorization',
    'x-twitter-client-language',
    'x-twitter-active-user',
  ] as const

  function dispatchHeaders(headers: Record<string, string>) {
    if (headersCaptured) return
    if (!headers['authorization']) return
    const filtered: Record<string, string> = {}
    for (const name of FORWARDED_HEADERS) {
      if (headers[name]) filtered[name] = headers[name]
    }
    headersCaptured = true
    storedHeaders = filtered
    window.dispatchEvent(
      new CustomEvent(EVENTS.HEADERS_CAPTURED, {
        detail: { headers: filtered },
      }),
    )
  }

  window.addEventListener(EVENTS.REQUEST_HEADERS, () => {
    if (storedHeaders) {
      window.dispatchEvent(
        new CustomEvent(EVENTS.HEADERS_CAPTURED, {
          detail: { headers: storedHeaders },
        }),
      )
    }
  })

  // ---------------------------------------------------------------------------
  // Bio extraction from timeline/tweet API responses
  // ---------------------------------------------------------------------------
  const BIO_INTERCEPT: Array<[operation: string, priority: PrefetchPriority]> =
    [
      ['HomeTimeline', 'high'],
      ['TweetDetail', 'low'],
    ]

  function interceptPriority(url: string): PrefetchPriority | null {
    for (const [operation, priority] of BIO_INTERCEPT) {
      if (url.includes(operation)) return priority
    }
    return null
  }

  // document_start here, document_idle there: without a replay buffer the first
  // timeline response is dispatched to nobody and the first screen stays blank.
  const USER_BUFFER_CAP = 500
  type PrefetchUser = UserBio & { priority: PrefetchPriority }
  const userBuffer = new Map<string, PrefetchUser>()
  let bufferUsers = true

  /** One entry per account, keeping the first sighting's place in the response. */
  function dedupeByUserName(
    users: UserBio[],
    priority: PrefetchPriority,
  ): PrefetchUser[] {
    const seen = new Set<string>()
    const unique: PrefetchUser[] = []
    for (const u of users) {
      const key = u.userName.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push({ ...u, priority })
    }
    return unique
  }

  function bufferForReplay(users: PrefetchUser[]) {
    for (const u of users) {
      const key = u.userName.toLowerCase()
      // Once 'high', always 'high': a later thread must not bury a feed account
      // behind its replies.
      const wasHigh = userBuffer.get(key)?.priority === 'high'
      // set() keeps the existing insertion slot, so a repeat sighting doesn't
      // lose where the account first appeared — the replay is page order.
      userBuffer.set(key, wasHigh ? { ...u, priority: 'high' } : u)
      if (userBuffer.size > USER_BUFFER_CAP) {
        userBuffer.delete(userBuffer.keys().next().value as string)
      }
    }
  }

  function dispatchUsers(users: UserBio[], priority: PrefetchPriority) {
    if (users.length === 0) return
    const unique = dedupeByUserName(users, priority)
    if (unique.length === 0) return
    if (bufferUsers) bufferForReplay(unique)
    window.dispatchEvent(
      new CustomEvent(EVENTS.USERS_DATA, { detail: { users: unique } }),
    )
  }

  // After the first request the listener is attached, so live dispatches suffice
  // and buffering stops to bound memory.
  window.addEventListener(EVENTS.REQUEST_USERS, () => {
    bufferUsers = false
    if (userBuffer.size === 0) return
    window.dispatchEvent(
      new CustomEvent(EVENTS.USERS_DATA, {
        detail: { users: [...userBuffer.values()] },
      }),
    )
    userBuffer.clear()
  })

  // ---------------------------------------------------------------------------
  // Wrap fetch
  // ---------------------------------------------------------------------------

  /** The URL of a fetch() argument, in whichever of its three forms it arrived. */
  function requestUrl(input: RequestInfo | URL): string {
    if (typeof input === 'string') return input
    if (input instanceof URL) return input.href
    return (input as Request).url
  }

  function lowercasedRecord(
    entries: Iterable<[string, string]>,
  ): Record<string, string> {
    const headers: Record<string, string> = {}
    for (const [name, value] of entries) headers[name.toLowerCase()] = value
    return headers
  }

  /**
   * Headers as lowercased name → value. fetch() takes them as a Headers, pairs or
   * a plain object, on the init or (with a Request) the input — all land here.
   */
  function requestHeaders(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Record<string, string> {
    const raw =
      init?.headers ?? (input instanceof Request ? input.headers : undefined)
    if (!raw) return {}
    if (raw instanceof Headers) return lowercasedRecord(raw.entries())
    if (Array.isArray(raw)) return lowercasedRecord(raw as [string, string][])
    return lowercasedRecord(Object.entries(raw as Record<string, string>))
  }

  const originalFetch = window.fetch.bind(window)
  ;(window as any).fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const url = requestUrl(input)

    if (url.includes(X_GRAPHQL_PATH) && !headersCaptured) {
      dispatchHeaders(requestHeaders(input, init))
    }

    const priority = interceptPriority(url)
    const promise = originalFetch(input, init)

    if (priority) {
      promise
        .then((response) => {
          const cloned = response.clone()
          cloned
            .json()
            .then((json: unknown) => {
              dispatchUsers(extractUsers(json), priority)
            })
            .catch(() => {})
        })
        .catch(() => {})
    }

    return promise
  }

  // ---------------------------------------------------------------------------
  // Wrap XMLHttpRequest
  // ---------------------------------------------------------------------------
  const OriginalXHR = window.XMLHttpRequest
  function PatchedXHR(this: XMLHttpRequest) {
    const xhr = new OriginalXHR()
    let _url = ''
    const _headers: Record<string, string> = {}

    const originalOpen = xhr.open.bind(xhr)
    // oxlint-disable-next-line max-params
    ;(xhr as any).open = function (
      method: string,
      url: string,
      async?: boolean,
      user?: string,
      password?: string,
    ) {
      _url = url
      return originalOpen(method, url, async ?? true, user, password)
    }

    const originalSetRequestHeader = xhr.setRequestHeader.bind(xhr)
    ;(xhr as any).setRequestHeader = function (key: string, value: string) {
      _headers[key.toLowerCase()] = value
      return originalSetRequestHeader(key, value)
    }

    const originalSend = xhr.send.bind(xhr)
    ;(xhr as any).send = function (
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (_url.includes(X_GRAPHQL_PATH) && !headersCaptured) {
        dispatchHeaders(_headers)
      }
      const priority = interceptPriority(_url)
      if (priority) {
        xhr.addEventListener('load', () => {
          try {
            const json = JSON.parse(xhr.responseText)
            dispatchUsers(extractUsers(json), priority)
          } catch {}
        })
      }
      return originalSend(body)
    }

    return xhr
  }
  PatchedXHR.prototype = OriginalXHR.prototype
  ;(window as any).XMLHttpRequest = PatchedXHR
})()
