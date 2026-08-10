/**
 * Location display tests — one test per user archetype.
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 *
 * Archetypes:
 *   svtv_news       — accurate location, app-store source (📱 + flag)
 *   zgldz           — VPN detected (locationAccurate: false → ⚠ VPN badge)
 *   TheCriticalDri2 — accurate, web-only source (flag only, no store block)
 *   sotaproject     — any account with a location; used by the cache tests
 *
 * An account's VPN status is X's call and can change under us: sotaproject and
 * visegrad24 held the first and third slots until X flagged both as inaccurate
 * in July 2026. Each test therefore asserts agreement with the account's own
 * About page (the real contract) *and* the archetype it was picked for — so a
 * flagged account fails loudly, saying it needs replacing rather than pretending
 * the extension is wrong.
 */
import { test, expect, pinExtension } from './fixtures'
import {
  hoverAnyReplyForLocation,
  hoverCardLocation,
  hoverForLocationRow,
  hoverOwnTweet,
  mockAboutAccount,
  mockLocationApis,
  mockSharedCache,
  navigateToTweetDetail,
  nthReply,
  officialAccountLocation,
  openOptionsPage,
  optionsSection,
  PRIMARY_TWEET,
  readIdb,
  TWEET_ARTICLE,
  tweetArticles,
} from './helpers'

test.beforeEach(async ({ context, extensionId }) => {
  await pinExtension(context, extensionId)
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('accurate location matches About page', async ({ page }) => {
  // X's own answer is the subject here, but the community cache must not be:
  // a live Worker hit would satisfy the lookup and the card would show its
  // value instead of the one the About page is about to be read for.
  await mockSharedCache(page, null)

  const card = await hoverOwnTweet(page, 'svtv_news')
  const fromCard = await hoverCardLocation(card)
  const fromPage = await officialAccountLocation(page, 'svtv_news')

  // basedIn and appStoreCountry are visible on the About page — compare directly.
  expect(fromCard.basedIn).toBe(fromPage.basedIn)
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry)
  expect(fromCard.isVpn).toBe(fromPage.isVpn)
  // The archetype: accurate location, app-store source. If X starts flagging
  // this account, swap in another accurate one rather than relaxing this.
  expect(fromCard.isVpn).toBe(false)
  expect(fromCard.appStoreCountry).not.toBeNull()
})

test('VPN warning matches About page', async ({ page }) => {
  // X's own answer is the subject here, but the community cache must not be:
  // a live Worker hit would satisfy the lookup and the card would show its
  // value instead of the one the About page is about to be read for.
  await mockSharedCache(page, null)

  const card = await hoverOwnTweet(page, 'zgldz')
  const fromCard = await hoverCardLocation(card)
  const fromPage = await officialAccountLocation(page, 'zgldz')

  expect(fromCard.basedIn).toBe(fromPage.basedIn)
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry)
  expect(fromCard.isVpn).toBe(fromPage.isVpn)
  // fromCard.isVpn is captured via isVisible() in hoverCardLocation while the
  // card is still live; checking the locator again after officialAccountLocation
  // navigates away would always fail.
  expect(fromCard.isVpn).toBe(true)
})

test('no app store block; location matches About page', async ({ page }) => {
  // X's own answer is the subject here, but the community cache must not be:
  // a live Worker hit would satisfy the lookup and the card would show its
  // value instead of the one the About page is about to be read for.
  await mockSharedCache(page, null)

  const card = await hoverOwnTweet(page, 'TheCriticalDri2')
  const fromCard = await hoverCardLocation(card)
  const fromPage = await officialAccountLocation(page, 'TheCriticalDri2')

  expect(fromCard.basedIn).toBe(fromPage.basedIn)
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry)
  expect(fromCard.isVpn).toBe(fromPage.isVpn)
  // The archetype: a web-only source, so no 📱 block at all — and accurate, so
  // the flag stands alone.
  expect(fromCard.appStoreCountry).toBeNull()
  expect(fromCard.isVpn).toBe(false)
})

