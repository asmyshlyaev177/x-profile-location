import { render } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import { Autocomplete } from '../components/Autocomplete'
import {
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_COUNTRIES_KEY,
  canonicalLocation,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  DEFAULT_OPTIONS_SECTIONS,
  DEFAULT_PREFETCH_SHARE,
  HIDE_BLOCKED_LOCATIONS_KEY,
  type HideBlockedMode,
  normalizeHideBlockedMode,
  normalizeOptionsSections,
  normalizePrefetchPacing,
  normalizePrefetchShare,
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
  OPTIONS_SECTIONS_KEY,
  type OptionsSectionId,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_CHOICES,
  PREFETCH_SHARE_KEY,
  type PrefetchPacing,
  REGION_FLAGS,
  SHARED_CACHE_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from '../scripts/countries'
import { isMobile } from '../scripts/device'
import { isSharedCacheConfigured } from '../scripts/shared-cache'
import css from './options.module.css'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }

const dedupe = (values: string[]) => [...new Set(values)]

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

export function Options() {
  const [blocked, setBlocked] = useState<string[]>([])
  const [keywords, setKeywords] = useState<string[]>([])
  const [flagsEnabled, setFlagsEnabled] = useState(false)
  const [flagsThreshold, setFlagsThreshold] = useState(2)
  const [flagsUniqueOnly, setFlagsUniqueOnly] = useState(true)
  const [showLocationInFeed, setShowLocationInFeed] = useState(false)
  const [exceptions, setExceptions] = useState<string[]>([])
  const [exceptionFilter, setExceptionFilter] = useState('')
  const [showExceptionButton, setShowExceptionButton] = useState(true)
  const [sharedCacheEnabled, setSharedCacheEnabled] = useState(true)
  const [prefetchEnabled, setPrefetchEnabled] = useState(true)
  const [prefetchShare, setPrefetchShare] = useState(DEFAULT_PREFETCH_SHARE)
  const [pacing, setPacing] = useState<PrefetchPacing>('spread')
  const [hideMode, setHideMode] = useState<HideBlockedMode>('off')
  const [cacheCleared, setCacheCleared] = useState(false)
  const [sections, setSections] = useState(DEFAULT_OPTIONS_SECTIONS)
  const [minConfidence, setMinConfidence] = useState(DEFAULT_MIN_CONFIDENCE)
  const [showAdvanced, setShowAdvanced] = useState(false)

  async function handleClearCache() {
    await chrome.runtime.sendMessage({ type: 'CLEAR_CACHE' })
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  useEffect(() => {
    chrome.storage.local
      .get([
        BLOCKED_COUNTRIES_KEY,
        HIGHLIGHT_KEYWORDS_KEY,
        HIGHLIGHT_FLAGS_KEY,
        SHOW_LOCATION_IN_FEED_KEY,
        HIGHLIGHT_EXCEPTIONS_KEY,
        SHOW_EXCEPTION_BUTTON_KEY,
        SHARED_CACHE_KEY,
        HIDE_BLOCKED_LOCATIONS_KEY,
        BACKGROUND_PREFETCH_KEY,
        PREFETCH_SHARE_KEY,
        PREFETCH_PACING_KEY,
        OPTIONS_SECTIONS_KEY,
        MIN_CONFIDENCE_KEY,
        SHOW_ADVANCED_KEY,
      ])
      .then((result) => {
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
        setExceptions(
          (result[HIGHLIGHT_EXCEPTIONS_KEY] as string[] | undefined) ?? [],
        )
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
        setSections(normalizeOptionsSections(result[OPTIONS_SECTIONS_KEY]))
        setMinConfidence(normalizeMinConfidence(result[MIN_CONFIDENCE_KEY]))

        // The advanced section is revealed by opening the options page as
        // `options.html?advanced=1` (and hidden again with `?advanced=0`), then
        // remembered. Deliberately undiscoverable from the UI: the one setting
        // it holds is a documented trade-off rather than a preference, and it
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

  function addException(name: string) {
    const trimmed = name.trim().replace(/^@+/, '').toLowerCase()
    if (!trimmed || exceptions.includes(trimmed)) return
    const next = [...exceptions, trimmed].sort()
    setExceptions(next)
    chrome.storage.local.set({ [HIGHLIGHT_EXCEPTIONS_KEY]: next })
  }

  function removeException(name: string) {
    const next = exceptions.filter((u) => u !== name)
    setExceptions(next)
    chrome.storage.local.set({ [HIGHLIGHT_EXCEPTIONS_KEY]: next })
  }

  // Restoring stored state flips `open` programmatically, which also fires
  // `toggle` — so the update has to be functional: that event can arrive with a
  // stale `sections`, which would otherwise clobber the freshly loaded values.
  function toggleSection(id: OptionsSectionId, open: boolean) {
    setSections((prev) => {
      if (prev[id] === open) return prev
      const next = { ...prev, [id]: open }
      chrome.storage.local.set({ [OPTIONS_SECTIONS_KEY]: next })
      return next
    })
  }

  // <details> flips itself, so this only records the result.
  function sectionProps(id: OptionsSectionId) {
    return {
      class: css.accordion,
      open: sections[id],
      onToggle: (e: Event) =>
        toggleSection(id, (e.currentTarget as HTMLDetailsElement).open),
    }
  }

  /** Dims a row whose controls are disabled, so the reason reads as deliberate. */
  function rowClass(base: string, disabled: boolean) {
    return disabled ? `${base} ${css.optionDisabled}` : base
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
    enabled: boolean,
    threshold: number,
    uniqueOnly: boolean,
  ) {
    setFlagsEnabled(enabled)
    setFlagsThreshold(threshold)
    setFlagsUniqueOnly(uniqueOnly)
    chrome.storage.local.set({
      [HIGHLIGHT_FLAGS_KEY]: { enabled, threshold, uniqueOnly },
    })
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

  const exceptionQuery = exceptionFilter.trim().toLowerCase()
  const shownExceptions = exceptionQuery
    ? exceptions.filter((u) => u.includes(exceptionQuery))
    : exceptions

  return (
    <div class={css.container}>
      <h1 class={css.title}>Options</h1>

      <details {...sectionProps('keywords')}>
        <summary class={css.accordionSummary}>
          <span>Highlight tweets by keyword 🔍</span>
          <span class={css.accordionArrow}>▾</span>
        </summary>
        <div class={css.accordionContent}>
          <p class={css.subtitle}>
            Highlights tweets whose author's name or bio contains any of these.
          </p>

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
            placeholder="Type a keyword or pick a suggestion..."
            allowFreeInput
            closeOnSelect={false}
          />

          {keywords.length === 0 && (
            <p class={css.empty}>
              No keywords set — all comments shown normally.
            </p>
          )}
        </div>
      </details>

      <details {...sectionProps('flags')}>
        <summary class={css.accordionSummary}>
          <span>Highlight tweets by flags 🏴</span>
          <span class={css.accordionArrow}>▾</span>
        </summary>
        <div class={css.accordionContent}>
          <p class={css.subtitle}>
            Highlights tweets whose author's bio is full of flags.
          </p>
          <label class={css.controlRow}>
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
            <span>Highlight if bio has more than</span>
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
            <span>flags</span>
          </label>
          <label class={css.controlRow}>
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
            <span>Count only unique flags</span>
          </label>
        </div>
      </details>

      <details {...sectionProps('exceptions')}>
        <summary class={css.accordionSummary}>
          <span>Highlight exceptions 🙈</span>
          <span class={css.accordionArrow}>▾</span>
        </summary>
        <div class={css.accordionContent}>
          <p class={css.subtitle}>
            Never highlighted, even when they match a rule — for accounts using
            a keyword sarcastically (e.g. “no NAFO”).
          </p>

          <label class={css.controlRow}>
            <input
              type="checkbox"
              checked={showExceptionButton}
              onChange={(e) => {
                const next = (e.target as HTMLInputElement).checked
                setShowExceptionButton(next)
                chrome.storage.local.set({ [SHOW_EXCEPTION_BUTTON_KEY]: next })
              }}
            />
            <span>Show “Don't highlight” button on profile hover cards</span>
          </label>

          {exceptions.length > 5 && (
            <input
              type="search"
              class={css.searchInput}
              value={exceptionFilter}
              onInput={(e) =>
                setExceptionFilter((e.target as HTMLInputElement).value)
              }
              placeholder="Search exceptions..."
              aria-label="Search exceptions"
            />
          )}

          {exceptions.length > 0 && shownExceptions.length === 0 && (
            <p class={css.empty}>No exceptions match “{exceptionFilter}”.</p>
          )}

          {shownExceptions.length > 0 && (
            <div class={`${css.chips} ${css.chipsScroll}`}>
              {shownExceptions.map((u) => (
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
                    onClick={() => removeException(u)}
                    title={`Remove @${u}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <Autocomplete
            id="exception"
            selected={exceptions}
            allOptions={[]}
            onSelect={addException}
            placeholder="Add a username (without @)..."
            allowFreeInput
            closeOnSelect={false}
          />

          {exceptions.length === 0 && (
            <p class={css.empty}>
              No exceptions — matching accounts are highlighted normally.
            </p>
          )}
        </div>
      </details>

      <label class={css.inlineOption}>
        <input
          type="checkbox"
          checked={showLocationInFeed}
          onChange={(e) => {
            const next = (e.target as HTMLInputElement).checked
            setShowLocationInFeed(next)
            chrome.storage.local.set({ [SHOW_LOCATION_IN_FEED_KEY]: next })
          }}
        />
        <span>Show location in feed 📍</span>
      </label>
      {isMobile && (
        <p class={css.mobileHint}>
          👉 Swipe right on any tweet to fetch its location
        </p>
      )}

      <details {...sectionProps('prefetch')}>
        <summary class={css.accordionSummary}>
          <span>Background lookups ⚡</span>
          <span class={css.accordionArrow}>▾</span>
        </summary>
        <div class={css.accordionContent}>
          {isSharedCacheConfigured() && (
            <>
              <label class={css.inlineOption}>
                <input
                  type="checkbox"
                  checked={sharedCacheEnabled}
                  onChange={(e) => {
                    const next = (e.target as HTMLInputElement).checked
                    setSharedCacheEnabled(next)
                    chrome.storage.local.set({ [SHARED_CACHE_KEY]: next })
                  }}
                />
                <span>Use shared community location cache 🌍</span>
              </label>
              <p class={css.mobileHint}>
                Shares the flags you look up so everyone skips repeat lookups.
                Only public handles and their flag are sent — no account or
                personal data.
              </p>
            </>
          )}

          <label class={rowClass(css.inlineOption, cacheOff)}>
            <input
              type="checkbox"
              checked={prefetchEnabled}
              disabled={cacheOff}
              onChange={(e) => {
                const next = (e.target as HTMLInputElement).checked
                setPrefetchEnabled(next)
                chrome.storage.local.set({ [BACKGROUND_PREFETCH_KEY]: next })
              }}
            />
            <span>Prefetch locations in the background</span>
          </label>
          <p class={css.mobileHint}>
            Looks up accounts in your feed, in the order they appear, so flags
            show up without hovering.
          </p>

          <label class={rowClass(css.controlRow, cacheOff || !prefetchEnabled)}>
            <span>Share of the lookup limit it may use:</span>
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
          </label>
          <p class={css.mobileHint}>
            X allows ~{LOOKUP_LIMIT_PER_WINDOW} lookups per{' '}
            {LOOKUP_WINDOW_MINUTES} min: {shareLookups} for prefetching,{' '}
            {LOOKUP_LIMIT_PER_WINDOW - shareLookups} left for your own hovers.
          </p>

          <label class={rowClass(css.controlRow, cacheOff || !prefetchEnabled)}>
            <input
              type="checkbox"
              checked={pacing === 'spread'}
              disabled={cacheOff || !prefetchEnabled}
              onChange={(e) =>
                updatePacing(
                  (e.target as HTMLInputElement).checked ? 'spread' : 'instant',
                )
              }
            />
            <span>
              Spread lookups over the whole {LOOKUP_WINDOW_MINUTES} minutes
            </span>
          </label>
          <p class={css.mobileHint}>
            About one lookup every {spreadSeconds}s, instead of all at once.
          </p>
        </div>
      </details>

      <details {...sectionProps('blocked')}>
        <summary class={css.accordionSummary}>
          <span>Blocked locations 🚫</span>
          <span class={css.accordionArrow}>▾</span>
        </summary>
        <div class={css.accordionContent}>
          <p class={css.subtitle}>
            These countries show ⚠️ instead of their flag, and their tweets can
            be collapsed or hidden.
          </p>

          <label class={css.controlRow}>
            <span>Tweets from these locations:</span>
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
          </label>
          <p class={css.mobileHint}>
            Goes by the store country, or the account location when it isn't
            flagged as VPN. Never applies to the tweet you opened.
          </p>

          {blocked.length > 0 && (
            <div class={css.chips}>
              {blocked.map((country) => (
                <span key={country} class={css.chip}>
                  <span class={css.chipFlag}>{ALL_FLAGS[country] ?? '🌐'}</span>
                  {country}
                  <button
                    class={css.chipRemove}
                    onClick={() => removeBlocked(country)}
                    title={`Remove ${country}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <Autocomplete
            id="country"
            selected={blocked}
            allOptions={CANONICAL_LOCATIONS}
            aliases={LOCATION_ALIASES}
            onSelect={addBlocked}
            placeholder="Search countries — name, code or nickname…"
            renderOption={(c, alias) => (
              <>
                <span class={css.dropdownFlag}>{ALL_FLAGS[c] ?? '🌐'}</span>
                <span>{c}</span>
                {alias && <span class={css.dropdownAlias}>{alias}</span>}
              </>
            )}
          />

          {blocked.length === 0 && (
            <p class={css.empty}>
              No countries selected — all flags shown as-is.
            </p>
          )}
        </div>
      </details>

      {showAdvanced && isSharedCacheConfigured() && (
        <details {...sectionProps('advanced')}>
          <summary class={css.accordionSummary}>
            <span>Advanced 🔧</span>
            <span class={css.accordionArrow}>▾</span>
          </summary>
          <div class={css.accordionContent}>
            <label class={rowClass(css.controlRow, cacheOff)}>
              <span>Trust a shared location after this many reports:</span>
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
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <p class={css.mobileHint}>
              Higher is harder to poison but answers far less: today only about
              1 in 80 cached profiles has been reported twice, so anything above
              1 mostly falls back to looking the account up on X and spends your
              rate limit. Leave it at {DEFAULT_MIN_CONFIDENCE} unless you are
              measuring this.
            </p>
          </div>
        </details>
      )}

      <div class={css.cacheSection}>
        <button
          class={css.clearCacheBtn}
          onClick={handleClearCache}
          disabled={cacheCleared}
        >
          {cacheCleared ? 'Cache cleared!' : 'Clear location cache'}
        </button>
      </div>
    </div>
  )
}

render(<Options />, document.body)
