// The tab half of the lookup broker: ask what to look up, look it up, ask again.
//
// The clock lives here and not in the service worker because an MV3 worker is
// evicted after ~30s idle and a pending setTimeout dies with it — and the paced
// gap runs to minutes whenever the budget is spent. See "Cross-tab lookup
// broker" in CLAUDE.md.

import type { NextInstruction } from './lookup-broker'

/** How long to wait out a broker that isn't answering at all. */
export const UNREACHABLE_RETRY_MS = 30 * 1000

export interface PollerDeps {
  /** Ask the broker for work; null when it could not be reached. */
  next: () => Promise<NextInstruction | null>
  /**
   * Do the lookup. Reporting what it cost is the lookup's own job; `revalidate`
   * means the tab has it cached and must ask X anyway.
   */
  fetch: (userName: string, revalidate: boolean) => Promise<void>
  now?: () => number
  setTimer?: (fn: () => void, ms: number) => unknown
  clearTimer?: (handle: unknown) => void
}

export class PrefetchPoller {
  private readonly deps: PollerDeps
  private readonly setTimer: (fn: () => void, ms: number) => unknown
  private readonly clearTimer: (handle: unknown) => void

  private running = false
  private timer: unknown = null
  private polling = false
  private woken = false

  constructor(deps: PollerDeps) {
    this.deps = deps
    this.setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms) as unknown)
    this.clearTimer =
      deps.clearTimer ??
      ((h) => clearTimeout(h as ReturnType<typeof setTimeout>))
  }

  /** One poll, and the wait the broker asked for afterwards. */
  async runOnce(): Promise<number> {
    const instruction = await this.deps.next()
    if (!instruction) return UNREACHABLE_RETRY_MS
    if (!instruction.userName) return instruction.waitMs

    try {
      await this.deps.fetch(
        instruction.userName,
        instruction.revalidate ?? false,
      )
    } catch {
      // best-effort; a failed background lookup is never surfaced
    }
    // Straight back to the broker: it owns the pace, and it has just been told
    // what this lookup cost.
    return 0
  }

  start(): void {
    if (this.running) return
    this.running = true
    this.schedule(0)
  }

  stop(): void {
    this.running = false
    if (this.timer != null) this.clearTimer(this.timer)
    this.timer = null
  }

  isRunning(): boolean {
    return this.running
  }

  /**
   * Poll now rather than at the end of the current wait. Mid-poll it is
   * remembered, not scheduled — see "Waking a poll in flight" in CLAUDE.md.
   */
  wake(): void {
    if (!this.running) return
    this.woken = true
    if (!this.polling) this.schedule(0)
  }

  private schedule(ms: number): void {
    if (!this.running) return
    if (this.timer != null) this.clearTimer(this.timer)
    this.timer = this.setTimer(() => {
      this.timer = null
      void this.tick()
    }, ms)
  }

  private async tick(): Promise<void> {
    if (!this.running) return
    this.woken = false
    this.polling = true
    try {
      const waitMs = await this.runOnce()
      if (!this.running) return
      this.schedule(this.woken ? 0 : waitMs)
    } finally {
      this.polling = false
    }
  }
}
