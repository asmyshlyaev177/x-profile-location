/**
 * Layout tests for the UI the content script injects.
 *
 * Separate from playwright.config.ts on purpose. That suite drives a real
 * logged-in x.com through a recording proxy, with the extension loaded into a
 * seeded profile — it needs a session, a display and the HARs, so it cannot run
 * on every push. This one needs a headless browser and nothing else: hardcoded
 * fixture DOM, the extension's own stylesheet over it, and assertions about how
 * the browser laid it out.
 *
 * What it does not do is replace the other one. Nothing here can notice that X
 * renamed a data-testid or that our insertion point moved; the fixtures are a
 * copy of X's DOM as of the day they were written, and a copy cannot report
 * that the original changed. This suite catches the other half — the cascade —
 * which is where most of the injected UI's bugs have actually been.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './visual',
  fullyParallel: true,
  retries: 0,
  timeout: 20_000,
  reporter: [['list']],
  // A fixed viewport and device scale, so a box measured here is the box
  // measured on the runner.
  use: {
    ...devices['Desktop Chrome'],
    headless: true,
    viewport: { width: 900, height: 900 },
    deviceScaleFactor: 1,
  },
})
