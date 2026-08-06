import path from 'path'
import os from 'os'
import { access, cp, rm, readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import {
  test as base,
  expect,
  type BrowserContext,
  type Page,
} from '@playwright/test'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { playwrightProxy } from 'test-proxy-recorder'

type Mode = 'record' | 'replay'

// Change to 'record' to hit the real API and update recordings.
export const MODE: Mode = 'replay'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'chrome')
export const AUTH_FILE = path.join(__dirname, '.auth', 'state.json')

/**
 * Written by `pnpm e2e:profile` — a real browser profile with a hand-made X
 * login, plus the binary it was made with. Present → tests run on that browser
 * and that session instead of Playwright's Chromium and a cookie replay, which
 * X is much quicker to flag. Absent → the state.json path below, unchanged.
 * Set E2E_SEED_PROFILE=0 to ignore a seeded profile for one run.
 */
export const PROFILE_MANIFEST = path.join(__dirname, '.auth', 'profile.json')

type SeededProfile = {
  browser: string
  executablePath: string
  profileDir: string
  seededAt: string
}

export async function readSeededProfile(): Promise<SeededProfile | null> {
  if (process.env.E2E_SEED_PROFILE === '0') return null
  const manifest = await readFile(PROFILE_MANIFEST, 'utf-8')
    .then(JSON.parse as (s: string) => SeededProfile)
    .catch(() => null)
  if (!manifest) return null

  // A manifest pointing at a deleted profile or an uninstalled browser is worse
  // than no manifest: silently falling back would run the whole suite on the
  // wrong session and fail somewhere far from the cause.
  for (const target of [manifest.profileDir, manifest.executablePath]) {
    const ok = await access(target).then(
      () => true,
      () => false,
    )
    if (!ok)
      throw new Error(
        `${PROFILE_MANIFEST} points at a missing ${target}. Re-run \`pnpm e2e:profile\`.`,
      )
  }
  return manifest
}

// All browser-side requests to X/Twitter APIs are recorded/replayed via HAR.
export const CLIENT_SIDE_URL =
  /x\.com|twimg\.com|abs\.twimg\.com|api\.x\.com|pscp\.tv|analytics\.twitter\.com/

chromium.use(StealthPlugin())

type StorageState = {
  cookies: Parameters<BrowserContext['addCookies']>[0]
  origins: { origin: string; localStorage: { name: string; value: string }[] }[]
}

type Fixtures = {
  context: BrowserContext
  extensionId: string
  page: Page
}

export const test = base.extend<Fixtures>({
  // The empty pattern is Playwright's signature for a fixture that uses none of
  // the built-in ones; it cannot be written any other way.
  // oxlint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = path.join(os.tmpdir(), `pw-ext-${Date.now()}`)
    const seeded = await readSeededProfile()

    // Clone the seed rather than launching it: the browser rewrites the profile
    // as it runs, and a failed run must not cost the login.
    if (seeded) await cp(seeded.profileDir, userDataDir, { recursive: true })

    const context = (await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      executablePath: seeded?.executablePath,
      args: [
        '--no-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
        // Keeps navigator.webdriver false. Playwright's --enable-automation
        // (dropped below) sets it, and it is the first thing X checks for.
        '--disable-blink-features=AutomationControlled',
        // A seeded profile can carry tabs from the manual login session.
        '--disable-session-crashed-bubble',
        '--hide-crash-restore-bubble',
      ],
      ignoreDefaultArgs: ['--enable-automation'],
    })) as unknown as BrowserContext

    // Load saved auth state (cookies + localStorage) from the setup step.
    // A seeded profile already holds the real session — replaying cookies over
    // it would only clobber whatever X has rotated since.
    const state = seeded
      ? null
      : await readFile(AUTH_FILE, 'utf-8')
          .then(JSON.parse as (s: string) => StorageState)
          .catch(() => null)
    if (state) {
      await context.addCookies(state.cookies)
      for (const { origin, localStorage: items } of state.origins) {
        await context.addInitScript(
          ({ o, entries }) => {
            if (location.origin === o) {
              for (const { name, value } of entries)
                localStorage.setItem(name, value)
            }
          },
          { o: origin, entries: items },
        )
      }
    }

    await use(context)
    await context.close()
    await rm(userDataDir, { recursive: true, force: true })
  },

  extensionId: async ({ context }, use) => {
    const extPage = await context.newPage()
    await extPage.goto('chrome://extensions/')
    await extPage.waitForLoadState('domcontentloaded')
    const extensionId = await extPage.evaluate(() => {
      const manager = document.querySelector('extensions-manager') as any
      const itemList = manager?.shadowRoot?.querySelector(
        'extensions-item-list',
      ) as any
      const item = itemList?.shadowRoot?.querySelector(
        'extensions-item',
      ) as Element | null
      return item?.getAttribute('id') ?? null
    })
    await extPage.close()
    if (!extensionId)
      throw new Error('Extension not found on chrome://extensions/')
    await use(extensionId)
  },

  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage()
    await playwrightProxy.before(page, testInfo, MODE, { url: CLIENT_SIDE_URL })
    await use(page)
  },
})

export { expect }

/**
 * Pins the extension to the Chrome toolbar.
 * Call this in beforeEach for any test that needs to click the extension icon.
 */
export async function pinExtension(
  context: BrowserContext,
  extensionId: string,
): Promise<void> {
  const extPage = await context.newPage()
  await extPage.goto('chrome://extensions/')
  await extPage.waitForLoadState('domcontentloaded')

  // chrome.developerPrivate is only available in the chrome://extensions/ page context.
  await extPage.evaluate((id) => {
    return new Promise<void>((resolve) => {
      // @ts-expect-error — internal Chrome API available on chrome://extensions/
      chrome.developerPrivate.updateExtensionConfiguration(
        { extensionId: id, pinnedToToolbar: true },
        resolve,
      )
    })
  }, extensionId)

  await extPage.close()
}
