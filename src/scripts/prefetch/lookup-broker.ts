import { LOOKUP_LIMIT_PER_WINDOW } from '../constants'
// Decides which account every open x.com tab looks up next; lives in the service
// worker. Every effect is injected. See "Cross-tab lookup broker" in CLAUDE.md.

import { RATE_LIMIT_RESET_DEFAULT_MS } from '../constants'
import {
  CandidateQueue,
  MAX_QUEUE,
  nextDelayMs,
  PACING_DEFAULTS,
  type PacingOptions,
  type PrefetchCandidate,
  prefetchBudget,
  type PrefetchPriority,
  PRIORITIES,
  type QueueSnapshot,
  type RateState,
  revalidateBudget,
} from './prefetch-queue'

/** A grant whose tab never reported back — closed, crashed or navigated away. */
const INFLIGHT_TTL_MS = 60 * 1000

/** Answer to a poll with nothing to hand out; tabs re-ask on it. */
export const IDLE_POLL_MS = 30 * 1000

// Offers arrive ~20 a batch and drain 2 a window, and every message rewrites the
// whole snapshot — see "Revalidation" in CLAUDE.md.
const MAX_REVALIDATE = 10

export interface TabState {
  focused: boolean
  visible: boolean
}

/** Either a handle to look up now, or how long to wait before asking again. */
export interface NextInstruction {
  userName?: string
  waitMs: number
  /** The tab has this one cached: ask X anyway, that is the point of it. */
  revalidate?: boolean
}

export interface LookupReport {
  userName: string
  /** A request actually went to X. False when a cache answered first. */
  spent: boolean
  /** X answered and the answer parsed — the condition for not asking again. */
  ok?: boolean
  status?: number
  limit?: number | null
  remaining?: number | null
  /** `x-rate-limit-reset`, in seconds, exactly as X sends it. */
  reset?: number | null
}

interface InflightEntry {
  tabId: number
  at: number
  prevGrantAt: number
  /** Whether the grant decremented `remaining`, so a skip can put it back. */
  optimistic: boolean
  /** Whether it also spent from the window's revalidation reserve. */
  revalidate: boolean
}

interface TabRecord extends TabState {
  queue: CandidateQueue
  seenAt: number
}

interface TabSnapshot extends TabState {
  seenAt: number
  queue: QueueSnapshot
}

export interface BrokerSnapshot {
  rate: RateState
  lastGrantAt: number | null
  asked: Array<[string, number]>
  inflight: Array<[string, InflightEntry]>
  tabs: Array<[number, TabSnapshot]>
  revalidate?: string[]
  revalidateSpent?: number
}

export interface BrokerOptions extends PacingOptions {
  maxQueue?: number
  now?: () => number
}

const key = (userName: string) => userName.toLowerCase()

/** Focused beats merely visible beats hidden; hidden tabs still get served. */
function tabRank(tab: TabRecord): number {
  if (tab.focused && tab.visible) return 0
  return tab.visible ? 1 : 2
}

export class LookupBroker {
  private tabs = new Map<number, TabRecord>()
  /** Handle → when it may be asked about again. Cleared as the window rolls. */
  private asked = new Map<string, number>()
  private inflight = new Map<string, InflightEntry>()
  /** Cached handles tabs offered up, newest first. */
  private revalidate: string[] = []
  private revalidateSpent = 0
  private rate: RateState
  // -Infinity until the first grant, so the first candidate goes out at once.
  private lastGrantAt = Number.NEGATIVE_INFINITY
  private opts: Required<PacingOptions>
  private readonly maxQueue: number
  private readonly now: () => number

  constructor(options: BrokerOptions = {}) {
    const { maxQueue, now, ...pacing } = options
    this.opts = { ...PACING_DEFAULTS, ...definedOnly(pacing) }
    this.maxQueue = maxQueue ?? MAX_QUEUE
    this.now = now ?? (() => Date.now())
    this.rate = {
      remaining: LOOKUP_LIMIT_PER_WINDOW,
      limit: LOOKUP_LIMIT_PER_WINDOW,
      resetAt: 0,
      windowResetAt: 0,
    }
  }

