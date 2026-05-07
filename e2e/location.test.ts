/**
 * Location display tests — one test per user archetype.
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 *
 * Archetypes:
 *   sotaproject    — accurate location, app-store source (📱 + flag)
 *   zgldz          — VPN detected (locationAccurate: false → ⚠ VPN badge)
 *   PooWorldOrderr — web-only source (flag only, no store block)
 */
import type { Locator, Page } from '@playwright/test';
import { test, expect, pinExtension } from './fixtures';

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LocationInfo = {
  basedIn: string | null;
  appStoreCountry: string | null;
  isVpn: boolean;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads all location fields the extension has rendered inside a hover card.
 *   basedIn        — title of .x-loc-icon-flag (the country name)
 *   appStoreCountry — country parsed from .x-loc-store-block title (the raw source string)
 *   isVpn          — whether .x-loc-icon-vpn is visible
 */
async function hoverCardLocation(card: Locator): Promise<LocationInfo> {
  // Single evaluate — synchronous DOM reads inside the browser with no per-element
  // timeouts. querySelector returns null for absent elements without waiting or
  // throwing, which is the correct Playwright pattern when elements may be absent.
  return card.evaluate((el) => {
    // makeIcon() adds both x-loc-icon and x-loc-icon-flag to the location flag.
    // The store block's inner flag has only x-loc-icon-flag, so the compound
    // selector uniquely targets the country flag and reads its title attribute.
    const flag = el.querySelector<HTMLElement>('.x-loc-icon.x-loc-icon-flag');
    const storeBlock = el.querySelector<HTMLElement>('.x-loc-store-block');
    const vpnBadge = el.querySelector('.x-loc-icon-vpn');

    const basedIn = flag?.title ?? null;
    const storeSource = storeBlock?.title ?? null;
    const isVpn = vpnBadge !== null;

    const m = storeSource?.match(/^(.+?)\s+(?:android\s+app|app\s+store)$/i);
    const appStoreCountry = m?.[1]?.trim() ?? null;

    return { basedIn, appStoreCountry, isVpn };
  });
}

/**
 * Navigates to /screenName/about and extracts the official location fields
 * from the rendered page — the authoritative ground truth for assertions.
 *   basedIn        — "Account based in [Country]"
 *   appStoreCountry — country from "... Android App / App Store" text
 *   isVpn          — whether the page mentions VPN / inaccurate location
 */
async function officialAccountLocation(page: Page, screenName: string): Promise<LocationInfo> {
  await page.goto(`https://x.com/${screenName}/about`);
  await page.waitForTimeout(2_000);

  // Walk every div[dir="ltr"] inside [data-testid="pivot"] elements.
  // Each row has two consecutive divs: label then value.
  return page.evaluate(() => {
    const divs = Array.from(document.querySelectorAll('[data-testid="pivot"] div[dir="ltr"]'));

    let basedIn: string | null = null;
    let appStoreCountry: string | null = null;
    let isVpn = false;

    for (let i = 0; i < divs.length; i++) {
      const label = divs[i].textContent?.trim() ?? '';
      const value = divs[i + 1]?.textContent?.trim() ?? '';

      if (label === 'Account based in') {
        basedIn = value || null;
        // VPN: X renders a shield-with-exclamation SVG after the value row
        // (instead of the default info-circle) when location_accurate is false.
        // The shield path is unique: starts with "M12 2c1.982".
        const pivot = divs[i].closest('[data-testid="pivot"]');
        const svgs = Array.from(pivot?.querySelectorAll('svg') ?? []);
        const lastSvg = svgs.at(-1);
        isVpn = !!lastSvg?.querySelector('path[d^="M12 2c1.982"]');
      }

      // App store source lives in the "Connected via" row, e.g. "Germany App Store".
      if (label === 'Connected via') {
        const m = value.match(/^(.+?)\s+(?:android\s+app|app\s+store)$/i);
        if (m) appStoreCountry = m[1].trim();
      }
    }

    return { basedIn, appStoreCountry, isVpn };
  });
}

/**
 * Navigates to the user's profile, finds the first status link authored by
 * that user, and returns the path (e.g. "/elonmusk/status/123").
 */
async function navigateToTweetDetail(page: Page, screenName: string): Promise<string> {
  await page.goto(`https://x.com/${screenName}`);
  const link = page
    .locator(`article[data-testid="tweet"] a[href*="/${screenName}/status/" i]`)
    .first();
  await link.waitFor({ timeout: 15_000 });
  const href = await link.getAttribute('href');
  if (!href) throw new Error(`No status link found for @${screenName}`);
  return href;
}

/**
 * Navigates to the user's own profile, hovers their first authored tweet,
 * and waits for the extension's AboutAccountQuery call to complete.
 */
async function hoverOwnTweet(page: Page, screenName: string): Promise<Locator> {
  await page.goto(`https://x.com/${screenName}`);

  // Case-insensitive href match: X normalises handles to lowercase in the DOM,
  // so "PooWorldOrderr" would not match without the `i` flag.
  // Exact href (not prefix) skips retweet attribution links.
  const usernameLink = page
    .locator(`article[data-testid="tweet"] [data-testid="User-Name"] a[href="/${screenName}" i]`)
    .first();
  await usernameLink.waitFor({ timeout: 15_000 });

  // Set up response capture before triggering the hover (fresh browser per test
  // means IDB cache is empty, so AboutAccountQuery always fires).
  const queryDone = page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });
  await usernameLink.hover();
  await queryDone;

  const card = page.locator('[data-testid="HoverCard"]');
  await card.locator('.x-loc-info').waitFor({ timeout: 10_000 });

  return card;
}

