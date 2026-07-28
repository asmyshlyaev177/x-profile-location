import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Hoist chrome global — must run before module-level code in content.tsx
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  ;(globalThis as unknown as Record<string, unknown>).chrome = {
    storage: {
      local: {
        get: vi.fn().mockResolvedValue({}),
        set: vi.fn().mockResolvedValue(undefined),
      },
      onChanged: { addListener: vi.fn() },
    },
    runtime: {
      onMessage: { addListener: vi.fn() },
    },
  }
})

vi.mock('./cache', () => ({
  getCached: vi.fn().mockResolvedValue(undefined),
  setCached: vi.fn().mockResolvedValue(undefined),
  mergeCached: vi.fn().mockResolvedValue(undefined),
  cleanupCache: vi.fn().mockResolvedValue(undefined),
  clearAllCache: vi.fn().mockResolvedValue(undefined),
}))

// Isolate content tests from the shared cache (it has a real server URL and is
// covered by shared-cache.test.ts) — no network, no cross-test async bleed.
// Configured + opted in by default, which is what ships — so background
// prefetch is allowed unless a test says otherwise.
vi.mock('./shared-cache', () => ({
  sharedBatchLookup: vi.fn().mockResolvedValue([]),
  contributeLocation: vi.fn(),
  setSharedCacheEnabled: vi.fn(),
  flushContributions: vi.fn(),
  isSharedCacheConfigured: vi.fn(() => true),
  isSharedCacheEnabled: vi.fn(() => true),
}))

// Stub the prefetcher. content.tsx's job is only to *drive* it — settings in,
// candidates in — and its own scheduling is covered by prefetch-queue.test.ts.
// Stubbing also keeps its background timers (and the lookups they'd trigger)
// out of every other test in this file.
const prefetcher = vi.hoisted(() => ({
  enqueue: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  setReserveFraction: vi.fn(),
  setPacing: vi.fn(),
}))
vi.mock('./prefetch-queue', () => ({
  BackgroundPrefetcher: class {
    enqueue = prefetcher.enqueue
    start = prefetcher.start
    stop = prefetcher.stop
    setReserveFraction = prefetcher.setReserveFraction
    setPacing = prefetcher.setPacing
  },
}))

import {
  fetchLocationData,
  isCommittedSwipe,
  locationSummaryText,
  setApiHeaders,
  __testResetState,
} from './content'
import { getCached, mergeCached, clearAllCache } from './cache'
import { isSharedCacheConfigured, isSharedCacheEnabled } from './shared-cache'

// Capture listeners registered at module load time before any vi.clearAllMocks() runs.
const chromeGlobal = (globalThis as any).chrome
const onChangedCallback: (
  changes: Record<string, { newValue: unknown }>,
  area: string,
) => void = chromeGlobal.storage.onChanged.addListener.mock.calls[0][0]
const onMessageCallback: (message: unknown) => void =
  chromeGlobal.runtime.onMessage.addListener.mock.calls[0][0]

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTweetArticle(
  userName: string,
  displayName = 'Test User',
  primary = false,
): HTMLElement {
  const article = document.createElement('article')
  article.setAttribute('data-testid', 'tweet')
  if (primary) article.setAttribute('tabindex', '-1')
  article.innerHTML = `
    <div data-testid="User-Name">
      <a href="/${userName}">${displayName}</a>
      <a href="/${userName}">@${userName}</a>
    </div>
    <div>Tweet text here</div>
  `
  return article
}

/** An article that quotes another tweet. Mirrors the real X DOM: the quoted
 *  author is rendered as plain text inside a single role="link" (no anchor for
 *  the name/handle), and emoji appear as <img alt="…"> (textContent drops them).
 *  `quotedEmojiAlt` injects such an emoji <img> into the quoted display name. */
function makeQuoteTweetArticle(
  outerUser: string,
  quotedUser: string,
  quotedDisplay = 'Quoted User',
  quotedEmojiAlt: string | null = null,
): HTMLElement {
  const article = document.createElement('article')
  article.setAttribute('data-testid', 'tweet')
  const emojiImg = quotedEmojiAlt
    ? `<img alt="${quotedEmojiAlt}" draggable="false" src="x.svg">`
    : ''
  article.innerHTML = `
    <div data-testid="User-Name">
      <a href="/${outerUser}">Outer User</a>
      <a href="/${outerUser}">@${outerUser}</a>
    </div>
    <div>Outer tweet text</div>
    <div role="link" tabindex="0">
      <div data-testid="User-Name">
        <div dir="ltr"><span>${quotedDisplay}</span>${emojiImg}</div>
        <div dir="ltr"><span>@${quotedUser}</span></div>
        <span>·</span><time>Jul 18</time>
      </div>
      <div>Quoted tweet text</div>
    </div>
  `
  return article
}

/** Wait for MutationObserver callbacks and any chained microtasks/promises. */
async function flushAsync() {
  await new Promise<void>((resolve) => setTimeout(resolve, 0))
}

function enableFeedLocation() {
  onChangedCallback({ showLocationInFeed: { newValue: true } }, 'local')
}
function disableFeedLocation() {
  onChangedCallback({ showLocationInFeed: { newValue: false } }, 'local')
}

