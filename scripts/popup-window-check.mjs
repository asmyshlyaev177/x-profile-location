#!/usr/bin/env node
// Does the popup window keep its width while the panel grows?
//
//   pnpm test:popup-window
//
// Chrome sizes the popup window to the document, so anything that widens the
// document when content grows — a scrollbar, most of all — moves the whole
// popup sideways under the reader. Nothing else in the repo can see that:
// Playwright cannot open a browser-action popup, headless Chromium draws
// overlay scrollbars (no width to take), and a popup page opened as a tab is
// sized by the tab, not by Chrome's own measurement.
//
// So this drives the real thing: a headed browser under Xvfb, the real action
// popup, and raw CDP to read it, because the popup is not a Playwright page.
//
// `chrome.action.openPopup()` refuses to open on a window Chrome does not
// consider active, and bare Xvfb has no window manager to make one active —
// whether a fresh browser lands focused is luck, so a launch that cannot open
// the popup is retried from scratch rather than reported as a width failure.
// Under a WM (a real desktop, or `xvfb-run` with openbox) the first try works.
//
// Requires: xvfb-run and a built extension in dist/chrome.

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const EXTENSION = join(ROOT, 'dist', 'chrome')
const CDP_PORT = 19233
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

if (!process.env.DISPLAY) {
  console.error('no DISPLAY — run this under `xvfb-run --auto-servernum`')
  process.exit(2)
}

/** A CDP client for one target, since the popup is not a Playwright page. */
async function attach(webSocketDebuggerUrl) {
  const ws = new WebSocket(webSocketDebuggerUrl)
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  const pending = new Map()
  let lastId = 0
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data)
    pending.get(message.id)?.(message.result)
    pending.delete(message.id)
  }
  return {
    evaluate(fn, arg) {
      const id = ++lastId
      const expression = `(${fn.toString()})(${JSON.stringify(arg ?? null)})`
      return new Promise((resolve) => {
        pending.set(id, (result) => resolve(result?.result?.value))
        ws.send(
          JSON.stringify({
            id,
            method: 'Runtime.evaluate',
            params: { expression, awaitPromise: true, returnByValue: true },
          }),
        )
      })
    },
    close: () => ws.close(),
  }
}

class WindowNotActive extends Error {}

async function openActionPopup(worker) {
  const failure = await worker
    .evaluate(async () => {
      const window = await chrome.windows.getCurrent()
      await chrome.windows.update(window.id, { focused: true })
      await chrome.action.openPopup({ windowId: window.id })
      return null
    })
    .catch((e) => e)
  if (failure) throw new WindowNotActive(failure.message)
  for (let attempt = 0; attempt < 40; attempt++) {
    const targets = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`).then(
      (r) => r.json(),
    )
    const popup = targets.find((t) => t.url.includes('popup.html'))
    if (popup) return attach(popup.webSocketDebuggerUrl)
    await wait(250)
  }
  throw new Error('the popup opened but never showed up as a CDP target')
}

const measure = (popup, state) =>
  popup.evaluate((s) => {
    const panel = document.querySelector('[class*="popup"]')
    return {
      state: s,
      window: window.outerWidth,
      viewport: window.innerWidth,
      panel: Math.round(panel.getBoundingClientRect().width),
      // What the content actually gets — the panel's scrollbar comes out of it.
      content: panel.clientWidth,
      height: Math.round(panel.getBoundingClientRect().height),
    }
  }, state)

const clickButton = (popup, label) =>
  popup.evaluate((text) => {
    const button = [...document.querySelectorAll('button')].find((b) =>
      b.textContent.includes(text),
    )
    if (!button) throw new Error(`no button matching "${text}"`)
    button.click()
  }, label)

// Africa is in the default blocked set and is the widest case there is: 57
// countries, which is what makes the panel taller than the popup can be.
const REGION = 'Africa'

async function measureStates() {
  const profile = mkdtempSync(join(tmpdir(), 'xpat-popup-window-'))
  const context = await chromium.launchPersistentContext(profile, {
    headless: false,
    channel: 'chromium',
    args: [
      `--disable-extensions-except=${EXTENSION}`,
      `--load-extension=${EXTENSION}`,
      `--remote-debugging-port=${CDP_PORT}`,
    ],
  })
  try {
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 20_000 }))
    const tab = context.pages()[0] ?? (await context.newPage())
    await tab.goto('about:blank')
    await tab.bringToFront()
    await wait(2_000)

    const popup = await openActionPopup(worker)
    await wait(800)

    const states = [await measure(popup, 'sections closed')]
    await clickButton(popup, 'Blocked locations')
    await wait(400)
    states.push(await measure(popup, 'locations open'))
    await clickButton(popup, REGION)
    await wait(600)
    states.push(await measure(popup, `${REGION} member list open`))
    popup.close()
    return states
  } finally {
    await context.close()
    rmSync(profile, { recursive: true, force: true })
  }
}

let states = null
for (let launch = 1; launch <= 4 && !states; launch++) {
  states = await measureStates().catch((e) => {
    if (!(e instanceof WindowNotActive)) throw e
    console.log(`launch ${launch}: the window never became active, retrying`)
    return null
  })
}

if (!states) {
  console.error(
    'could not open the popup: no window ever became active. Run under a\n' +
      'window manager — a real desktop, or `xvfb-run` with one started first.',
  )
  process.exit(2)
}

for (const s of states) console.log(s)

// A panel capped against something that is not there yet — `100vh` in a popup
// that starts a few pixels tall — collapses the window to a stub.
const collapsed = states.filter((s) => s.height < 200)
if (collapsed.length) {
  console.error(
    `\n✗ the panel collapsed: ${collapsed
      .map((s) => `${s.height}px with ${s.state}`)
      .join(', ')}`,
  )
  process.exit(1)
}

const widths = new Set(states.map((s) => `${s.window}/${s.content}`))
if (widths.size !== 1) {
  console.error(
    `\n✗ the popup changed width: ${[...widths].join(' then ')} (window/content)`,
  )
  process.exit(1)
}
console.log(`\n✓ window and content stay ${[...widths][0]} throughout`)
