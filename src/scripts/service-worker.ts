import {
  BLOCKED_COUNTRIES_KEY,
  DEFAULT_BLOCKED_COUNTRIES,
  EXTENSION_ENABLED_KEY,
  RATE_PROMPT_KEY,
  USAGE_STATS_KEY,
} from './countries'
import { ratingAskDue } from './usage'
import { initI18n, readCatalogue, t, UI_LANGUAGE_KEY } from './i18n'

// Gated on exactly the condition the popup card and the in-page bar use, so a
// badge never invites a click onto a popup with nothing in it.
const RATING_BADGE = '★'

async function syncRatingBadge(): Promise<void> {
  // Paused means quiet everywhere — the popup hides the card too.
  const { [EXTENSION_ENABLED_KEY]: enabled } = await chrome.storage.local.get(
    EXTENSION_ENABLED_KEY,
  )
  const due = enabled !== false && (await ratingAskDue())

  await chrome.action.setBadgeText({ text: due ? RATING_BADGE : '' })
  if (due) {
    await chrome.action.setBadgeBackgroundColor({ color: '#1d9bf0' })
  }
}

// Badge text survives a service-worker restart but not a browser one.
chrome.runtime.onStartup.addListener(() => void syncRatingBadge())

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (
    changes[USAGE_STATS_KEY] ||
    changes[RATE_PROMPT_KEY] ||
    changes[EXTENSION_ENABLED_KEY]
  ) {
    void syncRatingBadge()
  }
  // The menu title is drawn once at create time, so a language change redraws it.
  if (changes[UI_LANGUAGE_KEY]) void createShareMenu()
})

/** Removes first because `create` throws on a duplicate id, and this re-runs. */
async function createShareMenu(): Promise<void> {
  await initI18n()
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    id: 'share-post',
    title: t('menuSharePost'),
    contexts: ['page', 'selection', 'link', 'image'],
    documentUrlPatterns: [
      '*://*.x.com/*',
      '*://x.com/*',
      '*://*.twitter.com/*',
      '*://twitter.com/*',
    ],
  })
}

chrome.runtime.onInstalled.addListener((details): void => {
  console.log('[service-worker.ts] > onInstalled', details)
  void syncRatingBadge()
  chrome.storage.local.get(BLOCKED_COUNTRIES_KEY).then((result) => {
    const existing = (result as Record<string, unknown>)[BLOCKED_COUNTRIES_KEY]

    if (!Array.isArray(existing)) {
      chrome.storage.local.set({
        [BLOCKED_COUNTRIES_KEY]: DEFAULT_BLOCKED_COUNTRIES,
      })
    }
  })

  // No hand-made "Options" entry: `options_ui` makes the browser add its own.
  void createShareMenu()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'share-post' && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'SHARE_POST' })
  }
})

// The content script cannot read `_locales/` without exposing it to x.com, so
// it asks here instead. See "Localization" in CLAUDE.md.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_MESSAGES') {
    readCatalogue(String(message.locale))
      .then(sendResponse)
      .catch(() => sendResponse(null))
    return true // reply is async
  }
  return undefined
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
