import { HIGHLIGHT_KEYWORDS_KEY } from '../src/scripts/constants'
/**
 * Marketing screenshots — the landing page's images and the store listing's,
 * retaken from the same recorded X pages the e2e suite replays.
 *
 * Run:  pnpm shots        (xvfb + SHOOT=1, see package.json)
 *
 * Skipped in a normal run. It lives in `e2e/` rather than `landing/scripts/`
 * because everything it needs is already here: a browser with the extension
 * loaded, a signed-in profile, and recorded X pages. A shot script outside the
 * harness would have to rebuild all three.
 *
 * ## Borrowed recordings
 *
 * A recording is keyed by `<spec file>__<test title>`, and these shots have no
 * recordings of their own — so each one *borrows* the identity of the test whose
 * page it wants, by handing `playwrightProxy.before` a fabricated testInfo. The
 * page then replays exactly what that test replays. Nothing here can drift from
 * the suite without the suite failing first: delete or rename a borrowed test
 * and the shot stops finding its HAR.
 *
 * This is also why the fixtures' own `page` is unused — that one is wired to
 * *this* file's titles, which have no HAR at all.
 *
 * ## Identities
 *
 * The recordings hold real accounts. `BLUR_IDENTITIES=0` shows them as they
 * were captured; the default blurs names, handles and avatars, leaving the row
 * the extension draws — the actual subject — untouched.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Locator, Page } from '@playwright/test'
import { playwrightProxy } from 'test-proxy-recorder'
import { CLIENT_SIDE_URL, MODE, test } from './fixtures'
import {
  hoverOwnTweet,
  mockAboutAccount,
  mockSharedCache,
  TWEET_ARTICLE,
  tweetArticles,
} from './helpers'

import { CACHE_API_BASE } from '../src/scripts/constants'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LANDING = path.join(__dirname, '..', 'landing', 'public')

const BLUR = process.env.BLUR_IDENTITIES !== '0'

/** The conversation every timeline shot is taken from. */
const NASA_TWEET = 'https://x.com/NASAArtemis/status/2052108727839285751'

test.skip(
  !process.env.SHOOT,
  'screenshot capture — run `pnpm shots` to retake the marketing images',
)

/** The testInfo shape `generateSessionId` reads: [spec file, …, test title]. */
function borrow(specFile: string, title: string) {
  return { title, titlePath: [specFile, title] }
}

/**
 * A page replaying the recording that belongs to `specFile` + `title`.
 *
 * `context.newPage()` rather than the `page` fixture: the fixture already bound
 * that page to this file's own (recording-less) title, and in replay mode a
 * missing HAR throws.
 */
async function replaying(
  context: Parameters<typeof test>[0] extends never ? never : any,
  specFile: string,
  title: string,
): Promise<Page> {
  const page: Page = await context.newPage()
  await playwrightProxy.before(page, borrow(specFile, title), MODE, {
    url: CLIENT_SIDE_URL,
  })
  return page
}

/**
 * Blurs who the account is, not what the extension says about it. Names,
 * handles and avatars go soft; `.x-loc-*` — the injected row, the flag, the
 * placeholder — is explicitly exempt, since that is the subject of every shot.
 *
 * The hover card names nobody through a testid, so profile links stand in for
 * it: inside the card, `href` starting with `/` is a profile, while every link
 * in a bio is an absolute t.co URL and stays readable.
 */
