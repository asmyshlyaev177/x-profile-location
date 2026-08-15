import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MSG } from './constants'
import { LookupBroker } from './lookup-broker'

// ---------------------------------------------------------------------------
// The broker's own rules are lookup-broker.test.ts. This file is about the
// plumbing around it: an MV3 worker is torn down after ~30s idle, so every
// answer has to be reconstructed from storage.session and written back before
// the handler returns. See "Cross-tab lookup broker" in CLAUDE.md.
// ---------------------------------------------------------------------------

type Listener = (...args: any[]) => any

function makeChrome(
  session: Record<string, unknown> = {},
  local: Record<string, unknown> = {},
) {
  const listeners: Record<string, Listener[]> = {}
  const on = (name: string) => ({
    addListener: (fn: Listener) => {
      ;(listeners[name] ??= []).push(fn)
    },
  })
  const sent: Array<{ tabId: number; message: any }> = []

  const chrome = {
    action: {
      setBadgeText: vi.fn().mockResolvedValue(undefined),
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
    },
    contextMenus: {
      create: vi.fn(),
      removeAll: vi.fn().mockResolvedValue(undefined),
      onClicked: on('contextMenus.onClicked'),
    },
    runtime: {
      onStartup: on('runtime.onStartup'),
      onInstalled: on('runtime.onInstalled'),
      onMessage: on('runtime.onMessage'),
    },
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) =>
          Object.fromEntries(
            ([] as string[])
              .concat(keys)
              .filter((k) => k in local)
              .map((k) => [k, local[k]]),
          ),
        ),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(local, items)
        }),
      },
      session: {
        get: vi.fn(async (key: string) => ({ [key]: session[key] })),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(session, items)
        }),
      },
      onChanged: on('storage.onChanged'),
    },
    tabs: {
      onRemoved: on('tabs.onRemoved'),
      query: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }]),
      sendMessage: vi.fn(async (tabId: number, message: unknown) => {
        sent.push({ tabId, message })
      }),
    },
  }

  return { chrome, listeners, sent, session, local }
}

let env: ReturnType<typeof makeChrome>

async function loadWorker(
  session: Record<string, unknown> = {},
  local: Record<string, unknown> = {},
) {
  vi.resetModules()
  env = makeChrome(session, local)
  ;(globalThis as unknown as Record<string, unknown>).chrome = env.chrome
  await import('./service-worker')
  return env
}

/** Drive one runtime message the way the browser would, and await the reply. */
// `null`, not `undefined`: passing undefined would fall back to the default.
function send(message: unknown, tabId: number | null = 7): Promise<any> {
  return new Promise((resolve) => {
    let answered = false
    for (const listener of env.listeners['runtime.onMessage'] ?? []) {
      const handled = listener(
        message,
        { tab: tabId == null ? undefined : { id: tabId } },
        (answer: unknown) => {
          answered = true
          resolve(answer)
        },
      )
      // A listener that returns anything but `true` is not the one replying.
      if (handled !== true) continue
    }
    // Fire-and-forget messages (CLEAR_CACHE) never call sendResponse.
    queueMicrotask(() => {
      if (!answered) setTimeout(() => resolve(undefined), 0)
    })
  })
}

