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
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import {
  BLOCKED_COUNTRIES_KEY,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  type HideBlockedMode,
  LOCATION_ALIASES,
  normalizeHideBlockedMode,
  normalizePopupSection,
  normalizeRatePrompt,
  normalizeUsageStats,
  POPUP_SECTION_KEY,
  type PopupSection,
  RATE_PROMPT_KEY,
  REGION_FLAGS,
  REGION_MEMBERS,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  USAGE_STATS_KEY,
} from '../scripts/countries'
import {
  REVIEW_URL,
  setRatePromptState,
  shouldAskForRating,
} from '../scripts/usage'
import {
  defaultSetting,
  readSetting,
  withKeyword,
  withLocation,
  withoutKeyword,
  withoutLocation,
} from '../scripts/settings'
import { initI18n, t } from '../scripts/i18n'
import {
  aliasNote,
  localizedLocation,
  sortByLocalizedName,
  withLocalizedAliases,
} from '../scripts/location-names'
import css from './popup.module.css'
import { startThemeSync } from './theme'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }

function write(key: string, value: unknown) {
  chrome.storage.local.set({ [key]: value })
}

/** Crypto donations, via NOWPayments. */
const DONATE_URL = 'https://nowpayments.io/donation/asmyshlyaev177'

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

/**
 * The one thing this extension asks for, and it asks once.
 *
 * It waits for `RATE_PROMPT_MIN_DAYS` separate days on which the content script
 * actually put a flag on screen (see `usage.ts`) rather than days since install,
 * and both answers are final in the sense that matters: "Later" is a two-week
 * snooze, "No thanks" never comes back. Nothing here is a modal or an overlay
 * on X — it lives in a panel the user opened themselves.
 */
function RatePrompt({ onAnswer }: { onAnswer: () => void }) {
  return (
    <div class={css.rate}>
      <p class={css.rateText}>{t('rateAskText')}</p>
      <div class={css.rateActions}>
        <a
          class={css.rateBtn}
          href={REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            void setRatePromptState('done')
            onAnswer()
          }}
        >
          {t('rateAskYes')}
        </a>
        <button
          class={css.linkBtn}
          onClick={() => {
            void setRatePromptState('later')
            onAnswer()
          }}
        >
          {t('rateAskLater')}
        </button>
        <button
          class={css.linkBtn}
          onClick={() => {
            void setRatePromptState('done')
            onAnswer()
          }}
        >
          {t('rateAskNo')}
        </button>
      </div>
    </div>
  )
}

