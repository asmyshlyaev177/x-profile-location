// A real IndexedDB, unlike cache.test.ts: a merge's read and write are only
// worth testing against the store that decides when they run.
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearAllCache, getCached, mergeCached, setCached } from './cache'
import type { LocationData } from './cache'

const DAY_MS = 24 * 60 * 60 * 1000

const loc = (location: string): LocationData => ({
  location,
  locationAccurate: true,
  source: 'web',
})

beforeEach(() => clearAllCache())
afterEach(() => vi.useRealTimers())

describe('mergeCached', () => {
  // The bio comes with TweetDetail and the location with the lookup, often at
  // once. As a read and a separate write, each merge read the other's absence
  // and the second write erased the first.
  it('keeps both of two merges into one account started at once', async () => {
    await Promise.all([
      mergeCached('both', { bio: 'a bio' }),
      mergeCached('both', { location: 'Germany', source: 'web' }),
    ])

    expect(await getCached('both')).toMatchObject({
      bio: 'a bio',
      location: 'Germany',
    })
  })

  it('creates a new entry with safe defaults when none exists', async () => {
    await mergeCached('new_user', { bio: 'hello' })

    expect(await getCached('new_user')).toEqual({
      location: null,
      locationAccurate: true,
      source: null,
      bio: 'hello',
    })
  })

  it('merges facts instead of replacing them, so each source keeps what it knew', async () => {
    // The timeline gave us the relationship; AboutAccountQuery gives handle
    // history. A shallow spread would drop whichever arrived first.
    await setCached('artemis', {
      ...loc('Japan'),
      facts: { blockedBy: true, createdAt: 1_700_000_000_000 },
    })

    await mergeCached('artemis', { facts: { handleChanges: 3 } })

    expect((await getCached('artemis'))?.facts).toEqual({
      blockedBy: true,
      createdAt: 1_700_000_000_000,
      handleChanges: 3,
    })
  })

  it('leaves facts absent entirely when neither side has any', async () => {
    await mergeCached('nobody', { bio: 'hi' })
    expect(await getCached('nobody')).not.toHaveProperty('facts')
  })

  it('merges into an existing entry, keeping the fields it does not name', async () => {
    await setCached('claire', {
      ...loc('France'),
      bio: 'old bio',
      displayName: 'Claire',
    })

    await mergeCached('claire', { bio: 'new bio', location: 'Belgium' })

    expect(await getCached('claire')).toMatchObject({
      bio: 'new bio',
      location: 'Belgium',
      displayName: 'Claire',
    })
  })

  it('restarts the entry clock on every merge', async () => {
    // Date only: the store's own scheduling must keep running.
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(0)
    await setCached('diana', loc('Italy'))

    vi.setSystemTime(29 * DAY_MS)
    await mergeCached('diana', { bio: 'hi' })

    // Past the 30-day TTL of the first write, inside that of the merge.
    vi.setSystemTime(31 * DAY_MS)
    expect(await getCached('diana')).toMatchObject({ location: 'Italy' })
  })

  it('stores under the lowercased username', async () => {
    await mergeCached('EVE', { bio: 'bio' })
    expect(await getCached('eve')).toMatchObject({ bio: 'bio' })
  })
})
