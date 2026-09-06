/**
 * Two real x.com tabs, one real service worker, one shared rate-limit window.
 *
 * Every property the lookup broker exists for belongs to *more than one tab*, so
 * nothing smaller can observe it: the queue and the pace live in the MV3 worker,
 * the cache lives in x.com's IndexedDB, and the only honest way to ask "did two
 * tabs spend two requests on the same account?" is to open two tabs and count
 * what reaches X.
 *
 * Nothing here mocks `chrome`. The extension is the built one from `dist/chrome`,
 * the worker is the browser's own — evictions included — and the only thing
 * intercepted is AboutAccountQuery itself, which is the thing being counted.
 *
 * See "Cross-tab lookup broker" in CLAUDE.md.
 */
import type { Page } from '@playwright/test'
import {
  prefetchBudget,
  revalidateBudget,
} from '../src/scripts/prefetch/prefetch-queue'
import { DEFAULT_PREFETCH_SHARE } from '../src/scripts/settings'
import { test, expect, setSettings } from './fixtures'
import { FEED_URL, type Lookup, serveStubX } from './x-stub'

const HANDLES = ['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot']

/** Both tabs on the same feed, so both queue the same accounts at once. */
async function twoTabsOnTheSameFeed(context: any) {
  const first: Page = await context.newPage()
  const second: Page = await context.newPage()
  const names = new Map<Page, string>([
    [first, 'first'],
    [second, 'second'],
  ])
  return {
    first,
    second,
    tabName: (page: Page) => names.get(page) ?? 'unknown',
    open: async () => {
      await Promise.all([first.goto(FEED_URL), second.goto(FEED_URL)])
      await Promise.all(
        [first, second].map((page) =>
          page
            .locator('article[data-testid="tweet"]')
            .first()
            .waitFor({ timeout: 15_000 }),
        ),
      )
    },
  }
}

const askedFor = (lookups: Lookup[]) => lookups.map((l) => l.screenName)

/** Every account was asked about at most once, whichever tab did the asking. */
function expectNoDuplicates(lookups: Lookup[]): void {
  const asked = askedFor(lookups)
  expect(asked).toEqual([...new Set(asked)])
}

/** X's per-window total for AboutAccountQuery, which the stub reports as its own. */
const RATE_LIMIT = 50

/**
 * The point below which everything left in the window is the user's. Asked of
 * the code that decides it, at the shipped share: over a full window the budget
 * is prefetch's entire share, so whatever it does not claim is the reserve.
 * Restating the arithmetic here is what made this file assert a 0.7 reserve for
 * five days after the default moved to 0.8.
 */
const USER_RESERVE =
  RATE_LIMIT -
  prefetchBudget(
    { remaining: RATE_LIMIT, limit: RATE_LIMIT, resetAt: 0, windowResetAt: 0 },
    DEFAULT_PREFETCH_SHARE,
    1,
  )

/** Lookups a window sets aside for re-asking about accounts already cached. */
const RESERVE_PER_WINDOW = revalidateBudget(
  { remaining: RATE_LIMIT, limit: RATE_LIMIT, resetAt: 0, windowResetAt: 0 },
  DEFAULT_PREFETCH_SHARE,
)

/**
 * Spend the share at the floor rather than one lookup every ~26 seconds. The
 * share is unchanged — this only stops each test waiting out a real window.
 */
const FAST = { prefetchPacing: 'instant', showLocationInFeed: true }

/**
 * Write a location straight into the extension's IDB, the way an earlier
 * session (or a community-cache hit) would have left it. Origin-scoped, so the
 * page has to be on x.com already; the store is created if the content script
 * has not needed it yet.
 */
async function seedCached(page: Page, userName: string): Promise<void> {
  await page.evaluate(
    (key) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('x-profile-location', 1)
        req.onupgradeneeded = () =>
          req.result.createObjectStore('location-data')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          const tx = db.transaction('location-data', 'readwrite')
          tx.objectStore('location-data').put(
            {
              data: {
                location: 'Japan',
                locationAccurate: true,
                source: 'web',
              },
              fetchedAt: Date.now(),
            },
            key,
          )
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => {
            db.close()
            reject(tx.error)
          }
        }
      }),
    userName,
  )
}

