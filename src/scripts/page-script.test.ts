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

// Every test re-imports page-script after vi.resetModules(), so each one runs a
// fresh IIFE that registers its own REQUEST_HEADERS / REQUEST_USERS listeners on
// the one shared `window` — closing over its own userBuffer. Nothing removes
// them, so by the tenth test a single `x-loc-request-users` dispatch is answered
// by ten module instances and the replay assertions see every earlier test's
// users. In declaration order the leftovers happened to be harmless; under
// --sequence.shuffle they are not. Record what each test registers and unhook it
// afterwards, so a test only ever hears from its own instance.
const originalAddEventListener = window.addEventListener.bind(window)
let addedListeners: Array<[string, EventListenerOrEventListenerObject]> = []

beforeEach(() => {
  vi.resetModules()
  // Clear the re-injection guard so each test gets a fresh IIFE run.
  delete (window as unknown as Record<string, unknown>).__X_LOC_INJECTED__

  addedListeners = []
  window.addEventListener = ((
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions,
  ) => {
    addedListeners.push([type, listener])
    originalAddEventListener(type, listener, options)
  }) as typeof window.addEventListener

  // Provide a default no-op fetch; individual tests override as needed.
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('{}', { status: 200 })),
  )

  vi.stubGlobal('XMLHttpRequest', FakeXHR)
})

