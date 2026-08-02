/**
 * What the injected UI looks like on a hover card.
 *
 * Layout facts rather than pixels: every assertion here is a sentence about the
 * arrangement ("the button does not stretch", "these two are on one line"), so
 * it means the same thing on a CI runner with different fonts installed. The
 * pixel-diff version of this file would fail on the font substitution alone and
 * teach everyone to re-baseline it without looking.
 *
 * Each one is a bug this file has actually had.
 */
import { expect, test } from '@playwright/test'
import { box, centreY, openFixture, right, styleOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await openFixture(page, 'hover-card')
})

test('the pieces stack in the order they are written', async ({ page }) => {
  // insertIntoCard anchors every call to the same node, so separately inserted
  // elements came out in reverse — the copy button ended up above the flags it
  // belongs to. They go into one wrapper now, and this is what that buys.
  const flags = await box(page.locator('#info'))
  const chips = await box(page.locator('#card'))
  const exception = await box(page.locator('#exc'))

  expect(centreY(flags)).toBeLessThan(centreY(chips))
  expect(centreY(chips)).toBeLessThan(centreY(exception))
})

test('the buttons keep their own width inside X’s column', async ({ page }) => {
  // A hover card lays its children out in a stretching flex column, which took
  // both buttons out to the full width of the card and made them look like
  // banners.
  const card = await box(page.locator('#full'))
  const exception = await box(page.locator('#exc'))
  const share = await box(page.locator('#share'))

  expect(exception.width).toBeLessThan(card.width * 0.75)
  expect(share.width).toBeLessThan(card.width * 0.5)
})

test('the copy button rides in the flags row rather than under it', async ({
  page,
}) => {
  // A hover card is short on vertical space, and the button is an action on
  // exactly what that row shows.
  const flag = await box(page.locator('#info .x-loc-icon-flag'))
  const share = await box(page.locator('#share'))

  expect(Math.abs(centreY(flag) - centreY(share))).toBeLessThanOrEqual(4)
  expect(share.x).toBeGreaterThan(right(flag))
})

test('nothing overflows the card it was inserted into', async ({ page }) => {
  const card = await box(page.locator('#full'))
  for (const id of ['#info', '#card', '#exc']) {
    const piece = await box(page.locator(id))
    expect(right(piece)).toBeLessThanOrEqual(right(card) + 1)
  }
})

test('the undo state is visibly a different state', async ({ page }) => {
  // Same label position, same size — the colour is the whole signal, so it has
  // to actually change.
  const plain = await styleOf(page.locator('#exc'), 'color')
  const active = await styleOf(page.locator('#exc-active'), 'color')
  const activeBg = await styleOf(
    page.locator('#exc-active'),
    'background-color',
  )

  expect(active).not.toBe(plain)
  expect(activeBg).not.toBe('rgba(0, 0, 0, 0)')
})

test('the VPN caveat is styled as a warning, not as another flag', async ({
  page,
}) => {
  const vpn = await styleOf(page.locator('.x-loc-icon-vpn'), 'color')
  const flag = await styleOf(page.locator('#info .x-loc-icon-flag'), 'color')
  expect(vpn).not.toBe(flag)
})

test('a rate-limited card still renders its countdown', async ({ page }) => {
  const rate = await box(page.locator('#rate'))
  expect(rate.width).toBeGreaterThan(0)
})
