// The full settings page.
//
// Five tabs, flat cards inside them. There used to be `<details>` accordions
// here, inherited from when this same component was also the toolbar popup and
// everything had to fit in ~350px. Once the popup moved to popup.tsx that
// constraint went away, and folding a four-line section behind a click on a
// page with room to spare only made settings harder to find — so the accordions
// (and the storage that remembered which were open) are gone.
//
// The one piece of UI state still worth remembering is which tab you were on,
// since that is a real choice about where you were working. It lives in
// OPTIONS_TAB_KEY.

import { render } from 'preact'
import type { ComponentChildren } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import {
  ACCOUNT_AGE_CHOICES,
  ACCOUNT_AGE_KEY,
  formatAgeChoice,
  type AccountAgeFilter,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  canonicalLocation,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  DEFAULT_PREFETCH_SHARE,
  EXTENSION_ENABLED_KEY,
  type FilterRule,
  HIDE_BLOCKED_LOCATIONS_KEY,
  type HideBlockedMode,
  normalizeAccountAge,
  normalizeHandle,
  normalizeHandleList,
  normalizeHideBlockedMode,
  normalizeOptionsTab,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  normalizeRuleExceptions,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  LOCATION_ALIASES,
  LOOKUP_LIMIT_PER_WINDOW,
  LOOKUP_WINDOW_MINUTES,
  DEFAULT_MIN_CONFIDENCE,
  MIN_CONFIDENCE_CHOICES,
  MIN_CONFIDENCE_KEY,
  normalizeMinConfidence,
  SHOW_ADVANCED_KEY,
  OPTIONS_TAB_KEY,
  type OptionsTabId,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_CHOICES,
  PREFETCH_SHARE_KEY,
  type PrefetchPacing,
  REGION_FLAGS,
  REGION_MEMBERS,
  RULE_EXCEPTIONS_KEY,
  type RuleExceptions,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_SHARE_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from '../scripts/countries'
import { isMobile } from '../scripts/device'
import { isSharedCacheConfigured } from '../scripts/shared-cache'
import {
  exportSettings,
  importSettings,
  SettingsImportError,
  settingsFileName,
} from '../scripts/settings'
import css from './options.module.css'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }

const dedupe = (values: string[]) => [...new Set(values)]

const TAB_LABELS: Record<OptionsTabId, string> = {
  display: 'Display',
  filters: 'Filters',
  exceptions: 'Exceptions',
  data: 'Data & privacy',
  advanced: 'Advanced',
}

const RULE_LABELS: Record<FilterRule, string> = {
  highlight: 'Keyword / flag highlighting',
  location: 'Blocked locations',
  affiliation: 'Blocked affiliations',
  age: 'Account age',
}

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
// Three small components, and the reason the page stays consistent: every
// section is a Card, every control is a Setting or lives in a Stack. The rhythm
// can't drift as settings get added, which is what makes the page scannable —
// you find a setting by reading down the left edge.

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
  /**
   * Wraps the row in a <label> so clicking anywhere on it hits the control.
   * Off for `<select>`s: a label wrapping a select swallows the click that
   * should be opening the dropdown.
   */
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

