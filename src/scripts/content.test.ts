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
vi.mock('./shared-cache', () => ({
  sharedBatchLookup: vi.fn().mockResolvedValue([]),
  contributeLocation: vi.fn(),
  setSharedCacheEnabled: vi.fn(),
}))

import { fetchLocationData, setApiHeaders, __testResetState } from './content'
import { getCached, mergeCached, clearAllCache } from './cache'

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
