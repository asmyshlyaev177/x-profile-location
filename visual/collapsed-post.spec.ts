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

test('the placeholder is one row: label left, actions right', async ({
  page,
}) => {
  const ph = await box(page.locator('#ph'))
  const label = await box(page.locator('#ph .x-loc-hidden-label'))
  const show = await box(page.locator('#show'))
  const exception = await box(page.locator('#exc'))

  expectSameRow(label, show)
  expectSameRow(show, exception)
  // Actions right-aligned, in escalating order: reveal this post, then spare
  // the account.
  expect(show.x).toBeGreaterThan(right(label))
  expect(exception.x).toBeGreaterThan(right(show))
  expect(right(exception)).toBeLessThanOrEqual(right(ph) + 1)
})

test('the exception button drops its stacking margin in the placeholder', async ({
  page,
}) => {
  // It is styled for the hover card, where it sits under the flags on a line of
  // its own. Carried into a centred row, that margin pushed it out of line.
  const show = await box(page.locator('#show'))
  const exception = await box(page.locator('#exc'))
  expect(Math.abs(centreY(show) - centreY(exception))).toBeLessThanOrEqual(2)
})

test('a label long enough to wrap does not push the actions off the row', async ({
  page,
}) => {
  const ph = await box(page.locator('#ph-long'))
  const show = await box(page.locator('#show-long'))
  const exception = await box(page.locator('#exc-long'))

  expectSameRow(show, exception)
  expect(right(exception)).toBeLessThanOrEqual(right(ph) + 1)
  expect(show.width).toBeGreaterThan(0)
})
