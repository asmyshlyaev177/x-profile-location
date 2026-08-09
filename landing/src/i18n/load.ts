import { DEFAULT_LOCALE } from './locales'
import type { Dict } from './dict/en'

/**
 * Loads one locale's dictionary, in the browser.
 *
 * The static-import registry in `dicts.ts` is the right shape for Node — the
 * prerender needs every language in one process — and exactly the wrong shape
 * for the client, where it would ship fifteen copies of the site's copy to
 * every visitor so that fourteen of them could go unread. At roughly 12 kB of
 * prose each that is ~170 kB raw for no benefit, on a site whose Lighthouse
 * budget is a hard 100.
 *
 * A dynamic import with a template literal is what makes Vite emit one chunk
 * per language, and this call is what makes a visitor fetch exactly one of
 * them. The glob is spelled out rather than interpolated blindly so Rollup can
 * see the candidate set at build time.
 *
 * None of this is on the critical path: every page is prerendered with its
 * copy already in the HTML, and hydration is deferred to idle. The dictionary
 * is needed only for the parts that re-render — the carousel, the lightbox,
 * the install button's browser detection.
 */
const loaders = import.meta.glob<{ [k: string]: Dict }>('./dict/*.ts')

export async function loadDict(code: string): Promise<Dict> {
  const load =
    loaders[`./dict/${code}.ts`] ?? loaders[`./dict/${DEFAULT_LOCALE}.ts`]
  const mod = await load!()
  // Each dictionary module exports one binding named for its locale (`export
  // const ja`), so the first value is it — which avoids a second lookup table
  // mapping code → export name that could drift from the filenames.
  return Object.values(mod)[0]!
}
