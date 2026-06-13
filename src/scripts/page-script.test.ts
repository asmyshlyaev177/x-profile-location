import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Flush all pending microtasks / macrotasks */
function flushPromises() {
  return new Promise<void>((resolve) => setTimeout(resolve, 0))
}

/** Collect the next CustomEvent of the given type from window */
function nextWindowEvent<T extends CustomEvent>(type: string): Promise<T> {
  return new Promise((resolve) => {
    window.addEventListener(type, (e) => resolve(e as T), { once: true })
  })
}

/**
 * Minimal XMLHttpRequest stand-in used for XHR interception tests.
 * PatchedXHR wraps this class, replacing its methods. Its `send` fires the
 * registered `load` listeners asynchronously so post-send assertions work.
 */
class FakeXHR {
  responseText = '{}'
  private _loadListeners: Array<() => void> = []

  open(_method: string, _url: string, _async?: boolean) {}
  setRequestHeader(_key: string, _value: string) {}
  send(_body?: unknown) {
    // Listeners are registered by PatchedXHR BEFORE calling originalSend (this).
    // Fire them in a microtask so callers can await the dispatch.
    Promise.resolve().then(() => {
      for (const cb of this._loadListeners) cb()
    })
  }
  addEventListener(type: string, cb: () => void) {
    if (type === 'load') this._loadListeners.push(cb)
  }
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetModules()
  // Clear the re-injection guard so each test gets a fresh IIFE run.
  delete (window as unknown as Record<string, unknown>).__X_LOC_INJECTED__

  // Provide a default no-op fetch; individual tests override as needed.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  )

  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---------------------------------------------------------------------------
// Re-injection guard
// ---------------------------------------------------------------------------
describe('re-injection guard', () => {
  it('does not wrap fetch when __X_LOC_INJECTED__ is already set', async () => {
    ;(window as unknown as Record<string, unknown>).__X_LOC_INJECTED__ = true
    const fetchBefore = window.fetch

    await import('./page-script')

    expect(window.fetch).toBe(fetchBefore)
  })
})

// ---------------------------------------------------------------------------
// Fetch — header capture
// ---------------------------------------------------------------------------
describe('fetch — header capture', () => {
  it('dispatches x-loc-headers-captured with plain-object headers', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    window.fetch('https://x.com/i/api/graphql/test', {
      headers: { authorization: 'Bearer plain', 'x-csrf-token': 'csrf1' },
    })

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer plain')
    expect(ev.detail.headers['x-csrf-token']).toBe('csrf1')
  })

  it('dispatches x-loc-headers-captured with Headers-object headers', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    const h = new Headers()
    h.set('Authorization', 'Bearer headers-obj')
    h.set('X-Csrf-Token', 'csrf2')

    window.fetch('https://x.com/i/api/graphql/test', { headers: h })

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer headers-obj')
    expect(ev.detail.headers['x-csrf-token']).toBe('csrf2')
  })

