import {
  BLOCKED_COUNTRIES_KEY,
  DEFAULT_BLOCKED_COUNTRIES,
  EXTENSION_ENABLED_KEY,
  RATE_PROMPT_KEY,
  USAGE_STATS_KEY,
} from './countries'
import { ratingAskDue } from './usage'
import { initI18n, readCatalogue, t, UI_LANGUAGE_KEY } from './i18n'

// ---------------------------------------------------------------------------
// The rating ask, in the browser chrome
// ---------------------------------------------------------------------------
// The quietest of the three surfaces and the only permanent one: a mark on the
// toolbar icon, which is where the popup holding the actual ask already lives.
// It costs no permission (`action` is declared) and touches no page.
//
// Gated on exactly the condition the popup card and the in-page bar use, so the
// three never disagree — a badge inviting a click that opens a popup with
// nothing in it is worse than no badge at all.
const RATING_BADGE = '★'

async function syncRatingBadge(): Promise<void> {
  // Paused means quiet everywhere: the popup hides the card while paused, so a
  // badge left up would be an invitation to open a popup with nothing in it.
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
  // The context menu's title is drawn once, when the menu is created, so a
  // language change has to go back and redraw it.
  if (changes[UI_LANGUAGE_KEY]) void createShareMenu()
})

/**
 * The share entry in x.com's right-click menu.
 *
 * `create` throws on a duplicate id rather than replacing, so this removes
 * first — it runs again whenever the language changes, not only on install.
 * Sharing lives here rather than as a button on every post: a per-post button
 * is permanent clutter bought for something people do rarely, and the
 * right-click menu is where "do something with this thing" already lives.
 * Scoped to X so it never appears anywhere else.
 */
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

  // No hand-made "Options" entry on the action menu: declaring `options_ui` in
  // the manifest makes the browser add one itself, and ours sat right next to
  // it saying the same word.
  void createShareMenu()
})

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'share-post' && tab?.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'SHARE_POST' })
  }
})

// The content script cannot read `_locales/` itself: `fetch` on an extension
// URL from x.com needs the file in `web_accessible_resources`, and a fetchable
// extension URL is something the page can probe for. So it asks here, where
// reading our own files costs nothing and exposes nothing.
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
