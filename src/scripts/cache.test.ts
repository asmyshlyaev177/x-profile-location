import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock idb-keyval — the cache module calls createStore at module level,
// so the mock must be hoisted before the import resolves.
// ---------------------------------------------------------------------------
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => 'mock-store'),
  get: vi.fn(),
  set: vi.fn(),
  del: vi.fn(),
  entries: vi.fn(),
}));

import { del, entries, get, set } from 'idb-keyval';
import { cleanupCache, getCached, mergeCached, setCached } from './cache';
import type { LocationData } from './cache';

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// Convenience — a minimal valid LocationData value
const loc = (location: string): LocationData => ({
  location,
  locationAccurate: true,
  source: 'web',
});

// ---------------------------------------------------------------------------
// getCached
// ---------------------------------------------------------------------------
describe('getCached', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns undefined when the key does not exist in the store', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    expect(await getCached('alice')).toBeUndefined();
  });

  it('returns the stored data when the entry is within the 7-day TTL', async () => {
    const data = loc('Japan');
    vi.mocked(get).mockResolvedValue({ data, fetchedAt: Date.now() - 1_000 });
    expect(await getCached('alice')).toEqual(data);
  });

  it('returns undefined when the entry is exactly 1 ms past the TTL', async () => {
    const data = loc('Japan');
    vi.mocked(get).mockResolvedValue({ data, fetchedAt: Date.now() - SEVEN_DAYS_MS - 1 });
    expect(await getCached('alice')).toBeUndefined();
  });

  it('returns the data when the entry is exactly at the TTL boundary (not yet expired)', async () => {
    // fetchedAt = now - SEVEN_DAYS_MS → age === TTL → not expired
    const data = loc('Japan');
    vi.mocked(get).mockResolvedValue({ data, fetchedAt: Date.now() - SEVEN_DAYS_MS });
    expect(await getCached('alice')).toEqual(data);
  });

  it('normalises the username to lowercase before looking up', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    await getCached('ALICE');
    expect(vi.mocked(get)).toHaveBeenCalledWith('alice', expect.anything());
  });

  it('passes the correct store reference to idb-keyval get', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    await getCached('alice');
    // Second argument must be the store object returned by createStore (mocked as 'mock-store')
    expect(vi.mocked(get)).toHaveBeenCalledWith('alice', 'mock-store');
  });
});

// ---------------------------------------------------------------------------
// setCached
// ---------------------------------------------------------------------------
describe('setCached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(set).mockResolvedValue(undefined);
  });

  it('writes data to the store with a current timestamp', async () => {
    const before = Date.now();
    const data = loc('Germany');
    await setCached('bob', data);
    const after = Date.now();

    expect(vi.mocked(set)).toHaveBeenCalledOnce();
    const [key, entry] = vi.mocked(set).mock.calls[0] as [string, { data: LocationData; fetchedAt: number }];
    expect(key).toBe('bob');
    expect(entry.data).toEqual(data);
    expect(entry.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(entry.fetchedAt).toBeLessThanOrEqual(after);
  });

  it('normalises the username to lowercase before writing', async () => {
    await setCached('BOB', loc('Germany'));
    const [key] = vi.mocked(set).mock.calls[0] as [string, unknown];
    expect(key).toBe('bob');
  });

  it('passes the correct store reference to idb-keyval set', async () => {
    await setCached('bob', loc('Germany'));
    expect(vi.mocked(set).mock.calls[0][2]).toBe('mock-store');
  });

  it('stored data is retrievable via getCached within the TTL', async () => {
    const data = loc('Brazil');
    // Wire set → store in memory → get reads it back
    const store = new Map<string, unknown>();
    vi.mocked(set).mockImplementation(async (key, value) => { store.set(key as string, value); });
    vi.mocked(get).mockImplementation(async (key) => store.get(key as string));

    await setCached('carlos', data);
    const result = await getCached('carlos');
    expect(result).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// mergeCached
// ---------------------------------------------------------------------------
describe('mergeCached', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(set).mockResolvedValue(undefined);
  });

  it('creates a new entry with safe defaults when no existing entry is found', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    await mergeCached('new_user', { bio: 'hello' });

    const [key, entry] = vi.mocked(set).mock.calls[0] as [string, { data: LocationData }];
    expect(key).toBe('new_user');
    expect(entry.data).toMatchObject({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'hello',
    });
  });

  it('merges partial data into an existing entry, preserving other fields', async () => {
    const existing: LocationData = { location: 'France', locationAccurate: true, source: 'web', bio: 'old bio', displayName: 'Claire' };
    vi.mocked(get).mockResolvedValue({ data: existing, fetchedAt: Date.now() - 1_000 });

    await mergeCached('claire', { bio: 'new bio' });

    const [, entry] = vi.mocked(set).mock.calls[0] as [string, { data: LocationData }];
    expect(entry.data.bio).toBe('new bio');       // updated
    expect(entry.data.location).toBe('France');    // preserved
    expect(entry.data.displayName).toBe('Claire'); // preserved
  });

  it('overwrites multiple fields in one call', async () => {
    const existing: LocationData = { location: 'Spain', locationAccurate: true, source: 'web', bio: 'bio', displayName: 'Ana' };
    vi.mocked(get).mockResolvedValue({ data: existing, fetchedAt: Date.now() });

    await mergeCached('ana', { location: 'Portugal', displayName: 'Ana P.' });

    const [, entry] = vi.mocked(set).mock.calls[0] as [string, { data: LocationData }];
    expect(entry.data.location).toBe('Portugal');
    expect(entry.data.displayName).toBe('Ana P.');
    expect(entry.data.bio).toBe('bio'); // preserved
  });

  it('updates the fetchedAt timestamp on every merge', async () => {
    const existing: LocationData = loc('Italy');
    const oldFetchedAt = Date.now() - 3_600_000;
    vi.mocked(get).mockResolvedValue({ data: existing, fetchedAt: oldFetchedAt });

    const before = Date.now();
    await mergeCached('diana', { bio: 'hi' });
    const after = Date.now();

    const [, entry] = vi.mocked(set).mock.calls[0] as [string, { fetchedAt: number }];
    expect(entry.fetchedAt).toBeGreaterThanOrEqual(before);
    expect(entry.fetchedAt).toBeLessThanOrEqual(after);
  });

  it('normalises the username to lowercase for both get and set', async () => {
    vi.mocked(get).mockResolvedValue(undefined);
    await mergeCached('EVE', { bio: 'bio' });
    expect(vi.mocked(get).mock.calls[0][0]).toBe('eve');
    expect(vi.mocked(set).mock.calls[0][0]).toBe('eve');
  });
});

