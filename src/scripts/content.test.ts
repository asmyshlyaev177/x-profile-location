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
  setMinConfidence: vi.fn(),
  flushContributions: vi.fn(),
  isSharedCacheConfigured: vi.fn(() => true),
  isSharedCacheEnabled: vi.fn(() => true),
}))

// Stub the snapshotter. It needs a 2D canvas context and an <img> that can
// decode an SVG data URL, neither of which happy-dom has, and its DOM surgery
// is covered by snapshot.test.ts. Rejecting by default is the useful default
// here: it exercises the fallback, which is the path that has to keep working
// on a page we do not control.
const snapshot = vi.hoisted(() => ({
  snapshotElement: vi.fn().mockRejectedValue(new Error('no canvas in tests')),
}))
vi.mock('./snapshot', async (importOriginal) => ({
  // allowGrowth is real DOM work with no canvas in it, and decorateSnapshot
  // calls it — only the rendering needs stubbing.
  ...(await importOriginal<typeof import('./snapshot')>()),
  snapshotElement: snapshot.snapshotElement,
}))

// Stub the card renderer: it needs a real 2D canvas context (happy-dom has
// none) and its layout is covered by share-card.test.ts. What content.tsx owns
// is *what it passes in* — which post text, for which account.
vi.mock('./share-card', () => ({
  renderShareCard: vi.fn().mockResolvedValue(new Blob()),
  deliverShareCard: vi.fn().mockResolvedValue('clipboard'),
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
  accountChips,
  fetchLocationData,
  isCommittedSwipe,
  keywordRangesIn,
  locationSummaryText,
  setApiHeaders,
  __testResetState,
} from './content'
import { getCached, mergeCached, clearAllCache } from './cache'
import { renderShareCard } from './share-card'
import {
  isSharedCacheConfigured,
  isSharedCacheEnabled,
  sharedBatchLookup,
} from './shared-cache'

// Capture listeners registered at module load time before any vi.clearAllMocks() runs.
const chromeGlobal = (globalThis as any).chrome
const onChangedCallback: (
  changes: Record<string, { newValue: unknown }>,
  area: string,
) => void = chromeGlobal.storage.onChanged.addListener.mock.calls[0][0]
const onMessageCallback: (message: unknown) => void =
  chromeGlobal.runtime.onMessage.addListener.mock.calls[0][0]

// ---------------------------------------------------------------------------
// Per-test isolation
// ---------------------------------------------------------------------------
// This hook is file-scoped on purpose: Vitest runs file-level beforeEach hooks
// before describe-level ones, so every test starts from the same state no matter
// which describe (or which order) it runs in. `vi.clearAllMocks()` — which most
// describes below call — only clears call history, *not* implementations, so a
// `mockResolvedValue` set by one test stays installed for every test after it.
// That was a real order dependency: with `--sequence.shuffle`, the
// `fetchLocationData` tests (which expect the cache to miss, and so never set
// getCached themselves) failed whenever a describe that stubs getCached with a
// hit ran first. Restore the mock defaults explicitly rather than relying on
// vi.resetAllMocks(), which would also blank the `() => true` predicates in the
// shared-cache mock and silently change behaviour.
const originalFetch = globalThis.fetch

beforeEach(() => {
  __testResetState()
  document.body.innerHTML = ''
  history.pushState({}, '', '/')
  globalThis.fetch = originalFetch

  vi.mocked(getCached).mockResolvedValue(undefined)
  vi.mocked(mergeCached).mockResolvedValue(undefined)
  vi.mocked(clearAllCache).mockResolvedValue(undefined)
  vi.mocked(sharedBatchLookup).mockResolvedValue([])
  vi.mocked(isSharedCacheConfigured).mockReturnValue(true)
  vi.mocked(isSharedCacheEnabled).mockReturnValue(true)
})

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

  it('offers itself for a blocked location, with no keyword in sight', async () => {
    // The button used to know about keywords and nothing else, so the reader
    // looking at a post collapsed for its country had no way to say "not this
    // one" without going to the options page and typing the handle in.
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const card = await addHoverCard('someone')
    await flushAsync()

    const btn = card.querySelector<HTMLElement>('.x-loc-exc-btn')
    expect(btn?.dataset.rules).toBe('location')
    expect(btn?.title).toContain('blocked-location filter')
  })

  it('offers itself for an account under the age filter', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      facts: { createdAt: Date.now() - 10 * 24 * 60 * 60 * 1000 },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 90 },
      hideBlockedLocations: 'collapse',
    })

    const card = await addHoverCard('freshaccount')
    await flushAsync()

    const btn = card.querySelector<HTMLElement>('.x-loc-exc-btn')
    expect(btn?.dataset.rules).toBe('age')
    expect(btn?.title).toContain('account-age filter')
  })

  it('covers every rule acting on the account, and names them all', async () => {
    // One button, whatever the reason — the reader's complaint is "not this
    // account", not "not rule three of four".
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })
    pushSettings({
      highlightKeywords: ['nafo'],
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const card = await addHoverCard('sarcasticuser')
    await flushAsync()

    const btn = card.querySelector<HTMLElement>('.x-loc-exc-btn')
    expect(btn?.dataset.rules).toBe('highlight location')
    expect(btn?.title).toContain('keyword and flag highlighting')
    expect(btn?.title).toContain('the blocked-location filter')
  })

  it('writes an exception for every rule it covers, in one click', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })
    pushSettings({
      highlightKeywords: ['nafo'],
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const card = await addHoverCard('sarcasticuser')
    await flushAsync()
    card.querySelector<HTMLElement>('.x-loc-exc-btn')!.click()

    const written = chromeGlobal.storage.local.set.mock.calls.at(-1)[0]
    expect(written.ruleExceptions.highlight).toContain('sarcasticuser')
    expect(written.ruleExceptions.location).toContain('sarcasticuser')
    // The rules it does not cover are left exactly as they were.
    expect(written.ruleExceptions.age).toEqual([])
    // Mirrored to the legacy key, or a reload brings the highlight back.
    expect(written.highlightExceptions).toContain('sarcasticuser')
  })

  it('undoes every rule it covers, in one click', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })
    pushSettings({
      highlightKeywords: ['nafo'],
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
      ruleExceptions: {
        highlight: ['sarcasticuser'],
        location: ['sarcasticuser'],
        affiliation: [],
        age: [],
      },
    })

    const card = await addHoverCard('sarcasticuser')
    await flushAsync()
    const btn = card.querySelector<HTMLElement>('.x-loc-exc-btn')!
    expect(btn.classList.contains('x-loc-exc-active')).toBe(true)

    btn.click()

    const written = chromeGlobal.storage.local.set.mock.calls.at(-1)[0]
    expect(written.ruleExceptions.highlight).toEqual([])
    expect(written.ruleExceptions.location).toEqual([])
    expect(btn.classList.contains('x-loc-exc-active')).toBe(false)
  })

  it('is not offered for an account on the always-show allowlist', async () => {
    // Nothing is acting on it, so an exception would be a setting with no
    // effect — and one more entry for the user to find later and puzzle over.
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })
    pushSettings({
      highlightKeywords: ['nafo'],
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
      alwaysShowAccounts: ['sarcasticuser'],
    })

    const card = await addHoverCard('sarcasticuser')
    await flushAsync()

    expect(card.querySelector('.x-loc-exc-btn')).toBeNull()
  })

  it('does not offer itself twice when the lookup widens the rule set', async () => {
    // The button goes in on the bio alone and is synced again when the data
    // lands; the second pass has to replace the first, not sit under it.
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })
    pushSettings({
      highlightKeywords: ['nafo'],
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const card = await addHoverCard('sarcasticuser')
    await flushAsync()

    expect(card.querySelectorAll('.x-loc-exc-btn').length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Marking the matched keyword in a hover card
// ---------------------------------------------------------------------------
describe('keyword marks on hover cards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(null)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    onChangedCallback({ highlightKeywords: { newValue: [] } }, 'local')
  })

  /** happy-dom has no Highlight registry — stand one up so it can be read. */
  function stubHighlightApi(): Map<string, { ranges: Range[] }> {
    const registry = new Map<string, { ranges: Range[] }>()
    vi.stubGlobal(
      'Highlight',
      class {
        ranges: Range[]
        constructor(...ranges: Range[]) {
          this.ranges = ranges
        }
      },
    )
    vi.stubGlobal('CSS', { highlights: registry })
    return registry
  }

  async function addHoverCard(
    userName: string,
    bioHtml: string,
  ): Promise<HTMLElement> {
    const card = document.createElement('div')
    card.setAttribute('data-testid', 'HoverCard')
    card.innerHTML = `<span>@${userName}</span><div data-testid="UserDescription">${bioHtml}</div>`
    document.body.appendChild(card)
    await flushAsync()
    return card
  }

  describe('keywordRangesIn', () => {
    it('covers the keyword exactly, wherever it sits in the bio', () => {
      onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
      const host = document.createElement('div')
      host.innerHTML = '<p>we love <b>nft</b> here</p>'
      document.body.appendChild(host)

      const ranges = keywordRangesIn(host)

      expect(ranges.map((r) => r.toString())).toEqual(['nft'])
    })

    it('skips our own injected text', () => {
      // The account card and the flags row can easily contain a tracked word;
      // marking those would be the extension pointing at itself.
      onChangedCallback({ highlightKeywords: { newValue: ['japan'] } }, 'local')
      const host = document.createElement('div')
      host.innerHTML =
        '<p>lives in japan</p><div class="x-loc-hover"><span>Japan</span></div>'
      document.body.appendChild(host)

      expect(keywordRangesIn(host)).toHaveLength(1)
    })
  })

  it('registers a range over the word that fired the rule', async () => {
    const registry = stubHighlightApi()
    onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'nft trader',
    })

    await addHoverCard('trader', 'nft trader')
    await flushAsync()

    expect(registry.get('x-loc-keyword')?.ranges.map(String)).toEqual(['nft'])
  })

  it('marks nothing for an account the rule does not fire on', async () => {
    const registry = stubHighlightApi()
    onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })

    const card = await addHoverCard('normaluser', 'just a normal bio')
    await flushAsync()

    expect(card.hasAttribute('data-x-loc-kw')).toBe(false)
    expect(registry.has('x-loc-keyword')).toBe(false)
  })

  it('marks nothing for an account excepted from highlighting', async () => {
    // The posts lose their orange bar, so the bio has to lose its mark — a word
    // still lit up in a card would read as the exception not having worked.
    const registry = stubHighlightApi()
    onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
    onChangedCallback(
      { highlightExceptions: { newValue: ['trader'] } },
      'local',
    )
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'nft trader',
    })

    const card = await addHoverCard('trader', 'nft trader')
    await flushAsync()

    expect(card.hasAttribute('data-x-loc-kw')).toBe(false)
    expect(registry.has('x-loc-keyword')).toBe(false)
  })

  it('does not throw where the browser has no highlight registry', async () => {
    // Firefox before 140. The mark is an explanation of something already
    // visible, so the right failure is for it not to paint.
    onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'nft trader',
    })

    const card = await addHoverCard('trader', 'nft trader')
    await flushAsync()

    // The attribute half still works — that is the emoji marking, which is CSS.
    expect(card.getAttribute('data-x-loc-kw')).toBe('1')
  })

  it('marks an emoji keyword through a stylesheet, since X draws it as an image', async () => {
    onChangedCallback({ highlightKeywords: { newValue: ['🇷🇺'] } }, 'local')
    await flushAsync()

    const style = document.getElementById('x-loc-kw-styles')
    expect(style?.textContent).toContain('[data-x-loc-kw] img[alt="🇷🇺"]')
  })

  it('takes the stylesheet away with the last emoji keyword', async () => {
    onChangedCallback({ highlightKeywords: { newValue: ['🇷🇺'] } }, 'local')
    await flushAsync()
    expect(document.getElementById('x-loc-kw-styles')).not.toBeNull()

    onChangedCallback({ highlightKeywords: { newValue: ['nft'] } }, 'local')
    await flushAsync()

    expect(document.getElementById('x-loc-kw-styles')).toBeNull()
  })

  it('escapes a keyword before it reaches the selector', async () => {
    // A keyword is user input on its way into CSS. Unescaped, the quote in this
    // one would close the attribute selector and everything after it would be
    // parsed as rules of the user's choosing.
    onChangedCallback(
      { highlightKeywords: { newValue: ['🇷🇺"] , * {display:none} i[alt="'] } },
      'local',
    )
    await flushAsync()

    const css = document.getElementById('x-loc-kw-styles')?.textContent ?? ''
    // The only unescaped quotes left are the two the generator wrote itself, so
    // the whole keyword is inside one attribute value and none of it is a rule.
    expect(css.match(/(?<!\\)"/g)).toHaveLength(2)
  })
})

