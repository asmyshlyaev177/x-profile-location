/**
 * Just enough x.com for the extension to behave as it does on the real thing.
 *
 * The content script only runs on x.com URLs, so the stub is served *at* those
 * URLs rather than from a local server — `route.fulfill` keeps the origin, which
 * is what makes the manifest match and the page-script attach.
 *
 * What the extension actually needs from a page is small: a GraphQL request
 * carrying an `authorization` header (page-script captures the session from it),
 * a HomeTimeline response with `__typename: 'User'` nodes in it (that is where
 * candidates come from), and articles in the DOM shaped enough to draw into.
 * None of that is X's markup as such — the e2e suite is the one that can notice
 * X moved a `data-testid`, and it is deliberately not this suite's job.
 */
import type { BrowserContext, Page, Route } from '@playwright/test'
import { CACHE_API_BASE, X_GRAPHQL_PATH } from '../src/scripts/constants'

export const FEED_URL = 'https://x.com/home'

/** Whatever the extension asks about; the names come from the timeline below. */
export interface Lookup {
  screenName: string
  tabId: string
  /** When it reached the stub, for measuring the gap the pacing produced. */
  at: number
}

export interface LookupAnswer {
  status?: number
  headers?: Record<string, string>
  location?: string | null
  /** No `about_profile` at all — X having nothing to say about the account. */
  empty?: boolean
  /**
   * Hold the answer open. A response that lands instantly lets the shared
   * IndexedDB dedup on its own, which hides whether anything is coordinating
   * the *in-flight* window — the thing two tabs actually collide on.
   */
  delayMs?: number
}

function timelineBody(handles: string[]): string {
  return JSON.stringify({
    data: {
      home: {
        home_timeline_urt: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: handles.map((handle, i) => ({
                entryId: `tweet-${i}`,
                content: {
                  itemContent: {
                    user_results: {
                      result: {
                        __typename: 'User',
                        rest_id: String(1000 + i),
                        core: { screen_name: handle, name: `User ${handle}` },
                        profile_bio: { description: `bio of ${handle}` },
                      },
                    },
                  },
                },
              })),
            },
          ],
        },
      },
    },
  })
}

function pageHtml(handles: string[]): string {
  const articles = handles
    .map(
      (handle) => `
    <article data-testid="tweet">
      <div data-testid="User-Name">
        <a href="/${handle}">User ${handle}</a>
        <a href="/${handle}">@${handle}</a>
      </div>
      <div data-testid="tweetText">post by ${handle}</div>
    </article>`,
    )
    .join('')

  // The fetch is the point: page-script wraps window.fetch and reads the session
  // off the first GraphQL call, then extracts candidates from the response.
  //
  // Repeated rather than fired once, because the wrapper is not in place at
  // parse time: the MAIN-world script is built as a loader that `import()`s the
  // real chunk, so wrapping lands a tick or two into the page's life. On x.com
  // that race is invisible — its own timeline call comes long after its bundle
  // — and a stub that fetches the instant it parses would beat the extension to
  // it every time. Repeats cost nothing: page-script dedups by handle.
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>stub timeline</title></head>
<body>
  <main>${articles}</main>
  <script>
    function loadTimeline() {
      fetch('https://${X_GRAPHQL_PATH}/StubId/HomeTimeline?variables=%7B%7D', {
        headers: {
          authorization: 'Bearer stub-token',
          'x-twitter-active-user': 'yes',
          'x-twitter-client-language': 'en',
        },
      })
    }
    for (const delay of [0, 250, 750, 1500]) setTimeout(loadTimeline, delay)

    // What X renders when the pointer rests on a name, reduced to the two
    // things the extension reads off it: the testid it watches for, and a
    // profile link to take the handle from. The content script picks it up the
    // way it picks up the real one — through its MutationObserver.
    //
    // One card at a time, and one per mutation batch: X never shows two, and
    // the observer takes only the first card it finds in a batch. Twenty cards
    // appended in one go is one hover, not twenty.
    window.hoverName = function (handle) {
      document.querySelectorAll('[data-testid="HoverCard"]').forEach(function (el) {
        el.remove()
      })
      const card = document.createElement('div')
      card.setAttribute('data-testid', 'HoverCard')
      card.innerHTML =
        '<div data-testid="UserName"><a href="/' + handle + '">@' + handle + '</a></div>'
      document.body.appendChild(card)
      return card
    }

    window.hoverSeries = async function (handles, gapMs) {
      for (const handle of handles) {
        window.hoverName(handle)
        await new Promise(function (r) { setTimeout(r, gapMs) })
      }
    }
  </script>
</body></html>`
}

/**
 * Serves the stub and records every AboutAccountQuery, from every tab.
 *
 * Routes are registered on the context so a tab opened later is covered too, and
 * `route.request().frame().page()` is what attributes a lookup to the tab that
 * made it — which is the whole question these tests ask.
 */
export async function serveStubX(
  context: BrowserContext,
  options: {
    handles: string[]
    answer: (screenName: string) => LookupAnswer
    tabName: (page: Page) => string
  },
): Promise<Lookup[]> {
  const lookups: Lookup[] = []

  // Registration order matters and runs backwards: Playwright tries the most
  // recently added route first. The catch-all goes on before the specific ones,
  // or it swallows the two requests these tests exist to see.
  await context.route('https://x.com/**', (route) => {
    if (route.request().resourceType() !== 'document') return route.abort()
    return route.fulfill({
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
      body: pageHtml(options.handles),
    })
  })

  // The community cache is a real server this suite must never touch, in either
  // direction — it would answer from other users' contributions, and these stub
  // locations would end up in the shared consensus.
  if (CACHE_API_BASE.length > 0) {
    await context.route(`${CACHE_API_BASE}/**`, (route) =>
      route.fulfill({
        status: 200,
        headers: {
          'content-type': 'application/json',
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, OPTIONS',
          'access-control-allow-headers': 'Content-Type',
        },
        body: JSON.stringify({ profiles: [], ok: true }),
      }),
    )
  }

  await context.route(/HomeTimeline/, (route) =>
    route.fulfill({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: timelineBody(options.handles),
    }),
  )

  await context.route(/AboutAccountQuery/, async (route: Route) => {
    const variables = new URL(route.request().url()).searchParams.get(
      'variables',
    )
    const screenName = String(
      JSON.parse(variables ?? '{}').screenName ?? '?',
    ).toLowerCase()
    const from = route.request().frame().page()
    lookups.push({ screenName, tabId: options.tabName(from), at: Date.now() })

    const reply = options.answer(screenName)
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs))
    await route.fulfill({
      status: reply.status ?? 200,
      headers: { 'content-type': 'application/json', ...reply.headers },
      body: JSON.stringify({
        data: {
          user_result_by_screen_name: {
            result: reply.empty
              ? {}
              : {
                  about_profile: {
                    account_based_in: reply.location ?? 'Japan',
                    location_accurate: true,
                    source: 'web',
                  },
                },
          },
        },
      }),
    })
  })

  return lookups
}