  it('dispatches x-loc-headers-captured with array headers', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    window.fetch('https://x.com/i/api/graphql/test', {
      headers: [
        ['Authorization', 'Bearer array'],
        ['x-csrf-token', 'csrf3'],
      ],
    })

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer array')
  })

  it('does NOT capture headers when authorization is missing', async () => {
    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-headers-captured',
      () => {
        fired = true
      },
      { once: true },
    )

    await window.fetch('https://x.com/i/api/graphql/test', {
      headers: { 'x-csrf-token': 'only-csrf' },
    })
    await flushPromises()

    expect(fired).toBe(false)
  })

  it('does NOT capture headers for non-graphql URLs', async () => {
    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-headers-captured',
      () => {
        fired = true
      },
      { once: true },
    )

    await window.fetch('https://x.com/some/other/path', {
      headers: { authorization: 'Bearer other' },
    })
    await flushPromises()

    expect(fired).toBe(false)
  })

  it('only captures headers once — subsequent graphql requests do not re-dispatch', async () => {
    await import('./page-script')
    let count = 0
    window.addEventListener('x-loc-headers-captured', () => {
      count++
    })

    await window.fetch('https://x.com/i/api/graphql/first', {
      headers: { authorization: 'Bearer first' },
    })
    await window.fetch('https://x.com/i/api/graphql/second', {
      headers: { authorization: 'Bearer second' },
    })
    await flushPromises()

    expect(count).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Fetch — bio extraction (HomeTimeline / TweetDetail)
// ---------------------------------------------------------------------------

/** Build a minimal HomeTimeline response containing one user */
function homeTimelineResponse(userName: string, bio: string) {
  return {
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              entries: [
                {
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          core: {
                            user_results: {
                              result: {
                                __typename: 'User',
                                core: { screen_name: userName },
                                legacy: { description: bio },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              ],
            },
          ],
        },
      },
    },
  }
}

/** Build a minimal TweetDetail response containing one user */
function tweetDetailResponse(userName: string, bio: string) {
  return {
    data: {
      threaded_conversation_with_injections_v2: {
        instructions: [
          {
            entries: [
              {
                content: {
                  itemContent: {
                    tweet_results: {
                      result: {
                        __typename: 'Tweet',
                        core: {
                          user_results: {
                            result: {
                              __typename: 'User',
                              core: { screen_name: userName },
                              legacy: { description: bio },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            ],
          },
        ],
      },
    },
  }
}

describe('fetch — bio extraction', () => {
  it('dispatches x-loc-users-data for HomeTimeline response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(homeTimelineResponse('tweetuser', 'my bio')),
          {
            status: 200,
          },
        ),
      ),
    )

    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})

    const ev = await eventP
    expect(ev.detail.users).toHaveLength(1)
    expect(ev.detail.users[0].userName).toBe('tweetuser')
    expect(ev.detail.users[0].bio).toBe('my bio')
  })

  it('dispatches x-loc-users-data for TweetDetail response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify(tweetDetailResponse('detailuser', 'detail bio')),
          {
            status: 200,
          },
        ),
      ),
    )

    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    window.fetch('https://x.com/i/api/graphql/TweetDetail', {})

    const ev = await eventP
    expect(ev.detail.users).toHaveLength(1)
    expect(ev.detail.users[0].userName).toBe('detailuser')
  })

  it('extracts profile_bio.description over legacy.description', async () => {
    const payload = {
      data: {
        __typename: 'User',
        core: { screen_name: 'biouser' },
        legacy: { description: 'legacy bio' },
        profile_bio: { description: 'profile bio' },
      },
    }

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        ),
    )

    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})

    const ev = await eventP
    expect(ev.detail.users[0].bio).toBe('profile bio')
  })

  it('does NOT dispatch x-loc-users-data for non-intercepted query names', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(homeTimelineResponse('skip', 'bio')), {
          status: 200,
        }),
      ),
    )

    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-users-data',
      () => {
        fired = true
      },
      { once: true },
    )

    await window.fetch('https://x.com/i/api/graphql/AboutAccountQuery', {})
    await flushPromises()

    expect(fired).toBe(false)
  })

  it('does NOT dispatch x-loc-users-data when response contains no User nodes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ data: { no_users_here: true } }), {
          status: 200,
        }),
      ),
    )

    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-users-data',
      () => {
        fired = true
      },
      { once: true },
    )

    await window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})
    await flushPromises()

    expect(fired).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Fetch — user deduplication in dispatched event
// ---------------------------------------------------------------------------
describe('fetch — user deduplication', () => {
  it('deduplicates users by userName (case-insensitive), keeping first occurrence', async () => {
    const payload = {
      data: [
        {
          __typename: 'User',
          core: { screen_name: 'DupeUser' },
          legacy: { description: 'first' },
        },
        {
          __typename: 'User',
          core: { screen_name: 'dupeuser' },
          legacy: { description: 'second' },
        },
        {
          __typename: 'User',
          core: { screen_name: 'UniqueUser' },
          legacy: { description: 'unique' },
        },
      ],
    }

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        ),
    )

    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})

    const ev = await eventP
    expect(ev.detail.users).toHaveLength(2)
    const names = ev.detail.users.map((u: { userName: string }) =>
      u.userName.toLowerCase(),
    )
    expect(names.filter((n: string) => n === 'dupeuser')).toHaveLength(1)
    // First occurrence wins
    const dupeEntry = ev.detail.users.find(
      (u: { userName: string }) => u.userName.toLowerCase() === 'dupeuser',
    )
    expect(dupeEntry.bio).toBe('first')
  })
})

