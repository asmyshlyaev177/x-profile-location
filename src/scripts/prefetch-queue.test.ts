import { describe, expect, it } from 'vitest'
import {
  BackgroundPrefetcher,
  type PrefetcherOptions,
  type RateState,
} from './prefetch-queue'

// ---------------------------------------------------------------------------
// Test harness: a prefetcher whose clock, rate-limit snapshot, fetch and
// "already known" checks are all controllable, and whose timer loop is driven
// manually (setTimer just queues callbacks) so runOnce() can be exercised
// deterministically without real time passing.
// ---------------------------------------------------------------------------
function harness(opts: PrefetcherOptions = {}) {
  const fetched: string[] = []
  const known = new Set<string>()
  let now = 0
  const rate: RateState = {
    remaining: Number.POSITIVE_INFINITY,
    limit: 50,
    resetAt: 0,
  }
  const timers: Array<() => void> = []

  const p = new BackgroundPrefetcher(
    {
      // Simulate the real header update: a live-budget run decrements remaining.
      fetch: async (u) => {
        fetched.push(u)
        if (Number.isFinite(rate.remaining)) rate.remaining -= 1
      },
      isKnown: (u) => known.has(u.toLowerCase()),
      rateState: () => rate,
      now: () => now,
      setTimer: (fn) => {
        timers.push(fn)
        return timers.length - 1
      },
      clearTimer: () => {},
    },
    opts,
  )

  return {
    p,
    fetched,
    known,
    rate,
    setNow: (n: number) => {
      now = n
    },
    // Drive the internal start()/tick() loop by flushing queued timers.
    async drain(max = 100) {
      let i = 0
      while (timers.length && i++ < max) {
        const fn = timers.shift()!
        fn()
        await new Promise((r) => setTimeout(r, 0))
      }
    },
  }
}

// ---------------------------------------------------------------------------
// enqueue / priority
// ---------------------------------------------------------------------------
describe('enqueue', () => {
  it('dedups by case-insensitive username', () => {
    const { p } = harness()
    p.enqueue([
      { userName: 'alice', followers: 1 },
      { userName: 'Alice', followers: 2 },
      { userName: 'ALICE', followers: 3 },
    ])
    expect(p.__state().queueLength).toBe(1)
  })

  it('orders the queue most-followed first', () => {
    const { p } = harness()
    p.enqueue([
      { userName: 'small', followers: 10 },
      { userName: 'big', followers: 9000 },
      { userName: 'mid', followers: 500 },
    ])
    expect(p.__state().order).toEqual(['big', 'mid', 'small'])
  })

  it('treats a missing/NaN followers count as 0', () => {
    const { p } = harness()
    p.enqueue([
      { userName: 'known', followers: 100 },
      { userName: 'unknown', followers: NaN },
    ])
    expect(p.__state().order).toEqual(['known', 'unknown'])
  })

  it('caps the queue at maxQueue, dropping the least-followed', () => {
    const { p } = harness({ maxQueue: 2 })
    p.enqueue([
      { userName: 'a', followers: 1 },
      { userName: 'b', followers: 2 },
      { userName: 'c', followers: 3 },
    ])
    expect(p.__state().order).toEqual(['c', 'b'])
  })
})

