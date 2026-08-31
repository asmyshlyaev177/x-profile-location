/**
 * The page must load at the top. The screenshots rail syncs to the active
 * slide with scrollToItem — native scrollIntoView, which scrolls the *page*
 * toward the rail too if the sync runs on mount (it shipped ~600px down once).
 */
import { expect, test } from '@playwright/test'

import { PREVIEW_URL } from '../playwright.audits.config'

test('homepage loads at the top', async ({ page }) => {
  await page.goto(`${PREVIEW_URL}/`)
  // Let any mount-time smooth scroll (rhsm duration 500ms) settle first.
  await page.waitForTimeout(1200)
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
})
