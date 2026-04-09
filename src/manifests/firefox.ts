import { createManifest } from '@bedframe/core'
import { baseManifest } from './base.manifest'

const updatedFirefoxManifest = {
  ...baseManifest,
  author: baseManifest.author.email,
  background: {
    scripts: [baseManifest.background.service_worker],
  },
  browser_specific_settings: {
    gecko: {
      id: baseManifest.author.email,
      // ^^^ https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#id
    },
  },
}

export const firefox = createManifest(updatedFirefoxManifest as any, 'firefox')




