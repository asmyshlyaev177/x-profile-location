import { beforeEach, describe, expect, it } from 'vitest'
import {
  admitContributions,
  CONTRIB_HANDLE_LIMIT,
  CONTRIB_WINDOW_MS,
  MAX_TRACKED_CLIENTS,
  __resetContribLimit,
} from './contrib-limit.ts'

function handles(n: number, prefix = 'u'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${i}`)
}

beforeEach(() => {
  __resetContribLimit()
})

describe('admitContributions', () => {
  it('admits everything an honest client can produce', () => {
    // X caps an install at ~50 lookups per window, so a real client never gets
    // close to the limit. If this test ever needs changing, the limit is wrong.
    const accepted = admitContributions('c1', handles(50), 0)
    expect(accepted).toHaveLength(50)
  })

  it('caps distinct handles per window and preserves order', () => {
    const first = admitContributions('c1', handles(CONTRIB_HANDLE_LIMIT), 0)
    expect(first).toHaveLength(CONTRIB_HANDLE_LIMIT)
    expect(first[0]).toBe('u0')

    const second = admitContributions('c1', ['over1', 'over2'], 1000)
    expect(second).toEqual([])
  })

  it('lets a client re-report handles it already paid for', () => {
    admitContributions('c1', handles(CONTRIB_HANDLE_LIMIT), 0)

    // Revalidation (the server asks for it on ~5% of served rows) and genuine
    // relocations both re-send a known handle; neither may be starved by a
    // budget the client already spent on that same handle.
    const again = admitContributions('c1', ['u0', 'u1', 'fresh'], 1000)
    expect(again).toEqual(['u0', 'u1'])
  })

  it('starts a fresh budget once the window has elapsed', () => {
    admitContributions('c1', handles(CONTRIB_HANDLE_LIMIT), 0)
    expect(admitContributions('c1', ['later'], 1000)).toEqual([])

    expect(admitContributions('c1', ['later'], CONTRIB_WINDOW_MS)).toEqual([
      'later',
    ])
  })

  it('budgets each client independently', () => {
    admitContributions('c1', handles(CONTRIB_HANDLE_LIMIT), 0)
    expect(admitContributions('c1', ['x'], 0)).toEqual([])
    expect(admitContributions('c2', ['x'], 0)).toEqual(['x'])
  })

  it('partially admits a batch that straddles the limit', () => {
    admitContributions('c1', handles(CONTRIB_HANDLE_LIMIT - 2), 0)

    const accepted = admitContributions('c1', ['a', 'b', 'c', 'd'], 0)
    expect(accepted).toEqual(['a', 'b'])
  })

  // The guard exists because an attacker rotates client ids; it must not become
  // a way to exhaust the server's memory by doing exactly that.
  it('bounds how many clients it tracks', () => {
    for (let i = 0; i < MAX_TRACKED_CLIENTS + 100; i++) {
      admitContributions(`client${i}`, ['u0'], 0)
    }

    // The most recent client is still tracked and still budgeted...
    const recent = `client${MAX_TRACKED_CLIENTS + 99}`
    expect(admitContributions(recent, ['u0'], 0)).toEqual(['u0'])

    // ...while an evicted one simply starts over, which is no worse than having
    // no guard at all for that client.
    expect(admitContributions('client0', handles(1, 'z'), 0)).toEqual(['z0'])
  })

  it('keeps active clients and evicts stale ones', () => {
    admitContributions('keepme', ['u0'], 0)

    for (let i = 0; i < MAX_TRACKED_CLIENTS - 1; i++) {
      admitContributions(`filler${i}`, ['u0'], 0)
    }
    // Touching 'keepme' moves it to the back of the eviction order.
    admitContributions('keepme', ['u1'], 0)

    // Overflow the map; the eviction must take the stale fillers, not 'keepme'.
    for (let i = 0; i < 10; i++) {
      admitContributions(`late${i}`, ['u0'], 0)
    }

    // Still holding its two spent handles, so a repeat is free and the budget
    // was not silently reset.
    expect(admitContributions('keepme', ['u0', 'u1'], 0)).toEqual(['u0', 'u1'])
  })
})