async function blurIdentities(page: Page): Promise<void> {
  if (!BLUR) return

  // Which links in a hover card are the person: `/handle` and nothing else.
  // Doing this in CSS would take every profile link with it — "51.1K Followers"
  // points at `/handle/verified_followers`, and blurring the counts hides
  // nothing about who the account is while making the card look redacted.
  await page.evaluate(() => {
    const card = document.querySelector('[data-testid="HoverCard"]')
    for (const a of card?.querySelectorAll('a[href]') ?? []) {
      const { pathname } = new URL(
        (a as HTMLAnchorElement).href,
        location.origin,
      )
      if (/^\/[A-Za-z0-9_]+$/.test(pathname))
        a.setAttribute('data-shot-blur', '')
    }
  })
  // `:not(:has(…))` rather than blurring the name row and exempting the
  // extension's own row inside it: a filter on an ancestor blurs everything
  // under it, and no `filter: none` on a child can undo that. The exemption has
  // to be in the selector that applies the blur, or the flag goes soft too.
  await page.addStyleTag({
    content: `
      [data-testid="User-Name"] span:not(:has(.x-loc-info, .x-loc-feed-row)):not(.x-loc-info *, .x-loc-feed-row *),
      [data-testid^="UserAvatar-Container-"],
      [data-testid="Tweet-User-Avatar"] img,
      [data-testid="HoverCard"] a[href*="t.co"],
      [data-shot-blur] span:not(:has(.x-loc-info)):not(.x-loc-info *) {
        filter: blur(5px) !important;
      }`,
  })
  await page.waitForTimeout(200)
}

/**
 * Stands in for the post body.
 *
 * The recordings are scrubbed before they are committed — post text is replaced
 * with a notice and media never made it into the HAR, so a timeline shot taken
 * straight from a replay reads "Post text removed by scrub-recordings" over a
 * purple rectangle. The alternative to writing something here is shipping that.
 *
 * Keep the text generic. The account it sits under is real (and blurred), so
 * anything opinionated would be putting words in a stranger's mouth.
 */
async function mockPostContent(page: Page, text: string): Promise<void> {
  await page.evaluate((body) => {
    for (const el of document.querySelectorAll('[data-testid="tweetText"]')) {
      el.textContent = body
    }
    document
      .querySelector('[data-testid="tweet-text-show-more-link"]')
      ?.remove()

    // The reply composer sits between posts on a detail page and says nothing
    // about the extension — it just eats a third of the frame. Climb until the
    // whole row (avatar included) is in hand, but never far enough to swallow a
    // post.
    const composer = document.querySelector('[role="textbox"]')
    let box = composer?.parentElement ?? null
    while (
      box?.parentElement &&
      box.getBoundingClientRect().height < 120 &&
      !box.parentElement.querySelector('article')
    ) {
      box = box.parentElement
    }
    box?.remove()

    // Media is an empty frame without the HAR that would fill it — dropping it
    // leaves an ordinary text post, which is honest and looks right. It has no
    // testid to find it by (X only labels the image, which never loaded), so it
    // is identified by shape: a sizeable block inside a post holding no text.
    for (const article of document.querySelectorAll('article')) {
      const blanks = [...article.querySelectorAll('div')].filter((d) => {
        const rect = d.getBoundingClientRect()
        return !d.textContent?.trim() && rect.height > 120 && rect.width > 180
      })
      for (const el of blanks) {
        if (el.isConnected) el.remove() // outermost first; the rest go with it
      }
    }
  }, text)
  await page.waitForTimeout(200)
}

/**
 * Draws the pointer and the tooltip the flag answers with.
 *
 * Neither survives a screenshot on its own: the mouse cursor is composited by
 * the OS, not the page, and a `title` tooltip is chrome the browser draws
 * outside the document. Both are the point of the feature — the flag is small,
 * and what makes it readable is that pointing at it names the country — so they
 * are recreated in the DOM, matching the native tooltip's look.
 *
 * The text is read from the icon's own `title`, so it can never claim a country
 * the extension would not have shown.
 */
