import {
  defaultSetting,
  type HideBlockedMode,
  normalizeHideBlockedMode,
  normalizePopupSection,
  normalizeRatePrompt,
  normalizeUsageStats,
  type PopupSection,
  readSetting,
  withKeyword,
  withLocation,
} from '../scripts/settings'
import {
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  POPUP_SECTION_KEY,
  RATE_PROMPT_KEY,
  REGION_EXCLUSIONS_KEY,
  SHARED_CACHE_COUNT_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  USAGE_STATS_KEY,
} from '../scripts/constants'
// The toolbar popup. What lives here: things you change while reading X and want
// to see take effect at once. Everything set up once lives in the options tab.

import type { ComponentChildren } from 'preact'
import { render } from 'preact'
import { useEffect, useMemo, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import { KeywordAddRow, KeywordChips } from '../components/KeywordChips'
import { LocationChips } from '../components/LocationChips'
import {
  CANONICAL_LOCATIONS,
  flagFor,
  LOCATION_ALIASES,
  type RegionExclusions,
  REGION_MEMBERS,
} from '../scripts/countries/countries'
import {
  COUNT_POLL_MS,
  isSharedCacheConfigured,
  refreshCacheCount,
  rememberedCount,
} from '../scripts/cache/shared-cache'
import type { Keyword, MatchMode } from '../scripts/keywords'
import {
  REVIEW_URL,
  setRatePromptState,
  shouldAskForRating,
} from '../scripts/usage'
import { initI18n, t, uiLocale } from '../scripts/i18n'
import {
  aliasNote,
  localizedLocation,
  sortByLocalizedName,
  withLocalizedAliases,
} from '../scripts/countries/location-names'
import css from './popup.module.css'
import { startThemeSync } from './theme'

function write(key: string, value: unknown) {
  chrome.storage.local.set({ [key]: value })
}

/** Crypto donations, via NOWPayments. */
const DONATE_URL = 'https://nowpayments.io/donation/asmyshlyaev177'

/**
 * `openOptionsPage()` needs `options_ui` in the manifest, and `window.close()`
 * must not run synchronously after it — that cancels the open it just asked for.
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
 * A button and a body, not `<details>`: `<details open>` fires `toggle` as it
 * mounts, so restoring a remembered section wrote it straight back to storage.
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

/** Days the extension was used, not days since install. See usage.ts. */
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
  // Read-only here: the member picker is the options page's.
  const [exclusions, setExclusions] = useState<RegionExclusions>({})
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [newKeywordMode, setNewKeywordMode] = useState<MatchMode>('word')
  const [section, setSection] = useState<PopupSection | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [askRating, setAskRating] = useState(false)
  const [sharedCache, setSharedCache] = useState(
    defaultSetting(SHARED_CACHE_KEY),
  )
  const [cacheCount, setCacheCount] = useState<number | null>(null)

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
        REGION_EXCLUSIONS_KEY,
        HIGHLIGHT_KEYWORDS_KEY,
        POPUP_SECTION_KEY,
        USAGE_STATS_KEY,
        RATE_PROMPT_KEY,
        SHARED_CACHE_KEY,
        SHARED_CACHE_COUNT_KEY,
      ])
      .then((r) => {
        setEnabled(readSetting(EXTENSION_ENABLED_KEY, r))
        setInFeed(readSetting(SHOW_LOCATION_IN_FEED_KEY, r))
        setAccountCard(readSetting(SHOW_ACCOUNT_CARD_KEY, r))
        setHideMode(readSetting(HIDE_BLOCKED_LOCATIONS_KEY, r))
        setBlocked(readSetting(BLOCKED_COUNTRIES_KEY, r))
        setExclusions(readSetting(REGION_EXCLUSIONS_KEY, r))
        setKeywords(readSetting(HIGHLIGHT_KEYWORDS_KEY, r))
        setSection(normalizePopupSection(r[POPUP_SECTION_KEY]))
        setSharedCache(readSetting(SHARED_CACHE_KEY, r))
        // Last time anyone asked, so the line is already there when the panel
        // paints rather than appearing under the cursor a moment later.
        setCacheCount(rememberedCount(r))
        setAskRating(
          shouldAskForRating(
            normalizeUsageStats(r[USAGE_STATS_KEY]),
            normalizeRatePrompt(r[RATE_PROMPT_KEY]),
          ),
        )
        setLoaded(true)
      })
  }, [])

  // The one thing in this panel that costs a request, so it asks only while the
  // panel is open — and keeps asking, because the number belongs to everyone
  // using the cache and moves while you are looking at it. What keeps that from
  // being a load on the server is in shared-cache.ts, above COUNT_POLL_MS.
  //
  // Held back until `loaded`: the defaults say the cache is on, and asking on
  // those before storage answers would query a server the user opted out of.
  useEffect(() => {
    if (!loaded || !enabled || !sharedCache || !isSharedCacheConfigured()) {
      return
    }
    let stopped = false
    const ask = async () => {
      // The Android build opens this page as a tab, which can sit in the
      // background for hours; a popup proper is only ever visible.
      if (document.visibilityState !== 'visible') return
      const n = await refreshCacheCount()
      if (!stopped && n !== null) setCacheCount(n)
    }
    void ask()
    const timer = setInterval(() => void ask(), COUNT_POLL_MS)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [loaded, enabled, sharedCache])

  // The same keys the options page writes, which the content script is already
  // listening on — so an edit lands on the timeline behind the popup.
  function editBlocked(next: string[]) {
    if (next === blocked) return
    setBlocked(next)
    write(BLOCKED_COUNTRIES_KEY, next)
  }

  function editExclusions(next: RegionExclusions) {
    setExclusions(next)
    write(REGION_EXCLUSIONS_KEY, next)
  }

  function editKeywords(next: Keyword[]) {
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
          <LocationChips
            blocked={blocked}
            exclusions={exclusions}
            classes={{
              chips: css.chips,
              chip: css.chip,
              flag: css.chipFlag,
              remove: css.chipRemove,
            }}
            onBlocked={editBlocked}
            onExclusions={editExclusions}
          />

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
                  <span class={css.dropdownFlag}>{flagFor(c)}</span>
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
          <KeywordChips
            keywords={keywords}
            classes={{
              chips: css.chips,
              chip: `${css.chip} ${css.chipKeyword}`,
              remove: css.chipRemove,
            }}
            onChange={editKeywords}
          />

          <KeywordAddRow mode={newKeywordMode} onMode={setNewKeywordMode}>
            <Autocomplete
              id="popup-keyword"
              selected={keywords.map((kw) => kw.text)}
              allOptions={[]}
              onSelect={(kw) =>
                editKeywords(withKeyword(keywords, kw, newKeywordMode))
              }
              placeholder={t('popupKeywordPlaceholder')}
              allowFreeInput
              closeOnSelect={false}
            />
          </KeywordAddRow>

          {keywords.length === 0 && (
            <p class={css.empty}>{t('popupNoKeywords')}</p>
          )}
        </Section>
      </div>

      {/* Not while paused, and not to someone who turned the shared cache off:
          both of them have said they want nothing from it. */}
      {cacheCount !== null && enabled && sharedCache && (
        <p class={css.cacheCount} title={t('popupCacheCountTitle')}>
          {t('popupCacheCount', cacheCount.toLocaleString(uiLocale()))}
        </p>
      )}

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
