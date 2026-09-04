/**
 * Accessibility, then Lighthouse, over the production build. Rationale in CLAUDE.md.
 */
import { defineConfig } from '@playwright/test'

/** Not 5173: a `pnpm dev` left running must never be audited in place of the
 *  build. */
const PREVIEW_PORT = 5174

/** Exported for the specs — neither reads `baseURL`. */
export const PREVIEW_URL = `http://localhost:${PREVIEW_PORT}`

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: 0,
  // A cold Lighthouse run is far slower than an ordinary assertion.
  timeout: 180_000,
  reporter: [['list']],

  projects: [
    { name: 'a11y', testMatch: /(a11y|scroll|seo)\.spec\.ts/ },
    // Held back so the audits get the box; `workers` stays at the default —
    // the spec's serial describe pins them to one anyway.
    {
      name: 'lighthouse',
      testMatch: /lighthouse\.spec\.ts/,
      dependencies: ['a11y'],
    },
  ],

  webServer: {
    command: 'pnpm run build && pnpm run preview:lighthouse',
    url: PREVIEW_URL,
    // `vite preview` applies the flat `about.html` layout Pages uses; the dev
    // server falls every subroute through to the SPA shell.
    reuseExistingServer: !process.env.CI,
    // The build regenerates images with sharp before Vite runs.
    timeout: 180_000,
  },
})
