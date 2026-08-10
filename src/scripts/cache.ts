import { createStore, del, entries, get, set } from 'idb-keyval'
import type { AccountFacts } from './profile'

export interface LocationData {
  location: string | null
  locationAccurate: boolean
  source: `${string} Android App` | `${string} App Store` | 'web' | null
  bio?: string | null
  displayName?: string | null
  // Nested rather than spread across LocationData, so the three fields the
  // shared cache may send stay visibly apart from the ones it must never see.
  facts?: Partial<AccountFacts>
}

interface CachedEntry {
  data: LocationData
  fetchedAt: number
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

// A storage key, not a brand: renaming it points every install at an empty
// database. `e2e/helpers.ts` opens the same name by hand and must agree.
const locStore = createStore('x-profile-location', 'location-data')

export async function getCached(
  username: string,
): Promise<LocationData | undefined> {
  const key = username.toLowerCase()
  const entry = await get<CachedEntry>(key, locStore)
  if (!entry) return undefined
  if (Date.now() - entry.fetchedAt > CACHE_TTL) return undefined
  return entry.data
}

export async function setCached(
  username: string,
  data: LocationData,
): Promise<void> {
  const key = username.toLowerCase()
  await set(
    key,
    { data, fetchedAt: Date.now() } satisfies CachedEntry,
    locStore,
  )
}

export async function mergeCached(
  username: string,
  partial: Partial<LocationData>,
): Promise<void> {
  const key = username.toLowerCase()
  const existing = await get<CachedEntry>(key, locStore)
  const base: LocationData = existing?.data ?? {
    location: null,
    locationAccurate: true,
    source: null,
  }
  const data: LocationData = { ...base, ...partial }
  if (base.facts || partial.facts) {
    data.facts = { ...base.facts, ...partial.facts }
  }
  await set(key, { data, fetchedAt: Date.now() }, locStore)
}

export async function clearAllCache(): Promise<void> {
  const all = await entries<string, CachedEntry>(locStore)
  await Promise.all(all.map(([key]) => del(key, locStore)))
}

export async function cleanupCache(): Promise<void> {
  const all = await entries<string, CachedEntry>(locStore)
  const cutoff = Date.now() - CACHE_TTL
  await Promise.all(
    all
      .filter(([, entry]) => entry.fetchedAt < cutoff)
      .map(([key]) => del(key, locStore)),
  )
}