// ---------------------------------------------------------------------------
// Exception button on the primary tweet of a status page (no hover card there)
// ---------------------------------------------------------------------------
describe('primary tweet exception button', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setApiHeaders(null) // avoid network in fetchLocationData
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

  it('appears for a blocked location too, not only for a keyword', async () => {
    // X opens no hover card for the account a status page is about, so this
    // inline copy is the only place to make an exception from that page — and
    // it has to follow the same rules the hover card's button does.
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'just a normal bio',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    expect(article.querySelector('.x-loc-exc-btn')).toBeNull()

    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })
    await flushAsync()

    const btn = article.querySelector<HTMLElement>('.x-loc-exc-btn')
    expect(btn?.dataset.rules).toBe('location')
  })

  it('does not double up when two rule changes land back to back', async () => {
    // Each change starts an async sync; both used to decide "there is no button
    // to replace" from a handle taken before their awaits, and both appended.
    vi.mocked(getCached).mockResolvedValue({
      location: 'Japan',
      locationAccurate: true,
      source: null,
      bio: 'no NAFO here',
    })

    const article = await addPrimaryTweet('sarcasticuser')
    pushSettings({ highlightKeywords: ['nafo'] })
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })
    await flushAsync()

    expect(article.querySelectorAll('.x-loc-exc-btn').length).toBe(1)
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

  it('offers the exception button on the placeholder, for the rule that hid it', async () => {
    // A collapsed post shows nothing to hover, so the hover card — where the
    // button otherwise lives — cannot be reached from here at all.
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('inuser')
    document.body.appendChild(article)
    await flushAsync()

    const btn = article.querySelector<HTMLElement>(
      '.x-loc-hidden-ph .x-loc-exc-btn',
    )
    expect(btn?.dataset.rules).toBe('location')
  })

  it('un-hides for good when that button is clicked', async () => {
    // "Show" spares this one post; the exception spares the account — so the
    // placeholder has to go, not just this instance of it.
    vi.mocked(getCached).mockResolvedValue({
      location: 'India',
      locationAccurate: true,
      source: 'web',
      bio: null,
    })

    const article = makeTweetArticle('inuser')
    document.body.appendChild(article)
    await flushAsync()
    article.querySelector<HTMLElement>('.x-loc-exc-btn')!.click()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
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

// ---------------------------------------------------------------------------
// Phase 2 filters
// ---------------------------------------------------------------------------
function makeUserCell(userName: string, displayName = 'Cell User') {
  const cell = document.createElement('div')
  cell.setAttribute('data-testid', 'UserCell')
  cell.innerHTML = `
    <div data-testid="User-Name">
      <a href="/${userName}">${displayName}</a>
      <a href="/${userName}">@${userName}</a>
    </div>
  `
  return cell
}

/** Push settings in the way the options page would. */
function pushSettings(changes: Record<string, unknown>) {
  const wrapped: Record<string, { newValue: unknown }> = {}
  for (const [key, newValue] of Object.entries(changes)) {
    wrapped[key] = { newValue }
  }
  onChangedCallback(wrapped, 'local')
}

const JAPAN = {
  location: 'Japan',
  locationAccurate: true,
  source: 'Japan App Store' as const,
}

describe('region filtering', () => {
  it('blocks a member country when its region is on the list', async () => {
    // The whole point of the region table: 'East Asia' has to catch an account
    // X reports as Japan, not only one reported as the region itself.
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['East Asia'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    expect(article.textContent).toContain('Japan')
  })

  it('still blocks an account reported as the region itself', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: 'South Asia',
      locationAccurate: true,
      source: null,
    })
    pushSettings({
      blockedCountries: ['South Asia'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
  })

  it('leaves a country outside the region alone', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Africa'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
  })
})

describe('affiliation filtering', () => {
  it('collapses a post by an account badged with a blocked org', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: {
        affiliation: { handle: 'someorg', name: 'Some Org', badgeUrl: null },
      },
    })
    pushSettings({
      blockedAffiliations: ['someorg'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('staffer')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    // The placeholder names the org, so the user can tell which rule fired.
    expect(article.textContent).toContain('Some Org')
  })

  it('ignores a badge for an org that is not blocked', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: {
        affiliation: { handle: 'otherorg', name: 'Other', badgeUrl: null },
      },
    })
    pushSettings({
      blockedAffiliations: ['someorg'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('staffer')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
  })
})

describe('account age', () => {
  const daysAgo = (n: number) => Date.now() - n * 24 * 60 * 60 * 1000

  /** Put a tweet by `user` on the page and let the observer judge it. */
  async function showTweet(user: string) {
    const article = makeTweetArticle(user)
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()
    return article
  }

  it('marks an account younger than the threshold', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('newbie')

    expect(article.getAttribute('data-x-loc-mark')).toBe('age')
  })

  it('never hides one, whatever the mode is set to', async () => {
    // The point of the rule: "joined recently" describes a farmed account and
    // a person who signed up last month equally well, so it points rather than
    // removes. `hide` is the strongest setting there is and it still must not
    // apply here.
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'hide',
    })

    const article = await showTweet('newbie')

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
    expect(article.getAttribute('data-x-loc-mark')).toBe('age')
  })

  it('marks posts even with hiding switched off entirely', async () => {
    // `off` answers "what happens to a post a filter caught", and a rule that
    // only marks never catches one in that sense.
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'off',
    })

    const article = await showTweet('newbie')

    expect(article.getAttribute('data-x-loc-mark')).toBe('age')
  })

  it('still lets a blocked location hide the same account', async () => {
    // Being young must not shield a post the location filter would have taken:
    // the two rules are judged separately, and the hiding one still wins.
    vi.mocked(getCached).mockResolvedValue({
      ...JAPAN,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      blockedCountries: ['Japan'],
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('newbie')

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    // The placeholder names the rule that hid it, not the one that only marks.
    expect(article.querySelector('.x-loc-hidden-label')?.textContent).toContain(
      'Japan',
    )
    // The mark is set as well, and deliberately left alone: the two rules are
    // separate answers about the same account, and the collapsed row keeping
    // the bar costs nothing — the placeholder is what carries the reason.
    expect(article.getAttribute('data-x-loc-mark')).toBe('age')
  })

  it('leaves an older account alone', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(400) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('veteran')

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.hasAttribute('data-x-loc-mark')).toBe(false)
  })

  it('does nothing when X never said when the account was created', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: {},
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('unknown')

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.hasAttribute('data-x-loc-mark')).toBe(false)
  })

  it('drops the mark when the rule is switched off', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('newbie')
    expect(article.getAttribute('data-x-loc-mark')).toBe('age')

    pushSettings({ accountAgeFilter: { enabled: false, days: 30 } })
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-mark')).toBe(false)
  })

  it('drops the mark for an account excepted from the rule', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
      facts: { createdAt: daysAgo(3) },
    })
    pushSettings({
      accountAgeFilter: { enabled: true, days: 30 },
      hideBlockedLocations: 'collapse',
    })

    const article = await showTweet('newbie')
    expect(article.getAttribute('data-x-loc-mark')).toBe('age')

    pushSettings({
      ruleExceptions: {
        highlight: [],
        location: [],
        affiliation: [],
        age: ['newbie'],
      },
    })
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-mark')).toBe(false)
  })
})

