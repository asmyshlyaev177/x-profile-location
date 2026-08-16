import {
  ACCOUNT_AGE_CHOICES,
  type AccountAgeFilter,
  DEFAULT_MIN_CONFIDENCE,
  defaultSetting,
  exportSettings,
  FILTER_RULES,
  type FilterRule,
  formatAgeChoice,
  type HideBlockedMode,
  importSettings,
  LOOKUP_LIMIT_PER_WINDOW,
  LOOKUP_WINDOW_MINUTES,
  MIN_CONFIDENCE_CHOICES,
  normalizeAccountAge,
  normalizeHandle,
  normalizeHideBlockedMode,
  normalizeMinConfidence,
  normalizeOptionsTab,
  normalizePrefetchShare,
  normalizeRuleExceptions,
  normalizeTheme,
  OPTIONS_TABS,
  type OptionsTabId,
  PREFETCH_SHARE_CHOICES,
  type PrefetchPacing,
  readSetting,
  type RuleExceptions,
  SETTINGS_KEYS,
  settingsFileName,
  SettingsImportError,
  type ThemePreference,
  withKeyword,
  withLocation,
  withoutLocation,
} from '../scripts/settings'
import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  MIN_CONFIDENCE_KEY,
  MSG,
  OPTIONS_TAB_KEY,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_ADVANCED_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
  THEME_KEY,
} from '../scripts/constants'
// The full settings page: five tabs, flat cards. Only the tab you were on is
// remembered (OPTIONS_TAB_KEY) — the accordions went with the popup split.

import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import {
  CANONICAL_LOCATIONS,
  flagFor,
  LOCATION_ALIASES,
  REGION_MEMBERS,
} from '../scripts/countries/countries'
import { KeywordAddRow, KeywordChips } from '../components/KeywordChips'
import { isMobile } from '../scripts/device'
import type { Keyword, MatchMode } from '../scripts/keywords'
import { isSharedCacheConfigured } from '../scripts/cache/shared-cache'
import {
  initI18n,
  nativeLanguageName,
  normalizeUiLanguage,
  t,
  UI_LANGUAGE_KEY,
  UI_LOCALES,
} from '../scripts/i18n'
import {
  aliasNote,
  localizedLocation,
  sortByLocalizedName,
  withLocalizedAliases,
} from '../scripts/countries/location-names'
import css from './options.module.css'
import { applyTheme, startThemeSync } from './theme'

const DEFAULT_FLAGS = defaultSetting(HIGHLIGHT_FLAGS_KEY)

// Thunks, so the language can change under the page — and still spelled
// `t('key')`, so messages.test.ts can see which keys the page uses.
const TAB_LABEL: Record<OptionsTabId, () => string> = {
  display: () => t('tabDisplay'),
  filters: () => t('tabFilters'),
  exceptions: () => t('tabExceptions'),
  data: () => t('tabData'),
  advanced: () => t('tabAdvanced'),
}

const RULE_LABEL: Record<FilterRule, () => string> = {
  highlight: () => t('ruleHighlight'),
  location: () => t('ruleLocation'),
  affiliation: () => t('ruleAffiliation'),
  age: () => t('ruleAge'),
}

/** The languages the picker offers, each in its own name. */
const LANGUAGE_CHOICES = UI_LOCALES.map((code) => ({
  code,
  name: nativeLanguageName(code),
})).sort((a, b) => a.name.localeCompare(b.name))

const KEYWORD_SUGGESTIONS = [
  'NAFO',
  'Free Palestine',
  '🏳️‍🌈',
  '🏳️‍⚧️',
  '🇵🇸',
  '🇺🇦',
  '🇷🇺',
  '🇮🇳',
  'he/him',
  'she/her',
  'he/them',
  'she/them',
  'they/them',
  'crypto',
  'nft',
  'trading',
  'forex',
  'airdrop',
  'web3',
  'defi',
  'giveaway',
  'investment',
  'onlyfans',
].sort((a, b) => a.localeCompare(b))

// --- layout pieces ----------------------------------------------------------
// Every section is a Card and every control a Setting, so the rhythm can't drift
// as settings are added — you find one by reading down the left edge.

function Card({
  title,
  description,
  children,
}: {
  title: string
  description?: ComponentChildren
  children: ComponentChildren
}) {
  return (
    <section class={css.card}>
      <div class={css.cardHead}>
        <h2 class={css.cardTitle}>{title}</h2>
        {description && <p class={css.cardDesc}>{description}</p>}
      </div>
      <div class={css.cardBody}>{children}</div>
    </section>
  )
}

