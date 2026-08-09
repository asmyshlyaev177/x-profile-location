import { type Manifest } from '@bedframe/core'
import pkg from '../../package.json'

export const baseManifest = {
  // Required
  // - - - - - - - - -
  // This is the store listing title on both Chrome and AMO, not just the
  // in-browser label, so it carries the search keywords the old literal name
  // won on. `short_name` is what the browser UI shows when space is tight.
  //
  // Two halves, deliberately: "X profile location" is the exact phrase people
  // search, and doubles as the thing the extension reveals; "filter and
  // highlight" are verbs, so the title says what you *do* rather than listing
  // topics. No "VPN" — it is the weakest of the three signals, it reads as a
  // VPN product to anyone scanning a store search, and over-claiming it fights
  // the neutral posture the whole brand is built on. It stays in the store
  // description and the landing copy, both of which are indexed.
  //
  // 48 characters. **AMO caps the name at 50** and Chrome at 75, so the
  // Firefox limit is the binding one — check any future edit against 50, not
  // 75. (Edge Add-ons caps at 45, but we publish to Chrome and AMO only.)
  //
  // The text itself now lives in `public/_locales/*/messages.json`, which is
  // what makes the *store listing* localized as well as the UI: Chrome and AMO
  // resolve `__MSG_*__` against the same catalogue the extension reads, so a
  // translated `appName` reaches the search result, not just the popup.
  // `messages.test.ts` holds `appDesc` to `pkg.description`, so the two can't
  // drift the way a hand-copied string would.
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
    // Its own page since the Phase 2 options redesign. Pointing this at
    // options.html made the settings page unable to grow past what fits in a
    // popup panel.
    default_popup: 'pages/popup.html',
  },

  // Optional
  // - - - - - - - - -
  author: {
    email: pkg.author.email,
  },

  // Required for `chrome.runtime.openOptionsPage()` to do anything at all — it
  // throws "No Options page defined" without this key, which is what broke the
  // popup's "All settings" link. Nothing declared it before, because until the
  // popup was split out, `default_popup` *was* the options page and nothing
  // ever needed to open it.
  //
  // `open_in_tab` because this page is now a full-width five-tab settings
  // screen; the embedded dialog Chrome otherwise shows is the same cramped box
  // the redesign existed to escape. It also gives the browser's own extension
  // menu a working Options entry for free.
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
      js: ['scripts/content.tsx'],
      matches: [
        '*://*.x.com/*',
        '*://*.twitter.com/*',
        '*://x.com/*',
        '*://twitter.com/*',
      ],
    },
  ],
  // Only the MAIN-world page-script chunks need to be web-accessible; the build
  // plugin appends those specific hashed files automatically. We intentionally do
  // NOT expose pages/* (e.g. options.html) or a broad assets/* wildcard — that
  // only lets x.com fingerprint / probe the extension without any functional need.
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
