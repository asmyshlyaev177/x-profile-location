import { render } from 'preact'
import { renderToString } from 'preact-render-to-string'
import { App } from './app'
import { seo, buildHeadElements } from './seo'

export async function prerender() {
  const html = renderToString(<App />)
  return {
    html,
    head: {
      title: seo.title,
      elements: buildHeadElements(),
    },
  }
}

if (typeof window !== 'undefined') {
  render(<App />, document.getElementById('app')!)
}
