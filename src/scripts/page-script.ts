import { extractUsers } from './extract-users'
import type { UserBio } from './extract-users'
import type { PrefetchPriority } from './prefetch-queue'
import { EVENTS, X_GRAPHQL_PATH } from './constants'

;(function () {
  if ((window as any).__X_LOC_INJECTED__) return
  ;(window as any).__X_LOC_INJECTED__ = true

  let headersCaptured = false
  let storedHeaders: Record<string, string> | null = null

  // Only these (non-secret) headers are forwarded to the content script over the
  // page-global CustomEvent. The event is observable by the page and any other
  // extension's content script, so we must never broadcast anything sensitive:
  //  - x-csrf-token (== the ct0 cookie) is deliberately excluded — the content
  //    script reads ct0 from document.cookie itself.
  //  - any other auth/signature header X may attach is dropped by omission, so a
  //    future X change can't silently start leaking a secret through this event.
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
  // Which GraphQL operations carry user bios, and how urgently their accounts
  // want a location. HomeTimeline is the feed being scrolled; TweetDetail is a
  // thread, i.e. mostly replies — many of them, mostly scrolled past. The tweet
  // the user actually opened doesn't depend on this: content.tsx looks that one
  // up directly (processPrimaryTweet).
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

  // page-script runs at document_start but the content script only attaches its
  // USERS_DATA listener at document_idle, so the first timeline response can be
  // dispatched before anyone is listening — dropping the first screen's bios and
  // leaving bio-based keyword highlighting broken until the next fetch. Buffer
  // captured users (bounded) and replay them when the content script asks, the
  // same way headers are replayed via REQUEST_HEADERS.
  const USER_BUFFER_CAP = 500
  // Users are dispatched (and buffered) carrying the priority of the response
  // they came from, so the content script can queue each one accordingly.
  type PrefetchUser = UserBio & { priority: PrefetchPriority }
  const userBuffer = new Map<string, PrefetchUser>()
  let bufferUsers = true

  function dispatchUsers(users: UserBio[], priority: PrefetchPriority) {
    if (users.length === 0) return
    // Deduplicate by userName (keep first occurrence)
    const seen = new Set<string>()
    const unique: PrefetchUser[] = []
    for (const u of users) {
      const key = u.userName.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      unique.push({ ...u, priority })
    }
    if (unique.length === 0) return
    if (bufferUsers) {
      for (const u of unique) {
        const key = u.userName.toLowerCase()
        // Whoever the account is in the feed, they stay 'high' — a later thread
        // response must not bury them behind its replies.
        const wasHigh = userBuffer.get(key)?.priority === 'high'
        // set() on an existing key keeps its insertion slot, so a repeat sighting
        // refreshes the value without losing where the account first appeared —
        // the replay is consumed as page order by the prefetch queue.
        userBuffer.set(key, wasHigh ? { ...u, priority: 'high' } : u)
        if (userBuffer.size > USER_BUFFER_CAP) {
          userBuffer.delete(userBuffer.keys().next().value as string)
        }
      }
    }
    window.dispatchEvent(
      new CustomEvent(EVENTS.USERS_DATA, { detail: { users: unique } }),
    )
  }

  // Replay users captured before the content script was listening. After the
  // first request its listener is attached, so live dispatches suffice and we
  // stop buffering to bound memory.
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
   * The request's headers as lowercased name → value. fetch() takes them as a
   * Headers, an array of pairs, or a plain object, and either on the init or
   * (when called with a Request) on the input — so every shape lands here.
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