// ---------------------------------------------------------------------------
// fetchLocationData — API request variables
// ---------------------------------------------------------------------------
describe('fetchLocationData', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('sends screenName (not userName) as the GraphQL variable key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: { result: { about_profile: null } },
          },
        }),
        { status: 200 },
      ),
    )

    await fetchLocationData('elonmusk')

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]]
    const params = new URLSearchParams(new URL(url).search)
    const variables = JSON.parse(params.get('variables')!)
    expect(variables).toHaveProperty('screenName', 'elonmusk')
    expect(variables).not.toHaveProperty('userName')
  })

  it('returns location data from API response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'United States',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    const data = await fetchLocationData('jack')

    expect(data).toMatchObject({
      location: 'United States',
      source: 'web',
      locationAccurate: true,
    })
  })

  it('returns null without making a request when apiHeaders are not set', async () => {
    setApiHeaders(null)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const data = await fetchLocationData('someuser')

    expect(data).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('returns null on 429 response', async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 3600
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    )

    const data = await fetchLocationData('ratelimiteduser')

    expect(data).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// fetchLocationData — cache and session behaviour
// ---------------------------------------------------------------------------
describe('fetchLocationData — cache hit', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('returns cached data without making a network request when location is present', async () => {
    const cached = {
      location: 'Japan',
      locationAccurate: true,
      source: 'web' as const,
      bio: null,
    }
    vi.mocked(getCached).mockResolvedValue(cached)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const data = await fetchLocationData('cacheduser')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(data).toMatchObject({ location: 'Japan' })
  })

  it('returns cached data without a network request when source is present', async () => {
    const cached = {
      location: null,
      locationAccurate: true,
      source: 'India Android App' as `${string} Android App`,
      bio: null,
    }
    vi.mocked(getCached).mockResolvedValue(cached)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    const data = await fetchLocationData('appuser')

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(data?.source).toBe('India Android App')
  })
})

describe('fetchLocationData — checkedThisSession dedup', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('skips network on the second call for the same user after a successful fetch', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'Germany',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    await fetchLocationData('sessionuser')
    await fetchLocationData('sessionuser')

    expect(fetchSpy).toHaveBeenCalledOnce()
  })
})

describe('fetchLocationData — concurrent deduplication', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('concurrent calls for the same user share one in-flight fetch', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'Brazil',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    const [r1, r2] = await Promise.all([
      fetchLocationData('concurrentuser'),
      fetchLocationData('concurrentuser'),
    ])

    expect(fetchSpy).toHaveBeenCalledOnce()
    expect(r1?.location).toBe('Brazil')
    expect(r2?.location).toBe('Brazil')
  })
})

describe('fetchLocationData — error responses', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('returns null on a non-200, non-429 response', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, { status: 403 }),
    )

    const data = await fetchLocationData('forbiddenuser')

    expect(data).toBeNull()
  })

  it('returns stored cache data when about_profile is null in the response', async () => {
    const cached = {
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'cached bio',
      displayName: null,
    }
    vi.mocked(getCached).mockResolvedValue(cached)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: { result: { about_profile: null } },
          },
        }),
        { status: 200 },
      ),
    )

    const data = await fetchLocationData('noprofileuser')

    expect(data).toEqual(cached)
  })

  it('merges bio from stored cache into the returned location data', async () => {
    const cached = {
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'existing bio',
    }
    vi.mocked(getCached).mockResolvedValue(cached)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'Canada',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    const data = await fetchLocationData('biomergeuser')

    expect(data?.location).toBe('Canada')
    expect(data?.bio).toBe('existing bio')
    expect(vi.mocked(mergeCached)).toHaveBeenCalledWith(
      'biomergeuser',
      expect.objectContaining({ location: 'Canada', bio: 'existing bio' }),
    )
  })

  it('rate limit blocks fetch and returns null immediately without network call', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)

    const resetTime = Math.floor(Date.now() / 1000) + 3600
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    )
    await fetchLocationData('rl_user_a')
    expect(fetchSpy).toHaveBeenCalledOnce()

    __testResetState()
    setApiHeaders(HEADERS)
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    )
    await fetchLocationData('rl_user_b')

    const countBefore = fetchSpy.mock.calls.length
    await fetchLocationData('rl_user_c')
    expect(fetchSpy.mock.calls.length).toBe(countBefore)
  })
})

// ---------------------------------------------------------------------------
// chrome.runtime.onMessage — CLEAR_CACHE
// ---------------------------------------------------------------------------
describe('chrome.runtime.onMessage — CLEAR_CACHE', () => {
  const HEADERS = { authorization: 'Bearer token', 'x-csrf-token': 'csrf' }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
  })

  it('calls clearAllCache', () => {
    onMessageCallback({ type: 'CLEAR_CACHE' })
    expect(vi.mocked(clearAllCache)).toHaveBeenCalledOnce()
  })

  it('clears checkedThisSession so the same user triggers a new network request', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'UK',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    await fetchLocationData('clearcacheuser')
    expect(fetchSpy).toHaveBeenCalledOnce()
    fetchSpy.mockClear()

    onMessageCallback({ type: 'CLEAR_CACHE' })
    await fetchLocationData('clearcacheuser')

    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('ignores unknown message types', () => {
    onMessageCallback({ type: 'SOMETHING_ELSE' })
    expect(vi.mocked(clearAllCache)).not.toHaveBeenCalled()
  })

  it('ignores null/missing messages', () => {
    expect(() => onMessageCallback(null)).not.toThrow()
    expect(() => onMessageCallback(undefined)).not.toThrow()
  })
})

