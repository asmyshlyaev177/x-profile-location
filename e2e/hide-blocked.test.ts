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
import type { BrowserContext, Page } from '@playwright/test'
import { test, expect } from './fixtures'
import {
  hoverCardLocation,
  hoverForLocationRow,
  mockAboutAccount,
  mockLocationApis,
  mockSharedCache,
  mostLikedReply,
  openOptionsPage,
  optionsSection,
  setCheckboxOption,
  TWEET_ARTICLE,
  waitForReplies,
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
}) => {
  // A collapsed post shows nothing to hover, so this is the only place to reach
  // the exception button from a timeline — the hover card, where it otherwise
  // lives, cannot be opened from here at all. It is still withheld until
  // "Show": sparing an account is a judgement about what it posts, and a
  // collapsed post gives the reader nothing to judge.
  await mockSharedCache(page, FROM_INDIA)
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', { timeout: 15_000 })
  await expect(article.locator('.x-loc-exc-btn')).toHaveCount(0)

  await article.locator('.x-loc-hidden-show').click()

  // On the flags row, with the rest of what is known about the account.
  const excBtn = article.locator('.x-loc-feed-row .x-loc-exc-btn')
  await expect(excBtn).toBeVisible()
  await expect(excBtn).toHaveText('🚫 Add exception')

  // Clicking it exempts the account, which the button says back — the post was
  // already spared by "Show", so it is the label that carries the difference.
  await excBtn.click()
  await expect(excBtn).toHaveText('✓ Exception (undo)')
})

test('an excepted account gets its country back, in place', async ({
  page,
}) => {
  // ⚠️ is what the location rule looks like while it is acting. Excepted, the
  // account is one the reader decided to keep seeing, so the row goes back to
  // naming the country — the only thing it was ever there to say.
  //
  // Here as well as in the other two suites because only this one can say the
  // swap survives X: the row is drawn into a post X owns and re-renders, the
  // exception is added from a placeholder inside that same post, and the two
  // halves have to still be talking about the same node afterwards. The unit
  // suite builds the DOM itself; the visual suite is handed both states already
  // rendered.
  await mockSharedCache(page, FROM_INDIA)
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)

  const { article } = await mostLikedReply(page)
  await expect(article).toHaveAttribute(HIDDEN, 'collapse', { timeout: 15_000 })

  // Drawn under the name line, collapsed away with the rest of the post.
  const flag = article.locator('.x-loc-feed-row .x-loc-icon.x-loc-icon-flag')
  await expect(flag).toHaveAttribute('title', 'India', { timeout: 15_000 })
  await expect(flag).toHaveText('⚠️')

  await article.locator('.x-loc-hidden-show').click()
  await article.locator('.x-loc-feed-row .x-loc-exc-btn').click()

  await expect(article).not.toHaveAttribute(HIDDEN, /.*/, { timeout: 5_000 })
  // The same locator still resolves: the glyph was swapped where it stood
  // rather than the row being taken out and rebuilt. That is what keeps the post
  // the same height, which is what keeps the page still — the two scroll tests
  // below are about the same property from the other end.
  await expect(flag).toBeVisible()
  await expect(flag).toHaveText('🇮🇳')
  await expect(flag).toHaveAttribute('title', 'India')
})

