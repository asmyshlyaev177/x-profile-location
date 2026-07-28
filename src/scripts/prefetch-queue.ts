// Background location prefetcher.
//
// X's AboutAccountQuery endpoint allows 50 lookups per 15-minute window (measured
// from its x-rate-limit-* response headers). Hovering reveals a location on
// demand, but feed-location display, hide-by-location, and the shared community
// cache all benefit from knowing many accounts' locations up front. This queue
// trickles background lookups for on-screen accounts — in the order they appear
// on the page — while never letting *total* usage (background + the user's own
// hovers) pass a reserved share of the window, so a manual hover is never
// starved by prefetch.
//
// Candidates are split across two queues by PrefetchPriority: the feed the user
// is scrolling ('high') is drained entirely before a thread's replies ('low').
// Each queue is plain FIFO — the timeline hands accounts over in the order they
// are rendered, so looking them up in arrival order means locations fill in from
// the top of the feed downwards, roughly tracking where the user is reading.
//
// Budget is driven entirely by the live remaining count the content script keeps
// in sync from the x-rate-limit-* headers (which every AboutAccountQuery — manual
// or background — decrements). The prefetcher stops as soon as remaining drops to
// the user's reserved share, i.e. once 70% of the window is spent — the last 15
// of 50 are held back for hovers.
//
// Default pacing spreads that budget *evenly over the time left in the window*
// rather than spending it back-to-back and then idling until the window rolls.
// Before each lookup the gap is recomputed as `msLeftInWindow / budget` (see
// nextDelayMs), so with the measured 50/15min limit and a 70% share that
// settles around one lookup every ~26s. The recompute is self-correcting: user
// hovers eat the shared budget and stretch the gap, a refilled window shrinks it
// back. Practical upshot — locations keep trickling in for the whole window, and
// a user who starts hovering mid-window still finds budget left. Both the share
// and the pacing are user-settable (options page); 'instant' pacing spends the
// same share at minSpacingMs and then waits out the window.
//
// It is deliberately decoupled from the DOM and the content script: all effects
// (the fetch, the "already known?" check, the live rate-limit snapshot) are
// injected, so the scheduling/budget logic is unit-testable via runOnce() and
// nextDelayMs() without timers or a browser.

// Type-only, so this module keeps its runtime independence from everything else.
import type { PrefetchPacing } from './countries'

/**
 * Which of the two queues a candidate lands in. 'high' is drained to exhaustion
 * before 'low' gets a single lookup — see takeNext().
 *
 * 'high' is the feed the user is scrolling (HomeTimeline); 'low' is a thread's
 * replies (TweetDetail), which are many and mostly scrolled past. The tweet the
 * user actually opened never comes through here — processPrimaryTweet() looks it
 * up directly — so nothing the user is looking at waits behind the low queue.
 */
export type PrefetchPriority = 'high' | 'low'

export interface PrefetchCandidate {
  userName: string
  /** Defaults to 'high' — an unlabelled candidate is never buried. */
  priority?: PrefetchPriority
}

export interface RateState {
  /**
   * AboutAccountQuery requests left in the current window. The content script
   * seeds this at `limit` and decrements it on every request (manual or
   * background), correcting from x-rate-limit-remaining — so it reflects the
   * user's own hovers too, not just prefetch.
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
   * Fraction of the window the prefetcher may consume; the remainder is reserved
   * for the user's own hovers. 0.7 → prefetch stops once 70% of the window is
   * spent, leaving 30% (15 of 50) for hovers. User-configurable on the options
   * page, applied live via setReserveFraction().
   */
  reserveFraction?: number
  /**
   * 'spread' (default) trickles the share evenly over the time left in the
   * window; 'instant' spends it at minSpacingMs until it runs out, then waits
   * for the window to roll. Either way the share itself is the same — this only
   * changes how quickly it is used up. Live-settable via setPacing().
   */
  pacing?: PrefetchPacing
  /**
   * Floor on the paced gap, and the whole gap under 'instant' pacing. In
   * 'spread' it only binds when the window is nearly over and the budget is
   * still large (spread → 0), keeping the tail a trickle, not a burst.
   */
  minSpacingMs?: number
  /**
   * Ceiling on the paced gap, so a stale window reset or a budget of 1 can't
   * park the prefetcher for a whole window when there is work to do.
   */
  maxSpacingMs?: number
  /** Window length assumed when X hasn't told us when the budget rolls over. */
  windowMs?: number
  /**
   * Max candidates kept queued across both queues. Overflow is dropped from the
   * bottom of the low queue first, and only then from the bottom of the high one.
   */
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

export class BackgroundPrefetcher {
  private readonly deps: PrefetcherDeps
  private readonly opts: Required<PrefetcherOptions>
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  // Two FIFO queues, each in the order the page handed the accounts over.
  // `high` drains completely before `low` is touched, so a thread full of
  // replies can never push the feed the user is scrolling out of the way.
  private high: PrefetchCandidate[] = []
  private low: PrefetchCandidate[] = []
  // Lowercased name → the queue it currently sits in.
  private queued = new Map<string, PrefetchPriority>()
  private fetchedCount = 0 // lifetime, for introspection only

