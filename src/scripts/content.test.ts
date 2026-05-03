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

import { fetchLocationData, setApiHeaders } from './content';

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
