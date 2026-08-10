/**
 * The flag row, in the two states the same location can be drawn in: ⚠️ while
 * the location rule is acting on the account, the country's own flag once the
 * reader has excepted it.
 *
 * The glyph is swapped where it stands rather than the row being rebuilt, and
 * only a real layout engine can say whether that holds — whether the two states
 * occupy one box, and whether what comes back is drawn like every other flag.
 *
 * Layout facts, not pixels — see hover-card.spec.ts for why.
 */
import { expect, test } from '@playwright/test'
import { box, expectSameRow, openFixture, right, styleOf } from './helpers'

test.beforeEach(async ({ page }) => {
  await openFixture(page, 'location-row')
})

/** One glyph swapping for another must not move anything around it. */
const SWAP_TOLERANCE_PX = 2

test('excepting an account does not change the size of its row', async ({
  page,
}) => {
  // The whole reason the glyph is swapped in place rather than the row rebuilt.
  // Two posts identical but for the glyph: if the row is a different height in
  // the two states then adding an exception resizes a post, and X's timeline
  // answers a post resizing by scrolling the window — by a multiple of the
  // height that actually changed, once more than one post moves in a frame.
  const warned = await box(page.locator('#warned-row'))
  const excepted = await box(page.locator('#excepted-row'))
  const warnedPost = await box(page.locator('#warned-post'))
  const exceptedPost = await box(page.locator('#excepted-post'))

  expect(Math.abs(warned.height - excepted.height)).toBeLessThanOrEqual(
    SWAP_TOLERANCE_PX,
  )
  expect(
    Math.abs(warned.y - warnedPost.y - (excepted.y - exceptedPost.y)),
  ).toBeLessThanOrEqual(SWAP_TOLERANCE_PX)
})

test('and does not change the height of the post around it', async ({
  page,
}) => {
  // The box X's timeline watches, and compensates for by scrolling the window.
  const warned = await box(page.locator('#warned-post'))
  const excepted = await box(page.locator('#excepted-post'))

  expect(Math.abs(warned.height - excepted.height)).toBeLessThanOrEqual(
    SWAP_TOLERANCE_PX,
  )
})

test('the flag handed back is drawn like any other flag', async ({ page }) => {
  // Sized by the stylesheet, off the classes the swap leaves in place. A glyph
  // that came back at the abbreviation's size, or the warning's, would read as a
  // different kind of thing from the country on the post above it.
  expect(await styleOf(page.locator('#excepted-flag'), 'font-size')).toBe(
    await styleOf(page.locator('#plain-flag'), 'font-size'),
  )
  expect(await styleOf(page.locator('#excepted-store'), 'font-size')).toBe(
    await styleOf(page.locator('#plain-store'), 'font-size'),
  )
  expect(
    parseFloat(await styleOf(page.locator('#excepted-store'), 'font-size')),
  ).toBeLessThan(
    parseFloat(await styleOf(page.locator('#excepted-flag'), 'font-size')),
  )
})

test('the restored flag wears none of the warning’s decoration', async ({
  page,
}) => {
  // ⚠ VPN is a filled, bordered badge; a flag is a glyph. Anything that made
  // the flag look like a badge is a rule reaching it that never should.
  expect(
    await styleOf(page.locator('#excepted-flag'), 'background-color'),
  ).toBe('rgba(0, 0, 0, 0)')
  expect(
    await styleOf(page.locator('#excepted-flag'), 'border-top-style'),
  ).toBe('none')
})

test('the store flag stays inside the block it sits in', async ({ page }) => {
  // The block is a padded, bordered pill around a platform mark, and the two
  // glyphs are not the same width. Wider than the box allows and the flag ends
  // up sitting on the border.
  const block = await box(page.locator('#excepted-post .x-loc-store-block'))
  const flag = await box(page.locator('#excepted-store'))
  const glyph = await box(page.locator('#excepted-post .x-loc-glyph'))

  expect(right(flag)).toBeLessThanOrEqual(right(block) - 1)
  expect(flag.x).toBeGreaterThan(right(glyph) - 1)
  expectSameRow(glyph, flag)
})

test('both flags stay on one line with each other', async ({ page }) => {
  const store = await box(page.locator('#excepted-store'))
  const flag = await box(page.locator('#excepted-flag'))

  expectSameRow(store, flag)
  expect(flag.x).toBeGreaterThan(right(store))
})

test('a region comes back as text, sized as text', async ({ page }) => {
  // A region has no flag, so the abbreviation stands in — and it is a word, not
  // a pictogram, so it is set at text size and weight rather than blown up to
  // match the emoji beside it.
  const warned = page.locator('#region-warned')
  const excepted = page.locator('#region-excepted')

  const emojiSize = parseFloat(await styleOf(warned, 'font-size'))
  const abbrSize = parseFloat(await styleOf(excepted, 'font-size'))

  expect(abbrSize).toBeLessThan(emojiSize)
  expect(
    parseInt(await styleOf(excepted, 'font-weight'), 10),
  ).toBeGreaterThanOrEqual(700)
  expect(await styleOf(excepted, 'letter-spacing')).not.toBe('normal')
})

test('a region swap does not resize its post either', async ({ page }) => {
  // The one that caught the bug. The abbreviation is set smaller than the emoji
  // it replaces, so this holds only because it also carries a min-height —
  // without one, excepting an account in a blocked *region* took 12px out of
  // every post of theirs on screen, which is the resize the swap exists to avoid.
  const warned = await box(page.locator('#region-post'))
  const excepted = await box(page.locator('#region-excepted-post'))

  expect(Math.abs(warned.height - excepted.height)).toBeLessThanOrEqual(
    SWAP_TOLERANCE_PX,
  )
})

test('a post still filtered shows no row at all', async ({ page }) => {
  // Which is what makes the exception the thing that reveals the flag: while the
  // rule is acting the post is collapsed and the row goes with it, so the reader
  // only ever sees the swapped glyph on a post they asked to keep.
  await expect(page.locator('#collapsed-row')).toBeHidden()
  await expect(page.locator('#collapsed-post .x-loc-hidden-ph')).toBeVisible()
})

test('the card’s flags and its undo button keep their places', async ({
  page,
}) => {
  // The hover card is a stretching flex column that has taken our buttons out to
  // full width before, and the exception is usually added from here — so the row
  // and the undo button under it are the pair most likely to be read together.
  const card = await box(page.locator('#card'))
  const row = await box(page.locator('#card-row'))
  const undo = await box(page.locator('#card-exc'))

  expect(right(row)).toBeLessThanOrEqual(right(card) + 1)
  expect(undo.y).toBeGreaterThan(row.y)
  expect(undo.width).toBeLessThan(card.width * 0.75)
})
