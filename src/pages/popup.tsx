// The toolbar popup: the handful of switches worth flipping mid-scroll.
//
// Split out from the options page, which until now served both. One component
// rendered into a ~350px popup *and* a full settings tab is why the options
// page could not grow — every control added had to stay legible in a panel the
// size of a phone screen. With Phase 2 roughly doubling the number of settings
// that stopped being workable.
//
// The rule for what lives here: things you change *while reading X* and want to
// see take effect immediately. Everything you set up once and forget lives in
// the tab, one click away.

import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import {
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  type HideBlockedMode,
  normalizeHideBlockedMode,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from '../scripts/countries'
import css from './popup.module.css'

/**
 * Open the settings page and then close the popup.
 *
 * Two things this has to get right, both of which broke it before:
 *
 * 1. `openOptionsPage()` needs `options_ui` in the manifest or it rejects with
 *    "No Options page defined". That key now exists; `chrome.tabs.create` stays
 *    as the fallback for anywhere it doesn't (and it needs no permission — only
 *    *reading* tab properties does).
 * 2. `window.close()` must not run synchronously after the call. Closing the
 *    popup tears down this page's context, and the open can be cancelled with
 *    it — so the click appears to do nothing at all.
 */
async function openOptions() {
  try {
    if (chrome.runtime.openOptionsPage) {
      await chrome.runtime.openOptionsPage()
    } else {
      await chrome.tabs.create({
        url: chrome.runtime.getURL('pages/options.html'),
      })
    }
  } catch {
    await chrome.tabs.create({
      url: chrome.runtime.getURL('pages/options.html'),
    })
  }
  window.close()
}

export function Popup() {
  const [enabled, setEnabled] = useState(true)
  const [inFeed, setInFeed] = useState(false)
  const [accountCard, setAccountCard] = useState(true)
  const [hideMode, setHideMode] = useState<HideBlockedMode>('collapse')
  const [cleared, setCleared] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    chrome.storage.local
      .get([
        EXTENSION_ENABLED_KEY,
        SHOW_LOCATION_IN_FEED_KEY,
        SHOW_ACCOUNT_CARD_KEY,
        HIDE_BLOCKED_LOCATIONS_KEY,
      ])
      .then((r) => {
        setEnabled(
          EXTENSION_ENABLED_KEY in r ? Boolean(r[EXTENSION_ENABLED_KEY]) : true,
        )
        setInFeed(Boolean(r[SHOW_LOCATION_IN_FEED_KEY]))
        setAccountCard(
          SHOW_ACCOUNT_CARD_KEY in r ? Boolean(r[SHOW_ACCOUNT_CARD_KEY]) : true,
        )
        setHideMode(normalizeHideBlockedMode(r[HIDE_BLOCKED_LOCATIONS_KEY]))
        setLoaded(true)
      })
  }, [])

  function write(key: string, value: unknown) {
    chrome.storage.local.set({ [key]: value })
  }

  async function clearCache() {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' })
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  return (
    <div class={css.popup}>
      <header class={css.header}>
        <span class={css.brand}>X-Pat</span>
        <label class={css.masterSwitch} title="Turn everything off for now">
          <input
            type="checkbox"
            checked={enabled}
            disabled={!loaded}
            onChange={(e) => {
              const next = (e.target as HTMLInputElement).checked
              setEnabled(next)
              write(EXTENSION_ENABLED_KEY, next)
            }}
          />
          <span>{enabled ? 'On' : 'Off'}</span>
        </label>
      </header>

      {!enabled && (
        <p class={css.offNotice}>
          Paused. X looks exactly as it would with the extension uninstalled.
        </p>
      )}

      <div class={enabled ? undefined : css.dimmed}>
        <label class={css.row}>
          <input
            type="checkbox"
            checked={inFeed}
            disabled={!enabled}
            onChange={(e) => {
              const next = (e.target as HTMLInputElement).checked
              setInFeed(next)
              write(SHOW_LOCATION_IN_FEED_KEY, next)
            }}
          />
          <span>Flags in the feed 📍</span>
        </label>

        <label class={css.row}>
          <input
            type="checkbox"
            checked={accountCard}
            disabled={!enabled}
            onChange={(e) => {
              const next = (e.target as HTMLInputElement).checked
              setAccountCard(next)
              write(SHOW_ACCOUNT_CARD_KEY, next)
            }}
          />
          <span>Account details on hover 🪪</span>
        </label>

        <label class={css.selectRow}>
          <span>Filtered posts</span>
          <select
            value={hideMode}
            disabled={!enabled}
            onChange={(e) => {
              const next = normalizeHideBlockedMode(
                (e.target as HTMLSelectElement).value,
              )
              setHideMode(next)
              write(HIDE_BLOCKED_LOCATIONS_KEY, next)
            }}
          >
            <option value="off">Show normally</option>
            <option value="collapse">Collapse</option>
            <option value="hide">Hide</option>
          </select>
        </label>
      </div>

      <footer class={css.footer}>
        <button class={css.linkBtn} onClick={() => void openOptions()}>
          All settings →
        </button>
        <button class={css.linkBtn} onClick={clearCache} disabled={cleared}>
          {cleared ? 'Cache cleared' : 'Clear cache'}
        </button>
      </footer>
    </div>
  )
}

render(<Popup />, document.body)