const FOCUSED = { focused: true, visible: true }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('the broker over messages', () => {
  it('queues a tab’s candidates and hands one back', async () => {
    await loadWorker()
    await send({
      type: MSG.ENQUEUE,
      candidates: [{ userName: 'alice' }],
      tab: FOCUSED,
    })

    const answer = await send({ type: MSG.NEXT, tab: FOCUSED })
    expect(answer).toMatchObject({ userName: 'alice' })
  })

  it('keeps one tab’s queue separate from another’s ranking', async () => {
    await loadWorker()
    await send(
      {
        type: MSG.ENQUEUE,
        candidates: [{ userName: 'background' }],
        tab: { focused: false, visible: true },
      },
      8,
    )
    await send(
      {
        type: MSG.ENQUEUE,
        candidates: [{ userName: 'foreground' }],
        tab: FOCUSED,
      },
      7,
    )

    // Tab 8 polls, and is handed the focused tab's account: whoever asks does
    // the work, and the answer is broadcast to both.
    const answer = await send(
      { type: MSG.NEXT, tab: { focused: false, visible: true } },
      8,
    )
    expect(answer).toMatchObject({ userName: 'foreground' })
  })

  it('ignores a message from something that is not a tab', async () => {
    await loadWorker()
    expect(await send({ type: MSG.NEXT, tab: FOCUSED }, null)).toBeUndefined()
  })

  it('answers null rather than hanging when the broker throws', async () => {
    await loadWorker()
    env.chrome.storage.session.get.mockRejectedValueOnce(new Error('gone'))
    expect(await send({ type: MSG.NEXT, tab: FOCUSED })).toBeNull()
  })
})

describe('surviving eviction', () => {
  // The worker is killed between polls far more often than not: the paced gap
  // is ~26s and the idle timeout is ~30s.
  it('writes the queue to storage.session before it answers', async () => {
    await loadWorker()
    await send({
      type: MSG.ENQUEUE,
      candidates: [{ userName: 'alice' }],
      tab: FOCUSED,
    })

    expect(env.chrome.storage.session.set).toHaveBeenCalled()
    const stored = env.session.lookupBroker as { tabs: unknown[] }
    expect(stored.tabs).toHaveLength(1)
  })

  it('reads a queue back that a previous worker left behind', async () => {
    const previous = new LookupBroker()
    previous.enqueue(7, [{ userName: 'left-behind' }], FOCUSED)

    // A cold start: module scope is empty and only storage.session remembers.
    await loadWorker({
      lookupBroker: JSON.parse(JSON.stringify(previous.toJSON())),
    })

    const answer = await send({ type: MSG.NEXT, tab: FOCUSED })
    expect(answer).toMatchObject({ userName: 'left-behind' })
  })

  it('reads back a 429 a previous worker recorded', async () => {
    const previous = new LookupBroker()
    previous.report({ userName: 'a', spent: true, status: 429 })
    previous.enqueue(7, [{ userName: 'alice' }], FOCUSED)

    await loadWorker({
      lookupBroker: JSON.parse(JSON.stringify(previous.toJSON())),
    })

    const answer = await send({ type: MSG.NEXT, tab: FOCUSED })
    expect(answer.userName).toBeUndefined()
    expect(answer.waitMs).toBeGreaterThan(0)
  })

  it('starts clean when nothing was ever stored', async () => {
    await loadWorker()
    const answer = await send({ type: MSG.NEXT, tab: FOCUSED })
    expect(answer).toEqual({ waitMs: expect.any(Number) })
  })
})

describe('what every tab is told', () => {
  it('pushes the ledger to all of them after a lookup', async () => {
    await loadWorker()
    await send({
      type: MSG.REPORT,
      report: { userName: 'alice', spent: true, ok: true, remaining: 31 },
      tab: FOCUSED,
    })

    const rate = env.sent.filter((s) => s.message.type === MSG.RATE)
    expect(rate.map((s) => s.tabId)).toEqual([1, 2])
    expect(rate[0].message.rate.remaining).toBe(31)
  })

  it('names the account so the other tabs can redraw it', async () => {
    await loadWorker()
    await send({
      type: MSG.REPORT,
      report: { userName: 'alice', spent: true, ok: true },
      tab: FOCUSED,
    })

    const resolved = env.sent.filter((s) => s.message.type === MSG.RESOLVED)
    expect(resolved).toHaveLength(2)
    expect(resolved[0].message.userName).toBe('alice')
  })

  it('says nothing about an account X did not answer for', async () => {
    await loadWorker()
    await send({
      type: MSG.REPORT,
      report: { userName: 'alice', spent: true, ok: false, status: 500 },
      tab: FOCUSED,
    })

    expect(env.sent.some((s) => s.message.type === MSG.RESOLVED)).toBe(false)
    expect(env.sent.some((s) => s.message.type === MSG.RATE)).toBe(true)
  })

  it('survives a tab whose content script is not listening', async () => {
    await loadWorker()
    env.chrome.tabs.sendMessage.mockRejectedValue(new Error('no receiver'))
    await expect(
      send({
        type: MSG.REPORT,
        report: { userName: 'alice', spent: true, ok: true },
        tab: FOCUSED,
      }),
    ).resolves.toBeNull()
  })
})