// ---------------------------------------------------------------------------
// x-loc-headers-captured window event
// ---------------------------------------------------------------------------
describe('x-loc-headers-captured event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(null)
    __testResetState()
  })

  it('sets apiHeaders so subsequent fetches include auth', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 200 }))

    await fetchLocationData('headeruser')
    expect(fetchSpy).not.toHaveBeenCalled()

    window.dispatchEvent(
      new CustomEvent('x-loc-headers-captured', {
        detail: {
          headers: { authorization: 'Bearer tok', 'x-csrf-token': 'csrf' },
        },
      }),
    )

    await fetchLocationData('headeruser')
    expect(fetchSpy).toHaveBeenCalledOnce()
  })

  it('ignores events where authorization is missing', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    window.dispatchEvent(
      new CustomEvent('x-loc-headers-captured', {
        detail: { headers: { 'x-csrf-token': 'csrf' } },
      }),
    )

    await fetchLocationData('noauthuser')
    expect(fetchSpy).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// x-loc-users-data window event
// ---------------------------------------------------------------------------
describe('x-loc-users-data event', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __testResetState()
    document.body.innerHTML = ''
  })

  it('calls mergeCached with bio and displayName for each user', () => {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            { userName: 'biouser', displayName: 'Bio User', bio: 'some bio' },
          ],
        },
      }),
    )

    expect(vi.mocked(mergeCached)).toHaveBeenCalledWith('biouser', {
      bio: 'some bio',
      displayName: 'Bio User',
    })
  })

  it('omits displayName from patch when null', () => {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [{ userName: 'nobiouser', displayName: null, bio: null }],
        },
      }),
    )

    expect(vi.mocked(mergeCached)).toHaveBeenCalledWith('nobiouser', {
      bio: null,
    })
  })

  it('handles multiple users in one event', () => {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            { userName: 'usera', displayName: 'A', bio: 'bio a' },
            { userName: 'userb', displayName: 'B', bio: 'bio b' },
          ],
        },
      }),
    )

    expect(vi.mocked(mergeCached)).toHaveBeenCalledTimes(2)
  })

  it('highlights a matching article when bio contains a tracked keyword', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['crypto'] } }, 'local')

    const article = makeTweetArticle('cryptoguy')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'cryptoguy',
              displayName: null,
              bio: 'I love crypto trading',
            },
          ],
        },
      }),
    )

    expect(article.getAttribute('data-x-loc-highlighted')).toBe('1')

    // Reset keyword state
    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('highlights a tweet rendered AFTER its bio arrived, with an empty IDB cache', async () => {
    // Simulates a fresh page load: nothing in IndexedDB yet. The bio is only
    // available in memory (from the timeline event), and the tweet is rendered
    // after the event — so the observer must highlight it without reading the
    // bio back from IDB. Regression for "no highlight until reload".
    vi.mocked(getCached).mockResolvedValue(undefined)
    onChangedCallback({ highlightKeywords: { newValue: ['crypto'] } }, 'local')

    // Bio arrives first (keyword is only in the bio, not the handle/name).
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'someguy',
              displayName: 'Some Guy',
              bio: 'I love crypto',
            },
          ],
        },
      }),
    )

    // Tweet renders afterwards → observer highlights from the in-memory bio.
    const article = makeTweetArticle('someguy', 'Some Guy')
    document.body.appendChild(article)

    await vi.waitFor(() => {
      expect(article.getAttribute('data-x-loc-highlighted')).toBe('1')
    })

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('bounds the in-memory bio cache, evicting the oldest entries', async () => {
    // Empty IDB, so an evicted bio has no fallback and its match disappears.
    vi.mocked(getCached).mockResolvedValue(undefined)
    onChangedCallback({ highlightKeywords: { newValue: ['zzzkw'] } }, 'local')

    const users: Array<{
      userName: string
      displayName: string | null
      bio: string | null
    }> = [{ userName: 'evictme', displayName: 'AA', bio: 'about zzzkw stuff' }]
    // Overflow the 2000-entry cap so the first user is pushed out...
    for (let i = 0; i < 2001; i++) {
      users.push({ userName: `filler${i}`, displayName: 'FF', bio: 'nope' })
    }
    // ...while a user seen last stays in memory.
    users.push({
      userName: 'keepme',
      displayName: 'BB',
      bio: 'about zzzkw stuff',
    })

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', { detail: { users } }),
    )

    const evictArticle = makeTweetArticle('evictme', 'AA')
    const keepArticle = makeTweetArticle('keepme', 'BB')
    document.body.appendChild(evictArticle)
    document.body.appendChild(keepArticle)

    // The recent user still has its bio in memory → highlights (also confirms
    // the observer/async pass has run before we assert on the evicted one).
    await vi.waitFor(() => {
      expect(keepArticle.getAttribute('data-x-loc-highlighted')).toBe('1')
    })
    // The oldest user was evicted; with an empty IDB its bio is gone → no match.
    expect(evictArticle.getAttribute('data-x-loc-highlighted')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('does not highlight articles whose username does not match', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['crypto'] } }, 'local')

    const article = makeTweetArticle('normaluser')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'someoneelse',
              displayName: null,
              bio: 'I love crypto',
            },
          ],
        },
      }),
    )

    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('does not highlight a matching user that is on the exceptions list', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    onChangedCallback(
      { highlightExceptions: { newValue: ['SarcasticUser'] } },
      'local',
    )

    const article = makeTweetArticle('sarcasticuser')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'sarcasticuser',
              displayName: null,
              bio: 'no NAFO here',
            },
          ],
        },
      }),
    )

    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
    onChangedCallback({ highlightExceptions: { newValue: [] } }, 'local')
  })

  it('removes highlight when a user is added to exceptions', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')

    const article = makeTweetArticle('flipuser')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'flipuser',
              displayName: null,
              bio: 'proud NAFO member',
            },
          ],
        },
      }),
    )
    expect(article.getAttribute('data-x-loc-highlighted')).toBe('1')

    // Adding to exceptions should re-evaluate and drop the highlight.
    onChangedCallback(
      { highlightExceptions: { newValue: ['flipuser'] } },
      'local',
    )
    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
    onChangedCallback({ highlightExceptions: { newValue: [] } }, 'local')
  })

  it('highlights the quoted post when the quoted author matches a keyword', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['crypto'] } }, 'local')

    const article = makeQuoteTweetArticle('normaluser', 'cryptoguy')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            { userName: 'cryptoguy', displayName: null, bio: 'crypto trader' },
          ],
        },
      }),
    )

    // Outer author doesn't match → article itself stays unhighlighted, but the
    // embedded quote block is highlighted.
    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()
    const quote = article.querySelector('div[role="link"]')!
    expect(quote.getAttribute('data-x-loc-quote-highlighted')).toBe('1')

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('highlights the quote via an emoji keyword in the quoted display name', async () => {
    // The quoted display name contains 🏳️‍⚧️ only as an <img alt> (textContent
    // drops it) and the author has no anchor — exercises textWithEmoji + the
    // handle-from-text parsing. No bio is delivered; the storage-change path
    // (rehighlightAll → tryHighlightQuote) does the work.
    const article = makeQuoteTweetArticle(
      'normaluser',
      'willowfoxxo',
      'WillowTheFox',
      '🏳️‍⚧️',
    )
    document.body.appendChild(article)

    onChangedCallback({ highlightKeywords: { newValue: ['🏳️‍⚧️'] } }, 'local')
    await flushAsync()

    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()
    const quote = article.querySelector('div[role="link"]')!
    expect(quote.getAttribute('data-x-loc-quote-highlighted')).toBe('1')

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('does not highlight the quote when the quoted author does not match', () => {
    onChangedCallback({ highlightKeywords: { newValue: ['crypto'] } }, 'local')

    const article = makeQuoteTweetArticle('normaluser', 'anotheruser')
    document.body.appendChild(article)

    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            { userName: 'anotheruser', displayName: null, bio: 'gardening' },
          ],
        },
      }),
    )

    expect(article.getAttribute('data-x-loc-highlighted')).toBeNull()
    const quote = article.querySelector('div[role="link"]')!
    expect(quote.getAttribute('data-x-loc-quote-highlighted')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  it('handles missing or empty users gracefully', () => {
    expect(() => {
      window.dispatchEvent(
        new CustomEvent('x-loc-users-data', { detail: { users: [] } }),
      )
      window.dispatchEvent(new CustomEvent('x-loc-users-data', { detail: {} }))
      window.dispatchEvent(
        new CustomEvent('x-loc-users-data', { detail: null }),
      )
    }).not.toThrow()
    expect(vi.mocked(mergeCached)).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// Feed location injection (tryInjectFeedLocation via MutationObserver)
// ---------------------------------------------------------------------------
describe('feed location injection', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    __testResetState()
    document.body.innerHTML = ''
    enableFeedLocation()
    await flushAsync()
  })

  afterEach(() => {
    disableFeedLocation()
  })

  it('injects .x-loc-feed-row below User-Name when cache has location', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('jpuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
  })

  it('places the row after the User-Name element (not inside it)', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('jpuser2')
    document.body.appendChild(article)
    await flushAsync()

    const userNameEl = article.querySelector('[data-testid="User-Name"]')!
    expect(
      userNameEl.nextElementSibling?.classList.contains('x-loc-feed-row'),
    ).toBe(true)
  })

  it('does not inject when getCached returns undefined', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)

    const article = makeTweetArticle('nodata')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).toBeNull()
  })

  it('does not inject when data has no location and is accurate with no source', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'some bio',
    })

    const article = makeTweetArticle('bioonlyuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).toBeNull()
  })

  it('does not inject into primary tweet (tabindex="-1")', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'France',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('primaryuser', 'Primary User', true)
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).toBeNull()
  })

  it('does not inject when showLocationInFeed is false', async () => {
    disableFeedLocation()
    vi.mocked(getCached).mockResolvedValue({
      location: 'Spain',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('spanishuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).toBeNull()

    enableFeedLocation()
  })

  it('does not inject twice for the same article', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Brazil',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('bruser')
    document.body.appendChild(article)
    await flushAsync()

    // Trigger a second mutation inside the same article
    article.appendChild(document.createElement('span'))
    await flushAsync()

    expect(article.querySelectorAll('.x-loc-feed-row')).toHaveLength(1)
  })

  it('removes all feed rows when showLocationInFeed is toggled off', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Mexico',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('mxuser')
    document.body.appendChild(article)
    await flushAsync()
    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()

    disableFeedLocation()

    expect(article.querySelector('.x-loc-feed-row')).toBeNull()

    enableFeedLocation()
  })

  it('injects for VPN-flagged location (locationAccurate: false)', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Russia',
      locationAccurate: false,
      source: null,
      bio: null,
    })

    const article = makeTweetArticle('vpnuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
    expect(article.querySelector('.x-loc-icon-vpn')).not.toBeNull()
  })

  it('parks a tweet above the viewport and injects it once scrolled into view', async () => {
    // Adding the row to a tweet above the fold would shift the scroll (the
    // back-navigation jump). jsdom returns all-zero rects by default, so drive
    // the geometry and IntersectionObserver explicitly.
    const observed: Element[] = []
    let ioCallback: IntersectionObserverCallback = () => {}
    class MockIO {
      constructor(cb: IntersectionObserverCallback) {
        ioCallback = cb
      }
      observe(el: Element) {
        observed.push(el)
      }
      unobserve(el: Element) {
        const i = observed.indexOf(el)
        if (i >= 0) observed.splice(i, 1)
      }
      disconnect() {
        observed.length = 0
      }
      takeRecords() {
        return []
      }
    }
    ;(globalThis as unknown as Record<string, unknown>).IntersectionObserver =
      MockIO

    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('scrolledpastuser')
    const nameEl = article.querySelector('[data-testid="User-Name"]')!
    let bottom = -100 // entirely above the viewport top
    vi.spyOn(nameEl, 'getBoundingClientRect').mockImplementation(
      () => ({ bottom }) as unknown as DOMRect,
    )
    document.body.appendChild(article)
    await flushAsync()

    // Above the fold → deferred (parked on the observer), not yet injected.
    expect(article.querySelector('.x-loc-feed-row')).toBeNull()
    expect(observed).toContain(article)

    // Scroll it into view and fire the observer → it injects now.
    bottom = 300
    ioCallback(
      [
        {
          target: article,
          isIntersecting: true,
        } as unknown as IntersectionObserverEntry,
      ],
      {} as IntersectionObserver,
    )

    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
    delete (globalThis as unknown as Record<string, unknown>)
      .IntersectionObserver
  })
})