afterEach(() => {
  for (const [type, listener] of addedListeners) {
    window.removeEventListener(type, listener)
  }
  addedListeners = []
  window.addEventListener = originalAddEventListener
  vi.unstubAllGlobals()
  // A test that fails before its own spy.mockRestore() would otherwise leave a
  // window.dispatchEvent spy installed, and the next test's spy stacks on top of
  // it — turning one real failure into several.
  vi.restoreAllMocks()
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
    // x-csrf-token must never be broadcast on the page-global event.
    expect(ev.detail.headers['x-csrf-token']).toBeUndefined()
  })

  it('forwards only allow-listed non-secret headers, dropping everything else', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    window.fetch('https://x.com/i/api/graphql/test', {
      headers: {
        authorization: 'Bearer plain',
        'x-twitter-client-language': 'en',
        'x-twitter-active-user': 'yes',
        'x-csrf-token': 'csrf1',
        'x-client-transaction-id': 'secret-txn',
        cookie: 'auth_token=secret',
      },
    })

    const ev = await eventP
    expect(ev.detail.headers).toEqual({
      authorization: 'Bearer plain',
      'x-twitter-client-language': 'en',
      'x-twitter-active-user': 'yes',
    })
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
    expect(ev.detail.headers['x-csrf-token']).toBeUndefined()
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

  // X calls fetch(new Request(...)) in places, where both the URL and the
  // headers hang off the input rather than the init.
  it('reads url and headers off a Request input', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    window.fetch(
      new Request('https://x.com/i/api/graphql/test', {
        headers: { Authorization: 'Bearer from-request' },
      }),
    )

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer from-request')
  })

  it('accepts a URL-object input', async () => {
    await import('./page-script')
    const eventP = nextWindowEvent<CustomEvent>('x-loc-headers-captured')

    window.fetch(new URL('https://x.com/i/api/graphql/test'), {
      headers: { authorization: 'Bearer from-url-object' },
    })

    const ev = await eventP
    expect(ev.detail.headers.authorization).toBe('Bearer from-url-object')
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
                                profile_bio: { description: bio },
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
                              profile_bio: { description: bio },
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
    // The feed is what the user is scrolling — looked up before any reply.
    expect(ev.detail.users[0].priority).toBe('high')
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
    // A thread is mostly replies; the tweet the user opened is fetched directly
    // by content.tsx, so nothing on screen waits behind this queue.
    expect(ev.detail.users[0].priority).toBe('low')
  })

  it('extracts profile_bio.description and ignores the legacy copy', async () => {
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
          profile_bio: { description: 'first' },
        },
        {
          __typename: 'User',
          core: { screen_name: 'dupeuser' },
          profile_bio: { description: 'second' },
        },
        {
          __typename: 'User',
          core: { screen_name: 'UniqueUser' },
          profile_bio: { description: 'unique' },
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
// x-loc-request-users re-dispatch (replay buffered bios on load)
// ---------------------------------------------------------------------------
describe('x-loc-request-users event', () => {
  it('replays users captured before the content script was listening', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(
            JSON.stringify(homeTimelineResponse('bufuser', 'buf bio')),
            { status: 200 },
          ),
        ),
    )
    await import('./page-script')

    // Capture a user into the buffer (live dispatch has no listener yet in the
    // real world — here we await it just to know buffering has happened).
    const firstDispatch = nextWindowEvent<CustomEvent>('x-loc-users-data')
    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})
    await firstDispatch

    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-users'))

    const replayed = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter((e) => e.type === 'x-loc-users-data')
      .flatMap(
        (e) => e.detail.users as Array<{ userName: string; bio: string }>,
      )

    expect(
      replayed.some((u) => u.userName === 'bufuser' && u.bio === 'buf bio'),
    ).toBe(true)
    spy.mockRestore()
  })

  it('drains the buffer after replaying so a second request does not re-emit it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(homeTimelineResponse('once', 'bio')), {
          status: 200,
        }),
      ),
    )
    await import('./page-script')

    const firstDispatch = nextWindowEvent<CustomEvent>('x-loc-users-data')
    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})
    await firstDispatch

    window.dispatchEvent(new CustomEvent('x-loc-request-users')) // drains buffer

    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-users'))

    const replayedNames = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter((e) => e.type === 'x-loc-users-data')
      .flatMap((e) =>
        (e.detail.users as Array<{ userName: string }>).map((u) => u.userName),
      )

    expect(replayedNames).not.toContain('once')
    spy.mockRestore()
  })

  it('replays in first-appearance order, even for a repeat sighting', async () => {
    // The content script feeds the replay straight into the FIFO prefetch queue,
    // so a name seen twice must keep the slot it earned the first time rather
    // than jumping to the back of the buffer.
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(homeTimelineResponse('alpha', 'a')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(homeTimelineResponse('beta', 'b')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(homeTimelineResponse('alpha', 'a2')), {
            status: 200,
          }),
        ),
    )
    await import('./page-script')

    for (const _ of [0, 1, 2]) {
      const dispatched = nextWindowEvent<CustomEvent>('x-loc-users-data')
      window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})
      await dispatched
    }

    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-users'))

    const replayed = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter((e) => e.type === 'x-loc-users-data')
      .flatMap(
        (e) => e.detail.users as Array<{ userName: string; bio: string }>,
      )

    expect(replayed.map((u) => u.userName)).toEqual(['alpha', 'beta'])
    expect(replayed[0].bio).toBe('a2') // still the freshest record
    spy.mockRestore()
  })

  it('keeps a buffered feed account high when a thread mentions it again', async () => {
    const shared = 'inboth'
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify(homeTimelineResponse(shared, 'bio')), {
            status: 200,
          }),
        )
        .mockResolvedValueOnce(
          new Response(JSON.stringify(tweetDetailResponse(shared, 'bio')), {
            status: 200,
          }),
        ),
    )
    await import('./page-script')

    // Seen in the feed first, then again as a reply in a thread. The buffer
    // keeps the most recent record — but must not let 'low' overwrite 'high',
    // or replaying it would bury a feed account behind the reply queue.
    const first = nextWindowEvent<CustomEvent>('x-loc-users-data')
    window.fetch('https://x.com/i/api/graphql/HomeTimeline', {})
    await first
    const second = nextWindowEvent<CustomEvent>('x-loc-users-data')
    window.fetch('https://x.com/i/api/graphql/TweetDetail', {})
    await second

    const spy = vi.spyOn(window, 'dispatchEvent')
    window.dispatchEvent(new CustomEvent('x-loc-request-users'))

    const replayed = spy.mock.calls
      .map(([e]) => e as CustomEvent)
      .filter((e) => e.type === 'x-loc-users-data')
      .flatMap(
        (e) => e.detail.users as Array<{ userName: string; priority: string }>,
      )
      .filter((u) => u.userName === shared)

    expect(replayed).toHaveLength(1)
    expect(replayed[0].priority).toBe('high')
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
    expect(ev.detail.headers['x-csrf-token']).toBeUndefined()
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
    expect(ev.detail.users[0].priority).toBe('high')
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
    expect(ev.detail.users[0].priority).toBe('low')
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
