/**
 * The build-time entry. Runs in Node, once per route × locale.
 *
 * It loads a locale's copy the same way the browser does — `loadDict`, one
 * dynamic import — rather than through a registry that names all fifteen. That
 * is not symmetry for its own sake: a module statically importing every
 * dictionary is a module Rollup has to place in *some* chunk, and every
 * arrangement of that chunk relative to the client entry was wrong. Either the
 * browser downloaded all fifteen languages, or the two chunks imported each
 * other and the prerenderer ran in the browser. With no such module, each
 * dictionary is reachable only through a dynamic import and Rollup splits them
 * on its own.
 */
import { renderToString } from 'preact-render-to-string'
import { App } from './app'
import { buildHeadElements } from './seo'
import { metaFor, resolveRoute } from './routes'
import { splitLocale } from './i18n/locales'
import { loadDict } from './i18n/load'

interface PrerenderData {
  url?: string
}

export async function prerender({ url }: PrerenderData = {}) {
  const path = url ?? '/'
  const { locale, routePath } = splitLocale(path)
  const route = resolveRoute(routePath)
  const dict = await loadDict(locale.code)

  const html = renderToString(<App url={path} dict={dict} />)
  return {
    html,
    head: {
      // The plugin writes this onto `<html lang>`. Its RTL counterpart, `dir`,
      // has no equivalent hook, so `scripts/minify-html.mjs` derives that from
      // the tag this sets.
      lang: locale.htmlLang,
      title: metaFor(route, dict).title,
      elements: buildHeadElements(route, locale, __EXT_VERSION__, dict),
    },
  }
}