// ---------------------------------------------------------------------------
// Exception button gating on hover cards (processCard)
// ---------------------------------------------------------------------------
describe('hover card exception button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(null) // avoid network in fetchLocationData
    __testResetState()
    document.body.innerHTML = ''
  })

  afterEach(() => {
    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
    onChangedCallback({ highlightExceptions: { newValue: [] } }, 'local')
  })

  async function addHoverCard(userName: string): Promise<HTMLElement> {
    const card = document.createElement('div')
    card.setAttribute('data-testid', 'HoverCard')
    card.innerHTML = `<span>@${userName}</span>`
    document.body.appendChild(card)
    await flushAsync()
    return card
  }

  it('shows the button when the account matches a keyword rule', async () => {
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })

    const card = await addHoverCard('sarcasticuser')
    expect(card.querySelector('.x-loc-exc-btn')).not.toBeNull()
  })

  it('does not show the button when the account matches no rule', async () => {
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })

    const card = await addHoverCard('normaluser')
    expect(card.querySelector('.x-loc-exc-btn')).toBeNull()
  })

  it('shows the button (to undo) when the account is already an exception, even with no rule match', async () => {
    onChangedCallback(
      { highlightExceptions: { newValue: ['knownuser'] } },
      'local',
    )
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })

    const card = await addHoverCard('knownuser')
    const btn = card.querySelector('.x-loc-exc-btn')
    expect(btn).not.toBeNull()
    expect(btn?.classList.contains('x-loc-exc-active')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Exception button on the primary tweet of a status page (no hover card there)
// ---------------------------------------------------------------------------
describe('primary tweet exception button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(null) // avoid network in fetchLocationData
    __testResetState()
    document.body.innerHTML = ''
    history.pushState({}, '', '/sarcasticuser/status/123')
  })

  afterEach(() => {
    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
    onChangedCallback({ highlightExceptions: { newValue: [] } }, 'local')
    history.pushState({}, '', '/')
  })

  async function addPrimaryTweet(userName: string): Promise<HTMLElement> {
    const article = makeTweetArticle(userName, 'Sarcastic User', true)
    document.body.appendChild(article)
    await flushAsync()
    return article
  }

  it('appears once the account starts matching a keyword rule', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    // Keyword added after the page settled — the button has to catch up.
    expect(article.querySelector('.x-loc-exc-btn')).toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    await flushAsync()

    expect(article.querySelector('.x-loc-exc-btn')).not.toBeNull()
  })

  it('goes away again when the keyword is removed', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    await flushAsync()
    expect(article.querySelector('.x-loc-exc-btn')).not.toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
    await flushAsync()

    expect(article.querySelector('.x-loc-exc-btn')).toBeNull()
  })

  it('stays for an excluded account so the exception can be undone', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    onChangedCallback(
      { highlightExceptions: { newValue: ['sarcasticuser'] } },
      'local',
    )
    await flushAsync()

    const btn = article.querySelector('.x-loc-exc-btn')
    expect(btn).not.toBeNull()
    expect(btn?.classList.contains('x-loc-exc-active')).toBe(true)
  })

  it('is not added on a timeline page', async () => {
    history.pushState({}, '', '/home')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    onChangedCallback({ highlightKeywords: { newValue: ['nafo'] } }, 'local')
    await flushAsync()

    expect(article.querySelector('.x-loc-exc-btn')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// injectFeedLocationForUser — triggered via hover card (processCard)
// ---------------------------------------------------------------------------
describe('injectFeedLocationForUser — via hover card fetch', () => {
  const HEADERS = { authorization: 'Bearer token', 'x-csrf-token': 'csrf' }

  beforeEach(async () => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
    document.body.innerHTML = ''
    enableFeedLocation()
    await flushAsync()
  })

  afterEach(() => {
    disableFeedLocation()
  })

  it('injects feed row into matching tweet after hover card fetches fresh location', async () => {
    // No cache → tryInjectFeedLocation does nothing when article first appears
    vi.mocked(getCached).mockResolvedValue(undefined)

    const article = makeTweetArticle('hoveruser')
    document.body.appendChild(article)
    await flushAsync()
    expect(article.querySelector('.x-loc-feed-row')).toBeNull()

    // Hover card appears — processCard fetches data via the network
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: {
                  account_based_in: 'Germany',
                  location_accurate: true,
                  source: 'web',
                },
              },
            },
          },
        }),
        { status: 200 },
      ),
    )

    const hoverCard = document.createElement('div')
    hoverCard.setAttribute('data-testid', 'HoverCard')
    hoverCard.innerHTML = `<span>@hoveruser</span>`
    document.body.appendChild(hoverCard)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
  })

  it('does not inject a second row if tryInjectFeedLocation already ran', async () => {
    // Cache is ready when article appears — tryInjectFeedLocation injects first
    vi.mocked(getCached).mockResolvedValue({
      location: 'Italy',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('italyuser')
    document.body.appendChild(article)
    await flushAsync()
    expect(article.querySelectorAll('.x-loc-feed-row')).toHaveLength(1)

    // Hover card triggers another path (fetchLocationData returns cached value quickly)
    vi.spyOn(globalThis, 'fetch')

    const hoverCard = document.createElement('div')
    hoverCard.setAttribute('data-testid', 'HoverCard')
    hoverCard.innerHTML = `<span>@italyuser</span>`
    document.body.appendChild(hoverCard)
    await flushAsync()

    expect(article.querySelectorAll('.x-loc-feed-row')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Hide tweets from blocked locations
// ---------------------------------------------------------------------------
function setBlockedCountries(list: string[]) {
  onChangedCallback({ blockedCountries: { newValue: list } }, 'local')
}
function setHideMode(mode: 'off' | 'collapse' | 'hide') {
  onChangedCallback({ hideBlockedLocations: { newValue: mode } }, 'local')
}

describe('hide tweets by blocked location', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    __testResetState()
    document.body.innerHTML = ''
    setBlockedCountries(['India', 'Nigeria', 'Africa'])
    setHideMode('collapse')
    await flushAsync()
  })

  afterEach(() => {
    setHideMode('off')
    setBlockedCountries([])
  })

  it('collapses a tweet whose cached location is blocked', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('inuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    const ph = article.querySelector('.x-loc-hidden-ph')
    expect(ph).not.toBeNull()
    expect(ph?.textContent).toContain('India')
    expect(article.querySelector('.x-loc-hidden-show')).not.toBeNull()
  })

  it('does not hide when the location is not on the blocked list', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Germany',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('deuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
  })

  it('matches the blocked list across alternate names for one country', async () => {
    // Saved one way, reported the other — either direction has to hide.
    setBlockedCountries(['USA'])
    vi.mocked(getCached).mockResolvedValue({
      location: 'United States',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('aliasuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')

    setBlockedCountries(['Czechia'])
    vi.mocked(getCached).mockResolvedValue({
      location: 'Czech Republic',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const czArticle = makeTweetArticle('czuser')
    document.body.appendChild(czArticle)
    await flushAsync()

    expect(czArticle.getAttribute('data-x-loc-hidden')).toBe('collapse')
  })

  it('uses App Store country as the primary signal over the stated location', async () => {
    // Account claims United States, but the store region (India) is blocked.
    vi.mocked(getCached).mockResolvedValue({
      location: 'United States',
      locationAccurate: true,
      source: 'India App Store',
      bio: null,
    })

    const article = makeTweetArticle('vpnuser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    expect(article.querySelector('.x-loc-hidden-ph')?.textContent).toContain(
      'India',
    )
  })

  it('does not hide on a VPN-inaccurate location with no store signal', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: false,
      source: null,
      bio: null,
    })

    const article = makeTweetArticle('vpnindia')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
  })

  it('does not hide the primary tweet on a status page', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('inuser', 'In User', true)
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
  })

  it('does not hide in "off" mode', async () => {
    setHideMode('off')
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('inuser2')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
  })

  it('"hide" mode collapses the whole article with no placeholder', async () => {
    setHideMode('hide')
    vi.mocked(getCached).mockResolvedValue({
      location: 'Nigeria',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('nguser')
    document.body.appendChild(article)
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('hide')
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
  })

  it('"Show" reveals the tweet and it is never re-hidden', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('revealme')
    document.body.appendChild(article)
    await flushAsync()

    const showBtn =
      article.querySelector<HTMLButtonElement>('.x-loc-hidden-show')
    expect(showBtn).not.toBeNull()
    showBtn!.click()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
    expect(article.getAttribute('data-x-loc-revealed')).toBe('1')
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()

    // A subsequent re-scan (e.g. mode re-applied) must not re-hide it.
    setHideMode('collapse')
    await flushAsync()
    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
  })

  it('unhides everything when the mode is switched off', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('toggleoff')
    document.body.appendChild(article)
    await flushAsync()
    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')

    setHideMode('off')
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBeNull()
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Background prefetcher wiring
// ---------------------------------------------------------------------------
// content.tsx owns the translation from stored settings / captured users into
// prefetcher calls. The prefetcher itself is stubbed above.
describe('prefetcher wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __testResetState()
    document.body.innerHTML = ''
  })

  it('pushes a changed share through, as a number', () => {
    onChangedCallback({ prefetchShare: { newValue: 0.3 } }, 'local')
    expect(prefetcher.setReserveFraction).toHaveBeenCalledWith(0.3)
  })

  it('pushes a changed pacing mode through', () => {
    onChangedCallback({ prefetchPacing: { newValue: 'instant' } }, 'local')
    expect(prefetcher.setPacing).toHaveBeenCalledWith('instant')
  })

  it('normalizes junk in storage instead of forwarding it', () => {
    onChangedCallback({ prefetchShare: { newValue: 'nonsense' } }, 'local')
    onChangedCallback({ prefetchPacing: { newValue: 42 } }, 'local')
    expect(prefetcher.setReserveFraction).toHaveBeenCalledWith(0.7)
    expect(prefetcher.setPacing).toHaveBeenCalledWith('spread')
  })

  it('ignores changes from another storage area', () => {
    onChangedCallback({ prefetchShare: { newValue: 0.3 } }, 'sync')
    expect(prefetcher.setReserveFraction).not.toHaveBeenCalled()
  })

  it('queues feed users high and reply users low, in the order received', () => {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [
            {
              userName: 'feeduser',
              displayName: null,
              bio: null,
              priority: 'high',
            },
            {
              userName: 'replyuser',
              displayName: null,
              bio: null,
              priority: 'low',
            },
          ],
        },
      }),
    )

    expect(prefetcher.enqueue).toHaveBeenCalledWith([
      { userName: 'feeduser', priority: 'high' },
      { userName: 'replyuser', priority: 'low' },
    ])
  })

  it('defaults an untagged user to the high queue', () => {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [{ userName: 'untagged', displayName: null, bio: null }],
        },
      }),
    )

    expect(prefetcher.enqueue).toHaveBeenCalledWith([
      { userName: 'untagged', priority: 'high' },
    ])
  })

  it('queues nothing while background prefetch is switched off', () => {
    onChangedCallback({ backgroundPrefetch: { newValue: false } }, 'local')
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [{ userName: 'ignored', displayName: null, bio: null }],
        },
      }),
    )

    expect(prefetcher.enqueue).not.toHaveBeenCalled()
    expect(prefetcher.stop).toHaveBeenCalled()
    onChangedCallback({ backgroundPrefetch: { newValue: true } }, 'local')
  })
})

