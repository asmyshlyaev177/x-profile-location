// Type-only, so this module keeps its runtime independence from everything else.
import { DEFAULT_PREFETCH_SHARE, LOOKUP_WINDOW_MS } from '../constants'
import type { PrefetchPacing } from '../settings'
// The candidate queue and the pacing arithmetic behind background lookups. No
// timers, no fetching, no rate-limit state — see "Cross-tab lookup broker".

/** 'high' (the feed being scrolled) drains to exhaustion before 'low' (a
 *  thread's replies) gets a single lookup. */
export type PrefetchPriority = 'high' | 'low'

/** Grant order within one queue, and across every queue the broker holds. */
export const PRIORITIES: readonly PrefetchPriority[] = ['high', 'low']

export interface PrefetchCandidate {
  userName: string
  /** Defaults to 'high' — an unlabelled candidate is never buried. */
  priority?: PrefetchPriority
}

export interface RateState {
  /** Seeded at `limit`, decremented per request and corrected from
   *  x-rate-limit-remaining — so hovers count too. */
  remaining: number
  /** Per-window total (x-rate-limit-limit). */
  limit: number
  /** Epoch ms of a hard pause (e.g. a 429 backoff); 0 when clear. */
  resetAt: number
  /** Epoch ms when the per-window budget rolls over; 0/undefined when unknown. */
  windowResetAt?: number
}

export interface PacingOptions {
  /** Fraction of the window prefetch may spend; the rest is for hovers. */
  reserveFraction?: number
  /** 'spread' trickles the share over the window; 'instant' spends it at
   *  minSpacingMs and then idles. Same share either way. */
  pacing?: PrefetchPacing
  /** Floor on the paced gap, and the whole gap under 'instant'. */
  minSpacingMs?: number
  /** Ceiling on the paced gap, so a stale reset can't park a queue with work in it. */
  maxSpacingMs?: number
  /** Share of the budget spent at `sprintSpacingMs` before the trickle takes over. */
  sprintShare?: number
  /** Gap while sprinting, floored by `minSpacingMs` like any other. */
  sprintSpacingMs?: number
  /** Window length assumed when X hasn't told us when the budget rolls over. */
  windowMs?: number
}

export const PACING_DEFAULTS: Required<PacingOptions> = {
  reserveFraction: DEFAULT_PREFETCH_SHARE,
  pacing: 'spread',
  minSpacingMs: 1500,
  maxSpacingMs: 2 * 60 * 1000,
  windowMs: LOOKUP_WINDOW_MS,
  sprintShare: 0.25,
  sprintSpacingMs: 3000,
}

// A backstop, not a pace: past this the storage.session write starts to cost.
/** Max queued in one tab; overflow sheds the oldest. */
export const MAX_QUEUE = 1000

export interface QueueSnapshot {
  high: PrefetchCandidate[]
  low: PrefetchCandidate[]
}

const names = (queue: PrefetchCandidate[]) => queue.map((c) => c.userName)

/** Two queues, deduped by lowercased handle: page order within a batch, newest
 *  batch first. Whoever owns one decides when to drain it. */
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

  /** Newest batch first. Dedup keeps the slot a name already holds; a 'low'
   *  name seen as 'high' is promoted, never the reverse. */
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

  /** Drop the oldest batch from whichever queue is longer, `low` on a tie. */
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

/** Lookups the window allows prefetch in total, before any have gone out. */
function usableShare(rate: RateState, reserveFraction: number): number {
  return Math.max(1, Math.floor(rate.limit * clampFraction(reserveFraction)))
}

/** Share of the budget re-asking about known accounts. See "Revalidation" in CLAUDE.md. */
export const REVALIDATE_SHARE = 0.05

/** Lookups per window spent on known accounts. Floored at one: rounding to
 *  zero would switch revalidation off on the smallest budgets. */
export function revalidateBudget(
  rate: RateState,
  reserveFraction: number,
): number {
  return Math.max(
    1,
    Math.floor(usableShare(rate, reserveFraction) * REVALIDATE_SHARE),
  )
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

/** Until a 429 lifts, until the window refills, or else the window left over
 *  the budget left, clamped — which spreads the share evenly. */
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

  // The feed's opening sprint — see "Prefetch" in CLAUDE.md.
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