describe('the always-show allowlist', () => {
  it('overrides every filter', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Japan'],
      alwaysShowAccounts: ['friend'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('friend')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
  })

  it('does not exempt anyone else', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Japan'],
      alwaysShowAccounts: ['friend'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('stranger')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
  })
})

describe('per-rule exceptions', () => {
  it('exempts an account from the one rule named, not the others', async () => {
    vi.mocked(getCached).mockResolvedValue({
      ...JAPAN,
      facts: {
        affiliation: { handle: 'someorg', name: 'Some Org', badgeUrl: null },
      },
    })
    pushSettings({
      blockedCountries: ['Japan'],
      blockedAffiliations: ['someorg'],
      ruleExceptions: {
        highlight: [],
        location: ['dual'],
        affiliation: [],
        age: [],
      },
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('dual')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    // Location is excused, so the affiliation rule is what catches it.
    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
    expect(article.textContent).toContain('Some Org')
  })
})

describe('quoted posts', () => {
  it('collapses only the quote when the quoted author is filtered', async () => {
    vi.mocked(getCached).mockImplementation(async (name: string) =>
      name.toLowerCase() === 'quoted' ? JAPAN : undefined,
    )
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeQuoteTweetArticle('outer', 'quoted')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    const quote = article.querySelector('div[role="link"]')!
    expect(quote.getAttribute('data-x-loc-quote-hidden')).toBe('collapse')
    // The post doing the quoting was never filtered, so it stays readable —
    // taking the whole row would remove something the user never asked to hide.
    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
  })

  it('collapses the whole post when its own author is filtered', async () => {
    vi.mocked(getCached).mockImplementation(async (name: string) =>
      name.toLowerCase() === 'outer' ? JAPAN : undefined,
    )
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeQuoteTweetArticle('outer', 'quoted')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
  })
})

describe('people lists', () => {
  it('marks a matching row instead of removing it', async () => {
    // Hiding rows here breaks the counts the page exists to show.
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({ blockedCountries: ['Japan'], hideBlockedLocations: 'hide' })

    const cell = makeUserCell('someone')
    document.body.appendChild(cell)
    await flushAsync()
    await flushAsync()

    expect(cell.getAttribute('data-x-loc-cell-match')).toBe('location')
    expect(cell.querySelector('.x-loc-cell-tag')?.textContent).toContain(
      'Japan',
    )
    expect(cell.isConnected).toBe(true)
    expect(cell.hasAttribute('data-x-loc-hidden')).toBe(false)
  })

  it('leaves a row alone when nothing matches', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({ blockedCountries: ['France'], hideBlockedLocations: 'hide' })

    const cell = makeUserCell('someone')
    document.body.appendChild(cell)
    await flushAsync()
    await flushAsync()

    expect(cell.hasAttribute('data-x-loc-cell-match')).toBe(false)
    expect(cell.querySelector('.x-loc-cell-tag')).toBeNull()
  })
})

describe('the master switch', () => {
  it('strips what is already on screen when switched off', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()
    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')

    pushSettings({ extensionEnabled: false })

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.querySelector('.x-loc-hidden-ph')).toBeNull()
  })

  it('injects nothing at all while off', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })
    pushSettings({ extensionEnabled: false })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()
    await flushAsync()

    expect(article.hasAttribute('data-x-loc-hidden')).toBe(false)
    expect(article.querySelector('.x-loc-info')).toBeNull()
  })

  it('re-decorates the page when switched back on', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({
      blockedCountries: ['Japan'],
      hideBlockedLocations: 'collapse',
    })
    pushSettings({ extensionEnabled: false })

    const article = makeTweetArticle('someone')
    document.body.appendChild(article)
    await flushAsync()

    pushSettings({ extensionEnabled: true })
    await flushAsync()
    await flushAsync()

    expect(article.getAttribute('data-x-loc-hidden')).toBe('collapse')
  })
})

