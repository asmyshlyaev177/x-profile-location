import { type Manifest } from '@bedframe/core'
import pkg from '../../package.json'

export const baseManifest = {
  // The store listing title on Chrome and AMO, not just the in-browser label.
  // AMO caps it at 50 characters — see "Store listing" in CLAUDE.md.
  name: '__MSG_appName__',
  short_name: '__MSG_appShortName__',
  version: pkg.version,
  manifest_version: 3,
  // Required alongside any `__MSG_*__` above: without it Chrome refuses to
  // load the extension at all, rather than falling back to the raw token.
  default_locale: 'en',

  // Recommended
  // - - - - - - - - -
  description: '__MSG_appDesc__',
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
    // Toolbar tooltip. Was `pkg.name`, which is now the npm-style `x-pat` —
    // correct as a package name, wrong as something a user reads.
    default_title: '__MSG_actionTitle__',
    // Its own page: pointing this at options.html capped the settings page at
    // what fits in a popup panel.
    default_popup: 'pages/popup.html',
  },

  // Optional
  // - - - - - - - - -
  author: {
    email: pkg.author.email,
  },

  // Required for `chrome.runtime.openOptionsPage()` to work at all — see "Keys
  // that are load-bearing" in CLAUDE.md.
  options_ui: {
    page: 'pages/options.html',
    open_in_tab: true,
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
      js: ['scripts/content/content.tsx'],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
    },
  ],
  // Only the MAIN-world page-script chunks, appended by the build plugin. Never
  // pages/* or a broad assets/* — that lets x.com fingerprint the extension.
  web_accessible_resources: [
    {
      resources: [],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
    },
  ],
  host_permissions: ['*://*.x.com/*', '*://*.twitter.com/*'],
  permissions: ['storage', 'contextMenus'],
} satisfies Manifest
