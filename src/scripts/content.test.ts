import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Hoist chrome global — must run before module-level code in content.tsx
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  (globalThis as unknown as Record<string, unknown>).chrome = {
    storage: {
      local: { get: vi.fn().mockResolvedValue({}) },
      onChanged: { addListener: vi.fn() },
    },
  };
});

vi.mock('./cache', () => ({
  getCached: vi.fn().mockResolvedValue(undefined),
  setCached: vi.fn().mockResolvedValue(undefined),
  mergeCached: vi.fn().mockResolvedValue(undefined),
  cleanupCache: vi.fn().mockResolvedValue(undefined),
}));

import { fetchLocationData, setApiHeaders, __testResetState } from './content';

// ---------------------------------------------------------------------------
// fetchLocationData — API request variables
// ---------------------------------------------------------------------------
describe('fetchLocationData', () => {
  const HEADERS = {
    authorization: 'Bearer token123',
    'x-csrf-token': 'csrf123',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    setApiHeaders(HEADERS);
    __testResetState();
  });

  it('sends screenName (not userName) as the GraphQL variable key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ data: { user_result_by_screen_name: { result: { about_profile: null } } } }),
        { status: 200 },
      ),
    );

    await fetchLocationData('elonmusk');

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url] = fetchSpy.mock.calls[0] as [string, ...unknown[]];
    const params = new URLSearchParams(new URL(url).search);
    const variables = JSON.parse(params.get('variables')!);
    expect(variables).toHaveProperty('screenName', 'elonmusk');
    expect(variables).not.toHaveProperty('userName');
  });

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
    );

    const data = await fetchLocationData('jack');

    expect(data).toMatchObject({ location: 'United States', source: 'web', locationAccurate: true });
  });

  it('returns null without making a request when apiHeaders are not set', async () => {
    setApiHeaders(null);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const data = await fetchLocationData('someuser');

    expect(data).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns null on 429 response', async () => {
    const resetTime = Math.floor(Date.now() / 1000) + 3600;
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    );

    const data = await fetchLocationData('ratelimiteduser');

    expect(data).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fetchLocationData — cache and session behaviour
// ---------------------------------------------------------------------------

import { getCached, mergeCached } from './cache';

describe('fetchLocationData — cache hit', () => {
  const HEADERS = { authorization: 'Bearer token123', 'x-csrf-token': 'csrf123' };

  beforeEach(() => {
    vi.clearAllMocks();
    setApiHeaders(HEADERS);
    __testResetState();
  });

  it('returns cached data without making a network request when location is present', async () => {
    const cached = { location: 'Japan', locationAccurate: true, source: 'web' as const, bio: null };
    vi.mocked(getCached).mockResolvedValue(cached);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const data = await fetchLocationData('cacheduser');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(data).toMatchObject({ location: 'Japan' });
  });

  it('returns cached data without a network request when source is present', async () => {
    const cached = { location: null, locationAccurate: true, source: 'India Android App' as `${string} Android App`, bio: null };
    vi.mocked(getCached).mockResolvedValue(cached);
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const data = await fetchLocationData('appuser');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(data?.source).toBe('India Android App');
  });
});

describe('fetchLocationData — checkedThisSession dedup', () => {
  const HEADERS = { authorization: 'Bearer token123', 'x-csrf-token': 'csrf123' };

  beforeEach(() => {
    vi.clearAllMocks();
    setApiHeaders(HEADERS);
    __testResetState();
  });

  it('skips network on the second call for the same user after a successful fetch', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: { account_based_in: 'Germany', location_accurate: true, source: 'web' },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    await fetchLocationData('sessionuser');
    // Second call — cache returns undefined but checkedThisSession should short-circuit.
    await fetchLocationData('sessionuser');

    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});

describe('fetchLocationData — concurrent deduplication', () => {
  const HEADERS = { authorization: 'Bearer token123', 'x-csrf-token': 'csrf123' };

  beforeEach(() => {
    vi.clearAllMocks();
    setApiHeaders(HEADERS);
    __testResetState();
  });

  it('concurrent calls for the same user share one in-flight fetch', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined);
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: { account_based_in: 'Brazil', location_accurate: true, source: 'web' },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    // Start both concurrently without awaiting between them.
    const [r1, r2] = await Promise.all([
      fetchLocationData('concurrentuser'),
      fetchLocationData('concurrentuser'),
    ]);

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(r1?.location).toBe('Brazil');
    expect(r2?.location).toBe('Brazil');
  });
});

describe('fetchLocationData — error responses', () => {
  const HEADERS = { authorization: 'Bearer token123', 'x-csrf-token': 'csrf123' };

  beforeEach(() => {
    vi.clearAllMocks();
    setApiHeaders(HEADERS);
    __testResetState();
  });

  it('returns null on a non-200, non-429 response', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 403 }));

    const data = await fetchLocationData('forbiddenuser');

    expect(data).toBeNull();
  });

  it('returns stored cache data when about_profile is null in the response', async () => {
    const cached = { location: null, locationAccurate: true, source: null, bio: 'cached bio', displayName: null };
    vi.mocked(getCached).mockResolvedValue(cached);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { user_result_by_screen_name: { result: { about_profile: null } } },
        }),
        { status: 200 },
      ),
    );

    const data = await fetchLocationData('noprofileuser');

    expect(data).toEqual(cached);
  });

  it('merges bio from stored cache into the returned location data', async () => {
    const cached = { location: null, locationAccurate: true, source: null, bio: 'existing bio' };
    vi.mocked(getCached).mockResolvedValue(cached);
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          data: {
            user_result_by_screen_name: {
              result: {
                about_profile: { account_based_in: 'Canada', location_accurate: true, source: 'web' },
              },
            },
          },
        }),
        { status: 200 },
      ),
    );

    const data = await fetchLocationData('biomergeuser');

    expect(data?.location).toBe('Canada');
    expect(data?.bio).toBe('existing bio');
    expect(vi.mocked(mergeCached)).toHaveBeenCalledWith(
      'biomergeuser',
      expect.objectContaining({ location: 'Canada', bio: 'existing bio' }),
    );
  });

  it('rate limit blocks fetch and returns null immediately without network call', async () => {
    vi.mocked(getCached).mockResolvedValue(undefined);

    // First call triggers 429, setting rateLimitResetAt to a future time.
    const resetTime = Math.floor(Date.now() / 1000) + 3600;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    );
    await fetchLocationData('rl_user_a');
    expect(fetchSpy).toHaveBeenCalledOnce();

    // Second call with a different user should be blocked by rate limit — no fetch.
    __testResetState(); // clears checkedThisSession but NOT rateLimitResetAt
    // To keep rateLimitResetAt we need to call setApiHeaders again (reset clears only session).
    setApiHeaders(HEADERS);
    // Re-apply the 429 state by calling through the 429 path again isn't ideal,
    // so do it directly via a second 429-hit first, then verify third is blocked.
    fetchSpy.mockResolvedValueOnce(
      new Response(null, {
        status: 429,
        headers: { 'x-rate-limit-reset': String(resetTime) },
      }),
    );
    await fetchLocationData('rl_user_b');

    // Third call — rate limit is still active, should not hit network.
    const countBefore = fetchSpy.mock.calls.length;
    await fetchLocationData('rl_user_c');
    expect(fetchSpy.mock.calls.length).toBe(countBefore);
  });
});