describe('what a snapshot leaves out', () => {
  // decorateSnapshot is handed to snapshotElement as a callback, so the test
  // takes it from the call and runs it — the same way the real snapshot does.
  function decorateOf(article: Element) {
    const opts = snapshot.snapshotElement.mock.calls.at(-1)?.[1] as {
      decorate?: (clone: Element) => void
    }
    const clone = article.cloneNode(true) as Element
    opts.decorate?.(clone)
    return clone
  }

  async function snapshotOf(html: string) {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    const article = makeTweetArticle('someone')
    article.insertAdjacentHTML('beforeend', html)
    document.body.appendChild(article)
    await flushAsync()

    const link = article.querySelector('a[href="/someone"]')!
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    const card = document.createElement('div')
    card.setAttribute('data-testid', 'HoverCard')
    card.innerHTML =
      '<div><div><div><div data-testid="UserName"><a href="/someone">T</a></div>' +
      '<span>@someone</span></div></div></div>'
    document.body.appendChild(card)
    await flushAsync()
    await flushAsync()
    ;(card.querySelector('.x-loc-share-btn') as HTMLButtonElement).click()
    await flushAsync()

    return decorateOf(article)
  }

  it('drops the ⋯ menu, Grok, and the Subscribe button', async () => {
    // Controls pointed at whoever is looking, not part of the post — and in an
    // image they invite a click that cannot do anything.
    const clone = await snapshotOf(
      '<button data-testid="caret">⋯</button>' +
        '<button aria-label="Grok actions">grok</button>' +
        '<div role="button">Subscribe</div>' +
        '<div role="button">Follow</div>',
    )

    expect(clone.querySelector('[data-testid="caret"]')).toBeNull()
    expect(clone.querySelector('[aria-label*="Grok" i]')).toBeNull()
    expect(clone.textContent).not.toContain('Subscribe')
    expect(clone.textContent).not.toContain('Follow')
  })

  it('matches Grok however X localises the label around it', async () => {
    // The label is translated; the product name inside it is not.
    const clone = await snapshotOf(
      '<button aria-label="Acciones de Grok">g</button>',
    )
    expect(clone.querySelector('[aria-label*="Grok" i]')).toBeNull()
  })

  it('keeps a button that only happens to be a button', async () => {
    const clone = await snapshotOf('<div role="button">Show more</div>')
    expect(clone.textContent).toContain('Show more')
  })

  it('replaces our own on-page furniture with a written-out location line', async () => {
    const clone = await snapshotOf(
      '<div class="x-loc-info">flags</div><div class="x-loc-card">chips</div>',
    )

    expect(clone.querySelector('.x-loc-info')).toBeNull()
    expect(clone.querySelector('.x-loc-card')).toBeNull()
    // Words, not just a flag the reader has to recognise.
    expect(clone.textContent).toContain('Japan')
  })
})

