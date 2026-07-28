import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
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

export default defineConfig({
  define: { __EXT_VERSION__: JSON.stringify(extensionVersion) },
  plugins: [
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