  /** Options page, live. Unset fields keep what they were. */
  setPacing(pacing: PacingOptions): void {
    this.opts = { ...this.opts, ...definedOnly(pacing) }
  }

  private touch(tabId: number, state: TabState | undefined, now: number) {
    const existing = this.tabs.get(tabId)
    if (existing) {
      if (state) {
        existing.focused = state.focused
        existing.visible = state.visible
      }
      existing.seenAt = now
      return existing
    }
    const record: TabRecord = {
      queue: new CandidateQueue(this.maxQueue),
      focused: state?.focused ?? false,
      visible: state?.visible ?? true,
      seenAt: now,
    }
    this.tabs.set(tabId, record)
    return record
  }

  /** Forget a closed tab, releasing its grants rather than letting them time
   *  out — at worst another tab repeats one request. */
  dropTab(tabId: number): void {
    this.tabs.delete(tabId)
    for (const [handle, entry] of this.inflight) {
      if (entry.tabId === tabId) this.inflight.delete(handle)
    }
  }

  /** Candidates a tab saw, already filtered against its own cache. */
  enqueue(
    tabId: number,
    candidates: PrefetchCandidate[],
    state?: TabState,
  ): void {
    const now = this.now()
    const record = this.touch(tabId, state, now)
    record.queue.enqueue(
      candidates.filter((c) => !this.isSpokenFor(c.userName, now)),
    )
  }

  // The tab offers, the reserve decides — see "Revalidation" in ./CLAUDE.md.
  offerRevalidation(handles: string[]): void {
    const now = this.now()
    const held = new Set(this.revalidate.map(key))
    const fresh: string[] = []

    for (const handle of handles) {
      if (typeof handle !== 'string' || handle === '') continue
      if (this.isSpokenFor(handle, now) || held.has(key(handle))) continue
      held.add(key(handle))
      fresh.push(handle)
    }
    // Newest offer first, its own order kept — the queues' rule, for the same
    // reason: what a tab just saw is what its reader is looking at.
    this.revalidate.unshift(...fresh)
    this.revalidate.length = Math.min(this.revalidate.length, MAX_REVALIDATE)
  }

  /** In flight somewhere, or already asked about this window. */
  private isSpokenFor(userName: string, now: number): boolean {
    const handle = key(userName)
    const entry = this.inflight.get(handle)
    // The TTL is read here rather than only swept, so a grant whose tab died
    // stops blocking the handle at the same moment however it is looked at.
    if (entry && now - entry.at <= INFLIGHT_TTL_MS) return true
    return (this.asked.get(handle) ?? 0) > now
  }

  private rankedTabIds(): number[] {
    return [...this.tabs.entries()]
      .sort(
        ([aId, a], [bId, b]) =>
          tabRank(a) - tabRank(b) || b.seenAt - a.seenAt || aId - bId,
      )
      .map(([id]) => id)
  }

  /** The whole feed tier before any reply tier, most engaged tab first.
   *  Whoever polls gets it; the result is broadcast to every tab. */
  private takeBest(now: number): PrefetchCandidate | null {
    const order = this.rankedTabIds()
    for (const priority of PRIORITIES) {
      for (const tabId of order) {
        const queue = this.tabs.get(tabId)?.queue
        const candidate = queue && this.takeUnclaimed(queue, priority, now)
        if (candidate) return candidate
      }
    }
    return null
  }

  /** Whether any tab holds a feed account worth asking about — all that earns
   *  the opening sprint. */
  private feedIsWaiting(now: number): boolean {
    for (const tab of this.tabs.values()) {
      const waiting = tab.queue.some(
        'high',
        (candidate) => !this.isSpokenFor(candidate.userName, now),
      )
      if (waiting) return true
    }
    return false
  }

