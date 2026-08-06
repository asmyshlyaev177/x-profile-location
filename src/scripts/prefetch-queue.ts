// Background location prefetcher.
//
// X allows 50 AboutAccountQuery lookups per 15-minute window (from its
// x-rate-limit-* headers). This queue trickles lookups for on-screen accounts to
// warm the caches, holding a share of the window back so the user's own hovers
// are never starved.
//
// Two queues by PrefetchPriority: the feed being scrolled ('high') drains
// entirely before a thread's replies ('low'). Each is plain FIFO, and the
// timeline hands accounts over in render order, so locations fill in down the
// feed roughly where the user is reading.
//
// Budget comes from the live remaining count the content script syncs from those
// headers, which every lookup decrements — hovers included. Default pacing
// spreads it over the time left in the window (nextDelayMs) and is
// self-correcting: hovers stretch the gap, a refilled window shrinks it.
//
// Every effect is injected, so runOnce() and nextDelayMs() are testable without
// timers or a DOM.

// Type-only, so this module keeps its runtime independence from everything else.
import type { PrefetchPacing } from './countries'

/**
 * Which queue a candidate lands in. 'high' — the feed being scrolled — drains to
 * exhaustion before 'low' — a thread's replies — gets a single lookup. The tweet
 * the user opened never comes through here; processPrimaryTweet() fetches it.
 */
export type PrefetchPriority = 'high' | 'low'

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

export interface PrefetcherDeps {
  /** Do the real lookup (updates cache, contributes to shared cache, applies to DOM). */
  fetch: (userName: string) => Promise<void>
  /** True when we already have (or are fetching) this location — skip, no budget. */
  isKnown: (userName: string) => boolean | Promise<boolean>
  /** Current live rate-limit snapshot. */
  rateState: () => RateState
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export interface PrefetcherOptions {
  /**
   * Fraction of the window prefetch may spend; the rest is reserved for hovers.
   * 0.7 leaves the last 15 of 50. Options page, live via setReserveFraction().
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
  /** Window length assumed when X hasn't told us when the budget rolls over. */
  windowMs?: number
  /** Max queued across both queues; overflow sheds from `low` first. */
  maxQueue?: number
}

export type RunStatus = 'fetched' | 'empty' | 'budget' | 'paused'

const DEFAULTS: Required<PrefetcherOptions> = {
  reserveFraction: 0.7,
  pacing: 'spread',
  minSpacingMs: 1500,
  maxSpacingMs: 2 * 60 * 1000,
  windowMs: 15 * 60 * 1000,
  maxQueue: 300,
}

const names = (queue: PrefetchCandidate[]) => queue.map((c) => c.userName)

export class BackgroundPrefetcher {
  private readonly deps: PrefetcherDeps
  private readonly opts: Required<PrefetcherOptions>
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  // Two FIFO queues in page order. `high` drains completely before `low`, so a
  // thread full of replies can't push the feed aside.
  private high: PrefetchCandidate[] = []
  private low: PrefetchCandidate[] = []
  // Lowercased name → the queue it currently sits in.
  private queued = new Map<string, PrefetchPriority>()
  private fetchedCount = 0 // lifetime, for introspection only

  private running = false
  private ticking = false
  private timer: unknown = null
  // -Infinity until the first lookup, so the first candidate goes out at once.
  private lastFetchAt = Number.NEGATIVE_INFINITY

  constructor(deps: PrefetcherDeps, opts: PrefetcherOptions = {}) {
    this.deps = deps
    this.opts = { ...DEFAULTS, ...opts }
    this.now = deps.now ?? (() => Date.now())
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown)
    this.clearTimer =
      deps.clearTimer ??
      ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  /**
   * Append candidates to the queue their priority names, in the order given.
   * Dedup keeps the slot a name first earned; a 'low' name seen as 'high' is
   * promoted, never the reverse.
   */
  enqueue(candidates: PrefetchCandidate[]): void {
    let added = false

    for (const c of candidates) {
      const key = c.userName.toLowerCase()
      const priority = c.priority ?? 'high'
      const existing = this.queued.get(key)
      // Already queued at this priority, or already ahead of it — leave it be.
      if (existing === priority || existing === 'high') continue
      if (existing === 'low') {
        // Promoting: drop the low copy; it is re-added at the back of `high`.
        this.low = this.low.filter((q) => q.userName.toLowerCase() !== key)
      }

      this.queued.set(key, priority)
      const entry: PrefetchCandidate = { userName: c.userName, priority }
      if (priority === 'high') this.high.push(entry)
      else this.low.push(entry)
      added = true
    }
    if (!added) return

    this.trimToMaxQueue()

    // Wake an idle loop, still paced — a fresh batch can't jump the schedule.
    if (this.running && !this.ticking)
      this.scheduleTick(this.delayFromLastFetch())
  }

  /**
   * Drop overflow from the back of each queue, emptying `low` first. Shedding the
   * tail rather than the head keeps the survivors in appearance order.
   */
  private trimToMaxQueue(): void {
    let overflow = this.high.length + this.low.length - this.opts.maxQueue
    if (overflow <= 0) return
    for (const queue of [this.low, this.high]) {
      if (overflow <= 0) break
      const drop = Math.min(overflow, queue.length)
      for (const c of queue.splice(queue.length - drop, drop)) {
        this.queued.delete(c.userName.toLowerCase())
      }
      overflow -= drop
    }
  }

