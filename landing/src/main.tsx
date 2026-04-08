import { render } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { App } from './app'
import { seo, buildHeadElements, siteUrl } from './seo'

interface PrerenderData {
  url?: string
}

export async function prerender({ url }: PrerenderData = {}) {
  const path = url ?? '/'
  const isPrivacyPolicy = path === '/privacy-policy' || path === '/privacy-policy/'

  const title = isPrivacyPolicy
    ? `Privacy Policy — ${seo.og.siteName}`
    : seo.title

  const canonical = isPrivacyPolicy
    ? `${siteUrl}privacy-policy`
    : seo.og.url

  const headElements = isPrivacyPolicy
    ? new Set([
        { type: 'meta', props: { name: 'description', content: 'Privacy Policy for X Profile Location browser extension.' } },
        { type: 'link', props: { rel: 'canonical', href: canonical } },
        { type: 'meta', props: { name: 'robots', content: 'noindex' } },
      ])
    : buildHeadElements()

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
  render(<App />, document.getElementById('app')!)
}
