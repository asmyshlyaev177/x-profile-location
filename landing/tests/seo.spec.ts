/**
 * What the shipped documents promise a crawler, pinned after the site lost its
 * index admission in Aug 2026: an unindexed locale says so, an indexed page
 * names only indexed alternates, the sitemap agrees with both, and no language
 * is ever redirected to — only offered.
 */
import { expect, test, type APIRequestContext } from '@playwright/test'

import { PREVIEW_URL } from '../playwright.audits.config'
import {
  LANG_KEY,
  indexedLocales,
  localePath,
  locales,
} from '../src/i18n/locales'
import { localizedRoutes } from '../src/routes'

const unindexed = locales.filter((l) => !l.indexed)
const alternates = [
  ...indexedLocales.map((l) => l.htmlLang),
  'x-default',
].sort()

async function head(request: APIRequestContext, path: string) {
  const html = await (await request.get(`${PREVIEW_URL}${path}`)).text()
  return {
    html,
    robots: /<meta name="robots" content="([^"]*)"/.exec(html)?.[1],
    hreflang: [
      ...html.matchAll(
        /<link rel="alternate" hreflang="([^"]+)" href="([^"]+)"/g,
      ),
    ].map((m) => ({ lang: m[1]!, href: m[2]! })),
  }
}

test('an unindexed locale declines the index on every page', async ({
  request,
}) => {
  expect(unindexed.length).toBeGreaterThan(0)
  for (const l of unindexed) {
    for (const r of localizedRoutes) {
      const { robots, hreflang } = await head(
        request,
        localePath(l.code, r.path),
      )
      expect.soft(robots, `${l.code}${r.path}`).toBe('noindex')
      expect.soft(hreflang, `${l.code}${r.path}`).toEqual([])
    }
  }
})

test('an indexed page names exactly the indexed locales', async ({
  request,
}) => {
  for (const l of indexedLocales) {
    for (const r of localizedRoutes) {
      const path = localePath(l.code, r.path)
      const { robots, hreflang } = await head(request, path)
      expect.soft(robots, path).toMatch(/^index/)
      expect.soft(hreflang.map((h) => h.lang).sort(), path).toEqual(alternates)
      for (const u of unindexed) {
        expect
          .soft(
            hreflang.some((h) => h.href.includes(`/${u.code}`)),
            path,
          )
          .toBe(false)
      }
    }
  }
})

test('the sitemap lists the indexed pages and nothing else', async ({
  request,
}) => {
  const xml = await (await request.get(`${PREVIEW_URL}/sitemap.xml`)).text()
  const listed = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]!).pathname)
    .sort()
  const expected = indexedLocales
    .flatMap((l) => localizedRoutes.map((r) => localePath(l.code, r.path)))
    .sort()
  expect(listed).toEqual(expected)
  expect(xml.match(/<changefreq>[^<]*/g)).toEqual(
    expected.map(() => '<changefreq>monthly'),
  )
})

test('the head carries no keywords tag', async ({ request }) => {
  const { html } = await head(request, '/')
  expect(html).not.toContain('name="keywords"')
})

test('translated pages link the English privacy policy', async ({
  request,
}) => {
  for (const l of locales.filter((x) => x.code !== 'en')) {
    const { html } = await head(request, localePath(l.code, '/'))
    expect.soft(html, l.code).toContain('href="/privacy-policy"')
    expect.soft(html, l.code).not.toContain(`href="/${l.code}/privacy-policy"`)
  }
})

test.describe('language is offered, never detected into a redirect', () => {
  test('the inline script no longer reads the browser language', async ({
    request,
  }) => {
    const { html } = await head(request, '/')
    expect(html).not.toContain('navigator.language')
    expect(html).toMatch(new RegExp(`["']${LANG_KEY}["']`))
  })

  test.describe(() => {
    test.use({ locale: 'de-DE' })
    test('a German browser stays on / and gets a link to /de', async ({
      page,
    }) => {
      await page.goto(`${PREVIEW_URL}/x-rate-limit`)
      expect(new URL(page.url()).pathname).toBe('/x-rate-limit')
      const offer = page.locator('a[hreflang="de"]:visible').first()
      await expect(offer).toHaveAttribute('href', '/de/x-rate-limit')
      await page.getByRole('button', { name: 'Schließen' }).click()
      await expect(offer).toHaveCount(0)
      expect(
        await page.evaluate((k) => localStorage.getItem(k), LANG_KEY),
      ).toBe('en')
    })
  })

  test('an English browser is offered nothing', async ({ page }) => {
    await page.goto(`${PREVIEW_URL}/`)
    await page.waitForTimeout(1500)
    await expect(page.locator('a[hreflang]:visible')).toHaveCount(0)
  })

  test('a remembered choice still redirects the bare homepage', async ({
    page,
  }) => {
    await page.addInitScript((k) => localStorage.setItem(k, 'ja'), LANG_KEY)
    await page.goto(`${PREVIEW_URL}/`)
    await expect.poll(() => new URL(page.url()).pathname).toBe('/ja')
  })
})
