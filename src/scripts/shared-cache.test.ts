import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Provide a non-empty server URL so the feature is active under test.
vi.mock('./constants', () => ({
  CACHE_API_BASE: 'https://cache.test',
  X_GRAPHQL_PATH: 'x.com/i/api/graphql',
  EVENTS: {},
}))

// chrome.storage is used for the anonymous client id; return an existing id so
// crypto.randomUUID isn't needed.
vi.hoisted(() => {
  ;(globalThis as unknown as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({ sharedCacheClientId: 'cid-1' }),
        set: vi.fn().mockResolvedValue(undefined),
      },
    },
  }
})

import {
  __resetSharedCache,
  contributeLocation,
  FLUSH_DELAY_MS,
  minConfidence,
  setMinConfidence,
  setSharedCacheEnabled,
  sharedBatchLookup,
} from './shared-cache'
import { DEFAULT_MIN_CONFIDENCE, MIN_CONFIDENCE_CHOICES } from './countries'
import type { LocationData } from './cache'

function mockFetchJson(payload: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => payload,
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

const JP: LocationData = {
  location: 'JP',
  locationAccurate: true,
  source: null,
}

beforeEach(() => {
  __resetSharedCache()
  setSharedCacheEnabled(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('sharedBatchLookup', () => {
  it('serves confirmed hits and filters those below the threshold', async () => {
    mockFetchJson({
      profiles: [
        { u: 'alice', loc: 'JP', src: null, acc: true, conf: minConfidence },
        { u: 'bob', loc: 'US', src: null, acc: true, conf: minConfidence - 1 },
      ],
    })

    const hits = await sharedBatchLookup(['Alice', 'BOB', 'carol'])

    expect(hits).toHaveLength(1)
    expect(hits[0]).toMatchObject({
      userName: 'alice',
      data: { location: 'JP', locationAccurate: true, source: null },
    })
  })

  it('applies a raised threshold to what it will serve', async () => {
    setMinConfidence(2)
    mockFetchJson({
      profiles: [
        { u: 'alice', loc: 'JP', src: null, acc: true, conf: 1 },
        { u: 'bob', loc: 'US', src: null, acc: true, conf: 2 },
      ],
    })

    const hits = await sharedBatchLookup(['alice', 'bob'])

    expect(hits.map((h) => h.userName)).toEqual(['bob'])
  })

  it('clamps a stored threshold into the offered range', () => {
    // 0 or negative would trust anything; an unreachably high value would serve
    // nothing forever. Neither should be reachable by hand-editing storage.
    setMinConfidence(0)
    expect(minConfidence).toBe(MIN_CONFIDENCE_CHOICES[0])
    setMinConfidence(99)
    expect(minConfidence).toBe(
      MIN_CONFIDENCE_CHOICES[MIN_CONFIDENCE_CHOICES.length - 1],
    )
    setMinConfidence('nonsense')
    expect(minConfidence).toBe(DEFAULT_MIN_CONFIDENCE)
    setMinConfidence(undefined)
    expect(minConfidence).toBe(DEFAULT_MIN_CONFIDENCE)
  })

  it('does not re-query names already asked about or negative-cached', async () => {
    const fetchFn = mockFetchJson({
      profiles: [{ u: 'alice', loc: 'JP', src: null, acc: true, conf: 3 }],
    })

    await sharedBatchLookup(['alice', 'carol']) // carol -> miss -> negative cache
    await sharedBatchLookup(['alice', 'carol']) // both filtered

    expect(fetchFn).toHaveBeenCalledTimes(1)
  })

  it('makes no request when disabled', async () => {
    const fetchFn = mockFetchJson({ profiles: [] })
    setSharedCacheEnabled(false)

    const hits = await sharedBatchLookup(['alice'])

    expect(hits).toEqual([])
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns [] on network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))
    await expect(sharedBatchLookup(['alice'])).resolves.toEqual([])
  })
})

describe('resilience: failures, timeout, circuit breaker', () => {
  it.each([429, 500, 503])(
    'returns [] on a %i response without throwing',
    async (status) => {
      vi.stubGlobal(
        'fetch',
        vi
          .fn()
          .mockResolvedValue({ ok: false, status, json: async () => ({}) }),
      )
      await expect(sharedBatchLookup(['someone'])).resolves.toEqual([])
    },
  )

  it('times out a hung request and returns []', async () => {
    vi.useFakeTimers()
    // A fetch that never settles until its abort signal fires.
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new Error('aborted')),
            )
          }),
      ),
    )
    const p = sharedBatchLookup(['slowpoke'])
    await vi.advanceTimersByTimeAsync(5000)
    await expect(p).resolves.toEqual([])
  })

  it('opens the breaker after repeated failures and stops calling the server', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchFn)

    await sharedBatchLookup(['a1'])
    await sharedBatchLookup(['a2'])
    await sharedBatchLookup(['a3']) // 3rd consecutive failure trips the breaker
    expect(fetchFn).toHaveBeenCalledTimes(3)

    await sharedBatchLookup(['a4']) // short-circuited — no request
    await sharedBatchLookup(['a5'])
    expect(fetchFn).toHaveBeenCalledTimes(3)
  })

  it('resumes calling the server after the cooldown elapses', async () => {
    vi.useFakeTimers()
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchFn)

    await sharedBatchLookup(['b1'])
    await sharedBatchLookup(['b2'])
    await sharedBatchLookup(['b3'])
    await sharedBatchLookup(['b4']) // breaker open — short-circuited
    expect(fetchFn).toHaveBeenCalledTimes(3)

    vi.advanceTimersByTime(30 * 60 * 1000) // well past the cooldown
    await sharedBatchLookup(['b5'])
    expect(fetchFn).toHaveBeenCalledTimes(4)
  })

  it('a success resets the consecutive-failure count', async () => {
    const fail = { ok: false, status: 500, json: async () => ({}) }
    const ok = { ok: true, json: async () => ({ profiles: [] }) }
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(fail) // c1
      .mockResolvedValueOnce(fail) // c2
      .mockResolvedValueOnce(ok) // c3 success -> resets the counter
      .mockResolvedValueOnce(fail) // c4
      .mockResolvedValueOnce(fail) // c5 (only 2 in a row since the reset)
      .mockResolvedValue(ok) // c6
    vi.stubGlobal('fetch', fetchFn)

    for (const n of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      await sharedBatchLookup([n])
    }

    // Never 3 failures in a row → breaker never opened → all 6 hit the network.
    expect(fetchFn).toHaveBeenCalledTimes(6)
  })

  it('a failing contribution does not throw', async () => {
    vi.useFakeTimers()
    const fetchFn = vi
      .fn()
      .mockResolvedValue({ ok: false, status: 500, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchFn)

    contributeLocation('dave', JP)
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS) // flush runs on the timer

    expect(fetchFn).toHaveBeenCalledTimes(1) // it tried, and swallowed the failure
  })
})

