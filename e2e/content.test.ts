/**
 * Content script feature tests.
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import { test, expect, pinExtension } from './fixtures';

test.beforeEach(async ({ context, extensionId }) => {
  await pinExtension(context, extensionId);
});

test('hovering a username triggers AboutAccountQuery and shows location', async ({ page }) => {
  await page.goto('https://x.com/home');

  const firstTweet = page.locator('article[data-testid="tweet"]').first();
  await firstTweet.waitFor({ timeout: 15_000 });

  // Read the screen name from the tweet before hovering.
  const usernameLink = firstTweet.locator('[data-testid="User-Name"] a[href^="/"]').first();
  const href = await usernameLink.getAttribute('href') ?? '';
  const screenName = href.replace(/^\//, '').split('/')[0];

  // Start watching for the API call before triggering the hover.
  const queryRequest = page.waitForRequest(/AboutAccountQuery/, { timeout: 15_000 });

  await usernameLink.hover();

  // Verify the request targets the username we hovered over.
  const req = await queryRequest;
  const variables = JSON.parse(new URL(req.url()).searchParams.get('variables') ?? '{}');
  expect(variables.screenName).toBe(screenName);

  // Extension injects .x-loc-info into the hover card once the response arrives.
  await expect(page.locator('[data-testid="HoverCard"] .x-loc-info')).toBeVisible({ timeout: 10_000 });
});
