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
      id: 'x-profile-location@asmyshlyaev177',
      // ^^^ https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/browser_specific_settings#id
      data_collection_permissions: {
        required: [],
        hostnames: [],
      },
    },
  },
}

export const firefox = createManifest(updatedFirefoxManifest as any, 'firefox')




