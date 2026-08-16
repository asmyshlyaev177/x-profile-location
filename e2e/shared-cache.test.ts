/**
 * Community cache tests (shared-cache.ts ↔ CACHE_API_BASE).
 *
 * The Worker is mocked in both directions — a real one would answer differently
 * depending on what other users have contributed, and test data must never end
 * up in the shared consensus.
 *
 * Lookups feed the same IDB cache as a direct X call, so a hit means the flag
 * appears without spending any of the 50-per-15-minutes AboutAccountQuery budget;
 * contributions send a first-hand result back after a real lookup.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import { test, expect } from './fixtures'
import {
  hoverCardLocation,
  hoverForLocationRow,
  mockAboutAccount,
  mockSharedCache,
  mostLikedReply,
  setCheckboxOption,
  waitForReplies,
} from './helpers'
import { CACHE_API_BASE } from '../src/scripts/constants'

const NASA_TWEET = 'https://x.com/NASAArtemis/status/2052108727839285751'
const BUSY_THREAD = 'https://x.com/Did__Pihto/status/2083594910318412039'

/** The handle a status URL belongs to, as the community cache spells it. */
const threadAuthor = (url: string) =>
  new URL(url).pathname.split('/')[1].toLowerCase()

test.beforeEach(() => {
  test.skip(
    CACHE_API_BASE.length === 0,
    'community cache disabled — CACHE_API_BASE is empty',
  )
})

test('a community-cache hit shows the location without asking X for it', async ({
  page,
  context,
  extensionId,
}) => {
  // The background prefetcher queries on-screen accounts on its own schedule and
  // can race the cache write, which would make "did X get asked?" meaningless.
  // Off, the only thing left that could ask is the hover under test.
  await setCheckboxOption(
    context,
    extensionId,
    'Prefetch locations in the background',
    false,
  )

  const worker = await mockSharedCache(page, {
    loc: 'Germany',
    src: 'web',
    acc: true,
    conf: 1,
  })
  // A different answer than the Worker's, so a flag reading "Germany" can only
  // have come from the community cache.
  await mockAboutAccount(page, { account_based_in: 'Japan' })

  await page.goto(NASA_TWEET)

  // Timeline users are looked up as a batch as soon as the payload lands.
  await expect
    .poll(() => worker.served.length, { timeout: 15_000 })
    .toBeGreaterThan(0)

  const { link, screenName } = await mostLikedReply(page)
  expect(worker.served).toContain(screenName.toLowerCase())

  // Watch for an X lookup for this specific account — the background prefetcher
  // is free to query others, and would otherwise make this assertion meaningless.
  const askedX = page
    .waitForRequest(
      (r) =>
        r.url().includes('AboutAccountQuery') &&
        decodeURIComponent(r.url()).includes(`"screenName":"${screenName}"`),
      { timeout: 5_000 },
    )
    .then(() => true)
    .catch(() => false)

  const card = await hoverForLocationRow(page, link)
  const { basedIn } = await hoverCardLocation(card)
  expect(basedIn).toBe('Germany')
  expect(await askedX).toBe(false)
})

test('accounts answered once are never asked about again, not even after a reload', async ({
  page,
  context,
  extensionId,
}) => {
  // Prefetch would fill IDB from X in parallel and decide the second half of
  // this test for reasons that have nothing to do with the community cache.
  await setCheckboxOption(
    context,
    extensionId,
    'Prefetch locations in the background',
    false,
  )

  const worker = await mockSharedCache(page, {
    loc: 'Germany',
    src: 'web',
    acc: true,
    conf: 1,
  })
  await mockAboutAccount(page, { account_based_in: 'Japan' })

  await page.goto(BUSY_THREAD)
  await waitForReplies(page)
  await expect
    .poll(() => worker.served.length, { timeout: 15_000 })
    .toBeGreaterThan(0)
  expect(worker.served).toContain(threadAuthor(BUSY_THREAD))

  // The timeline arrives in several payloads; let the batches they trigger land.
  await page.waitForTimeout(3_000)
  const answered = new Set(worker.served)
  const before = worker.lookups.length

  // The client's "asked recently" map is per page load, so only the IDB check
  // stands between a reload and a second round of lookups for the same names.
  await page.reload()
  await waitForReplies(page)
  await page.waitForTimeout(3_000)

  const reAsked = worker.lookups
    .slice(before)
    .flatMap((l) => l.usernames)
    .filter((u) => answered.has(u))
  expect(reAsked).toEqual([])
})

test('a first-hand lookup is contributed back to the community cache', async ({
  page,
}) => {
  // Server has nothing: every account falls through to an X lookup, which is
  // what makes the result first-hand and worth contributing.
  const worker = await mockSharedCache(page, null)
  await mockAboutAccount(page, {
    account_based_in: 'Japan',
    source: 'Japan App Store',
  })

  await page.goto(NASA_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  const { link, screenName } = await mostLikedReply(page)
  await hoverForLocationRow(page, link)

  // Contributions ride a 30s batching window that the extension cuts short when
  // the tab goes away. Firing pagehide is that signal, and unlike backgrounding
  // the tab it works the same headless, headful and under xvfb — window events
  // cross into the content script's world, which is how page-script talks to it.
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')))

  // Exactly the location fields, and nothing else — bios and who-looked-up-whom
  // must never leave the browser.
  await expect
    .poll(
      () =>
        worker.contributions.find((c) => c.u === screenName.toLowerCase()) ??
        null,
      { timeout: 15_000 },
    )
    .toEqual({
      u: screenName.toLowerCase(),
      loc: 'Japan',
      src: 'Japan App Store',
      acc: true,
    })
})
