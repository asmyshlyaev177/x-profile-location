// Background location prefetcher.
//
// X's AboutAccountQuery endpoint allows 50 lookups per 15-minute window (measured
// from its x-rate-limit-* response headers). Hovering reveals a location on
// demand, but feed-location display, hide-by-location, and the shared community
// cache all benefit from knowing many accounts' locations up front. This queue
// trickles background lookups for on-screen accounts — most-followed first —
// while never letting *total* usage (background + the user's own hovers) pass a
// reserved share of the window, so a manual hover is never starved by prefetch.
//
// Budget is driven entirely by the live remaining count the content script keeps
// in sync from the x-rate-limit-* headers (which every AboutAccountQuery — manual
// or background — decrements). The prefetcher stops as soon as remaining drops to
// the user's reserved share, i.e. once the window is half spent.
//
// It is deliberately decoupled from the DOM and the content script: all effects
// (the fetch, the "already known?" check, the live rate-limit snapshot) are
// injected, so the scheduling/budget logic is unit-testable via runOnce() without
// timers or a browser.

export interface PrefetchCandidate {
  userName: string
  /** From `legacy.followers_count`; higher = fetched sooner. Missing → 0. */
  followers: number
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
   * for the user's own hovers. 0.5 → prefetch stops once the window is half spent.
   */
  reserveFraction?: number
  /** Minimum gap between background lookups, so we trickle rather than burst. */
  spacingMs?: number
  /** Fallback retry cadence when out of budget and no reset time is known. */
  windowMs?: number
  /** Max candidates kept queued; lowest-priority overflow is dropped. */
  maxQueue?: number
}

export type RunStatus = 'fetched' | 'empty' | 'budget' | 'paused'

const DEFAULTS: Required<PrefetcherOptions> = {
  reserveFraction: 0.5,
  spacingMs: 1500,
  windowMs: 15 * 60 * 1000,
  maxQueue: 300,
}

export class BackgroundPrefetcher {
  private readonly deps: PrefetcherDeps
  private readonly opts: Required<PrefetcherOptions>
  private readonly now: () => number
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  // Priority queue, kept sorted most-followed first.
  private queue: PrefetchCandidate[] = []
  private queued = new Set<string>() // lowercased names currently queued
  private fetchedCount = 0 // lifetime, for introspection only

  private running = false
  private ticking = false
  private timer: unknown = null

  constructor(deps: PrefetcherDeps, opts: PrefetcherOptions = {}) {
    this.deps = deps
    this.opts = { ...DEFAULTS, ...opts }
    this.now = deps.now ?? (() => Date.now())
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown)
    this.clearTimer =
      deps.clearTimer ??
      ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  /** Add on-screen candidates; dedups against what's already queued. */
  enqueue(candidates: PrefetchCandidate[]): void {
    let added = false
    for (const c of candidates) {
      const key = c.userName.toLowerCase()
      if (this.queued.has(key)) continue
      this.queued.add(key)
      this.queue.push({
        userName: c.userName,
        followers: Number.isFinite(c.followers) ? c.followers : 0,
      })
      added = true
    }
    if (!added) return

    this.queue.sort((a, b) => b.followers - a.followers)
    if (this.queue.length > this.opts.maxQueue) {
      for (const dropped of this.queue.splice(this.opts.maxQueue)) {
        this.queued.delete(dropped.userName.toLowerCase())
      }
    }
    // Wake the loop if it went idle waiting for candidates.
    if (this.running && !this.ticking) this.scheduleTick(0)
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

  /** Highest-priority queued candidate (removed), or null when the queue is empty. */
  private takeNext(): PrefetchCandidate | null {
    const c = this.queue.shift() ?? null
    if (c) this.queued.delete(c.userName.toLowerCase())
    return c
  }

  /**
   * Perform at most one background lookup. The engine behind both start()'s loop
   * and the unit tests.
   *  - 'fetched' — a lookup was issued
   *  - 'empty'   — nothing left to fetch
   *  - 'budget'  — window half spent; the rest is reserved for the user
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
    this.scheduleTick(0)
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

  private async tick(): Promise<void> {
    if (!this.running) return
    const status = await this.runOnce()
    if (!this.running) return

    if (status === 'fetched') {
      this.scheduleTick(this.opts.spacingMs)
      return
    }
    if (status === 'empty') {
      // Go idle; the next enqueue() wakes us.
      this.ticking = false
      return
    }
    // 'budget' / 'paused' — wait until the backoff or window reset likely cleared.
    const now = this.now()
    const { resetAt, windowResetAt } = this.deps.rateState()
    let wait = this.opts.windowMs
    if (resetAt > now) wait = resetAt - now + 500
    else if (windowResetAt && windowResetAt > now)
      wait = windowResetAt - now + 500
    this.scheduleTick(Math.min(wait, this.opts.windowMs))
  }

  /** Test-only introspection. */
  __state() {
    return {
      queueLength: this.queue.length,
      order: this.queue.map((c) => c.userName),
      fetchedCount: this.fetchedCount,
      running: this.running,
    }
  }
}
