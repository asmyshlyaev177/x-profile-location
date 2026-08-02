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

import type { ComponentChildren } from 'preact'
import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import {
  BLOCKED_COUNTRIES_KEY,
  canonicalLocation,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  type HideBlockedMode,
  LOCATION_ALIASES,
  normalizeHideBlockedMode,
  normalizePopupSection,
  POPUP_SECTION_KEY,
  type PopupSection,
  REGION_FLAGS,
  REGION_MEMBERS,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from '../scripts/countries'
import css from './popup.module.css'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }

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

/**
 * One collapsible filter list.
 *
 * A real accordion — opening one closes the other — because two open list
 * editors is already more than this panel has room for, and the switches above
 * them are the reason most people opened it.
 *
 * A button and a conditional body rather than `<details>`/`<summary>`, which
 * this was first. Two reasons, and the first is a behaviour bug rather than a
 * matter of taste: a `<details open>` fires `toggle` as it mounts, so restoring
 * the remembered section wrote that section straight back to storage — the
 * popup saved on every open, and the one thing it must never do is treat being
 * looked at as being edited. The second is that happy-dom does not implement
 * summary-click toggling at all, which left the accordion untestable. Owning
 * the open state costs an `aria-expanded` and a chevron.
 */
function Section({
  id,
  title,
  count,
  open,
  onOpen,
  children,
}: {
  id: PopupSection
  title: string
  count: number
  open: boolean
  onOpen: (id: PopupSection | null) => void
  children: ComponentChildren
}) {
  return (
    <div class={css.section}>
      <button
        type="button"
        class={css.summary}
        aria-expanded={open}
        aria-controls={`popup-section-${id}`}
        onClick={() => onOpen(open ? null : id)}
      >
        <span class={css.chevron} aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span class={css.summaryTitle}>{title}</span>
        {/* Blank rather than "0": an empty list has nothing to report, and this
            is the only thing a collapsed section can say about itself. */}
        <span class={css.count}>{count > 0 ? count : ''}</span>
      </button>
      {open && (
        <div class={css.sectionBody} id={`popup-section-${id}`}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Popup() {
  const [enabled, setEnabled] = useState(true)
  const [inFeed, setInFeed] = useState(false)
  const [accountCard, setAccountCard] = useState(true)
  const [hideMode, setHideMode] = useState<HideBlockedMode>('collapse')
  const [blocked, setBlocked] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [section, setSection] = useState<PopupSection | null>(null)
  const [cleared, setCleared] = useState(false)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    chrome.storage.local
      .get([
        EXTENSION_ENABLED_KEY,
        SHOW_LOCATION_IN_FEED_KEY,
        SHOW_ACCOUNT_CARD_KEY,
        HIDE_BLOCKED_LOCATIONS_KEY,
        BLOCKED_COUNTRIES_KEY,
        HIGHLIGHT_KEYWORDS_KEY,
        POPUP_SECTION_KEY,
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
        setBlocked(
          Array.isArray(r[BLOCKED_COUNTRIES_KEY])
            ? (r[BLOCKED_COUNTRIES_KEY] as string[])
            : [],
        )
        setKeywords(
          Array.isArray(r[HIGHLIGHT_KEYWORDS_KEY])
            ? (r[HIGHLIGHT_KEYWORDS_KEY] as string[])
            : [],
        )
        setSection(normalizePopupSection(r[POPUP_SECTION_KEY]))
        setLoaded(true)
      })
  }, [])

  function write(key: string, value: unknown) {
    chrome.storage.local.set({ [key]: value })
  }

  // The same writes the options page makes, to the same keys — the content
  // script is already listening on them, so an edit here lands on the timeline
  // behind the popup without it being reopened.
  function addBlocked(name: string) {
    const country = canonicalLocation(name)
    if (blocked.includes(country)) return
    const next = [...blocked, country]
    setBlocked(next)
    write(BLOCKED_COUNTRIES_KEY, next)
  }

  function removeBlocked(country: string) {
    const next = blocked.filter((c) => c !== country)
    setBlocked(next)
    write(BLOCKED_COUNTRIES_KEY, next)
  }

  function addKeyword(kw: string) {
    const trimmed = kw.trim().toLowerCase()
    if (!trimmed || keywords.includes(trimmed)) return
    const next = [...keywords, trimmed].sort()
    setKeywords(next)
    write(HIGHLIGHT_KEYWORDS_KEY, next)
  }

  function removeKeyword(kw: string) {
    const next = keywords.filter((k) => k !== kw)
    setKeywords(next)
    write(HIGHLIGHT_KEYWORDS_KEY, next)
  }

  function openSection(next: PopupSection | null) {
    setSection(next)
    write(POPUP_SECTION_KEY, next)
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

        <Section
          id="locations"
          title="Blocked locations"
          count={blocked.length}
          open={section === 'locations'}
          onOpen={openSection}
        >
          {blocked.length > 0 && (
            <div class={css.chips}>
              {blocked.map((country) => {
                const members = REGION_MEMBERS[country]
                return (
                  <span key={country} class={css.chip}>
                    <span class={css.chipFlag}>
                      {ALL_FLAGS[country] ?? '🌐'}
                    </span>
                    {country}
                    {members && (
                      <span class={css.chipNote} title={members.join(', ')}>
                        +{members.length}
                      </span>
                    )}
                    <button
                      class={css.chipRemove}
                      onClick={() => removeBlocked(country)}
                      title={`Remove ${country}`}
                    >
                      ×
                    </button>
                  </span>
                )
              })}
            </div>
          )}

          <Autocomplete
            id="popup-country"
            selected={blocked}
            allOptions={CANONICAL_LOCATIONS}
            aliases={LOCATION_ALIASES}
            onSelect={addBlocked}
            placeholder="Country or region…"
            renderOption={(c, alias) => (
              <>
                <span class={css.dropdownFlag}>{ALL_FLAGS[c] ?? '🌐'}</span>
                <span>{c}</span>
                {REGION_MEMBERS[c] && (
                  <span class={css.dropdownNote}>
                    +{REGION_MEMBERS[c].length}
                  </span>
                )}
                {alias && <span class={css.dropdownNote}>{alias}</span>}
              </>
            )}
          />

          {blocked.length === 0 && (
            <p class={css.empty}>Nothing blocked — all flags shown as-is.</p>
          )}
        </Section>

        <Section
          id="keywords"
          title="Highlight keywords"
          count={keywords.length}
          open={section === 'keywords'}
          onOpen={openSection}
        >
          {keywords.length > 0 && (
            <div class={css.chips}>
              {keywords.map((kw) => (
                <span key={kw} class={`${css.chip} ${css.chipKeyword}`}>
                  {kw}
                  <button
                    class={css.chipRemove}
                    onClick={() => removeKeyword(kw)}
                    title={`Remove ${kw}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <Autocomplete
            id="popup-keyword"
            selected={keywords}
            allOptions={[]}
            onSelect={addKeyword}
            placeholder="Add a keyword…"
            allowFreeInput
            closeOnSelect={false}
          />

          {keywords.length === 0 && (
            <p class={css.empty}>No keywords — nothing is highlighted.</p>
          )}
        </Section>
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
