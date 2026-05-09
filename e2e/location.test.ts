/**
 * Location display tests — one test per user archetype.
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 *
 * Archetypes:
 *   sotaproject    — accurate location, app-store source (📱 + flag)
 *   zgldz          — VPN detected (locationAccurate: false → ⚠ VPN badge)
 *   PooWorldOrderr — web-only source (flag only, no store block)
 */
import { test, expect, pinExtension } from './fixtures';
import { hoverCardLocation, hoverOwnTweet, navigateToTweetDetail, officialAccountLocation, readIdb } from './helpers';

test.beforeEach(async ({ context, extensionId }) => {
  await pinExtension(context, extensionId);
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('accurate location matches About page', async ({ page }) => {
  const card = await hoverOwnTweet(page, 'sotaproject');
  const fromCard = await hoverCardLocation(card);
  const fromPage = await officialAccountLocation(page, 'sotaproject');

  // basedIn and appStoreCountry are visible on the About page — compare directly.
  expect(fromCard.basedIn).toBe(fromPage.basedIn);
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry);
  // isVpn is not shown on the About page; assert the archetype expectation only.
  expect(fromCard.isVpn).toBe(false);
});

test('VPN warning matches About page', async ({ page }) => {
  const card = await hoverOwnTweet(page, 'zgldz');
  const fromCard = await hoverCardLocation(card);
  const fromPage = await officialAccountLocation(page, 'zgldz');

  expect(fromCard.basedIn).toBe(fromPage.basedIn);
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry);
  expect(fromCard.isVpn).toBe(fromPage.isVpn);
  // fromCard.isVpn is captured via isVisible() in hoverCardLocation while the
  // card is still live; checking the locator again after officialAccountLocation
  // navigates away would always fail.
  expect(fromCard.isVpn).toBe(true);
});

test('no app store block; location matches About page', async ({ page }) => {
  const card = await hoverOwnTweet(page, 'PooWorldOrderr');
  const fromCard = await hoverCardLocation(card);
  const fromPage = await officialAccountLocation(page, 'PooWorldOrderr');

  expect(fromCard.basedIn).toBe(fromPage.basedIn);
  expect(fromCard.appStoreCountry).toBe(fromPage.appStoreCountry);
  // isVpn is not shown on the About page; assert the archetype expectation only.
  expect(fromCard.appStoreCountry).toBeNull();
  expect(fromCard.isVpn).toBe(false);
});

test('tweet detail: inline location for author, hover location for first reply', async ({ page }) => {
  // Navigate to elonmusk's profile to discover the first tweet URL dynamically
  // so the test works with whatever tweet is at the top at recording time.
  const tweetPath = await navigateToTweetDetail(page, 'elonmusk');

  // Opening the detail page triggers an AboutAccountQuery for the author.
  const authorQueryDone = page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });
  await page.goto(`https://x.com${tweetPath}`);
  await authorQueryDone;

  // Author's location is injected inline into the first article on the detail page.
  const authorArticle = page.locator('article[data-testid="tweet"]').first();
  await authorArticle.locator('.x-loc-info').waitFor({ timeout: 10_000 });
  const authorLocation = await hoverCardLocation(authorArticle);
  expect(authorLocation.basedIn).not.toBeNull();

  // Hover the first reply's username to trigger a location fetch for that user.
  const firstReplyArticle = page.locator('article[data-testid="tweet"]').nth(1);
  const replyLink = firstReplyArticle
    .locator('[data-testid="User-Name"] a[href^="/"]')
    .first();
  await replyLink.waitFor({ timeout: 15_000 });

  const replyQueryDone = page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });
  await replyLink.hover();
  await replyQueryDone;

  const replyCard = page.locator('[data-testid="HoverCard"]');
  await replyCard.locator('.x-loc-info').waitFor({ timeout: 10_000 });
  const replyLocation = await hoverCardLocation(replyCard);
  expect(replyLocation.basedIn).not.toBeNull();
});

test('tweet detail: hover location shown for second-level reply', async ({ page }) => {
  const tweetPath = await navigateToTweetDetail(page, 'elonmusk');

  await page.goto(`https://x.com${tweetPath}`);
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });

  // Click the first reply to open its own detail page; second-level replies appear there.
  const firstReplyArticle = page.locator('article[data-testid="tweet"]').nth(1);
  const replyStatusLink = firstReplyArticle
    .locator('a[href*="/status/"]')
    .first();
  await replyStatusLink.waitFor({ timeout: 15_000 });
  await replyStatusLink.click();
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });

  // On the reply's detail page, hover the first reply (= second-level reply).
  const secondLevelReplyArticle = page.locator('article[data-testid="tweet"]').nth(1);
  const secondLevelLink = secondLevelReplyArticle
    .locator('[data-testid="User-Name"] a[href^="/"]')
    .first();
  await secondLevelLink.waitFor({ timeout: 15_000 });

  const replyQueryDone = page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });
  await secondLevelLink.hover();
  await replyQueryDone;

  const replyCard = page.locator('[data-testid="HoverCard"]');
  await replyCard.locator('.x-loc-info').waitFor({ timeout: 10_000 });
  const replyLocation = await hoverCardLocation(replyCard);
  expect(replyLocation.basedIn).not.toBeNull();
});

