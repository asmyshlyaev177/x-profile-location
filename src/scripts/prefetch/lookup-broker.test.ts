import { describe, expect, it } from 'vitest'
import {
  type BrokerOptions,
  IDLE_POLL_MS,
  LookupBroker,
  type TabState,
} from './lookup-broker'
import { PACING_DEFAULTS } from './prefetch-queue'

// ---------------------------------------------------------------------------
// Harness: a broker whose only outside dependency — the clock — is ours. Most
// tests pace at zero, because what they are about is *which* handle comes next;
// the pacing suite sets a real gap.
// ---------------------------------------------------------------------------
const START = 1_000_000
const WINDOW = 15 * 60 * 1000

function makeBroker(options: BrokerOptions = {}) {
  let now = START
  const broker = new LookupBroker({ ...options, now: () => now })
  return {
    broker,
    advance: (ms: number) => {
      now += ms
    },
    at: (t: number) => {
      now = t
    },
    now: () => now,
  }
}

/** No gap between grants: ordering tests should not have to wait 26 seconds. */
const unpaced = (over: BrokerOptions = {}): BrokerOptions => ({
  pacing: 'instant',
  minSpacingMs: 0,
  ...over,
})

const FOCUSED: TabState = { focused: true, visible: true }
const VISIBLE: TabState = { focused: false, visible: true }
const HIDDEN: TabState = { focused: false, visible: false }

/** Tell the broker what X's headers said, without claiming an answer arrived. */
function seedLedger(
  broker: LookupBroker,
  ledger: { limit?: number; remaining?: number; reset?: number },
): void {
  broker.report({ userName: '__seed__', spent: true, ok: false, ...ledger })
}

/** Every handle the broker hands out until it asks the caller to wait. */
function drain(broker: LookupBroker, tabId: number, state: TabState): string[] {
  const granted: string[] = []
  for (let i = 0; i < 50; i++) {
    const instruction = broker.next(tabId, state)
    if (!instruction.userName) break
    granted.push(instruction.userName)
    broker.report({ userName: instruction.userName, spent: true, ok: true })
  }
  return granted
}

// ---------------------------------------------------------------------------
// Grant order
// ---------------------------------------------------------------------------
describe('grant order', () => {
  it('hands out the first candidate straight away', () => {
    const { broker } = makeBroker()
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(broker.next(1, FOCUSED)).toEqual({ userName: 'alice', waitMs: 0 })
  })

  it('drains the whole feed tier before any thread replies, across tabs', () => {
    const { broker } = makeBroker(unpaced())
    // The reply author was queued first, and by the tab in front.
    broker.enqueue(1, [{ userName: 'reply-1', priority: 'low' }], FOCUSED)
    broker.enqueue(2, [{ userName: 'feed-2', priority: 'high' }], VISIBLE)
    broker.enqueue(1, [{ userName: 'feed-1', priority: 'high' }], FOCUSED)

    expect(drain(broker, 1, FOCUSED)).toEqual(['feed-1', 'feed-2', 'reply-1'])
  })

  it('puts the focused tab in front of a merely visible one', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'background' }], VISIBLE)
    broker.enqueue(2, [{ userName: 'foreground' }], FOCUSED)

    expect(drain(broker, 1, VISIBLE)).toEqual(['foreground', 'background'])
  })

  it('puts a visible tab in front of a hidden one', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'hidden' }], HIDDEN)
    broker.enqueue(2, [{ userName: 'shown' }], VISIBLE)

    expect(drain(broker, 1, HIDDEN)).toEqual(['shown', 'hidden'])
  })

  it('still serves hidden tabs — they are prefetching on purpose', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'only-one' }], HIDDEN)
    expect(broker.next(1, HIDDEN).userName).toBe('only-one')
  })

  it('re-ranks on the state the poll carries, not the state at enqueue', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'was-focused' }], FOCUSED)
    broker.enqueue(2, [{ userName: 'was-background' }], VISIBLE)

    // The user switched tabs before either lookup went out.
    broker.next(1, VISIBLE)
    expect(broker.__state().order[0]).toBe(1)
    expect(broker.next(2, FOCUSED).userName).toBe('was-background')
  })

  // Whoever polls does the work; the result is broadcast to every tab, so it
  // does not matter which one paid for it.
  it('hands one tab a handle another tab queued', () => {
    const { broker } = makeBroker()
    broker.enqueue(1, [{ userName: 'queued-by-one' }], VISIBLE)
    expect(broker.next(2, FOCUSED).userName).toBe('queued-by-one')
  })

  it('asks a tab to wait when nothing anywhere is queued', () => {
    const { broker } = makeBroker()
    expect(broker.next(1, FOCUSED)).toEqual({ waitMs: IDLE_POLL_MS })
  })
})

