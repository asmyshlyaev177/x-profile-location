/**
 * The community cache is called from the service worker, never from a tab.
 *
 * x.com may send `Connection-Allowlist`, which blocks every connection its
 * documents make to an origin it does not list, and in Chrome that includes a
 * content script's isolated world. X would never list the cache, but no page
 * header covers the worker.
 *
 * The header itself is not sent here: Chrome checks it after Playwright pauses
 * the request, so a `route.fulfill`ed request passes whatever the page allows
 * (checked 2026-10-21, Chromium 147). Asserting who made the request does not
 * depend on that.
 */
import type { Page, Request } from '@playwright/test'
import {
  BACKGROUND_PREFETCH_KEY,
  CACHE_API_BASE,
} from '../src/scripts/constants'
import { test, expect, setSettings } from './fixtures'
import { FEED_URL, serveStubX } from './x-stub'

const HANDLES = ['alpha', 'bravo']

/** The location stored for `handle` in x.com's IndexedDB, or undefined. */
function storedLocation(
  page: Page,
  handle: string,
): Promise<string | undefined> {
  return page.evaluate(
    (key) =>
      new Promise<string | undefined>((resolve) => {
        const req = indexedDB.open('x-profile-location')
        req.onerror = () => resolve(undefined)
        req.onsuccess = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('location-data')) {
            db.close()
            return resolve(undefined)
          }
          const get = db
            .transaction('location-data', 'readonly')
            .objectStore('location-data')
            .get(key)
          get.onsuccess = () => {
            db.close()
            resolve(get.result?.data?.location ?? undefined)
          }
          get.onerror = () => {
            db.close()
            resolve(undefined)
          }
        }
      }),
    handle,
  )
}

/** A tab's request has a frame; a worker's has none and names its worker. */
function madeBy(request: Request): 'worker' | 'tab' {
  return request.serviceWorker() ? 'worker' : 'tab'
}

test.beforeEach(() => {
  test.skip(
    CACHE_API_BASE.length === 0,
    'community cache disabled — CACHE_API_BASE is empty',
  )
})

test('the community cache is asked from the service worker, and its answer reaches the tab', async ({
  context,
  extensionId,
}) => {
  // Prefetch off, or a lookup from X could fill IndexedDB in place of the cache's answer.
  await setSettings(context, extensionId, { [BACKGROUND_PREFETCH_KEY]: false })
  await serveStubX(context, {
    handles: HANDLES,
    // Not the cache's answer, so a stored 'Germany' can only have come from it.
    answer: () => ({ location: 'Japan' }),
    tabName: () => 'feed',
  })

  // Registered after the stub, so it is tried first for the batch route.
  const asked: { names: string[]; by: 'worker' | 'tab' }[] = []
  await context.route(`${CACHE_API_BASE}/v1/loc/batch`, async (route) => {
    const request = route.request()
    const names =
      (request.postDataJSON() as { usernames?: string[] })?.usernames ?? []
    asked.push({ names, by: madeBy(request) })
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json',
        'access-control-allow-origin': '*',
      },
      body: JSON.stringify({
        profiles: names.map((u) => ({
          u,
          loc: 'Germany',
          src: 'web',
          acc: true,
          conf: 1,
        })),
      }),
    })
  })

  const page = await context.newPage()
  await page.goto(FEED_URL)

  await expect
    .poll(() => asked.flatMap((a) => a.names), { timeout: 15_000 })
    .toContain('alpha')
  expect(asked.map((a) => a.by)).not.toContain('tab')
  await expect
    .poll(() => storedLocation(page, 'alpha'), { timeout: 10_000 })
    .toBe('Germany')
})