test('a hover leaves the post it was opened from where it is', async ({
  page,
  context,
  extensionId,
}) => {
  // Hovering a name asks about the author. Answering it by taking away the post
  // the question was asked from is the one thing that answer must not do — so
  // the flag lands in the card and nothing under the pointer moves. The account
  // is judged all the same, which the mode change at the end shows.
  //
  // Prefetch off, so the hover is the only lookup on the page: left on, the
  // prefetcher resolves the account on its own schedule and collapses the post
  // before the pointer ever reaches it.
  await setCheckboxOption(
    context,
    extensionId,
    'Prefetch locations in the background',
    false,
  )
  // The community cache answers with no hits, so the reply renders un-collapsed
  // and stays that way until something looks its author up.
  await mockLocationApis(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)
  await waitForReplies(page)

  const { article, link } = await mostLikedReply(page)
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/)

  const card = await hoverForLocationRow(page, link)
  expect((await hoverCardLocation(card)).basedIn).toBe('India')

  // A collapse would follow the card's own row within a frame or two, so by
  // here it has either happened or it never will.
  await page.waitForTimeout(2_000)
  await expect(article).not.toHaveAttribute(HIDDEN, /.*/)
  await expect(article.locator('.x-loc-hidden-ph')).toHaveCount(0)

  // Spared, not excepted: the next pass over the rules reads the location the
  // hover cached and takes the post away like any other.
  await setHideMode(context, extensionId, 'hide')
  await expect(article).toHaveAttribute(HIDDEN, 'hide', { timeout: 10_000 })
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
// The page must not move under the reader
// ---------------------------------------------------------------------------
// X's virtualised timeline compensates for a cell resizing above the viewport
// by scrolling the window itself — and it issues one `window.scrollBy` per cell
// it saw resize, each carrying the running total for the batch rather than that
// cell's own delta. One cell at a time is exact; several in a frame scroll by a
// multiple of the height that actually changed. Collapsing seven replies
// together moved the scroll 8244px for 2065px of content.
//
// Only a real browser running X's own timeline can show that, which is why
// these two live here and not in the unit or visual suites: there is nothing to
// assert about our CSS or our DOM, only about where the page ended up.

/** Anything larger than this is the bug; the bug measured in the hundreds. */
const JUMP_TOLERANCE_PX = 60

test('a filter change with posts hidden above the fold does not move the page', async ({
  page,
  context,
  extensionId,
}) => {
  // The strongest form of the bug: switching the mode re-judges every post at
  // once, so every one of them resizes in the same frame. What made that move
  // the page was the refresh springing them all back to full height before
  // asking the cache whether they were still hidden.
  //
  // Driven by a setting rather than by scrolling far enough to load more
  // replies, because a HAR only holds the pages visited when it was cut: a
  // replayed thread stops paginating, and a scroll-only version of this passes
  // whatever the extension does.
  await mockSharedCache(page, FROM_INDIA)
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)
  await waitForReplies(page)
  await expect(
    page.locator(`${TWEET_ARTICLE}[${HIDDEN}="collapse"]`).first(),
  ).toBeAttached({ timeout: 15_000 })

  // Far enough in that collapsed posts sit above the viewport — those are the
  // ones whose resize the timeline compensates for, and over-compensates.
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3))
  await page.waitForTimeout(2_000)

  const hiddenAbove = await countHiddenAboveFold(page)
  expect(
    hiddenAbove,
    'nothing collapsed above the viewport — the case this test is about',
  ).toBeGreaterThanOrEqual(2)

  // …and one collapsed post under X's sticky header, the row the extension used
  // to judge as in view. Left to chance this test caught the jump half the time.
  const parkedTop = await parkRowUnderHeader(page)
  expect(
    parkedTop,
    'no collapsed post could be placed under the header',
  ).toBeGreaterThan(0)
  expect(parkedTop).toBeLessThan(X_HEADER_PX)
  // X re-anchors on scroll, and a resize in the same breath as one is not
  // compensated for at all: without this the test proves nothing (0px vs 83px).
  await page.waitForTimeout(2_000)

  for (const mode of ['off', 'collapse'] as const) {
    const before = await page.evaluate(() => Math.round(window.scrollY))
    await setHideMode(context, extensionId, mode)
    await page.waitForTimeout(2_500)
    const moved =
      (await page.evaluate(() => Math.round(window.scrollY))) - before
    expect(
      Math.abs(moved),
      `the page moved ${moved}px when the mode became '${mode}'`,
    ).toBeLessThanOrEqual(JUMP_TOLERANCE_PX)
  }
})

/** X's sticky header, desktop and mobile alike. See FOLD_MARGIN_PX. */
const X_HEADER_PX = 54

