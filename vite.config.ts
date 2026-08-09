import tailwindcss from '@tailwindcss/vite'
import preact from '@preact/preset-vite'
import bedframeConfig from './src/_config/bedframe.config'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { bedframe } from '@bedframe/core'
import { defineConfig, type Plugin } from 'vite'

/**
 * Drop the `description` field from the shipped locale catalogues.
 *
 * Those descriptions are for whoever is translating the file — what the string
 * is, where it appears, which words are product names — and thirteen of the
 * fifteen catalogues are worked on outside this repo, so they earn their place
 * in source. The browser never reads them, and at fifteen copies of the same
 * English paragraphs they are 275 kB of the 485 kB `_locales` weighs unpacked:
 * more than the entire rest of the extension.
 *
 * Runs at `closeBundle` because publicDir is copied outside the bundle graph —
 * there is no asset to transform, only files already on disk.
 */
function leanLocales(outDir: string): Plugin {
  return {
    name: 'x-pat:lean-locales',
    apply: 'build',
    closeBundle() {
      const root = resolve(outDir, '_locales')
      let locales: string[]
      try {
        locales = readdirSync(root)
      } catch {
        return // no catalogue in this build
      }
      for (const locale of locales) {
        const file = resolve(root, locale, 'messages.json')
        const entries = JSON.parse(readFileSync(file, 'utf8')) as Record<
          string,
          { message: string }
        >
        const lean = Object.fromEntries(
          Object.entries(entries).map(([key, { message }]) => [
            key,
            { message },
          ]),
        )
        writeFileSync(file, JSON.stringify(lean))
      }
    },
  }
}

// https://vite.dev/config/
const { manifest, pages } = bedframeConfig.extension
const { tests } = bedframeConfig.development.template.config

export default defineConfig(({ mode }) => ({
  root: resolve(__dirname, './src'),
  envDir: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  // `mode` is the browser being built (`bedframe build` → `vite build --mode <browser>`).
  // crxjs needs to be told about Firefox explicitly: it defaults to 'chrome' and
  // otherwise emits a `background.service_worker` loader Firefox can't run, plus
  // `use_dynamic_url` on web_accessible_resources, which Firefox doesn't support.
  plugins: [
    bedframe(manifest, mode === 'firefox' ? { browser: 'firefox' } : {}),
    preact(),
    tailwindcss(),
    leanLocales(resolve(__dirname, 'dist', mode)),
  ],
  build: {
    outDir: resolve(__dirname, 'dist', mode),
    emptyOutDir: true,
    rollupOptions: {
      input: pages,
    },
  },
  test: tests,
  server: {
    port: Number(process.env.BEDFRAME_DEV_PORT) || 5173,
    cors: {
      origin: [/chrome-extension:\/\//, /moz-extension:\/\//],
    },
  },
}))
