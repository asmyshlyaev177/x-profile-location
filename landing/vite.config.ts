import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig, type PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import sitemap from 'vite-plugin-sitemap'
import { siteUrl } from './src/seo'
import { localizedRoutes, prerenderPathsFor, routes } from './src/routes'
import { LANG_KEY, localeCodes, localePath, locales } from './src/i18n/locales'
import {
  getContentLastModified,
  getRouteLastmods,
} from './scripts/build-date.mjs'
import { buildAiFiles, DISCOVERY } from './src/data/ai-files'
import { comparisonMarkdown } from './src/data/comparison-markdown'

/**
 * `locales.ts` promises a language; `src/i18n/dict/` has to deliver it.
 *
 * Checked here rather than in a module because nothing statically imports the
 * dictionaries any more — that is deliberate, and it is what keeps the browser
 * from downloading all fifteen — so there is no import graph left to notice a
 * missing one. Failing at config load turns "a locale with no copy" into a
 * build error rather than a prerendered page of English served under /th, with
 * an hreflang and a sitemap entry claiming otherwise.
 */
const dictDir = fileURLToPath(new URL('src/i18n/dict', import.meta.url))
const translated = new Set(
  readdirSync(dictDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, '')),
)
const untranslated = localeCodes.filter((c) => !translated.has(c))
if (untranslated.length) {
  throw new Error(
    `i18n: locales.ts lists ${untranslated.join(', ')} with no dictionary. ` +
      'Add src/i18n/dict/<code>.ts, or drop the locale from locales.ts until ' +
      'it is translated.',
  )
}

// The extension's version, not the landing page's — so the badge can never
// drift from what is actually on the store.
const extensionVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version as string

// When the content last changed, from the HEAD commit. Baked in here and read
// through `__CONTENT_LAST_MODIFIED__`, so `dateModified`, `og:updated_time` and
// the sitemap all agree and none of them move on a rebuild that changed nothing.
const contentLastModified = getContentLastModified()

/**
 * Per-URL `<lastmod>`, extended across the locales.
 *
 * A translated page's content date is its English source's: the pages say the
 * same thing, and a Thai page has not "changed" because it was rendered today.
 * Without this the sitemap plugin falls back to `new Date()` for every
 * localised URL, which is the build-clock freshness signal the whole
 * `build-date.mjs` module exists to avoid — only now it would be wrong on
 * fifty-six URLs instead of one.
 */
const baseLastmods = getRouteLastmods(routes)
const routeLastmods: Record<string, Date> = { ...baseLastmods }
for (const code of localeCodes) {
  for (const route of localizedRoutes) {
    const stamp = baseLastmods[route.path]
    if (stamp) routeLastmods[localePath(code, route.path)] = stamp
  }
}

/**
 * Teaches `vite preview` the rule Cloudflare Pages applies in production: a
 * request for `/about` is served by `about.html`.
 *
 * `scripts/flatten-routes.mjs` emits that layout, but Vite's preview server
 * only resolves directories, so every subroute fell through to the SPA
 * fallback and returned the *homepage* document — correct after hydration,
 * wrong in the one thing preview exists to check. Without this, a prerender
 * regression is invisible locally and only shows up in a crawler.
 */
function serveFlatHtml(): PluginOption {
  const dist = fileURLToPath(new URL('dist', import.meta.url))
  return {
    name: 'serve-flat-html',
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path = '/', query] = (req.url ?? '/').split('?')
        // Anything with a dot is an asset (`/assets/…`, `/sitemap.xml`); the
        // root already has its own index.html.
        if (path !== '/' && !path.includes('.')) {
          const candidate = join(dist, `${path}.html`)
          if (existsSync(candidate)) {
            req.url = query ? `${path}.html?${query}` : `${path}.html`
          } else if (existsSync(join(dist, '404.html'))) {
            // Same substitution Pages makes for an unmatched path. The status
            // stays 200 here — sirv writes its own head — so preview shows the
            // right document but not the right code; the code is Pages' half.
            req.url = '/404.html'
          }
        }
        next()
      })
    },
  }
}

/**
 * Strips the `modulepreload` links for chunks the browser must not fetch.
 *
 * Vite emits one `<link rel="modulepreload">` per entry chunk and per static
 * import of an entry — and the prerender plugin adds `prerender.tsx` as a
 * second Rollup input, so every document ended up preloading the prerenderer
 * *and*, through it, all fifteen dictionary chunks. The code splitting was
 * working; the HTML was undoing it, asking for ~110 kB the page never
 * executes.
 *
 * The dictionaries stay reachable: `loadDict`'s dynamic import fetches the one
 * that is needed, and Vite's preload helper handles it at runtime. Only the
 * eager hint is removed.
 *
 * Runs `post` so it sees the links Vite's own HTML plugin injected, and it
 * runs on `index.html` before the prerenderer clones it per route — so one
 * edit here covers all fifty-six documents.
 */
