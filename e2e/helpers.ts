import {
  expect,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'
import { CACHE_API_BASE } from '../src/scripts/constants'

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

/** Likes from the action bar. aria-label reads "1,234 Likes. Like", or just
 *  "Like" when there are none. */
async function likeCount(article: Locator): Promise<number> {
  const label = await article
    .locator('[data-testid="like"], [data-testid="unlike"]')
    .first()
    .getAttribute('aria-label', { timeout: 3_000 })
    .catch(() => null)
  const digits = label?.match(/^([\d,.]+)/)?.[1]
  return digits ? Number(digits.replace(/[,.]/g, '')) : 0
}

/**
 * Switches the reply list from "Relevant" to "Likes" using X's own sort control
 * (the small menu button under the reply count). Best-effort: pages without the
 * control are left as they are.
 */
export async function sortRepliesByLikes(page: Page): Promise<void> {
  const trigger = page
    .locator('button[aria-haspopup="menu"]')
    .filter({ hasText: /^(Relevant|Recent|Likes)$/ })
    .first()

  if ((await trigger.count()) === 0) return
  if ((await trigger.textContent()) === 'Likes') return

  await trigger.click()
  await page.getByRole('menuitem', { name: 'Likes', exact: true }).click()
  await expect(trigger).toHaveText('Likes', { timeout: 10_000 })
  await page
    .locator('article[data-testid="tweet"]')
    .nth(1)
    .waitFor({ timeout: 15_000 })
}

/**
 * The most-liked reply on a status page — not the tweet the page is about —
 * plus its author's name link and screen name.
 *
 * Ranked rather than positional because the choice has to survive the round
 * trip: X's default "Relevant" order shuffles between visits, so a positional
 * pick lands on different accounts at record time and at replay time. The replay
 * then hovers an account whose card data was never recorded, routeFromHAR aborts
 * the request, and X renders an empty card shell the extension can't annotate.
 * Sorting by likes pins the order; reading the counts picks the same reply even
 * on a page where the sort control isn't offered.
 */
export async function mostLikedReply(page: Page): Promise<{
  article: Locator
  link: Locator
  screenName: string
}> {
  const articles = page.locator('article[data-testid="tweet"]')
  await articles.nth(1).waitFor({ timeout: 15_000 })
  await sortRepliesByLikes(page)

  const count = await articles.count()
  let best: { screenName: string; likes: number } | null = null

  for (let i = 0; i < Math.min(count, 8); i++) {
    // Every read here is bounded and forgiving: X's virtualised timeline recycles
    // rows constantly, so an article counted a moment ago may be gone by the time
    // it is read. Without a timeout such a row hangs the whole test.
    const tabindex = await articles
      .nth(i)
      .getAttribute('tabindex', { timeout: 5_000 })
      .catch(() => null)
    if (tabindex === '-1') continue

    const href =
      (await articles
        .nth(i)
        .locator(
          '[data-testid="User-Name"] a[href^="/"]:not([href*="/status/"])',
        )
        .first()
        .getAttribute('href', { timeout: 5_000 })
        .catch(() => null)) ?? ''
    const screenName = href.replace(/^\//, '').split('/')[0]
    if (!screenName) continue

    const likes = await likeCount(articles.nth(i))
    if (!best || likes > best.likes) best = { screenName, likes }
  }
  if (!best) throw new Error('no reply article on this page')

  // Anchored on the author, not the index: an nth() handle silently starts
  // pointing at a different tweet as soon as X re-renders the list.
  const article = page
    .locator(
      `article[data-testid="tweet"]:has([data-testid="User-Name"] a[href="/${best.screenName}" i])`,
    )
    .first()
  const link = article
    .locator(`[data-testid="User-Name"] a[href="/${best.screenName}" i]`)
    .first()
  return { article, link, screenName: best.screenName }
}

/**
 * Hovers until the hover card is up *and* carries a location icon, re-hovering
 * if it isn't. X occasionally swallows a hover — its card handler attaches after
 * hydration, and the card closes again if the pointer is judged to have left —
 * which a plain hover + waitFor turns into a spurious failure.
 */
export async function hoverForLocationRow(
  page: Page,
  link: Locator,
): Promise<Locator> {
  const card = page.locator('[data-testid="HoverCard"]')
  await expect(async () => {
    await page.mouse.move(0, 0)
    await link.hover()
    await expect(
      card
        .locator('.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn')
        .first(),
    ).toBeVisible({ timeout: 4_000 })
  }).toPass({ timeout: 25_000 })
  return card
}

/**
 * Flips one of the options page's checkbox settings. The page is opened and
 * closed again, which backgrounds the x.com tab briefly — locators that have to
 * survive that should be anchored on content, not on an index.
 */
export async function setCheckboxOption(
  context: BrowserContext,
  extensionId: string,
  labelText: string,
  enabled: boolean,
): Promise<void> {
  const optPage = await context.newPage()
  await optPage.goto(`chrome-extension://${extensionId}/pages/options.html`)

  const toggle = optPage
    .locator(`label:has-text("${labelText}") input[type="checkbox"]`)
    .first()
  await toggle.waitFor({ timeout: 5_000 })
  await toggle.setChecked(enabled)
  // The checkbox is bound to the state the onChange writes to storage, so it
  // only reads back as `enabled` once chrome.storage.local.set has been called.
  await expect(toggle).toBeChecked({ checked: enabled, timeout: 3_000 })
  await optPage.close()
}

/**
 * Answers every AboutAccountQuery locally with one canned profile.
 *
 * Always pair with mockSharedCache (or use mockLocationApis, which does both):
 * a canned location is contributed back like any other first-hand result, and
 * must not reach the real community server.
 *
 * Worth doing in any test that isn't about X's own response: the background
 * prefetcher trickles lookups for every account on screen and is allowed half
 * the 50-per-15-minutes window, so a handful of unmocked recording runs is
 * enough to exhaust the budget and make later tests fail on 429s instead of on
 * their own behaviour.
 */
export async function mockAboutAccount(
  page: Page,
  profile: {
    account_based_in: string | null
    location_accurate?: boolean
    source?: string | null
  },
): Promise<void> {
  await page.route(/AboutAccountQuery/, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        data: {
          user_result_by_screen_name: {
            result: {
              about_profile: {
                account_based_in: profile.account_based_in,
                location_accurate: profile.location_accurate ?? true,
                source: profile.source ?? 'web',
              },
            },
          },
        },
      }),
    }),
  )
}

