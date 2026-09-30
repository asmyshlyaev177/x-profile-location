/**
 * The bio X withholds from a blocker's hover card, put back.
 *
 * Archetype:
 *   jpotisch  — blocks the reader, by mock (mockBlockedBy). X serves a stripped
 *               hover card for a blocker: no bio, no follow button, no counts,
 *               just a "Profile Summary" button. The extension still holds the
 *               bio from the thread's own TweetDetail response, still highlights
 *               on it, and puts it back (syncBioRow).
 *   svtv_news — blocks nobody, and has a bio the scrub keeps (location.test.ts
 *               names it too). Its card, on its own post's page, already shows
 *               the bio, so the extension must not add one.
 *
 * The page is jpotisch's own status page, and the card comes from the **primary**
 * tweet's author. That is worth stating because `syncPrimaryExceptionButton`
 * exists on the premise that X opens no hover card there — measured August 2026,
 * it does open one for this page, so `processCard` runs and the injected bio
 * appears. The inline exception button is still the right belt-and-braces for
 * the cases where it doesn't.
 *
 * The block is mocked because a real one cannot be arranged: jpotisch blocked
 * the old recording account, not the one made for recording (September 2026).
 * The mock changes only `blocked_by`, the one field that real block changed.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { Locator, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  addKeyword,
  articleBy,
  HOVER_CARD,
  mockBlockedBy,
  mockLocationApis,
  navigateToTweetDetail,
  pickBioWord,
  readCachedBio,
} from './helpers'

const BLOCKER_TWEET = 'https://x.com/jpotisch/status/2082644956880023812'
const BLOCKER = 'jpotisch'
const NOT_BLOCKING = 'svtv_news'

test('restores the bio X withholds when the account blocks you, and names the block', async ({
  page,
}) => {
  // Location is not what this test is about, and an unmocked lookup makes the
  // recording depend on the community cache's mood.
  await mockLocationApis(page, { account_based_in: 'United States' })
  await mockBlockedBy(page, BLOCKER)
  await page.goto(BLOCKER_TWEET)
  await articleBy(page, BLOCKER).waitFor({ timeout: 15_000 })

  const card = await hoverAuthor(page, BLOCKER)

  // The claim: X sent no bio, and the extension supplied one.
  const injected = card.locator('.x-loc-bio')
  await expect(injected).toBeVisible({ timeout: 10_000 })

  // Compared against what the extension actually cached rather than a literal,
  // which would rot the day the account edits its bio.
  const cached = await waitForCachedBio(page, BLOCKER)
  await expect(injected).toHaveText(cached.trim())

  // Exactly one: syncBioRow rebuilds rather than appends, so a card React filled
  // in late ends up with one bio and not two.
  await expect(injected).toHaveCount(1)

  // And the reason the card looks stripped is named, so the missing follow
  // button and counts read as X's doing rather than as the extension's.
  await expect(card.locator('.x-loc-chip-block')).toHaveText('🚫 Blocked you')
})

test('adds no bio to a card that already has one', async ({ page }) => {
  // The other half of the rule, and the regression that matters: an account
  // that has not blocked the reader gets X's own bio, and must not get a second
  // copy underneath it.
  await mockLocationApis(page, { account_based_in: 'United States' })
  // One of its own posts rather than its profile: bios reach the extension with
  // TweetDetail, and page-script.ts reads none from a profile timeline.
  const tweetPath = await navigateToTweetDetail(page, NOT_BLOCKING)
  await page.goto(`https://x.com${tweetPath}`)

  // The extension has to actually hold a bio for this account, or "no injected
  // bio" would pass for the wrong reason.
  await waitForCachedBio(page, NOT_BLOCKING)
  const card = await hoverAuthor(page, NOT_BLOCKING)

  await expect(card.locator('.x-loc-bio')).toHaveCount(0)
  await expect(card.locator('.x-loc-chip-block')).toHaveCount(0)
})

test('marks the keyword inside the bio it restored', async ({
  page,
  context,
  extensionId,
}) => {
  // Why the injected bio sits outside .x-loc-hover: keywordRangesIn skips our
  // own furniture, so a bio built inside the wrapper would be unmarkable — and
  // the card is the one place that answers "why is this post highlighted?".
  await mockLocationApis(page, { account_based_in: 'United States' })
  await mockBlockedBy(page, BLOCKER)
  await page.goto(BLOCKER_TWEET)
  await articleBy(page, BLOCKER).waitFor({ timeout: 15_000 })

  // The bio arrives on the TweetDetail response and is written to IDB
  // asynchronously, so the keyword has to wait for it rather than assume it.
  const bio = await waitForCachedBio(page, BLOCKER)
  const keyword = pickBioWord(bio)
  if (!keyword) throw new Error(`no usable word in @${BLOCKER}'s bio: ${bio}`)

  await addKeyword(context, extensionId, keyword)

  const card = await hoverAuthor(page, BLOCKER)
  await expect(card.locator('.x-loc-bio')).toBeVisible({ timeout: 10_000 })

  // The text ranges live in CSS.highlights and paint without touching the DOM,
  // so the attribute — which scopes the emoji half — is the only part a test can
  // see. Its presence means markKeywords agreed the keyword hit.
  await expect(card).toHaveAttribute('data-x-loc-kw', '1', { timeout: 10_000 })

  // The post itself is highlighted off a bio the page never rendered, which is
  // the whole situation this feature exists to explain.
  await expect(articleBy(page, BLOCKER)).toHaveAttribute(
    'data-x-loc-highlighted',
    { timeout: 10_000 },
  )
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** The bio the extension has cached for `screenName`, once it has landed. */
async function waitForCachedBio(
  page: Page,
  screenName: string,
): Promise<string> {
  await expect
    .poll(() => readCachedBio(page, screenName), { timeout: 15_000 })
    .toBeTruthy()
  return (await readCachedBio(page, screenName))!
}

/**
 * Hovers `screenName`'s name until the extension has processed the card.
 *
 * Hover and wait are retried as one unit: X swallows a hover now and then — its
 * card handler attaches after hydration and closes again if the pointer is
 * judged to have left — which a plain hover would turn into a spurious failure.
 */
async function hoverAuthor(page: Page, screenName: string): Promise<Locator> {
  const card = page.locator(HOVER_CARD)
  const link = articleBy(page, screenName)
    .locator(`[data-testid="User-Name"] a[href="/${screenName}" i]`)
    .first()

  await expect(async () => {
    await page.mouse.move(0, 0)
    await link.hover({ timeout: 5_000 })
    // The wrapper, not the bio: it is inserted for every card the extension
    // processes, so waiting on it means "processCard ran" without assuming the
    // outcome this test is here to check.
    await expect(card.locator('.x-loc-hover')).toBeVisible({ timeout: 4_000 })
  }).toPass({ timeout: 25_000 })
  return card
}
