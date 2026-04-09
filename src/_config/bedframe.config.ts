import { createBedframe } from '@bedframe/core'
import { chrome } from '../manifests/chrome'
import { brave } from '../manifests/brave'

import { safari } from '../manifests/safari'

export default createBedframe({
  browser: [
    chrome.browser,
brave.browser,

safari.browser
  ],
  extension: {
    type: 'overlay',
    options: 'embedded',
    manifest: [chrome, brave, safari],
    pages: {
      overlay: 'src/pages/main.html',
      options: 'src/pages/options.html',
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