async function showHoverHint(scope: Locator, prefer?: string): Promise<void> {
  await scope.evaluate((root, preferred) => {
    const icon =
      root.querySelector<HTMLElement>(preferred) ??
      root.querySelector<HTMLElement>('.x-loc-icon[title]')
    if (!icon) return

    const label = icon.getAttribute('title') ?? ''
    const r = icon.getBoundingClientRect()
    const x = r.left + r.width / 2 + scrollX
    const y = r.top + r.height * 0.75 + scrollY

    const layer = document.createElement('div')
    layer.style.cssText =
      'position:absolute;left:0;top:0;pointer-events:none;z-index:2147483647'

    // Native tooltips slide back into view rather than run off the edge, and a
    // shot is cropped to this element — a tooltip that overflows it is simply
    // cut in half.
    const bounds = root.getBoundingClientRect()
    const width = Math.min(label.length * 7 + 16, bounds.width - 16)
    const left = Math.min(x + 12, bounds.right + scrollX - width - 8)

    const tip = document.createElement('div')
    tip.textContent = label
    tip.style.cssText = `position:absolute;left:${left}px;top:${y + 20}px;
      background:#f1f3f4;color:#202124;border:1px solid #c6cacd;border-radius:4px;
      padding:3px 7px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,.22);
      font:400 12px/1.35 system-ui,-apple-system,'Segoe UI',sans-serif`

    const cursor = document.createElement('div')
    cursor.style.cssText = `position:absolute;left:${x}px;top:${y}px;line-height:0`
    cursor.innerHTML = `<svg width="19" height="27" viewBox="0 0 19 27" fill="none">
      <path d="M1 1.6 1 20.4 6.1 15.3 9.4 22.6 12.6 21.2 9.3 14 16.4 13.8Z"
        fill="#000" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>`

    layer.append(tip, cursor)
    document.body.append(layer)
  }, prefer ?? '.x-loc-icon-flag[title]')
  await scope.page().waitForTimeout(150)
}

/**
 * The community cache, answering with a different country per account.
 *
 * `mockSharedCache` gives every account the same one, which is what a test
 * wants and the opposite of what a screenshot wants: a timeline of identical
 * flags reads as a bug. Countries are handed out in order of first request and
 * remembered, so the same account keeps its flag as the page re-renders.
 */
async function mockVariedCache(page: Page, countries: string[]): Promise<void> {
  const base = new URL(CACHE_API_BASE)
  const assigned = new Map<string, string>()

  await page.route(
    (url) => url.host === base.host && url.pathname.endsWith('/v1/loc/batch'),
    async (route) => {
      if (route.request().method() === 'OPTIONS')
        return route.fulfill({ status: 204, headers: SHOT_CORS })

      const body = route.request().postDataJSON() as { usernames?: string[] }
      const profiles = (body?.usernames ?? []).map((u) => {
        if (!assigned.has(u)) {
          assigned.set(u, countries[assigned.size % countries.length]!)
        }
        // No `src`: an app-store badge next to every flag crowds a timeline
        // shot, and the store country is its own screenshot.
        return { u, loc: assigned.get(u)!, src: null, acc: true, conf: 1 }
      })

      await route.fulfill({
        status: 200,
        headers: { ...SHOT_CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ profiles }),
      })
    },
  )

  // Nothing is contributed back from a screenshot run.
  await page.route(
    (url) => url.host === base.host && url.pathname.endsWith('/v1/loc'),
    (route) =>
      route.fulfill({
        status: 200,
        headers: { ...SHOT_CORS, 'content-type': 'application/json' },
        body: JSON.stringify({ ok: true }),
      }),
  )
}

const SHOT_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'Content-Type',
}

/** Posts, so a timeline of them does not read as the same post four times. */
const POSTS = [
  'Watched the launch from the roof with half the street. Nobody said a word until it cleared the tower.',
  'Three weeks of rain and the forecast says more. Sending strength to everyone still waiting on the sun.',
  'Genuinely one of the best things I have read all year. Putting the link in the replies.',
  'Second attempt at the sourdough. Better crust, still flat. Advice welcome.',
  'Reminder that the meeting moved an hour later. Same room.',
]

