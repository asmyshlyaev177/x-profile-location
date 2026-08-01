import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { defineConfig, type PluginOption } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'
import sitemap from 'vite-plugin-sitemap'
import { siteUrl } from './src/seo'
import { prerenderPaths, routes } from './src/routes'

// The extension's version, not the landing page's — so the badge can never
// drift from what is actually on the store.
const extensionVersion = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
).version as string

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

export default defineConfig({
  define: { __EXT_VERSION__: JSON.stringify(extensionVersion) },
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
    }),
  ],
  base: '/',
  build: {
    minify: 'esbuild', // JS — esbuild (fast, good compression)
    cssMinify: true, // CSS — esbuild
    cssCodeSplit: false, // single CSS file for a single-page site
  },
})