function stripPrerenderPreloads(): PluginOption {
  return {
    name: 'strip-prerender-preloads',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          /<link[^>]+rel="modulepreload"[^>]+href="[^"]*\/(?:prerender|dict-)[^"]*"[^>]*>\s*/g,
          '',
        )
      },
    },
  }
}

/**
 * Substitutes `%LOCALE_CODES%` in `index.html`.
 *
 * The language-preference script is inline in the head — it has to run before
 * first paint — so it cannot import the locale table. Injecting the list at
 * build time is what keeps `locales.ts` the only place the shipping languages
 * are written down; a hand-maintained copy inside a `<script>` tag would go
 * stale on the first locale added or removed, and the symptom would be a
 * redirect to a page that does not exist.
 */
function localeCodesHtml(): PluginOption {
  return {
    name: 'locale-codes-html',
    transformIndexHtml(html) {
      return html
        .replace('%LOCALE_CODES%', localeCodes.join(','))
        .replace('%LANG_KEY%', LANG_KEY)
    },
  }
}

/**
 * Every page of every locale that asks not to be indexed — see
 * `LocaleDef.indexed`. Kept out of the sitemap for the same reason the
 * `noindex` routes are.
 */
const unindexedPaths = locales
  .filter((l) => !l.indexed)
  .flatMap((l) => localizedRoutes.map((r) => localePath(l.code, r.path)))

/**
 * Writes the AI discovery file set into `dist/`.
 *
 * `emitFile` rather than a `public/` copy because every one of them carries the
 * site URL, the extension version and the HEAD-commit date — a static copy in
 * `public/` would be stale the moment any of the three changed, and stale is
 * the one thing these files must not be.
 */
function aiDiscoveryFiles(): PluginOption {
  return {
    name: 'ai-discovery-files',
    generateBundle() {
      const files = buildAiFiles({
        siteUrl,
        version: extensionVersion,
        lastModified: contentLastModified,
      })
      for (const [fileName, source] of Object.entries(files)) {
        this.emitFile({ type: 'asset', fileName, source })
      }
    },
  }
}

/**
 * Writes `dist/robots.txt`.
 *
 * `vite-plugin-sitemap` generates one by default, but its schema is only
 * User-agent / Allow / Disallow / Crawl-delay / Clean-param — there is no slot
 * for the `Content-Signal` line, and its `closeBundle` write lands after this
 * plugin's `emitFile` and would overwrite whatever was emitted. So its
 * generator is switched off below and the whole file is authored here.
 *
 * The signals say what may be *done* with the content; Allow/Disallow only say
 * what may be *fetched*. Both are granted here: an assistant answering "which
 * extension shows where an X account posts from" citing this page is the
 * distribution channel, not a leak.
 */
