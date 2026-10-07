/**
 * Which place a blocked location goes by (LOCATION_MATCHING_KEY): the app
 * store's country or the location X states, and whether a location X flags as
 * VPN may count at all.
 *
 * Both location sources are mocked to one answer for every account on the page,
 * as in hide-blocked.test.ts, so each test picks the store, the location and the
 * flag X reports. What is real is X's timeline, the extension's own pages, and
 * the hop from a setting through chrome.storage to a post already on screen.
 * India is on the default block list and the United States is not.
 *
 * Every test starts from a hidden post, so no assertion waits on a post merely
 * not having been judged yet: "not hidden" only ever follows "hidden".
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  mockAboutAccount,
  mockSharedCache,
  mostLikedReply,
  openPopupPage,
  openPopupSection,
  setCheckboxOption,
  setPreferredPlace,
} from './helpers'
import { CACHE_API_BASE } from '../src/scripts/constants'

const NASA_TWEET = 'https://x.com/NASAArtemis/status/2052108727839285751'
const HIDDEN = 'data-x-loc-hidden'
const US_STORE = 'United States App Store'
const VPN_BOX = 'Block VPN locations too'
const WEB_BOX = 'Match web accounts by location'

/** Every account on the page answers this, from X and the community cache alike. */
async function mockEveryAccount(
  page: Page,
  about: { location: string; source: string; isAccurate: boolean },
): Promise<void> {
  // The same answer from both, or a first-hand lookup would overwrite the
  // cached one partway through and move the post under the assertion.
  await mockSharedCache(page, {
    loc: about.location,
    src: about.source,
    acc: about.isAccurate,
    conf: 1,
  })
  await mockAboutAccount(page, {
    account_based_in: about.location,
    source: about.source,
    location_accurate: about.isAccurate,
  })
}

test.beforeEach(() => {
  test.skip(
    CACHE_API_BASE.length === 0,
    'community cache disabled — CACHE_API_BASE is empty',
  )
})

test('going by the location catches an account whose app store is elsewhere', async ({
  page,
  context,
  extensionId,
}) => {
  await mockEveryAccount(page, {
    location: 'India',
    source: US_STORE,
    isAccurate: true,
  })
  await setPreferredPlace(context, extensionId, 'location')

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 15_000,
  })
  await expect(article.locator('.x-loc-hidden-label')).toHaveText(/India/)

  // Back to the store, which is on no list: the post returns where it stands.
  await setPreferredPlace(context, extensionId, 'store')
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 10_000 })
})

test('a location X flags as VPN counts only while the box is ticked', async ({
  page,
  context,
  extensionId,
}) => {
  await mockEveryAccount(page, {
    location: 'India',
    source: US_STORE,
    isAccurate: false,
  })
  await setPreferredPlace(context, extensionId, 'location')
  await setCheckboxOption(context, extensionId, VPN_BOX, true)

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 15_000,
  })

  await setCheckboxOption(context, extensionId, VPN_BOX, false)
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 10_000 })

  await setCheckboxOption(context, extensionId, VPN_BOX, true)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 10_000,
  })
})

test('a store and location that agree are caught whatever the VPN flag says', async ({
  page,
  context,
  extensionId,
}) => {
  // Going by the location with the box unticked, a VPN-flagged location alone
  // is skipped, so agreeing with the store is the only thing left to catch it.
  await mockEveryAccount(page, {
    location: 'India',
    source: 'India App Store',
    isAccurate: false,
  })
  await setPreferredPlace(context, extensionId, 'location')

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 15_000,
  })
})

test('turning web accounts off in the popup releases an account with no app store', async ({
  page,
  context,
  extensionId,
}) => {
  // X's own word for an account with no store, as the recordings carry it.
  await mockEveryAccount(page, {
    location: 'India',
    source: 'Web',
    isAccurate: true,
  })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 15_000,
  })

  const popup = await openPopupPage(context, extensionId)
  await openPopupSection(popup, 'Blocked locations')
  const webBox = popup.getByLabel(WEB_BOX)

  await webBox.setChecked(false)
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 10_000 })

  await webBox.setChecked(true)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', {
    timeout: 10_000,
  })
  await popup.close()
})
