/**
 * Keyword highlight tests.
 *
 * Archetypes:
 *   MRNFT_X       — bio contains standalone "nft" → should highlight
 *   OldRoberts953 — "nft" only appears inside a longer word → must NOT highlight
 *                   (regression test for the word-boundary false-positive bug)
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { BrowserContext } from '@playwright/test';
import { test, expect } from './fixtures';

const MRNFT_TWEET = 'https://x.com/MRNFT_X/status/2053116341926629624';
const OLD_ROBERTS_TWEET = 'https://x.com/OldRoberts953/status/2053099310741401905';

test('keyword highlights article when bio contains it as a standalone word, removing it un-highlights', async ({ page, context, extensionId }) => {
  await page.goto(MRNFT_TWEET);

  // AboutAccountQuery completing means bio (from page-script timeline event) and
  // location data are both merged into IDB — safe to trigger rehighlightAll now.
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });

  const authorArticle = page.locator('article[data-testid="tweet"]').first();
  await authorArticle.waitFor({ timeout: 10_000 });

  await addKeyword(context, extensionId, 'nft');
  await expect(authorArticle).toHaveAttribute('data-x-loc-highlighted', { timeout: 5_000 });

  await removeKeyword(context, extensionId, 'nft');
  await expect(authorArticle).not.toHaveAttribute('data-x-loc-highlighted', { timeout: 5_000 });
});

test('keyword does not highlight when it only appears inside a longer word (regression)', async ({ page, context, extensionId }) => {
  await page.goto(OLD_ROBERTS_TWEET);

  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 });

  const authorArticle = page.locator('article[data-testid="tweet"]').first();
  await authorArticle.waitFor({ timeout: 10_000 });

  await addKeyword(context, extensionId, 'nft');

  // Give rehighlightAll time to finish — the attribute must stay absent.
  await page.waitForTimeout(1_000);
  await expect(authorArticle).not.toHaveAttribute('data-x-loc-highlighted');
});

// ---------------------------------------------------------------------------
// Options-page helpers
// ---------------------------------------------------------------------------

async function addKeyword(context: BrowserContext, extensionId: string, keyword: string): Promise<void> {
  const optPage = await context.newPage();
  await optPage.goto(`chrome-extension://${extensionId}/pages/options.html`);

  const input = optPage.getByPlaceholder('Type a keyword or pick a suggestion...');
  await input.click();
  await input.fill(keyword);
  await input.press('Enter');

  // Chip appearing confirms chrome.storage.local.set was called.
  await optPage.locator(`button[title="Remove ${keyword}"]`).waitFor({ timeout: 3_000 });
  await optPage.close();
}

async function removeKeyword(context: BrowserContext, extensionId: string, keyword: string): Promise<void> {
  const optPage = await context.newPage();
  await optPage.goto(`chrome-extension://${extensionId}/pages/options.html`);

  await optPage.locator(`button[title="Remove ${keyword}"]`).click();

  // Chip disappearing confirms chrome.storage.local.set was called.
  await optPage.locator(`button[title="Remove ${keyword}"]`).waitFor({ state: 'hidden', timeout: 3_000 });
  await optPage.close();
}
