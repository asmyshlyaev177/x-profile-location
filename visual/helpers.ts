import { expect, type Locator, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { CONTENT_CSS } from '../src/scripts/styles'

/**
 * Load a fixture and put the *real* stylesheet over it.
 *
 * The DOM in the fixtures is hardcoded — a stand-in for what X renders and what
 * content.tsx injects into it — but the CSS is the shipped string, imported
 * from the module the content script injects. That split is the whole point: a
 * copy of the CSS would pass forever while the extension's own rules rotted.
 */
export async function openFixture(page: Page, name: string): Promise<void> {
  const url = new URL(`./fixtures/${name}.html`, import.meta.url)
  await page.goto(`file://${fileURLToPath(url)}`)
  await page.addStyleTag({ content: CONTENT_CSS })
}

/**
 * The same idea for an extension page: fixture markup, the page's real
 * stylesheet over it.
 *
 * Read off disk rather than imported, because `popup.module.css` is a CSS
 * module — Vite hashes its class names for the build, and Playwright's loader
 * would not resolve the import at all. The file as written uses the plain
 * names, so the fixture can carry them and still be styled by the shipped
 * rules.
 *
 * `theme` sets what the popup's own `light-dark()` pairs resolve to. 'system'
 * writes no attribute, exactly as `theme.ts` does.
 */
export async function openPopupFixture(
  page: Page,
  theme: 'system' | 'light' | 'dark' = 'light',
): Promise<void> {
  const url = new URL('./fixtures/popup.html', import.meta.url)
  await page.goto(`file://${fileURLToPath(url)}`)
  await page.addStyleTag({
    content: readFileSync(
      fileURLToPath(new URL('../src/pages/popup.module.css', import.meta.url)),
      'utf-8',
    ),
  })
  if (theme !== 'system') {
    await page.evaluate(
      (t) => document.documentElement.setAttribute('data-theme', t),
      theme,
    )
  }
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/** The element's box, failing rather than returning null when it has none. */
export async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox()
  expect(found, `${locator} has no box — is it displayed?`).not.toBeNull()
  return found!
}

export const right = (b: Box) => b.x + b.width
export const bottom = (b: Box) => b.y + b.height
export const centreY = (b: Box) => b.y + b.height / 2

/** Two elements sit on the same line if their vertical centres agree. */
export function expectSameRow(a: Box, b: Box, tolerance = 4): void {
  expect(Math.abs(centreY(a) - centreY(b))).toBeLessThanOrEqual(tolerance)
}

/** One computed property, as the browser resolved it. */
export function styleOf(locator: Locator, property: string): Promise<string> {
  return locator.evaluate(
    (el, prop) => getComputedStyle(el).getPropertyValue(prop),
    property,
  )
}
