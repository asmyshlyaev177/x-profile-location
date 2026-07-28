import { render } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { App } from './app'
import { buildHeadElements } from './seo'
import { resolveRoute } from './routes'

interface PrerenderData {
  url?: string
}

export async function prerender({ url }: PrerenderData = {}) {
  const path = url ?? '/'
  const route = resolveRoute(path)

  const html = renderToString(<App url={path} />)
  return {
    html,
    head: {
      title: route.title,
      elements: buildHeadElements(route, __EXT_VERSION__),
    },
  }
}

if (typeof window !== 'undefined') {
  const mount = () => render(<App />, document.getElementById('app')!)

  // Every page is prerendered and every control in the markup already works
  // without JS: the install link is a real <a href>, the anchors are anchors,
  // and the FAQ is a native <details>. So hydration buys the carousel, the
  // lightbox and the Brave check — none of which anyone can reach in the first
  // second. Running it on idle instead of immediately keeps ~150 ms of
  // scripting off the critical path.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(mount, { timeout: 1500 })
  } else {
    setTimeout(mount, 1)
  }
}