// ---------------------------------------------------------------------------
// Cross-tab duplicate suppression — the reason the broker exists
// ---------------------------------------------------------------------------
describe('in-flight handles', () => {
  it('never grants the same handle to two tabs at once', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.enqueue(2, [{ userName: 'Alice' }], VISIBLE) // same account, other tab

    expect(broker.next(1, FOCUSED).userName).toBe('alice')
    expect(broker.next(2, VISIBLE).waitMs).toBe(IDLE_POLL_MS)
  })

  it('drops a name a second tab queued while the first was fetching it', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)

    expect(broker.__state().tabs.find((t) => t.id === 2)?.order).toEqual([])
  })

  it('releases a grant nobody ever reported on', () => {
    const h = makeBroker(unpaced())
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(h.broker.next(2, VISIBLE).userName).toBeUndefined()

    // The tab was killed mid-request. Another tab may retry rather than have
    // the handle blocked for the rest of the window.
    h.advance(61 * 1000)
    h.broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(h.broker.next(2, VISIBLE).userName).toBe('alice')
  })

  it('releases a closed tab’s grants immediately', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)

    broker.dropTab(1)
    broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(broker.next(2, VISIBLE).userName).toBe('alice')
  })

  it('forgets a closed tab’s queue', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'gone' }], FOCUSED)
    broker.dropTab(1)
    expect(broker.next(2, FOCUSED).waitMs).toBe(IDLE_POLL_MS)
  })
})

// ---------------------------------------------------------------------------
// `asked` — what replaces the per-tab checkedThisSession set. Nothing here is
// ever written to disk: a second tab must not re-ask, and next window may.
// ---------------------------------------------------------------------------
describe('handles already asked about', () => {
  it('does not hand a second tab a handle the first already resolved', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.report({ userName: 'alice', spent: true, ok: true })

    broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(broker.next(2, VISIBLE).waitMs).toBe(IDLE_POLL_MS)
  })

  // X answering with no location is still an answer worth remembering, or every
  // new tab spends the window re-asking about the same accounts. It is only
  // remembered as long as the budget window it was paid for.
  it('re-asks once the window that answered has rolled over', () => {
    const h = makeBroker(unpaced())
    seedLedger(h.broker, {
      limit: 50,
      remaining: 50,
      reset: (START + WINDOW) / 1000,
    })
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'alice', spent: true, ok: true })

    h.advance(WINDOW + 1000)
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).userName).toBe('alice')
  })

  it('falls back to a whole window when X never said when it rolls', () => {
    const h = makeBroker(unpaced())
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'alice', spent: true, ok: true })

    h.advance(PACING_DEFAULTS.windowMs - 1)
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).userName).toBeUndefined()

    h.advance(2)
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).userName).toBe('alice')
  })

  it('remembers nothing about a lookup X refused to answer', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.report({ userName: 'alice', spent: true, ok: false, status: 500 })

    broker.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(broker.next(2, VISIBLE).userName).toBe('alice')
  })

  it('forgets everything when the user clears the cache', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.report({ userName: 'alice', spent: true, ok: true })

    broker.forgetAsked()
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(broker.next(1, FOCUSED).userName).toBe('alice')
  })
})

