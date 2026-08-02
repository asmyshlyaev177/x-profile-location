import { BLOCKED_COUNTRIES_KEY, DEFAULT_BLOCKED_COUNTRIES } from './countries'

chrome.runtime.onInstalled.addListener((details): void => {
  console.log('[service-worker.ts] > onInstalled', details)
  chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
    const existing = (result as Record<string, unknown>)[BLOCKED_COUNTRIES_KEY]

    if (!Array.isArray(existing)) {
      chrome.storage.local.set({
        [BLOCKED_COUNTRIES_KEY]: DEFAULT_BLOCKED_COUNTRIES,
      })
    }
  })

  // No hand-made "Options" entry on the action menu: declaring `options_ui` in
  // the manifest makes the browser add one itself, and ours sat right next to
  // it saying the same word.

  // Sharing lives in the context menu rather than as a button on every post.
  // A per-post button is a permanent piece of clutter bought for something
  // people do rarely, and the right-click menu is where "do something with
  // this thing" already lives. Scoped to X so it never appears anywhere else.
  chrome.contextMenus.create({
    id: 'share-post',
    title: 'Copy post with location flags',
    contexts: ['page', 'selection', 'link', 'image'],
    documentUrlPatterns: [
      '*://*.x.com/*',
      '*://x.com/*',
      '*://*.twitter.com/*',
      '*://twitter.com/*',
    ],
  })
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'share-post' && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'SHARE_POST' })
  }
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CLEAR_CACHE') {
    chrome.tabs.query(
      {
        url: [
          '*://*.x.com/*',
          '*://x.com/*',
          '*://*.twitter.com/*',
          '*://twitter.com/*',
        ],
      },
      (tabs) => {
        for (const tab of tabs) {
          if (tab.id != null)
            chrome.tabs.sendMessage(tab.id, { type: 'CLEAR_CACHE' })
        }
      },
    )
  }
})
