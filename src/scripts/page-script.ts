import { extractUsers } from './extract-users'
import type { UserBio } from './extract-users'
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
  const BIO_INTERCEPT = ['HomeTimeline', 'TweetDetail']

  function dispatchUsers(users: UserBio[]) {
    if (users.length === 0) return
    // Deduplicate by userName (keep first occurrence)
    const seen = new Set<string>()
    const unique = users.filter((u) => {
      const key = u.userName.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    window.dispatchEvent(
      new CustomEvent(EVENTS.USERS_DATA, { detail: { users: unique } }),
    )
  }

  // ---------------------------------------------------------------------------
  // Wrap fetch
  // ---------------------------------------------------------------------------
  const originalFetch = window.fetch.bind(window)
  ;(window as any).fetch = function (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) {
    const url =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : (input as Request).url

    if (url.includes(X_GRAPHQL_PATH) && !headersCaptured) {
      const headers: Record<string, string> = {}
      const rawHeaders =
        init?.headers ?? (input instanceof Request ? input.headers : undefined)
      if (rawHeaders) {
        if (rawHeaders instanceof Headers) {
          rawHeaders.forEach((value: string, key: string) => {
            headers[key.toLowerCase()] = value
          })
        } else if (Array.isArray(rawHeaders)) {
          for (const [k, v] of rawHeaders) {
            headers[(k as string).toLowerCase()] = v as string
          }
        } else {
          for (const [k, v] of Object.entries(
            rawHeaders as Record<string, string>,
          )) {
            headers[k.toLowerCase()] = v
          }
        }
      }
      dispatchHeaders(headers)
    }

    const shouldIntercept = BIO_INTERCEPT.some((p) => url.includes(p))
    const promise = originalFetch(input, init)

    if (shouldIntercept) {
      promise
        .then((response) => {
          const cloned = response.clone()
          cloned
            .json()
            .then((json: unknown) => {
              dispatchUsers(extractUsers(json))
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
      if (BIO_INTERCEPT.some((p) => _url.includes(p))) {
        xhr.addEventListener('load', () => {
          try {
            const json = JSON.parse(xhr.responseText)
            dispatchUsers(extractUsers(json))
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