// A cached account is filtered out in the tab, before the worker ever sees it,
// so the only route back to X is the window's revalidation reserve: the tab
// offers what it knows on LOOKUP_ENQUEUE and the worker hands one back with
// `revalidate` set. Both halves are needed and neither can be seen alone.
test('an account this tab has cached is asked about again, ahead of the queue', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({ location: 'Japan' }),
    tabName: () => 'first',
  })
  // Nothing may be looked up before the cache is seeded, or `asked` covers the
  // seeded handle for the rest of the window and the reserve has nothing to do.
  await setSettings(context, extensionId, {
    ...FAST,
    backgroundPrefetch: false,
  })

  await page.goto(FEED_URL)
  await page.locator('article[data-testid="tweet"]').first().waitFor()
  await seedCached(page, HANDLES[0]!)
  const seeded = lookups.length

  // Explicitly back on: `storage.local.set` merges, so leaving the key out
  // would leave it false.
  await setSettings(context, extensionId, {
    ...FAST,
    backgroundPrefetch: true,
  })
  await page.reload()
  await page.locator('article[data-testid="tweet"]').first().waitFor()

  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(seeded)

  // Long enough for the rest of the feed to have been granted too.
  await new Promise((r) => setTimeout(r, 8_000))
  const asked = askedFor(lookups.slice(seeded))
  expect(asked[0]).toBe(HANDLES[0])
  // Once — the reserve is spent, and the fresh answer is cached again.
  expect(asked.filter((name) => name === HANDLES[0])).toHaveLength(1)
})

// The reserve is per window, so it has to come back when the window does. The
// broker only notices the boundary from inside next(), and after the reserve is
// spent the poller is asleep for IDLE_POLL_MS — long enough for a hover, which
// goes out without a grant, to report the *next* window's reset first. That is
// the shape that left revalidation switched off for the rest of a session.
test('the revalidation reserve comes back when a hover rolls the window', async ({
  context,
  extensionId,
}) => {
  // Two windows end to end, plus the 30s the poller sleeps between them.
  test.setTimeout(180_000)

  const cached = ['alpha', 'bravo', 'charlie']
  // A window that ends in seconds rather than 15 minutes; the arithmetic under
  // it is the shipped arithmetic.
  let windowEndsAt = Math.ceil(Date.now() / 1000) + 3600
  const lookups = await serveStubX(context, {
    handles: cached,
    answer: () => ({
      location: 'Japan',
      headers: {
        'x-rate-limit-limit': String(RATE_LIMIT),
        'x-rate-limit-remaining': String(RATE_LIMIT),
        'x-rate-limit-reset': String(windowEndsAt),
      },
    }),
    tabName: () => 'first',
  })
  await setSettings(context, extensionId, {
    ...FAST,
    backgroundPrefetch: false,
  })

  const page = await context.newPage()
  await page.goto(FEED_URL)
  await page.locator('article[data-testid="tweet"]').first().waitFor()
  for (const handle of cached) await seedCached(page, handle)

  // Everything the timeline holds is cached now, so the queue stays empty and
  // the reserve is the only thing that can reach X.
  await setSettings(context, extensionId, { ...FAST, backgroundPrefetch: true })
  const windowA = Date.now() + 15_000
  windowEndsAt = Math.ceil(windowA / 1000)
  await page.reload()
  await page.locator('article[data-testid="tweet"]').first().waitFor()

  const revalidations = () =>
    lookups.filter((l) => cached.includes(l.screenName)).length
  await expect.poll(revalidations, { timeout: 30_000 }).toBe(RESERVE_PER_WINDOW)

  // Nothing more this window: the reserve is spent and the poller is asleep.
  await new Promise((r) =>
    setTimeout(r, Math.max(0, windowA - Date.now()) + 1_000),
  )
  expect(revalidations()).toBe(RESERVE_PER_WINDOW)

  // A hover is not a grant, so this response — the first carrying the new
  // window — reaches the broker without next() ever seeing the old boundary.
  windowEndsAt = Math.ceil(Date.now() / 1000) + 900
  await page.evaluate(() => (window as any).hoverName('hovered'))
  await expect
    .poll(() => lookups.filter((l) => l.screenName === 'hovered').length, {
      timeout: 15_000,
    })
    .toBe(1)

  // The next idle poll is inside the new window, and it has a reserve again.
  await expect
    .poll(revalidations, { timeout: 60_000 })
    .toBeGreaterThan(RESERVE_PER_WINDOW)
})

