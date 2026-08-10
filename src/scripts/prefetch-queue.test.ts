import { describe, expect, it } from 'vitest'
import {
  CandidateQueue,
  nextDelayMs,
  PACING_DEFAULTS,
  type PacingOptions,
  prefetchBudget,
  type RateState,
} from './prefetch-queue'

// ---------------------------------------------------------------------------
// enqueue / page order
// ---------------------------------------------------------------------------
describe('enqueue', () => {
  it('dedups by case-insensitive username', () => {
    const q = new CandidateQueue()
    q.enqueue([
      { userName: 'alice' },
      { userName: 'Alice' },
      { userName: 'ALICE' },
    ])
    expect(q.__state().queueLength).toBe(1)
  })

  it('keeps candidates in the order they appeared on the page', () => {
    const q = new CandidateQueue()
    q.enqueue([
      { userName: 'first' },
      { userName: 'second' },
      { userName: 'third' },
    ])
    expect(q.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('appends a later batch behind the earlier one', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'first' }, { userName: 'second' }])
    q.enqueue([{ userName: 'third' }]) // the user scrolled further down
    expect(q.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('leaves a repeat sighting where it first appeared', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'first' }, { userName: 'second' }])
    q.enqueue([{ userName: 'First' }, { userName: 'third' }])
    expect(q.__state().order).toEqual(['first', 'second', 'third'])
  })

  it('caps the queue at maxQueue, dropping the latest to appear', () => {
    const q = new CandidateQueue(2)
    q.enqueue([{ userName: 'a' }, { userName: 'b' }, { userName: 'c' }])
    expect(q.__state().order).toEqual(['a', 'b'])
  })

  it('reports whether anything was actually added', () => {
    const q = new CandidateQueue()
    expect(q.enqueue([{ userName: 'a' }])).toBe(true)
    expect(q.enqueue([{ userName: 'A' }])).toBe(false)
    expect(q.enqueue([])).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Two queues: the feed ('high') before a thread's replies ('low')
// ---------------------------------------------------------------------------
describe('priority queues', () => {
  it('treats an unlabelled candidate as high priority', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'plain' }])
    expect(q.__state().highOrder).toEqual(['plain'])
    expect(q.__state().lowOrder).toEqual([])
  })

  it('offers every high candidate before the first low one', () => {
    const q = new CandidateQueue()
    q.enqueue([
      // The reply author came first and still goes last.
      { userName: 'reply', priority: 'low' },
      { userName: 'feed-1', priority: 'high' },
      { userName: 'feed-2', priority: 'high' },
    ])
    expect(q.__state().order).toEqual(['feed-1', 'feed-2', 'reply'])

    const taken = [q.takeNext(), q.takeNext(), q.takeNext()].map(
      (c) => c?.userName,
    )
    expect(taken).toEqual(['feed-1', 'feed-2', 'reply'])
    expect(q.takeNext()).toBeNull()
  })

  it('keeps appearance order within each queue', () => {
    const q = new CandidateQueue()
    q.enqueue([
      { userName: 'r1', priority: 'low' },
      { userName: 'f1', priority: 'high' },
      { userName: 'r2', priority: 'low' },
      { userName: 'f2', priority: 'high' },
    ])
    expect(q.__state().highOrder).toEqual(['f1', 'f2'])
    expect(q.__state().lowOrder).toEqual(['r1', 'r2'])
  })

  it('takes from exactly the tier asked for', () => {
    const q = new CandidateQueue()
    q.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'r1', priority: 'low' },
    ])
    // The broker ranks whole tiers across tabs, so it needs to reach `low`
    // without draining every tab's `high` through this one queue first.
    expect(q.take('low')?.userName).toBe('r1')
    expect(q.has('low')).toBe(false)
    expect(q.take('high')?.userName).toBe('f1')
  })

  it('promotes a reply author who then turns up in the feed', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'Both', priority: 'low' }])
    q.enqueue([{ userName: 'feed-1', priority: 'high' }])
    expect(q.__state().lowOrder).toEqual(['Both'])

    // Promoted to the back of the feed queue: that is where it was seen.
    q.enqueue([{ userName: 'both', priority: 'high' }])
    expect(q.__state().highOrder).toEqual(['feed-1', 'both'])
    expect(q.__state().lowOrder).toEqual([]) // moved, not copied
    expect(q.__state().queueLength).toBe(2)
  })

  it('never demotes: a feed account seen again in a thread stays high', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'feed', priority: 'high' }])
    q.enqueue([{ userName: 'feed', priority: 'low' }])
    expect(q.__state().highOrder).toEqual(['feed'])
    expect(q.__state().lowOrder).toEqual([])
  })

  it('sheds low-priority overflow first when over maxQueue', () => {
    const q = new CandidateQueue(3)
    q.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'f2', priority: 'high' },
      { userName: 'r1', priority: 'low' },
      { userName: 'r2', priority: 'low' },
      { userName: 'r3', priority: 'low' },
    ])
    // Both feed accounts survive; only the first reply still fits.
    expect(q.__state().highOrder).toEqual(['f1', 'f2'])
    expect(q.__state().lowOrder).toEqual(['r1'])
  })

  it('falls back to trimming the high queue once low is empty', () => {
    const q = new CandidateQueue(2)
    q.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'f2', priority: 'high' },
      { userName: 'f3', priority: 'high' },
      { userName: 'r1', priority: 'low' },
    ])
    expect(q.__state().highOrder).toEqual(['f1', 'f2'])
    expect(q.__state().lowOrder).toEqual([])
  })

  it('re-queues a dropped name (its slot in the dedup map is freed too)', () => {
    const q = new CandidateQueue(1)
    q.enqueue([{ userName: 'kept' }, { userName: 'dropped' }])
    expect(q.__state().order).toEqual(['kept'])

    q.takeNext() // 'kept' goes out, leaving room again
    // Nothing lingers in the dedup map, so 'dropped' can come back next batch.
    q.enqueue([{ userName: 'dropped' }])
    expect(q.__state().order).toEqual(['dropped'])
  })
})