export function Popup() {
  const [enabled, setEnabled] = useState(defaultSetting(EXTENSION_ENABLED_KEY))
  const [inFeed, setInFeed] = useState(
    defaultSetting(SHOW_LOCATION_IN_FEED_KEY),
  )
  const [accountCard, setAccountCard] = useState(
    defaultSetting(SHOW_ACCOUNT_CARD_KEY),
  )
  const [hideMode, setHideMode] = useState<HideBlockedMode>(
    defaultSetting(HIDE_BLOCKED_LOCATIONS_KEY),
  )
  const [blocked, setBlocked] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [section, setSection] = useState<PopupSection | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [askRating, setAskRating] = useState(false)

  // Once per mount — see the same pair in options.tsx. A popup cannot outlive
  // a language change: choosing one happens on the settings page.
  const pickerOptions = useMemo(
    () => sortByLocalizedName(CANONICAL_LOCATIONS),
    [],
  )
  const pickerAliases = useMemo(
    () => withLocalizedAliases(LOCATION_ALIASES),
    [],
  )

  // The popup has no theme control of its own — it is set once in the options
  // page and every extension page follows it.
  useEffect(startThemeSync, [])

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
        USAGE_STATS_KEY,
        RATE_PROMPT_KEY,
      ])
      .then((r) => {
        setEnabled(readSetting(EXTENSION_ENABLED_KEY, r))
        setInFeed(readSetting(SHOW_LOCATION_IN_FEED_KEY, r))
        setAccountCard(readSetting(SHOW_ACCOUNT_CARD_KEY, r))
        setHideMode(readSetting(HIDE_BLOCKED_LOCATIONS_KEY, r))
        setBlocked(readSetting(BLOCKED_COUNTRIES_KEY, r))
        setKeywords(readSetting(HIGHLIGHT_KEYWORDS_KEY, r))
        setSection(normalizePopupSection(r[POPUP_SECTION_KEY]))
        setAskRating(
          shouldAskForRating(
            normalizeUsageStats(r[USAGE_STATS_KEY]),
            normalizeRatePrompt(r[RATE_PROMPT_KEY]),
          ),
        )
        setLoaded(true)
      })
  }, [])

  // The same writes the options page makes, to the same keys — the content
  // script is already listening on them, so an edit here lands on the timeline
  // behind the popup without it being reopened.
  function editBlocked(next: string[]) {
    if (next === blocked) return
    setBlocked(next)
    write(BLOCKED_COUNTRIES_KEY, next)
  }

  function editKeywords(next: string[]) {
    if (next === keywords) return
    setKeywords(next)
    write(HIGHLIGHT_KEYWORDS_KEY, next)
  }

  function openSection(next: PopupSection | null) {
    setSection(next)
    write(POPUP_SECTION_KEY, next)
  }

  return (
    <div class={css.popup}>
      <header class={css.header}>
        <span class={css.brand}>X-Pat</span>
        <label class={css.masterSwitch} title={t('popupMasterSwitchTitle')}>
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
          <span>{enabled ? t('popupOn') : t('popupOff')}</span>
        </label>
      </header>

      {!enabled && <p class={css.offNotice}>{t('popupPaused')}</p>}

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
          <span>{t('popupFlagsInFeed')}</span>
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
          <span>{t('popupAccountDetails')}</span>
        </label>

        <label class={css.selectRow}>
          <span>{t('filteredPosts')}</span>
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
            <option value="off">{t('hideModeOff')}</option>
            <option value="collapse">{t('hideModeCollapse')}</option>
            <option value="hide">{t('hideModeHide')}</option>
          </select>
        </label>

        <Section
          id="locations"
          title={t('ruleLocation')}
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
                    {localizedLocation(country)}
                    {members && (
                      <span class={css.chipNote} title={members.join(', ')}>
                        +{members.length}
                      </span>
                    )}
                    <button
                      class={css.chipRemove}
                      onClick={() =>
                        editBlocked(withoutLocation(blocked, country))
                      }
                      title={t('removeItem', localizedLocation(country))}
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
            allOptions={pickerOptions}
            aliases={pickerAliases}
            onSelect={(name) => editBlocked(withLocation(blocked, name))}
            placeholder={t('popupCountryPlaceholder')}
            renderOption={(c, alias) => {
              const note = aliasNote(c, alias)
              return (
                <>
                  <span class={css.dropdownFlag}>{ALL_FLAGS[c] ?? '🌐'}</span>
                  <span>{localizedLocation(c)}</span>
                  {REGION_MEMBERS[c] && (
                    <span class={css.dropdownNote}>
                      +{REGION_MEMBERS[c].length}
                    </span>
                  )}
                  {note && <span class={css.dropdownNote}>{note}</span>}
                </>
              )
            }}
          />

          {blocked.length === 0 && (
            <p class={css.empty}>{t('popupNothingBlocked')}</p>
          )}
        </Section>

        <Section
          id="keywords"
          title={t('popupHighlightKeywords')}
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
                    onClick={() => editKeywords(withoutKeyword(keywords, kw))}
                    title={t('removeItem', kw)}
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
            onSelect={(kw) => editKeywords(withKeyword(keywords, kw))}
            placeholder={t('popupKeywordPlaceholder')}
            allowFreeInput
            closeOnSelect={false}
          />

          {keywords.length === 0 && (
            <p class={css.empty}>{t('popupNoKeywords')}</p>
          )}
        </Section>
      </div>

      {/* Not while paused. Someone who has just switched it off is answering a
          different question, and the ask keeps — `status` stays 'idle'. */}
      {askRating && enabled && (
        <RatePrompt onAnswer={() => setAskRating(false)} />
      )}

      <footer class={css.footer}>
        {/* The one control in this footer that leads somewhere people
            actually need — given weight to match, since the two beside it are
            things you do once and never again. */}
        <button class={css.settingsBtn} onClick={() => void openOptions()}>
          {t('popupAllSettings')}
        </button>
        {/* Permanent, unlike the card above: the card is a request and goes
            away once answered, this is just the way to the listing for anyone
            who goes looking. Clicking counts as answered — somebody who has
            been to the review page should not be asked again later. */}
        <a
          class={css.linkBtn}
          href={REVIEW_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('popupRateTitle')}
          onClick={() => {
            void setRatePromptState('done')
            setAskRating(false)
          }}
        >
          {t('popupRate')}
        </a>
        <a
          class={css.linkBtn}
          href={DONATE_URL}
          target="_blank"
          rel="noopener noreferrer"
          title={t('popupDonateTitle')}
        >
          {t('popupDonate')}
        </a>
      </footer>
    </div>
  )
}

void initI18n().then(() => render(<Popup />, document.body))
