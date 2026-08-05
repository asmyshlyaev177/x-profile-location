/**
 * "Show location in feed 📍" tests — SHOW_LOCATION_IN_FEED_KEY, on by default.
 *
 * The setting has two injection paths in content.tsx, one per test:
 *   refreshFeedLocations()      — flipping it on re-walks the timeline and adds a
 *                                 row to every article whose author is in IDB
 *   injectFeedLocationForUser() — with it already on, a completing fetch drops the
 *                                 row into that author's articles there and then
 *
 * The primary tweet of a detail page is excluded from both (it gets the inline
 * row instead), which the second test pins down.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  hoverCardLocation,
  hoverOwnTweet,
  mockLocationApis,
  PRIMARY_TWEET,
  TWEET_ARTICLE,
  tweetArticles,
} from './helpers'

const NASA_TWEET = 'https://x.com/NASAArtemis/status/2052108727839285751'

const FEED_ROW = '.x-loc-feed-row'
// Any icon the row can carry — its presence means the author had something to
// show, as opposed to an author X returns no location for.
const ANY_LOCATION_ICON =
  '.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn'

test('feed rows appear for cached authors when the setting is switched on, and are stripped when switched off', async ({
  page,
  context,
  extensionId,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  // The setting ships on, so this test has to switch it off before it can watch
  // it come back on.
  await setShowLocationInFeed(context, extensionId, false)
  await expect(page.locator(FEED_ROW)).toHaveCount(0, { timeout: 10_000 })

  // Hover once to put this author in IDB. The setting is off, so the timeline
  // itself must stay untouched no matter what the hover fetched.
  const card = await hoverOwnTweet(page, 'sotaproject')
  const fromCard = await hoverCardLocation(card)
  await expect(page.locator(FEED_ROW)).toHaveCount(0)

  // Dismiss the hover card — its own .x-loc-info is built by the same helper and
  // would otherwise be indistinguishable from a feed row.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)

  await setShowLocationInFeed(context, extensionId, true)

  // refreshFeedLocations() reads IDB only — no second API call for a known author.
  const feedRow = page.locator(`${TWEET_ARTICLE} ${FEED_ROW}`).first()
  await expect(feedRow).toBeVisible({ timeout: 10_000 })

  // Same data as the hover card: both rows come from buildInfoRow(), so the flag
  // title and app-store block read identically.
  const inFeed = await hoverCardLocation(feedRow)
  expect(inFeed.basedIn).toBe(fromCard.basedIn)
  expect(inFeed.appStoreCountry).toBe(fromCard.appStoreCountry)
  expect(inFeed.isVpn).toBe(fromCard.isVpn)

  await setShowLocationInFeed(context, extensionId, false)
  await expect(page.locator(FEED_ROW)).toHaveCount(0, { timeout: 10_000 })
})

test('feed row lands on the replying author, not the primary tweet, when a hover fetch completes', async ({
  page,
  context,
  extensionId,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  // On before navigating, so the content script picks it up at startup.
  await setShowLocationInFeed(context, extensionId, true)

  await page.goto(NASA_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  // Replies vary between recordings, so take the first one X actually returns
  // location data for rather than trusting a fixed index to be interesting.
  let checked = false
  for (let i = 1; i <= 3 && !checked; i++) {
    const reply = tweetArticles(page).nth(i)
    const replyLink = reply
      .locator('[data-testid="User-Name"] a[href^="/"]:not([href*="/status/"])')
      .first()
    await replyLink.waitFor({ timeout: 15_000 })

    const queryDone = page
      .waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })
      .catch(() => null)
    await replyLink.hover()
    await queryDone

    const hasData = await page
      .locator('[data-testid="HoverCard"]')
      .locator(ANY_LOCATION_ICON)
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false)

    if (hasData) {
      // The row goes into the reply's own article, not just the hover card.
      await expect(reply.locator(FEED_ROW)).toBeVisible({ timeout: 10_000 })
      checked = true
    }

    await page.mouse.move(400, 30)
    await page.waitForTimeout(300)
  }

  expect(checked, 'no reply in the recording returned location data').toBe(true)

  // The primary tweet is served by the inline row (.x-loc-info without the feed
  // class), so a feed row there would mean a duplicate.
  await expect(page.locator(`${PRIMARY_TWEET} ${FEED_ROW}`)).toHaveCount(0)
})

// ---------------------------------------------------------------------------
// Options-page helper
// ---------------------------------------------------------------------------

async function setShowLocationInFeed(
  context: BrowserContext,
  extensionId: string,
  enabled: boolean,
): Promise<void> {
  const optPage = await context.newPage()
  await optPage.goto(`chrome-extension://${extensionId}/pages/options.html`)

  const toggle = optPage
    .locator('label:has-text("Show location in feed") input[type="checkbox"]')
    .first()
  await toggle.waitFor({ timeout: 5_000 })
  await toggle.setChecked(enabled)

  // The checkbox is controlled by the same state the onChange writes to storage,
  // so it only settles once chrome.storage.local.set has been called.
  await expect(toggle).toBeChecked({ checked: enabled, timeout: 3_000 })
  await optPage.close()
}
