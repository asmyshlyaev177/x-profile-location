/**
 * Cross-context tests: the real content script, the real MV3 service worker and
 * the real message plumbing between them, in a real browser with real tabs.
 *
 * Separate from playwright.config.ts because it needs none of what that one
 * needs. The e2e suite drives a logged-in x.com through a recording proxy to ask
 * "does any of this survive contact with X"; this one asks "do the two halves of
 * the extension agree", which X has no part in. x.com is served from a stub here
 * (`integration/x-stub.ts`), so there is no session, no HAR and no live traffic
 * — and it can run on every push.
 *
 * Separate from playwright.visual.config.ts because that one needs no extension
 * at all: it opens fixture HTML with the stylesheet over it. Nothing about the
 * lookup broker is observable without the extension actually loaded, a service
 * worker actually running, and more than one tab actually open.
 *
 * `fullyParallel` is off and workers are pinned to 1: every test launches its own
 * browser with the extension in it, and the point of each is what a *shared*
 * rate-limit window does — a second worker would be a second window.
 */
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './integration',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list']],
  use: {
    headless: true,
    trace: 'on-first-retry',
    actionTimeout: 15_000,
  },
})