// ---------------------------------------------------------------------------
// locationSummaryText — the swipe overlay's one-liner
// ---------------------------------------------------------------------------
describe('locationSummaryText', () => {
  const base = { location: null, locationAccurate: true, source: null } as const

  it('shows the flag and country for a plain web account', () => {
    expect(
      locationSummaryText({
        ...base,
        location: 'United States',
        source: 'web',
      }),
    ).toBe('🇺🇸 United States')
  })

  it('prefers the store country over the stated location', () => {
    expect(
      locationSummaryText({
        ...base,
        location: 'United States',
        source: 'Japan Android App',
      }),
    ).toBe('🇯🇵 Japan')
  })

  it('appends a VPN warning when the location is flagged inaccurate', () => {
    expect(
      locationSummaryText({
        location: 'United States',
        locationAccurate: false,
        source: 'web',
      }),
    ).toBe('🇺🇸 United States · ⚠ VPN')
  })

  it('drops the VPN warning when the store country corroborates the location', () => {
    expect(
      locationSummaryText({
        location: 'Japan',
        locationAccurate: false,
        source: 'Japan App Store',
      }),
    ).toBe('🇯🇵 Japan')
  })

  it('keeps the VPN warning when the store country contradicts the location', () => {
    expect(
      locationSummaryText({
        location: 'United States',
        locationAccurate: false,
        source: 'Japan App Store',
      }),
    ).toBe('🇯🇵 Japan · ⚠ VPN')
  })

  it('warns about the VPN even with no country at all', () => {
    expect(locationSummaryText({ ...base, locationAccurate: false })).toBe(
      '⚠ VPN',
    )
  })

  it('returns empty when there is nothing to show, so no toast appears', () => {
    expect(locationSummaryText({ ...base })).toBe('')
  })

  it('falls back to a globe for an unmapped country', () => {
    expect(locationSummaryText({ ...base, location: 'Atlantis' })).toBe(
      '🌐 Atlantis',
    )
  })
})