  /**
   * Change the share prefetch may spend. Re-times the pending lookup too, so
   * widening the share speeds the trickle up now rather than after the sleep.
   */
  setReserveFraction(fraction: number): void {
    if (!Number.isFinite(fraction)) return
    const next = Math.min(1, Math.max(0.05, fraction))
    if (next === this.opts.reserveFraction) return
    this.opts.reserveFraction = next
    if (this.running && this.ticking) {
      this.scheduleTick(this.delayFromLastFetch())
    }
  }

  /** Switch between evenly-spread and as-fast-as-allowed pacing (options page). */
  setPacing(pacing: PrefetchPacing): void {
    if (pacing === this.opts.pacing) return
    this.opts.pacing = pacing
    if (this.running && this.ticking) {
      this.scheduleTick(this.delayFromLastFetch())
    }
  }

  /** Ms until the window rolls over; falls back to a full window when unknown. */
  private msLeftInWindow(now: number): number {
    const { windowResetAt } = this.deps.rateState()
    if (!windowResetAt || windowResetAt <= now) return this.opts.windowMs
    return Math.min(windowResetAt - now, this.opts.windowMs)
  }

  /**
   * Background lookups allowed right now — zero during a hard backoff, else
   * whatever is left above the user's reserved share.
   */
  budget(now: number = this.now()): number {
    const { remaining, limit, resetAt } = this.deps.rateState()
    if (resetAt > now) return 0 // hard paused (e.g. 429)
    const mayUse = Math.max(1, Math.floor(limit * this.opts.reserveFraction))
    const reservedForUser = limit - mayUse
    return Math.max(0, remaining - reservedForUser)
  }

  /** Next candidate (removed), or null. All of `high` goes before any of `low`. */
  private takeNext(): PrefetchCandidate | null {
    const c = this.high.shift() ?? this.low.shift() ?? null
    if (c) this.queued.delete(c.userName.toLowerCase())
    return c
  }

  /**
   * At most one background lookup — the engine behind start()'s loop and the
   * tests. 'empty' is an exhausted queue, 'budget' the share spent, 'paused' a
   * hard rate-limit backoff.
   */
  async runOnce(): Promise<RunStatus> {
    const now = this.now()
    if (this.budget(now) <= 0) {
      return this.deps.rateState().resetAt > now ? 'paused' : 'budget'
    }
    // Skipping a known account costs no budget, so keep going.
    while (true) {
      const c = this.takeNext()
      if (!c) return 'empty'
      if (await this.deps.isKnown(c.userName)) continue
      try {
        await this.deps.fetch(c.userName)
        this.fetchedCount += 1
      } catch {
        // best-effort; a failed background lookup is never surfaced
      }
      return 'fetched'
    }
  }

  start(): void {
    if (this.running) return
    this.running = true
    // First ever start fires at once; a restart resumes the existing schedule.
    this.scheduleTick(this.delayFromLastFetch())
  }

  stop(): void {
    this.running = false
    this.ticking = false
    if (this.timer != null) this.clearTimer(this.timer)
    this.timer = null
  }

  isRunning(): boolean {
    return this.running
  }

  private scheduleTick(ms: number): void {
    if (!this.running) return
    if (this.timer != null) this.clearTimer(this.timer)
    this.ticking = true
    this.timer = this.setTimer(() => {
      this.timer = null
      void this.tick()
    }, ms)
  }

  /**
   * How long to wait before the next lookup: until a 429 lifts, until the window
   * refills when the budget is spent, or else the window left over the budget
   * left, clamped — which is what spreads the share evenly.
   */
  nextDelayMs(now: number = this.now()): number {
    const { resetAt } = this.deps.rateState()
    if (resetAt > now) return Math.min(resetAt - now + 500, this.opts.windowMs)

    const msLeft = this.msLeftInWindow(now)
    const budget = this.budget(now)
    // Out of budget: nothing to pace, just wait for the refill.
    if (budget <= 0) return msLeft + 500
    // 'instant': spend the share as fast as the floor allows.
    if (this.opts.pacing === 'instant') return this.opts.minSpacingMs

    return Math.min(
      Math.max(msLeft / budget, this.opts.minSpacingMs),
      this.opts.maxSpacingMs,
    )
  }

  /** nextDelayMs, less the time already elapsed since the last lookup. */
  private delayFromLastFetch(): number {
    const now = this.now()
    return Math.max(0, this.nextDelayMs(now) - (now - this.lastFetchAt))
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    const status = await this.runOnce()
    if (!this.running) return

    if (status === 'fetched') this.lastFetchAt = this.now()
    if (status === 'empty') {
      // Go idle; the next enqueue() wakes us.
      this.ticking = false
      return
    }
    this.scheduleTick(this.nextDelayMs())
  }

  /** Test-only introspection. `order` is the order lookups will actually go out. */
  __state() {
    return {
      queueLength: this.high.length + this.low.length,
      order: [...names(this.high), ...names(this.low)],
      highOrder: names(this.high),
      lowOrder: names(this.low),
      fetchedCount: this.fetchedCount,
      running: this.running,
    }
  }
}
