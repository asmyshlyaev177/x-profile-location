/**
 * The accessibility gate: axe-core for structure and semantics, `auditContrast`
 * for colour. One navigation feeds both, so a route is loaded once rather than
 * once per audit.
 *
 * Neither half is redundant with the Lighthouse accessibility score.
 * Lighthouse 13.4 bundles axe-core 4.12 and runs 76 audits — 66 real rules plus
 * 10 manual checklist items that never execute — against axe's 104, weighted
 * into an average rather than a per-rule verdict. It never opens the lightbox,
 * and it scores no element that holds no text node.
 *
 * Floors come from the package. See CLAUDE.md.
 */
import {
  COMPREHENSIVE_TAGS,
  auditA11y,
  describeViolation,
} from '@asmyshlyaev177/design-tokens/axe'
import {
  auditContrast,
  contrastFailures,
  describeContrast,
} from '@asmyshlyaev177/design-tokens/contrast'
import { expect, test, type Page } from '@playwright/test'

import { PREVIEW_URL } from '../playwright.audits.config'
import { en } from '../src/i18n/dict/en'
import { routes } from '../src/routes'

/** English only: the locale changes the font stack, not the pixels compared. */
const PAGES = routes.map((r) => r.path)

/**
 * Rules axe declines to decide. Anything not listed fails the run, so a new
 * "needs review" finding gets looked at once rather than living unnoticed in a
 * section of the report nobody reads.
 */
const REVIEWED_INCOMPLETE: string[] = new Set([])

/**
 * Both audits on one loaded page, every assertion soft: an axe violation must
 * not hide a contrast failure on the same page, or fixing one at a time turns
 * a single run into three.
 */
async function auditBoth(
  page: Page,
  { root, minNodes }: { root?: string; minNodes: number },
) {
  const axe = await auditA11y(page, {
    tags: COMPREHENSIVE_TAGS,
    include: root ? [root] : undefined,
  })
  // A selector typo that scoped the scan to nothing would otherwise pass.
  expect.soft(axe.passes).toBeGreaterThan(0)
  expect.soft(axe.violations.map(describeViolation).join('\n')).toBe('')
  expect
    .soft(
      [...new Set(axe.incomplete.map((r) => r.id))].filter(
        (id) => !REVIEWED_INCOMPLETE.has(id),
      ),
    )
    .toEqual([])

  const { findings, unresolved } = await auditContrast(page, { root })
  // Text over art is unmeasurable; without these a background-image covering
  // the page would leave the suite green having measured nothing.
  expect.soft(findings.length).toBeGreaterThan(minNodes)
  expect.soft(unresolved).toBeLessThan(findings.length)
  expect
    .soft(contrastFailures(findings).map(describeContrast).join('\n'))
    .toBe('')
}

for (const path of PAGES) {
  const name = path === '/' ? '/ (homepage)' : path

  test(`${name} clears axe, WCAG 2 AA and the APCA floor`, async ({ page }) => {
    await page.goto(`${PREVIEW_URL}${path}`)
    await auditBoth(page, { minNodes: 20 })
  })
}

/** Nothing in the lightbox is in the document flow until it opens, so
 *  Lighthouse never sees it — and `aria-dialog-name`, `aria-hidden-focus` and
 *  `nested-interactive` have nothing to say until then either. */
test('the screenshot lightbox clears both', async ({ page }) => {
  await page.goto(PREVIEW_URL)
  await page
    .getByRole('button', { name: en.screenshots.fullSize })
    .first()
    .click()

  const dialog = page.locator('dialog.lightbox[open]')
  await expect(dialog).toBeVisible()

  await auditBoth(page, { root: 'dialog.lightbox[open]', minNodes: 1 })
})