// ---------------------------------------------------------------------------
// runOnce — priority, budget, known-skip, pause
// ---------------------------------------------------------------------------
describe('runOnce', () => {
  it('fetches candidates in follower order', async () => {
    const { p, fetched } = harness()
    p.enqueue([
      { userName: 'small', followers: 10 },
      { userName: 'big', followers: 9000 },
      { userName: 'mid', followers: 500 },
    ])
    expect(await p.runOnce()).toBe('fetched')
    expect(await p.runOnce()).toBe('fetched')
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['big', 'mid', 'small'])
  })

  it('reports empty when nothing is queued', async () => {
    const { p } = harness()
    expect(await p.runOnce()).toBe('empty')
  })

  it('skips already-known accounts without spending budget', async () => {
    const { p, fetched, known } = harness()
    known.add('bob')
    p.enqueue([
      { userName: 'alice', followers: 100 },
      { userName: 'bob', followers: 9000 }, // highest, but known
    ])
    // bob is taken first (highest) but skipped; alice is fetched instead.
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['alice'])
    expect(p.__state().fetchedCount).toBe(1) // only the real fetch counted
  })

  it('pauses on a hard rate-limit backoff', async () => {
    const { p, fetched, rate, setNow } = harness()
    setNow(1000)
    rate.resetAt = 5000
    p.enqueue([{ userName: 'a', followers: 1 }])
    expect(await p.runOnce()).toBe('paused')
    expect(fetched).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Budget = half the window
// ---------------------------------------------------------------------------
describe('budget', () => {
  it('spends at most half of the live remaining window', async () => {
    // limit 4, half reserved for the user → prefetcher may use 2.
    const { p, fetched, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 4
    rate.remaining = 4 // live value observed
    p.enqueue([
      { userName: 'a', followers: 4 },
      { userName: 'b', followers: 3 },
      { userName: 'c', followers: 2 },
      { userName: 'd', followers: 1 },
    ])
    expect(await p.runOnce()).toBe('fetched') // remaining 4→3
    expect(await p.runOnce()).toBe('fetched') // remaining 3→2
    expect(await p.runOnce()).toBe('budget') // remaining 2 == reserved → stop
    expect(fetched).toEqual(['a', 'b'])
  })

  it('stops immediately when the live remaining is already at the reserve', async () => {
    const { p, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 4
    rate.remaining = 2 // user already consumed down to the reserved half
    p.enqueue([{ userName: 'a', followers: 1 }])
    expect(await p.runOnce()).toBe('budget')
  })

  it('resumes after the window refills the remaining budget', async () => {
    const { p, fetched, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 4
    rate.remaining = 4
    p.enqueue([
      { userName: 'a', followers: 4 },
      { userName: 'b', followers: 3 },
      { userName: 'c', followers: 2 },
    ])
    expect(await p.runOnce()).toBe('fetched') // 4→3
    expect(await p.runOnce()).toBe('fetched') // 3→2
    expect(await p.runOnce()).toBe('budget')
    expect(fetched).toEqual(['a', 'b'])

    // The content script restores remaining to the limit when X's window rolls.
    rate.remaining = 4
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['a', 'b', 'c'])
  })

  it('honors a custom reserveFraction', async () => {
    // limit 10, prefetcher may use 30% = 3 before reserving the rest.
    const { p, rate } = harness({ reserveFraction: 0.3 })
    rate.limit = 10
    rate.remaining = 10
    for (let i = 0; i < 5; i++) {
      p.enqueue([{ userName: `u${i}`, followers: 5 - i }])
    }
    let count = 0
    for (let i = 0; i < 5; i++) {
      if ((await p.runOnce()) === 'fetched') count++
    }
    expect(count).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// start() / stop() loop wiring
// ---------------------------------------------------------------------------
describe('start/stop loop', () => {
  it('drains the queue in priority order when started', async () => {
    const h = harness()
    h.p.enqueue([
      { userName: 'small', followers: 1 },
      { userName: 'big', followers: 999 },
      { userName: 'mid', followers: 50 },
    ])
    h.p.start()
    await h.drain()
    expect(h.fetched).toEqual(['big', 'mid', 'small'])
    expect(h.p.isRunning()).toBe(true)
    h.p.stop()
    expect(h.p.isRunning()).toBe(false)
  })

  it('does nothing after stop()', async () => {
    const h = harness()
    h.p.enqueue([{ userName: 'a', followers: 1 }])
    h.p.start()
    h.p.stop()
    await h.drain()
    expect(h.fetched).toEqual([])
  })

  it('keeps running (reschedules) while out of budget instead of stopping', async () => {
    const h = harness({ reserveFraction: 0.5 })
    h.rate.limit = 4
    h.rate.remaining = 2 // already at the reserved half → no budget
    h.rate.windowResetAt = 999_999 // reschedule against the window reset
    h.p.enqueue([{ userName: 'a', followers: 1 }])
    h.p.start()
    await h.drain(3)
    expect(h.fetched).toEqual([]) // never fetched while starved
    expect(h.p.isRunning()).toBe(true) // still alive, waiting to retry
    h.p.stop()
  })

  it('waits out a hard backoff without fetching', async () => {
    const h = harness()
    h.setNow(1000)
    h.rate.resetAt = 5000 // 429 backoff in effect
    h.p.enqueue([{ userName: 'a', followers: 1 }])
    h.p.start()
    await h.drain(3)
    expect(h.fetched).toEqual([])
    expect(h.p.isRunning()).toBe(true)
    h.p.stop()
  })
})
