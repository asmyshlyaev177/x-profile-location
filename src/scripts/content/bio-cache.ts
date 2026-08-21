// In memory so highlighting reads synchronously rather than racing mergeCached.
// A fast path only — every bio also lands in IDB, and eviction falls back to it.

import { getCached } from '../cache/cache'
import type { AccountFacts } from '../profile'

const BIO_CACHE_CAP = 1000

export interface ProfileInfo {
  bio: string | null
  displayName: string | null
  facts: Partial<AccountFacts>
}

const bioCache = new Map<string, ProfileInfo>()

export function rememberBio(
  userName: string,
  bio: string | null,
  displayName: string | null,
  facts: Partial<AccountFacts> = {},
): void {
  const key = userName.toLowerCase()
  const prev = bioCache.get(key)
  bioCache.delete(key) // re-insert to refresh LRU order
  bioCache.set(key, {
    bio: bio ?? prev?.bio ?? null,
    displayName: displayName ?? prev?.displayName ?? null,
    // Merged for the same reason mergeCached merges it: each sighting of an
    // account knows a different subset.
    facts: { ...prev?.facts, ...facts },
  })
  if (bioCache.size > BIO_CACHE_CAP) {
    const oldest = bioCache.keys().next().value
    if (oldest !== undefined) bioCache.delete(oldest)
  }
}

export async function getBioInfo(userName: string): Promise<ProfileInfo> {
  const mem = bioCache.get(userName.toLowerCase())
  if (mem) return mem
  const data = await getCached(userName)
  return {
    bio: data?.bio ?? null,
    displayName: data?.displayName ?? null,
    facts: data?.facts ?? {},
  }
}

export function forgetBios(): void {
  bioCache.clear()
}