/** Scrolls a collapsed post half under the header; answers with its top edge. */
function parkRowUnderHeader(page: Page): Promise<number> {
  return page.evaluate((headerPx) => {
    const rows = [
      ...document.querySelectorAll(
        'article[data-testid="tweet"][data-x-loc-hidden="collapse"]',
      ),
    ]
    // Well clear of the header, so the scroll is downwards.
    const target = rows.find(
      (r) => r.getBoundingClientRect().top > headerPx * 3,
    )
    if (!target) return -1
    window.scrollBy(0, Math.round(target.getBoundingClientRect().top) - 30)
    return Math.round(target.getBoundingClientRect().top)
  }, X_HEADER_PX)
}

/** Collapsed or hidden posts whose whole box is above the viewport top. */
function countHiddenAboveFold(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [
        ...document.querySelectorAll(
          'article[data-testid="tweet"][data-x-loc-hidden]',
        ),
      ].filter((a) => a.getBoundingClientRect().bottom < 0).length,
  )
}

test('adding an exception moves nothing but the post it spares', async ({
  page,
}) => {
  // The refresh behind this used to strip every post back to full height and
  // collapse them all again one cache read later — two page-wide resize storms,
  // and the worst possible input to that compensation. An exception for one
  // account moved the whole page.
  await mockSharedCache(page, FROM_INDIA)
  await mockAboutAccount(page, { account_based_in: 'India' })

  await page.goto(NASA_TWEET)
  await waitForReplies(page)
  await expect(
    page.locator(`${TWEET_ARTICLE}[${HIDDEN}="collapse"]`).first(),
  ).toBeAttached({ timeout: 15_000 })

  // Scrolled well in, so there are collapsed posts above the viewport — those
  // are the ones whose resize moves the scroll.
  await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3))
  await page.waitForTimeout(2_000)

  // Clicked from inside the page rather than through Playwright, whose click
  // scrolls the target into view first — which would be indistinguishable from
  // the movement this test exists to detect.
  const result = await page.evaluate(async () => {
    // "Show" is what puts the exception button on the bar, and it un-collapses
    // this one post — in view, so nothing to compensate for. The posts above
    // the viewport are still collapsed, which is what the click after it moves.
    const show = [
      ...document.querySelectorAll<HTMLElement>(
        'article[data-testid="tweet"][data-x-loc-hidden="collapse"] .x-loc-hidden-show',
      ),
    ].find((el) => {
      const r = el.getBoundingClientRect()
      return r.top > 40 && r.bottom < window.innerHeight - 40
    })
    if (!show) return { found: false, hiddenAbove: 0, moved: 0 }
    // Taken before the click: "Show" takes the placeholder down, which leaves
    // the button that was clicked detached and unable to name its own post.
    const revealed = show.closest('article')
    show.click()
    await new Promise((r) => setTimeout(r, 500))

    const btn = revealed?.querySelector<HTMLElement>('.x-loc-exc-btn')
    if (!btn) return { found: false, hiddenAbove: 0, moved: 0 }

    const hiddenAbove = [
      ...document.querySelectorAll(
        'article[data-testid="tweet"][data-x-loc-hidden]',
      ),
    ].filter((a) => a.getBoundingClientRect().bottom < 0).length

    const before = Math.round(window.scrollY)
    btn.click()
    await new Promise((r) => setTimeout(r, 2_000))
    return {
      found: true,
      hiddenAbove,
      moved: Math.round(window.scrollY) - before,
    }
  })

  expect(
    result.found,
    'no collapsed post in view to add an exception from',
  ).toBe(true)
  expect(
    result.hiddenAbove,
    'nothing collapsed above the viewport — the case this test is about',
  ).toBeGreaterThanOrEqual(2)
  expect(
    Math.abs(result.moved),
    `the page moved ${result.moved}px when one account was excepted`,
  ).toBeLessThanOrEqual(JUMP_TOLERANCE_PX)
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
