/**
 * What collapsing a post actually does to it.
 *
 * These rules are the ones with real consequences if they break: a selector
 * that stops matching leaves a filtered post fully readable, and one that
 * matches too much takes away a post nobody filtered. Neither shows up in a
 * unit test, because both are decided by the browser's cascade.
 */
import { expect, test } from '@playwright/test'
import { box, centreY, expectSameRow, openFixture, right } from './helpers'

test.beforeEach(async ({ page }) => {
  await openFixture(page, 'collapsed-post')
})

test('collapse hides the post but keeps the placeholder', async ({ page }) => {
  await expect(page.locator('#collapsed-body')).toBeHidden()
  await expect(page.locator('#ph')).toBeVisible()
})

test('hide takes the whole post, placeholder and all', async ({ page }) => {
  // The silent mode. Collapsing only the children would leave an empty bordered
  // box where the post was.
  await expect(page.locator('#hidden')).toBeHidden()
  await expect(page.locator('#hidden-body')).toBeHidden()
})

test('an unfiltered post is left completely alone', async ({ page }) => {
  await expect(page.locator('#plain-body')).toBeVisible()
})

test('a collapsed quote leaves the post quoting it readable', async ({
  page,
}) => {
  // X-Posed collapsed the whole row for the quoted account and had to fix it
  // after complaints: it takes away a post the reader never filtered.
  await expect(page.locator('#host-body')).toBeVisible()
  await expect(page.locator('#quote-body')).toBeHidden()
  await expect(page.locator('#quote .x-loc-hidden-ph')).toBeVisible()
})

test('the placeholder is one row: label left, "Show" right', async ({
  page,
}) => {
  const ph = await box(page.locator('#ph'))
  const label = await box(page.locator('#ph .x-loc-hidden-label'))
  const show = await box(page.locator('#show'))

  expectSameRow(label, show)
  expect(show.x).toBeGreaterThan(right(label))
  expect(right(show)).toBeLessThanOrEqual(right(ph) + 1)
})

test('nothing offers to spare the account while the post is collapsed', async ({
  page,
}) => {
  // The reader has not seen the post yet, so there is nothing to judge the
  // account by — the button arrives with the post "Show" reveals.
  await expect(page.locator('#ph .x-loc-exc-btn')).toHaveCount(0)
  await expect(page.locator('#exc')).toBeVisible()
})

test('the revealed exception button rides on the flags row', async ({
  page,
}) => {
  // Styled for the hover card, where it sits under the flags on a line of its
  // own. That stacking margin has pushed it out of a centred row before.
  const flag = await box(page.locator('#revealed-row .x-loc-icon-flag'))
  const exception = await box(page.locator('#exc'))
  const text = await box(page.locator('#revealed-text'))

  expectSameRow(flag, exception)
  expect(Math.abs(centreY(flag) - centreY(exception))).toBeLessThanOrEqual(2)
  expect(exception.x).toBeGreaterThan(right(flag))
  // On the row, not in the post: the text stays a line of its own below.
  expect(text.y).toBeGreaterThanOrEqual(exception.y + exception.height - 1)
})

test('a label long enough to wrap does not push "Show" off the row', async ({
  page,
}) => {
  const ph = await box(page.locator('#ph-long'))
  const show = await box(page.locator('#show-long'))

  expect(right(show)).toBeLessThanOrEqual(right(ph) + 1)
  expect(show.width).toBeGreaterThan(0)
})