test('tweet detail: inline location for author, hover location for first reply', async ({
  page,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  // Navigate to elonmusk's profile to discover the first tweet URL dynamically
  // so the test works with whatever tweet is at the top at recording time.
  const tweetPath = await navigateToTweetDetail(page, 'elonmusk')

  // Opening the detail page triggers an AboutAccountQuery for the author.
  const authorQueryDone = page.waitForResponse(/AboutAccountQuery/, {
    timeout: 15_000,
  })
  await page.goto(`https://x.com${tweetPath}`)
  await authorQueryDone

  // Author's location is injected inline into the first article on the detail page.
  const authorArticle = tweetArticles(page).first()
  await authorArticle.locator('.x-loc-info').waitFor({ timeout: 10_000 })
  const authorLocation = await hoverCardLocation(authorArticle)
  expect(authorLocation.basedIn).not.toBeNull()

  // Hover a reply's username to trigger a location fetch for that account. Which
  // reply doesn't matter — and can't be pinned down anyway, since X recycles the
  // rows while the page settles. This was the flakiest step in the suite.
  const replyCard = await hoverAnyReplyForLocation(page)
  const replyLocation = await hoverCardLocation(replyCard)
  expect(replyLocation.basedIn).not.toBeNull()
})

test('tweet detail: hover location shown for second-level reply', async ({
  page,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  const tweetPath = await navigateToTweetDetail(page, 'elonmusk')

  await page.goto(`https://x.com${tweetPath}`)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  // Open a reply's own detail page — second-level replies live there. The second
  // reply specifically: it is the one with replies of its own, and the recording
  // has its page. (The first reply's page has no replies, so the hover below
  // would find nothing to hover.)
  const replyStatusLink = (await nthReply(page, 2))
    .locator('a[href*="/status/"]')
    .first()
  await replyStatusLink.waitFor({ timeout: 15_000 })
  await replyStatusLink.click()
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  // On the reply's detail page, hover a reply (= a second-level reply).
  const replyCard = await hoverAnyReplyForLocation(page)
  const replyLocation = await hoverCardLocation(replyCard)
  expect(replyLocation.basedIn).not.toBeNull()
})

test('rate limit: toast shown on 429, badge in hover card, no further API calls', async ({
  page,
}) => {
  // Every lookup has to reach X for the 429 to mean anything — a community-cache
  // hit would satisfy some of them without a request. What X answers before the
  // 429 route goes up is irrelevant, so it is canned too.
  await mockLocationApis(page, { account_based_in: 'Germany' })

  await page.goto('https://x.com/NASAArtemis/status/2052108727839285751')
  await page.waitForTimeout(2_000)

  const replyLink = (n: number) =>
    page
      .locator(TWEET_ARTICLE)
      .nth(n)
      .locator('[data-testid="User-Name"] a[href^="/"]:not([href*="/status/"])')
      .first()

  // Hover replies 1–3 with real API calls so location data is cached in IDB.
  // A rendered location icon is proof the lookup completed; hoverForLocationRow
  // re-hovers if X swallowed the first one, which used to make this test flaky.
  for (let i = 1; i <= 3; i++) {
    const link = replyLink(i)
    await link.waitFor({ timeout: 15_000 })
    await hoverForLocationRow(page, link)
  }

  // Install 429 mock. Any subsequent API call gets a rate-limit response with a
  // reset timestamp 15 minutes in the future.
  await page.route(/AboutAccountQuery/, (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'x-rate-limit-reset': String(Math.floor(Date.now() / 1000) + 900),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        errors: [{ code: 88, message: 'Rate limit exceeded' }],
      }),
    }),
  )

  // Hover reply 4 (not yet cached) — triggers API call, gets 429, shows toast.
  const link4 = replyLink(4)
  await link4.waitFor({ timeout: 15_000 })
  await link4.hover()
  const toast = page.locator('#x-loc-rate-toast')
  await expect(toast).toBeVisible({ timeout: 10_000 })
  expect(await toast.textContent()).toMatch(/resets in/i)
  // Hover card for the uncached reply shows the rate limit badge.
  const rateLimitCard = page.locator('[data-testid="HoverCard"]')
  await rateLimitCard
    .locator('.x-loc-icon-ratelimit')
    .waitFor({ timeout: 10_000 })
  await page.mouse.move(400, 30)
  await page.waitForTimeout(300)

  // Re-hover reply 1 — rate limit active so no API call fires, but IDB has data.
  const extraCallFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false)
  await replyLink(1).hover()
  expect(await extraCallFired).toBe(false)
  // Cached location (flag or app-store badge) is shown despite the active rate limit.
  const cachedCard = page.locator('[data-testid="HoverCard"]')
  await cachedCard
    .locator('.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn')
    .first()
    .waitFor({ timeout: 10_000 })

  // Click the toast away. A real click, through the real stylesheet — this is
  // the assertion that pointer-events are on; the unit suite cannot see CSS.
  await toast.click()
  await expect(toast).toBeHidden()

  // A further blocked hover leaves the dismissal alone.
  await replyLink(4).hover()
  await page.waitForTimeout(1_500)
  await expect(toast).toBeHidden()
})