  /** A cached handle to re-ask about, ahead of the queues — see
   *  "Revalidation" in CLAUDE.md. */
  private takeRevalidation(now: number): string | null {
    const reserve = revalidateBudget(this.rate, this.opts.reserveFraction)
    if (this.revalidateSpent >= reserve) return null
    while (this.revalidate.length > 0) {
      const userName = this.revalidate.shift()!
      if (!this.isSpokenFor(userName, now)) return userName
    }
    return null
  }

  /** Names another tab has since claimed or resolved are dropped, not returned. */
  private takeUnclaimed(
    queue: CandidateQueue,
    priority: PrefetchPriority,
    now: number,
  ): PrefetchCandidate | null {
    while (queue.has(priority)) {
      const candidate = queue.take(priority)!
      if (!this.isSpokenFor(candidate.userName, now)) return candidate
    }
    return null
  }

  next(tabId: number, state: TabState): NextInstruction {
    const now = this.now()
    this.touch(tabId, state, now)
    this.rollWindow(now)
    this.expireInflight(now)

    const gap = nextDelayMs(this.rate, this.opts, now, this.feedIsWaiting(now))
    // Spent, or paused by a 429: `gap` is already the wait for the refill.
    if (prefetchBudget(this.rate, this.opts.reserveFraction, now) <= 0) {
      return { waitMs: gap }
    }

    // The gap less what has already been served, rather than a due-time
    // subtraction: `lastGrantAt + gap - now` loses the low bits of `gap`.
    const owed = gap - (now - this.lastGrantAt)
    // Under a millisecond is due now: no timer can express the difference, and
    // float arithmetic on the gap leaves debts of 10^-11 ms behind.
    if (owed >= 1) return { waitMs: owed }

    const stale = this.takeRevalidation(now)
    const userName = stale ?? this.takeBest(now)?.userName
    if (userName === undefined) return { waitMs: IDLE_POLL_MS }

    const revalidate = stale !== null
    // Optimistic, like the per-tab counter it replaces: report() makes it exact
    // from the headers, and a skip hands it straight back.
    const optimistic = this.rate.remaining > 0
    if (optimistic) this.rate.remaining -= 1
    if (revalidate) this.revalidateSpent += 1
    this.inflight.set(key(userName), {
      tabId,
      at: now,
      prevGrantAt: this.lastGrantAt,
      optimistic,
      revalidate,
    })
    this.lastGrantAt = now

    // Left off rather than set false: a plain grant is the same message it
    // always was, and every caller reads it as one.
    return revalidate
      ? { userName, waitMs: 0, revalidate }
      : { userName, waitMs: 0 }
  }

  /** What a lookup cost. Hovers report too: never granted, same window. */
  report(report: LookupReport): void {
    const now = this.now()
    const handle = key(report.userName)
    const entry = this.inflight.get(handle)
    this.inflight.delete(handle)

    if (report.spent) {
      this.applyHeaders(report, now)
      if (report.ok) this.asked.set(handle, this.askedUntil(now))
      return
    }

    // Nothing went out. Give back the slot and the optimistic decrement, so an
    // account the cache already knew costs the trickle nothing.
    if (!entry) return
    if (this.lastGrantAt === entry.at) this.lastGrantAt = entry.prevGrantAt
    if (entry.revalidate) {
      this.revalidateSpent = Math.max(0, this.revalidateSpent - 1)
    }
    if (entry.optimistic) {
      this.rate.remaining = Math.min(this.rate.limit, this.rate.remaining + 1)
    }
  }

  private applyHeaders(report: LookupReport, now: number): void {
    const { limit, remaining, reset, status } = report
    const resetAt = typeof reset === 'number' && reset > 0 ? reset * 1000 : 0
    if (typeof limit === 'number' && limit > 0) this.rate.limit = limit
    if (typeof remaining === 'number' && Number.isFinite(remaining)) {
      this.rate.remaining = remaining
    }
    if (resetAt) this.openWindow(resetAt)
    if (status === 429) {
      this.rate.resetAt = resetAt || now + RATE_LIMIT_RESET_DEFAULT_MS
    }
  }

