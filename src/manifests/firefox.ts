import { createManifest } from '@bedframe/core'
import { baseManifest } from './base.manifest'
import pkg from '../../package.json'

// Firefox deltas — every one of these breaks the build or the AMO linter if
// changed. See "Keys that are load-bearing" in CLAUDE.md.
const { background, ...rest } = baseManifest

const updatedFirefoxManifest = {
  ...rest,
  // Plain string: Chrome's `{ email }` object is MANIFEST_FIELD_INVALID on AMO.
  author: pkg.author.name as unknown as typeof baseManifest.author,
  background: {
    scripts: [background.service_worker],
  },
  browser_specific_settings: {
    gecko: {
      // Permanent add-on identity — frozen from the first AMO submission on.
      id: 'addon@x-pat.pages.dev',
      // `world: 'MAIN'` landed in Firefox 128; page-script.ts needs it.
      strict_min_version: '128.0',
    },
  },
}

export const firefox = createManifest(updatedFirefoxManifest, 'firefox')
