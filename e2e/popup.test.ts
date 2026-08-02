/**
 * Toolbar popup tests.
 *
 * The popup grew from a handful of switches into somewhere you can edit the two
 * filters worth changing mid-scroll — blocked locations and highlight keywords.
 * That claim is only worth anything end-to-end: it says an edit made in the
 * popup reaches the timeline *behind* it, through storage and the content
 * script's onChanged listener, without the page being reloaded. Nothing short
 * of a real browser with the extension loaded can check that.
 *
 * Opened as an ordinary tab, because Playwright cannot open a browser action
 * popup. It costs nothing: the popup is a normal extension page with the same
 * access to chrome.storage.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts).
 */
import { test, expect } from './fixtures'
import {
  mockLocationApis,
  openPopupPage,
  openPopupSection,
  pickBioWord,
  PRIMARY_TWEET,
  readCachedBio,
} from './helpers'

const MRNFT_TWEET = 'https://x.com/MRNFT_X/status/2053116341926629624'

test('a keyword added in the popup highlights the post behind it', async ({
  page,
  context,
  extensionId,
}) => {
  // Nothing here is about what X answers, and the background prefetcher is
  // allowed half the 50-per-15-minutes window — enough unmocked runs and later
  // tests fail on 429s rather than on their own behaviour.
  await mockLocationApis(page, { account_based_in: 'Germany' })

  await page.goto(MRNFT_TWEET)
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 15_000 })

  const article = page.locator(PRIMARY_TWEET)
  await article.waitFor({ timeout: 10_000 })
  await expect(article).not.toHaveAttribute('data-x-loc-highlighted', /.*/)

  // From the bio the recording captured, not a literal — a literal would rot
  // the day the account edits its bio.
  const keyword = pickBioWord(await readCachedBio(page, 'MRNFT_X'))
  if (!keyword) throw new Error('no usable word in @MRNFT_X’s bio')

  const popup = await openPopupPage(context, extensionId)
  await openPopupSection(popup, 'Highlight keywords')

  const input = popup.getByPlaceholder('Add a keyword…')
  await input.fill(keyword)
  await input.press('Enter')
  // The chip appearing confirms chrome.storage.local.set has been called.
  await popup.locator(`button[title="Remove ${keyword}"]`).waitFor({
    timeout: 3_000,
  })

  // The x.com tab was never touched: the highlight arrives through the content
  // script's storage listener while the tab sits in the background.
  await expect(article).toHaveAttribute('data-x-loc-highlighted', {
    timeout: 10_000,
  })

  // And removing it takes the highlight away again, from the same panel.
  await popup.locator(`button[title="Remove ${keyword}"]`).click()
  await expect(article).not.toHaveAttribute('data-x-loc-highlighted', {
    timeout: 10_000,
  })

  await popup.close()
})

test('the filter sections open one at a time and are collapsed to begin with', async ({
  context,
  extensionId,
}) => {
  // The reason these are accordions when the options page's are not: an open
  // list editor would push the switches people came for off the bottom of a
  // 300px panel.
  const popup = await openPopupPage(context, extensionId)

  const locations = popup.locator('button:has-text("Blocked locations")')
  const keywords = popup.locator('button:has-text("Highlight keywords")')
  await expect(locations).toHaveAttribute('aria-expanded', 'false')
  await expect(keywords).toHaveAttribute('aria-expanded', 'false')

  await locations.click()
  await expect(locations).toHaveAttribute('aria-expanded', 'true')

  await keywords.click()
  await expect(keywords).toHaveAttribute('aria-expanded', 'true')
  await expect(locations).toHaveAttribute('aria-expanded', 'false')

  await popup.close()
})

test('the popup reopens on the section it was left in', async ({
  context,
  extensionId,
}) => {
  // Adding three countries one at a time should not mean opening the same
  // section three times.
  const first = await openPopupPage(context, extensionId)
  await openPopupSection(first, 'Blocked locations')
  await first.close()

  const second = await openPopupPage(context, extensionId)
  await expect(
    second.locator('button:has-text("Blocked locations")'),
  ).toHaveAttribute('aria-expanded', 'true', { timeout: 5_000 })

  await second.close()
})

test('a country added in the popup is stored under its canonical name', async ({
  context,
  extensionId,
}) => {
  // The popup and the options page write the same key, so they have to agree on
  // what goes in it: "USA" and "United States" are one filter, and storage
  // keeps one of them or the content script has two things to match.
  const popup = await openPopupPage(context, extensionId)
  await openPopupSection(popup, 'Blocked locations')

  const input = popup.getByPlaceholder('Country or region…')
  await input.fill('USA')
  await input.press('Enter')

  await expect(
    popup.locator('button[title="Remove United States"]'),
  ).toBeVisible({ timeout: 5_000 })

  await popup.locator('button[title="Remove United States"]').click()
  await popup.close()
})
