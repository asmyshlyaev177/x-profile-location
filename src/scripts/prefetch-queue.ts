// The candidate queue and the pacing arithmetic behind background lookups.
//
// No timers, no fetching and no rate-limit state of its own: `lookup-broker.ts`
// holds one queue per tab and one clock for all of them, so N open x.com tabs
// still trickle at one shared rate. See "Cross-tab lookup broker" in CLAUDE.md.

// Type-only, so this module keeps its runtime independence from everything else.
import type { PrefetchPacing } from './countries'

/**
 * Which queue a candidate lands in. 'high' — the feed being scrolled — drains to
 * exhaustion before 'low' — a thread's replies — gets a single lookup. The tweet
 * the user opened never comes through here; processPrimaryTweet() fetches it.
 */
export type PrefetchPriority = 'high' | 'low'

/** Grant order within one queue, and across every queue the broker holds. */
export const PRIORITIES: readonly PrefetchPriority[] = ['high', 'low']

export interface PrefetchCandidate {
  userName: string
  /** Defaults to 'high' — an unlabelled candidate is never buried. */
  priority?: PrefetchPriority
}

export interface RateState {
  /**
   * Lookups left in the window. Seeded at `limit`, decremented on every request
   * and corrected from x-rate-limit-remaining — so hovers count too.
   */
  remaining: number
  /** Per-window total (x-rate-limit-limit). */
  limit: number
  /** Epoch ms of a hard pause (e.g. a 429 backoff); 0 when clear. */
  resetAt: number
  /** Epoch ms when the per-window budget rolls over; 0/undefined when unknown. */
  windowResetAt?: number
}

export interface PacingOptions {
  /**
   * Fraction of the window prefetch may spend; the rest is reserved for hovers.
   * 0.8 leaves the last 10 of 50. Options page, live via the broker.
   */
  reserveFraction?: number
  /**
   * 'spread' (default) trickles the share over the window; 'instant' spends it at
   * minSpacingMs and then idles. Same share either way.
   */
  pacing?: PrefetchPacing
  /**
   * Floor on the paced gap, and the whole gap under 'instant'. Keeps the tail of
   * a window a trickle rather than a burst.
   */
  minSpacingMs?: number
  /** Ceiling on the paced gap, so a stale reset can't park a queue with work in it. */
  maxSpacingMs?: number
  /**
   * Share of the window's budget spent at `sprintSpacingMs` before the trickle
   * takes over. The reader is looking at the feed now; the spread is what keeps
   * the rest of the window alive, not what fills the first screen.
   */
  sprintShare?: number
  /** Gap while sprinting, floored by `minSpacingMs` like any other. */
  sprintSpacingMs?: number
  /** Window length assumed when X hasn't told us when the budget rolls over. */
  windowMs?: number
}

export const PACING_DEFAULTS: Required<PacingOptions> = {
  reserveFraction: 0.8,
  pacing: 'spread',
  minSpacingMs: 1500,
  maxSpacingMs: 2 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
  sprintShare: 0.25,
  sprintSpacingMs: 3000,
}

// Measured 2026-08-15 in a loaded dist/chrome: at 1000 per tab the broker
// snapshot is 157KB and its storage.session round trip 2.5ms, 1.6MB and 31ms
// across ten tabs — 15% of the 10MB quota, which rejects the whole write.
/** Max queued in one tab; a backstop, not a pace. Overflow sheds the oldest. */
export const MAX_QUEUE = 1000

export interface QueueSnapshot {
  high: PrefetchCandidate[]
  low: PrefetchCandidate[]
}

const names = (queue: PrefetchCandidate[]) => queue.map((c) => c.userName)

/**
 * Two queues, deduped by lowercased handle: page order within a batch, newest
 * batch first. Reads and writes only — whoever owns one decides when to drain it.
 */
export class CandidateQueue {
  // `high` is offered completely before `low`, so a thread full of replies can't
  // push the feed aside.
  private high: PrefetchCandidate[] = []
  private low: PrefetchCandidate[] = []
  // Lowercased name → the queue it currently sits in.
  private queued = new Map<string, PrefetchPriority>()

  // A plain field, not a constructor parameter property: this project builds
  // with `erasableSyntaxOnly`, which rules the shorthand out.
  private readonly maxQueue: number

  constructor(maxQueue: number = MAX_QUEUE) {
    this.maxQueue = maxQueue
  }

  /**
   * Put candidates in front of everything queued before them, in the order
   * given: the tweet just opened is what the user is looking at, and the feed
   * they scrolled past can wait. Dedup keeps the slot a name already holds; a
   * 'low' name seen as 'high' is promoted, never the reverse.
   */
  enqueue(candidates: PrefetchCandidate[]): boolean {
    const fresh: Record<PrefetchPriority, PrefetchCandidate[]> = {
      high: [],
      low: [],
    }

    for (const c of candidates) {
      const key = c.userName.toLowerCase()
      const priority = c.priority ?? 'high'
      const existing = this.queued.get(key)
      // Already queued at this priority, or already ahead of it — leave it be.
      if (existing === priority || existing === 'high') continue
      if (existing === 'low') {
        // Promoting: drop the low copy; it is re-added at the front of `high`.
        this.low = this.low.filter((q) => q.userName.toLowerCase() !== key)
      }

      this.queued.set(key, priority)
      fresh[priority].push({ userName: c.userName, priority })
    }

    this.high.unshift(...fresh.high)
    this.low.unshift(...fresh.low)
    const added = fresh.high.length + fresh.low.length > 0
    if (added) this.trimToMaxQueue()
    return added
  }

