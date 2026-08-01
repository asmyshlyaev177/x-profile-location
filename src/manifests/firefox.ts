import { createManifest } from '@bedframe/core'
import { baseManifest } from './base.manifest'
import pkg from '../../package.json'

// Firefox does not implement MV3 `background.service_worker` at all — the same
// module runs as a non-persistent background script instead. crxjs reads
// `manifest.background.scripts[0]` (not optional-chained) whenever it is built
// with `browser: 'firefox'`, so this key MUST be the array form or the build
// throws; vite.config.ts passes that flag when `mode === 'firefox'`.
// crxjs re-adds `type: 'module'` itself on the emitted loader.
const { background, ...rest } = baseManifest

const updatedFirefoxManifest = {
  ...rest,
  // Firefox's schema types `author` as a plain string. Chrome's `{ email }` object
  // is a hard MANIFEST_FIELD_INVALID error in the AMO linter, so it can't just be
  // inherited — and Chrome ignores this key anyway.
  author: pkg.author.name as unknown as typeof baseManifest.author,
  background: {
    scripts: [background.service_worker],
  },
  browser_specific_settings: {
    gecko: {
      // Permanent add-on identity. Changing it after the first AMO submission
      // creates a *new* add-on rather than an update — this was safe to rename
      // only because nothing has been submitted to AMO yet. It is frozen from
      // the first submission onward, whatever the extension is called later.
      id: 'addon@x-pat.pages.dev',
      // page-script.ts has to run in `world: 'MAIN'` to patch the page's own
      // fetch/XHR; that content_scripts key landed in Firefox 128.
      // ^^^ https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts#world
      strict_min_version: '128.0',
    },
  },
}

export const firefox = createManifest(updatedFirefoxManifest, 'firefox')
