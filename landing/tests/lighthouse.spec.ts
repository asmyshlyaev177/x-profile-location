/**
 * Lighthouse audits, one per page, against the production build.
 *
 * Performance is the one number here that isn't deterministic — it is a timing
 * measurement on whatever machine runs it. It holds at 100 because every page
 * is prerendered HTML with one stylesheet and one small bundle. If a future
 * change makes it flaky, lower *that* threshold rather than deleting the
 * assertion; the real performance signal is field data and PageSpeed Insights
 * against production. The other three are deterministic audits of the
 * document, and a drop in any of them is a regression rather than noise.
 */
import { chromium, expect, test } from '@playwright/test'
import { playAudit } from 'playwright-lighthouse'
import desktopConfig from 'lighthouse/core/config/desktop-config.js'

import { PREVIEW_URL } from '../playwright.audits.config'
import { localizedRoutes, routes } from '../src/routes'
import { DEFAULT_LOCALE, localePath, locales } from '../src/i18n/locales'

/**
 * Categories Lighthouse is asked to run — the same four on every page,
 * whichever of them that page is then held to.
 *
 * Pinned explicitly because `playAudit` otherwise derives `onlyCategories`
 * from the threshold keys, which would stop the SEO category running at all on
 * the `noindex` pages and take `is-crawlable` with it — the one audit those
 * pages exist here to check.
 *
 * Lighthouse 13's fifth category, `agentic-browsing`, is deliberately not on
 * the list. All seven pages score 100 on it today, but it is new enough that
 * Google is still moving its weights, and a patch bump re-scoring it would
 * fail this suite for a reason that has nothing to do with the site.
 */
const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

/** Every page is held to these. */
const ALWAYS = {
  performance: 100,
  accessibility: 100,
  'best-practices': 100,
}

/** And to SEO, if it asks to be indexed. */
const INDEXABLE = { ...ALWAYS, seo: 100 }

/**
 * What gets audited, derived rather than listed.
 *
 * `routes.ts` and `locales.ts` are already the site's two sources of pages —
 * the head, the canonicals, the hreflang set, the prerender list and the
 * sitemap all follow from them. Hand-listing pages here would add another
 * place to keep in step, and the page somebody forgot to add would be the one
 * that never got audited.
 *
 * Every English route, plus one page per additional language. The full cross
 * product is 4 × 15 + 2 = 62 audits at ~15 s each, which is a twenty-minute
 * suite for very little: the template is identical across locales, so what a
 * second language can break that the first did not is script-specific —
 * contrast against a different font stack, a heading that wraps differently,
 * and RTL mirroring. All three show up on the homepage, which carries every
 * component the guide pages use and several they do not.
 */
const AUDITED = [
  ...routes.map((route) => ({ route, path: route.path })),
  ...locales
    .filter((l) => l.code !== DEFAULT_LOCALE)
    .map((l) => ({
      route: localizedRoutes[0]!,
      path: localePath(l.code, '/'),
    })),
]

test.describe('Lighthouse', () => {
  // Serial, and the only thing holding the audits to one worker: Playwright
  // pins a serial describe to a single worker. Splitting this in two would give
  // each half a browser and skew both performance scores.
  test.describe.configure({ mode: 'serial' })

  for (const { route, path } of AUDITED) {
    const name = path === '/' ? '/ (homepage)' : path

    // No fixture parameter: a named first argument is a Playwright error and
    // `{}` is a lint error, so `test.info()` is the way out of both.
    test(`${name} meets Lighthouse thresholds`, async () => {
      // Lighthouse drives the browser over CDP, which needs a debugging port
      // the `page` fixture does not expose. Offset so workers cannot collide.
      const port = 9333 + test.info().workerIndex
      const browser = await chromium.launch({
        args: [`--remote-debugging-port=${port}`],
      })

      try {
        const page = await browser.newPage()
        await page.goto(`${PREVIEW_URL}${path}`, {
          waitUntil: 'networkidle',
        })

        const { lhr } = await playAudit({
          page,
          port,
          thresholds: route.noindex ? ALWAYS : INDEXABLE,
          opts: { onlyCategories: CATEGORIES },
          // Desktop, not the mobile default: mobile's 4x CPU slowdown scores
          // the runner. Desktop is also the audience — the Chrome Web Store.
          config: desktopConfig,
          disableLogs: false,
        })

        // `is-crawlable` is *meant* to fail here. Naming the one audit allowed
        // to fail asserts both halves: that `noindex` reached the shipped
        // document, and that nothing else in SEO regressed behind it.
        if (route.noindex) {
          const failed = lhr.categories.seo.auditRefs
            .filter((ref) => (lhr.audits[ref.id]?.score ?? 1) < 1)
            .map((ref) => ref.id)
          expect(failed).toEqual(['is-crawlable'])
        }
      } finally {
        await browser.close()
      }
    })
  }
})