  /**
   * Drop overflow from the back — the oldest batch — of whichever queue is
   * longer, `low` on a tie. A scrolled feed outproduces a thread by far, so
   * emptying `low` first threw away every reply author the moment `high` grew.
   */
  private trimToMaxQueue(): void {
    let overflow = this.high.length + this.low.length - this.maxQueue
    while (overflow > 0) {
      const queue = this.low.length >= this.high.length ? this.low : this.high
      const dropped = queue.pop()
      if (!dropped) return
      this.queued.delete(dropped.userName.toLowerCase())
      overflow -= 1
    }
  }

  private queueFor(priority: PrefetchPriority): PrefetchCandidate[] {
    return priority === 'high' ? this.high : this.low
  }

  has(priority: PrefetchPriority): boolean {
    return this.queueFor(priority).length > 0
  }

  /** Whether anything of this priority survives the owner's own filter. */
  some(
    priority: PrefetchPriority,
    keep: (candidate: PrefetchCandidate) => boolean,
  ): boolean {
    return this.queueFor(priority).some(keep)
  }

  /** Next candidate of exactly this priority (removed), or null. */
  take(priority: PrefetchPriority): PrefetchCandidate | null {
    const c = this.queueFor(priority).shift() ?? null
    if (c) this.queued.delete(c.userName.toLowerCase())
    return c
  }

  /** Next candidate (removed), or null. All of `high` goes before any of `low`. */
  takeNext(): PrefetchCandidate | null {
    return this.take('high') ?? this.take('low')
  }

  get size(): number {
    return this.high.length + this.low.length
  }

  toJSON(): QueueSnapshot {
    return { high: [...this.high], low: [...this.low] }
  }

  static from(
    snapshot: QueueSnapshot | undefined,
    maxQueue: number = MAX_QUEUE,
  ): CandidateQueue {
    const q = new CandidateQueue(maxQueue)
    // Through enqueue(), so a hand-edited or stale snapshot cannot seed a
    // duplicate the dedup map doesn't know about.
    q.enqueue(snapshot?.high ?? [])
    q.enqueue(snapshot?.low ?? [])
    return q
  }

  /** Test-only introspection. `order` is the order lookups will actually go out. */
  __state() {
    return {
      queueLength: this.size,
      order: [...names(this.high), ...names(this.low)],
      highOrder: names(this.high),
      lowOrder: names(this.low),
    }
  }
}

// A share outside this range is a bug or a hand-edited storage value, not a
// preference: 0 would stop background lookups without disabling them.
function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return PACING_DEFAULTS.reserveFraction
  return Math.min(1, Math.max(0.05, fraction))
}

/** Ms until the window rolls over; falls back to a full window when unknown. */
function msLeftInWindow(
  rate: RateState,
  windowMs: number,
  now: number,
): number {
  const { windowResetAt } = rate
  if (!windowResetAt || windowResetAt <= now) return windowMs
  return Math.min(windowResetAt - now, windowMs)
}

/**
 * Background lookups allowed right now — zero during a hard backoff, else
 * whatever is left above the user's reserved share.
 */
/** Lookups the window allows prefetch in total, before any have gone out. */
function usableShare(rate: RateState, reserveFraction: number): number {
  return Math.max(1, Math.floor(rate.limit * clampFraction(reserveFraction)))
}

export function prefetchBudget(
  rate: RateState,
  reserveFraction: number,
  now: number,
): number {
  if (rate.resetAt > now) return 0 // hard paused (e.g. 429)
  const reservedForUser = rate.limit - usableShare(rate, reserveFraction)
  return Math.max(0, rate.remaining - reservedForUser)
}

/**
 * How long to wait before the next lookup: until a 429 lifts, until the window
 * refills when the budget is spent, or else the window left over the budget
 * left, clamped — which is what spreads the share evenly.
 */
export function nextDelayMs(
  rate: RateState,
  opts: Required<PacingOptions>,
  now: number,
  /** Whether the next lookup would be a feed account — the only kind sprinted. */
  sprintable = false,
): number {
  if (rate.resetAt > now)
    return Math.min(rate.resetAt - now + 500, opts.windowMs)

  const msLeft = msLeftInWindow(rate, opts.windowMs, now)
  const budget = prefetchBudget(rate, opts.reserveFraction, now)
  // Out of budget: nothing to pace, just wait for the refill.
  if (budget <= 0) return msLeft + 500
  // 'instant': spend the share as fast as the floor allows.
  if (opts.pacing === 'instant') return opts.minSpacingMs

  // The first quarter of the share goes out at a sprint: spread evenly, the
  // screen the reader is on now fills at one flag per 22s. The trickle keeps
  // the rest of the window alive and still gets three quarters of it. Only the
  // feed earns it — a thread's replies are the tier that waits, by definition.
  const sprintFloor =
    usableShare(rate, opts.reserveFraction) * (1 - opts.sprintShare)
  if (sprintable && budget > sprintFloor) {
    return Math.max(opts.minSpacingMs, opts.sprintSpacingMs)
  }

  return Math.min(
    Math.max(msLeft / budget, opts.minSpacingMs),
    opts.maxSpacingMs,
  )
}