function robotsTxt(): PluginOption {
  const base = siteUrl.replace(/\/$/, '')
  return {
    name: 'robots-txt',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `\
# Content Signals — https://contentsignals.org/
#   search   = indexing this site and showing links plus short excerpts
#   ai-train = training or fine-tuning a model
#   ai-input = grounding a generative answer at request time (RAG)
User-agent: *
Content-Signal: search=yes, ai-train=yes, ai-input=yes
Allow: /

# The AI discovery file set published on this host
# (https://www.ai-visibility.org.uk/specifications/). Listed as comments
# because robots.txt has no directive for them; agents find them at their
# well-known paths.
${DISCOVERY.map((f) => `#   ${base}/${f}`).join('\n')}

Sitemap: ${base}/sitemap.xml
`,
      })
    },
  }
}

/**
 * Rewrites the comparison table in the repo README between its markers.
 *
 * The table exists on three surfaces — this site's homepage, the comparison
 * page, and the README — and all three read `src/data/comparison.ts`. The two
 * on the site do it at render time; the README cannot, so it is regenerated
 * here instead of being maintained by hand. A comparison table that says
 * different things in different places is worse than not having one.
 *
 * Writing outside the package during a build is deliberate but narrow: it
 * touches exactly the block between the markers, and it is idempotent — a
 * build whose comparison data has not moved writes nothing at all. That last
 * property used to be a convenience and is now load-bearing: the Lighthouse
 * workflow builds this site on a runner, so an unconditional write would dirty
 * every checkout it touched.
 */
function readmeComparison(): PluginOption {
  const readme = fileURLToPath(new URL('../README.md', import.meta.url))
  const START = '<!-- comparison:start -->'
  const END = '<!-- comparison:end -->'

  return {
    name: 'readme-comparison',
    closeBundle() {
      if (!existsSync(readme)) return
      const current = readFileSync(readme, 'utf-8')
      const from = current.indexOf(START)
      const to = current.indexOf(END)
      // No markers means the README opted out; say nothing and move on.
      if (from === -1 || to === -1 || to < from) return

      const next =
        current.slice(0, from + START.length) +
        '\n' +
        comparisonMarkdown(siteUrl) +
        current.slice(to)
      if (next !== current) writeFileSync(readme, next)
    },
  }
}

export default defineConfig({
  define: {
    __EXT_VERSION__: JSON.stringify(extensionVersion),
    __CONTENT_LAST_MODIFIED__: JSON.stringify(contentLastModified),
  },
  plugins: [
    serveFlatHtml(),
    localeCodesHtml(),
    stripPrerenderPreloads(),
    preact({
      prerender: {
        enabled: true,
        renderTarget: '#app',
        // A separate entry from `main.tsx`. The prerenderer needs every
        // dictionary in one process; the browser needs exactly one. Pointing
        // this at its own module is what stops Rollup following the first
        // requirement into the client bundle.
        prerenderScript: fileURLToPath(
          new URL('src/prerender.tsx', import.meta.url),
        ),
        additionalPrerenderRoutes: prerenderPathsFor(localeCodes),
        previewMiddlewareEnabled: true,
        previewMiddlewareFallback: '/index.html',
      },
    }),
    tailwindcss(),
    // `noindex` pages are asked not to be indexed in their <head>; listing them
    // in the sitemap would ask for the opposite in the same breath.
    sitemap({
      hostname: siteUrl,
      // No `dynamicRoutes`. The plugin's own scan of `dist` already finds every
      // prerendered page including the localised ones, and passing the same
      // list again had it union the two without deduplicating — every URL
      // appeared twice in the sitemap.
      exclude: [
        ...routes.filter((r) => r.noindex).map((r) => r.path),
        ...unindexedPaths,
      ],
      // Per-URL dates, from the commits that touched each page's sources. The
      // plugin's default is `new Date()`, which stamps every URL with the build
      // time and tells a crawler the whole site changed whenever any of it did.
      lastmod: routeLastmods,
      // `robotsTxt()` below writes robots.txt instead — this plugin's schema
      // cannot express `Content-Signal`, and its write would clobber ours.
      generateRobotsTxt: false,
    }),
    aiDiscoveryFiles(),
    robotsTxt(),
    readmeComparison(),
  ],
  base: '/',
  build: {
    minify: 'esbuild', // JS — esbuild (fast, good compression)
    cssMinify: true, // CSS — esbuild
    cssCodeSplit: false, // single CSS file for a single-page site
    rollupOptions: {
      output: {
        /**
         * Keeps the renderer out of the browser's download.
         *
         * `prerender.tsx` and `main.tsx` are two entries in one build sharing
         * `app.tsx`, so Rollup's default placement put `seo.ts` and
         * `preact-render-to-string` in the chunk the client entry imports.
         * Naming them here moves them into a chunk only the prerenderer
         * reaches.
         *
         * `vite/modulepreload-polyfill` is deliberately absent: the client
         * needs it for `loadDict`'s dynamic import, so listing it made the two
         * chunks import each other, and a circular chunk pair executes in
         * whichever order Rollup settles on — which is how the *prerenderer*
         * ended up running in the browser and throwing
         * `Cannot access 'I' before initialization`. Lighthouse counts a
         * console error against best-practices, so it surfaced as a 96 rather
         * than as anything visible.
         */
        manualChunks(id) {
          // One chunk per language, so `loadDict`'s dynamic import fetches the
          // reader's own copy and nobody else's. Without this the catch-all
          // below would sweep all fifteen into the client entry.
          const dict = /src\/i18n\/dict\/([a-z-]+)\.ts$/.exec(id)
          if (dict) return `dict-${dict[1]}`

          if (
            id.includes('/src/prerender.tsx') ||
            id.includes('/src/seo.ts') ||
            id.includes('/src/data/ai-files.ts') ||
            id.includes('/src/data/comparison-markdown.ts') ||
            id.includes('preact-render-to-string')
          ) {
            return 'prerender'
          }

          // Everything else — Preact, the components, the route table — is the
          // client's, in one chunk. The assignment has to be explicit: name
          // only the prerender side and Rollup hoists the *shared* modules
          // into that chunk too, leaving the client entry a 1 kB stub that
          // statically imports 91 kB of renderer to reach Preact.
          return 'index'
        },
      },
    },
  },
})