// ---------------------------------------------------------------------------
// x-loc-request-headers re-dispatch
// ---------------------------------------------------------------------------
describe('x-loc-request-headers event', () => {
  it('re-emits stored headers when x-loc-request-headers is dispatched after capture', async () => {
    await import('./page-script')

    // Capture headers via fetch into the current module instance.
    const firstCapture = nextWindowEvent<CustomEvent>('x-loc-headers-captured')
    window.fetch('https://x.com/i/api/graphql/test', {
      headers: { authorization: 'Bearer stored123' },
    })
    await firstCapture

    // Spy on dispatchEvent so we can inspect what the synchronous re-dispatch sends.
    // (window.fetch accumulates a listener per import; spying lets us check the
    // current module's output among any co-firing old-module dispatches.)
    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-headers'))

    const emitted = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter((e) => e.type === 'x-loc-headers-captured')

    expect(
      emitted.some(
        (e) => e.detail?.headers?.authorization === 'Bearer stored123',
      ),
    ).toBe(true)

    spy.mockRestore()
  })

  it('can re-emit stored headers multiple times on repeated x-loc-request-headers events', async () => {
    await import('./page-script')

    // Capture once.
    const firstCapture = nextWindowEvent<CustomEvent>('x-loc-headers-captured')
    window.fetch('https://x.com/i/api/graphql/test', {
      headers: { authorization: 'Bearer multiemit' },
    })
    await firstCapture

    // Fire x-loc-request-headers twice and verify the token appears both times.
    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-headers'))
    window.dispatchEvent(new CustomEvent('x-loc-request-headers'))

    const emitted = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter(
        (e) =>
          e.type === 'x-loc-headers-captured' &&
          e.detail?.headers?.authorization === 'Bearer multiemit',
      )

    expect(emitted.length).toBeGreaterThanOrEqual(2)

    spy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// XHR — header capture
// ---------------------------------------------------------------------------
describe('XHR — header capture', () => {
  it('dispatches x-loc-headers-captured when graphql XHR has authorization header', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    const xhr =
      new (window.XMLHttpRequest as unknown as new () => XMLHttpRequest)()
    xhr.open('GET', 'https://x.com/i/api/graphql/test')
    xhr.setRequestHeader('authorization', 'Bearer xhrToken')
    xhr.setRequestHeader('x-csrf-token', 'csrfXhr')
    xhr.send()

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer xhrToken')
    expect(ev.detail.headers['x-csrf-token']).toBe('csrfXhr')
  })

  it('does NOT dispatch headers for non-graphql XHR URLs', async () => {
    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-headers-captured',
      () => {
        fired = true
      },
      { once: true },
    )

    const xhr =
      new (window.XMLHttpRequest as unknown as new () => XMLHttpRequest)()
    xhr.open('GET', 'https://x.com/some/other')
    xhr.setRequestHeader('authorization', 'Bearer xhrOther')
    xhr.send()

    await flushPromises()
    expect(fired).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// XHR — bio extraction
// ---------------------------------------------------------------------------
describe('XHR — bio extraction', () => {
  it('dispatches x-loc-users-data from HomeTimeline XHR load event', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    const xhr =
      new (window.XMLHttpRequest as unknown as new () => XMLHttpRequest)()
    // Set responseText before open/send so it is available when load fires.
    ;(xhr as unknown as FakeXHR & { responseText: string }).responseText =
      JSON.stringify(homeTimelineResponse('xhruser', 'xhr bio'))
    xhr.open('GET', 'https://x.com/i/api/graphql/HomeTimeline')
    xhr.send()

    const ev = await eventP
    expect(ev.detail.users).toHaveLength(1)
    expect(ev.detail.users[0].userName).toBe('xhruser')
    expect(ev.detail.users[0].bio).toBe('xhr bio')
  })

  it('dispatches x-loc-users-data from TweetDetail XHR load event', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-users-data')

    const xhr =
      new (window.XMLHttpRequest as unknown as new () => XMLHttpRequest)()
    ;(xhr as unknown as FakeXHR & { responseText: string }).responseText =
      JSON.stringify(tweetDetailResponse('xhrdetail', 'xhr detail bio'))
    xhr.open('GET', 'https://x.com/i/api/graphql/TweetDetail')
    xhr.send()

    const ev = await eventP
    expect(ev.detail.users[0].userName).toBe('xhrdetail')
  })

  it('does NOT dispatch x-loc-users-data for non-intercepted XHR URLs', async () => {
    await import('./page-script')
    let fired = false
    window.addEventListener(
      'x-loc-users-data',
      () => {
        fired = true
      },
      { once: true },
    )

    const xhr =
      new (window.XMLHttpRequest as unknown as new () => XMLHttpRequest)()
    ;(xhr as unknown as FakeXHR & { responseText: string }).responseText =
      JSON.stringify(homeTimelineResponse('skip', 'bio'))
    xhr.open('GET', 'https://x.com/i/api/graphql/AboutAccountQuery')
    xhr.send()

    await flushPromises()
    expect(fired).toBe(false)
  })
})