// ---------------------------------------------------------------------------
// cleanupCache
// ---------------------------------------------------------------------------
describe('cleanupCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(del).mockResolvedValue(undefined);
  });

  function makeEntry(fetchedAt: number): { data: LocationData; fetchedAt: number } {
    return { data: { location: null, locationAccurate: true, source: null }, fetchedAt };
  }

  it('does not call del when the cache is empty', async () => {
    vi.mocked(entries).mockResolvedValue([]);
    await cleanupCache();
    expect(vi.mocked(del)).not.toHaveBeenCalled();
  });

  it('does not call del when all entries are within the TTL', async () => {
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['user1', makeEntry(now - 1_000)],
      ['user2', makeEntry(now - SEVEN_DAYS_MS)], // exactly at boundary — not expired
    ]);
    await cleanupCache();
    expect(vi.mocked(del)).not.toHaveBeenCalled();
  });

  it('deletes a single expired entry', async () => {
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['olduser', makeEntry(now - SEVEN_DAYS_MS - 1)],
    ]);
    await cleanupCache();
    expect(vi.mocked(del)).toHaveBeenCalledOnce();
    expect(vi.mocked(del)).toHaveBeenCalledWith('olduser', 'mock-store');
  });

  it('deletes multiple expired entries in one pass', async () => {
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['expired1', makeEntry(now - SEVEN_DAYS_MS - 100)],
      ['expired2', makeEntry(now - SEVEN_DAYS_MS - 200)],
      ['expired3', makeEntry(now - SEVEN_DAYS_MS - 86_400_000)], // 8 days old
    ]);
    await cleanupCache();
    expect(vi.mocked(del)).toHaveBeenCalledTimes(3);
  });

  it('deletes only expired entries when fresh and stale entries are mixed', async () => {
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['expired1', makeEntry(now - SEVEN_DAYS_MS - 1)],
      ['fresh1', makeEntry(now - 1_000)],
      ['expired2', makeEntry(now - SEVEN_DAYS_MS - 999)],
      ['fresh2', makeEntry(now - 500)],
    ]);
    await cleanupCache();
    expect(vi.mocked(del)).toHaveBeenCalledTimes(2);
    expect(vi.mocked(del)).toHaveBeenCalledWith('expired1', 'mock-store');
    expect(vi.mocked(del)).toHaveBeenCalledWith('expired2', 'mock-store');
    expect(vi.mocked(del)).not.toHaveBeenCalledWith('fresh1', expect.anything());
    expect(vi.mocked(del)).not.toHaveBeenCalledWith('fresh2', expect.anything());
  });

  it('treats an entry at exactly 1 ms past the TTL as expired', async () => {
    // cutoff = Date.now() - SEVEN_DAYS_MS
    // condition: fetchedAt < cutoff  →  expired
    // fetchedAt = cutoff - 1 (= now - SEVEN_DAYS_MS - 1) → fetchedAt < cutoff → expired ✓
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['boundary', makeEntry(now - SEVEN_DAYS_MS - 1)],
    ]);
    await cleanupCache();
    expect(vi.mocked(del)).toHaveBeenCalledWith('boundary', 'mock-store');
  });

  it('passes the correct store reference to idb-keyval del', async () => {
    const now = Date.now();
    vi.mocked(entries).mockResolvedValue([
      ['victim', makeEntry(now - SEVEN_DAYS_MS - 1)],
    ]);
    await cleanupCache();
    expect(vi.mocked(del).mock.calls[0][1]).toBe('mock-store');
  });
});