  private running = false
  private ticking = false
  private timer: unknown = null
  // Epoch ms of the last issued lookup; -Infinity until the first one, so the
  // very first candidate goes out immediately instead of waiting a full gap.
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
   * Add on-screen candidates, each appended to the queue its priority names, in
   * the order given — which is the order the timeline rendered them. Dedups
   * against what's already queued, keeping the position the name first earned.
   * A name already queued as 'low' that turns up as 'high' is *promoted* (a
   * reply author who also appears in the feed); the reverse never demotes.
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
        // Promoting (priority can only be 'high' here): drop the low-queue copy,
        // it is re-added at the back of `high` below.
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

    // Wake the loop if it went idle waiting for candidates — respecting the pace,
    // so a scroll that queues a fresh batch can't skip ahead of the schedule.
    if (this.running && !this.ticking)
      this.scheduleTick(this.delayFromLastFetch())
  }

  /**
   * Drop overflow from the back of each queue — the most recently seen accounts
   * — emptying `low` before touching `high`. Shedding the tail rather than the
   * head is what keeps the surviving queue in appearance order.
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
   * Change the share of the window prefetch may spend (options page). Takes
   * effect on the next lookup *and* re-times the pending one, so widening the
   * share speeds the trickle up right away instead of after the current sleep.
   * Non-finite values are ignored; the rest is clamped to [0.05, 1].
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
   * How many background lookups are allowed right now (>= 0). Zero while a hard
   * backoff is in effect, otherwise however much of the window is left above the
   * user's reserved share.
   */
  budget(now: number = this.now()): number {
    const { remaining, limit, resetAt } = this.deps.rateState()
    if (resetAt > now) return 0 // hard paused (e.g. 429)
    const mayUse = Math.max(1, Math.floor(limit * this.opts.reserveFraction))
    const reservedForUser = limit - mayUse
    return Math.max(0, remaining - reservedForUser)
  }

  /**
   * Next candidate to look up (removed), or null when both queues are empty.
   * The whole high queue goes before the first low one.
   */
  private takeNext(): PrefetchCandidate | null {
    const c = this.high.shift() ?? this.low.shift() ?? null
    if (c) this.queued.delete(c.userName.toLowerCase())
    return c
  }

  /**
   * Perform at most one background lookup. The engine behind both start()'s loop
   * and the unit tests.
   *  - 'fetched' — a lookup was issued
   *  - 'empty'   — nothing left to fetch
   *  - 'budget'  — prefetch share spent; the rest is reserved for the user
   *  - 'paused'  — a hard rate-limit backoff is in effect
   */
  async runOnce(): Promise<RunStatus> {
    const now = this.now()
    if (this.budget(now) <= 0) {
      return this.deps.rateState().resetAt > now ? 'paused' : 'budget'
    }
    // Skip already-known accounts without spending budget; keep going until we
    // find one worth fetching or the queue drains.
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
    // First ever start fires immediately (lastFetchAt is -Infinity); a restart
    // after a stop() resumes on the existing schedule rather than jumping the gun.
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
   * How long to wait before the next background lookup.
   *
   *  - hard backoff (429) → until it lifts
   *  - no budget left     → until the window rolls over and refills it
   *  - otherwise          → the remaining window divided by the remaining
   *    budget, so the allowance is spread evenly over the time we have for it
   *    (clamped to [minSpacingMs, maxSpacingMs])
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
    const names = (queue: PrefetchCandidate[]) => queue.map((c) => c.userName)
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