describe('the account card', () => {
  const daysAgo = (n: number) => Date.now() - n * 24 * 60 * 60 * 1000

  it('shows only what X actually returned', () => {
    const chips = accountChips({
      createdAt: daysAgo(400),
      followers: 33813,
    }).map((c) => c.text)

    expect(chips).toContain('🎂 13mo')
    expect(chips).toContain('👥 34K')
    // Nothing was said about handle changes, so nothing is claimed about them.
    expect(chips.join(' ')).not.toContain('handle')
  })

  it('says nothing about plain Premium, which X already shows as a blue check', () => {
    expect(accountChips({ blueVerified: true })).toEqual([])
  })

  it('is empty for an account we know nothing about', () => {
    expect(accountChips({})).toEqual([])
    expect(accountChips(undefined)).toEqual([])
  })

  it('shows only the verification X does not already draw', () => {
    // Identity and legacy verification render as the same badge as a paid one,
    // so they are the only ones the card can tell you something new about.
    expect(
      accountChips({
        identityVerified: true,
        verified: true,
        blueVerified: true,
      }).map((c) => c.text),
    ).toEqual(['🪪 ID verified'])
    expect(accountChips({ verified: true, blueVerified: true })[0].text).toBe(
      '✔ Verified',
    )
  })

  it('tints a young account and a much-renamed one, and nothing else', () => {
    const young = accountChips({ createdAt: daysAgo(10) })
    expect(young[0].tone).toBe('warn')

    const old = accountChips({ createdAt: daysAgo(4000) })
    expect(old[0].tone).toBe('plain')

    const renamed = accountChips({ handleChanges: 4 })
    expect(renamed[0].tone).toBe('warn')
    expect(accountChips({ handleChanges: 1 })[0].tone).toBe('plain')
  })

  it('names the org a badge points at', () => {
    const chips = accountChips({
      affiliation: { handle: 'nasa', name: 'NASA', badgeUrl: null },
    })
    expect(chips[0].text).toBe('🏢 NASA')
    expect(chips[0].title).toContain('@nasa')
  })

  it('falls back to the handle when the badge carries no name', () => {
    const chips = accountChips({
      affiliation: { handle: 'nasa', name: null, badgeUrl: null },
    })
    expect(chips[0].text).toBe('🏢 @nasa')
  })
})