/** Gives each visible post its own body, and clears the page of replay debris. */
async function mockPosts(page: Page): Promise<void> {
  await mockPostContent(page, POSTS[0]!)
  await page.evaluate((posts) => {
    const template = document.querySelector('[data-testid="tweetText"]')
    let i = 0
    for (const article of document.querySelectorAll('article')) {
      let body = article.querySelector('[data-testid="tweetText"]')
      // A post whose only content was an image has no text node left after the
      // replay — it would sit in the frame as a name over an empty row. Give it
      // a body cloned from a real one, so the styling is X's and not a guess.
      if (!body && template) {
        body = template.cloneNode(false) as Element
        article.querySelector('[role="group"]')?.before(body)
      }
      if (body) body.textContent = posts[i++ % posts.length]!
    }
  }, POSTS)
  await page.waitForTimeout(150)
}

/** A frame spanning the first `count` posts on the page. */
async function shootTimeline(
  page: Page,
  count: number,
  name: string,
): Promise<void> {
  const clip = await page.evaluate((n) => {
    // Posts with a body only: a media-only post loses its picture in a replay
    // and would sit in the frame as a name over an empty row.
    const rects = [...document.querySelectorAll('article')]
      .filter((a) => a.querySelector('[data-testid="tweetText"]'))
      .map((a) => a.getBoundingClientRect())
      .filter((r) => r.height > 40)
      .slice(0, n)
    const first = rects[0]!
    const last = rects.at(-1)!
    return {
      x: Math.round(first.x),
      y: Math.round(Math.max(first.y, 0)),
      width: Math.round(Math.max(...rects.map((r) => r.width))),
      height: Math.round(last.bottom - Math.max(first.y, 0)),
    }
  }, count)
  await page.screenshot({
    path: path.join(LANDING, name),
    scale: 'device',
    clip,
  })
  console.log(`wrote landing/public/${name}`)
}

/** Element shot at 2x — the landing page serves these at up to ~900px wide. */
async function shoot(target: Locator | Page, name: string): Promise<void> {
  const file = path.join(LANDING, name)
  await target.screenshot({ path: file, scale: 'device' })
  console.log(`wrote landing/public/${name}`)
}

test('hover card', async ({ context }) => {
  const page = await replaying(
    context,
    'location.test.ts',
    'accurate location matches About page',
  )
  await mockSharedCache(page, null)

  const card = await hoverOwnTweet(page, 'svtv_news')
  await blurIdentities(page)
  await showHoverHint(card)
  await shoot(card, 'Hover_screenshot-x-profile-location.png')
})

test('vpn warning', async ({ context }) => {
  const page = await replaying(
    context,
    'location.test.ts',
    'VPN warning matches About page',
  )
  await mockSharedCache(page, null)

  const card = await hoverOwnTweet(page, 'zgldz')
  await blurIdentities(page)
  // The flag, not the VPN badge: the badge already says "⚠ VPN" in words, and
  // its tooltip is a sentence that would cover half the card.
  await showHoverHint(card)
  await shoot(card, 'VPN_screenshot-x-profile-location.png')
})

test('flags in the feed', async ({ context, extensionId }) => {
  const page = await replaying(
    context,
    'hide-blocked.test.ts',
    'collapse mode (the default) leaves a placeholder that reveals the tweet on demand',
  )
  // A conversation, not a profile: several different accounts on screen at once
  // is what makes this shot say "the feed" rather than "a post".
  await mockVariedCache(page, ['Germany', 'Japan', 'Brazil', 'France', 'Spain'])
  await mockAboutAccount(page, { account_based_in: 'Germany' })
  await setFeedRows(context, extensionId, true)

  await page.goto(NASA_TWEET)
  await page
    .locator(`${TWEET_ARTICLE} .x-loc-feed-row`)
    .nth(2)
    .waitFor({ timeout: 25_000 })

  await mockPosts(page)
  await blurIdentities(page)
  await showHoverHint(tweetArticles(page).nth(1))
  await shootTimeline(page, 3, 'Flags_screenshot-x-profile-location.png')
})

