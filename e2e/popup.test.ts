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
  CACHED_ACCOUNTS,
  mockLocationApis,
  openPopupPage,
  openPopupSection,
  pickBioWord,
  PRIMARY_TWEET,
  readCachedBio,
} from './helpers'
import { RATE_PROMPT_KEY, USAGE_STATS_KEY } from '../src/scripts/countries'
import {
  RATE_PROMPT_MIN_DAYS,
  RATE_PROMPT_SNOOZE_MS,
} from '../src/scripts/usage'

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

/**
 * The rating ask, against real storage.
 *
 * The unit tests drive this against a mocked `chrome.storage.local`, which is
 * exactly the thing that has to work for real: the answer is written by the
 * popup and read back by the *next* popup, in a different page, after the first
 * one is gone. Nothing short of the extension actually installed shows that.
 *
 * No recording — nothing here touches x.com.
 */
async function seedUsage(
  context: Parameters<typeof openPopupPage>[0],
  extensionId: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const seed = await openPopupPage(context, extensionId)
  await seed.evaluate((p) => chrome.storage.local.set(p), patch)
  await seed.close()
}

test('the rating ask waits for a few days of actual use', async ({
  context,
  extensionId,
}) => {
  // Days on which a flag was drawn, not days installed: an install that has
  // never resolved a profile has no opinion to give.
  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: {
      activeDays: RATE_PROMPT_MIN_DAYS - 1,
      lastDay: '2026-08-03',
    },
  })

  const tooSoon = await openPopupPage(context, extensionId)
  await expect(tooSoon.getByText(/Rate it/)).toHaveCount(0)
  await tooSoon.close()

  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: {
      activeDays: RATE_PROMPT_MIN_DAYS,
      lastDay: '2026-08-03',
    },
  })

  const earned = await openPopupPage(context, extensionId)
  await expect(earned.getByText(/Rate it/)).toBeVisible({ timeout: 5_000 })
  // The store's own id, not chrome.runtime.id — which is a different random
  // string for every unpacked build, this one included.
  await expect(earned.getByText(/Rate it/)).toHaveAttribute(
    'href',
    /chromewebstore\.google\.com/,
  )
  await earned.close()
})

test('Later puts the ask away, and the next popup honours it', async ({
  context,
  extensionId,
}) => {
  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: { activeDays: 30, lastDay: '2026-08-03' },
  })

  const first = await openPopupPage(context, extensionId)
  await first.getByText('Later').click()
  // Gone from the panel it was answered in, without a reload.
  await expect(first.getByText(/Rate it/)).toHaveCount(0)

  const stored = await first.evaluate(
    (key) => chrome.storage.local.get(key).then((r) => r[key]),
    RATE_PROMPT_KEY,
  )
  expect(stored).toMatchObject({ status: 'later' })
  expect((stored as { snoozeUntil: number }).snoozeUntil).toBeGreaterThan(
    Date.now() + RATE_PROMPT_SNOOZE_MS - 60_000,
  )
  await first.close()

  const second = await openPopupPage(context, extensionId)
  await expect(second.getByText(/Rate it/)).toHaveCount(0)
  await second.close()
})

test('No thanks is final', async ({ context, extensionId }) => {
  // The one behaviour worth being certain about: an extension that asks again
  // after being told no is one people uninstall rather than answer.
  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: { activeDays: 30, lastDay: '2026-08-03' },
  })

  const first = await openPopupPage(context, extensionId)
  await first.getByText('No thanks').click()
  await expect(first.getByText(/Rate it/)).toHaveCount(0)
  await first.close()

  const second = await openPopupPage(context, extensionId)
  await expect(second.getByText(/Rate it/)).toHaveCount(0)
  expect(
    await second.evaluate(
      (key) => chrome.storage.local.get(key).then((r) => r[key]),
      RATE_PROMPT_KEY,
    ),
  ).toMatchObject({ status: 'done' })
  await second.close()
})

test('the toolbar icon carries the ask, and drops it when answered', async ({
  context,
  extensionId,
}) => {
  // The badge is the only surface a user who never opens the popup will see,
  // and the only one no unit test can reach: it is set by the service worker,
  // off a storage change, through an API that exists nowhere else.
  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: { activeDays: 30, lastDay: '2026-08-03' },
  })

  const popup = await openPopupPage(context, extensionId)
  const badge = () => popup.evaluate(() => chrome.action.getBadgeText({}))

  await expect.poll(badge, { timeout: 5_000 }).toBe('★')

  await popup.getByText('No thanks').click()
  // Same rule as the card and the bar on X: answered once means gone
  // everywhere, or the badge sends people to a popup with nothing in it.
  await expect.poll(badge, { timeout: 5_000 }).toBe('')

  await popup.close()
})

test('pausing the extension takes the badge down with it', async ({
  context,
  extensionId,
}) => {
  // Quiet everywhere while paused, or the badge points at a popup that has
  // deliberately hidden the card.
  await seedUsage(context, extensionId, {
    [USAGE_STATS_KEY]: { activeDays: 30, lastDay: '2026-08-03' },
  })

  const popup = await openPopupPage(context, extensionId)
  const badge = () => popup.evaluate(() => chrome.action.getBadgeText({}))
  await expect.poll(badge, { timeout: 5_000 }).toBe('★')

  await popup.locator('header input[type="checkbox"]').click()
  await expect.poll(badge, { timeout: 5_000 }).toBe('')

  await popup.locator('header input[type="checkbox"]').click()
  await expect.poll(badge, { timeout: 5_000 }).toBe('★')

  await popup.close()
})

test('the popup says how much the community cache holds', async ({
  context,
  extensionId,
}) => {
  // A real extension page making a real cross-origin GET. That is the half no
  // unit test reaches: the server answers `Access-Control-Allow-Origin: *` and
  // nothing in the manifest grants that host, so this is what says the browser
  // is willing to make the request at all — on Chrome, at least; Firefox and
  // Safari are still hand-checked (see CLAUDE.md).
  const popup = await openPopupPage(context, extensionId)

  await expect(
    popup.getByText(`${CACHED_ACCOUNTS.toLocaleString('en')} accounts`),
  ).toBeVisible({ timeout: 5_000 })

  await popup.close()
})

test('a paused popup asks the cache nothing', async ({
  context,
  extensionId,
}) => {
  const popup = await openPopupPage(context, extensionId)
  const asked: string[] = []
  popup.on('request', (r) => {
    if (r.url().includes('/v1/stats')) asked.push(r.url())
  })

  await popup.locator('header input[type="checkbox"]').click()
  await expect(popup.getByText(/accounts in the community cache/)).toBeHidden()

  // Paused means the extension does nothing, and that includes the one request
  // this panel makes on its own.
  expect(asked).toEqual([])

  await popup.close()
})
