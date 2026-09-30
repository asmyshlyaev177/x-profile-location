/**
 * The rating ask on X's own page.
 *
 * The unit suite draws the bar into happy-dom and the integration suite over a
 * stub of our own. Neither has X's stylesheet, fonts or fixed layers under it,
 * so this is the one place a test can say a reader would actually see the ask:
 * the day counted on X's real markup, the bar inside the window and on top of
 * everything X draws, at desktop and phone widths, and clicking through to the
 * store's reviews.
 *
 * All x.com traffic is recorded/replayed via HAR (see fixtures.ts). The location
 * and community-cache APIs are stubbed, and the store itself is never loaded.
 */
import type { Locator, Page } from '@playwright/test'
import { RATE_PROMPT_KEY, USAGE_STATS_KEY } from '../src/scripts/constants'
import { RATING_ASK_ID } from '../src/scripts/styles'
import {
  dayKey,
  RATE_PROMPT_MIN_DAYS,
  RATING_ASK_DELAY_MS,
  REVIEW_URL,
} from '../src/scripts/usage'
import { expect, test } from './fixtures'
import {
  hoverOwnTweet,
  mockLocationApis,
  readStorage,
  seedStorage,
} from './helpers'

/** X's own layout for a phone, with the tab bar fixed along the bottom. */
const PHONE = { width: 390, height: 844 }

/** Inside the window, and each button the topmost element under its centre. */
async function expectInFullView(page: Page, bar: Locator): Promise<void> {
  const box = await bar.boundingBox()
  const viewport = page.viewportSize()
  if (!box || !viewport) throw new Error('the bar has no box to measure')
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height)

  for (const button of await bar.getByRole('button').all()) {
    const b = await button.boundingBox()
    if (!b) throw new Error('a button of the bar has no box')
    const onTop = await page.evaluate(
      ([x, y, id]) => !!document.elementFromPoint(x, y)?.closest(`#${id}`),
      [b.x + b.width / 2, b.y + b.height / 2, RATING_ASK_ID] as const,
    )
    expect(onTop, `"${await button.textContent()}" is covered`).toBe(true)
  }
}

test('the day that earns the ask shows it over X in full view, and Rate it opens the reviews', async ({
  page,
  context,
  extensionId,
}) => {
  await mockLocationApis(page, { account_based_in: 'Germany' })
  // The live store must never load. Aborted, not fulfilled: fulfilling a Web
  // Store navigation crashes Chromium 147 outright.
  const storeRequests: string[] = []
  await context.route('https://chromewebstore.google.com/**', (route) => {
    storeRequests.push(route.request().url())
    return route.abort()
  })

  // A day short, with today not yet counted, so the first flag X's page gets
  // is what earns the ask - the path every real third day takes.
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  await seedStorage(context, extensionId, {
    [USAGE_STATS_KEY]: {
      activeDays: RATE_PROMPT_MIN_DAYS - 1,
      lastDay: dayKey(yesterday),
    },
    [RATE_PROMPT_KEY]: { status: 'idle', snoozeUntil: 0 },
  })

  await hoverOwnTweet(page, 'sotaproject')
  const bar = page.locator(`#${RATING_ASK_ID}`)
  await expect(bar).toBeVisible({ timeout: RATING_ASK_DELAY_MS + 10_000 })
  expect(await readStorage(context, extensionId, USAGE_STATS_KEY)).toEqual({
    activeDays: RATE_PROMPT_MIN_DAYS,
    lastDay: dayKey(),
  })

  await expect(bar).toContainText('X-Pat')
  await expectInFullView(page, bar)
  // X styles buttons page-wide; the bar's own rules must still win over them.
  const rate = bar.getByRole('button', { name: 'Rate it ★' })
  await expect(rate).toHaveCSS('color', 'rgb(125, 190, 250)')

  // A phone-width window is where X fixes its tab bar along the bottom, right
  // where the bar sits, and where the bar has to wrap to fit.
  await page.setViewportSize(PHONE)
  await expectInFullView(page, bar)

  await rate.click()
  await expect.poll(() => storeRequests).toContain(REVIEW_URL)
  await expect(bar.getByRole('button', { name: 'Share X-Pat' })).toBeVisible()
  expect(
    await readStorage(context, extensionId, RATE_PROMPT_KEY),
  ).toMatchObject({ status: 'done' })
})