  /** A later reset than the one on record is a fresh window's budget. */
  private openWindow(windowResetAt: number): void {
    const later =
      this.rate.windowResetAt && windowResetAt > this.rate.windowResetAt
    if (later) this.revalidateSpent = 0
    this.rate.windowResetAt = windowResetAt
  }

  /** A new window is a new chance: nothing about a handle is remembered longer. */
  private askedUntil(now: number): number {
    return this.rate.windowResetAt || now + this.opts.windowMs
  }

  private rollWindow(now: number): void {
    if (this.rate.windowResetAt && now >= this.rate.windowResetAt) {
      this.rate.remaining = this.rate.limit
      this.rate.windowResetAt = 0
      this.revalidateSpent = 0
    }
    if (this.rate.resetAt && now >= this.rate.resetAt) this.rate.resetAt = 0
    for (const [handle, until] of this.asked) {
      if (until <= now) this.asked.delete(handle)
    }
  }

  private expireInflight(now: number): void {
    for (const [handle, entry] of this.inflight) {
      if (now - entry.at > INFLIGHT_TTL_MS) this.inflight.delete(handle)
    }
  }

  /** The user cleared the cache: every handle is worth asking about again. */
  forgetAsked(): void {
    this.asked.clear()
    // Offers were made about a cache that no longer holds any of it.
    this.revalidate = []
  }

  /** What every tab is told after a lookup, so a 429 pauses all of them. */
  rateSnapshot(): RateState {
    this.rollWindow(this.now())
    return { ...this.rate }
  }

  toJSON(): BrokerSnapshot {
    return {
      rate: { ...this.rate },
      lastGrantAt: Number.isFinite(this.lastGrantAt) ? this.lastGrantAt : null,
      asked: [...this.asked],
      inflight: [...this.inflight],
      revalidate: [...this.revalidate],
      revalidateSpent: this.revalidateSpent,
      tabs: [...this.tabs].map(([id, tab]) => [
        id,
        {
          focused: tab.focused,
          visible: tab.visible,
          seenAt: tab.seenAt,
          queue: tab.queue.toJSON(),
        },
      ]),
    }
  }

  static from(
    snapshot: BrokerSnapshot | undefined,
    options: BrokerOptions = {},
  ): LookupBroker {
    const broker = new LookupBroker(options)
    if (!snapshot) return broker

    broker.rate = { ...broker.rate, ...snapshot.rate }
    broker.lastGrantAt = Number.isFinite(snapshot.lastGrantAt)
      ? (snapshot.lastGrantAt as number)
      : Number.NEGATIVE_INFINITY
    broker.asked = new Map(snapshot.asked ?? [])
    broker.inflight = new Map(snapshot.inflight ?? [])
    broker.revalidate = [...(snapshot.revalidate ?? [])]
    broker.revalidateSpent = snapshot.revalidateSpent ?? 0
    for (const [id, tab] of snapshot.tabs ?? []) {
      broker.tabs.set(id, {
        queue: CandidateQueue.from(tab.queue, broker.maxQueue),
        focused: tab.focused,
        visible: tab.visible,
        seenAt: tab.seenAt,
      })
    }
    return broker
  }

  __state() {
    return {
      rate: { ...this.rate },
      lastGrantAt: this.lastGrantAt,
      asked: [...this.asked.keys()],
      inflight: [...this.inflight.keys()],
      revalidate: [...this.revalidate],
      revalidateSpent: this.revalidateSpent,
      tabs: [...this.tabs].map(([id, tab]) =>
        Object.assign(
          { id, focused: tab.focused, visible: tab.visible },
          tab.queue.__state(),
        ),
      ),
      order: this.rankedTabIds(),
    }
  }
}

// `{ ...defaults, ...partial }` would let an absent key arrive as `undefined`
// and overwrite the default with it.
function definedOnly<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(value).filter(([, v]) => v !== undefined),
  ) as Partial<T>
}
