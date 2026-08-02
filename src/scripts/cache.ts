import { createStore, del, entries, get, set } from 'idb-keyval'
import type { AccountFacts } from './profile'

export interface LocationData {
  location: string | null
  locationAccurate: boolean
  // 'web' | 'Country Android App' | 'Country App Store' | null
  source: `${string} Android App` | `${string} App Store` | 'web' | null
  bio?: string | null
  displayName?: string | null
  // Account age, affiliate badge, verification and so on — everything X hands
  // over in responses we already receive. Kept in its own object rather than
  // spread across LocationData so that the three fields the shared cache is
  // allowed to send stay visibly separate from the ones it must never see.
  facts?: Partial<AccountFacts>
}

interface CachedEntry {
  data: LocationData
  fetchedAt: number
}

const CACHE_TTL = 30 * 24 * 60 * 60 * 1000 // 30 days

/**
 * The IndexedDB database name. Deliberately *not* renamed with the extension —
 * it is a storage key, not a brand. Changing it points every existing install
 * at an empty database and silently discards the cache they have built up,
 * which then has to be re-fetched against X's rate limit.
 *
 * `e2e/helpers.ts` opens this same name by hand; the two have to agree.
 */
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
  // `facts` is the one field merged rather than replaced. Each source knows a
  // different subset — a timeline node carries a follower count and no handle
  // history, AboutAccountQuery the reverse — so a shallow spread would let
  // whichever response arrived last erase what the other had already learned.
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
