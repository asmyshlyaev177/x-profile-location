import { createStore, del, entries, get, set } from 'idb-keyval';

export interface LocationData {
  location: string | null;
  locationAccurate: boolean;
  // 'web' | 'Country Android App' | 'Country App Store' | null
  source: `${string} Android App` | `${string} App Store` | 'web' | null;
}

interface CachedEntry {
  data: LocationData;
  fetchedAt: number;
}

const CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

const locStore = createStore('x-profile-location', 'location-data');

export async function getCached(username: string): Promise<LocationData | undefined> {
  const entry = await get<CachedEntry>(username, locStore);
  if (!entry) return undefined;
  if (Date.now() - entry.fetchedAt > CACHE_TTL) return undefined;
  return entry.data;
}

export async function setCached(username: string, data: LocationData): Promise<void> {
  await set(username, { data, fetchedAt: Date.now() } satisfies CachedEntry, locStore);
}

export async function cleanupCache(): Promise<void> {
  const all = await entries<string, CachedEntry>(locStore);
  const cutoff = Date.now() - CACHE_TTL;
  await Promise.all(
    all.filter(([, entry]) => entry.fetchedAt < cutoff).map(([key]) => del(key, locStore)),
  );
}