test('two tabs never spend two requests on the same account', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  const lookups = await serveStubX(context, {
    handles: ['alpha', 'bravo'],
    // Two handles and a slow answer, deliberately: the answer has to still be
    // in flight when the next lookup is granted, or the shared IndexedDB dedups
    // on its own and the test passes whether or not anything is coordinating.
    // 3s clears the 1.5s pacing floor with room to spare.
    answer: () => ({ location: 'Japan', delayMs: 3_000 }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()

  // Both tabs see the same two authors and queue them in the same instant.
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2)

  // Long enough for the other tab's copies to have come up for a grant.
  await new Promise((r) => setTimeout(r, 8_000))
  expectNoDuplicates(lookups)
})

test('an account X has no location for is asked about once, not once per tab', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  // Nothing is written to the cache for an account X knows nothing about, so
  // IndexedDB cannot stop the second tab asking again. Only the worker's `asked`
  // can — and it has to manage it without persisting a negative answer, since
  // an account with no location today may have one next week.
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({ empty: true }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()

  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(4)

  expectNoDuplicates(lookups)
})

test('both tabs share one window rather than getting one each', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({
      location: 'Japan',
      headers: {
        'x-rate-limit-limit': String(RATE_LIMIT),
        // Two lookups left before the user's reserve begins.
        'x-rate-limit-remaining': String(USER_RESERVE + 2),
      },
    }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()

  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2)

  // The reserve is what stops background lookups eating the budget a hover
  // needs, and it is a property of the window — not of each tab's idea of it.
  await new Promise((r) => setTimeout(r, 4_000))
  expect(lookups.length).toBeLessThanOrEqual(4)
})

test('a limit one tab runs into stops the other tab too', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  const resetAt = Math.ceil(Date.now() / 1000) + 300
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({
      status: 429,
      headers: { 'x-rate-limit-reset': String(resetAt) },
    }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()

  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(0)

  // The countdown belongs in every tab, including one that never made a request
  // — it is the session that is out of budget, not the tab.
  const unlucky = lookups[0].tabId
  const spared = unlucky === 'first' ? tabs.second : tabs.first
  await expect(spared.locator('#x-loc-rate-toast')).toBeVisible({
    timeout: 20_000,
  })

  // And nothing keeps hammering X while the backoff is in force.
  const spentByThen = lookups.length
  await new Promise((r) => setTimeout(r, 5_000))
  expect(lookups.length).toBe(spentByThen)
})

test('what one tab resolves, the other draws without asking X again', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({ location: 'Japan' }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()

  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2)

  // Whichever tab paid for a lookup, both end up showing it.
  for (const tab of [tabs.first, tabs.second]) {
    await expect(tab.locator('.x-loc-feed-row').first()).toBeVisible({
      timeout: 20_000,
    })
  }
  expectNoDuplicates(lookups)
})

test('a tab closing does not strand the accounts it had queued', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({ location: 'Japan' }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(0)

  await tabs.second.close()
  const spentBefore = lookups.length

  // The survivor keeps draining — including whatever the closed tab had queued,
  // since the queue was never the tab's to begin with.
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(spentBefore)
  expectNoDuplicates(lookups)
})

// ---------------------------------------------------------------------------
// The window a hover spends from is the window the trickle is pacing against.
// Nothing coordinates them but X's own headers, and those only reach the broker
// because the tab passes them on for a hover exactly as it does for a lookup it
// was told to make.
// ---------------------------------------------------------------------------

/** The broker's own state, read back the way a restarted worker would read it. */
async function ledger(context: any) {
  const [worker] = context.serviceWorkers()
  const stored = await worker.evaluate(() =>
    chrome.storage.session.get('lookupBroker'),
  )
  return stored.lookupBroker as {
    rate: { limit: number; remaining: number; resetAt: number }
    asked: Array<[string, number]>
  }
}

const askedAbout = (state: { asked: Array<[string, number]> }) =>
  state.asked.map(([handle]) => handle)

test('a hover spends from the same window the trickle is pacing against', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  // X counts down for us: whatever the window has left is whatever it last said.
  let remaining = RATE_LIMIT
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({
      location: 'Japan',
      headers: {
        'x-rate-limit-limit': String(RATE_LIMIT),
        'x-rate-limit-remaining': String(--remaining),
      },
    }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()
  // Let the queue drain a little first, so the hover lands mid-trickle rather
  // than into an idle broker.
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThanOrEqual(2)

  // An account that is on nobody's timeline, so only the hover can explain it.
  await tabs.first.evaluate(() => (window as any).hoverName('hovered'))
  await expect
    .poll(() => lookups.filter((l) => l.screenName === 'hovered').length, {
      timeout: 15_000,
    })
    .toBe(1)

  await expect
    .poll(async () => askedAbout(await ledger(context)), { timeout: 15_000 })
    .toContain('hovered')

  // The count X last reported is the count the broker is pacing against — a
  // hover is not a lookup the broker granted, and it still costs the window.
  const state = await ledger(context)
  expect(state.rate.remaining).toBe(50 - lookups.length)

  // And the trickle carries on from where it was, without repeating itself.
  const drainedByThen = lookups.length
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(drainedByThen)
  expectNoDuplicates(lookups)
})

