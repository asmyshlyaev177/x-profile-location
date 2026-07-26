// Retakes extension_store/screen_5.png — the options-page store screenshot.
//
//   pnpm build            (in the repo root, so dist/chrome is current)
//   pnpm shoot:options    (here)
//
// Runs headed under a virtual display, because Chrome refuses to load an
// unpacked extension in headless mode. On a machine with no display, wrap it:
//   xvfb-run --auto-servernum pnpm shoot:options
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
// Playwright comes from the repo root (the extension's e2e dependency), so the
// landing workspace needs no browser tooling of its own.
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const EXTENSION = path.join(REPO, 'dist', 'chrome')
const OUT =
  process.argv[2] ??
  path.join(REPO, 'landing', 'extension_store', 'screen_5.png')

// The store wants exactly this; captured at 2x and downscaled so text stays sharp.
const WIDTH = 1280
const HEIGHT = 800

// What the shot should show off. Sections not listed stay collapsed, which is
// what keeps the page inside HEIGHT.
const SETTINGS = {
  highlightKeywords: ['he/him', 'nafo', 'nafofella', '🇷🇺', '🇺🇦'],
  blockedCountries: ['India', 'South Asia', 'Nigeria', 'Pakistan'],
  showLocationInFeed: true,
  sharedCacheEnabled: true,
  backgroundPrefetch: true,
  prefetchShare: 0.7,
  prefetchPacing: 'spread',
  optionsSections: {
    keywords: true,
    flags: false,
    exceptions: false,
    prefetch: true,
    blocked: false,
  },
}

const profileDir = path.join(os.tmpdir(), `store-shot-${Date.now()}`)
const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 2,
  args: [
    '--no-sandbox',
    `--disable-extensions-except=${EXTENSION}`,
    `--load-extension=${EXTENSION}`,
  ],
})

let [worker] = ctx.serviceWorkers()
if (!worker) worker = await ctx.waitForEvent('serviceworker')
const extensionId = new URL(worker.url()).host

const page = await ctx.newPage()
await page.setViewportSize({ width: WIDTH, height: HEIGHT })
await page.goto(`chrome-extension://${extensionId}/pages/options.html`)
await page.locator('details').first().waitFor()

await page.evaluate((settings) => chrome.storage.local.set(settings), SETTINGS)
await page.reload()
await page.locator('details').first().waitFor()

// The options page is a left-aligned 480px column sized for the extension's own
// narrow window; centre it on the wide store canvas and shrink it just enough
// that the whole page fits. Presentation only — the extension is untouched.
await page.addStyleTag({
  content: `body { display: flex; justify-content: center; }
            body > div { zoom: 0.93; }`,
})
await page.waitForTimeout(400)

const contentHeight = await page.evaluate(() => document.body.scrollHeight)
if (contentHeight > HEIGHT) {
  console.warn(
    `⚠ content is ${contentHeight}px tall — the bottom will be cut off.\n` +
      `  Collapse another section in SETTINGS, or lower the zoom.`,
  )
}

await sharp(await page.screenshot())
  .resize(WIDTH, HEIGHT)
  .png()
  .toFile(OUT)
console.log(`wrote ${path.relative(REPO, OUT)} (${WIDTH}×${HEIGHT})`)

await ctx.close()
