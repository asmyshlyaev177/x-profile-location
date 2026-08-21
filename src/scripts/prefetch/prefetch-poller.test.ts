import { describe, expect, it } from 'vitest'
import type { NextInstruction } from './lookup-broker'
import { PrefetchPoller, UNREACHABLE_RETRY_MS } from './prefetch-poller'

// ---------------------------------------------------------------------------
// Harness: the broker is a scripted list of answers and the timer loop is
// driven by hand, so the poller's behaviour is observable without real time or
// a message port. `delays` is every wait it asked for, in order.
// ---------------------------------------------------------------------------
function harness(answers: Array<NextInstruction | null>) {
  const fetched: string[] = []
  const revalidated: string[] = []
  const timers: Array<() => void> = []
  const delays: number[] = []
  const asked: number[] = []
  let failNext = false

  const poller = new PrefetchPoller({
    next: async () => {
      asked.push(timers.length)
      // `?? default` would swallow a scripted null, which is the unreachable case.
      return answers.length ? answers.shift()! : { waitMs: 5000 }
    },
    fetch: async (userName, revalidate) => {
      if (failNext) {
        failNext = false
        throw new Error('X said no')
      }
      fetched.push(userName)
      if (revalidate) revalidated.push(userName)
    },
    setTimer: (fn, ms) => {
      timers.push(fn)
      delays.push(ms)
      return timers.length - 1
    },
    clearTimer: () => {},
  })

  return {
    poller,
    fetched,
    revalidated,
    delays,
    asked,
    failOnce: () => {
      failNext = true
    },
    async drain(max = 10) {
      let i = 0
      while (timers.length && i++ < max) {
        timers.shift()!()
        await new Promise((r) => setTimeout(r, 0))
      }
    },
  }
}

describe('runOnce', () => {
  it('looks up the handle the broker named', async () => {
    const h = harness([{ userName: 'alice', waitMs: 0 }])
    expect(await h.poller.runOnce()).toBe(0)
    expect(h.fetched).toEqual(['alice'])
    expect(h.revalidated).toEqual([])
  })

  // The handle is one this tab has cached; without the flag the lookup would
  // stop at the cache and the window's revalidation reserve would buy nothing.
  it('passes on that a grant was a revalidation', async () => {
    const h = harness([{ userName: 'alice', waitMs: 0, revalidate: true }])
    await h.poller.runOnce()
    expect(h.revalidated).toEqual(['alice'])
  })

  // The broker owns the pace and has just been told what this lookup cost, so
  // the poller's own opinion of when to go again would only be a stale copy.
  it('goes straight back to the broker after a lookup', async () => {
    const h = harness([{ userName: 'alice', waitMs: 99_999 }])
    expect(await h.poller.runOnce()).toBe(0)
  })

  it('waits exactly as long as it was told when given no handle', async () => {
    const h = harness([{ waitMs: 26_000 }])
    expect(await h.poller.runOnce()).toBe(26_000)
    expect(h.fetched).toEqual([])
  })

  it('keeps going after a failed lookup', async () => {
    const h = harness([{ userName: 'alice', waitMs: 0 }])
    h.failOnce()
    expect(await h.poller.runOnce()).toBe(0)
    expect(h.fetched).toEqual([])
  })

  // An evicted or reloading worker answers nothing. Background lookups are the
  // only casualty — hovers never come through here.
  it('backs off when the broker cannot be reached', async () => {
    const h = harness([null])
    expect(await h.poller.runOnce()).toBe(UNREACHABLE_RETRY_MS)
    expect(h.fetched).toEqual([])
  })
})

describe('the polling loop', () => {
  it('polls immediately on start, then on the broker’s schedule', async () => {
    const h = harness([{ userName: 'a', waitMs: 0 }, { waitMs: 26_000 }])
    h.poller.start()
    expect(h.delays[0]).toBe(0) // no reason to make the first lookup wait

    await h.drain(1)
    expect(h.fetched).toEqual(['a'])
    expect(h.delays[1]).toBe(0) // report just landed; ask again at once

    await h.drain(1)
    expect(h.delays[2]).toBe(26_000)
    h.poller.stop()
  })

  it('does nothing after stop()', async () => {
    const h = harness([{ userName: 'a', waitMs: 0 }])
    h.poller.start()
    h.poller.stop()
    await h.drain()
    expect(h.fetched).toEqual([])
    expect(h.poller.isRunning()).toBe(false)
  })

  it('ignores a second start()', () => {
    const h = harness([])
    h.poller.start()
    h.poller.start()
    expect(h.delays).toEqual([0])
    h.poller.stop()
  })

  it('drops the answer that lands after stop()', async () => {
    const h = harness([{ userName: 'a', waitMs: 0 }])
    h.poller.start()
    const running = h.drain(1)
    h.poller.stop()
    await running
    expect(h.delays).toHaveLength(1) // nothing rescheduled
  })

  // Fresh candidates should not sit behind a 26-second sleep that was scheduled
  // when there was nothing to do. The broker still answers with the paced gap,
  // so this can only bring a lookup as far forward as the pace already allowed.
  it('re-polls on wake() instead of finishing the current wait', async () => {
    const h = harness([{ waitMs: 30_000 }])
    h.poller.start()
    await h.drain(1)
    expect(h.delays[1]).toBe(30_000)

    h.poller.wake()
    expect(h.delays[2]).toBe(0)
    h.poller.stop()
  })

  // The window a flaky e2e test lived in: the startup poll asks an empty queue,
  // the timeline's users land while it is still out, and wake() therefore
  // arrives *before* the answer it should override. Scheduling on wake() alone
  // was not enough — the in-flight "nothing to do, wait 30s" replaced the
  // immediate re-poll a moment later, and the first feed flag came half a minute
  // after the page.
  it('does not let an in-flight poll bury a wake() that arrived during it', async () => {
    let answer!: (instruction: NextInstruction) => void
    const timers: Array<() => void> = []
    const delays: number[] = []

    const poller = new PrefetchPoller({
      next: () =>
        new Promise<NextInstruction>((resolve) => {
          answer = resolve
        }),
      fetch: async () => {},
      setTimer: (fn, ms) => {
        timers.push(fn)
        delays.push(ms)
        return timers.length - 1
      },
      clearTimer: () => {},
    })

    poller.start()
    timers.shift()!() // the poll goes out and hangs
    await Promise.resolve()

    poller.wake() // the timeline's users arrive
    answer({ waitMs: 30_000 }) // …and the broker answers the question from before
    await new Promise((r) => setTimeout(r, 0))

    expect(delays.at(-1)).toBe(0)
    poller.stop()
  })

  it('ignores wake() while stopped', () => {
    const h = harness([])
    h.poller.wake()
    expect(h.delays).toEqual([])
  })
})