/** One labelled control: text on the left, control on the right. */
function Setting({
  label,
  description,
  control,
  disabled,
  /** Off for `<select>`s: a wrapping label swallows the click that opens it. */
  clickable = true,
}: {
  label: string
  description?: ComponentChildren
  control: ComponentChildren
  disabled?: boolean
  clickable?: boolean
}) {
  const body = (
    <>
      <span class={css.settingMain}>
        <span class={css.settingLabel}>{label}</span>
        {description && <span class={css.settingDesc}>{description}</span>}
      </span>
      <span class={css.settingControl}>{control}</span>
    </>
  )
  const className = disabled
    ? `${css.setting} ${css.optionDisabled}`
    : css.setting
  return clickable ? (
    <label class={className}>{body}</label>
  ) : (
    <div class={className}>{body}</div>
  )
}

/** A full-width block — chip lists, autocompletes, button rows. */
function Stack({ children }: { children: ComponentChildren }) {
  return <div class={css.stack}>{children}</div>
}

// A settings page's branches are its settings. Getting under the threshold means
// five tab components, which a linter should not be the one to drive.
// oxlint-disable-next-line complexity
export function Options() {
  const [tab, setTab] = useState<OptionsTabId>('display')
  const [enabled, setEnabled] = useState(defaultSetting(EXTENSION_ENABLED_KEY))
  const [blocked, setBlocked] = useState<string[]>([])
  const [affiliations, setAffiliations] = useState<string[]>([])
  const [accountAge, setAccountAge] = useState<AccountAgeFilter>(
    defaultSetting(ACCOUNT_AGE_KEY),
  )
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [newKeywordMode, setNewKeywordMode] = useState<MatchMode>('word')
  const [flagsEnabled, setFlagsEnabled] = useState(DEFAULT_FLAGS.enabled)
  const [flagsThreshold, setFlagsThreshold] = useState(DEFAULT_FLAGS.threshold)
  const [flagsUniqueOnly, setFlagsUniqueOnly] = useState(
    DEFAULT_FLAGS.uniqueOnly,
  )
  const [showLocationInFeed, setShowLocationInFeed] = useState(
    defaultSetting(SHOW_LOCATION_IN_FEED_KEY),
  )
  const [showAccountCard, setShowAccountCard] = useState(
    defaultSetting(SHOW_ACCOUNT_CARD_KEY),
  )
  const [showShareButton, setShowShareButton] = useState(
    defaultSetting(SHOW_SHARE_BUTTON_KEY),
  )
  const [exceptions, setExceptions] = useState<RuleExceptions>(
    normalizeRuleExceptions(undefined),
  )
  const [exceptionFilter, setExceptionFilter] = useState('')
  const [alwaysShow, setAlwaysShow] = useState<string[]>([])
  const [showExceptionButton, setShowExceptionButton] = useState(
    defaultSetting(SHOW_EXCEPTION_BUTTON_KEY),
  )
  const [sharedCacheEnabled, setSharedCacheEnabled] = useState(
    defaultSetting(SHARED_CACHE_KEY),
  )
  const [prefetchEnabled, setPrefetchEnabled] = useState(
    defaultSetting(BACKGROUND_PREFETCH_KEY),
  )
  const [prefetchShare, setPrefetchShare] = useState(
    defaultSetting(PREFETCH_SHARE_KEY),
  )
  const [pacing, setPacing] = useState<PrefetchPacing>(
    defaultSetting(PREFETCH_PACING_KEY),
  )
  const [hideMode, setHideMode] = useState<HideBlockedMode>(
    defaultSetting(HIDE_BLOCKED_LOCATIONS_KEY),
  )
  const [cacheCleared, setCacheCleared] = useState(false)
  const [minConfidence, setMinConfidence] = useState(
    defaultSetting(MIN_CONFIDENCE_KEY),
  )
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [theme, setTheme] = useState<ThemePreference>('system')
  const [language, setLanguage] = useState<string>('')
  const [transferNote, setTransferNote] = useState<string | null>(null)
  const [transferError, setTransferError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // Once per mount: choosing a language reloads the page, and re-sorting 246
  // names per keystroke is the one place that would be felt.
  const pickerOptions = useMemo(
    () => sortByLocalizedName(CANONICAL_LOCATIONS),
    [],
  )
  const pickerAliases = useMemo(
    () => withLocalizedAliases(LOCATION_ALIASES),
    [],
  )

  async function handleClearCache() {
    await chrome.runtime.sendMessage({ type: MSG.CLEAR_CACHE })
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  useEffect(() => {
    chrome.storage.local
      // Every setting, plus the two pieces of page state that are not settings.
      .get([...SETTINGS_KEYS, OPTIONS_TAB_KEY, SHOW_ADVANCED_KEY])
      .then((result) => {
        setEnabled(readSetting(EXTENSION_ENABLED_KEY, result))
        setBlocked(readSetting(BLOCKED_COUNTRIES_KEY, result))
        setAffiliations(readSetting(BLOCKED_AFFILIATIONS_KEY, result))
        setAccountAge(readSetting(ACCOUNT_AGE_KEY, result))
        setKeywords(readSetting(HIGHLIGHT_KEYWORDS_KEY, result))
        const flags = readSetting(HIGHLIGHT_FLAGS_KEY, result)
        setFlagsEnabled(flags.enabled)
        setFlagsThreshold(flags.threshold)
        setFlagsUniqueOnly(flags.uniqueOnly)
        setShowLocationInFeed(readSetting(SHOW_LOCATION_IN_FEED_KEY, result))
        setShowAccountCard(readSetting(SHOW_ACCOUNT_CARD_KEY, result))
        setShowShareButton(readSetting(SHOW_SHARE_BUTTON_KEY, result))
        setExceptions(
          normalizeRuleExceptions(
            result[RULE_EXCEPTIONS_KEY],
            result[HIGHLIGHT_EXCEPTIONS_KEY],
          ),
        )
        setAlwaysShow(readSetting(ALWAYS_SHOW_KEY, result))
        setShowExceptionButton(readSetting(SHOW_EXCEPTION_BUTTON_KEY, result))
        setSharedCacheEnabled(readSetting(SHARED_CACHE_KEY, result))
        setPrefetchEnabled(readSetting(BACKGROUND_PREFETCH_KEY, result))
        setPrefetchShare(readSetting(PREFETCH_SHARE_KEY, result))
        setPacing(readSetting(PREFETCH_PACING_KEY, result))
        setHideMode(readSetting(HIDE_BLOCKED_LOCATIONS_KEY, result))
        setTab(normalizeOptionsTab(result[OPTIONS_TAB_KEY]))
        setMinConfidence(readSetting(MIN_CONFIDENCE_KEY, result))
        // Only the select's value: painting the page is startThemeSync's job,
        // below, which also keeps it in step with a second tab.
        setTheme(readSetting(THEME_KEY, result))
        setLanguage(normalizeUiLanguage(result[UI_LANGUAGE_KEY]))

        // `options.html?advanced=1` reveals it, `?advanced=0` hides it again.
        // Undiscoverable on purpose: a trade-off, not a preference.
        const param = new URLSearchParams(location.search).get('advanced')
        if (param === null) {
          setShowAdvanced(Boolean(result[SHOW_ADVANCED_KEY]))
        } else {
          const next = param !== '0'
          setShowAdvanced(next)
          chrome.storage.local.set({ [SHOW_ADVANCED_KEY]: next })
        }
      })
  }, [])

  useEffect(startThemeSync, [])

  function selectTab(next: OptionsTabId) {
    setTab(next)
    chrome.storage.local.set({ [OPTIONS_TAB_KEY]: next })
  }

  /**
   * Reloaded, not re-rendered: the name tables are built once per mount, and a
   * page showing two languages at once is worse than one that blinks.
   */
  function updateLanguage(next: string) {
    setLanguage(next)
    chrome.storage.local.set({ [UI_LANGUAGE_KEY]: next })
    setTimeout(() => location.reload(), 100)
  }

  function updateTheme(next: ThemePreference) {
    setTheme(next)
    // Painted here rather than left to the storage listener, so the page
    // changes under the select immediately instead of one round-trip later.
    applyTheme(next)
    chrome.storage.local.set({ [THEME_KEY]: next })
  }

  function editBlocked(next: string[]) {
    if (next === blocked) return
    setBlocked(next)
    chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: next })
  }

  function addAffiliation(handle: string) {
    const clean = normalizeHandle(handle)
    if (!clean || affiliations.includes(clean)) return
    const next = [...affiliations, clean].sort()
    setAffiliations(next)
    chrome.storage.local.set({ [BLOCKED_AFFILIATIONS_KEY]: next })
  }

  function removeAffiliation(handle: string) {
    const next = affiliations.filter((h) => h !== handle)
    setAffiliations(next)
    chrome.storage.local.set({ [BLOCKED_AFFILIATIONS_KEY]: next })
  }

  function updateAccountAge(patch: Partial<AccountAgeFilter>) {
    const next = normalizeAccountAge({ ...accountAge, ...patch })
    setAccountAge(next)
    chrome.storage.local.set({ [ACCOUNT_AGE_KEY]: next })
  }

  function editKeywords(next: Keyword[]) {
    if (next === keywords) return
    setKeywords(next)
    chrome.storage.local.set({ [HIGHLIGHT_KEYWORDS_KEY]: next })
  }

  /** Both keys, or a removal comes back from the stale copy — see content.tsx. */
  function writeExceptions(next: RuleExceptions) {
    setExceptions(next)
    chrome.storage.local.set({
      [RULE_EXCEPTIONS_KEY]: next,
      [HIGHLIGHT_EXCEPTIONS_KEY]: next.highlight,
    })
  }

  function addException(rule: FilterRule, name: string) {
    const handle = normalizeHandle(name)
    if (!handle || exceptions[rule].includes(handle)) return
    writeExceptions({
      ...exceptions,
      [rule]: [...exceptions[rule], handle].sort(),
    })
  }

  function removeException(rule: FilterRule, name: string) {
    writeExceptions({
      ...exceptions,
      [rule]: exceptions[rule].filter((u) => u !== name),
    })
  }

  function addAlwaysShow(name: string) {
    const handle = normalizeHandle(name)
    if (!handle || alwaysShow.includes(handle)) return
    const next = [...alwaysShow, handle].sort()
    setAlwaysShow(next)
    chrome.storage.local.set({ [ALWAYS_SHOW_KEY]: next })
  }

  function removeAlwaysShow(name: string) {
    const next = alwaysShow.filter((u) => u !== name)
    setAlwaysShow(next)
    chrome.storage.local.set({ [ALWAYS_SHOW_KEY]: next })
  }

  // Comes off a <select>, so it arrives as a string.
  function updateMinConfidence(value: string) {
    const next = normalizeMinConfidence(value)
    setMinConfidence(next)
    chrome.storage.local.set({ [MIN_CONFIDENCE_KEY]: next })
  }

  // Comes off a <select>, so it arrives as a string.
  function updatePrefetchShare(value: string) {
    const share = normalizePrefetchShare(value)
    setPrefetchShare(share)
    chrome.storage.local.set({ [PREFETCH_SHARE_KEY]: share })
  }

  function updatePacing(next: PrefetchPacing) {
    setPacing(next)
    chrome.storage.local.set({ [PREFETCH_PACING_KEY]: next })
  }

  function updateHideMode(mode: HideBlockedMode) {
    setHideMode(mode)
    chrome.storage.local.set({ [HIDE_BLOCKED_LOCATIONS_KEY]: mode })
  }

  function updateFlags(
    enabledNext: boolean,
    threshold: number,
    uniqueOnly: boolean,
  ) {
    setFlagsEnabled(enabledNext)
    setFlagsThreshold(threshold)
    setFlagsUniqueOnly(uniqueOnly)
    chrome.storage.local.set({
      [HIGHLIGHT_FLAGS_KEY]: { enabled: enabledNext, threshold, uniqueOnly },
    })
  }

  // --- import / export -------------------------------------------------------
  // An anchor and a file picker, not the `downloads` permission: one JSON file
  // is not worth a scarier install prompt for every user.
  async function handleExport() {
    const file = await exportSettings()
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = settingsFileName()
    a.click()
    URL.revokeObjectURL(url)
    setTransferError(false)
    setTransferNote(t('noteExported', Object.keys(file.settings).length))
  }

  async function handleImportFile(file: File) {
    try {
      const result = await importSettings(await file.text())
      setTransferError(false)
      setTransferNote(
        t('noteImported', result.applied.length) +
          (result.ignored.length
            ? ` ${t('noteImportedSkipped', result.ignored.length)}`
            : ''),
      )
      // The page reads storage once on mount, and re-deriving 20 pieces of
      // state by hand is how one of them ends up stale.
      setTimeout(() => location.reload(), 600)
    } catch (err) {
      setTransferError(true)
      setTransferNote(
        err instanceof SettingsImportError ? err.message : t('errImportFailed'),
      )
    }
  }

  // Prefetch feeds the community cache, so opting out switches the rest off.
  const cacheOff = isSharedCacheConfigured() && !sharedCacheEnabled

  // Spell the share out in lookups, which is what users actually feel.
  const shareLookups = Math.floor(LOOKUP_LIMIT_PER_WINDOW * prefetchShare)
  // What "spread" works out to: the window split across that many lookups.
  const spreadSeconds = Math.round(
    (LOOKUP_WINDOW_MINUTES * 60) / Math.max(1, shareLookups),
  )

  // Added to the dropdown rather than snapped onto a neighbour: snapping would
  // quietly move somebody's filter, and an unmatched <select> renders blank.
  const ageChoices = ACCOUNT_AGE_CHOICES.includes(
    accountAge.days as (typeof ACCOUNT_AGE_CHOICES)[number],
  )
    ? [...ACCOUNT_AGE_CHOICES]
    : [...ACCOUNT_AGE_CHOICES, accountAge.days].sort((a, b) => a - b)

  const exceptionQuery = exceptionFilter.trim().toLowerCase()
  // Its one setting only means anything with a cache server to tune.
  const visibleTabs = OPTIONS_TABS.filter(
    (id) => id !== 'advanced' || (showAdvanced && isSharedCacheConfigured()),
  )
  // ?advanced=0 while sitting on the advanced tab would otherwise leave the page
  // on a tab with no button and no content.
  const activeTab = visibleTabs.includes(tab) ? tab : 'display'

  function renderHandleChips(
    handles: string[],
    onRemove: (handle: string) => void,
  ) {
    if (handles.length === 0) return null
    return (
      <div class={`${css.chips} ${css.chipsScroll}`}>
        {handles.map((u) => (
          <span key={u} class={css.chip}>
            <a
              class={css.chipLink}
              href={`https://x.com/${u}`}
              target="_blank"
              rel="noopener noreferrer"
              title={t('openHandle', u)}
            >
              @{u}
            </a>
            <button
              class={css.chipRemove}
              onClick={() => onRemove(u)}
              title={t('removeHandle', u)}
            >
              ×
            </button>
          </span>
        ))}
      </div>
    )
  }

  return (
    <div class={css.container}>
      <header class={css.pageHeader}>
        <h1 class={css.title}>{t('optionsTitle')}</h1>
        <label class={css.masterSwitch}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => {
              const next = (e.target as HTMLInputElement).checked
              setEnabled(next)
              chrome.storage.local.set({ [EXTENSION_ENABLED_KEY]: next })
            }}
          />
          <span>{enabled ? t('optionsEnabled') : t('optionsPaused')}</span>
        </label>
      </header>

      {!enabled && <p class={css.pausedBanner}>{t('optionsPausedBanner')}</p>}

      <nav class={css.tabs} role="tablist">
        {visibleTabs.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            class={`${css.tab} ${activeTab === id ? css.tabActive : ''}`}
            onClick={() => selectTab(id)}
          >
            {TAB_LABEL[id]()}
          </button>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'display' && (
        <>
          <Card title={t('cardOnPage')} description={t('cardOnPageDesc')}>
            <Setting
              label={t('setShowInFeed')}
              description={t('setShowInFeedDesc')}
              control={
                <input
                  type="checkbox"
                  checked={showLocationInFeed}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setShowLocationInFeed(next)
                    chrome.storage.local.set({
                      [SHOW_LOCATION_IN_FEED_KEY]: next,
                    })
                  }}
                />
              }
            />

            <Setting
              label={t('setAccountCard')}
              description={t('setAccountCardDesc')}
              control={
                <input
                  type="checkbox"
                  checked={showAccountCard}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setShowAccountCard(next)
                    chrome.storage.local.set({ [SHOW_ACCOUNT_CARD_KEY]: next })
                  }}
                />
              }
            />

            <Setting
              label={t('setCopyButton')}
              description={t('setCopyButtonDesc')}
              control={
                <input
                  type="checkbox"
                  checked={showShareButton}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setShowShareButton(next)
                    chrome.storage.local.set({ [SHOW_SHARE_BUTTON_KEY]: next })
                  }}
                />
              }
            />

            <Setting
              label={t('setExceptionButton')}
              description={t('setExceptionButtonDesc')}
              control={
                <input
                  type="checkbox"
                  checked={showExceptionButton}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setShowExceptionButton(next)
                    chrome.storage.local.set({
                      [SHOW_EXCEPTION_BUTTON_KEY]: next,
                    })
                  }}
                />
              }
            />

            {isMobile && <p class={css.hint}>{t('hintSwipe')}</p>}
          </Card>

          <Card
            title={t('cardAppearance')}
            description={t('cardAppearanceDesc')}
          >
            <Setting
              label={t('setTheme')}
              clickable={false}
              control={
                <select
                  class={css.modeSelect}
                  value={theme}
                  onChange={(e) =>
                    updateTheme(
                      normalizeTheme((e.target as HTMLSelectElement).value),
                    )
                  }
                >
                  <option value="system">{t('themeSystem')}</option>
                  <option value="light">{t('themeLight')}</option>
                  <option value="dark">{t('themeDark')}</option>
                </select>
              }
            />

            {/* Each language named in itself, because somebody looking for
                their own language is not reading the current one. "Match
                browser" is the odd one out and is translated — whoever reads
                it has already found a language they understand. */}
            <Setting
              label={t('setLanguage')}
              description={t('setLanguageDesc')}
              clickable={false}
              control={
                <select
                  class={css.modeSelect}
                  value={language}
                  onChange={(e) =>
                    updateLanguage(
                      normalizeUiLanguage(
                        (e.target as HTMLSelectElement).value,
                      ),
                    )
                  }
                >
                  <option value="">{t('languageAuto')}</option>
                  {LANGUAGE_CHOICES.map(({ code, name }) => (
                    <option key={code} value={code}>
                      {name}
                    </option>
                  ))}
                </select>
              }
            />
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'filters' && (
        <>
          <Card title={t('cardKeyword')} description={t('cardKeywordDesc')}>
            <Stack>
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
                  id="keyword"
                  selected={keywords.map((kw) => kw.text)}
                  allOptions={KEYWORD_SUGGESTIONS}
                  onSelect={(kw) =>
                    editKeywords(withKeyword(keywords, kw, newKeywordMode))
                  }
                  placeholder={t('keywordPlaceholder')}
                  allowFreeInput
                  closeOnSelect={false}
                />
              </KeywordAddRow>

              {keywords.length === 0 && (
                <p class={css.empty}>{t('emptyNoKeywords')}</p>
              )}
            </Stack>
          </Card>

          <Card title={t('cardLocations')} description={t('cardLocationsDesc')}>
            <Stack>
              {blocked.length > 0 && (
                <div class={css.chips}>
                  {blocked.map((country) => {
                    const members = REGION_MEMBERS[country]
                    return (
                      <span key={country} class={css.chip}>
                        <span class={css.chipFlag}>{flagFor(country)}</span>
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
                id="country"
                selected={blocked}
                allOptions={pickerOptions}
                aliases={pickerAliases}
                onSelect={(name) => editBlocked(withLocation(blocked, name))}
                placeholder={t('locationPlaceholder')}
                renderOption={(c, alias) => {
                  const note = aliasNote(c, alias)
                  return (
                    <>
                      <span class={css.dropdownFlag}>{flagFor(c)}</span>
                      <span>{localizedLocation(c)}</span>
                      {REGION_MEMBERS[c] && (
                        <span class={css.dropdownAlias}>
                          {t('regionCountries', REGION_MEMBERS[c].length)}
                        </span>
                      )}
                      {note && <span class={css.dropdownAlias}>{note}</span>}
                    </>
                  )
                }}
              />

              {blocked.length === 0 && (
                <p class={css.empty}>{t('emptyNoLocations')}</p>
              )}
            </Stack>
          </Card>

          <Card title={t('cardFiltered')} description={t('cardFilteredDesc')}>
            <Setting
              label={t('filteredPosts')}
              clickable={false}
              control={
                <select
                  class={css.modeSelect}
                  value={hideMode}
                  onChange={(e) =>
                    updateHideMode(
                      normalizeHideBlockedMode(
                        (e.target as HTMLSelectElement).value,
                      ),
                    )
                  }
                >
                  <option value="off">{t('hideModeOff')}</option>
                  <option value="collapse">{t('hideModeCollapseLong')}</option>
                  <option value="hide">{t('hideModeHideLong')}</option>
                </select>
              }
            />
          </Card>

          <Card
            title={t('cardAffiliations')}
            description={t('cardAffiliationsDesc')}
          >
            <Stack>
              {renderHandleChips(affiliations, removeAffiliation)}

              <Autocomplete
                id="affiliation"
                selected={affiliations}
                allOptions={[]}
                onSelect={addAffiliation}
                placeholder={t('affiliationPlaceholder')}
                allowFreeInput
                closeOnSelect={false}
              />

              {affiliations.length === 0 && (
                <p class={css.empty}>{t('emptyNoAffiliations')}</p>
              )}
            </Stack>
          </Card>

          <Card title={t('cardAge')} description={t('cardAgeDesc')}>
            <Setting
              label={t('setMarkYoung')}
              description={t('setMarkYoungDesc')}
              control={
                <input
                  type="checkbox"
                  checked={accountAge.enabled}
                  onChange={(e) =>
                    updateAccountAge({
                      enabled: (e.target as HTMLInputElement).checked,
                    })
                  }
                />
              }
            />
            <Setting
              label={t('setMarkYoungerThan')}
              clickable={false}
              disabled={!accountAge.enabled}
              control={
                <select
                  class={css.modeSelect}
                  value={String(accountAge.days)}
                  disabled={!accountAge.enabled}
                  onChange={(e) =>
                    updateAccountAge({
                      days: Number((e.target as HTMLSelectElement).value),
                    })
                  }
                >
                  {ageChoices.map((days) => (
                    <option key={days} value={String(days)}>
                      {formatAgeChoice(days)}
                    </option>
                  ))}
                </select>
              }
            />
          </Card>

          <Card title={t('cardFlags')} description={t('cardFlagsDesc')}>
            <Setting
              label={t('setHighlightFlagHeavy')}
              control={
                <input
                  type="checkbox"
                  checked={flagsEnabled}
                  onChange={(e) =>
                    updateFlags(
                      (e.target as HTMLInputElement).checked,
                      flagsThreshold,
                      flagsUniqueOnly,
                    )
                  }
                />
              }
            />
            <Setting
              label={t('setFlagThreshold')}
              clickable={false}
              disabled={!flagsEnabled}
              control={
                <input
                  type="number"
                  class={css.numberInput}
                  value={flagsThreshold}
                  min={0}
                  max={20}
                  disabled={!flagsEnabled}
                  onInput={(e) =>
                    updateFlags(
                      flagsEnabled,
                      Math.max(0, Number((e.target as HTMLInputElement).value)),
                      flagsUniqueOnly,
                    )
                  }
                />
              }
            />
            <Setting
              label={t('setUniqueFlags')}
              disabled={!flagsEnabled}
              control={
                <input
                  type="checkbox"
                  checked={flagsUniqueOnly}
                  disabled={!flagsEnabled}
                  onChange={(e) =>
                    updateFlags(
                      flagsEnabled,
                      flagsThreshold,
                      (e.target as HTMLInputElement).checked,
                    )
                  }
                />
              }
            />
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'exceptions' && (
        <>
          <Card
            title={t('cardAlwaysShow')}
            description={t('cardAlwaysShowDesc')}
          >
            <Stack>
              {renderHandleChips(alwaysShow, removeAlwaysShow)}

              <Autocomplete
                id="always-show"
                selected={alwaysShow}
                allOptions={[]}
                onSelect={addAlwaysShow}
                placeholder={t('usernamePlaceholder')}
                allowFreeInput
                closeOnSelect={false}
              />

              {alwaysShow.length === 0 && (
                <p class={css.empty}>{t('emptyNoAllowlist')}</p>
              )}
            </Stack>
          </Card>

          <Card title={t('cardPerRule')} description={t('cardPerRuleDesc')}>
            <Stack>
              <input
                type="search"
                class={css.searchInput}
                value={exceptionFilter}
                onInput={(e) =>
                  setExceptionFilter((e.target as HTMLInputElement).value)
                }
                placeholder={t('searchExceptions')}
                aria-label={t('searchExceptionsLabel')}
              />

              {FILTER_RULES.map((rule) => {
                const shown = exceptionQuery
                  ? exceptions[rule].filter((u) => u.includes(exceptionQuery))
                  : exceptions[rule]
                return (
                  <div key={rule} class={css.ruleGroup}>
                    <h3 class={css.ruleTitle}>{RULE_LABEL[rule]()}</h3>
                    {renderHandleChips(shown, (u) => removeException(rule, u))}
                    {exceptions[rule].length > 0 && shown.length === 0 && (
                      <p class={css.empty}>
                        {t('emptyNoMatch', exceptionFilter)}
                      </p>
                    )}
                    {exceptions[rule].length === 0 && (
                      <p class={css.empty}>{t('emptyNoExceptions')}</p>
                    )}
                    <Autocomplete
                      id={`exception-${rule}`}
                      selected={exceptions[rule]}
                      allOptions={[]}
                      onSelect={(name) => addException(rule, name)}
                      placeholder={t('usernamePlaceholder')}
                      allowFreeInput
                      closeOnSelect={false}
                    />
                  </div>
                )
              })}
            </Stack>
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'data' && (
        <>
          <Card
            title={t('cardLookups')}
            description={t(
              'cardLookupsDesc',
              LOOKUP_LIMIT_PER_WINDOW,
              LOOKUP_WINDOW_MINUTES,
            )}
          >
            {isSharedCacheConfigured() && (
              <Setting
                label={t('setSharedCache')}
                description={t('setSharedCacheDesc')}
                control={
                  <input
                    type="checkbox"
                    checked={sharedCacheEnabled}
                    onChange={(e) => {
                      const next = (e.target as HTMLInputElement).checked
                      setSharedCacheEnabled(next)
                      chrome.storage.local.set({ [SHARED_CACHE_KEY]: next })
                    }}
                  />
                }
              />
            )}

            <Setting
              label={t('setPrefetch')}
              description={t('setPrefetchDesc')}
              disabled={cacheOff}
              control={
                <input
                  type="checkbox"
                  checked={prefetchEnabled}
                  disabled={cacheOff}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setPrefetchEnabled(next)
                    chrome.storage.local.set({
                      [BACKGROUND_PREFETCH_KEY]: next,
                    })
                  }}
                />
              }
            />

            <Setting
              label={t('setShare')}
              clickable={false}
              disabled={cacheOff || !prefetchEnabled}
              description={t(
                'setShareDesc',
                shareLookups,
                LOOKUP_LIMIT_PER_WINDOW - shareLookups,
              )}
              control={
                <select
                  class={css.modeSelect}
                  value={String(prefetchShare)}
                  disabled={cacheOff || !prefetchEnabled}
                  onChange={(e) =>
                    updatePrefetchShare((e.target as HTMLSelectElement).value)
                  }
                >
                  {PREFETCH_SHARE_CHOICES.map((share) => (
                    <option key={share} value={String(share)}>
                      {Math.round(share * 100)}%
                    </option>
                  ))}
                </select>
              }
            />

            <Setting
              label={t('setSpread', LOOKUP_WINDOW_MINUTES)}
              description={t('setSpreadDesc', spreadSeconds)}
              disabled={cacheOff || !prefetchEnabled}
              control={
                <input
                  type="checkbox"
                  checked={pacing === 'spread'}
                  disabled={cacheOff || !prefetchEnabled}
                  onChange={(e) =>
                    updatePacing(
                      (e.target as HTMLInputElement).checked
                        ? 'spread'
                        : 'instant',
                    )
                  }
                />
              }
            />
          </Card>

          <Card title={t('cardBackup')} description={t('cardBackupDesc')}>
            <Stack>
              <div class={css.buttonRow}>
                <button class={css.secondaryBtn} onClick={handleExport}>
                  {t('btnExport')}
                </button>
                <button
                  class={css.secondaryBtn}
                  onClick={() => fileInput.current?.click()}
                >
                  {t('btnImport')}
                </button>
                <input
                  ref={fileInput}
                  type="file"
                  accept="application/json,.json"
                  class={css.hiddenInput}
                  onChange={(e) => {
                    const input = e.target as HTMLInputElement
                    const file = input.files?.[0]
                    // Cleared so picking the same file twice fires again.
                    input.value = ''
                    if (file) void handleImportFile(file)
                  }}
                />
              </div>
              {transferNote && (
                <p class={transferError ? css.errorNote : css.hint}>
                  {transferNote}
                </p>
              )}
              <p class={css.hint}>{t('hintImportMerge')}</p>
            </Stack>
          </Card>

          <Card title={t('cardCache')} description={t('cardCacheDesc')}>
            <Stack>
              <div class={css.buttonRow}>
                <button
                  class={css.dangerBtn}
                  onClick={handleClearCache}
                  disabled={cacheCleared}
                >
                  {cacheCleared ? t('btnCacheCleared') : t('btnClearCache')}
                </button>
              </div>
            </Stack>
          </Card>
        </>
      )}

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'advanced' &&
        showAdvanced &&
        isSharedCacheConfigured() && (
          <Card
            title={t('cardTrust')}
            description={t('cardTrustDesc', DEFAULT_MIN_CONFIDENCE)}
          >
            <Setting
              label={t('setTrustAfter')}
              clickable={false}
              disabled={cacheOff}
              control={
                <select
                  class={css.modeSelect}
                  value={String(minConfidence)}
                  disabled={cacheOff}
                  onChange={(e) =>
                    updateMinConfidence((e.target as HTMLSelectElement).value)
                  }
                >
                  {MIN_CONFIDENCE_CHOICES.map((n) => (
                    <option key={n} value={String(n)}>
                      {t(`trustReports${n}`)}
                    </option>
                  ))}
                </select>
              }
            />
          </Card>
        )}
    </div>
  )
}

void initI18n().then(() => render(<Options />, document.body))
