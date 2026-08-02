/**
 * Keyword highlight tests.
 *
 * Archetypes:
 *   MRNFT_X       — bio contains standalone "nft" → should highlight
 *   OldRoberts953 — "nft" only appears inside a longer word → must NOT highlight
 *                   (regression test for the word-boundary false-positive bug)
 *
 * The last two cover the per-account escape hatch: the "🚫 Add exception"
 * button, which adds the account to the highlight bucket of RULE_EXCEPTIONS_KEY
 * (mirrored to HIGHLIGHT_EXCEPTIONS_KEY) so shouldHighlight() returns false even
 * while the keyword still matches. The same button covers the location,
 * affiliation and age rules when those are what is acting on the account.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { BrowserContext, Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  openOptionsPage,
  openOptionsTab,
  pickBioWord,
  PRIMARY_TWEET,
  readCachedBio,
  tweetArticles,
  waitForReplies,
} from './helpers'

const MRNFT_TWEET = 'https://x.com/MRNFT_X/status/2053116341926629624'
const OLD_ROBERTS_TWEET =
  'https://x.com/OldRoberts953/status/2053099310741401905'

test('keyword highlights article when bio contains it as a standalone word, removing it un-highlights', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(MRNFT_TWEET)

  // AboutAccountQuery completing means bio (from page-script timeline event) and
  // location data are both merged into IDB — safe to trigger rehighlightAll now.
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  const authorArticle = tweetArticles(page).first()
  await authorArticle.waitFor({ timeout: 10_000 })

  await addKeyword(context, extensionId, 'nft')
  await expect(authorArticle).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })

  await removeKeyword(context, extensionId, 'nft')
  await expect(authorArticle).not.toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })
})

test('keyword does not highlight when it only appears inside a longer word (regression)', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(OLD_ROBERTS_TWEET)

  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  const authorArticle = tweetArticles(page).first()
  await authorArticle.waitFor({ timeout: 10_000 })

  await addKeyword(context, extensionId, 'nft')

  // Give rehighlightAll time to finish — the attribute must stay absent.
  await page.waitForTimeout(1_000)
  await expect(authorArticle).not.toHaveAttribute('data-x-loc-highlighted')
})

test('highlight exception button un-highlights the account, and undoes cleanly', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(MRNFT_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  const authorArticle = page.locator(PRIMARY_TWEET)
  await authorArticle.waitFor({ timeout: 10_000 })

  // Keyword comes from whatever bio the recording captured — any word in it
  // highlights, and a literal would rot the day the account edits its bio.
  const bio = await readCachedBio(page, 'MRNFT_X')
  const keyword = pickBioWord(bio)
  if (!keyword) throw new Error(`no usable word in @MRNFT_X's bio: ${bio}`)

  await addKeyword(context, extensionId, keyword)
  await expect(authorArticle).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })

  // X opens no hover card for the account the page is about, so the button is
  // injected inline under the name line instead (syncPrimaryExceptionButton).
  const excBtn = authorArticle.locator('.x-loc-exc-btn')
  await expect(excBtn).toBeVisible({ timeout: 10_000 })
  await expect(excBtn).toHaveText('🚫 Add exception')

  // Excepted: the keyword still matches, the account is just spared.
  await excBtn.click()
  await expect(authorArticle).not.toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })
  await expect(excBtn).toHaveText('✓ Exception (undo)')

  // Same button undoes it — the exception is a toggle, not a one-way door.
  await excBtn.click()
  await expect(authorArticle).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })
})

test('highlight exception button works the same from a reply hover card', async ({
  page,
  context,
  extensionId,
}) => {
  await page.goto(MRNFT_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  // Replies keep the original path honest: they get a real hover card, so the
  // button comes from processCard() rather than the inline injection above.
  const target = await pickHighlightableReply(page)

  await addKeyword(context, extensionId, target.keyword)
  await expect(target.article).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })

  // processCard() only builds the button for accounts that match a rule, so its
  // presence already says the hover card agreed the keyword hit.
  await target.link.hover()
  const card = page.locator('[data-testid="HoverCard"]')
  const excBtn = card.locator('.x-loc-exc-btn')
  await expect(excBtn).toBeVisible({ timeout: 10_000 })
  await expect(excBtn).toHaveText('🚫 Add exception')

  // The card is also where the matched word is marked, which is the other half
  // of answering "why is this account highlighted?". The text ranges are
  // registered in CSS.highlights and paint without touching the DOM, so the
  // attribute — which scopes the emoji half — is the only part a test can see.
  await expect(card).toHaveAttribute('data-x-loc-kw', '1')

  await excBtn.click()
  await expect(target.article).not.toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })
  await expect(excBtn).toHaveText('✓ Exception (undo)')
  // Excepted accounts lose the bar on their posts, so the mark in their bio has
  // to go with it — a word still lit up here would read as the exception not
  // having worked.
  await expect(card).not.toHaveAttribute('data-x-loc-kw', /.*/, {
    timeout: 5_000,
  })

  await excBtn.click()
  await expect(target.article).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })
  await expect(card).toHaveAttribute('data-x-loc-kw', '1', { timeout: 5_000 })
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Any reply whose author the extension has a bio for, plus a keyword taken from
 * that bio. Which reply that is shifts between recordings — and a reply with no
 * bio can't be highlighted — so it is discovered rather than pinned to an index.
 */
async function pickHighlightableReply(page: Page): Promise<{
  article: Locator
  link: Locator
  keyword: string
}> {
  const articles = tweetArticles(page)
  await waitForReplies(page)

  const count = await articles.count()
  for (let i = 0; i < Math.min(count, 6); i++) {
    const article = articles.nth(i)
    // Skip the tweet the page is about — it has no hover card.
    if ((await article.getAttribute('tabindex')) === '-1') continue

    const link = article
      .locator('[data-testid="User-Name"] a[href^="/"]:not([href*="/status/"])')
      .first()
    if ((await link.count()) === 0) continue

    const href = (await link.getAttribute('href')) ?? ''
    const screenName = href.replace(/^\//, '').split('/')[0]
    if (!screenName) continue

    const keyword = pickBioWord(await readCachedBio(page, screenName))
    if (keyword) return { article, link, keyword }
  }
  throw new Error('no reply with a cached bio in this recording')
}

async function addKeyword(
  context: BrowserContext,
  extensionId: string,
  keyword: string,
): Promise<void> {
  const optPage = await openOptionsPage(context, extensionId)
  // Keyword settings live on the Filters tab. Nothing to expand — the
  // accordions went away when the options page became a full tab.
  await openOptionsTab(optPage, 'Filters')

  const input = optPage.getByPlaceholder('Type a keyword or pick a suggestion…')
  await input.click()
  await input.fill(keyword)
  await input.press('Enter')

  // Chip appearing confirms chrome.storage.local.set was called.
  await optPage
    .locator(`button[title="Remove ${keyword}"]`)
    .waitFor({ timeout: 3_000 })
  await optPage.close()
}

async function removeKeyword(
  context: BrowserContext,
  extensionId: string,
  keyword: string,
): Promise<void> {
  const optPage = await openOptionsPage(context, extensionId)
  await openOptionsTab(optPage, 'Filters')

  await optPage.locator(`button[title="Remove ${keyword}"]`).click()

  // Chip disappearing confirms chrome.storage.local.set was called.
  await optPage
    .locator(`button[title="Remove ${keyword}"]`)
    .waitFor({ state: 'hidden', timeout: 3_000 })
  await optPage.close()
}
