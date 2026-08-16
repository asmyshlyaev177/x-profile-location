/**
 * A blocked region's chip and the country picker it opens.
 *
 * The unit tests answer what a checkbox writes and which countries a region
 * still covers. What they cannot answer is whether a chip carrying a region
 * name, a coverage count and a × survives a 300px popup, whether the picker
 * that drops out of it stays inside the panel, and whether a region with fifty
 * members scrolls instead of running off the bottom of the page.
 */
import { expect, test } from '@playwright/test'
import { box, expectSameRow, openPopupFixture, right, styleOf } from './helpers'

const CHIPS_CSS = '../src/components/LocationChips/LocationChips.module.css'

const openFixture = (
  page: Parameters<typeof openPopupFixture>[0],
  theme?: 'light' | 'dark',
) => openPopupFixture(page, theme ?? 'light', 'region-picker', [CHIPS_CSS])

test.beforeEach(async ({ page }) => {
  await openFixture(page)
})

test('the fixture is wearing both real stylesheets', async ({ page }) => {
  // One class from each: the chip is the popup's, everything inside it is the
  // component's. Either name drifting leaves the boxes below meaningless.
  expect(await styleOf(page.locator('#region-chip'), 'border-radius')).toBe(
    '9999px',
  )
  expect(await styleOf(page.locator('#region-count'), 'font-weight')).toBe(
    '700',
  )
})

test('the whole chip opens the picker, except the ×', async ({ page }) => {
  // The flag, the name and the count are inside one button so a click anywhere
  // on the chip opens the list; the × has to stay its own target or removing a
  // region would open it instead.
  const open = await box(page.locator('#region-open'))
  const flag = await box(page.locator('#region-flag'))
  const count = await box(page.locator('#region-count'))
  const remove = await box(page.locator('#region-remove'))

  expect(flag.x).toBeGreaterThanOrEqual(open.x - 1)
  expect(right(count)).toBeLessThanOrEqual(right(open) + 1)
  expect(remove.x).toBeGreaterThanOrEqual(right(open) - 1)
  expectSameRow(open, remove)
})

test('the chip row stays inside the panel', async ({ page }) => {
  const panel = await box(page.locator('.popup'))
  const remove = await box(page.locator('#region-remove'))
  const country = await box(page.locator('#country-remove'))

  expect(right(remove)).toBeLessThanOrEqual(right(panel))
  expect(right(country)).toBeLessThanOrEqual(right(panel))
  expect(
    await page.evaluate(() => {
      const el = document.querySelector('#chips')!
      return el.scrollWidth <= el.clientWidth
    }),
  ).toBe(true)
})

test('a plain country carries no count and no open button', async ({
  page,
}) => {
  // Nothing to open: a country stands for itself, so the chip is text and the
  // only control on it is the ×.
  expect(
    await page.locator('#country-chip button:not(.chipRemove)').count(),
  ).toBe(0)
})

test('the picker fits the panel and lists one country per row', async ({
  page,
}) => {
  const panel = await box(page.locator('.popup'))
  const picker = await box(page.locator('#narrow-picker'))
  const first = await box(page.locator('#narrow-0'))
  const second = await box(page.locator('#narrow-1'))

  expect(right(picker)).toBeLessThanOrEqual(right(panel))
  expect(right(first)).toBeLessThanOrEqual(right(picker))
  // 300px has room for one column, and two names sharing a row at this width
  // would each be clipped.
  expect(second.y).toBeGreaterThan(first.y)
})

test('a long list scrolls instead of growing', async ({ page }) => {
  // Some regions run to fifty-seven countries. Unbounded, the picker would push
  // the autocomplete under it off the bottom of a popup that cannot scroll to
  // reach it.
  const members = page.locator('#narrow-members')
  expect((await box(members)).height).toBeLessThanOrEqual(220)
  expect(
    await members.evaluate((el) => el.scrollHeight > el.clientHeight),
  ).toBe(true)
})

test('All and None sit beside the region name', async ({ page }) => {
  const title = await box(page.locator('#narrow-picker .pickerTitle'))
  const all = await box(page.locator('#narrow-all'))
  const none = await box(page.locator('#narrow-none'))
  const picker = await box(page.locator('#narrow-picker'))

  expectSameRow(title, all)
  expectSameRow(all, none)
  expect(right(none)).toBeLessThanOrEqual(right(picker))
})

test('the settings card gets more than one column', async ({ page }) => {
  // Same component, 700px instead of 300: the grid is what keeps a 57-country
  // region from being a single column half a screen tall.
  const first = await box(page.locator('#wide-0'))
  const second = await box(page.locator('#wide-1'))

  expectSameRow(first, second)
  expect(second.x).toBeGreaterThan(right(first) - 1)
})

test('both themes render the picker, and differently', async ({ page }) => {
  const readColours = async () => ({
    picker: await styleOf(page.locator('#narrow-picker'), 'background-color'),
    count: await styleOf(page.locator('#region-count'), 'color'),
  })

  const light = await readColours()
  await openFixture(page, 'dark')
  const dark = await readColours()

  expect(dark.picker).not.toBe(light.picker)
  expect(dark.count).not.toBe(light.count)
})