describe('the hover-card share button', () => {
  beforeEach(() => {
    // Call history survives between tests otherwise, and "was it called" is
    // exactly what these assert. The implementation is re-installed because
    // clearAllMocks drops history but keeps implementations — and elsewhere in
    // this file it is the other way round.
    snapshot.snapshotElement.mockClear()
    snapshot.snapshotElement.mockRejectedValue(new Error('no canvas in tests'))
    vi.mocked(renderShareCard).mockClear()
  })

  function makeHoverCard(userName: string) {
    const card = document.createElement('div')
    card.setAttribute('data-testid', 'HoverCard')
    card.innerHTML = `
      <div><div><div>
        <div data-testid="UserName"><a href="/${userName}">Test User</a></div>
        <span>@${userName}</span>
      </div></div></div>
    `
    return card
  }

  async function hover(userName: string) {
    const card = makeHoverCard(userName)
    document.body.appendChild(card)
    await flushAsync()
    await flushAsync()
    return card
  }

  it('offers a copy button once X has told us something', async () => {
    // Discoverability is the whole point: the context menu was the only way in,
    // so nobody found it.
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    const card = await hover('someone')

    const btn = card.querySelector('.x-loc-share-btn') as HTMLButtonElement
    expect(btn).not.toBeNull()
    expect(btn.textContent).toContain('Copy')
    // In the flags row, not on a line of its own — a hover card is short on
    // vertical space and the button is an action on exactly that row.
    expect(btn.closest('.x-loc-info')).not.toBeNull()
  })

  it('comes after the flags in the row, not before them', async () => {
    // Everything used to be inserted at the same anchor, which put each new
    // element above the last and landed the button on top of the flags.
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    const card = await hover('someone')

    const row = card.querySelector('.x-loc-info')!
    const last = row.lastElementChild as HTMLElement
    expect(last.classList.contains('x-loc-share-btn')).toBe(true)
  })

  it('copies the post it was opened from, not just the account', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)

    const article = makeTweetArticle('someone')
    article.querySelector('div:not([data-testid])')!.remove()
    const text = document.createElement('div')
    text.setAttribute('data-testid', 'tweetText')
    text.textContent = 'The post that was on screen.'
    article.appendChild(text)
    document.body.appendChild(article)
    await flushAsync()

    // Pointing at the author's link is what opens the card, and is how the
    // post gets associated with it.
    const link = article.querySelector('a[href="/someone"]')!
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))

    const card = await hover('someone')
    ;(card.querySelector('.x-loc-share-btn') as HTMLButtonElement).click()
    await flushAsync()
    await flushAsync()

    // The snapshot is tried first, on the post the pointer was on.
    expect(snapshot.snapshotElement).toHaveBeenCalled()
    expect(snapshot.snapshotElement.mock.calls.at(-1)?.[0]).toBe(article)

    // And when it can't render, the drawn card still carries the post text.
    expect(vi.mocked(renderShareCard).mock.calls.at(-1)?.[0].text).toBe(
      'The post that was on screen.',
    )
  })

  it('falls back to an account-only card when no post is in reach', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    const card = await hover('nowhere')
    ;(card.querySelector('.x-loc-share-btn') as HTMLButtonElement).click()
    await flushAsync()
    await flushAsync()

    // Nothing to snapshot, so it goes straight to the drawn card.
    expect(snapshot.snapshotElement).not.toHaveBeenCalled()
    expect(vi.mocked(renderShareCard).mock.calls.at(-1)?.[0].text).toBe('')
  })

  it('stays away when there is nothing on the card to copy', async () => {
    vi.mocked(getCached).mockResolvedValue({
      location: null,
      locationAccurate: true,
      source: null,
    })
    const card = await hover('unknown')
    expect(card.querySelector('.x-loc-share-btn')).toBeNull()
  })

  it('can be switched off', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    pushSettings({ showShareButton: false })

    const card = await hover('someone')
    expect(card.querySelector('.x-loc-share-btn')).toBeNull()
  })

  it('is not added twice when the card is reprocessed', async () => {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    const card = await hover('someone')
    card.removeAttribute('data-x-loc-done')
    document.body.appendChild(document.createElement('div'))
    await flushAsync()
    await flushAsync()

    expect(card.querySelectorAll('.x-loc-share-btn')).toHaveLength(1)
  })
})

