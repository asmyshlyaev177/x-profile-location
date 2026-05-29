
import { BLOCKED_COUNTRIES_KEY, DEFAULT_BLOCKED_COUNTRIES } from './countries'

chrome.runtime.onInstalled.addListener((details): void => {
  console.log('[service-worker.ts] > onInstalled', details)
  chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
    const existing = (result as Record<string, unknown>)[BLOCKED_COUNTRIES_KEY]

    if (!Array.isArray(existing)) {
      chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: DEFAULT_BLOCKED_COUNTRIES })
    }
  })

  chrome.contextMenus.create({
    id: 'open-options',
    title: 'Options',
    contexts: ['action'],
  })
})

chrome.contextMenus.onClicked.addListener((info) => {
  if (info.menuItemId === 'open-options') {
    chrome.tabs.create({ url: chrome.runtime.getURL('pages/options.html') })
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CLEAR_CACHE') {
    chrome.tabs.query({ url: ['*://*.x.com/*', '*://x.com/*', '*://*.twitter.com/*', '*://twitter.com/*'] }, (tabs) => {
      for (const tab of tabs) {
        if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_CACHE' })
      }
    })
  }
})








