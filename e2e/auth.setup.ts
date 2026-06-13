/**
 * Auth setup — runs once before the test suite in record mode.
 * If e2e/.auth/state.json already exists the step is skipped (already logged in).
 * Otherwise opens x.com/login and pauses — log in manually in the browser window,
 * then click Resume in the Playwright Inspector to save the session.
 *
 * Skipped entirely in replay mode — the recorded HAR contains the full session.
 */
import path from 'path'
import { mkdir, access } from 'fs/promises'
import { test as setup } from '@playwright/test'
import { chromium } from 'playwright-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
import { EXTENSION_PATH, AUTH_FILE, MODE } from './fixtures'

chromium.use(StealthPlugin())

setup('authenticate with X', async () => {
  if (MODE === 'replay') return

  // Skip if a saved session already exists.
  const hasState = await access(AUTH_FILE)
    .then(() => true)
    .catch(() => false)
  if (hasState) return

  await mkdir(path.dirname(AUTH_FILE), { recursive: true })

  const { rm } = await import('fs/promises')
  const os = await import('os')
  const userDataDir = path.join(os.tmpdir(), `pw-auth-${Date.now()}`)

  const context = (await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--no-sandbox',
      `--disable-extensions-except=${EXTENSION_PATH}`,
      `--load-extension=${EXTENSION_PATH}`,
    ],
  })) as any

  const page = await context.newPage()
  await page.goto('https://x.com/i/flow/login')

  // Script does nothing — the user logs in manually.
  // Click Resume in the Playwright Inspector once the home feed is visible.
  console.log(
    '\n[auth] Log in to X in the browser window, then click Resume in the Playwright Inspector.\n',
  )
  await page.pause()

  await context.storageState({ path: AUTH_FILE })
  await context.close()
  await rm(userDataDir, { recursive: true, force: true })
})
