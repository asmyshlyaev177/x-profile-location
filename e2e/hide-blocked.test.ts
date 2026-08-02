/**
 * Hide-blocked-locations tests (HIDE_BLOCKED_LOCATIONS_KEY: off | collapse | hide).
 *
 * Hiding only applies to accounts whose location is already known, so the
 * community cache stands in as the source: mocking it to report a blocked
 * country for everyone on the page makes the behaviour deterministic without
 * hunting for a real account in a blocked country.
 *
 * India is in the default blocked set (service-worker.ts). The tweet the page is
 * about is never hidden — only feed tweets.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import type { BrowserContext } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  mockAboutAccount,
  mockSharedCache,
  mostLikedReply,
  openOptionsPage,
  optionsSection,
} from './helpers'
import { CACHE_API_BASE } from '../src/scripts/constants'

const NASA_TWEET = 'https://x.com/NASAArtemis/status/2052108727839285751'
const FROM_INDIA = { loc: 'India', src: null, acc: true, conf: 1 }

const HIDDEN = 'data-x-loc-hidden'
const REVEALED = 'data-x-loc-revealed'

test.beforeEach(() => {
  test.skip(
    CACHE_API_BASE.length === 0,
    'community cache disabled — CACHE_API_BASE is empty',
  )
})

test('collapse mode (the default) leaves a placeholder that reveals the tweet on demand', async ({
  page,
}) => {
  await mockSharedCache(page, FROM_INDIA)
  // Same answer from X, for two reasons: it keeps the background prefetcher off
  // the real endpoint (and its rate limit), and a first-hand lookup overwrites
  // the community-cache value — so a different answer here would silently
  // un-hide tweets partway through the test.
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', { timeout: 15_000 })

  const placeholder = article.locator('.x-loc-hidden-ph')
  await expect(placeholder).toBeVisible()
  await expect(placeholder.locator('.x-loc-hidden-label')).toHaveText(
    '🚫 Hidden · 🇮🇳 India',
  )
  // Everything but the placeholder is collapsed away — the tweet is still there.
  await expect(
    article.locator('[data-testid="User-Name"]').first(),
  ).toBeHidden()

  await placeholder.locator('.x-loc-hidden-show').click()

  await expect(article).not.toHaveAttribute(HIDDEN, /.*/)
  await expect(article).toHaveAttribute(REVEALED, '1')
  await expect(placeholder).toHaveCount(0)
  await expect(
    article.locator('[data-testid="User-Name"]').first(),
  ).toBeVisible()
})

test('the placeholder can spare the account, not just the post', async ({
  page,
  context,
  extensionId,
}) => {
  // A collapsed post shows nothing to hover, so the placeholder is the only
  // place to reach the exception button from a timeline — the hover card, where
  // it otherwise lives, cannot be opened from here at all.
  await mockSharedCache(page, FROM_INDIA)
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', { timeout: 15_000 })

  const excBtn = article.locator('.x-loc-hidden-ph .x-loc-exc-btn')
  await expect(excBtn).toBeVisible()
  await expect(excBtn).toHaveText('🚫 Add exception')

  await excBtn.click()

  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 5_000 })
  await expect(article.locator('.x-loc-hidden-ph')).toHaveCount(0)
  await expect(
    article.locator('[data-testid="User-Name"]').first(),
  ).toBeVisible()

  // The difference from "Show": that marks this one post revealed, while an
  // exception exempts the account — so the post survives the filters being
  // re-evaluated, which is what changing the mode forces.
  await expect(article).not.toHaveAttribute(REVEALED, /.*/)
  await setHideMode(context, extensionId, 'hide')
  await expect(article).toBeVisible()
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 10_000 })
})

test('hide mode drops the tweet silently, and switching off brings it back', async ({
  page,
  context,
  extensionId,
}) => {
  await mockSharedCache(page, FROM_INDIA)
  // Same answer from X, for two reasons: it keeps the background prefetcher off
  // the real endpoint (and its rate limit), and a first-hand lookup overwrites
  // the community-cache value — so a different answer here would silently
  // un-hide tweets partway through the test.
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', { timeout: 15_000 })

  await setHideMode(context, extensionId, 'hide')
  await expect(article).toHaveAttribute(HIDDEN, 'hide', { timeout: 10_000 })
  await expect(article).toBeHidden()
  // No "Show" affordance in this mode — that is what makes it the silent one.
  await expect(article.locator('.x-loc-hidden-ph')).toHaveCount(0)

  await setHideMode(context, extensionId, 'off')
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 10_000 })
  await expect(article).toBeVisible()
})

// ---------------------------------------------------------------------------
// Options-page helper
// ---------------------------------------------------------------------------

async function setHideMode(
  context: BrowserContext,
  extensionId: string,
  mode: 'off' | 'collapse' | 'hide',
): Promise<void> {
  const optPage = await openOptionsPage(context, extensionId)

  // Anchored on the section rather than on the control's own label, via the one
  // table of section headings in helpers.ts. This used to read
  // `label:has-text("Posts caught by any filter")`, which the Phase 2 redesign
  // broke twice over: the wording became "Filtered posts", and the row is
  // rendered as a <div> rather than a <label> (a <label> wrapping a <select>
  // swallows the click that should open the dropdown). Neither shows up until
  // the suite is run, which is exactly how it sat broken.
  const section = await optionsSection(optPage, 'mode')

  // Scoped to the section: the Filters tab has more than one <select>, so a
  // bare locator('select') would be ambiguous.
  const select = section.locator('select')
  await select.selectOption(mode)
  // The value is bound to the state the onChange writes to storage, so it only
  // reads back as `mode` once chrome.storage.local.set has been called.
  await expect(select).toHaveValue(mode)
  await optPage.close()
}