// ---------------------------------------------------------------------------
// Swipe-right on a tweet (mobile)
// ---------------------------------------------------------------------------
describe('isCommittedSwipe', () => {
  it('accepts a clean rightward drag', () => {
    expect(isCommittedSwipe(60, 4)).toBe(true)
  })

  it('rejects a tap and any drag short of the threshold', () => {
    expect(isCommittedSwipe(0, 0)).toBe(false)
    expect(isCommittedSwipe(39, 0)).toBe(false)
  })

  it('rejects a leftward drag', () => {
    expect(isCommittedSwipe(-80, 2)).toBe(false)
  })

  it('rejects a vertical scroll that drifts sideways', () => {
    expect(isCommittedSwipe(45, 120)).toBe(false)
  })

  // Mid-drag this is the case that matters: a fling that starts diagonally can
  // clear both raw thresholds long before it is recognisably horizontal.
  it('rejects a diagonal that clears both thresholds but is not dominant', () => {
    expect(isCommittedSwipe(45, 40)).toBe(false)
  })

  it('accepts drift either side of the axis', () => {
    expect(isCommittedSwipe(60, 20)).toBe(true)
    expect(isCommittedSwipe(60, -20)).toBe(true)
  })
})

describe('swipe-right gesture', () => {
  const HEADERS = { authorization: 'Bearer t', 'x-csrf-token': 'c' }

  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(HEADERS)
    __testResetState()
    document.body.innerHTML = ''
    document.getElementById('x-loc-location-toast')?.remove()
  })

  function touch(type: string, target: Element, x: number, y: number) {
    const point = { clientX: x, clientY: y } as Touch
    target.dispatchEvent(
      new TouchEvent(type, {
        bubbles: true,
        touches: [point],
        changedTouches: [point],
      }),
    )
  }

  function toast() {
    return document.getElementById('x-loc-location-toast')
  }

  /** A tweet already in the DOM, with its author's location cached. */
  function swipeableTweet(userName: string) {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })
    const article = makeTweetArticle(userName)
    document.body.appendChild(article)
    return article
  }

  it('fires mid-drag, without waiting for the finger to lift', async () => {
    const article = swipeableTweet('midrag')

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 104)
    await flushAsync()

    expect(toast()?.textContent).toBe('🇯🇵 Japan')
    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
  })

  it('acknowledges the swipe before the lookup resolves', async () => {
    let release: (v: undefined) => void = () => {}
    vi.mocked(getCached).mockReturnValue(
      new Promise((resolve) => {
        release = resolve as (v: undefined) => void
      }),
    )
    const article = makeTweetArticle('pending')
    document.body.appendChild(article)

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 100)
    await flushAsync()

    // Still in flight: the user has feedback, and it is not auto-dismissing.
    expect(toast()?.textContent).toBe('@pending …')
    expect(toast()?.dataset.pending).toBe('1')

    release(undefined)
  })

  it('resolves the pending toast when the author has no location', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: { result: { about_profile: null } },
          },
        }),
        { status: 200 },
      ),
    )
    const article = makeTweetArticle('unknown')
    document.body.appendChild(article)

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 100)
    await flushAsync()

    expect(toast()?.textContent).toBe('No location')
    expect(toast()?.dataset.pending).toBeUndefined()
  })

  // Both toasts are pinned to the same corner, so the vaguer one must yield.
  it('leaves the rate-limit toast alone instead of stacking on it', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('', {
        status: 429,
        headers: {
          'x-rate-limit-reset': String(Math.ceil(Date.now() / 1000) + 300),
        },
      }),
    )
    const article = makeTweetArticle('limited')
    document.body.appendChild(article)

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 100)
    await flushAsync()

    expect(toast()).toBeNull()
    expect(document.getElementById('x-loc-rate-toast')).not.toBeNull()
  })

  it('stays quiet when the session headers have not been captured yet', async () => {
    setApiHeaders(null)
    vi.mocked(getCached).mockResolvedValue(undefined)
    const article = makeTweetArticle('tooearly')
    document.body.appendChild(article)

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 100)
    await flushAsync()

    expect(toast()).toBeNull()
  })

  it('acts once per gesture, however many moves it takes', async () => {
    const article = swipeableTweet('once')

    touch('touchstart', article, 10, 100)
    touch('touchmove', article, 90, 100)
    touch('touchmove', article, 160, 100)
    touch('touchend', article, 220, 100)
    await flushAsync()

    expect(document.querySelectorAll('.x-loc-feed-row')).toHaveLength(1)
  })

  // Coalesced touchmove during a fast flick can skip the threshold entirely.
  it('still fires on touchend when no move crossed the threshold', async () => {
    const article = swipeableTweet('flick')

    touch('touchstart', article, 10, 100)
    touch('touchend', article, 120, 100)
    await flushAsync()

    expect(toast()?.textContent).toBe('🇯🇵 Japan')
  })

  it('ignores a vertical scroll', async () => {
    const article = swipeableTweet('scroller')

    touch('touchstart', article, 10, 300)
    touch('touchmove', article, 18, 120)
    touch('touchend', article, 20, 40)
    await flushAsync()

    expect(toast()).toBeNull()
    expect(article.querySelector('.x-loc-feed-row')).toBeNull()
  })

  it('ignores a swipe that starts outside a tweet', async () => {
    swipeableTweet('offtarget')
    const elsewhere = document.createElement('nav')
    document.body.appendChild(elsewhere)

    touch('touchstart', elsewhere, 10, 100)
    touch('touchmove', elsewhere, 90, 100)
    await flushAsync()

    expect(toast()).toBeNull()
  })

  // The finger can leave the article mid-drag; the tweet it started on is the
  // one the user meant.
  it('uses the tweet the gesture started on', async () => {
    const article = swipeableTweet('origin')
    const outside = document.createElement('div')
    document.body.appendChild(outside)

    touch('touchstart', article, 10, 100)
    touch('touchmove', outside, 120, 100)
    await flushAsync()

    expect(article.querySelector('.x-loc-feed-row')).not.toBeNull()
  })

  it('abandons the gesture when a second finger lands', async () => {
    const article = swipeableTweet('pinched')
    const point = { clientX: 10, clientY: 100 } as Touch

    touch('touchstart', article, 10, 100)
    article.dispatchEvent(
      new TouchEvent('touchstart', {
        bubbles: true,
        touches: [point, { clientX: 200, clientY: 300 } as Touch],
        changedTouches: [point],
      }),
    )
    touch('touchmove', article, 120, 100)
    touch('touchend', article, 160, 100)
    await flushAsync()

    expect(toast()).toBeNull()
  })

  it('abandons the gesture on touchcancel', async () => {
    const article = swipeableTweet('cancelled')

    touch('touchstart', article, 10, 100)
    article.dispatchEvent(new TouchEvent('touchcancel', { bubbles: true }))
    touch('touchend', article, 120, 100)
    await flushAsync()

    expect(toast()).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// The community cache gates background prefetch
// ---------------------------------------------------------------------------
// Prefetch exists to warm the shared cache, so opting out of the cache stops it.
describe('community cache gating', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    __testResetState()
    vi.mocked(isSharedCacheConfigured).mockReturnValue(true)
    vi.mocked(isSharedCacheEnabled).mockReturnValue(true)
  })

  afterEach(() => {
    vi.mocked(isSharedCacheConfigured).mockReturnValue(true)
    vi.mocked(isSharedCacheEnabled).mockReturnValue(true)
    onChangedCallback({ sharedCacheEnabled: { newValue: true } }, 'local')
  })

  function usersEvent() {
    window.dispatchEvent(
      new CustomEvent('x-loc-users-data', {
        detail: {
          users: [{ userName: 'someone', displayName: null, bio: null }],
        },
      }),
    )
  }

  it('stops the prefetcher when the cache is switched off', () => {
    vi.mocked(isSharedCacheEnabled).mockReturnValue(false)
    onChangedCallback({ sharedCacheEnabled: { newValue: false } }, 'local')
    expect(prefetcher.stop).toHaveBeenCalled()
    expect(prefetcher.start).not.toHaveBeenCalled()
  })

  it('queues nothing while the cache is off', () => {
    vi.mocked(isSharedCacheEnabled).mockReturnValue(false)
    onChangedCallback({ sharedCacheEnabled: { newValue: false } }, 'local')
    usersEvent()
    expect(prefetcher.enqueue).not.toHaveBeenCalled()
  })

  it('restarts the prefetcher when the cache is switched back on', () => {
    setApiHeaders({ authorization: 'Bearer t' })
    vi.mocked(isSharedCacheEnabled).mockReturnValue(false)
    onChangedCallback({ sharedCacheEnabled: { newValue: false } }, 'local')
    vi.mocked(prefetcher.start).mockClear()

    vi.mocked(isSharedCacheEnabled).mockReturnValue(true)
    onChangedCallback({ sharedCacheEnabled: { newValue: true } }, 'local')
    expect(prefetcher.start).toHaveBeenCalled()
    usersEvent()
    expect(prefetcher.enqueue).toHaveBeenCalled()
  })

  // A build with no cache server can't be opted out of, so it must not gate.
  it('keeps prefetching when no cache server is configured', () => {
    setApiHeaders({ authorization: 'Bearer t' })
    vi.mocked(isSharedCacheConfigured).mockReturnValue(false)
    vi.mocked(isSharedCacheEnabled).mockReturnValue(false)
    onChangedCallback({ sharedCacheEnabled: { newValue: false } }, 'local')

    expect(prefetcher.start).toHaveBeenCalled()
    expect(prefetcher.stop).not.toHaveBeenCalled()
    usersEvent()
    expect(prefetcher.enqueue).toHaveBeenCalled()
  })
})
