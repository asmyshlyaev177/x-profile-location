/**
 * The bio the extension holds for an account outlives the location lookup for
 * the same account.
 *
 * A bio reaches the extension with TweetDetail and a location with the lookup,
 * and the two often land together. The lookup used to write back the bio it had
 * read before its request went out, erasing one that arrived meanwhile - and
 * with it every keyword highlight and restored bio that account had.
 *
 * Archetype:
 *   svtv_news — named here and in location.test.ts, so the scrub keeps its bio.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { Request } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  mockAboutAccount,
  mockSharedCache,
  readCachedData,
  TWEET_ARTICLE,
  waitForCachedBio,
} from './helpers'

const ACCOUNT = 'svtv_news'

const isLookupOf = (request: Request): boolean =>
  /AboutAccountQuery/.test(request.url()) &&
  decodeURIComponent(request.url())
    .toLowerCase()
    .includes(`"screenname":"${ACCOUNT}"`)

test('a bio that lands while its account is being looked up survives the lookup', async ({
  page,
}) => {
  let release!: () => void
  const released = new Promise<void>((resolve) => (release = resolve))
  await mockSharedCache(page, null)
  await mockAboutAccount(
    page,
    { account_based_in: 'Germany' },
    { until: released },
  )

  // The profile first: page-script.ts reads no bios from a profile timeline, so
  // the lookup starting here has nothing cached. Prefetch may start it before
  // the hover does, hence the wait set up before the page loads.
  const lookupSent = page.waitForRequest(isLookupOf)
  await page.goto(`https://x.com/${ACCOUNT}`)
  await page
    .locator(
      `${TWEET_ARTICLE} [data-testid="User-Name"] a[href="/${ACCOUNT}" i]`,
    )
    .first()
    .hover()
  await lookupSent

  // Its post's page delivers the bio while that lookup is still held.
  await page.mouse.move(0, 0)
  await page
    .locator(`${TWEET_ARTICLE} a[href*="/${ACCOUNT}/status/" i]`)
    .first()
    .click()
  const bio = await waitForCachedBio(page, ACCOUNT)

  release()
  await expect
    .poll(async () => (await readCachedData(page, ACCOUNT))?.location, {
      timeout: 15_000,
    })
    .toBe('Germany')
  expect((await readCachedData(page, ACCOUNT))?.bio).toBe(bio)
})
