import { chromium } from '@playwright/test'
import { readFile } from 'fs/promises'

const state = JSON.parse(await readFile('./e2e/.auth/state.json', 'utf-8'))

async function dumpAbout(screenName) {
  const browser = await chromium.launch({ headless: false })
  const ctx = await browser.newContext()
  await ctx.addCookies(state.cookies)
  for (const { origin, localStorage: items } of state.origins ?? []) {
    await ctx.addInitScript(
      ({ o, entries }) => {
        if (location.origin === o)
          for (const { name, value } of entries)
            localStorage.setItem(name, value)
      },
      { o: origin, entries: items },
    )
  }
  const page = await ctx.newPage()
  await page.goto(`https://x.com/${screenName}/about`)
  await page.waitForTimeout(3000)
  console.log(`\n=== ${screenName} ===\n`)
  // Print only the pivot rows (concise)
  const pivots = await page.locator('[data-testid="pivot"]').all()
  for (const p of pivots) {
    console.log(await p.innerHTML())
    console.log('---')
  }
  await browser.close()
}

await dumpAbout('sotaproject')
await dumpAbout('zgldz')
