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
  // Every delay scheduleTick() asked for, in order — the pacing under test.
  const delays: number[] = []

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
      setTimer: (fn, ms) => {
        timers.push(fn)
        delays.push(ms)
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
    delays,
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
      { userName: 'alice' },
      { userName: 'Alice' },
      { userName: 'ALICE' },
    ])
    expect(p.__state().queueLength).toBe(1)
  })

  it('keeps candidates in the order they appeared on the page', () => {
    const { p } = harness()
    p.enqueue([
      { userName: 'first' },
      { userName: 'second' },
      { userName: 'third' },
    ])
    expect(p.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('appends a later batch behind the earlier one', () => {
    const { p } = harness()
    p.enqueue([{ userName: 'first' }, { userName: 'second' }])
    p.enqueue([{ userName: 'third' }]) // the user scrolled further down
    expect(p.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('leaves a repeat sighting where it first appeared', () => {
    const { p } = harness()
    p.enqueue([{ userName: 'first' }, { userName: 'second' }])
    p.enqueue([{ userName: 'First' }, { userName: 'third' }])
    expect(p.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('caps the queue at maxQueue, dropping the latest to appear', () => {
    const { p } = harness({ maxQueue: 2 })
    p.enqueue([{ userName: 'a' }, { userName: 'b' }, { userName: 'c' }])
    expect(p.__state().order).toEqual(['a', 'b'])
  })
})

// ---------------------------------------------------------------------------
// Two queues: the feed ('high') before a thread's replies ('low')
// ---------------------------------------------------------------------------
describe('priority queues', () => {
  it('treats an unlabelled candidate as high priority', () => {
    const { p } = harness()
    p.enqueue([{ userName: 'plain' }])
    expect(p.__state().highOrder).toEqual(['plain'])
    expect(p.__state().lowOrder).toEqual([])
  })

  it('drains every high candidate before the first low one', async () => {
    const { p, fetched } = harness()
    p.enqueue([
      // The reply author came first and still goes last.
      { userName: 'reply', priority: 'low' },
      { userName: 'feed-1', priority: 'high' },
      { userName: 'feed-2', priority: 'high' },
    ])
    expect(p.__state().order).toEqual(['feed-1', 'feed-2', 'reply'])

    for (let i = 0; i < 3; i++) await p.runOnce()
    expect(fetched).toEqual(['feed-1', 'feed-2', 'reply'])
  })

  it('keeps appearance order within each queue', () => {
    const { p } = harness()
    p.enqueue([
      { userName: 'r1', priority: 'low' },
      { userName: 'f1', priority: 'high' },
      { userName: 'r2', priority: 'low' },
      { userName: 'f2', priority: 'high' },
    ])
    expect(p.__state().highOrder).toEqual(['f1', 'f2'])
    expect(p.__state().lowOrder).toEqual(['r1', 'r2'])
  })

  it('promotes a reply author who then turns up in the feed', () => {
    const { p } = harness()
    p.enqueue([{ userName: 'Both', priority: 'low' }])
    p.enqueue([{ userName: 'feed-1', priority: 'high' }])
    expect(p.__state().lowOrder).toEqual(['Both'])

    // Promoted to the back of the feed queue: that is where it was seen.
    p.enqueue([{ userName: 'both', priority: 'high' }])
    expect(p.__state().highOrder).toEqual(['feed-1', 'both'])
    expect(p.__state().lowOrder).toEqual([]) // moved, not copied
    expect(p.__state().queueLength).toBe(2)
  })

  it('never demotes: a feed account seen again in a thread stays high', () => {
    const { p } = harness()
    p.enqueue([{ userName: 'feed', priority: 'high' }])
    p.enqueue([{ userName: 'feed', priority: 'low' }])
    expect(p.__state().highOrder).toEqual(['feed'])
    expect(p.__state().lowOrder).toEqual([])
  })

  it('sheds low-priority overflow first when over maxQueue', () => {
    const { p } = harness({ maxQueue: 3 })
    p.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'f2', priority: 'high' },
      { userName: 'r1', priority: 'low' },
      { userName: 'r2', priority: 'low' },
      { userName: 'r3', priority: 'low' },
    ])
    // Both feed accounts survive; only the first reply still fits.
    expect(p.__state().highOrder).toEqual(['f1', 'f2'])
    expect(p.__state().lowOrder).toEqual(['r1'])
  })

  it('falls back to trimming the high queue once low is empty', () => {
    const { p } = harness({ maxQueue: 2 })
    p.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'f2', priority: 'high' },
      { userName: 'f3', priority: 'high' },
      { userName: 'r1', priority: 'low' },
    ])
    expect(p.__state().highOrder).toEqual(['f1', 'f2'])
    expect(p.__state().lowOrder).toEqual([])
  })

  it('re-queues a dropped name (its slot in `queued` is freed too)', async () => {
    const { p } = harness({ maxQueue: 1 })
    p.enqueue([{ userName: 'kept' }, { userName: 'dropped' }])
    expect(p.__state().order).toEqual(['kept'])

    await p.runOnce() // 'kept' goes out, leaving room again
    // Nothing lingers in the dedup map, so 'dropped' can come back next batch.
    p.enqueue([{ userName: 'dropped' }])
    expect(p.__state().order).toEqual(['dropped'])
  })
})

// ---------------------------------------------------------------------------
// runOnce — priority, budget, known-skip, pause
// ---------------------------------------------------------------------------
describe('runOnce', () => {
  it('fetches candidates in the order they were queued', async () => {
    const { p, fetched } = harness()
    p.enqueue([
      { userName: 'first' },
      { userName: 'second' },
      { userName: 'third' },
    ])
    expect(await p.runOnce()).toBe('fetched')
    expect(await p.runOnce()).toBe('fetched')
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['first', 'second', 'third'])
  })

  it('reports empty when nothing is queued', async () => {
    const { p } = harness()
    expect(await p.runOnce()).toBe('empty')
  })

  it('skips already-known accounts without spending budget', async () => {
    const { p, fetched, known } = harness()
    known.add('bob')
    p.enqueue([
      { userName: 'bob' }, // first in line, but already known
      { userName: 'alice' },
    ])
    // bob is taken first and skipped; alice is fetched in the same run.
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['alice'])
    expect(p.__state().fetchedCount).toBe(1) // only the real fetch counted
  })

  it('pauses on a hard rate-limit backoff', async () => {
    const { p, fetched, rate, setNow } = harness()
    setNow(1000)
    rate.resetAt = 5000
    p.enqueue([{ userName: 'a' }])
    expect(await p.runOnce()).toBe('paused')
    expect(fetched).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Budget = the prefetcher's share of the window (reserveFraction)
// ---------------------------------------------------------------------------
describe('budget', () => {
  it('spends at most its share of the live remaining window', async () => {
    // limit 4, half reserved for the user → prefetcher may use 2.
    const { p, fetched, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 4
    rate.remaining = 4 // live value observed
    p.enqueue([
      { userName: 'a' },
      { userName: 'b' },
      { userName: 'c' },
      { userName: 'd' },
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
    p.enqueue([{ userName: 'a' }])
    expect(await p.runOnce()).toBe('budget')
  })

  it('resumes after the window refills the remaining budget', async () => {
    const { p, fetched, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 4
    rate.remaining = 4
    p.enqueue([{ userName: 'a' }, { userName: 'b' }, { userName: 'c' }])
    expect(await p.runOnce()).toBe('fetched') // 4→3
    expect(await p.runOnce()).toBe('fetched') // 3→2
    expect(await p.runOnce()).toBe('budget')
    expect(fetched).toEqual(['a', 'b'])

    // The content script restores remaining to the limit when X's window rolls.
    rate.remaining = 4
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toEqual(['a', 'b', 'c'])
  })

  it('applies a reserveFraction changed at runtime (options page)', async () => {
    const { p, fetched, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 10
    rate.remaining = 6
    for (let i = 0; i < 4; i++) p.enqueue([{ userName: `u${i}` }])

    expect(await p.runOnce()).toBe('fetched') // 6 → 5, the last of the 0.5 share
    expect(await p.runOnce()).toBe('budget')

    p.setReserveFraction(0.9) // user widened it: reserve 1 instead of 5
    expect(await p.runOnce()).toBe('fetched')
    expect(await p.runOnce()).toBe('fetched')
    expect(fetched).toHaveLength(3)
  })

  it('ignores a non-finite reserveFraction and clamps the rest', async () => {
    const { p, rate } = harness({ reserveFraction: 0.5 })
    rate.limit = 10
    rate.remaining = 10

    p.setReserveFraction(Number.NaN)
    expect(p.budget()).toBe(5) // unchanged
    p.setReserveFraction(50) // 5000%, clamped to the whole window
    expect(p.budget()).toBe(10)
  })

  it('honors a custom reserveFraction', async () => {
    // limit 10, prefetcher may use 30% = 3 before reserving the rest.
    const { p, rate } = harness({ reserveFraction: 0.3 })
    rate.limit = 10
    rate.remaining = 10
    for (let i = 0; i < 5; i++) {
      p.enqueue([{ userName: `u${i}` }])
    }
    let count = 0
    for (let i = 0; i < 5; i++) {
      if ((await p.runOnce()) === 'fetched') count++
    }
    expect(count).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// Pacing — the budget is spread over the time left in the window
// ---------------------------------------------------------------------------
describe('nextDelayMs', () => {
  // Real-world shape at the shipped defaults: 50/15min with a 0.7 share → 35
  // background lookups to spread over 15 minutes ≈ one every 26s, with the last
  // 15 of the window held back for the user's hovers.
  function paced(opts: PrefetcherOptions = {}) {
    const h = harness(opts)
    h.setNow(1_000_000)
    h.rate.limit = 50
    h.rate.remaining = 50
    h.rate.windowResetAt = 1_000_000 + 15 * 60 * 1000
    return h
  }

  it('divides the remaining window by the remaining budget', () => {
    const { p } = paced()
    expect(p.nextDelayMs()).toBe((15 * 60 * 1000) / 35)
  })

  it('assumes a full window when X has not told us the reset time yet', () => {
    const { p, rate } = paced()
    rate.windowResetAt = 0
    expect(p.nextDelayMs()).toBe((15 * 60 * 1000) / 35)
  })

  it('stretches the gap as manual hovers eat the shared budget', () => {
    const { p, rate } = paced()
    rate.remaining = 40 // user spent 10 → 25 left of the prefetch share
    expect(p.nextDelayMs()).toBe((15 * 60 * 1000) / 25)
  })

  it('shrinks the gap as the window winds down', () => {
    const { p, setNow } = paced()
    setNow(1_000_000 + 13 * 60 * 1000) // 2 minutes left, budget still 35
    expect(p.nextDelayMs()).toBe(120_000 / 35)
  })

  it('never paces faster than minSpacingMs', () => {
    const { p, setNow } = paced({ minSpacingMs: 1500 })
    setNow(1_000_000 + 15 * 60 * 1000 - 10_000) // 10s left, budget 35 → 286ms
    expect(p.nextDelayMs()).toBe(1500)
  })

  it('never waits longer than maxSpacingMs while it still has budget', () => {
    const { p, rate } = paced({ maxSpacingMs: 120_000 })
    rate.remaining = 16 // budget 1; an even spread would park for ~15 minutes
    expect(p.nextDelayMs()).toBe(120_000)
  })

  it('waits for the window to roll over when out of budget', () => {
    const { p, rate } = paced()
    rate.remaining = 15 // exactly the user's reserved share → budget 0
    expect(p.nextDelayMs()).toBe(15 * 60 * 1000 + 500)
  })

  it('waits out a hard backoff before anything else', () => {
    const { p, rate } = paced()
    rate.resetAt = 1_000_000 + 30_000
    expect(p.nextDelayMs()).toBe(30_500)
  })

  // 'instant' is the opt-out: same share, spent as fast as the floor allows.
  describe("pacing: 'instant'", () => {
    it('uses the minimum gap regardless of how much window is left', () => {
      const { p } = paced({ pacing: 'instant', minSpacingMs: 1500 })
      expect(p.nextDelayMs()).toBe(1500)
    })

    it('still stops at the share and waits for the window', () => {
      const { p, rate } = paced({ pacing: 'instant' })
      rate.remaining = 15 // reserved share reached
      expect(p.nextDelayMs()).toBe(15 * 60 * 1000 + 500)
    })

    it('still yields to a hard backoff', () => {
      const { p, rate } = paced({ pacing: 'instant' })
      rate.resetAt = 1_000_000 + 30_000
      expect(p.nextDelayMs()).toBe(30_500)
    })

    it('switches pacing live, both ways', () => {
      const { p } = paced({ minSpacingMs: 1500 })
      expect(p.nextDelayMs()).toBe((15 * 60 * 1000) / 35)
      p.setPacing('instant')
      expect(p.nextDelayMs()).toBe(1500)
      p.setPacing('spread')
      expect(p.nextDelayMs()).toBe((15 * 60 * 1000) / 35)
    })
  })
})

describe('paced loop', () => {
  function paced(opts: PrefetcherOptions = {}) {
    const h = harness(opts)
    h.setNow(1_000_000)
    h.rate.limit = 50
    h.rate.remaining = 50
    h.rate.windowResetAt = 1_000_000 + 15 * 60 * 1000
    return h
  }

  it('fetches the first candidate immediately, then spaces the rest out', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }, { userName: 'b' }])
    h.p.start()
    expect(h.delays[0]).toBe(0) // no reason to make the user wait for the first
    await h.drain(1)
    expect(h.fetched).toEqual(['a'])
    // 49 remaining → budget 34, over the (unchanged clock) full window.
    expect(h.delays[1]).toBe((15 * 60 * 1000) / 34)
    h.p.stop()
  })

  it('does not let a fresh batch of candidates jump the pace', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }])
    h.p.start()
    await h.drain() // fetches 'a', then goes idle on an empty queue
    expect(h.fetched).toEqual(['a'])

    const before = h.delays.length
    h.p.enqueue([{ userName: 'b' }]) // e.g. the user scrolled
    expect(h.delays[before]).toBe((15 * 60 * 1000) / 34) // paced, not 0
    h.p.stop()
  })

  // The options page can change these mid-window; a pending sleep computed
  // under the old setting has to be re-timed, or the change only takes hold
  // after a gap that can be minutes long.
  it('re-times the pending lookup when the share widens', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }, { userName: 'b' }])
    h.p.start()
    await h.drain(1) // fetched 'a'; next scheduled for the 70% share

    const before = h.delays.length
    h.p.setReserveFraction(0.9) // 49 remaining, reserve 5 → budget 44
    expect(h.delays[before]).toBe((15 * 60 * 1000) / 44)
    h.p.stop()
  })

  it('re-times the pending lookup when pacing switches to instant', async () => {
    const h = paced({ minSpacingMs: 1500 })
    h.p.enqueue([{ userName: 'a' }, { userName: 'b' }])
    h.p.start()
    await h.drain(1)

    const before = h.delays.length
    h.p.setPacing('instant')
    expect(h.delays[before]).toBe(1500)
    h.p.stop()
  })

  it('schedules nothing when a setting changes while stopped', () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }])
    h.p.setReserveFraction(0.9)
    h.p.setPacing('instant')
    expect(h.delays).toEqual([])
  })

  it('resumes on schedule after stop/start rather than firing immediately', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }, { userName: 'b' }])
    h.p.start()
    await h.drain(1) // fetched 'a' at t0
    h.p.stop()

    h.setNow(1_000_000 + 5_000) // 5s of the gap already served
    const before = h.delays.length
    h.p.start()
    expect(h.delays[before]).toBe((15 * 60 * 1000 - 5_000) / 34 - 5_000)
    h.p.stop()
  })

  it('credits time already elapsed since the last lookup', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }])
    h.p.start()
    await h.drain()

    const before = h.delays.length
    h.setNow(1_000_000 + 10_000) // 10s passed while the queue was empty
    h.p.enqueue([{ userName: 'b' }])
    // budget 34 over the 14m50s left, minus the 10s already served.
    expect(h.delays[before]).toBe((15 * 60 * 1000 - 10_000) / 34 - 10_000)
    h.p.stop()
  })

  it('fires immediately when more than a full gap has already passed', async () => {
    const h = paced()
    h.p.enqueue([{ userName: 'a' }])
    h.p.start()
    await h.drain()

    const before = h.delays.length
    h.setNow(1_000_000 + 5 * 60 * 1000) // idle far longer than one gap
    h.p.enqueue([{ userName: 'b' }])
    expect(h.delays[before]).toBe(0)
    h.p.stop()
  })
})

// ---------------------------------------------------------------------------
// start() / stop() loop wiring
// ---------------------------------------------------------------------------
describe('start/stop loop', () => {
  it('drains the queue in order when started', async () => {
    const h = harness()
    h.p.enqueue([
      { userName: 'first' },
      { userName: 'second' },
      { userName: 'third' },
    ])
    h.p.start()
    await h.drain()
    expect(h.fetched).toEqual(['first', 'second', 'third'])
    expect(h.p.isRunning()).toBe(true)
    h.p.stop()
    expect(h.p.isRunning()).toBe(false)
  })

  it('does nothing after stop()', async () => {
    const h = harness()
    h.p.enqueue([{ userName: 'a' }])
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
    h.p.enqueue([{ userName: 'a' }])
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
    h.p.enqueue([{ userName: 'a' }])
    h.p.start()
    await h.drain(3)
    expect(h.fetched).toEqual([])
    expect(h.p.isRunning()).toBe(true)
    h.p.stop()
  })
})