test('rate limit: toast shown on 429, badge in hover card, no further API calls', async ({ page }) => {
  await page.goto('https://x.com/NASAArtemis/status/2052108727839285751');
  await page.waitForTimeout(2_000);

  const replyLink = (n: number) =>
    page
      .locator('article[data-testid="tweet"]')
      .nth(n)
      .locator('[data-testid="User-Name"] a[href^="/"]:not([href*="/status/"])')
      .first();

  // Hover replies 1–3 with real API calls so location data is cached in IDB.
  for (let i = 1; i <= 3; i++) {
    const link = replyLink(i);
    await link.waitFor({ timeout: 15_000 });
    const queryDone = page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });
    await link.hover();
    await queryDone;
    const card = page.locator('[data-testid="HoverCard"]');
    await card.locator('.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn').first().waitFor({ timeout: 10_000 });
    await page.mouse.move(400, 30);
    await page.waitForTimeout(300);
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
      body: JSON.stringify({ errors: [{ code: 88, message: 'Rate limit exceeded' }] }),
    }),
  );

  // Hover reply 4 (not yet cached) — triggers API call, gets 429, shows toast.
  const link4 = replyLink(4);
  await link4.waitFor({ timeout: 15_000 });
  await link4.hover();
  const toast = page.locator('#x-loc-rate-toast');
  await expect(toast).toBeVisible({ timeout: 10_000 });
  expect(await toast.textContent()).toMatch(/resets in/i);
  // Hover card for the uncached reply shows the rate limit badge.
  const rateLimitCard = page.locator('[data-testid="HoverCard"]');
  await rateLimitCard.locator('.x-loc-icon-ratelimit').waitFor({ timeout: 10_000 });
  await page.mouse.move(400, 30);
  await page.waitForTimeout(300);

  // Re-hover reply 1 — rate limit active so no API call fires, but IDB has data.
  const extraCallFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);
  await replyLink(1).hover();
  expect(await extraCallFired).toBe(false);
  // Cached location (flag or app-store badge) is shown despite the active rate limit.
  const cachedCard = page.locator('[data-testid="HoverCard"]');
  await cachedCard.locator('.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn').first().waitFor({ timeout: 10_000 });
});

test('clear cache button empties IDB and forces fresh API call on re-hover', async ({ page, context, extensionId }) => {
  // Hover to populate IDB for sotaproject.
  await hoverOwnTweet(page, 'sotaproject');

  // IDB should contain the lowercased username key before clearing.
  const keysBefore = await readIdb(page);
  expect(keysBefore).toContain('sotaproject');

  // Open the options page and click "Clear location cache".
  const optionsPage = await context.newPage();
  await optionsPage.goto(`chrome-extension://${extensionId}/pages/options.html`);
  // Use a class selector so the locator survives the text change after clicking.
  const clearBtn = optionsPage.locator('[class*="clearCacheBtn"]');
  await clearBtn.waitFor({ timeout: 5_000 });
  await clearBtn.click();
  // Button text flips to "Cache cleared!" once the message round-trip completes.
  await expect(clearBtn).toHaveText('Cache cleared!', { timeout: 5_000 });
  await optionsPage.close();

  // Give the content script time to process the relayed CLEAR_CACHE message.
  await page.waitForTimeout(500);

  // IDB must now be empty.
  const keysAfter = await readIdb(page);
  expect(keysAfter).toHaveLength(0);

  // Move mouse away to dismiss any open hover card.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);

  // Re-hover the same user — checkedThisSession was also cleared, so a fresh
  // AboutAccountQuery must fire instead of being short-circuited.
  const queryFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 8_000 })
    .then(() => true)
    .catch(() => false);

  const usernameLink = page
    .locator('article[data-testid="tweet"] [data-testid="User-Name"] a[href="/sotaproject" i]')
    .first();
  await usernameLink.hover();

  expect(await queryFired).toBe(true);
});

test('second hover uses checkedThisSession cache — no repeat API call', async ({ page }) => {
  // First hover: populates checkedThisSession and IDB for this username.
  await hoverOwnTweet(page, 'sotaproject');

  // Move mouse to a neutral spot to dismiss the hover card.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(400);

  // Register the listener BEFORE the second hover so no request can slip through.
  const queryFired = page
    .waitForRequest(/AboutAccountQuery/, { timeout: 3_000 })
    .then(() => true)
    .catch(() => false);

  // Hover the same username again.
  const usernameLink = page
    .locator('article[data-testid="tweet"] [data-testid="User-Name"] a[href="/sotaproject" i]')
    .first();
  await usernameLink.hover();

  // Extension reads from checkedThisSession → no network request should fire.
  expect(await queryFired).toBe(false);

  // Location is still shown from the in-memory / IDB data.
  const card = page.locator('[data-testid="HoverCard"]');
  await card.locator('.x-loc-info').waitFor({ timeout: 5_000 });
  const { basedIn } = await hoverCardLocation(card);
  expect(basedIn).not.toBeNull();
});