test('the trickle stops at the reserve a hover still has to spend from', async ({
  context,
  extensionId,
}) => {
  const tabs = await twoTabsOnTheSameFeed(context)
  // Report the window as already down to the reserve: background lookups have
  // nothing left, and everything still there belongs to the user.
  const lookups = await serveStubX(context, {
    handles: HANDLES,
    answer: () => ({
      location: 'Japan',
      headers: {
        'x-rate-limit-limit': String(RATE_LIMIT),
        'x-rate-limit-remaining': String(USER_RESERVE),
      },
    }),
    tabName: tabs.tabName,
  })
  await setSettings(context, extensionId, FAST)

  await tabs.open()
  await expect
    .poll(() => lookups.length, { timeout: 30_000 })
    .toBeGreaterThan(0)

  // One lookup was enough to learn the window is spent; nothing queued follows
  // it, in either tab.
  await new Promise((r) => setTimeout(r, 6_000))
  const backgroundSpend = lookups.length
  expect(backgroundSpend).toBeLessThanOrEqual(2)

  // The point of holding those 15 back: the user's own hover still goes through.
  await tabs.first.evaluate(() => (window as any).hoverName('hovered'))
  await expect
    .poll(() => lookups.filter((l) => l.screenName === 'hovered').length, {
      timeout: 15_000,
    })
    .toBe(1)
})

test('a run of manual hovers stretches the gap between background lookups', async ({
  context,
  extensionId,
}) => {
  // Three paced lookups either side of the hovers, at gaps that grow as the
  // budget shrinks. Longer than the default timeout allows for.
  test.setTimeout(150_000)

  const tabs = await twoTabsOnTheSameFeed(context)
  // Enough accounts that the queue never runs dry and stops the trickle for a
  // reason that has nothing to do with pacing.
  const handles = Array.from({ length: 40 }, (_, i) => `feed${i}`)
  let remaining = RATE_LIMIT
  // A window that rolls over in 90 seconds rather than 15 minutes. The gap is
  // `time left / budget left`, so this is what makes it measurable inside a
  // test — the arithmetic under it is the shipped arithmetic.
  const windowEndsAt = Math.ceil(Date.now() / 1000) + 90

  const lookups = await serveStubX(context, {
    handles,
    answer: () => ({
      location: 'Japan',
      headers: {
        'x-rate-limit-limit': String(RATE_LIMIT),
        'x-rate-limit-remaining': String(--remaining),
        'x-rate-limit-reset': String(windowEndsAt),
      },
    }),
    tabName: tabs.tabName,
  })
  // Deliberately not `FAST`: 'instant' pacing spends at the floor and has no
  // gap to stretch. This is the shipped 'spread' behaviour.
  await setSettings(context, extensionId, { showLocationInFeed: true })

  const paced = () => lookups.filter((l) => !l.screenName.startsWith('hover'))
  /** The gap the trickle is running at right now. */
  const lastGap = () => {
    const times = paced().map((l) => l.at)
    return times[times.length - 1] - times[times.length - 2]
  }
  const waitForPaced = async (count: number) =>
    expect
      .poll(() => paced().length, { timeout: 60_000 })
      .toBeGreaterThanOrEqual(count)

  await tabs.open()
  await waitForPaced(3)
  const gapBefore = lastGap()

  // Accounts the user looked up by hand, none of them queued. Hovers do not go
  // through the broker at all — the only thing that carries their cost back is
  // the window X reports afterwards. Half the window, so the stretch is well
  // clear of the gap's own jitter at any shipped share.
  const before = paced().length
  const hovered = Array.from({ length: 26 }, (_, i) => `hover${i}`)
  await tabs.first.evaluate(
    (names) => (window as any).hoverSeries(names, 80),
    hovered,
  )
  await expect
    .poll(
      () => lookups.filter((l) => l.screenName.startsWith('hover')).length,
      {
        timeout: 30_000,
      },
    )
    .toBe(hovered.length)

  // Three more paced lookups, not one: the first was already asleep on the old
  // gap when the hovers landed, so the gap after *it* is the first one computed
  // against the budget they left behind.
  await waitForPaced(before + 3)
  const gapAfter = lastGap()

  // Most of the share gone means far fewer lookups to spread over what is left
  // of the window, and the trickle slows to match without being told.
  expect(gapAfter).toBeGreaterThan(gapBefore * 1.5)
})