// ---------------------------------------------------------------------------
// Revalidation — the reserved slice spent on accounts already answered for
// ---------------------------------------------------------------------------
// The queue only ever holds accounts nobody has an answer for, so without this
// a location is fetched once and believed until the 30-day cache TTL drops it.
// The tab offers what it has cached; how much of it goes out is the window's.
describe('revalidation', () => {
  it('re-asks about a cached account ahead of the queue, and says so', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'feed' }], FOCUSED)
    broker.offerRevalidation(['cached'])

    expect(broker.next(1, FOCUSED)).toEqual({
      userName: 'cached',
      waitMs: 0,
      revalidate: true,
    })
  })

  // Behind the queue it would never happen at all: a scrolled feed outproduces
  // the trickle, so `high` is rarely empty on the readers this is for.
  it('spends the window reserve and then leaves the budget alone', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['a', 'b', 'c', 'd', 'e'])

    // 50 * 0.8 = 40 a window, of which 2.
    expect(drain(broker, 1, FOCUSED)).toEqual(['a', 'b'])
  })

  it('leaves the queue to the tier order once the reserve is gone', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'reply', priority: 'low' }], FOCUSED)
    broker.enqueue(1, [{ userName: 'feed' }], FOCUSED)
    broker.offerRevalidation(['x', 'y', 'z'])

    expect(drain(broker, 1, FOCUSED)).toEqual(['x', 'y', 'feed', 'reply'])
  })

  it('hands the reserve back when the tab spent nothing after all', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['a', 'b', 'c'])

    const granted = broker.next(1, FOCUSED)
    broker.report({ userName: granted.userName!, spent: false })

    // Nothing left the browser, so the window still owes two revalidations.
    expect(drain(broker, 1, FOCUSED)).toEqual(['b', 'c'])
  })

  it('never re-asks about a handle the window already paid for', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.report({ userName: 'alice', spent: true, ok: true })

    broker.offerRevalidation(['Alice'])
    expect(broker.next(1, FOCUSED).waitMs).toBe(IDLE_POLL_MS)
  })

  // The offer list arrives over chrome.runtime from a content script, typed
  // string[] and nothing more — an empty or non-string entry would become a
  // grant the poller then asks X about by that name.
  it('drops junk offers rather than granting them', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['', null, 42, 'real'] as unknown as string[])

    expect(drain(broker, 1, FOCUSED)).toEqual(['real'])
  })

  it('takes the same handle from two tabs as one offer', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['cached'])
    broker.offerRevalidation(['CACHED'])

    expect(drain(broker, 1, FOCUSED)).toEqual(['cached'])
  })

  it('gets its reserve back when the window rolls over', () => {
    const h = makeBroker(unpaced())
    seedLedger(h.broker, {
      limit: 50,
      remaining: 50,
      reset: (START + WINDOW) / 1000,
    })
    h.broker.offerRevalidation(['a', 'b', 'c', 'd'])
    expect(drain(h.broker, 1, FOCUSED)).toEqual(['a', 'b'])

    h.advance(WINDOW + 1000)
    expect(drain(h.broker, 1, FOCUSED)).toEqual(['c', 'd'])
  })

  it('drops what it was offered when the user clears the cache', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['a', 'b'])
    broker.forgetAsked()

    expect(broker.next(1, FOCUSED).waitMs).toBe(IDLE_POLL_MS)
  })

  it('holds only the newest offers, so a scroll cannot grow the snapshot', () => {
    const { broker } = makeBroker(unpaced())
    const older = Array.from({ length: 50 }, (_, i) => `old-${i}`)
    broker.offerRevalidation(older)
    broker.offerRevalidation(['newest'])

    const held = broker.__state().revalidate
    expect(held[0]).toBe('newest')
    expect(held.length).toBeLessThan(older.length)
    // Dropped from the tail: the oldest offer, and the one a tab ranked last.
    expect(held).not.toContain(older[older.length - 1])
  })

  it('is not a way round a 429', () => {
    const { broker } = makeBroker(unpaced())
    broker.report({ userName: 'alice', spent: true, status: 429 })
    broker.offerRevalidation(['cached'])

    expect(broker.next(1, FOCUSED).userName).toBeUndefined()
  })

  // The reserve is a slice of prefetch's share, not an allowance beside it.
  it('stops with the rest of prefetch at the user’s reserve', () => {
    const { broker } = makeBroker(unpaced())
    seedLedger(broker, { limit: 50, remaining: 10 })
    broker.offerRevalidation(['cached'])

    expect(broker.next(1, FOCUSED).userName).toBeUndefined()
  })

  it('does not offer a handle another tab has in flight', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    broker.next(1, FOCUSED)

    broker.offerRevalidation(['alice'])
    expect(broker.next(2, VISIBLE).waitMs).toBe(IDLE_POLL_MS)
  })

  // The request left the window whatever X answered, so the reserve is spent.
  it('keeps a refused revalidation charged to the window', () => {
    const { broker } = makeBroker(unpaced())
    broker.offerRevalidation(['a', 'b', 'c'])
    broker.next(1, FOCUSED)
    broker.report({ userName: 'a', spent: true, ok: false, status: 500 })

    expect(drain(broker, 1, FOCUSED)).toEqual(['b'])
  })

  it('starts revalidating from a snapshot written before it existed', () => {
    const h = makeBroker(unpaced())
    const older = h.broker.toJSON()
    delete older.revalidate
    delete older.revalidateSpent

    const restored = LookupBroker.from(older, { now: h.now })
    restored.setPacing({ pacing: 'instant', minSpacingMs: 0 })
    restored.offerRevalidation(['cached'])
    expect(restored.next(1, FOCUSED).userName).toBe('cached')
  })

  it('survives the worker being torn down mid-window', () => {
    const h = makeBroker(unpaced())
    h.broker.offerRevalidation(['a', 'b', 'c'])
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'a', spent: true, ok: true })

    const restored = LookupBroker.from(
      JSON.parse(JSON.stringify(h.broker.toJSON())),
      { now: h.now },
    )
    restored.setPacing({ pacing: 'instant', minSpacingMs: 0 })
    // One of the two is already spent, and 'a' is not offered a second time.
    expect(drain(restored, 1, FOCUSED)).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------
