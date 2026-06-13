import type { Locator, Page } from '@playwright/test'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LocationInfo = {
  basedIn: string | null
  appStoreCountry: string | null
  isVpn: boolean
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Reads all location fields the extension has rendered inside a hover card.
 *   basedIn        — title of .x-loc-icon-flag (the country name)
 *   appStoreCountry — country parsed from .x-loc-store-block title (the raw source string)
 *   isVpn          — whether .x-loc-icon-vpn is visible
 */
export async function hoverCardLocation(card: Locator): Promise<LocationInfo> {
  // Single evaluate — synchronous DOM reads inside the browser with no per-element
  // timeouts. querySelector returns null for absent elements without waiting or
  // throwing, which is the correct Playwright pattern when elements may be absent.
  return card.evaluate((el) => {
    // makeIcon() adds both x-loc-icon and x-loc-icon-flag to the location flag.
    // The store block's inner flag has only x-loc-icon-flag, so the compound
    // selector uniquely targets the country flag and reads its title attribute.
    const flag = el.querySelector<HTMLElement>('.x-loc-icon.x-loc-icon-flag')
    const storeBlock = el.querySelector<HTMLElement>('.x-loc-store-block')
    const vpnBadge = el.querySelector('.x-loc-icon-vpn')

    const basedIn = flag?.title ?? null
    const storeSource = storeBlock?.title ?? null
    const isVpn = vpnBadge !== null

    const m = storeSource?.match(/^(.+?)\s+(?:android\s+app|app\s+store)$/i)
    const appStoreCountry = m?.[1]?.trim() ?? null

    return { basedIn, appStoreCountry, isVpn }
  })
}

/**
 * Navigates to /screenName/about and extracts the official location fields
 * from the rendered page — the authoritative ground truth for assertions.
 *   basedIn        — "Account based in [Country]"
 *   appStoreCountry — country from "... Android App / App Store" text
 *   isVpn          — whether the page mentions VPN / inaccurate location
 */
export async function officialAccountLocation(
  page: Page,
  screenName: string,
): Promise<LocationInfo> {
  await page.goto(`https://x.com/${screenName}/about`)
  await page.waitForTimeout(2_000)

  // Walk every div[dir="ltr"] inside [data-testid="pivot"] elements.
  // Each row has two consecutive divs: label then value.
  return page.evaluate(() => {
    const divs = Array.from(
      document.querySelectorAll('[data-testid="pivot"] div[dir="ltr"]'),
    )

    let basedIn: string | null = null
    let appStoreCountry: string | null = null
    let isVpn = false

    for (let i = 0; i < divs.length; i++) {
      const label = divs[i].textContent?.trim() ?? ''
      const value = divs[i + 1]?.textContent?.trim() ?? ''

      if (label === 'Account based in') {
        basedIn = value || null
        // VPN: X renders a shield-with-exclamation SVG after the value row
        // (instead of the default info-circle) when location_accurate is false.
        // The shield path is unique: starts with "M12 2c1.982".
        const pivot = divs[i].closest('[data-testid="pivot"]')
        const svgs = Array.from(pivot?.querySelectorAll('svg') ?? [])
        const lastSvg = svgs.at(-1)
        isVpn = !!lastSvg?.querySelector('path[d^="M12 2c1.982"]')
      }

      // App store source lives in the "Connected via" row, e.g. "Germany App Store".
      if (label === 'Connected via') {
        const m = value.match(/^(.+?)\s+(?:android\s+app|app\s+store)$/i)
        if (m) appStoreCountry = m[1].trim()
      }
    }

    return { basedIn, appStoreCountry, isVpn }
  })
}

/**
 * Navigates to the user's profile, finds the first status link authored by
 * that user, and returns the path (e.g. "/elonmusk/status/123").
 */
export async function navigateToTweetDetail(
  page: Page,
  screenName: string,
): Promise<string> {
  await page.goto(`https://x.com/${screenName}`)
  const link = page
    .locator(`article[data-testid="tweet"] a[href*="/${screenName}/status/" i]`)
    .first()
  await link.waitFor({ timeout: 15_000 })
  const href = await link.getAttribute('href')
  if (!href) throw new Error(`No status link found for @${screenName}`)
  return href
}

/**
 * Returns all keys currently stored in the extension's IDB cache (x-profile-location /
 * location-data). Must be called on a page at the x.com origin since IDB is origin-scoped.
 */
export async function readIdb(page: Page): Promise<string[]> {
  return page.evaluate(
    () =>
      new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open('x-profile-location')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('location-data')) {
            db.close()
            return resolve([])
          }
          const tx = db.transaction('location-data', 'readonly')
          const keysReq = tx.objectStore('location-data').getAllKeys()
          keysReq.onsuccess = () => {
            db.close()
            resolve(keysReq.result as string[])
          }
          keysReq.onerror = () => {
            db.close()
            reject(keysReq.error)
          }
        }
      }),
  )
}

/**
 * Navigates to the user's own profile, hovers their first authored tweet,
 * and waits for the extension's AboutAccountQuery call to complete.
 */
export async function hoverOwnTweet(
  page: Page,
  screenName: string,
): Promise<Locator> {
  await page.goto(`https://x.com/${screenName}`)

  // Case-insensitive href match: X normalises handles to lowercase in the DOM,
  // so "PooWorldOrderr" would not match without the `i` flag.
  // Exact href (not prefix) skips retweet attribution links.
  const usernameLink = page
    .locator(
      `article[data-testid="tweet"] [data-testid="User-Name"] a[href="/${screenName}" i]`,
    )
    .first()
  await usernameLink.waitFor({ timeout: 15_000 })

  // Set up response capture before triggering the hover (fresh browser per test
  // means IDB cache is empty, so AboutAccountQuery always fires).
  const queryDone = page.waitForResponse(/AboutAccountQuery/, {
    timeout: 15_000,
  })
  await usernameLink.hover()
  await queryDone

  const card = page.locator('[data-testid="HoverCard"]')
  await card.locator('.x-loc-info').waitFor({ timeout: 10_000 })

  return card
}
