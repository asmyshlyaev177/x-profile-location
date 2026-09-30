/**
 * Keyword highlight tests.
 *
 * Archetypes:
 *   MRNFT_X       — bio contains standalone "nft" → should highlight
 *   OldRoberts953 — "nft" only appears inside a longer word → must NOT highlight
 *                   (regression test for the word-boundary false-positive bug)
 *   jk_rowling    — replies to her own post, for the reply hover card. Named
 *                   because the scrub blanks every unnamed account's bio, and
 *                   location.test.ts names her too.
 *
 * The last two cover the per-account escape hatch: the "🚫 Add exception"
 * button, which adds the account to the highlight bucket of RULE_EXCEPTIONS_KEY
 * (mirrored to HIGHLIGHT_EXCEPTIONS_KEY) so shouldHighlight() returns false even
 * while the keyword still matches. The same button covers the location,
 * affiliation and age rules when those are what is acting on the account.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  addKeyword,
  HOVER_CARD,
  pickBioWord,
  PRIMARY_TWEET,
  readCachedBio,
  removeKeyword,
  TWEET_ARTICLE,
  tweetArticles,
} from './helpers'

const MRNFT_TWEET = 'https://x.com/MRNFT_X/status/2053116341926629624'
const OLD_ROBERTS_TWEET =
  'https://x.com/OldRoberts953/status/2053099310741401905'
const SELF_REPLY_TWEET = 'https://x.com/jk_rowling/status/2100176797782450609'
const SELF_REPLIER = 'jk_rowling'

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
  await page.goto(SELF_REPLY_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  // Replies keep the original path honest: they get a real hover card, so the
  // button comes from processCard() rather than the inline injection above.
  const target = await replyWithBio(page, SELF_REPLIER)

  await addKeyword(context, extensionId, target.keyword)
  await expect(target.article).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 5_000,
  })

  // processCard() only builds the button for accounts that match a rule, so its
  // presence already says the hover card agreed the keyword hit.
  await target.link.hover()
  const card = page.locator(HOVER_CARD)
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

/** `screenName`'s reply below the page's own tweet, plus a keyword from its bio. */
async function replyWithBio(
  page: Page,
  screenName: string,
): Promise<{ article: Locator; link: Locator; keyword: string }> {
  const byAuthor = `[data-testid="User-Name"] a[href="/${screenName}" i]`
  // Not the page's own tweet: it has no hover card.
  const article = page
    .locator(`${TWEET_ARTICLE}:not([tabindex="-1"])`)
    .filter({ has: page.locator(byAuthor) })
    .first()
  const link = article.locator(byAuthor).first()
  await link.waitFor({ timeout: 15_000 })

  // The bio lands in IDB after the TweetDetail response, not with it.
  await expect
    .poll(() => readCachedBio(page, screenName), { timeout: 15_000 })
    .toBeTruthy()
  const keyword = pickBioWord(await readCachedBio(page, screenName))
  if (!keyword) throw new Error(`no usable word in @${screenName}'s bio`)
  return { article, link, keyword }
}
