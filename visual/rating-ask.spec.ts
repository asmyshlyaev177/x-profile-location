/**
 * The rating ask, over X.
 *
 * This is the only thing the extension puts on somebody's screen without being
 * asked, on a page it does not own, so the layout facts matter more here than
 * anywhere else in this suite: it has to stay inside a phone's viewport, it has
 * to be clickable, and both ways of saying no have to be as easy to hit as the
 * way of saying yes.
 */
import { expect, test } from '@playwright/test'
import { box, expectSameRow, openFixture, right, styleOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await openFixture(page, 'rating-ask')
})

test('the ask is wearing the real stylesheet', async ({ page }) => {
  // Several assertions below would pass on unstyled markup sitting in the page
  // flow. This one would not.
  expect(await styleOf(page.locator('#x-loc-ask-toast'), 'position')).toBe(
    'fixed',
  )
})

test('it says what is being rated, with the mark from the toolbar', async ({
  page,
}) => {
  // It appears inside somebody else's page. Unattributed, it reads as X asking
  // — and nobody can rate what they cannot identify.
  await expect(page.locator('#x-loc-ask-toast strong')).toHaveText('X-Pat')

  const mark = await box(page.locator('#x-loc-ask-toast img'))
  const name = await box(page.locator('#x-loc-ask-toast strong'))
  expectSameRow(mark, name)

  // 16px, and *the shipped icon* — the point of showing a mark at all is that
  // it is the one in the user's toolbar, not a second drawing of it.
  expect(mark.width).toBe(16)
  expect(mark.height).toBe(16)
  expect(
    await page.locator('#x-loc-ask-toast img').getAttribute('src'),
  ).toContain('src/assets/icons/')
})

test('the three answers sit on one row with the question', async ({ page }) => {
  const question = await box(page.locator('.x-loc-ask-msg'))
  const yes = await box(page.locator('#ask-yes'))
  const later = await box(page.locator('#ask-later'))
  const no = await box(page.locator('#ask-no'))

  expectSameRow(question, yes)
  expectSameRow(yes, later)
  expectSameRow(later, no)
})

test('saying no is exactly as easy as saying yes', async ({ page }) => {
  // The dismissals are a weight quieter, deliberately — but not smaller, not
  // hidden behind an ✕, and not one click further away. An ask that is hard to
  // refuse is the kind that gets answered with an uninstall.
  const yes = await box(page.locator('#ask-yes'))

  for (const id of ['#ask-later', '#ask-no']) {
    const b = await box(page.locator(id))
    expect(b.height).toBe(yes.height)
    expect(b.width).toBeGreaterThan(30)
  }
})

test('it is clickable, unlike the toasts it sits beside', async ({ page }) => {
  // The other two are pointer-events: none so they never swallow a click on X.
  // This one has buttons, so it must not inherit that.
  expect(
    await styleOf(page.locator('#x-loc-ask-toast'), 'pointer-events'),
  ).toBe('auto')
  await page.locator('#ask-later').click({ timeout: 2000 })
})

test('the product name never breaks in half', async ({ page }) => {
  // It is a flex item like any other, so at 360px it shrank and wrapped as
  // "X-" / "Pat". A product name split down the middle is worse than no name.
  const wide = await box(page.locator('#x-loc-ask-toast strong'))

  await page.setViewportSize({ width: 360, height: 720 })
  const narrow = await box(page.locator('#x-loc-ask-toast strong'))

  expect(narrow.height).toBe(wide.height)
})

test('it survives a phone-width viewport', async ({ page }) => {
  // X on a 360px phone is where the swipe gesture lives, so this bar will be
  // seen there. Wrapping is fine; running off the side is not.
  await page.setViewportSize({ width: 360, height: 720 })
  const bar = await box(page.locator('#x-loc-ask-toast'))

  expect(bar.x).toBeGreaterThanOrEqual(0)
  expect(right(bar)).toBeLessThanOrEqual(360)
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true)
})

test('it would collide with the rate-limit toast, which is why it yields', async ({
  page,
}) => {
  // Not a style assertion but a layout one: both are pinned to the same
  // bottom-centre slot, so `showRateLimitToast` dismissing this bar is not
  // defensive tidiness — it is the only thing keeping them off each other.
  const ask = await box(page.locator('#x-loc-ask-toast'))
  const rateLimit = await box(page.locator('#x-loc-rate-toast'))

  const overlaps =
    ask.x < right(rateLimit) &&
    rateLimit.x < right(ask) &&
    ask.y < rateLimit.y + rateLimit.height &&
    rateLimit.y < ask.y + ask.height
  expect(overlaps).toBe(true)
})
