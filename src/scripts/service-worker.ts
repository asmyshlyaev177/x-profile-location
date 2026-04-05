
import { BLOCKED_COUNTRIES_KEY, DEFAULT_BLOCKED_COUNTRIES } from './countries'

chrome.runtime.onInstalled.addListener((details): void => {
  console.log('[service-worker.ts] > onInstalled', details)
  chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
    const existing = (result as Record<string, unknown>)[BLOCKED_COUNTRIES_KEY]
    
    if (!Array.isArray(existing)) {
      chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: DEFAULT_BLOCKED_COUNTRIES })
    }
  })
})







