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

/** Tuned so the whole tab clears HEIGHT — the script warns when it doesn't. */
const ZOOM = Number(process.env.ZOOM ?? 0.8)

// What the shot should show off: a page that is visibly *doing* something, so
// the filters read as the point rather than as empty inputs.
//
// The tab matters as much as the values now. Sections stopped being accordions
// in the Phase 2 redesign — the page is five tabs of flat cards, and a shot can
// only carry one tab, so `optionsTab` is what frames the whole screenshot.
// `optionsSections` used to live here; that key and its normalizer are gone.
const SETTINGS = {
  optionsTab: 'filters',
  highlightKeywords: ['he/him', 'nafo', 'nafofella', '🇷🇺', '🇺🇦'],
  blockedCountries: ['India', 'South Asia', 'Nigeria', 'Pakistan'],
  blockedAffiliations: ['nasa'],
  accountAgeFilter: { enabled: true, days: 180 },
  hideBlockedLocations: 'collapse',
  showLocationInFeed: true,
  sharedCacheEnabled: true,
  backgroundPrefetch: true,
  prefetchShare: 0.7,
  prefetchPacing: 'spread',
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
await page.locator('section').first().waitFor()

await page.evaluate((settings) => chrome.storage.local.set(settings), SETTINGS)
await page.reload()
await page.locator('section').first().waitFor()

// Shrink the page towards fitting the store canvas, and take the scrollbar out
// of the frame. Presentation only — the extension is untouched. The column
// centres itself, so unlike the old narrow layout this needs no flex wrapper.
await page.addStyleTag({
  content: `:root { zoom: ${ZOOM}; scrollbar-width: none; }
            ::-webkit-scrollbar { display: none; }`,
})
await page.waitForTimeout(400)

/**
 * A tab is taller than 800px whatever the zoom — five cards of real settings do
 * not fit, and shrinking until they do makes the text unreadable, which defeats
 * the screenshot. So drop the cards that would be sliced instead. Cropping the
 * image would leave a hard edge mid-card; hiding the overflow lets the page's
 * own background run to the bottom of the frame, which reads as a page you have
 * simply not scrolled yet.
 */
const dropped = await page.evaluate((limit) => {
  const cards = [...document.querySelectorAll('section')]
  let hidden = 0
  for (const card of cards) {
    if (card.getBoundingClientRect().bottom > limit - 12) {
      card.style.display = 'none'
      hidden++
    }
  }
  return hidden
}, HEIGHT)

if (dropped) console.log(`hid ${dropped} card(s) that would not fit whole`)

// Captured at 2x and downscaled, so text stays sharp.
await sharp(await page.screenshot())
  .resize(WIDTH, HEIGHT)
  .png()
  .toFile(OUT)
console.log(`wrote ${path.relative(REPO, OUT)} (${WIDTH}×${HEIGHT})`)

await ctx.close()