test('a blocked country, collapsed', async ({ context, extensionId }) => {
  const page = await replaying(
    context,
    'hide-blocked.test.ts',
    'collapse mode (the default) leaves a placeholder that reveals the tweet on demand',
  )
  // India is in the default blocked set, so handing it to one account in the
  // rotation collapses exactly that post — the rest keep their flags, which is
  // the comparison the shot is for.
  await mockVariedCache(page, ['Japan', 'India', 'Brazil', 'France', 'Spain'])
  await mockAboutAccount(page, { account_based_in: 'Japan' })
  await setFeedRows(context, extensionId, true)

  await page.goto(NASA_TWEET)
  await page
    .locator('.x-loc-hidden-ph')
    .first()
    .waitFor({ state: 'visible', timeout: 25_000 })

  await mockPosts(page)
  await blurIdentities(page)
  await showHoverHint(tweetArticles(page).first())

  // Frame from the post above the collapsed one to the post below it, so the
  // slim bar is visibly standing in for something its neighbours still show.
  const clip = await page.evaluate(() => {
    const bar = document
      .querySelector('.x-loc-hidden-ph')!
      .getBoundingClientRect()
    const rects = [...document.querySelectorAll('article')]
      .filter((a) => a.querySelector('[data-testid="tweetText"]'))
      .map((a) => a.getBoundingClientRect())
      .filter((r) => r.height > 40)
    const above = rects.findLast((r) => r.bottom <= bar.top + 4)
    const below = rects.find((r) => r.top >= bar.bottom - 4)
    const top = above ? above.top : Math.max(0, bar.top - 200)
    const bottom = below ? Math.min(below.bottom, top + 900) : bar.bottom
    return {
      x: Math.round(Math.min(bar.x, above?.x ?? bar.x)),
      y: Math.round(Math.max(top, 0)),
      width: Math.round(Math.max(bar.width, above?.width ?? 0)),
      height: Math.round(bottom - Math.max(top, 0)),
    }
  })
  await page.screenshot({
    path: path.join(LANDING, 'Warning-screenshot-x-profile-location.png'),
    scale: 'device',
    clip,
  })
  console.log('wrote landing/public/Warning-screenshot-x-profile-location.png')
})

test('a highlighted account', async ({ context, extensionId }) => {
  const page = await replaying(
    context,
    'keywords.test.ts',
    'keyword highlights article when bio contains it as a standalone word, removing it un-highlights',
  )
  await page.goto('https://x.com/MRNFT_X/status/2053116341926629624')
  await page.waitForResponse(/AboutAccountQuery/, { timeout: 20_000 })

  const article = tweetArticles(page).first()
  await article.waitFor({ timeout: 15_000 })
  await setKeywords(context, extensionId, ['nft'])
  await article.waitFor({ state: 'visible' })
  await page.waitForTimeout(1_000)
  await mockPostContent(
    page,
    'Drop goes live at midnight. Mint straight from the site, link in bio — first hundred are free.',
  )
  await blurIdentities(page)
  await showHoverHint(article)
  await shoot(article, 'Highlight_screenshot-x-profile-location.png')
})

// --- small setting helpers (storage writes, applied live) -------------------

async function writeSettings(
  context: any,
  extensionId: string,
  values: Record<string, unknown>,
) {
  const p: Page = await context.newPage()
  await p.goto(`chrome-extension://${extensionId}/pages/options.html`)
  await p.evaluate((v) => chrome.storage.local.set(v), values)
  await p.close()
}

const setFeedRows = (context: any, id: string, on: boolean) =>
  writeSettings(context, id, { showLocationInFeed: on })

const setKeywords = (context: any, id: string, words: string[]) =>
  writeSettings(context, id, { [HIGHLIGHT_KEYWORDS_KEY]: words })