// ---------------------------------------------------------------------------
// Snapshots — the service worker is torn down between polls and reads its
// queues back from storage.session, so a round trip has to be lossless.
// ---------------------------------------------------------------------------
describe('toJSON / from', () => {
  it('survives a round trip with both tiers in order', () => {
    const q = new CandidateQueue()
    q.enqueue([
      { userName: 'f1', priority: 'high' },
      { userName: 'r1', priority: 'low' },
      { userName: 'f2', priority: 'high' },
    ])
    const restored = CandidateQueue.from(JSON.parse(JSON.stringify(q.toJSON())))
    expect(restored.__state().order).toEqual(['f1', 'f2', 'r1'])
  })

  it('rebuilds the dedup map, so a restored name is not queued twice', () => {
    const q = new CandidateQueue()
    q.enqueue([{ userName: 'alice' }])
    const restored = CandidateQueue.from(q.toJSON())
    restored.enqueue([{ userName: 'Alice' }])
    expect(restored.__state().queueLength).toBe(1)
  })

  it('starts empty from a missing snapshot', () => {
    expect(CandidateQueue.from(undefined).size).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Budget = the prefetcher's share of the window (reserveFraction)
// ---------------------------------------------------------------------------
describe('prefetchBudget', () => {
  const rate = (over: Partial<RateState> = {}): RateState => ({
    remaining: 50,
    limit: 50,
    resetAt: 0,
    ...over,
  })

  it('leaves the rest of the live remaining window to the user', () => {
    // limit 4, half reserved for the user → prefetch may use 2.
    expect(prefetchBudget(rate({ limit: 4, remaining: 4 }), 0.5, 0)).toBe(2)
  })

  it('is zero once the user has spent down to the reserve', () => {
    expect(prefetchBudget(rate({ limit: 4, remaining: 2 }), 0.5, 0)).toBe(0)
  })

  it('never goes negative when the user has spent past the reserve', () => {
    expect(prefetchBudget(rate({ limit: 4, remaining: 1 }), 0.5, 0)).toBe(0)
  })

  it('is zero during a hard backoff whatever the window says', () => {
    expect(prefetchBudget(rate({ resetAt: 5000 }), 0.7, 1000)).toBe(0)
    // …and back to the whole share once it lifts: 50 less the 15 reserved.
    expect(prefetchBudget(rate({ resetAt: 5000 }), 0.7, 5000)).toBe(35)
  })

  it('honors a custom share', () => {
    expect(prefetchBudget(rate({ limit: 10, remaining: 10 }), 0.3, 0)).toBe(3)
  })

  it('keeps a share of at least one lookup, however small the fraction', () => {
    // floor(4 * 0.05) is 0, which would stop background lookups without the
    // user ever having switched them off.
    expect(prefetchBudget(rate({ limit: 4, remaining: 4 }), 0.05, 0)).toBe(1)
  })

  it('clamps a share above 1 to the whole window', () => {
    expect(prefetchBudget(rate({ limit: 10, remaining: 10 }), 50, 0)).toBe(10)
  })

  it('falls back to the default share for a non-finite one', () => {
    expect(
      prefetchBudget(rate({ limit: 10, remaining: 10 }), Number.NaN, 0),
    ).toBe(prefetchBudget(rate({ limit: 10, remaining: 10 }), 0.7, 0))
  })
})

// ---------------------------------------------------------------------------
// Pacing — the budget is spread over the time left in the window
// ---------------------------------------------------------------------------
describe('nextDelayMs', () => {
  const NOW = 1_000_000
  const WINDOW = 15 * 60 * 1000

  // Real-world shape at the shipped defaults: 50/15min with a 0.7 share → 35
  // background lookups to spread over 15 minutes ≈ one every 26s, with the last
  // 15 of the window held back for the user's hovers.
  const paced = (over: Partial<RateState> = {}): RateState => ({
    remaining: 50,
    limit: 50,
    resetAt: 0,
    windowResetAt: NOW + WINDOW,
    ...over,
  })
  const opts = (over: PacingOptions = {}) => ({ ...PACING_DEFAULTS, ...over })

  it('divides the remaining window by the remaining budget', () => {
    expect(nextDelayMs(paced(), opts(), NOW)).toBe(WINDOW / 35)
  })

  it('assumes a full window when X has not told us the reset time yet', () => {
    expect(nextDelayMs(paced({ windowResetAt: 0 }), opts(), NOW)).toBe(
      WINDOW / 35,
    )
  })

  it('stretches the gap as manual hovers eat the shared budget', () => {
    // user spent 10 → 25 left of the prefetch share
    expect(nextDelayMs(paced({ remaining: 40 }), opts(), NOW)).toBe(WINDOW / 25)
  })

  it('shrinks the gap as the window winds down', () => {
    const twoMinutesLeft = NOW + 13 * 60 * 1000
    expect(nextDelayMs(paced(), opts(), twoMinutesLeft)).toBe(120_000 / 35)
  })

  it('never paces faster than minSpacingMs', () => {
    const tenSecondsLeft = NOW + WINDOW - 10_000 // budget 35 → 286ms
    expect(
      nextDelayMs(paced(), opts({ minSpacingMs: 1500 }), tenSecondsLeft),
    ).toBe(1500)
  })

  it('never waits longer than maxSpacingMs while it still has budget', () => {
    // budget 1; an even spread would park for ~15 minutes
    expect(
      nextDelayMs(
        paced({ remaining: 16 }),
        opts({ maxSpacingMs: 120_000 }),
        NOW,
      ),
    ).toBe(120_000)
  })

  it('waits for the window to roll over when out of budget', () => {
    // exactly the user's reserved share → budget 0
    expect(nextDelayMs(paced({ remaining: 15 }), opts(), NOW)).toBe(
      WINDOW + 500,
    )
  })

  it('waits out a hard backoff before anything else', () => {
    expect(nextDelayMs(paced({ resetAt: NOW + 30_000 }), opts(), NOW)).toBe(
      30_500,
    )
  })

  it('caps even a nonsense backoff at one window', () => {
    const wrong = paced({ resetAt: NOW + 5 * 60 * 60 * 1000 })
    expect(nextDelayMs(wrong, opts(), NOW)).toBe(WINDOW)
  })

  // 'instant' is the opt-out: same share, spent as fast as the floor allows.
  describe("pacing: 'instant'", () => {
    const instant = opts({ pacing: 'instant', minSpacingMs: 1500 })

    it('uses the minimum gap regardless of how much window is left', () => {
      expect(nextDelayMs(paced(), instant, NOW)).toBe(1500)
    })

    it('still stops at the share and waits for the window', () => {
      expect(nextDelayMs(paced({ remaining: 15 }), instant, NOW)).toBe(
        WINDOW + 500,
      )
    })

    it('still yields to a hard backoff', () => {
      expect(nextDelayMs(paced({ resetAt: NOW + 30_000 }), instant, NOW)).toBe(
        30_500,
      )
    })
  })
})
