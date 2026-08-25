/**
 * Every visible text node on every route, scored against WCAG 2 AA and APCA.
 * Floors come from the package. See CLAUDE.md.
 */
import { expect, test } from '@playwright/test'
import {
  auditContrast,
  contrastFailures,
  describeContrast,
} from '@asmyshlyaev177/design-tokens/contrast'

import { PREVIEW_URL } from '../playwright.audits.config'
import { en } from '../src/i18n/dict/en'
import { routes } from '../src/routes'

/** English only: the locale changes the font stack, not the pixels compared. */
const PAGES = routes.map((r) => r.path)

const report = (findings: ReturnType<typeof contrastFailures>) =>
  findings.map(describeContrast).join('\n')

for (const path of PAGES) {
  const name = path === '/' ? '/ (homepage)' : path

  test(`${name} clears WCAG 2 AA and the APCA floor`, async ({ page }) => {
    await page.goto(`${PREVIEW_URL}${path}`)

    const { findings, unresolved } = await auditContrast(page)

    // Text over art is unmeasurable; without these a background-image covering
    // the page would leave the suite green having measured nothing.
    expect(findings.length).toBeGreaterThan(20)
    expect(unresolved).toBeLessThan(findings.length)

    expect(report(contrastFailures(findings))).toBe('')
  })
}

/** Nothing in the lightbox is in the document flow until it opens, so
 *  Lighthouse never sees it. */
test('the screenshot lightbox clears both floors', async ({ page }) => {
  await page.goto(PREVIEW_URL)
  await page
    .getByRole('button', { name: en.screenshots.fullSize })
    .first()
    .click()

  const dialog = page.locator('dialog.lightbox[open]')
  await expect(dialog).toBeVisible()

  const { findings } = await auditContrast(page, {
    root: 'dialog.lightbox[open]',
  })

  expect(findings.length).toBeGreaterThan(1)
  expect(report(contrastFailures(findings))).toBe('')
})
