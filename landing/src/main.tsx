import { render } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { App } from './app'
import { seo, buildHeadElements, siteUrl } from './seo'

interface PrerenderData {
  url?: string
}

export async function prerender({ url }: PrerenderData = {}) {
  const path = url ?? '/'
  const isPrivacyPolicy =
    path === '/privacy-policy' || path === '/privacy-policy/'

  const title = isPrivacyPolicy
    ? `Privacy Policy — ${seo.og.siteName}`
    : seo.title

  const canonical = isPrivacyPolicy ? `${siteUrl}privacy-policy` : seo.og.url

  const headElements = isPrivacyPolicy
    ? new Set([
        {
          type: 'meta',
          props: {
            name: 'description',
            content: 'Privacy Policy for X Profile Location browser extension.',
          },
        },
        { type: 'link', props: { rel: 'canonical', href: canonical } },
        { type: 'meta', props: { name: 'robots', content: 'noindex' } },
      ])
    : buildHeadElements(__EXT_VERSION__)

  const html = renderToString(<App url={path} />)
  return {
    html,
    head: {
      title,
      elements: headElements,
    },
  }
}

if (typeof window !== 'undefined') {
  const mount = () => render(<App />, document.getElementById('app')!)

  // Every page is prerendered and every control in the markup already works
  // without JS: the install link is a real <a href>, the anchors are anchors.
  // So hydration buys the carousel, the lightbox and the Brave check — none of
  // which anyone can reach in the first second. Running it on idle instead of
  // immediately keeps ~150 ms of scripting off the critical path.
  if ('requestIdleCallback' in window) {
    requestIdleCallback(mount, { timeout: 1500 })
  } else {
    setTimeout(mount, 1)
  }
}
