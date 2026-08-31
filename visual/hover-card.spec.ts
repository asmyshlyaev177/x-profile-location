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
  const about = await box(page.locator('#about'))

  expect(exception.width).toBeLessThan(card.width * 0.75)
  expect(share.width).toBeLessThan(card.width * 0.5)
  expect(about.width).toBeLessThan(card.width * 0.5)
})

test('both copy buttons ride in the flags row rather than under it', async ({
  page,
}) => {
  // A hover card is short on vertical space, and the buttons are actions on
  // exactly what that row shows.
  const flag = await box(page.locator('#info .x-loc-icon-flag'))
  const share = await box(page.locator('#share'))
  const about = await box(page.locator('#about'))

  expect(Math.abs(centreY(flag) - centreY(share))).toBeLessThanOrEqual(4)
  expect(Math.abs(centreY(flag) - centreY(about))).toBeLessThanOrEqual(4)
  expect(share.x).toBeGreaterThan(right(flag))
  // Post then About, the order syncShareButtons appends them in.
  expect(about.x).toBeGreaterThan(right(share) - 1)
})

test('the two copy buttons read as siblings, not one control', async ({
  page,
}) => {
  // Same class, same recipe: a visible size or colour difference would make
  // one look primary when neither is.
  const share = await box(page.locator('#share'))
  const about = await box(page.locator('#about'))
  expect(Math.abs(share.height - about.height)).toBeLessThanOrEqual(1)

  const shareColor = await styleOf(page.locator('#share'), 'color')
  const aboutColor = await styleOf(page.locator('#about'), 'color')
  expect(aboutColor).toBe(shareColor)

  // A visible gap between them — two touching pills read as one.
  expect(about.x - right(share)).toBeGreaterThanOrEqual(2)
})

test('nothing overflows the card it was inserted into', async ({ page }) => {
  const card = await box(page.locator('#full'))
  for (const id of ['#info', '#card', '#exc', '#about']) {
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

test('the supplied bio reads under the handle, above what we add', async ({
  page,
}) => {
  // It is the account's own words standing in for the ones X withheld, so it
  // belongs where X would have put them — not below our flags and chips.
  const handle = await box(page.locator('#blocked-card .handle'))
  const bio = await box(page.locator('#blocked-bio'))
  const flags = await box(page.locator('#blocked-info'))

  expect(centreY(handle)).toBeLessThan(centreY(bio))
  expect(centreY(bio)).toBeLessThan(centreY(flags))
})

test('a long supplied bio wraps instead of widening the card', async ({
  page,
}) => {
  const card = await box(page.locator('#blocked-card'))
  const bio = await box(page.locator('#blocked-bio'))

  expect(right(bio)).toBeLessThanOrEqual(right(card) + 1)
  // Wrapped, so taller than the single line it would be if it hadn't.
  expect(bio.height).toBeGreaterThan(24)
})

test('the supplied bio is marked as not being X’s own text', async ({
  page,
}) => {
  // A bio the page never rendered, presented exactly like one it did, is the
  // extension putting words in X's mouth.
  const style = await styleOf(page.locator('#blocked-bio'), 'border-left-style')
  const width = await styleOf(page.locator('#blocked-bio'), 'border-left-width')

  expect(style).toBe('solid')
  expect(parseFloat(width)).toBeGreaterThan(0)
})

test('the block chip reads as a state, not as another fact', async ({
  page,
}) => {
  // It sits in a row of chips that are all plain statements about the account;
  // this one is about the reader, and has to be findable at a glance.
  const blockBg = await styleOf(
    page.locator('#blocked-chip'),
    'background-color',
  )
  const warnBg = await styleOf(
    page.locator('#blocked-warn'),
    'background-color',
  )
  const plainBg = await styleOf(
    page.locator('#blocked-plain'),
    'background-color',
  )

  expect(blockBg).not.toBe(warnBg)
  expect(blockBg).not.toBe(plainBg)
  expect(blockBg).not.toBe('rgba(0, 0, 0, 0)')
})

test('the chips still share a row with the block chip among them', async ({
  page,
}) => {
  const block = await box(page.locator('#blocked-chip'))
  const warn = await box(page.locator('#blocked-warn'))

  expect(Math.abs(centreY(block) - centreY(warn))).toBeLessThanOrEqual(2)
  expect(warn.x).toBeGreaterThan(right(block) - 1)
})