export function Options() {
  const [tab, setTab] = useState<OptionsTabId>('display')
  const [enabled, setEnabled] = useState(true)
  const [blocked, setBlocked] = useState<string[]>([])
  const [affiliations, setAffiliations] = useState<string[]>([])
  const [accountAge, setAccountAge] = useState<AccountAgeFilter>(
    normalizeAccountAge(undefined),
  )
  const [keywords, setKeywords] = useState<string[]>([])
  const [flagsEnabled, setFlagsEnabled] = useState(false)
  const [flagsThreshold, setFlagsThreshold] = useState(2)
  const [flagsUniqueOnly, setFlagsUniqueOnly] = useState(true)
  const [showLocationInFeed, setShowLocationInFeed] = useState(false)
  const [showAccountCard, setShowAccountCard] = useState(true)
  const [showShareButton, setShowShareButton] = useState(true)
  const [exceptions, setExceptions] = useState<RuleExceptions>(
    normalizeRuleExceptions(undefined),
  )
  const [exceptionFilter, setExceptionFilter] = useState('')
  const [alwaysShow, setAlwaysShow] = useState<string[]>([])
  const [showExceptionButton, setShowExceptionButton] = useState(true)
  const [sharedCacheEnabled, setSharedCacheEnabled] = useState(true)
  const [prefetchEnabled, setPrefetchEnabled] = useState(true)
  const [prefetchShare, setPrefetchShare] = useState(DEFAULT_PREFETCH_SHARE)
  const [pacing, setPacing] = useState<PrefetchPacing>('spread')
  const [hideMode, setHideMode] = useState<HideBlockedMode>('off')
  const [cacheCleared, setCacheCleared] = useState(false)
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [transferNote, setTransferNote] = useState<string | null>(null)
  const [transferError, setTransferError] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  async function handleClearCache() {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' })
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  useEffect(() => {
    chrome.storage.local
      .get([
        EXTENSION_ENABLED_KEY,
        BLOCKED_COUNTRIES_KEY,
        BLOCKED_AFFILIATIONS_KEY,
        ACCOUNT_AGE_KEY,
        HIGHLIGHT_KEYWORDS_KEY,
        HIGHLIGHT_FLAGS_KEY,
        SHOW_LOCATION_IN_FEED_KEY,
        SHOW_ACCOUNT_CARD_KEY,
        SHOW_SHARE_BUTTON_KEY,
        HIGHLIGHT_EXCEPTIONS_KEY,
        RULE_EXCEPTIONS_KEY,
        ALWAYS_SHOW_KEY,
        SHOW_EXCEPTION_BUTTON_KEY,
        SHARED_CACHE_KEY,
        HIDE_BLOCKED_LOCATIONS_KEY,
        BACKGROUND_PREFETCH_KEY,
        PREFETCH_SHARE_KEY,
        PREFETCH_PACING_KEY,
        OPTIONS_TAB_KEY,
        MIN_CONFIDENCE_KEY,
        SHOW_ADVANCED_KEY,
      ])
      .then((result) => {
        setEnabled(
          EXTENSION_ENABLED_KEY in result
            ? Boolean(result[EXTENSION_ENABLED_KEY])
            : true,
        )
        // Folded through the alias table so a list saved before an alias
        // existed ('Czech Republic', 'Czechia') shows as one chip, matching
        // what the content script blocks.
        setBlocked(
          dedupe(
            ((result[BLOCKED_COUNTRIES_KEY] as string[] | undefined) ?? []).map(
              canonicalLocation,
            ),
          ),
        )
        setAffiliations(normalizeHandleList(result[BLOCKED_AFFILIATIONS_KEY]))
        setAccountAge(normalizeAccountAge(result[ACCOUNT_AGE_KEY]))
        setKeywords(
          (result[HIGHLIGHT_KEYWORDS_KEY] as string[] | undefined) ?? [],
        )
        const flags = result[HIGHLIGHT_FLAGS_KEY] as
          | { enabled?: boolean; threshold?: number; uniqueOnly?: boolean }
          | undefined
        setFlagsEnabled(flags?.enabled ?? false)
        setFlagsThreshold(flags?.threshold ?? 2)
        setFlagsUniqueOnly(flags?.uniqueOnly ?? true)
        setShowLocationInFeed(Boolean(result[SHOW_LOCATION_IN_FEED_KEY]))
        setShowAccountCard(
          SHOW_ACCOUNT_CARD_KEY in result
            ? Boolean(result[SHOW_ACCOUNT_CARD_KEY])
            : true,
        )
        setShowShareButton(
          SHOW_SHARE_BUTTON_KEY in result
            ? Boolean(result[SHOW_SHARE_BUTTON_KEY])
            : true,
        )
        setExceptions(
          normalizeRuleExceptions(
            result[RULE_EXCEPTIONS_KEY],
            result[HIGHLIGHT_EXCEPTIONS_KEY],
          ),
        )
        setAlwaysShow(normalizeHandleList(result[ALWAYS_SHOW_KEY]))
        setShowExceptionButton(
          SHOW_EXCEPTION_BUTTON_KEY in result
            ? Boolean(result[SHOW_EXCEPTION_BUTTON_KEY])
            : true,
        )
        setSharedCacheEnabled(
          SHARED_CACHE_KEY in result ? Boolean(result[SHARED_CACHE_KEY]) : true,
        )
        setPrefetchEnabled(
          BACKGROUND_PREFETCH_KEY in result
            ? Boolean(result[BACKGROUND_PREFETCH_KEY])
            : true,
        )
        setPrefetchShare(normalizePrefetchShare(result[PREFETCH_SHARE_KEY]))
        setPacing(normalizePrefetchPacing(result[PREFETCH_PACING_KEY]))
        setHideMode(
          normalizeHideBlockedMode(result[HIDE_BLOCKED_LOCATIONS_KEY]),
        )
        setTab(normalizeOptionsTab(result[OPTIONS_TAB_KEY]))
        setMinConfidence(normalizeMinConfidence(result[MIN_CONFIDENCE_KEY]))

        // The advanced tab is revealed by opening the options page as
        // `options.html?advanced=1` (and hidden again with `?advanced=0`), then
        // remembered. Deliberately undiscoverable from the UI: the setting it
        // holds is a documented trade-off rather than a preference, and it
        // needs the reasoning in server/README.md to mean anything. A URL
        // parameter costs the normal page nothing and is easy to talk someone
        // through in a bug report.
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

  function selectTab(next: OptionsTabId) {
    setTab(next)
    chrome.storage.local.set({ [OPTIONS_TAB_KEY]: next })
  }

  function addBlocked(name: string) {
    const country = canonicalLocation(name)
    if (blocked.includes(country)) return
    const next = [...blocked, country]
    setBlocked(next)
    chrome.storage.local.set({ [BLOCKED_COUNTRIES_KEY]: next })
  }

  function removeBlocked(country: string) {
    const next = blocked.filter((c) => c !== country)
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

  function addKeyword(kw: string) {
    const trimmed = kw.trim().toLowerCase()
    if (!trimmed || keywords.includes(trimmed)) return
    const next = [...keywords, trimmed].sort()
    setKeywords(next)
    chrome.storage.local.set({ [HIGHLIGHT_KEYWORDS_KEY]: next })
  }

  function removeKeyword(kw: string) {
    const next = keywords.filter((k) => k !== kw.trim().toLowerCase())
    setKeywords(next)
    chrome.storage.local.set({ [HIGHLIGHT_KEYWORDS_KEY]: next })
  }

  /**
   * Write the whole exception record.
   *
   * The old highlight-only key is written alongside it as a mirror of the
   * highlight bucket: reads merge the two, so writing only the new one would
   * let a removal come straight back from the stale copy. Same reasoning as
   * writeHighlightExceptions in content.tsx — the two have to agree.
   */
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
  // A download and a file picker rather than the `downloads` permission: asking
  // for a new permission to save one JSON file would cost every user a scarier
  // install prompt for something an anchor already does.
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
    setTransferNote(
      `Exported ${Object.keys(file.settings).length} settings. The shared-cache id and your cached locations are not included.`,
    )
  }

  async function handleImportFile(file: File) {
    try {
      const result = await importSettings(await file.text())
      setTransferError(false)
      setTransferNote(
        `Imported ${result.applied.length} settings.` +
          (result.ignored.length
            ? ` ${result.ignored.length} unknown key(s) were skipped.`
            : ''),
      )
      // Simplest honest way to show every control at its new value: the page
      // reads storage once on mount, and re-deriving 20 pieces of state by hand
      // is how one of them ends up stale.
      setTimeout(() => location.reload(), 600)
    } catch (err) {
      setTransferError(true)
      setTransferNote(
        err instanceof SettingsImportError
          ? err.message
          : 'That file could not be imported.',
      )
    }
  }

  // Background prefetch feeds the community cache, so opting out of the cache
  // switches the rest of the section off. Without a server configured the
  // toggle isn't rendered at all and so can't gate anything.
  const cacheOff = isSharedCacheConfigured() && !sharedCacheEnabled

  // Spell the share out in lookups, which is what users actually feel.
  const shareLookups = Math.floor(LOOKUP_LIMIT_PER_WINDOW * prefetchShare)
  // What "spread" works out to: the window split across that many lookups.
  const spreadSeconds = Math.round(
    (LOOKUP_WINDOW_MINUTES * 60) / Math.max(1, shareLookups),
  )

  // A stored threshold the list doesn't offer — hand-edited, or saved before
  // the choices changed — is added to the dropdown rather than snapped onto a
  // neighbour. Snapping would quietly widen or narrow a filter the user set on
  // purpose, and a <select> whose value matches no option just renders blank.
  const ageChoices = ACCOUNT_AGE_CHOICES.includes(
    accountAge.days as (typeof ACCOUNT_AGE_CHOICES)[number],
  )
    ? [...ACCOUNT_AGE_CHOICES]
    : [...ACCOUNT_AGE_CHOICES, accountAge.days].sort((a, b) => a - b)

  const exceptionQuery = exceptionFilter.trim().toLowerCase()
  // The Advanced tab holds exactly one setting, and that setting only means
  // anything when there is a cache server to tune. Without one the tab would be
  // an empty room, so it isn't offered at all.
  const visibleTabs = (Object.keys(TAB_LABELS) as OptionsTabId[]).filter(
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
              title={`Open @${u} on X`}
            >
              @{u}
            </a>
            <button
              class={css.chipRemove}
              onClick={() => onRemove(u)}
              title={`Remove @${u}`}
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
        <h1 class={css.title}>X-Pat settings</h1>
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
          <span>{enabled ? 'Enabled' : 'Paused'}</span>
        </label>
      </header>

      {!enabled && (
        <p class={css.pausedBanner}>
          Paused — nothing below is being applied to X right now.
        </p>
      )}

      <nav class={css.tabs} role="tablist">
        {visibleTabs.map((id) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            class={`${css.tab} ${activeTab === id ? css.tabActive : ''}`}
            onClick={() => selectTab(id)}
          >
            {TAB_LABELS[id]}
          </button>
        ))}
      </nav>

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'display' && (
        <Card
          title="On the page"
          description="What X-Pat draws on X. None of this changes which posts are filtered."
        >
          <Setting
            label="Show location in feed"
            description="A flag under every name in the timeline, not only on hover."
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
            label="Show account details on hover"
            description="Account age, affiliate badge, verification, handle changes and follower count — read from data X already sent, so it costs no extra lookups."
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
            label="“Copy” button on hover cards"
            description="A small “Copy” button in the flags row. Copies the post you hovered from, together with the flags, as an image — rendered in your browser, nothing uploaded. Right-clicking a post does the same thing."
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
            label="Exception button on hover cards"
            description="A one-click exemption for the account you are looking at, from whichever rules are acting on it — the keyword highlight, the country, the affiliate badge, the age. Its tooltip says which."
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

          {isMobile && (
            <p class={css.hint}>
              👉 Swipe right on any post to fetch its location.
            </p>
          )}
        </Card>
      )}

      {/* ---------------------------------------------------------------- */}
      {activeTab === 'filters' && (
        <>
          <Card
            title="Highlight by keyword"
            description="Marks posts whose author's name or bio contains any of these. Highlighting marks a post; it never hides one."
          >
            <Stack>
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
                id="keyword"
                selected={keywords}
                allOptions={KEYWORD_SUGGESTIONS}
                onSelect={addKeyword}
                placeholder="Type a keyword or pick a suggestion…"
                allowFreeInput
                closeOnSelect={false}
              />

              {keywords.length === 0 && (
                <p class={css.empty}>
                  No keywords set — all posts shown normally.
                </p>
              )}
            </Stack>
          </Card>

          <Card
            title="Locations"
            description="These show ⚠️ instead of their flag. Goes by the store country, or the account location when it isn't flagged as VPN. Never applies to the post you opened."
          >
            <Stack>
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
                id="country"
                selected={blocked}
                allOptions={CANONICAL_LOCATIONS}
                aliases={LOCATION_ALIASES}
                onSelect={addBlocked}
                placeholder="Search countries and regions — name, code or nickname…"
                renderOption={(c, alias) => (
                  <>
                    <span class={css.dropdownFlag}>{ALL_FLAGS[c] ?? '🌐'}</span>
                    <span>{c}</span>
                    {REGION_MEMBERS[c] && (
                      <span class={css.dropdownAlias}>
                        region · {REGION_MEMBERS[c].length} countries
                      </span>
                    )}
                    {alias && <span class={css.dropdownAlias}>{alias}</span>}
                  </>
                )}
              />

              {blocked.length === 0 && (
                <p class={css.empty}>
                  No locations selected — all flags shown as-is.
                </p>
              )}
            </Stack>
          </Card>

          <Card
            title="What happens to a filtered post"
            description="Applies to the two filters that take a post away — blocked locations and blocked affiliations. Account age and keyword highlighting mark a post whatever this is set to. A quoted post is collapsed on its own, so the post quoting it stays readable, and people lists are marked rather than hidden — removing rows there breaks the counts."
          >
            <Setting
              label="Filtered posts"
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
                  <option value="off">Show normally</option>
                  <option value="collapse">Collapse (“Show” to open)</option>
                  <option value="hide">Hide completely</option>
                </select>
              }
            />
          </Card>

          <Card
            title="Affiliations"
            description="X badges some accounts as belonging to an organisation. Enter the parent account's handle to filter every account badged with it at once."
          >
            <Stack>
              {renderHandleChips(affiliations, removeAffiliation)}

              <Autocomplete
                id="affiliation"
                selected={affiliations}
                allOptions={[]}
                onSelect={addAffiliation}
                placeholder="Parent account handle, e.g. nasa…"
                allowFreeInput
                closeOnSelect={false}
              />

              {affiliations.length === 0 && (
                <p class={css.empty}>
                  No affiliations blocked. Hover an account to see whether it
                  carries a badge.
                </p>
              )}
            </Stack>
          </Card>

          <Card
            title="Account age"
            description="How long the account has existed, from the creation date X reports. This one marks posts and never hides them, whatever the setting above says."
          >
            <Setting
              label="Mark young accounts"
              description="Marks their posts the same way a keyword match does, with the orange bar down the side. It stops there on purpose: a young account is the strongest single signal for a bought or farmed one, and it is also exactly what somebody who joined last month looks like — too thin an excuse to take their replies away."
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
              label="Mark accounts younger than"
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

          <Card
            title="Highlight by flags"
            description="Marks posts whose author's bio is full of flag emoji."
          >
            <Setting
              label="Highlight flag-heavy bios"
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
              label="More than this many flags"
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
              label="Count only unique flags"
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
            title="Always show"
            description="Exempt from every rule at once — never hidden, never collapsed, never highlighted, whatever the filters say."
          >
            <Stack>
              {renderHandleChips(alwaysShow, removeAlwaysShow)}

              <Autocomplete
                id="always-show"
                selected={alwaysShow}
                allOptions={[]}
                onSelect={addAlwaysShow}
                placeholder="Add a username (without @)…"
                allowFreeInput
                closeOnSelect={false}
              />

              {alwaysShow.length === 0 && (
                <p class={css.empty}>
                  Nobody on the allowlist — every account is judged by the
                  rules.
                </p>
              )}
            </Stack>
          </Card>

          <Card
            title="Per-rule exceptions"
            description="Exempt an account from one rule but not the others — for someone using a tracked keyword sarcastically (“no NAFO”), or posting from a blocked country you still want to read."
          >
            <Stack>
              <input
                type="search"
                class={css.searchInput}
                value={exceptionFilter}
                onInput={(e) =>
                  setExceptionFilter((e.target as HTMLInputElement).value)
                }
                placeholder="Search exceptions…"
                aria-label="Search exceptions"
              />

              {(Object.keys(RULE_LABELS) as FilterRule[]).map((rule) => {
                const shown = exceptionQuery
                  ? exceptions[rule].filter((u) => u.includes(exceptionQuery))
                  : exceptions[rule]
                return (
                  <div key={rule} class={css.ruleGroup}>
                    <h3 class={css.ruleTitle}>{RULE_LABELS[rule]}</h3>
                    {renderHandleChips(shown, (u) => removeException(rule, u))}
                    {exceptions[rule].length > 0 && shown.length === 0 && (
                      <p class={css.empty}>None match “{exceptionFilter}”.</p>
                    )}
                    {exceptions[rule].length === 0 && (
                      <p class={css.empty}>No exceptions.</p>
                    )}
                    <Autocomplete
                      id={`exception-${rule}`}
                      selected={exceptions[rule]}
                      allOptions={[]}
                      onSelect={(name) => addException(rule, name)}
                      placeholder="Add a username (without @)…"
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
            title="Background lookups"
            description={`X allows about ${LOOKUP_LIMIT_PER_WINDOW} account lookups every ${LOOKUP_WINDOW_MINUTES} minutes. These settings decide how much of that X-Pat may spend filling flags in for you, and how much is held back for the accounts you hover yourself.`}
          >
            {isSharedCacheConfigured() && (
              <Setting
                label="Use the shared community cache"
                description="Shares the flags you look up so everyone skips repeat lookups. Only public handles and their flag are sent — no account or personal data."
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
              label="Prefetch locations in the background"
              description="Looks up accounts in your feed, in the order they appear, so flags show up without hovering."
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
              label="Share of the lookup limit it may use"
              clickable={false}
              disabled={cacheOff || !prefetchEnabled}
              description={`${shareLookups} for prefetching, ${
                LOOKUP_LIMIT_PER_WINDOW - shareLookups
              } left for your own hovers.`}
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
              label={`Spread lookups over the whole ${LOOKUP_WINDOW_MINUTES} minutes`}
              description={`About one lookup every ${spreadSeconds}s, instead of all at once.`}
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

          <Card
            title="Back up & restore"
            description="Move your settings to another browser, or keep a copy before experimenting."
          >
            <Stack>
              <div class={css.buttonRow}>
                <button class={css.secondaryBtn} onClick={handleExport}>
                  Export settings
                </button>
                <button
                  class={css.secondaryBtn}
                  onClick={() => fileInput.current?.click()}
                >
                  Import settings
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
              <p class={css.hint}>
                Import merges: settings the file doesn't mention are left alone.
                Every value is re-checked on the way in, so a hand-edited file
                can't put the extension into a state it can't recover from.
              </p>
            </Stack>
          </Card>

          <Card
            title="Local cache"
            description="Locations you have looked up are kept in this browser for 30 days, so showing them again costs nothing."
          >
            <Stack>
              <div class={css.buttonRow}>
                <button
                  class={css.dangerBtn}
                  onClick={handleClearCache}
                  disabled={cacheCleared}
                >
                  {cacheCleared ? 'Cache cleared' : 'Clear location cache'}
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
            title="Shared cache trust"
            description={`How many independent reports of the same location this install requires before trusting it. Higher is harder to poison but answers far less: today only about 1 in 80 cached profiles has been reported twice, so anything above 1 mostly falls back to looking the account up on X and spends your rate limit. Leave it at ${DEFAULT_MIN_CONFIDENCE} unless you are measuring this.`}
          >
            <Setting
              label="Trust a shared location after"
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
                      {n} {n === 1 ? 'report' : 'reports'}
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

render(<Options />, document.body)
