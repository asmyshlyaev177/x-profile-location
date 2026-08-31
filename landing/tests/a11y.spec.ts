/**
 * axe for structure and semantics, `auditContrast` for colour, both against one
 * loaded route. Floors come from the package; see CLAUDE.md.
 *
 * Not covered by the Lighthouse project beside it: that runs 76 audits — 66
 * real axe rules plus 10 manual items that never execute — against axe's 104,
 * weighted into an average, never opens the lightbox, and scores no element
 * without a text node.
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

/** Rules axe declines to decide. Anything unlisted fails, so a new one gets a
 *  decision once instead of living unread in the report. */
const REVIEWED_INCOMPLETE = new Set<string>()

/** Every assertion soft, so one half cannot hide the other. */
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
  // Text over art is unmeasurable: a background-image covering the page would
  // otherwise leave the suite green having measured nothing.
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

/** Nothing in the lightbox exists until it opens, so Lighthouse never sees it
 *  and `aria-dialog-name`, `aria-hidden-focus` and `nested-interactive` have
 *  nothing to say. */
test('the screenshot lightbox clears both', async ({ page }) => {
  await page.goto(PREVIEW_URL)

  const dialog = page.locator('dialog.lightbox[open]')
  // Retry the click itself: the page prerenders, so a click at `load` can land
  // before hydration attaches the handler and simply be lost.
  await expect(async () => {
    await page
      .getByRole('button', { name: en.screenshots.fullSize })
      .first()
      .click()
    await expect(dialog).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 15_000 })

  await auditBoth(page, { root: 'dialog.lightbox[open]', minNodes: 1 })
})
