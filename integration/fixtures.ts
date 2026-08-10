import path from 'path'
import os from 'os'
import { rm } from 'fs/promises'
import { fileURLToPath } from 'url'
import {
  test as base,
  expect,
  chromium,
  type BrowserContext,
} from '@playwright/test'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'chrome')

type Fixtures = {
  context: BrowserContext
  extensionId: string
}

export const test = base.extend<Fixtures>({
  // The empty pattern is Playwright's signature for a fixture that uses none of
  // the built-in ones; it cannot be written any other way.
  // oxlint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = path.join(os.tmpdir(), `pw-int-${Date.now()}`)
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      // Playwright's headless default is the headless *shell*, a separate binary
      // with no extension support at all: `--load-extension` is ignored and
      // `chrome://extensions` is not a valid URL under it, so the extensionId
      // fixture below fails before any test runs. `channel: 'chromium'` asks for
      // the full browser, whose headless mode loads an extension as a headed one
      // does. Same trap, same fix, as e2e/fixtures.ts.
      channel: 'chromium',
      args: [
        '--no-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    })

    await use(context)
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  },

  extensionId: async ({ context }, use) => {
    const page = await context.newPage()
    await page.goto('chrome://extensions/')
    await page.waitForLoadState('domcontentloaded')
    const extensionId = await page.evaluate(() => {
      const manager = document.querySelector('extensions-manager') as any
      const item = manager?.shadowRoot
        ?.querySelector('extensions-item-list')
        ?.shadowRoot?.querySelector('extensions-item') as Element | null
      return item?.getAttribute('id') ?? null
    })
    await page.close()
    if (!extensionId)
      throw new Error('Extension not found on chrome://extensions/')
    await use(extensionId)
  },
})

/**
 * Writes settings the way the options page does. Extension pages are the only
 * context that can reach `chrome.storage.local` directly, and the content script
 * and service worker both pick the change up from `storage.onChanged`.
 */
export async function setSettings(
  context: BrowserContext,
  extensionId: string,
  settings: Record<string, unknown>,
): Promise<void> {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/pages/options.html`)
  await page.evaluate((items) => chrome.storage.local.set(items), settings)
  await page.close()
}

export { expect }