describe('contributeLocation', () => {
  it('buffers and flushes a contribution with the client id', async () => {
    vi.useFakeTimers()
    const fetchFn = mockFetchJson({ ok: true })

    contributeLocation('Alice', JP)
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchFn.mock.calls[0]
    expect(url).toBe('https://cache.test/v1/loc')
    const body = JSON.parse((opts as RequestInit).body as string)
    expect(body.clientId).toBe('cid-1')
    expect(body.entries).toEqual([
      { u: 'alice', loc: 'JP', src: null, acc: true },
    ])
  })

  it('does not resend an unchanged value for the same user', async () => {
    vi.useFakeTimers()
    const fetchFn = mockFetchJson({ ok: true })

    contributeLocation('alice', JP)
    contributeLocation('alice', JP)
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.entries).toHaveLength(1)
  })

  it('batches many contributions across the window into a single POST', async () => {
    vi.useFakeTimers()
    const fetchFn = mockFetchJson({ ok: true })

    // Mimics the prefetcher trickling results in over the batching window.
    contributeLocation('alice', JP)
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS / 3)
    contributeLocation('bob', {
      location: 'US',
      locationAccurate: true,
      source: null,
    })
    contributeLocation('carol', {
      location: 'DE',
      locationAccurate: true,
      source: null,
    })
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(fetchFn).toHaveBeenCalledTimes(1)
    const body = JSON.parse(
      (fetchFn.mock.calls[0][1] as RequestInit).body as string,
    )
    expect(body.entries).toHaveLength(3)
    expect((fetchFn.mock.calls[0][1] as RequestInit).keepalive).toBe(true)
  })

  it('makes no request when disabled', async () => {
    vi.useFakeTimers()
    const fetchFn = mockFetchJson({ ok: true })
    setSharedCacheEnabled(false)

    contributeLocation('alice', JP)
    await vi.advanceTimersByTimeAsync(FLUSH_DELAY_MS)

    expect(fetchFn).not.toHaveBeenCalled()
  })
})
