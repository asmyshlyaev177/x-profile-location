import { createBedframe } from '@bedframe/core'
import { chrome } from '../manifests/chrome'
import { brave } from '../manifests/brave'
import { firefox } from '../manifests/firefox'

import { safari } from '../manifests/safari'

export default createBedframe({
  browser: [
    chrome.browser,
    brave.browser,
    firefox.browser,

    safari.browser,
  ],
  extension: {
    type: 'overlay',
    options: 'embedded',
    manifest: [chrome, brave, firefox, safari],
    pages: {
      overlay: 'src/pages/main.html',
      options: 'src/pages/options.html',
      // The toolbar popup is its own entry now. It used to point at
      // options.html, so one component had to work as both a 268px panel and a
      // full settings page — see the note at the top of popup.tsx.
      popup: 'src/pages/popup.html',
    },
  },
  development: {
    template: {
      config: {
        framework: 'preact',
        language: 'typescript',
        packageManager: 'npm',
        lintFormat: true,
        tests: {
          globals: true,
          setupFiles: ['./_config/tests.config.ts'],
          environment: 'happy-dom',
          // Vite's root is `src`, so the default include stops at the extension
          // itself. The build-tooling under `scripts/` is opted in by name rather
          // than by widening the glob, because `e2e/` also holds `.test.ts` files
          // and those belong to Playwright.
          include: ['**/*.test.{ts,tsx}', '../scripts/**/*.test.mjs'],
          coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html'],
            reportsDirectory: '../coverage',
          },
          watch: false,
        },
      },
    },
  },
})