describe('where the snapshot puts the location line', () => {
  function decorateOf(article: Element) {
    const opts = snapshot.snapshotElement.mock.calls.at(-1)?.[1] as {
      decorate?: (clone: Element) => void
    }
    const clone = article.cloneNode(true) as Element
    opts.decorate?.(clone)
    return clone
  }

  async function shareVia(article: HTMLElement) {
    vi.mocked(getCached).mockResolvedValue(JAPAN)
    document.body.appendChild(article)
    await flushAsync()

    onMessageCallback({ type: 'SHARE_POST' })
    article.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true }))
    onMessageCallback({ type: 'SHARE_POST' })
    await flushAsync()
    await flushAsync()

    return decorateOf(article)
  }

  it('goes inside the name block on a status page, after the handle', async () => {
    // Where processPrimaryTweet puts it on the page. Putting it after the whole
    // block instead is what left a gap under a detail page's author.
    const article = makeTweetArticle('someone', 'Test User', true)
    const clone = await shareVia(article)

    const nameEl = clone.querySelector('[data-testid="User-Name"]')!
    expect(nameEl.contains(clone.querySelector('span[style*="flex"]'))).toBe(
      true,
    )
    expect(nameEl.textContent).toContain('Japan')
  })

  it('goes after the name block in a reply, where placeFeedRow puts it', async () => {
    const article = makeTweetArticle('someone')
    const clone = await shareVia(article)

    const nameEl = clone.querySelector('[data-testid="User-Name"]')!
    expect(nameEl.textContent).not.toContain('Japan')
    expect(clone.textContent).toContain('Japan')
  })
})