// The shared window
// ---------------------------------------------------------------------------
describe('the rate-limit ledger', () => {
  it('counts a grant before the response lands', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)

    broker.next(1, FOCUSED)
    // Otherwise a second tab polling in the same millisecond would see a
    // window that still looks untouched.
    expect(broker.__state().rate.remaining).toBe(49)
    broker.next(1, FOCUSED)
    expect(broker.__state().rate.remaining).toBe(48)
  })

  it('takes X’s own figures over its own counting', () => {
    const { broker } = makeBroker(unpaced())
    broker.enqueue(1, [{ userName: 'a' }], FOCUSED)
    broker.next(1, FOCUSED)
    broker.report({
      userName: 'a',
      spent: true,
      ok: true,
      limit: 50,
      remaining: 31,
      reset: (START + WINDOW) / 1000,
    })

    expect(broker.__state().rate).toMatchObject({
      limit: 50,
      remaining: 31,
      windowResetAt: START + WINDOW,
    })
  })

  it('hands the slot back when the cache answered first', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    h.broker.next(1, FOCUSED)

    // No request went out, so it cost neither a lookup nor a place in the pace.
    h.broker.report({ userName: 'a', spent: false })
    expect(h.broker.__state().rate.remaining).toBe(50)
    expect(h.broker.next(1, FOCUSED).userName).toBe('b')
  })

  it('stops at the user’s reserved share', () => {
    const { broker } = makeBroker(unpaced())
    seedLedger(broker, { limit: 4, remaining: 4 })
    broker.setPacing({ reserveFraction: 0.5 })
    broker.enqueue(
      1,
      ['a', 'b', 'c', 'd'].map((userName) => ({ userName })),
      FOCUSED,
    )

    expect(drain(broker, 1, FOCUSED)).toEqual(['a', 'b'])
  })

  it('resumes when the window rolls the budget over', () => {
    const h = makeBroker(unpaced())
    seedLedger(h.broker, {
      limit: 4,
      remaining: 2,
      reset: (START + WINDOW) / 1000,
    })
    h.broker.setPacing({ reserveFraction: 0.5 })
    h.broker.enqueue(1, [{ userName: 'a' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).userName).toBeUndefined()

    h.advance(WINDOW + 1)
    expect(h.broker.next(1, FOCUSED).userName).toBe('a')
  })

  it('pauses every tab on a 429, and says how long for', () => {
    const h = makeBroker(unpaced())
    h.broker.enqueue(1, [{ userName: 'a' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({
      userName: 'a',
      spent: true,
      status: 429,
      reset: (START + 60_000) / 1000,
    })

    expect(h.broker.rateSnapshot().resetAt).toBe(START + 60_000)
    h.broker.enqueue(2, [{ userName: 'b' }], VISIBLE)
    const instruction = h.broker.next(2, VISIBLE)
    expect(instruction.userName).toBeUndefined()
    expect(instruction.waitMs).toBe(60_500)
  })

  it('backs off for five minutes when a 429 carries no reset', () => {
    const { broker } = makeBroker(unpaced())
    broker.report({ userName: 'a', spent: true, status: 429 })
    expect(broker.rateSnapshot().resetAt).toBe(START + 5 * 60 * 1000)
  })

  it('lifts the backoff once its moment passes', () => {
    const h = makeBroker(unpaced())
    h.broker.report({ userName: 'a', spent: true, status: 429 })
    h.broker.enqueue(1, [{ userName: 'b' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).userName).toBeUndefined()

    h.advance(5 * 60 * 1000 + 1)
    expect(h.broker.next(1, FOCUSED).userName).toBe('b')
  })

  // A hover is the user's own doing: it spends from the window like anything
  // else, but it must not push the background trickle back a slot.
  it('counts a hover without giving it the trickle’s place in the queue', () => {
    const { broker } = makeBroker()
    broker.report({
      userName: 'hovered',
      spent: true,
      ok: true,
      remaining: 44,
    })

    expect(broker.__state().rate.remaining).toBe(44)
    expect(broker.__state().lastGrantAt).toBe(Number.NEGATIVE_INFINITY)
  })

  it('does not re-ask about an account a hover already resolved', () => {
    const { broker } = makeBroker(unpaced())
    broker.report({ userName: 'hovered', spent: true, ok: true })
    broker.enqueue(1, [{ userName: 'Hovered' }], FOCUSED)
    expect(broker.next(1, FOCUSED).waitMs).toBe(IDLE_POLL_MS)
  })
})

// ---------------------------------------------------------------------------
// Pacing — one clock for every tab, which is the whole point of moving it here
// ---------------------------------------------------------------------------
describe('pacing', () => {
  // The opening sprint is prefetch-queue's, and tested there. These are about
  // the broker sharing one gap between tabs, so they run past it.
  const spread = (over: BrokerOptions = {}) =>
    makeBroker({ sprintShare: 0, ...over })

  it('sprints out of a fresh window before settling into the spread', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 49 })
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(
      PACING_DEFAULTS.sprintSpacingMs,
    )

    // Past the sprint: 30 of 50 left is 20 of the 40 prefetch may have.
    h.broker.report({ userName: 'b', spent: true, ok: true, remaining: 30 })
    h.broker.enqueue(1, [{ userName: 'c' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(PACING_DEFAULTS.windowMs / 20)
  })

  it('never sprints a thread’s replies, however fresh the window', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'r1', priority: 'low' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'r1', spent: true, ok: true, remaining: 49 })
    h.broker.enqueue(1, [{ userName: 'r2', priority: 'low' }], FOCUSED)

    expect(h.broker.next(1, FOCUSED).waitMs).toBe(PACING_DEFAULTS.windowMs / 39)
  })

  it('sprints as soon as a feed account is queued behind the replies', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'r1', priority: 'low' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'r1', spent: true, ok: true, remaining: 49 })

    h.broker.enqueue(1, [{ userName: 'feed' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(
      PACING_DEFAULTS.sprintSpacingMs,
    )
  })

  // A tab whose feed queue holds nothing but names already answered this window
  // is not a feed waiting on anything, and must not buy the gap with them.
  it('ignores feed candidates already asked about this window', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'first' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'first', spent: true, ok: true, remaining: 49 })

    h.broker.enqueue(
      1,
      [{ userName: 'seen' }, { userName: 'r1', priority: 'low' }],
      FOCUSED,
    )
    // A hover answered 'seen' after it was queued, so the feed queue still holds
    // it — and the reply is what the next grant will actually be.
    h.broker.report({ userName: 'seen', spent: true, ok: true, remaining: 48 })

    expect(h.broker.next(1, FOCUSED).waitMs).toBe(PACING_DEFAULTS.windowMs / 38)
  })

  it('makes the second tab wait out the first tab’s gap', () => {
    const h = spread()
    h.broker.enqueue(1, [{ userName: 'a' }], FOCUSED)
    h.broker.enqueue(2, [{ userName: 'b' }], VISIBLE)

    expect(h.broker.next(1, FOCUSED).userName).toBe('a')
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 49 })

    // 49 remaining → budget 39 over a full window. Two tabs polling does not
    // make that two lookups; the second is told to wait the same gap.
    const gap = PACING_DEFAULTS.windowMs / 39
    const instruction = h.broker.next(2, VISIBLE)
    expect(instruction.userName).toBeUndefined()
    expect(instruction.waitMs).toBe(gap)

    h.advance(gap)
    expect(h.broker.next(2, VISIBLE).userName).toBe('b')
  })

  it('credits time that passed while the queue was empty', () => {
    const h = spread()
    h.broker.enqueue(1, [{ userName: 'a' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 49 })

    h.advance(10_000)
    h.broker.enqueue(1, [{ userName: 'b' }], FOCUSED)
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(
      PACING_DEFAULTS.windowMs / 39 - 10_000,
    )
  })

  it('applies a share changed on the options page', () => {
    const h = spread()
    h.broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 49 })

    h.broker.setPacing({ reserveFraction: 0.9 }) // reserve 5 → budget 44
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(PACING_DEFAULTS.windowMs / 44)
  })

  it('applies a pacing mode changed on the options page', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 49 })

    h.broker.setPacing({ pacing: 'instant' })
    expect(h.broker.next(1, FOCUSED).waitMs).toBe(PACING_DEFAULTS.minSpacingMs)
  })

  it('leaves untouched settings alone', () => {
    const { broker } = makeBroker({ minSpacingMs: 42 })
    broker.setPacing({ pacing: 'instant' })
    broker.setPacing({ reserveFraction: undefined })
    broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    broker.next(1, FOCUSED)
    expect(broker.next(1, FOCUSED).waitMs).toBe(42)
  })
})