test('rate limit: the countdown hands the row back when its window ends', async ({
  page,
}) => {
  // A real reset is fifteen minutes out; this one has to be sat through, so it
  // is as short as it can be while still leaving the badge on screen and ticking
  // for a few seconds first. The waiting *is* the test — a countdown has to
  // reach zero for the behaviour under test to happen at all — so neither number
  // here is a timeout to trim.
  test.setTimeout(150_000)
  const WINDOW_SECONDS = 20

  // Straight to the status page, without the profile hop the detail tests take
  // to discover a post. Both would do, and this one keeps the window under our
  // control: the first refused lookup is the author's, on load, so the countdown
  // starts where the assertions are rather than a page-load earlier.
  await mockSharedCache(page, null)
  const aboutAccount = /AboutAccountQuery/
  await page.route(aboutAccount, (route) =>
    route.fulfill({
      status: 429,
      headers: {
        'x-rate-limit-reset': String(
          Math.floor(Date.now() / 1000) + WINDOW_SECONDS,
        ),
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        errors: [{ code: 88, message: 'Rate limit exceeded' }],
      }),
    }),
  )

  // A status page looks its author up on load, and that lookup is refused — so
  // the row under the handle is the countdown instead of a flag. This is the
  // surface the hover-card badge above cannot stand in for: X opens no hover
  // card for the account its own page is about, so this row is the only thing
  // that ever speaks for the author, and nothing re-runs it.
  await page.goto('https://x.com/elonmusk/status/2085377974396752305')
  const primaryTweet = page.locator(PRIMARY_TWEET)
  const badge = primaryTweet.locator('.x-loc-icon-ratelimit')
  await expect(badge).toBeVisible({ timeout: 20_000 })

  // X starts answering again — which the extension can only find out by asking,
  // once the window it was told about runs out.
  await page.unroute(aboutAccount)
  await mockAboutAccount(page, { account_based_in: 'Germany' })

  // The countdown reaches zero and stops being a countdown. It used to stop one
  // tick short instead and stay on the page reading "⏱ 1s" for good.
  await expect(badge).toBeHidden({ timeout: (WINDOW_SECONDS + 20) * 1_000 })

  // And the row goes back to what the countdown was standing in for, with no
  // hover and no reload: the window ending is itself the cue to ask again.
  await expect(
    primaryTweet.locator('.x-loc-icon-flag, .x-loc-store-block').first(),
  ).toBeVisible({ timeout: 15_000 })
})

test('clear cache button empties IDB and forces fresh API call on re-hover', async ({
  page,
  context,
  extensionId,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  // Hover to populate IDB for sotaproject.
  await hoverOwnTweet(page, 'sotaproject')

  // IDB should contain the lowercased username key before clearing.
  const keysBefore = await readIdb(page)
  expect(keysBefore).toContain('sotaproject')

  // Open the options page and click "Clear location cache". Scoped to its own
  // section (which selects the Data & privacy tab first — a section is only in
  // the DOM while its tab is showing) rather than to a class name: this read
  // `[class*="clearCacheBtn"]` until the Phase 2 redesign renamed the class to
  // `dangerBtn`, and a class selector fails silently the moment the styling is
  // touched.
  const optionsPage = await openOptionsPage(context, extensionId)
  const clearBtn = (await optionsSection(optionsPage, 'cache')).locator(
    'button',
  )
  await clearBtn.click()
  // Button text flips once the message round-trip completes.
  await expect(clearBtn).toHaveText('Cache cleared', { timeout: 5_000 })
  await optionsPage.close()

  // Give the content script time to process the relayed CLEAR_CACHE message.
  await page.waitForTimeout(500)

  // IDB must now be empty.
  const keysAfter = await readIdb(page)
  expect(keysAfter).toHaveLength(0)

  // Move mouse away to dismiss any open hover card.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)

  // Re-hover the same user — checkedThisSession was also cleared, so a fresh
  // AboutAccountQuery must fire instead of being short-circuited.
  const queryFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false)

  const usernameLink = page
    .locator(
      `${TWEET_ARTICLE} [data-testid="User-Name"] a[href="/sotaproject" i]`,
    )
    .first()
  await usernameLink.hover()

  expect(await queryFired).toBe(true)
})

test('second hover uses checkedThisSession cache — no repeat API call', async ({
  page,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })

  // First hover: populates checkedThisSession and IDB for this username.
  await hoverOwnTweet(page, 'sotaproject')

  // Move mouse to a neutral spot to dismiss the hover card.
  await page.mouse.move(0, 0)
  await page.waitForTimeout(400)

  // Register the listener BEFORE the second hover so no request can slip through.
  const queryFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false)

  // Hover the same username again.
  const usernameLink = page
    .locator(
      `${TWEET_ARTICLE} [data-testid="User-Name"] a[href="/sotaproject" i]`,
    )
    .first()
  await usernameLink.hover()

  // Extension reads from checkedThisSession → no network request should fire.
  expect(await queryFired).toBe(false)

  // Location is still shown from the in-memory / IDB data.
  const card = page.locator('[data-testid="HoverCard"]')
  await card.locator('.x-loc-info').waitFor({ timeout: 5_000 })
  const { basedIn } = await hoverCardLocation(card)
  expect(basedIn).not.toBeNull()
})
