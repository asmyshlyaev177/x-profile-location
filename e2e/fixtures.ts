import path from 'path';
import os from 'os';
import { rm, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { test as base, expect, type BrowserContext, type Page } from '@playwright/test';
import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { playwrightProxy } from 'test-proxy-recorder';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const EXTENSION_PATH = path.join(__dirname, '..', 'dist', 'chrome');
export const AUTH_FILE = path.join(__dirname, '.auth', 'state.json');

// All browser-side requests to X/Twitter APIs are recorded/replayed via HAR.
const CLIENT_SIDE_URL = /x\.com|twimg\.com|abs\.twimg\.com|api\.x\.com|pscp\.tv|analytics\.twitter\.com/;

// Change to 'record' to hit the real API and update recordings.
export const MODE: 'record' | 'replay' = 'replay';

chromium.use(StealthPlugin());

type StorageState = {
  cookies: Parameters<BrowserContext['addCookies']>[0];
  origins: { origin: string; localStorage: { name: string; value: string }[] }[];
};

type Fixtures = {
  context: BrowserContext;
  extensionId: string;
  page: Page;
};

export const test = base.extend<Fixtures>({
  context: async ({}, use) => {
    const userDataDir = path.join(os.tmpdir(), `pw-ext-${Date.now()}`);

    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--no-sandbox',
        `--disable-extensions-except=${EXTENSION_PATH}`,
        `--load-extension=${EXTENSION_PATH}`,
      ],
    }) as unknown as BrowserContext;

    // Load saved auth state (cookies + localStorage) from the setup step.
    const state = await readFile(AUTH_FILE, 'utf-8').then(JSON.parse as (s: string) => StorageState).catch(() => null);
    if (state) {
      await context.addCookies(state.cookies);
      for (const { origin, localStorage: items } of state.origins) {
        await context.addInitScript(({ o, entries }) => {
          if (location.origin === o) {
            for (const { name, value } of entries) localStorage.setItem(name, value);
          }
        }, { o: origin, entries: items });
      }
    }

    await context.route('**google-analytics.com/**', (route) => route.abort());

    await use(context);
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  },

  extensionId: async ({ context }, use) => {
    const extPage = await context.newPage();
    await extPage.goto('chrome://extensions/');
    await extPage.waitForLoadState('domcontentloaded');
    const extensionId = await extPage.evaluate(() => {
      const manager = document.querySelector('extensions-manager') as any;
      const itemList = manager?.shadowRoot?.querySelector('extensions-item-list') as any;
      const item = itemList?.shadowRoot?.querySelector('extensions-item') as Element | null;
      return item?.getAttribute('id') ?? null;
    });
    await extPage.close();
    if (!extensionId) throw new Error('Extension not found on chrome://extensions/');
    await use(extensionId);
  },

  page: async ({ context }, use, testInfo) => {
    const page = await context.newPage();
    await playwrightProxy.before(page, testInfo, MODE, { url: CLIENT_SIDE_URL });
    await use(page);
  },
});

export { expect };

/**
 * Pins the extension to the Chrome toolbar.
 * Call this in beforeEach for any test that needs to click the extension icon.
 */
export async function pinExtension(context: BrowserContext, extensionId: string): Promise<void> {
  const extPage = await context.newPage();
  await extPage.goto('chrome://extensions/');
  await extPage.waitForLoadState('domcontentloaded');

  // chrome.developerPrivate is only available in the chrome://extensions/ page context.
  await extPage.evaluate((id) => {
    return new Promise<void>((resolve) => {
      // @ts-expect-error — internal Chrome API available on chrome://extensions/
      chrome.developerPrivate.updateExtensionConfiguration(
        { extensionId: id, pinnedToToolbar: true },
        resolve,
      );
    });
  }, extensionId);

  await extPage.close();
}
