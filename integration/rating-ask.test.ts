/**
 * The rating ask with real storage, the real worker and real tabs.
 *
 * Its whole state is two keys in `chrome.storage.local`. The bar over X and the
 * popup write them; those two and the worker's badge read them. Every rule
 * pinned here is a write in one of those contexts and what another one does
 * with it, which is exactly the part the unit suite has to mock.
 *
 * See "The rating ask" in src/scripts/CLAUDE.md.
 */
import type { BrowserContext, Page } from '@playwright/test'
import { RATE_PROMPT_KEY, USAGE_STATS_KEY } from '../src/scripts/constants'
import { RATING_ASK_ID } from '../src/scripts/styles'
import {
  dayKey,
  RATE_PROMPT_IGNORED_SNOOZE_MS,
  RATING_ASK_DELAY_MS,
} from '../src/scripts/usage'
import { expect, readStorage, setSettings, test } from './fixtures'
import { FEED_URL, serveStubX } from './x-stub'

/** Flags in the feed, looked up at the floor: the ask rides in on the first. */
const FEED_WITH_FLAGS = { prefetchPacing: 'instant', showLocationInFeed: true }

/** So many days of use that only the prompt's own state decides. */
const WELL_USED = { [USAGE_STATS_KEY]: { activeDays: 30, lastDay: dayKey() } }

const NEVER_ASKED = { status: 'idle', snoozeUntil: 0 }

/**
 * Measured from the first flag, which is when a page starts its countdown. An
 * absence checked any sooner would pass with the rule under test deleted.
 */
const PAST_THE_DELAY_MS = RATING_ASK_DELAY_MS + 3_000

test.beforeEach(async ({ context }) => {
  await serveStubX(context, {
    handles: ['alpha', 'bravo', 'charlie'],
    answer: () => ({ location: 'Japan' }),
    tabName: () => 'x',
  })
  // "Rate it" opens the listing, which this suite must not load. Aborted, not
  // fulfilled: fulfilling a Web Store navigation crashes Chromium 147 outright.
  await context.route('https://chromewebstore.google.com/**', (route) =>
    route.abort(),
  )
})

async function seedAsk(
  context: BrowserContext,
  extensionId: string,
  prompt: unknown,
): Promise<void> {
  await setSettings(context, extensionId, {
    ...FEED_WITH_FLAGS,
    ...WELL_USED,
    [RATE_PROMPT_KEY]: prompt,
  })
}

async function waitForFirstFlag(page: Page): Promise<void> {
  await page.locator('.x-loc-info').first().waitFor({ timeout: 20_000 })
}

async function openFeed(context: BrowserContext): Promise<Page> {
  const page = await context.newPage()
  await page.goto(FEED_URL)
  await waitForFirstFlag(page)
  return page
}

async function openPopup(
  context: BrowserContext,
  extensionId: string,
): Promise<Page> {
  const popup = await context.newPage()
  await popup.goto(`chrome-extension://${extensionId}/pages/popup.html`)
  return popup
}

const ratingBar = (page: Page) => page.locator(`#${RATING_ASK_ID}`)

async function readPrompt(context: BrowserContext, extensionId: string) {
  return (await readStorage(context, extensionId, RATE_PROMPT_KEY)) as {
    status: string
    snoozeUntil: number
  }
}

for (const [history, prompt] of [
  ['the first time', NEVER_ASKED],
  // "Later", a fortnight ago. Only an ask from idle used to be recorded, so
  // from the second ask on the bar came back on every page load.
  [
    'after an earlier snooze ran out',
    { status: 'later', snoozeUntil: Date.now() - 60_000 },
  ],
] as const) {
  test(`an ignored ask stays off the next page, ${history}`, async ({
    context,
    extensionId,
  }) => {
    await seedAsk(context, extensionId, prompt)

    const page = await openFeed(context)
    await expect(ratingBar(page)).toBeVisible({ timeout: PAST_THE_DELAY_MS })

    // Not answered: the reader reloads, or opens X again later in the day.
    await page.reload()
    await waitForFirstFlag(page)
    await page.waitForTimeout(PAST_THE_DELAY_MS)
    await expect(ratingBar(page)).toHaveCount(0)

    const stored = await readPrompt(context, extensionId)
    expect(stored.snoozeUntil).toBeGreaterThan(
      Date.now() + RATE_PROMPT_IGNORED_SNOOZE_MS - 60_000,
    )
  })
}

test('a second tab stays quiet once the first has asked', async ({
  context,
  extensionId,
}) => {
  await seedAsk(context, extensionId, NEVER_ASKED)

  const first = await openFeed(context)
  const second = await openFeed(context)
  // The precondition, not the rule: both tabs are counting down at once. A
  // second tab opened after the first bar would be told no when it started.
  expect(await ratingBar(first).count()).toBe(0)

  await expect(ratingBar(first)).toBeVisible({ timeout: PAST_THE_DELAY_MS })
  await second.waitForTimeout(PAST_THE_DELAY_MS)
  await expect(ratingBar(second)).toHaveCount(0)
})

test('an answer in the popup during the countdown means the page never asks', async ({
  context,
  extensionId,
}) => {
  // The badge invites exactly this: it lights as the day is counted, seconds
  // before the bar would appear.
  await seedAsk(context, extensionId, NEVER_ASKED)
  const page = await openFeed(context)

  const popup = await openPopup(context, extensionId)
  await popup.getByText('No thanks').click()
  expect(await ratingBar(page).count()).toBe(0)

  await page.waitForTimeout(PAST_THE_DELAY_MS)
  await expect(ratingBar(page)).toHaveCount(0)
})

test('rating from the popup takes the question off the page', async ({
  context,
  extensionId,
}) => {
  // The footer's "Rate ★" is always there, so answering in the popup while the
  // bar is up is the ordinary case. Left up, its "Later" could turn a rating
  // back into a snooze, and the reader would be asked again in a fortnight.
  await seedAsk(context, extensionId, NEVER_ASKED)
  const page = await openFeed(context)
  await expect(ratingBar(page)).toBeVisible({ timeout: PAST_THE_DELAY_MS })

  const popup = await openPopup(context, extensionId)
  await popup.getByText('Rate ★').click()

  await expect(ratingBar(page)).toHaveCount(0)
  expect(await readPrompt(context, extensionId)).toMatchObject({
    status: 'done',
  })
})

test('rating from the bar keeps the share ask that follows it', async ({
  context,
  extensionId,
}) => {
  // The page's own "done" comes back to it as a storage change, like one from
  // any other tab. That echo must not take the share ask down with it.
  await seedAsk(context, extensionId, NEVER_ASKED)
  const page = await openFeed(context)
  await expect(ratingBar(page)).toBeVisible({ timeout: PAST_THE_DELAY_MS })

  await ratingBar(page).getByText('Rate it ★').click()
  await expect
    .poll(async () => (await readPrompt(context, extensionId)).status)
    .toBe('done')

  await expect(ratingBar(page).getByText('Share X-Pat')).toBeVisible()
})

test('the badge is lit while the ask is due and goes out once a page asks', async ({
  context,
  extensionId,
}) => {
  await seedAsk(context, extensionId, NEVER_ASKED)
  const popup = await openPopup(context, extensionId)
  const badge = () => popup.evaluate(() => chrome.action.getBadgeText({}))
  await expect.poll(badge).toBe('★')

  const page = await openFeed(context)
  await expect(ratingBar(page)).toBeVisible({ timeout: PAST_THE_DELAY_MS })
  await expect.poll(badge).toBe('')
})
