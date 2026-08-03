/**
 * The rating ask, as a browser lays it out.
 *
 * The popup's unit tests answer when it appears and what each button writes.
 * What they cannot answer is whether three controls fit across a 300px panel,
 * whether they line up, and whether the tap targets survive — happy-dom reports
 * no boxes, and this ask is the one piece of UI the extension shows on its own
 * initiative, so it looking wrong is worse than most things looking wrong.
 */
import { expect, test } from '@playwright/test'
import { box, expectSameRow, openPopupFixture, right, styleOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await openPopupFixture(page)
})

test('the fixture is wearing the real stylesheet', async ({ page }) => {
  // Guard against a vacuous suite: if the class names in the fixture and in
  // popup.module.css ever part company, every box below is measured on unstyled
  // markup and several of the assertions would still pass.
  expect(await styleOf(page.locator('.popup'), 'width')).toBe('300px')
  expect(await styleOf(page.locator('#rate'), 'border-radius')).toBe('8px')
})

test('the three actions sit on one row', async ({ page }) => {
  const rate = await box(page.locator('#rate-yes'))
  const later = await box(page.locator('#rate-later'))
  const no = await box(page.locator('#rate-no'))

  expectSameRow(rate, later)
  expectSameRow(later, no)
  // An <a> is content-box where a <button> is not, so the same min-height and
  // padding made the link 16px taller until `box-sizing` was set on it.
  expect(rate.height).toBe(later.height)
})

test('nothing overflows the panel', async ({ page }) => {
  // 300px is the whole constraint here. Three labels and two gaps is as much as
  // this row can hold, and the failure mode is a button wrapping under the
  // others where nobody reads it.
  const panel = await box(page.locator('.popup'))
  const no = await box(page.locator('#rate-no'))

  expect(right(no)).toBeLessThanOrEqual(right(panel))
  expect(
    await page.evaluate(() => {
      const el = document.querySelector('.rateActions')!
      return el.scrollWidth <= el.clientWidth
    }),
  ).toBe(true)
})

test('every action clears the 44px tap target', async ({ page }) => {
  for (const id of ['#rate-yes', '#rate-later', '#rate-no']) {
    expect((await box(page.locator(id))).height).toBeGreaterThanOrEqual(44)
  }
})

test('the footer has one primary action and two quiet links', async ({
  page,
}) => {
  // Three equal links made none of them look like the way out of this panel,
  // and "All settings" is the only one that leads somewhere people need twice.
  const settings = page.locator('#settings')
  const rate = page.locator('#rate-link')

  expect(await styleOf(settings, 'border-style')).toBe('solid')
  expect(await styleOf(rate, 'border-style')).toBe('none')
  expect(Number(await styleOf(settings, 'font-weight'))).toBeGreaterThan(
    Number(await styleOf(rate, 'font-weight')),
  )
  expect(await styleOf(settings, 'background-color')).not.toBe(
    await styleOf(rate, 'background-color'),
  )
})

test('all three footer items fit on one row', async ({ page }) => {
  // 300px, and the rate link was added between two things that were already
  // there. Wrapping would put "Donate" on a line of its own.
  const panel = await box(page.locator('.popup'))
  const settings = await box(page.locator('#settings'))
  const rate = await box(page.locator('#rate-link'))
  const donate = await box(page.locator('#donate'))

  expectSameRow(settings, rate)
  expectSameRow(rate, donate)
  expect(right(donate)).toBeLessThanOrEqual(right(panel))
})

test('the ask sits below the filters and above the footer', async ({
  page,
}) => {
  // Above the footer rather than in it: the footer is where the two permanent
  // links live, and a request that goes away once must not look like one.
  const sections = await box(page.locator('.section').last())
  const rate = await box(page.locator('#rate'))
  const footer = await box(page.locator('#footer'))

  expect(rate.y).toBeGreaterThan(sections.y)
  expect(rate.y).toBeLessThan(footer.y)
})

test('the ask is tinted rather than boxed', async ({ page }) => {
  // A border would make it read as another control to deal with. The tint is
  // the only thing separating it from the panel, so it has to actually differ.
  const card = page.locator('#rate')
  const panelBg = await styleOf(page.locator('.popup'), 'background-color')
  const cardBg = await styleOf(card, 'background-color')

  expect(cardBg).not.toBe(panelBg)
  // Transparent also differs from the panel, and is the way this fails.
  expect(cardBg).not.toContain('rgba(0, 0, 0, 0)')
  expect(await styleOf(card, 'border-style')).toBe('none')
})

test('it does not collide with the footer rule above it', async ({ page }) => {
  // .rate carries a bottom margin of its own and .footer a top one; the pair
  // needs one gap, not two.
  const rate = await box(page.locator('#rate'))
  const footer = await box(page.locator('#footer'))
  const gap = footer.y - (rate.y + rate.height)

  expect(gap).toBeGreaterThan(0)
  expect(gap).toBeLessThanOrEqual(12)
})

test('both themes render it, and differently', async ({ page }) => {
  // The popup follows the extension's own theme setting rather than X's, and
  // `light-dark()` resolves off `color-scheme` — which the popup sets on :root.
  // A theme that silently failed to apply would leave a light card on a dark
  // panel, which is what this catches.
  const readColours = async () => ({
    card: await styleOf(page.locator('#rate'), 'background-color'),
    text: await styleOf(page.locator('.rateText'), 'color'),
  })

  const light = await readColours()
  await openPopupFixture(page, 'dark')
  const dark = await readColours()

  expect(dark.card).not.toBe(light.card)
  expect(dark.text).not.toBe(light.text)
})
