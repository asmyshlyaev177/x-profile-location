import {
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  MSG,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RATE_PROMPT_KEY,
  USAGE_STATS_KEY,
  X_TAB_PATTERNS,
} from './constants'
import { DEFAULT_BLOCKED_COUNTRIES } from './countries/countries'
import {
  type BrokerSnapshot,
  LookupBroker,
  type LookupReport,
  type TabState,
} from './prefetch/lookup-broker'
import type {
  PacingOptions,
  PrefetchCandidate,
} from './prefetch/prefetch-queue'
import { readSetting } from './settings'
import { ratingAskDue } from './usage'
import { initI18n, readCatalogue, t, UI_LANGUAGE_KEY } from './i18n'

// Gated on exactly the condition the popup card and the in-page bar use, so a
// badge never invites a click onto a popup with nothing in it.
const RATING_BADGE = '★'

async function syncRatingBadge(): Promise<void> {
  // Paused means quiet everywhere — the popup hides the card too.
  const stored = (await chrome.storage.local.get(
    EXTENSION_ENABLED_KEY,
  )) as Record<string, unknown>
  const due =
    readSetting(EXTENSION_ENABLED_KEY, stored) && (await ratingAskDue())

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
  if (changes[PREFETCH_SHARE_KEY] || changes[PREFETCH_PACING_KEY]) {
    void applyPacingSettings()
  }
})

/** Removes first because `create` throws on a duplicate id, and this re-runs. */
async function createShareMenu(): Promise<void> {
  await initI18n()
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    id: 'share-post',
    title: t('menuSharePost'),
    contexts: ['page', 'selection', 'link', 'image'],
    documentUrlPatterns: [...X_TAB_PATTERNS],
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
    chrome.tabs.sendMessage(tab.id, { type: MSG.SHARE_POST })
  }
})

// The content script cannot read `_locales/` without exposing it to x.com, so
// it asks here instead. See "Localization" in CLAUDE.md.
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === MSG.GET_MESSAGES) {
    readCatalogue(String(message.locale))
      .then(sendResponse)
      .catch(() => sendResponse(null))
    return true // reply is async
  }
  return undefined
})

// ---------------------------------------------------------------------------
// Cross-tab lookup broker
// ---------------------------------------------------------------------------
const BROKER_KEY = 'lookupBroker'

let broker: LookupBroker | null = null

async function pacingSettings(): Promise<PacingOptions> {
  const stored = (await chrome.storage.local.get([
    PREFETCH_SHARE_KEY,
    PREFETCH_PACING_KEY,
  ])) as Record<string, unknown>
  return {
    reserveFraction: readSetting(PREFETCH_SHARE_KEY, stored),
    pacing: readSetting(PREFETCH_PACING_KEY, stored),
  }
}

/**
 * Module state does not survive the ~30s idle teardown, so every entry point
 * reads the queue back before touching it. `storage.session` is memory-only:
 * nothing here reaches disk, and a browser restart starts over.
 */
async function loadBroker(): Promise<LookupBroker> {
  if (broker) return broker
  const stored = await chrome.storage.session.get(BROKER_KEY)
  const restored = LookupBroker.from(stored[BROKER_KEY] as BrokerSnapshot)
  restored.setPacing(await pacingSettings())
  broker = restored
  return restored
}

// Awaited before the handler answers, never left as a floating promise: the
// worker can be torn down the moment it goes idle, and a write that did not
// land is a queue that never drains.
async function saveBroker(state: LookupBroker): Promise<void> {
  await chrome.storage.session.set({ [BROKER_KEY]: state.toJSON() })
}

async function applyPacingSettings(): Promise<void> {
  const state = await loadBroker()
  state.setPacing(await pacingSettings())
  await saveBroker(state)
}

async function broadcast(messages: unknown[]): Promise<void> {
  const tabs = await chrome.tabs.query({ url: [...X_TAB_PATTERNS] })
  await Promise.all(
    tabs.flatMap((tab) =>
      tab.id == null
        ? []
        : messages.map((message) =>
            // A tab whose content script has not attached yet rejects; that is
            // not an error, it simply has nothing to redraw.
            chrome.tabs.sendMessage(tab.id!, message).catch(() => undefined),
          ),
    ),
  )
}

interface BrokerMessage {
  type: string
  tab?: TabState
  candidates?: PrefetchCandidate[]
  /** Cached handles the tab is willing to ask X about again. */
  revalidate?: string[]
  report?: LookupReport
}

const BROKER_TYPES = new Set<string>([MSG.ENQUEUE, MSG.NEXT, MSG.REPORT])

async function handleBrokerMessage(
  message: BrokerMessage,
  tabId: number,
): Promise<unknown> {
  const state = await loadBroker()
  const tab = message.tab ?? { focused: false, visible: true }
  let answer: unknown = null

  if (message.type === MSG.ENQUEUE) {
    state.enqueue(tabId, message.candidates ?? [], tab)
    state.offerRevalidation(message.revalidate ?? [])
  } else if (message.type === MSG.NEXT) {
    answer = state.next(tabId, tab)
  } else if (message.report) {
    state.report(message.report)
  }

  await saveBroker(state)
  if (message.type === MSG.REPORT) await announce(state, message.report)
  return answer
}

/** Every tab learns what the window costs, and who now has an answer. */
async function announce(
  state: LookupBroker,
  report: LookupReport | undefined,
): Promise<void> {
  const messages: unknown[] = [{ type: MSG.RATE, rate: state.rateSnapshot() }]
  if (report?.spent && report.ok) {
    messages.push({ type: MSG.RESOLVED, userName: report.userName })
  }
  await broadcast(messages)
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!BROKER_TYPES.has(message?.type)) return undefined
  const tabId = sender.tab?.id
  if (tabId == null) return undefined

  handleBrokerMessage(message as BrokerMessage, tabId).then(sendResponse, () =>
    sendResponse(null),
  )
  return true // reply is async
})

chrome.tabs.onRemoved.addListener((tabId) => {
  void (async () => {
    const state = await loadBroker()
    state.dropTab(tabId)
    await saveBroker(state)
  })()
})

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.CLEAR_CACHE) {
    void (async () => {
      // Everything is worth asking about again — the answers just went away.
      const state = await loadBroker()
      state.forgetAsked()
      await saveBroker(state)
      await broadcast([{ type: MSG.CLEAR_CACHE }])
    })()
  }
  return undefined
})
