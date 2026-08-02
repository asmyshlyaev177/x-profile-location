import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig, type PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import sitemap from 'vite-plugin-sitemap'
import { siteUrl } from './src/seo'
import { prerenderPaths, routes } from './src/routes'
import {
  getContentLastModified,
  getRouteLastmods,
} from './scripts/build-date.mjs'
import { buildAiFiles } from './src/data/ai-files'
import { comparisonMarkdown } from './src/data/comparison-markdown'

// The extension's version, not the landing page's — so the badge can never
// drift from what is actually on the store.
const extensionVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version as string

// When the content last changed, from the HEAD commit. Baked in here and read
// through `__CONTENT_LAST_MODIFIED__`, so `dateModified`, `og:updated_time` and
// the sitemap all agree and none of them move on a rebuild that changed nothing.
const contentLastModified = getContentLastModified()
const routeLastmods = getRouteLastmods(routes)

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
          }
        }
        next()
      })
    },
  }
}

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
 * Rewrites the comparison table in the repo README between its markers.
 *
 * The table exists on three surfaces — this site's homepage, the comparison
 * page, and the README — and all three read `src/data/comparison.ts`. The two
 * on the site do it at render time; the README cannot, so it is regenerated
 * here instead of being maintained by hand. A comparison table that says
 * different things in different places is worse than not having one.
 *
 * Writing outside the package during a build is deliberate but narrow: it
 * touches exactly the block between the markers, it is idempotent, and no CI
 * job builds this site, so it cannot dirty a checkout unexpectedly.
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
    preact({
      prerender: {
        enabled: true,
        renderTarget: '#app',
        additionalPrerenderRoutes: prerenderPaths,
        previewMiddlewareEnabled: true,
        previewMiddlewareFallback: '/index.html',
      },
    }),
    tailwindcss(),
    // `noindex` pages are asked not to be indexed in their <head>; listing them
    // in the sitemap would ask for the opposite in the same breath.
    sitemap({
      hostname: siteUrl,
      exclude: routes.filter((r) => r.noindex).map((r) => r.path),
      // Per-URL dates, from the commits that touched each page's sources. The
      // plugin's default is `new Date()`, which stamps every URL with the build
      // time and tells a crawler the whole site changed whenever any of it did.
      lastmod: routeLastmods,
    }),
    aiDiscoveryFiles(),
    readmeComparison(),
  ],
  base: '/',
  build: {
    minify: 'esbuild', // JS — esbuild (fast, good compression)
    cssMinify: true, // CSS — esbuild
    cssCodeSplit: false, // single CSS file for a single-page site
  },
})
