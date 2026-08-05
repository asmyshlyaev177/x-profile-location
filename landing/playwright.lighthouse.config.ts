/**
 * Lighthouse guardrails for the landing site.
 *
 * A fourth suite, and the only one that looks at `landing/` at all — the other
 * three (`pnpm test`, `pnpm test:visual`, `pnpm test:e2e`, all rooted one
 * directory up) are about the extension. It lives here rather than at the root
 * because everything it needs is here: the build, the preview server, and a
 * ~100 MB `lighthouse` dependency the extension package has no use for.
 *
 * It audits the *production* build, never `vite dev`. The two differ in most of
 * what is being scored — minified CSS and JS, the prerendered documents,
 * `flatten-routes.mjs`'s flat filenames, and the absence of Vite's HMR client —
 * so a green dev run would say nothing about what Cloudflare Pages serves.
 */
import { defineConfig } from '@playwright/test'

/**
 * Deliberately not 5173, which both `pnpm dev` and `pnpm preview` use: a dev
 * server left running would otherwise be silently accepted in place of the
 * build, and dev is the one thing this suite must not measure.
 */
const PREVIEW_PORT = 5174

/** Exported for the spec, which drives its own browser over CDP and so never
 *  sees `baseURL`. */
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`

export default defineConfig({
  testDir: './tests',
  // Serial, one worker. Two Chrome instances auditing at once skew each other's
  // performance numbers — the audit ends up measuring the test runner rather
  // than the site — and there is nothing to gain by racing six short runs.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  // A cold Lighthouse run is far slower than an ordinary assertion.
  timeout: 180_000,
  reporter: [['list']],
  // No `use` block: every test launches its own browser (Lighthouse needs a
  // debugging port the `page` fixture does not expose), so nothing here would
  // reach it.

  webServer: {
    command: 'pnpm run build && pnpm run preview:lighthouse',
    url: PREVIEW_URL,
    // `vite preview` is what teaches the flat `about.html` layout that Pages
    // applies in production (see `serveFlatHtml` in vite.config.ts). Under the
    // dev server every subroute falls through to the SPA fallback and returns
    // the homepage document, which would quietly audit the same page six times.
    reuseExistingServer: !process.env.CI,
    // The build regenerates images with sharp before Vite runs.
    timeout: 180_000,
  },
})