// ---------------------------------------------------------------------------
// Snapshots — the service worker is evicted after ~30s idle, which is shorter
// than the gap between lookups. Everything below has to survive that.
// ---------------------------------------------------------------------------
describe('toJSON / from', () => {
  function roundTrip(broker: LookupBroker, now: () => number): LookupBroker {
    return LookupBroker.from(JSON.parse(JSON.stringify(broker.toJSON())), {
      now,
    })
  }

  it('keeps queues, their tiers and their tab ranking', () => {
    const h = makeBroker(unpaced())
    h.broker.enqueue(1, [{ userName: 'reply', priority: 'low' }], FOCUSED)
    h.broker.enqueue(2, [{ userName: 'feed' }], VISIBLE)

    const restored = roundTrip(h.broker, h.now)
    restored.setPacing({ pacing: 'instant', minSpacingMs: 0 })
    expect(drain(restored, 1, FOCUSED)).toEqual(['feed', 'reply'])
  })

  it('keeps the ledger, so a restart cannot invent budget', () => {
    const h = makeBroker()
    h.broker.report({
      userName: 'a',
      spent: true,
      ok: true,
      limit: 50,
      remaining: 17,
    })
    expect(roundTrip(h.broker, h.now).__state().rate.remaining).toBe(17)
  })

  it('keeps a 429 backoff across a restart', () => {
    const h = makeBroker()
    h.broker.report({ userName: 'a', spent: true, status: 429 })
    expect(roundTrip(h.broker, h.now).rateSnapshot().resetAt).toBe(
      START + 5 * 60 * 1000,
    )
  })

  it('keeps handles already asked about', () => {
    const h = makeBroker(unpaced())
    h.broker.report({ userName: 'alice', spent: true, ok: true })

    const restored = roundTrip(h.broker, h.now)
    restored.setPacing({ pacing: 'instant', minSpacingMs: 0 })
    restored.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(restored.next(1, FOCUSED).userName).toBeUndefined()
  })

  it('keeps in-flight grants, so a restart is not a second request', () => {
    const h = makeBroker(unpaced())
    h.broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    h.broker.next(1, FOCUSED)

    const restored = roundTrip(h.broker, h.now)
    restored.setPacing({ pacing: 'instant', minSpacingMs: 0 })
    restored.enqueue(2, [{ userName: 'alice' }], VISIBLE)
    expect(restored.next(2, VISIBLE).userName).toBeUndefined()
  })

  // JSON has no -Infinity, and a `null` read back as a number would put the
  // next lookup 1970-shaped milliseconds in the past — or never.
  it('survives a lastGrantAt that has never been set', () => {
    const h = makeBroker()
    const restored = roundTrip(h.broker, h.now)
    restored.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(restored.next(1, FOCUSED).userName).toBe('alice')
  })

  it('keeps the pace, so a restart cannot jump the gap', () => {
    const h = makeBroker()
    h.broker.enqueue(1, [{ userName: 'a' }, { userName: 'b' }], FOCUSED)
    h.broker.next(1, FOCUSED)
    // Past the opening sprint, so the gap under test is the paced one.
    h.broker.report({ userName: 'a', spent: true, ok: true, remaining: 29 })

    expect(roundTrip(h.broker, h.now).next(1, FOCUSED).waitMs).toBe(
      PACING_DEFAULTS.windowMs / 19,
    )
  })

  it('starts clean from a worker that had never stored anything', () => {
    const broker = LookupBroker.from(undefined)
    broker.enqueue(1, [{ userName: 'alice' }], FOCUSED)
    expect(broker.next(1, FOCUSED).userName).toBe('alice')
  })
})