describe('tabs coming and going', () => {
  it('forgets a closed tab’s queue', async () => {
    await loadWorker()
    await send({
      type: MSG.ENQUEUE,
      candidates: [{ userName: 'alice' }],
      tab: FOCUSED,
    })

    for (const listener of env.listeners['tabs.onRemoved'] ?? []) listener(7)
    await vi.waitFor(() => {
      const stored = env.session.lookupBroker as { tabs: unknown[] }
      expect(stored.tabs).toHaveLength(0)
    })
  })
})

// The share and the pacing mode used to be pushed into each tab's prefetcher.
// One broker means one place reads them — here — or two tabs could be pacing
// against different numbers.
describe('pacing settings', () => {
  const WINDOW = 15 * 60 * 1000

  async function gapAfterOneLookup(): Promise<number> {
    await send({
      type: MSG.ENQUEUE,
      candidates: [{ userName: 'a' }, { userName: 'b' }],
      tab: FOCUSED,
    })
    await send({ type: MSG.NEXT, tab: FOCUSED })
    await send({
      type: MSG.REPORT,
      report: {
        userName: 'a',
        spent: true,
        ok: true,
        limit: 50,
        remaining: 49,
      },
      tab: FOCUSED,
    })
    return (await send({ type: MSG.NEXT, tab: FOCUSED })).waitMs
  }

  // Milliseconds of real time pass between the grant and the poll, and the gap
  // is credited for them. The shares under test are tens of seconds apart.
  const aboutGap = (waitMs: number, expected: number) =>
    expect(waitMs).toBeCloseTo(expected, -2)

  it('reads the stored share rather than assuming the default', async () => {
    await loadWorker({}, { prefetchShare: 0.3 })
    // 0.3 of 50 is 15 lookups, so 35 are reserved and 14 of the 49 are ours.
    aboutGap(await gapAfterOneLookup(), WINDOW / 14)
  })

  it('picks up a share changed on the options page', async () => {
    await loadWorker({}, { prefetchShare: 0.3 })
    env.local.prefetchShare = 0.9

    for (const listener of env.listeners['storage.onChanged'] ?? []) {
      listener({ prefetchShare: { newValue: 0.9 } }, 'local')
    }
    await vi.waitFor(async () =>
      aboutGap(await gapAfterOneLookup(), WINDOW / 44),
    )
  })

  it('normalizes junk in storage instead of pacing on it', async () => {
    await loadWorker({}, { prefetchShare: 'nonsense', prefetchPacing: 42 })
    aboutGap(await gapAfterOneLookup(), WINDOW / 39) // the 0.8 default
  })

  it('ignores a change from another storage area', async () => {
    await loadWorker({}, { prefetchShare: 0.3 })
    for (const listener of env.listeners['storage.onChanged'] ?? []) {
      listener({ prefetchShare: { newValue: 0.9 } }, 'sync')
    }
    aboutGap(await gapAfterOneLookup(), WINDOW / 14)
  })
})

describe('clearing the cache', () => {
  it('lets every handle be asked about again, and tells the tabs', async () => {
    await loadWorker()
    await send({
      type: MSG.REPORT,
      report: { userName: 'alice', spent: true, ok: true },
      tab: FOCUSED,
    })
    await send({ type: MSG.CLEAR_CACHE })

    await vi.waitFor(() => {
      const stored = env.session.lookupBroker as { asked: unknown[] }
      expect(stored.asked).toEqual([])
    })
    expect(env.sent.some((s) => s.message.type === MSG.CLEAR_CACHE)).toBe(true)
  })
})
