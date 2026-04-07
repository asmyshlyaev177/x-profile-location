import { type Manifest } from '@bedframe/core'
import pkg from '../../package.json'

export const baseManifest = {
  // Required
  // - - - - - - - - -
  name: 'X Profile Viewer',
  version: pkg.version,
  manifest_version: 3,

  // Recommended
  // - - - - - - - - -
  description: pkg.description,
  icons: {
    16: 'assets/icons/icon-16x16.png',
    32: 'assets/icons/icon-32x32.png',
    48: 'assets/icons/icon-48x48.png',
    128: 'assets/icons/icon-128x128.png',
  },
  action: {
    default_icon: {
      16: 'assets/icons/icon-16x16.png',
      32: 'assets/icons/icon-32x32.png',
      48: 'assets/icons/icon-48x48.png',
      128: 'assets/icons/icon-128x128.png',
    },
    default_title: pkg.name,
    default_popup: 'pages/options.html',
  },

  // Optional
  // - - - - - - - - -
  author: {
    email: pkg.author.email,
  },
  background: {
    service_worker: 'scripts/service-worker.ts',
    type: 'module',
  },

  content_scripts: [
    {
      js: ['scripts/page-script.ts'],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
      run_at: 'document_start',
      world: 'MAIN',
    },
    {
      js: ['scripts/content.tsx'],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
    },
  ],
  web_accessible_resources: [
    {
      resources: ['assets/*', 'pages/*'],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
    },
  ],
  host_permissions: [
    '*://*.x.com/*',
    '*://*.twitter.com/*',
  ],
  permissions: [
    'storage',
  ],
} satisfies Manifest