// ---------------------------------------------------------------------------
// Community cache (CACHE_API_BASE) stand-in
// ---------------------------------------------------------------------------

/** One served profile, in the compact shape the Worker returns. */
export type SharedCacheProfile = {
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
}

type Contribution = {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
}

// Mirrors the Worker's CORS headers (server/src/index.ts): the content script
// calls this cross-origin, and application/json makes it a preflighted request.
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
}

/**
 * Stands in for the community cache Worker so tests never touch the real one —
 * neither reading (responses would vary by what other users contributed) nor
 * writing (test data would end up in the shared consensus).
 *
 * Answers every batch lookup with `profile` for each username asked about, or
 * with no hits when `profile` is null. Contribution POSTs are captured and
 * acknowledged. Both arrays keep filling as the page makes further calls.
 */
/**
 * Hovers *some* reply on a status page and returns its hover card once the
 * extension has put a location in it.
 *
 * Picking the reply and hovering it are retried as one unit on purpose: X's
 * timeline recycles reply rows while the page settles, so a row chosen a second
 * ago can be gone before the pointer arrives — holding a handle to one specific
 * reply and retrying only the hover just times out against a node that no longer
 * exists. Which reply answers is irrelevant to callers, so take a fresh one.
 */
export async function hoverAnyReplyForLocation(page: Page): Promise<Locator> {
  const card = page.locator('[data-testid="HoverCard"]')
  await expect(async () => {
    const { link } = await mostLikedReply(page)
    await page.mouse.move(0, 0)
    await link.hover({ timeout: 5_000 })
    await expect(
      card
        .locator('.x-loc-icon-flag, .x-loc-store-block, .x-loc-icon-vpn')
        .first(),
    ).toBeVisible({ timeout: 4_000 })
  }).toPass({ timeout: 20_000 })
  return card
}

/**
 * Cuts both location sources over to canned answers: X returns `profile`, and
 * the community cache has nothing (so every lookup reaches the mocked X, and no
 * canned value is contributed to the real server).
 *
 * Use this in every test that doesn't assert on X's *live* answer. Leaving the
 * community cache real makes recordings unreproducible — the Worker decides
 * which accounts still need an X call, it answers differently at record time
 * than at replay time, and the calls it newly provokes were never recorded, so
 * routeFromHAR aborts them and the extension shows nothing.
 */
export async function mockLocationApis(
  page: Page,
  profile: Parameters<typeof mockAboutAccount>[1],
): Promise<void> {
  await mockSharedCache(page, null)
  await mockAboutAccount(page, profile)
}

export async function mockSharedCache(
  page: Page,
  profile: SharedCacheProfile | null,
): Promise<{ served: string[]; contributions: Contribution[] }> {
  const base = new URL(CACHE_API_BASE)
  const served: string[] = []
  const contributions: Contribution[] = []

  await page.route(
    (url) => url.host === base.host && url.pathname.endsWith('/v1/loc/batch'),
    async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: CORS_HEADERS })

      const body = route.request().postDataJSON() as { usernames?: string[] }
      const names = body?.usernames ?? []
      const profiles = profile ? names.map((u) => ({ u, ...profile })) : []
      served.push(...profiles.map((p) => p.u))

      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ profiles }),
      })
    },
  )

  await page.route(
    (url) => url.host === base.host && url.pathname.endsWith('/v1/loc'),
    async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: CORS_HEADERS })

      const body = route.request().postDataJSON() as {
        entries?: Contribution[]
      }
      contributions.push(...(body?.entries ?? []))

      await route.fulfill({
        status: 200,
        headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      })
    },
  )

  return { served, contributions }
}

/**
 * Reads the bio the extension cached for a user (page-script picks it out of the
 * timeline response and mergeCached stores it alongside the location data).
 * Returns null when the user has no cache entry or no bio in it.
 */
export async function readCachedBio(
  page: Page,
  userName: string,
): Promise<string | null> {
  return page.evaluate(
    (key) =>
      new Promise<string | null>((resolve, reject) => {
        const req = indexedDB.open('x-profile-location')
        req.onerror = () => reject(req.error)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('location-data')) {
            db.close()
            return resolve(null)
          }
          const tx = db.transaction('location-data', 'readonly')
          const getReq = tx.objectStore('location-data').get(key)
          getReq.onsuccess = () => {
            db.close()
            resolve(getReq.result?.data?.bio ?? null)
          }
          getReq.onerror = () => {
            db.close()
            reject(getReq.error)
          }
        }
      }),
    userName.toLowerCase(),
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
