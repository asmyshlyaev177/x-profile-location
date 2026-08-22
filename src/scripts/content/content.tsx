import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_AFFILIATIONS_KEY,
  BLOCKED_COUNTRIES_KEY,
  EVENTS,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_FLAGS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  MIN_CONFIDENCE_KEY,
  MSG,
  RATE_PROMPT_KEY,
  REGION_EXCLUSIONS_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ACCOUNT_CARD_KEY,
  SHOW_EXCEPTION_BUTTON_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
  SHOW_SHARE_BUTTON_KEY,
  USAGE_STATS_KEY,
} from '../constants'
// content.tsx — plain DOM, no React/Preact
import {
  cleanupCache,
  clearAllCache,
  getCached,
  mergeCached,
} from '../cache/cache'
import type { LocationData } from '../cache/cache'
import {
  defaultSetting,
  FILTER_RULES,
  type FilterRule,
  type HideBlockedMode,
  normalizeRuleExceptions,
  readSetting,
  type SettingKey,
  type SettingValue,
  settingValue,
} from '../settings'
import { initI18n, t, UI_LANGUAGE_KEY } from '../i18n'
import {
  flushContributions,
  isSharedCacheConfigured,
  isSharedCacheEnabled,
  setMinConfidence,
  setSharedCacheEnabled,
  sharedBatchLookup,
} from '../cache/shared-cache'
import { PrefetchPoller } from '../prefetch/prefetch-poller'
import type {
  PrefetchCandidate,
  PrefetchPriority,
} from '../prefetch/prefetch-queue'
import type { NextInstruction } from '../prefetch/lookup-broker'
import type { AccountFacts } from '../profile'
import { buildSourceGlyph, classifySource, platformLabel } from '../source'
import { noteActiveDay } from '../usage'
import { deliverShareCard, renderShareCard } from '../share-card'
import { snapshotElement } from '../snapshot'
import { drawWatermark, WATERMARK_BAND } from '../watermark'
import {
  CONTENT_CSS,
  HIDDEN_ATTR,
  HIDDEN_PLACEHOLDER_CLASS,
  PEOPLE_MATCH_ATTR,
  QUOTE_HIDDEN_ATTR,
  RATE_TOAST_ID,
  TWEET_MARK_ATTR,
} from '../styles'
import { accountChips } from './account-chips'
import { forgetBios, getBioInfo, rememberBio } from './bio-cache'
import { isEnabled, setEnabled, __resetEnabled } from './enabled'
import {
  clearKeywordMarks,
  hasHighlightRule,
  markKeywords,
  matchesHighlightRule,
  setHighlightFlags,
  setHighlightKeywords,
  shouldHighlight,
  updateKeywordEmojiStyle,
  __resetHighlight,
} from './highlight'
import {
  considerRatingAsk,
  dismissLocationToast,
  dismissRatingAsk,
  formatCountdown,
  isRateLimited,
  locationSummaryText,
  noteRateLimit,
  rateLimitRemainingMs,
  rateLimitResetsAt,
  rearmRatingAsk,
  renderLocationToast,
  showLocationOverlay,
  showRateLimitToast,
  __resetOverlays,
} from './overlays'
import {
  cellMatchFor,
  currentRuleExceptions,
  exceptedFromAll,
  FILTER_RULE_LABEL,
  type FilterMatch,
  forgetHideVerdicts,
  getLocationDisplay,
  hideMatchFor,
  isAlwaysShown,
  isExcepted,
  joinPhrases,
  knownHideVerdict,
  markMatchFor,
  matchLabel,
  ruleMatches,
  RULE_EXCEPTION_PHRASE,
  setAccountAgeFilter,
  setAlwaysShow,
  setBlockedAffiliations,
  setBlockedPicks,
  setRegionExclusions,
  setRuleExceptions,
  toggleRuleExceptions,
  __resetFilters,
} from './filters'
import {
  cancelPendingResize,
  __resetResizeGuard,
  runNow,
  whenSafeToResize,
} from './resize-guard'
import { decorateSnapshot } from './snapshot-decor'
import {
  extractQuotedTweetUserInfo,
  extractScreenName,
  extractTweetUserInfo,
  getNameEl,
  getQuotedTweetEl,
  screenNameFromHref,
  SEL_HOVER_CARD,
  SEL_PRIMARY_TWEET,
  SEL_TWEET,
  SEL_USER_CELL,
  textWithEmoji,
  tweetText,
  userCellName,
} from './tweet-dom'
import {
  answeredThisSession,
  askBroker,
  fetchLocationData,
  forgetSessionAnswers,
  hasApiHeaders,
  setApiHeaders,
  __resetLookup,
} from './lookup'

const PRIMARY_TWEET_ATTR = 'data-x-loc-primary-done'
const QUOTE_HIGHLIGHT_ATTR = 'data-x-loc-quote-highlighted'
const HIDDEN_REVEALED_ATTR = 'data-x-loc-revealed'
// The "revealed" half of the quote pair; its hidden half is QUOTE_HIDDEN_ATTR,
// which lives in styles.ts with the CSS written against it.
const QUOTE_REVEALED_ATTR = 'data-x-loc-quote-revealed'
const PEOPLE_CELL_ATTR = 'data-x-loc-cell-done'

// Every default below comes from SETTINGS_REGISTRY, so a default lives in one
// place rather than here, in the popup and in the options page.
let showLocationInFeed = defaultSetting(SHOW_LOCATION_IN_FEED_KEY)
// 'off' is a pre-load placeholder, not the stored default: nothing should be
// hidden on a guess before settings arrive.
let hideMode: HideBlockedMode = 'off'
// Whether to render the one-click exception button on hover cards.
let showExceptionButton = defaultSetting(SHOW_EXCEPTION_BUTTON_KEY)
// Whether hover cards get the account-facts card under the location row.
let showAccountCard = defaultSetting(SHOW_ACCOUNT_CARD_KEY)
// Whether hover cards get the "Copy card" button.
let showShareButton = defaultSetting(SHOW_SHARE_BUTTON_KEY)
// Whether background location prefetching runs.
let prefetchEnabled = defaultSetting(BACKGROUND_PREFETCH_KEY)
chrome.storage.local
  .get([
    EXTENSION_ENABLED_KEY,
    BLOCKED_COUNTRIES_KEY,
    REGION_EXCLUSIONS_KEY,
    HIGHLIGHT_KEYWORDS_KEY,
    HIGHLIGHT_FLAGS_KEY,
    SHOW_LOCATION_IN_FEED_KEY,
    HIGHLIGHT_EXCEPTIONS_KEY,
    RULE_EXCEPTIONS_KEY,
    ALWAYS_SHOW_KEY,
    BLOCKED_AFFILIATIONS_KEY,
    ACCOUNT_AGE_KEY,
    SHOW_EXCEPTION_BUTTON_KEY,
    SHOW_ACCOUNT_CARD_KEY,
    SHOW_SHARE_BUTTON_KEY,
    SHARED_CACHE_KEY,
    MIN_CONFIDENCE_KEY,
    HIDE_BLOCKED_LOCATIONS_KEY,
    BACKGROUND_PREFETCH_KEY,
  ])
  .then((result) => {
    const r = result as Record<string, unknown>
    setEnabled(readSetting(EXTENSION_ENABLED_KEY, r))
    setBlockedPicks(readSetting(BLOCKED_COUNTRIES_KEY, r))
    setRegionExclusions(readSetting(REGION_EXCLUSIONS_KEY, r))
    setHighlightKeywords(readSetting(HIGHLIGHT_KEYWORDS_KEY, r))
    setHighlightFlags(readSetting(HIGHLIGHT_FLAGS_KEY, r))
    showLocationInFeed = readSetting(SHOW_LOCATION_IN_FEED_KEY, r)
    setRuleExceptions(
      normalizeRuleExceptions(
        r[RULE_EXCEPTIONS_KEY],
        r[HIGHLIGHT_EXCEPTIONS_KEY],
      ),
    )
    setAlwaysShow(readSetting(ALWAYS_SHOW_KEY, r))
    setBlockedAffiliations(readSetting(BLOCKED_AFFILIATIONS_KEY, r))
    setAccountAgeFilter(readSetting(ACCOUNT_AGE_KEY, r))
    showExceptionButton = readSetting(SHOW_EXCEPTION_BUTTON_KEY, r)
    showAccountCard = readSetting(SHOW_ACCOUNT_CARD_KEY, r)
    showShareButton = readSetting(SHOW_SHARE_BUTTON_KEY, r)
    hideMode = readSetting(HIDE_BLOCKED_LOCATIONS_KEY, r)
    prefetchEnabled = readSetting(BACKGROUND_PREFETCH_KEY, r)
    // The share and pacing are the broker's, so every tab spends against one set
    // of numbers. Inert unless CACHE_API_BASE is configured.
    setSharedCacheEnabled(readSetting(SHARED_CACHE_KEY, r))
    setMinConfidence(r[MIN_CONFIDENCE_KEY])

    // Tweets can render before this resolves, so the first screen is decorated
    // here rather than waiting for a scroll.
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPoller()
    window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_USERS))
  })

/** Attributes and injected nodes only — never markup React owns. */
function stripAllInjections(): void {
  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    article.removeAttribute('data-x-loc-highlighted')
    article.removeAttribute(HIDDEN_ATTR)
    article.removeAttribute(TWEET_MARK_ATTR)
    article.removeAttribute(FEED_LOCATION_ATTR)
    article.removeAttribute(PRIMARY_TWEET_ATTR)
    const quote = getQuotedTweetEl(article)
    quote?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    quote?.removeAttribute(QUOTE_HIDDEN_ATTR)
    quote?.removeAttribute(TWEET_MARK_ATTR)
  }
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    cell.removeAttribute(PEOPLE_MATCH_ATTR)
  }
  document
    .querySelectorAll(
      `.x-loc-info, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-exc-btn, .x-loc-card, .x-loc-cell-tag, .x-loc-bio`,
    )
    .forEach((el) => el.remove())
  document.querySelectorAll(`[${HOVER_CARD_DONE_ATTR}]`).forEach((el) => {
    el.removeAttribute(HOVER_CARD_DONE_ATTR)
  })
  clearKeywordMarks()
  updateKeywordEmojiStyle()
  dismissLocationToast()
  dismissRatingAsk()
  document.getElementById(RATE_TOAST_ID)?.remove()
}

type StorageChanges = Record<string, chrome.storage.StorageChange>

/** Present in the batch, normalized through the registry, then applied. A
 *  removed key arrives undefined, which the normalizer answers with a default. */
function onSettingChange<K extends SettingKey>(
  changes: StorageChanges,
  key: K,
  apply: (value: SettingValue<K>) => void,
): void {
  if (changes[key]) apply(settingValue(key, changes[key].newValue))
}

/** Returns whether the rest of the changes are worth applying at all. */
function applyMasterSwitch(changes: StorageChanges): boolean {
  if (changes[EXTENSION_ENABLED_KEY]) {
    setEnabled(
      settingValue(
        EXTENSION_ENABLED_KEY,
        changes[EXTENSION_ENABLED_KEY].newValue,
      ),
    )
    if (!isEnabled()) {
      stripAllInjections()
      poller.stop()
      return false
    }
    rehighlightAll()
    refreshFeedLocations()
    void refreshHiddenTweets()
    syncPoller()
  }
  return isEnabled()
}

function applyFilterChanges(changes: StorageChanges): void {
  onSettingChange(changes, BLOCKED_COUNTRIES_KEY, (value) => {
    setBlockedPicks(value)
    // Editing the list can newly block (or unblock) locations already on screen.
    void refreshHiddenTweets()
  })
  onSettingChange(changes, REGION_EXCLUSIONS_KEY, (value) => {
    setRegionExclusions(value)
    void refreshHiddenTweets()
  })
  // Both keys arrive together, so the general one wins and the legacy one is a
  // fallback — that is what makes a removal stick.
  if (changes[RULE_EXCEPTIONS_KEY]) {
    // The write already folded in the legacy list (writeHighlightExceptions),
    // so merging it again here would resurrect anything just removed.
    setRuleExceptions(
      normalizeRuleExceptions(changes[RULE_EXCEPTIONS_KEY].newValue),
    )
    rehighlightAll()
    void refreshHiddenTweets()
  } else if (changes[HIGHLIGHT_EXCEPTIONS_KEY]) {
    // The old key moving on its own: an install still running the previous
    // version in another tab, or storage edited by hand.
    setRuleExceptions(
      normalizeRuleExceptions(
        { ...currentRuleExceptions(), highlight: [] },
        changes[HIGHLIGHT_EXCEPTIONS_KEY].newValue,
      ),
    )
    rehighlightAll()
    void refreshHiddenTweets()
  }
  onSettingChange(changes, ALWAYS_SHOW_KEY, (value) => {
    setAlwaysShow(value)
    rehighlightAll()
    void refreshHiddenTweets()
  })
  onSettingChange(changes, BLOCKED_AFFILIATIONS_KEY, (value) => {
    setBlockedAffiliations(value)
    void refreshHiddenTweets()
  })
  onSettingChange(changes, ACCOUNT_AGE_KEY, (value) => {
    setAccountAgeFilter(value)
    void refreshHiddenTweets()
  })
  onSettingChange(changes, HIDE_BLOCKED_LOCATIONS_KEY, (value) => {
    hideMode = value
    void refreshHiddenTweets()
    syncPoller()
  })
}

function applyDisplayChanges(changes: StorageChanges): void {
  onSettingChange(changes, HIGHLIGHT_KEYWORDS_KEY, (value) => {
    setHighlightKeywords(value)
    rehighlightAll()
  })
  onSettingChange(changes, HIGHLIGHT_FLAGS_KEY, (value) => {
    setHighlightFlags(value)
    rehighlightAll()
  })
  onSettingChange(changes, SHOW_LOCATION_IN_FEED_KEY, (value) => {
    showLocationInFeed = value
    refreshFeedLocations()
    syncPoller()
  })
  onSettingChange(changes, SHOW_EXCEPTION_BUTTON_KEY, (value) => {
    showExceptionButton = value
  })
  onSettingChange(changes, SHOW_ACCOUNT_CARD_KEY, (value) => {
    showAccountCard = value
  })
  onSettingChange(changes, SHOW_SHARE_BUTTON_KEY, (value) => {
    showShareButton = value
  })
}

function applyLookupChanges(changes: StorageChanges): void {
  onSettingChange(changes, SHARED_CACHE_KEY, (value) => {
    setSharedCacheEnabled(value)
    // Opting out of the community cache also stops background prefetch, which
    // exists to warm it — and opting back in restarts it.
    syncPoller()
  })
  if (changes[MIN_CONFIDENCE_KEY]) {
    setMinConfidence(changes[MIN_CONFIDENCE_KEY].newValue)
  }
  onSettingChange(changes, BACKGROUND_PREFETCH_KEY, (value) => {
    prefetchEnabled = value
    syncPoller()
  })
}

/** Everything on screen, redrawn: the incremental refreshes compare rules, and
 *  a language change moves none of them. */
function relocalize(): void {
  if (!isEnabled()) return
  stripAllInjections()
  rehighlightAll()
  refreshFeedLocations()
  void refreshHiddenTweets()
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return
  if (changes[UI_LANGUAGE_KEY]) {
    void initI18n().then(relocalize)
    return
  }
  if (!applyMasterSwitch(changes)) return
  if (changes[USAGE_STATS_KEY] || changes[RATE_PROMPT_KEY]) {
    // Re-arm, or a tab left open across the day that earns the ask never asks —
    // and X is exactly the page people leave open for days.
    rearmRatingAsk()
  }
  applyFilterChanges(changes)
  applyDisplayChanges(changes)
  applyLookupChanges(changes)
})

// Keep exhaustive: a module-scope `let` missing here is a new order dependency,
// and the suite would pass only in the order it happens to run.
export function __testResetState() {
  // settings, back to what the declarations above start them at
  __resetFilters()
  __resetHighlight()
  __resetEnabled()
  showLocationInFeed = defaultSetting(SHOW_LOCATION_IN_FEED_KEY)
  hideMode = 'off'
  showAccountCard = defaultSetting(SHOW_ACCOUNT_CARD_KEY)
  showShareButton = defaultSetting(SHOW_SHARE_BUTTON_KEY)
  showExceptionButton = defaultSetting(SHOW_EXCEPTION_BUTTON_KEY)
  prefetchEnabled = defaultSetting(BACKGROUND_PREFETCH_KEY)

  clearKeywordMarks()
  updateKeywordEmojiStyle()

  // session caches and in-flight work
  lastRightClickedTweet = null
  lastHoveredTweet = null
  __resetLookup()
  forgetBios()

  // the bottom-centre slot: its window, its live timers, its ask
  __resetOverlays()

  feedRowObserver?.disconnect()
  feedRowObserver = null
  pendingFeedRows = new WeakMap()

  __resetResizeGuard()
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === MSG.CLEAR_CACHE) {
    forgetSessionAnswers()
    clearAllCache()
  }
  if (message?.type === MSG.SHARE_POST) {
    void shareLastRightClickedPost()
  }
  // Another tab hit the limit. The countdown belongs in every tab, not just the
  // one that happened to be polling.
  if (message?.type === MSG.RATE) {
    const resetAt = Number(message.rate?.resetAt) || 0
    if (resetAt > rateLimitResetsAt()) noteRateLimit(resetAt)
  }
  // Another tab resolved a handle this one may also be showing.
  if (message?.type === MSG.RESOLVED && typeof message.userName === 'string') {
    void applyResolved(message.userName)
  }
})

async function applyResolved(userName: string): Promise<void> {
  if (!isEnabled()) return
  // A tab that did the lookup itself has already applied it, its own way — for
  // a hover that means leaving the post the card was opened from alone.
  if (answeredThisSession(userName)) return
  const data = await getCached(userName)
  if (data) applyFiltersForUser(userName, data)
}

// Inject CSS once
function injectStyles() {
  if (document.getElementById('x-loc-styles')) return
  const style = document.createElement('style')
  style.id = 'x-loc-styles'
  style.textContent = CONTENT_CSS
  ;(document.head || document.documentElement).appendChild(style)
}

async function tryHighlightArticle(article: Element) {
  if (!hasHighlightRule()) return
  // The tweet's own author and the author of anything it quotes are judged
  // independently — either, both, or neither can match.
  await tryHighlightTweet(article)
  await tryHighlightQuote(article)
}

async function tryHighlightTweet(article: Element) {
  if (article.hasAttribute('data-x-loc-highlighted')) return
  const { userName, displayName } = extractTweetUserInfo(article)
  if (!userName) return
  const info = await getBioInfo(userName)
  const name = displayName || info.displayName || ''
  if (!shouldHighlight(userName, name, info.bio)) return
  article.setAttribute('data-x-loc-highlighted', '1')
}

// Highlight the embedded quoted post when its author matches a keyword/flag
// rule — independent of whether the outer tweet's author matches.
async function tryHighlightQuote(article: Element) {
  const quote = getQuotedTweetEl(article)
  if (!quote || quote.hasAttribute(QUOTE_HIGHLIGHT_ATTR)) return
  const { userName, displayName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return
  const info = await getBioInfo(userName)
  if (
    shouldHighlight(userName, displayName || info.displayName || '', info.bio)
  ) {
    quote.setAttribute(QUOTE_HIGHLIGHT_ATTR, '1')
  }
}

function rehighlightAll() {
  if (!isEnabled()) return
  // Marks answer "why is this highlighted", so they follow the same changes.
  void markKeywords()
  // Also on the clearing branch below, where the button has to disappear.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  if (!hasHighlightRule()) {
    articles.forEach((a) => {
      a.removeAttribute('data-x-loc-highlighted')
      getQuotedTweetEl(a)?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    })
    return
  }
  articles.forEach((a) => {
    a.removeAttribute('data-x-loc-highlighted')
    getQuotedTweetEl(a)?.removeAttribute(QUOTE_HIGHLIGHT_ATTR)
    tryHighlightArticle(a)
  })
}

/** For a bio that arrives after the tweets have already rendered. */
function markHighlightedArticles(userName: string) {
  const lc = userName.toLowerCase()
  for (const article of document.querySelectorAll<Element>(SEL_TWEET)) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      article.setAttribute('data-x-loc-highlighted', '1')
    }
    const quote = getQuotedTweetEl(article)
    const quoted = quote && extractQuotedTweetUserInfo(quote).userName
    if (quote && quoted?.toLowerCase() === lc) {
      quote.setAttribute(QUOTE_HIGHLIGHT_ATTR, '1')
    }
  }
}

const FEED_LOCATION_ATTR = 'data-x-loc-feed-done'
const FEED_ROW_KEY_ATTR = 'data-x-loc-row'

// Feed rows land *after* the name line, the primary tweet's *inside* it, so
// neither sees the other's row without looking at the parent of both.
function nameLineHasInfoRow(userNameEl: Element): boolean {
  return !!userNameEl.parentElement?.querySelector('.x-loc-info')
}

// A row grows the tweet, so one injected above the viewport jumps the feed. See
// "Resizing without moving the scroll" in CLAUDE.md.
let pendingFeedRows = new WeakMap<Element, FeedRowPlan>()
let feedRowObserver: IntersectionObserver | null = null

interface FeedRowPlan {
  data: LocationData
  userName: string | null
}

// True when the row's insertion point (just under the name line) sits entirely
// above the viewport top, i.e. placing the row here would shift the scroll.
function insertionAboveFold(article: Element): boolean {
  const anchor = getNameEl(article) ?? article
  return anchor.getBoundingClientRect().bottom < 0
}

/** Everything buildInfoRow draws, so a revalidation that moved an account is
 *  redrawn and one that confirmed it is left alone. */
function feedRowKey(data: LocationData): string {
  return `${data.location ?? ''}|${data.locationAccurate}|${data.source ?? ''}`
}

/** The row already there says exactly what the new data would. */
function feedRowIsCurrent(article: Element, data: LocationData): boolean {
  const row = article.querySelector('.x-loc-feed-row')
  return !!row && row.getAttribute(FEED_ROW_KEY_ATTR) === feedRowKey(data)
}

function placeFeedRow(article: Element, plan: FeedRowPlan): void {
  if (!showLocationInFeed) return
  if (feedRowIsCurrent(article, plan.data)) return
  const userNameEl = getNameEl(article)
  if (!userNameEl) return
  article.setAttribute(FEED_LOCATION_ATTR, '1')
  const row = buildInfoRow(plan.data, plan.userName)
  row.classList.add('x-loc-feed-row')
  row.setAttribute(FEED_ROW_KEY_ATTR, feedRowKey(plan.data))
  const stale = article.querySelector('.x-loc-feed-row')
  if (!stale) {
    userNameEl.insertAdjacentElement('afterend', row)
    return
  }
  // The revealed-post exception button lives in the row; a new location is no
  // reason to take it away.
  stale
    .querySelectorAll('.x-loc-exc-btn')
    .forEach((btn) => row.appendChild(btn))
  stale.replaceWith(row)
}

function getFeedRowObserver(): IntersectionObserver {
  if (feedRowObserver) return feedRowObserver
  // Several thresholds, so the callback re-fires until the name line clears the
  // fold rather than firing the instant the bottom edge peeks in.
  feedRowObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue
        const article = entry.target
        const plan = pendingFeedRows.get(article)
        if (!plan || !showLocationInFeed) {
          pendingFeedRows.delete(article)
          feedRowObserver!.unobserve(article)
          continue
        }
        if (insertionAboveFold(article)) continue // still above the fold — wait
        pendingFeedRows.delete(article)
        feedRowObserver!.unobserve(article)
        placeFeedRow(article, plan)
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] },
  )
  return feedRowObserver
}

// Place the row now if doing so won't shift the scroll, otherwise park it until
// the tweet is scrolled into view (see pendingFeedRows / getFeedRowObserver).
function injectFeedRow(article: Element, plan: FeedRowPlan): void {
  if (feedRowIsCurrent(article, plan.data)) return
  if (pendingFeedRows.has(article)) {
    pendingFeedRows.set(article, plan)
    return
  }
  if (insertionAboveFold(article)) {
    pendingFeedRows.set(article, plan)
    getFeedRowObserver().observe(article)
    return
  }
  placeFeedRow(article, plan)
}

/** Whether a record carries anything the location row would draw. */
function hasLocationToShow(
  data: LocationData | null | undefined,
): data is LocationData {
  return Boolean(
    data && (data.location || !data.locationAccurate || data.source),
  )
}

async function tryInjectFeedLocation(article: Element) {
  if (!showLocationInFeed) return
  if (article.getAttribute(FEED_LOCATION_ATTR)) return
  if (article.matches(SEL_PRIMARY_TWEET)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  article.setAttribute(FEED_LOCATION_ATTR, '1')

  const data = await getCached(userName)
  if (!hasLocationToShow(data)) return

  injectFeedRow(article, { data, userName })
}

function injectFeedLocationForUser(userName: string, data: LocationData) {
  if (!showLocationInFeed) return
  if (!hasLocationToShow(data)) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (!getNameEl(article)) return
    article.setAttribute(FEED_LOCATION_ATTR, '1')
    injectFeedRow(article, { data, userName })
  })
}

function refreshFeedLocations() {
  if (!isEnabled()) return
  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  if (!showLocationInFeed) {
    articles.forEach((a) => {
      a.removeAttribute(FEED_LOCATION_ATTR)
      a.querySelectorAll('.x-loc-feed-row').forEach((el) => el.remove())
    })
    return
  }
  articles.forEach((a) => {
    a.removeAttribute(FEED_LOCATION_ATTR)
    tryInjectFeedLocation(a)
  })
}

// Hide tweets from blocked locations. Collapsed behind a placeholder, never
// removed: attribute-and-CSS survives React's re-renders.
/** Everything of `match` a placeholder shows — so a change to it is visible. */
function placeholderKey(match: FilterMatch): string {
  return `${match.rule}|${match.icon}|${match.label}`
}

function buildHiddenLabel(match: FilterMatch): HTMLElement {
  const labelEl = document.createElement('span')
  labelEl.className = 'x-loc-hidden-label'
  labelEl.textContent = t('hiddenLabel', match.icon, matchLabel(match))
  return labelEl
}

function buildShowButton(match: FilterMatch, onShow: () => void): HTMLElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.className = 'x-loc-hidden-show'
  btn.textContent = t('hiddenShow')
  // Four rules can produce this placeholder, and "🌱 3d old" is only actionable
  // if you know which setting to go and change.
  btn.title = t(
    'hiddenShowTitle',
    FILTER_RULE_LABEL[match.rule](),
    matchLabel(match),
  )
  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    onShow()
  })
  return btn
}

/** The exception button, once "Show" has put the post on screen — see "The
 *  exception button" in CLAUDE.md. */
function placeRevealedException(
  target: Element,
  userName: string,
  match: FilterMatch,
): void {
  if (target.querySelector('.x-loc-exc-btn')) return
  const btn = buildExceptionButton(userName, [match.rule])
  btn.classList.add('x-loc-exc-inline')

  // No row when the reader turned it off, or when the rule that caught the post
  // is one the row has nothing to say about — then it goes where the row would.
  const row = target.querySelector('.x-loc-feed-row')
  if (row) {
    row.appendChild(btn)
    return
  }
  const nameEl = getNameEl(target)
  if (nameEl) nameEl.insertAdjacentElement('afterend', btn)
  else target.appendChild(btn)
}

function buildHiddenPlaceholder(
  target: Element,
  userName: string,
  match: FilterMatch,
  reveal: (target: Element) => void,
): HTMLElement {
  const ph = document.createElement('div')
  ph.className = HIDDEN_PLACEHOLDER_CLASS
  // For hideArticle to compare against: rebuilding every refresh churned the
  // whole page, never rebuilding left it naming the wrong rule.
  ph.dataset.match = placeholderKey(match)

  const onShow = () => {
    reveal(target)
    ph.remove()
    if (showExceptionButton) placeRevealedException(target, userName, match)
  }

  ph.append(buildHiddenLabel(match), buildShowButton(match, onShow))
  return ph
}

function hideArticle(
  article: Element,
  userName: string,
  match: FilterMatch,
  bornHidden = false,
): void {
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
  const schedule = bornHidden ? runNow : whenSafeToResize

  if (hideMode === 'hide') {
    // CSS takes the whole article, so this mode has no placeholder — and one
    // left by collapse mode must go, or switching back builds a second.
    if (isHiddenSilently(article, HIDDEN_ATTR)) return
    schedule(article, () => {
      article.setAttribute(HIDDEN_ATTR, 'hide')
      ownPlaceholder(article)?.remove()
    })
    return
  }

  // Build a placeholder only when there is none, or the one there names a rule
  // no longer catching this post — that keeps rule changes off other posts.
  if (isCollapsedFor(article, HIDDEN_ATTR, match)) return
  schedule(article, () => {
    article.setAttribute(HIDDEN_ATTR, 'collapse')
    ownPlaceholder(article)?.remove()
    article.appendChild(
      buildHiddenPlaceholder(article, userName, match, revealArticle),
    )
  })
}

/** The placeholder this target owns — a direct child. A descendant query would
 *  also find a collapsed quote's, and answer for the wrong post. */
function ownPlaceholder(target: Element): HTMLElement | null {
  for (const child of Array.from(target.children)) {
    if (child.classList.contains(HIDDEN_PLACEHOLDER_CLASS)) {
      return child as HTMLElement
    }
  }
  return null
}

/** Silently hidden already, with no placeholder left over from collapse mode. */
function isHiddenSilently(target: Element, attr: string): boolean {
  return target.getAttribute(attr) === 'hide' && !ownPlaceholder(target)
}

/** Already collapsed behind a placeholder saying what `match` would say. */
function isCollapsedFor(
  target: Element,
  attr: string,
  match: FilterMatch,
): boolean {
  if (target.getAttribute(attr) !== 'collapse') return false
  return ownPlaceholder(target)?.dataset.match === placeholderKey(match)
}

function unhideArticle(article: Element): void {
  cancelPendingResize(article)
  if (!article.hasAttribute(HIDDEN_ATTR)) return
  whenSafeToResize(article, () => {
    article.removeAttribute(HIDDEN_ATTR)
    article.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
  })
}

// "Show" reveals the post and never re-hides it; the marker lives only as long
// as the DOM node. Immediate, not parked: the user is waiting on it.
function revealArticle(article: Element): void {
  cancelPendingResize(article)
  article.removeAttribute(HIDDEN_ATTR)
  article.setAttribute(HIDDEN_REVEALED_ATTR, '1')
}

// The quote collapses alone: taking the whole row would remove a post the
// reader never filtered.

function hideQuote(
  quote: Element,
  userName: string,
  match: FilterMatch,
  bornHidden = false,
): void {
  if (quote.hasAttribute(QUOTE_REVEALED_ATTR)) return
  const schedule = bornHidden ? runNow : whenSafeToResize

  if (hideMode === 'hide') {
    if (isHiddenSilently(quote, QUOTE_HIDDEN_ATTR)) return
    schedule(quote, () => {
      quote.setAttribute(QUOTE_HIDDEN_ATTR, 'hide')
      ownPlaceholder(quote)?.remove()
    })
    return
  }
  if (isCollapsedFor(quote, QUOTE_HIDDEN_ATTR, match)) return
  schedule(quote, () => {
    quote.setAttribute(QUOTE_HIDDEN_ATTR, 'collapse')
    ownPlaceholder(quote)?.remove()
    quote.appendChild(
      buildHiddenPlaceholder(quote, userName, match, revealQuote),
    )
  })
}

function unhideQuote(quote: Element): void {
  cancelPendingResize(quote)
  if (!quote.hasAttribute(QUOTE_HIDDEN_ATTR)) return
  whenSafeToResize(quote, () => {
    quote.removeAttribute(QUOTE_HIDDEN_ATTR)
    quote.querySelector(`.${HIDDEN_PLACEHOLDER_CLASS}`)?.remove()
  })
}

function revealQuote(quote: Element): void {
  cancelPendingResize(quote)
  quote.removeAttribute(QUOTE_HIDDEN_ATTR)
  quote.setAttribute(QUOTE_REVEALED_ATTR, '1')
}

/** Collapse a just-inserted post in the microtask it arrived in, so it is never
 *  laid out at full height — worth 2188px of scroll, see CLAUDE.md. */
function applyKnownHide(article: Element): void {
  if (hideMode === 'off') return

  const quote = getQuotedTweetEl(article)
  if (quote && !quote.hasAttribute(QUOTE_HIDDEN_ATTR)) {
    const quoted = extractQuotedTweetUserInfo(quote).userName
    const known = quoted ? knownHideVerdict(quoted) : null
    if (known && quoted) hideQuote(quote, quoted, known, true)
  }

  if (article.matches(SEL_PRIMARY_TWEET)) return
  if (article.hasAttribute(HIDDEN_ATTR)) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return
  // undefined (never judged) and null (judged, not hidden) both mean "leave it".
  const known = knownHideVerdict(userName)
  if (known) hideArticle(article, userName, known, true)
}

async function tryHideQuote(article: Element) {
  if (hideMode === 'off') return
  const quote = getQuotedTweetEl(article)
  if (!quote) return
  if (quote.hasAttribute(QUOTE_REVEALED_ATTR)) return
  if (quote.hasAttribute(QUOTE_HIDDEN_ATTR)) return

  const { userName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return

  const match = hideMatchFor(userName, await getCached(userName))
  if (match) hideQuote(quote, userName, match)
}

async function tryHideArticle(article: Element) {
  if (hideMode === 'off') return
  // The quote is judged separately from its host, and a host that survives can
  // still be quoting someone filtered.
  void tryHideQuote(article)

  if (article.matches(SEL_PRIMARY_TWEET)) return
  if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
  if (article.hasAttribute(HIDDEN_ATTR)) return

  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  const match = hideMatchFor(userName, await getCached(userName))
  if (match) hideArticle(article, userName, match)
}

// For data arriving after the posts did — a cache hit, a resolved prefetch.
// `hideNow: false` judges without collapsing.
function hideTweetsForUser(
  userName: string,
  data: LocationData,
  hideNow = true,
): void {
  if (hideMode === 'off') return
  const match = hideMatchFor(userName, data)
  if (!match || !hideNow) return
  const lc = userName.toLowerCase()
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    const quote = getQuotedTweetEl(article)
    if (
      quote &&
      extractQuotedTweetUserInfo(quote).userName?.toLowerCase() === lc &&
      !quote.hasAttribute(QUOTE_REVEALED_ATTR) &&
      !quote.hasAttribute(QUOTE_HIDDEN_ATTR)
    ) {
      hideQuote(quote, userName, match)
    }

    if (article.matches(SEL_PRIMARY_TWEET)) return
    if (article.hasAttribute(HIDDEN_REVEALED_ATTR)) return
    if (article.hasAttribute(HIDDEN_ATTR)) return
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return
    hideArticle(article, userName, match)
  })
}

interface PostVerdict {
  article: Element
  quote: Element | null
  userName: string | null
  quoteUserName: string | null
  articleHide: FilterMatch | null
  quoteHide: FilterMatch | null
  articleMark: FilterMatch | null
  quoteMark: FilterMatch | null
}

/** Everything the rules have to say about one post — DOM untouched. */
async function judgePost(article: Element): Promise<PostVerdict> {
  const quote = getQuotedTweetEl(article)
  const { userName } = extractTweetUserInfo(article)
  const quoteUserName = quote
    ? extractQuotedTweetUserInfo(quote).userName
    : null
  const [data, quoteData] = await Promise.all([
    userName ? getCached(userName) : undefined,
    quoteUserName ? getCached(quoteUserName) : undefined,
  ])
  // The post a status page is about is never collapsed — but it is still
  // marked, which is the whole difference between the two kinds of rule.
  const collapsible = hideMode !== 'off' && !article.matches(SEL_PRIMARY_TWEET)
  return {
    article,
    quote,
    userName,
    quoteUserName,
    articleHide: collapsible && userName ? hideMatchFor(userName, data) : null,
    quoteHide:
      hideMode !== 'off' && quoteUserName
        ? hideMatchFor(quoteUserName, quoteData)
        : null,
    articleMark: userName ? markMatchFor(userName, data) : null,
    quoteMark: quoteUserName ? markMatchFor(quoteUserName, quoteData) : null,
  }
}

/** A mark is a left border, so it costs no height and needs no scroll care. */
function setMark(target: Element, match: FilterMatch | null): void {
  if (!match) {
    target.removeAttribute(TWEET_MARK_ATTR)
    return
  }
  if (target.getAttribute(TWEET_MARK_ATTR) !== match.rule) {
    target.setAttribute(TWEET_MARK_ATTR, match.rule)
  }
}

function applyPostVerdict(v: PostVerdict): void {
  if (v.articleHide && v.userName) {
    hideArticle(v.article, v.userName, v.articleHide)
  } else {
    unhideArticle(v.article)
  }

  if (v.quote) {
    if (v.quoteHide && v.quoteUserName) {
      hideQuote(v.quote, v.quoteUserName, v.quoteHide)
    } else {
      unhideQuote(v.quote)
    }
    setMark(v.quote, v.quoteMark)
  }
  setMark(v.article, v.articleMark)
}

// Ask first, mutate second, and only where the answer changed. Stripping every
// attribute up front made an exception for one account move the whole page.
async function refreshHiddenTweets(): Promise<void> {
  if (!isEnabled()) return
  // Every rule change comes through here, and any of them can change a remembered
  // verdict. judgePost re-fills the map as it goes.
  forgetHideVerdicts()
  // Before the awaits, so the glyph turns over in the task the click landed in.
  refreshLocationFlags()
  // A rule change can make the button appear, change what it offers, or go away.
  void syncPrimaryExceptionButton()

  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET))
  const verdicts = await Promise.all(articles.map(judgePost))
  // Bottom-up, so the geometry whenSafeToResize is about to read is untouched by
  // the changes already applied.
  for (let i = verdicts.length - 1; i >= 0; i--) {
    if (verdicts[i].article.isConnected) applyPostVerdict(verdicts[i])
  }
  void refreshPeopleCells()
}

// Marking posts a rule points at rather than hides: nothing is taken away, so
// no placeholder and no reason to skip the post a status page is about.

async function tryMarkArticle(article: Element) {
  // The quote's author is judged on their own, exactly as they are for hiding
  // and highlighting — either, both or neither can be new.
  void tryMarkQuote(article)

  if (article.hasAttribute(TWEET_MARK_ATTR)) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  const match = markMatchFor(userName, await getCached(userName))
  if (match) article.setAttribute(TWEET_MARK_ATTR, match.rule)
}

async function tryMarkQuote(article: Element) {
  const quote = getQuotedTweetEl(article)
  if (!quote || quote.hasAttribute(TWEET_MARK_ATTR)) return
  const { userName } = extractQuotedTweetUserInfo(quote)
  if (!userName) return

  const match = markMatchFor(userName, await getCached(userName))
  if (match) quote.setAttribute(TWEET_MARK_ATTR, match.rule)
}

/** A post is judged before its author is known, so the answer is revisited. */
function markTweetsForUser(userName: string, data: LocationData): void {
  const match = markMatchFor(userName, data)
  if (!match) return
  const lc = userName.toLowerCase()
  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      article.setAttribute(TWEET_MARK_ATTR, match.rule)
    }
    const quote = getQuotedTweetEl(article)
    if (
      quote &&
      extractQuotedTweetUserInfo(quote).userName?.toLowerCase() === lc
    ) {
      quote.setAttribute(TWEET_MARK_ATTR, match.rule)
    }
  }
}

// People lists (Followers / Following / the People tab of search). Marked,
// never removed — a short list would look like X's, not ours.

async function tryMarkPeopleCell(cell: Element) {
  if (cell.hasAttribute(PEOPLE_CELL_ATTR)) return
  const userName = userCellName(cell)
  if (!userName) return
  cell.setAttribute(PEOPLE_CELL_ATTR, '1')

  const data = await getCached(userName)
  const match = cellMatchFor(userName, data)
  if (!match) return

  cell.setAttribute(PEOPLE_MATCH_ATTR, match.rule)

  if (cell.querySelector('.x-loc-cell-tag')) return
  const tag = document.createElement('span')
  tag.className = 'x-loc-cell-tag'
  tag.textContent = `${match.icon} ${matchLabel(match)}`
  tag.title = t('cellTagTitle', FILTER_RULE_LABEL[match.rule]())
  const nameEl = getNameEl(cell) ?? cell
  nameEl.insertAdjacentElement('beforeend', tag)
}

/** Rows are marked before their data arrives, so a lookup must re-judge them. */
function markPeopleCellsForUser(userName: string, data: LocationData): void {
  if (!cellMatchFor(userName, data)) return
  const lc = userName.toLowerCase()
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    if (cell.hasAttribute(PEOPLE_MATCH_ATTR)) continue
    if (userCellName(cell)?.toLowerCase() !== lc) continue
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    void tryMarkPeopleCell(cell)
  }
}

/** One function, so no caller wires up two of three. `hideNow: false` judges
 *  without collapsing — asking about an account is not filtering it. */
function applyFiltersForUser(
  userName: string,
  data: LocationData,
  { hideNow = true }: { hideNow?: boolean } = {},
): void {
  injectFeedLocationForUser(userName, data)
  hideTweetsForUser(userName, data, hideNow)
  markTweetsForUser(userName, data)
  markPeopleCellsForUser(userName, data)
}

async function refreshPeopleCells() {
  for (const cell of Array.from(
    document.querySelectorAll<Element>(SEL_USER_CELL),
  )) {
    cell.removeAttribute(PEOPLE_CELL_ATTR)
    cell.removeAttribute(PEOPLE_MATCH_ATTR)
    cell.querySelectorAll('.x-loc-cell-tag').forEach((el) => el.remove())
    void tryMarkPeopleCell(cell)
  }
}

// Build info row DOM element
function makeIcon(emoji: string, tooltip: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'x-loc-icon'
  span.textContent = emoji
  span.title = tooltip
  return span
}

function buildInfoRow(
  data: LocationData,
  userName?: string | null,
): HTMLElement {
  // The one place meaning "the extension did something visible today", which is
  // what the rating ask counts.
  void noteActiveDay().then(() => considerRatingAsk(isEnabled))

  const row = document.createElement('div')
  row.className = 'x-loc-info'
  // This and the `country` below are read back by refreshLocationFlags, which
  // re-answers the row without a cache read.
  if (userName) row.dataset.user = userName

  const { platform, country: sourceCountry } = classifySource(data?.source)

  if (sourceCountry) {
    const { emoji: storeFlag, isText: storeFlagIsText } = getLocationDisplay(
      sourceCountry,
      userName,
    )
    const block = document.createElement('span')
    block.className = 'x-loc-store-block'
    // The raw string is the honest tooltip: it names the store *and* which one,
    // where the glyph alone only shows the platform.
    block.title = data.source!
    block.setAttribute(
      'aria-label',
      t(
        'storeRegionLabel',
        platformLabel(platform),
        getLocationDisplay(sourceCountry).label,
      ),
    )

    const glyph = buildSourceGlyph(platform)
    if (glyph) block.appendChild(glyph)

    const flag = document.createElement('span')
    flag.className = `x-loc-icon-flag ${storeFlagIsText ? 'x-loc-icon-abbr' : ''}`
    flag.textContent = storeFlag
    flag.dataset.country = sourceCountry

    block.appendChild(flag)
    row.appendChild(block)
  }

  if (data?.location) {
    const { emoji, label, isText } = getLocationDisplay(data.location, userName)
    const icon = makeIcon(emoji, label)
    icon.classList.add('x-loc-icon-flag')
    if (isText) icon.classList.add('x-loc-icon-abbr')
    icon.dataset.country = data.location
    row.appendChild(icon)
  }

  if (data?.locationAccurate === false) {
    const vpn = document.createElement('span')
    vpn.className = 'x-loc-icon-vpn'
    vpn.title = t('vpnTitle')
    vpn.textContent = t('vpnBadge')
    row.appendChild(vpn)
  }

  return row
}

/** Redraw every flag on the page after a rule change. One glyph, swapped where
 *  it stands: rebuilding rows would resize the post (see whenSafeToResize). */
function refreshLocationFlags(): void {
  for (const row of Array.from(
    document.querySelectorAll<HTMLElement>('.x-loc-info'),
  )) {
    const userName = row.dataset.user
    for (const flag of Array.from(
      row.querySelectorAll<HTMLElement>('.x-loc-icon-flag'),
    )) {
      const country = flag.dataset.country
      if (!country) continue
      const { emoji, isText } = getLocationDisplay(country, userName)
      if (flag.textContent !== emoji) flag.textContent = emoji
      flag.classList.toggle('x-loc-icon-abbr', Boolean(isText))
    }
  }
}

// One button whatever the rule — from the reader's side these are one
// complaint, "not this account". The exceptions stay per-rule underneath.

/** Exceptions included: an already-excepted rule is the one the button must
 *  keep offering, or a mistake needs the options page to undo. */
function activeRulesFor(
  userName: string,
  data: LocationData | null | undefined,
  displayName: string,
  bio: string | null | undefined,
): FilterRule[] {
  // Nothing acts on an allowlisted account, so there is nothing to except.
  if (isAlwaysShown(userName)) return []

  const hit = new Set<FilterRule>()

  for (const rule of FILTER_RULES) {
    if (isExcepted(rule, userName)) hit.add(rule)
  }
  if (matchesHighlightRule(userName, displayName, bio)) hit.add('highlight')
  for (const match of ruleMatches(data)) hit.add(match.rule)

  return FILTER_RULES.filter((rule) => hit.has(rule))
}

function buildExceptionButton(
  userName: string,
  rules: FilterRule[],
): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'x-loc-exc-btn'
  btn.type = 'button'
  // Also what syncExceptionButton compares against to decide whether the set of
  // rules has changed under it.
  btn.dataset.rules = rules.join(' ')

  function render() {
    const excepted = exceptedFromAll(userName, rules)
    const phrase = joinPhrases(rules.map((r) => RULE_EXCEPTION_PHRASE[r]()))
    // One label whatever the rule — four would make one control look like four.
    btn.textContent = excepted ? t('excUndo') : t('excAdd')
    btn.title = excepted
      ? t('excUndoTitle', userName, phrase)
      : t('excAddTitle', userName, phrase)
    btn.classList.toggle('x-loc-exc-active', excepted)
    // Read back by syncExceptionButton, so the storage write a click triggers
    // doesn't rebuild the button from the state it already shows.
    btn.dataset.excepted = excepted ? '1' : '0'
  }
  render()

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    toggleRuleExceptions(userName, rules, !exceptedFromAll(userName, rules))
    render()
    // Both, because the button now covers rules on either side of that line:
    // highlighting is re-run, and anything hidden or collapsed is re-judged.
    rehighlightAll()
    void refreshHiddenTweets()
  })

  return btn
}

/** Called more than once per card, and rebuilt rather than patched, so label,
 *  tooltip and handler never disagree. */
function syncExceptionButton({
  host,
  userName,
  data,
  info,
  place,
}: {
  host: Element
  userName: string
  data: LocationData | null | undefined
  info: { bio: string | null; displayName: string | null }
  /** Where in `host` the button goes — every caller puts it somewhere else. */
  place: (btn: HTMLElement) => void
}): void {
  const existing = host.querySelector<HTMLElement>('.x-loc-exc-btn')
  const rules = showExceptionButton
    ? activeRulesFor(userName, data, info.displayName ?? '', info.bio)
    : []

  if (rules.length === 0) {
    existing?.remove()
    return
  }
  // The exception state is part of the comparison, not just the rule set: the
  // same account's hover card can add the exception this button would undo.
  if (
    existing?.dataset.rules === rules.join(' ') &&
    existing.dataset.excepted === (exceptedFromAll(userName, rules) ? '1' : '0')
  ) {
    return
  }

  existing?.remove()
  place(buildExceptionButton(userName, rules))
}

// Account card
function buildAccountCard(
  facts: Partial<AccountFacts> | undefined,
): HTMLElement | null {
  const chips = accountChips(facts)
  if (chips.length === 0) return null

  const card = document.createElement('div')
  card.className = 'x-loc-card'
  for (const chip of chips) {
    const el = document.createElement('span')
    el.className =
      chip.tone && chip.tone !== 'plain'
        ? `x-loc-chip x-loc-chip-${chip.tone}`
        : 'x-loc-chip'
    el.textContent = chip.text
    el.title = chip.title
    card.appendChild(el)
  }
  return card
}

/** `onExpiry` fires when the countdown reaches zero; the row is gone by then. */
function buildRateLimitRow(onExpiry: () => void): HTMLElement {
  const row = document.createElement('div')
  row.className = 'x-loc-info'

  const badge = document.createElement('span')
  badge.className = 'x-loc-icon-ratelimit'
  badge.title = t('rateLimitBadgeTitle')
  badge.textContent = `⏱ ${formatCountdown(rateLimitRemainingMs())}`
  row.appendChild(badge)

  const interval = setInterval(() => {
    // Taken off the page by something else — a hover card closing, the master
    // switch stripping the page. Whatever removed it did not ask for a lookup.
    if (!badge.isConnected) {
      clearInterval(interval)
      return
    }
    const remaining = rateLimitRemainingMs()
    if (remaining <= 0) {
      clearInterval(interval)
      row.remove()
      onExpiry()
      return
    }
    badge.textContent = `⏱ ${formatCountdown(remaining)}`
  }, 1000)

  return row
}

// Insert a row element into a hover card at the right position
function insertIntoCard(card: Element, userName: string, el: HTMLElement) {
  const atSpan = Array.from(card.querySelectorAll('span')).find(
    (s) => s.textContent?.trim().toLowerCase() === `@${userName.toLowerCase()}`,
  )

  if (atSpan) {
    let node: Element | null = atSpan
    while (node && node !== card) {
      const parent: Element | null = node.parentElement
      if (!parent || parent === card) break
      if (parent.children.length >= 3) {
        parent.insertBefore(el, node.nextSibling)
        return
      }
      node = parent
    }
  }

  ;(card.querySelector('div > div > div') ?? card).appendChild(el)
}

// The bio X declined to render — see "The bio X declined to render" in
// CLAUDE.md.

/** A slice distinctive enough to look for in a card. URLs come out first: X
 *  substitutes a t.co display form, so they never match verbatim. */
export function bioProbe(bio: string): string {
  const plain = bio
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/(?:[a-z0-9-]+\.)+[a-z]{2,}\/\S*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
  // Too short to identify a bio by — a three-character probe matches a display
  // name or one of our own chips as easily as the bio itself.
  return plain.length < 4 ? '' : plain.slice(0, 40)
}

/** Whether the card is already showing this bio, ignoring what we injected. */
function cardShowsBio(card: Element, probe: string): boolean {
  const text = textWithEmoji(card, (child) =>
    child.classList.contains('x-loc-hover'),
  )
  return text.replace(/\s+/g, ' ').trim().toLowerCase().includes(probe)
}

/** Rebuilt rather than appended: a card React fills in late must not end up
 * with two bios. */
function syncBioRow(
  wrap: HTMLElement,
  card: Element,
  bio: string | null | undefined,
): void {
  card.querySelector('.x-loc-bio')?.remove()
  if (!bio || !wrap.isConnected) return
  const probe = bioProbe(bio)
  if (probe === '' || cardShowsBio(card, probe)) return

  const el = document.createElement('div')
  el.className = 'x-loc-bio'
  el.textContent = bio
  el.title = t('bioTitle')
  // Outside .x-loc-hover, or keywordRangesIn skips it as our own furniture and
  // the word that matched goes unmarked.
  wrap.before(el)
}

// Process a hover card
const HOVER_CARD_DONE_ATTR = 'data-x-loc-done'

/** The account-facts card: after the flags, before the exception button. */
function syncAccountCard(
  wrap: HTMLElement,
  card: Element,
  infoRow: HTMLElement | null,
  facts: Partial<AccountFacts>,
): void {
  if (!showAccountCard) return
  const accountCard = buildAccountCard(facts)
  if (!accountCard || card.querySelector('.x-loc-card')) return
  if (infoRow) infoRow.after(accountCard)
  else wrap.prepend(accountCard)
}

/** In the flags row, not under it: a hover card is short on vertical space. */
function syncShareButton(
  card: Element,
  infoRow: HTMLElement | null,
  userName: string,
  displayName: string,
): void {
  if (!showShareButton || !infoRow) return
  if (card.querySelector('.x-loc-share-btn')) return
  infoRow.appendChild(buildShareButton(userName, displayName))
}

async function processCard(card: Element) {
  if (card.getAttribute(HOVER_CARD_DONE_ATTR)) return

  const userName = extractScreenName(card)
  // Don't mark done yet — card content may not be rendered. The observer will
  // retry when React adds content inside the card.
  if (!userName) return

  card.setAttribute(HOVER_CARD_DONE_ATTR, '1')

  // One container: insertIntoCard anchors every call to the same node, so
  // separate inserts came out backwards.
  const wrap = document.createElement('div')
  wrap.className = 'x-loc-hover'
  insertIntoCard(card, userName, wrap)

  // The bio answers the highlight rule on its own, and a hover card only gets a
  // second or two of attention. Synced again below for the other rules.
  const place = (btn: HTMLElement) => wrap.appendChild(btn)
  const known = await getBioInfo(userName)
  syncBioRow(wrap, card, known.bio)
  syncExceptionButton({ host: wrap, userName, data: null, info: known, place })
  void markKeywords()

  // The card is open because the user hovered it: ask X again, throttled.
  const data = await fetchLocationData(userName, { manual: true })

  if (data === null && isRateLimited()) {
    // The whole pass starts again rather than the row being patched: by the
    // time the window ends the card may be showing a different account
    wrap.prepend(
      buildRateLimitRow(() => {
        wrap.remove()
        card.removeAttribute(HOVER_CARD_DONE_ATTR)
        void processCard(card)
      }),
    )
    return
  }

  // The location row needs a location; the account card does not, so an account
  // X has no country for can still show its age and badges.
  const infoRow = hasLocationToShow(data) ? buildInfoRow(data, userName) : null
  if (infoRow) wrap.prepend(infoRow)

  // The merged view: the timeline's follower count beside the handle history
  // only AboutAccountQuery carries.
  const info = await getBioInfo(userName)

  // Again, now that React has had the length of the lookup to render the card:
  // whichever answer is right by this point is the one that stays.
  syncBioRow(wrap, card, info.bio)

  syncAccountCard(wrap, card, infoRow, info.facts)
  syncShareButton(card, infoRow, userName, info.displayName ?? '')

  // The lookup may have added rules the bio alone could not offer.
  syncExceptionButton({ host: wrap, userName, data, info, place })
  // Again: React often fills the card in after the first pass, and the bio is
  // the part being marked.
  void markKeywords()

  if (!data) return
  applyFiltersForUser(userName, data, { hideNow: false })
}

// Process primary tweet author on status pages
function primaryTweetTarget(): {
  tweet: Element
  userNameEl: Element
  userName: string
} | null {
  if (!/\/status\/\d+/.test(location.pathname)) return null

  const tweet = document.querySelector(SEL_PRIMARY_TWEET)
  if (!tweet) return null

  const userNameEl = getNameEl(tweet)
  if (!userNameEl) return null

  const userName = screenNameFromHref(
    userNameEl.querySelector('a[href]')?.getAttribute('href'),
  )
  if (!userName) return null

  return { tweet, userNameEl, userName }
}

// Inline, because X only sometimes opens a hover card for the account a status
// page is about — measured August 2026 — and that is no place for a control.
async function syncPrimaryExceptionButton(): Promise<void> {
  const target = primaryTweetTarget()
  if (!target) return
  const { userNameEl, userName } = target

  // getBioInfo reads the record that decided the highlight, so the button cannot
  // disagree with what it undoes. The location has no such view, so: the cache.
  const [info, data] = await Promise.all([
    getBioInfo(userName),
    getCached(userName),
  ])

  // After the awaits: two rule changes in quick succession put two of these in
  // flight, and a stale handle appends a duplicate instead of replacing it.
  syncExceptionButton({
    host: userNameEl,
    userName,
    data,
    info,
    place: (btn) => {
      const anchor =
        userNameEl.querySelector('.x-loc-info') ?? userNameEl.children[1]
      if (anchor) anchor.insertAdjacentElement('afterend', btn)
      else userNameEl.appendChild(btn)
    },
  })
}

async function processPrimaryTweet() {
  const target = primaryTweetTarget()
  if (!target) return

  const { tweet, userNameEl, userName } = target
  if (tweet.getAttribute(PRIMARY_TWEET_ATTR)) return
  tweet.setAttribute(PRIMARY_TWEET_ATTR, '1')

  void syncPrimaryExceptionButton()

  const data = await fetchLocationData(userName)

  let row: HTMLElement | null = null
  if (data === null && isRateLimited()) {
    row = buildRateLimitRow(() => {
      tweet.removeAttribute(PRIMARY_TWEET_ATTR)
      void processPrimaryTweet()
    })
  } else if (hasLocationToShow(data)) {
    row = buildInfoRow(data, userName)
  }

  if (!row) return

  // Searched, not read off nextElementSibling: the exception button can already
  // sit between the two.
  if (nameLineHasInfoRow(userNameEl)) return

  const handleDiv = userNameEl.children[1] as Element | undefined
  ;(row as HTMLElement).style.marginTop = '2px'
  if (handleDiv) {
    handleDiv.insertAdjacentElement('afterend', row)
  } else {
    userNameEl.appendChild(row)
  }
}

// Share a post with its location flags. The context-menu click arrives in the
// worker, which knows the tab but not the element — so it is remembered here.
let lastRightClickedTweet: Element | null = null

document.addEventListener(
  'contextmenu',
  (e) => {
    const target = e.target
    lastRightClickedTweet =
      target instanceof Element ? target.closest(SEL_TWEET) : null
  },
  true,
)

// X gives a card no link back to the post the pointer was on, so the anchor is
// remembered as the pointer enters the profile link.
let lastHoveredTweet: { article: Element; userName: string } | null = null

document.addEventListener(
  'mouseover',
  (e) => {
    const target = e.target
    if (!(target instanceof Element)) return
    const link = target.closest('a[href]')
    if (!link) return
    const userName = screenNameFromHref(link.getAttribute('href'))
    if (!userName) return
    const article = link.closest(SEL_TWEET)
    if (article) lastHoveredTweet = { article, userName }
  },
  true,
)

/** The hover anchor first, then any post by the account still on screen. */
function postElementForAccount(userName: string): Element | null {
  const lc = userName.toLowerCase()

  if (
    lastHoveredTweet &&
    lastHoveredTweet.userName.toLowerCase() === lc &&
    lastHoveredTweet.article.isConnected
  ) {
    return lastHoveredTweet.article
  }

  for (const article of Array.from(
    document.querySelectorAll<Element>(SEL_TWEET),
  )) {
    if (extractTweetUserInfo(article).userName?.toLowerCase() === lc) {
      return article
    }
  }
  return null
}

/** One path for both entry points, so the wording and the "never spend a
 *  lookup" rule can't drift. The drawn card is the fallback. */
async function shareCardFor(
  userName: string,
  displayName: string,
  article: Element | null,
): Promise<void> {
  renderLocationToast(t('toastRendering', userName), true)

  // Whatever is already known: a share must never spend a lookup on a card.
  const data = (await getCached(userName)) ?? {
    location: null,
    locationAccurate: true,
    source: null,
  }

  const deliver = async (blob: Blob) => {
    const where = await deliverShareCard(blob, `x-pat-${userName}.png`)
    renderLocationToast(
      where === 'clipboard' ? t('toastCopied') : t('toastSaved'),
    )
  }

  // A collapsed post would snapshot as its placeholder, styles and all, so it
  // goes to the drawn card instead.
  const snapshotable =
    article &&
    !article.hasAttribute(HIDDEN_ATTR) &&
    !article.hasAttribute(HIDDEN_REVEALED_ATTR)

  if (snapshotable) {
    const background = getComputedStyle(document.body).backgroundColor || '#fff'
    try {
      await deliver(
        await snapshotElement(article, {
          background,
          decorate: (clone) => decorateSnapshot(clone, data),
          finish: {
            height: WATERMARK_BAND,
            draw: (ctx, size) => drawWatermark(ctx, { ...size, background }),
          },
        }),
      )
      return
    } catch {
      // Fall through to the drawn card.
    }
  }

  try {
    await deliver(
      await renderShareCard({
        userName,
        displayName:
          displayName || (await getBioInfo(userName)).displayName || '',
        text: article ? tweetText(article) : '',
        data,
      }),
    )
  } catch {
    renderLocationToast(t('toastRenderFail'))
  }
}

async function shareLastRightClickedPost(): Promise<void> {
  if (!isEnabled()) return
  const article =
    lastRightClickedTweet ?? document.querySelector(SEL_PRIMARY_TWEET)
  if (!article) {
    renderLocationToast(t('toastRightClick'))
    return
  }

  const { userName, displayName } = extractTweetUserInfo(article)
  if (!userName) {
    renderLocationToast(t('toastReadFail'))
    return
  }

  await shareCardFor(userName, displayName, article)
}

/** A second way in: a feature reachable only by right-clicking goes unfound. */
function buildShareButton(userName: string, displayName: string): HTMLElement {
  const btn = document.createElement('button')
  btn.className = 'x-loc-share-btn'
  btn.type = 'button'
  btn.textContent = t('shareBtn')
  btn.title = t('shareBtnTitle', userName)

  btn.addEventListener('click', (e) => {
    e.preventDefault()
    e.stopPropagation()
    void shareCardFor(userName, displayName, postElementForAccount(userName))
  })

  return btn
}

// MutationObserver
/** A node added to the timeline is sometimes the article, sometimes its container. */
function eachMatching(
  node: Element,
  selector: string,
  fn: (el: Element) => void,
): void {
  if (node.matches(selector)) fn(node)
  else node.querySelectorAll<Element>(selector).forEach(fn)
}

function decorateTweet(article: Element): void {
  // First and synchronously, before this node is laid out even once: everything
  // below waits on a cache read, by which time collapsing is a resize.
  applyKnownHide(article)
  tryHighlightArticle(article)
  tryInjectFeedLocation(article)
  tryHideArticle(article)
  tryMarkArticle(article)
}

function startObserver() {
  const observer = new MutationObserver((mutations) => {
    // One gate for the whole script: with the master switch off nothing is
    // injected, nothing is looked up, and X renders as if uninstalled.
    if (!isEnabled()) return
    // Deduplicate within a single batch so we don't call processCard twice
    // for the same card if multiple child nodes are added in one mutation.
    const seen = new Set<Element>()

    function tryProcess(card: Element) {
      if (!seen.has(card)) {
        seen.add(card)
        processCard(card)
      }
    }

    const nodes = mutations
      .flatMap((m) => Array.from(m.addedNodes))
      .filter((n): n is Element => n instanceof Element)

    for (const node of nodes) {
      eachMatching(node, SEL_TWEET, decorateTweet)
      // People rows are their own surface — Followers/Following/search have no
      // tweet articles at all, so they'd otherwise never be looked at.
      eachMatching(node, SEL_USER_CELL, (cell) => void tryMarkPeopleCell(cell))
    }

    for (const node of nodes) {
      const card =
        node.closest(SEL_HOVER_CARD) ?? node.querySelector(SEL_HOVER_CARD)
      if (card) {
        tryProcess(card as Element)
        break
      }

      if (node.matches(SEL_TWEET) || node.querySelector(SEL_TWEET)) {
        processPrimaryTweet()
        break
      }
    }
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

// Swipe-right on a tweet to fetch location (mobile)
const SWIPE_MIN_X = 40 // px of rightward travel before the gesture commits
const SWIPE_MAX_Y = 50 // px of vertical drift still counted as horizontal
const SWIPE_X_DOMINANCE = 1.5 // dx must beat dy by this factor

/** The dominance ratio is for mid-drag, where a vertical fling starts diagonal. */
export function isCommittedSwipe(dx: number, dy: number): boolean {
  const drift = Math.abs(dy)
  if (dx < SWIPE_MIN_X || drift > SWIPE_MAX_Y) return false
  return dx >= drift * SWIPE_X_DOMINANCE
}

function tweetFromTouch(e: TouchEvent): Element | null {
  const target = e.target
  return target instanceof Element ? target.closest<Element>(SEL_TWEET) : null
}

async function revealLocationForSwipe(article: Element) {
  if (!isEnabled()) return
  const { userName } = extractTweetUserInfo(article)
  if (!userName) return

  // Acknowledge the gesture now; the lookup may take a network round trip and
  // a swipe that appears to do nothing invites the user to swipe again.
  renderLocationToast(t('toastLookingUp', userName), true)

  const data = await fetchLocationData(userName, { manual: true })
  if (!data || !locationSummaryText(data, userName)) {
    // "X knows nothing" and "we couldn't ask" are different answers, and the
    // rate-limit toast owns this corner when it is the second.
    const rateLimited = isRateLimited()
    if (rateLimited || !hasApiHeaders()) {
      dismissLocationToast()
      // The explanation the corner promises, even if the user clicked it away
      // earlier — the swipe asked for it back.
      if (rateLimited) showRateLimitToast(true)
    } else {
      renderLocationToast(t('toastNoLocation'))
    }
    return
  }

  // Inject below username even if showLocationInFeed is off — user explicitly swiped
  const userNameEl = getNameEl(article)
  if (userNameEl && !nameLineHasInfoRow(userNameEl)) {
    article.setAttribute(FEED_LOCATION_ATTR, '1')
    const row = buildInfoRow(data, userName)
    row.classList.add('x-loc-feed-row')
    row.setAttribute(FEED_ROW_KEY_ATTR, feedRowKey(data))
    userNameEl.insertAdjacentElement('afterend', row)
  }

  showLocationOverlay(data, userName)
}

/** Commits mid-drag; touchend is the backstop for an unreported flick. */
function startSwipeListener() {
  let startX = 0
  let startY = 0
  let article: Element | null = null
  let handled = true

  document.body.addEventListener(
    'touchstart',
    (e: TouchEvent) => {
      // A second finger is a pinch or a two-finger scroll, never a swipe — and
      // it would otherwise re-origin the gesture already in progress.
      if (e.touches.length > 1) {
        handled = true
        article = null
        return
      }
      const touch = e.touches[0]
      if (!touch) return
      startX = touch.clientX
      startY = touch.clientY
      article = tweetFromTouch(e)
      handled = false
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchmove',
    (e: TouchEvent) => {
      if (handled || !article) return
      const touch = e.touches[0]
      if (!touch) return
      if (!isCommittedSwipe(touch.clientX - startX, touch.clientY - startY)) {
        return
      }
      handled = true
      void revealLocationForSwipe(article)
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchend',
    (e: TouchEvent) => {
      const swiped = article
      article = null
      if (handled || !swiped) return
      handled = true

      const touch = e.changedTouches[0]
      if (!touch) return
      if (!isCommittedSwipe(touch.clientX - startX, touch.clientY - startY)) {
        return
      }
      void revealLocationForSwipe(swiped)
    },
    { passive: true },
  )

  document.body.addEventListener(
    'touchcancel',
    () => {
      handled = true
      article = null
    },
    { passive: true },
  )
}

// Listen for captured headers from page-script
window.addEventListener(EVENTS.HEADERS_CAPTURED, (e: Event) => {
  const headers = (e as CustomEvent).detail?.headers
  if (headers?.authorization) {
    setApiHeaders(headers)
    // Auth just became available — a wanted poller can start now.
    syncPoller()
  }
})

// Listen for user bio data intercepted from timeline/tweet API responses
// Confirmed hits only, so a flag can show without a per-profile X call.
async function applySharedHits(userNames: string[]) {
  const hits = await sharedBatchLookup(await unknownNames(userNames))
  for (const hit of hits) {
    await mergeCached(hit.userName, hit.data)
    const full = await getCached(hit.userName)
    if (full) {
      applyFiltersForUser(hit.userName, full)
    }
  }
}

// Background location lookups. The queue and the pace live in the service
// worker; this end only asks and fetches.
const poller = new PrefetchPoller({
  next: () => askBroker<NextInstruction>({ type: MSG.NEXT }),
  fetch: async (userName, revalidate) => {
    const data = await fetchLocationData(userName, {
      granted: true,
      revalidate,
    })
    if (data) {
      applyFiltersForUser(userName, data)
    }
  },
})

async function cachedAnswer(
  userName: string,
): Promise<LocationData | undefined> {
  const cached = await getCached(userName)
  return cached && (cached.location || cached.source) ? cached : undefined
}

/** Whether this tab can already answer for the account without asking anyone. */
async function locallyAnswered(userName: string): Promise<boolean> {
  if (answeredThisSession(userName)) return true
  return (await cachedAnswer(userName)) !== undefined
}

/** Names this tab already answered never reach the broker or the community
 *  cache — neither can read x.com's IndexedDB to check for itself. */
async function unknownNames(userNames: string[]): Promise<string[]> {
  const known = await Promise.all(userNames.map(locallyAnswered))
  return userNames.filter((_, i) => !known[i])
}

interface RankedHandle {
  userName: string
  votes: number
}

function shuffled<T>(items: T[]): T[] {
  const pool = [...items]
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[pool[i], pool[j]] = [pool[j]!, pool[i]!]
  }
  return pool
}

/** Least-corroborated first; ties at random, or a feed re-offers the same
 *  names all session. How many go out is the broker's. */
function leastVotedFirst(known: RankedHandle[]): string[] {
  return shuffled(known)
    .sort((a, b) => a.votes - b.votes)
    .map((k) => k.userName)
}

async function enqueueForLookup(
  candidates: PrefetchCandidate[],
): Promise<void> {
  // Answered this session already cost a request, whatever the cache holds —
  // so those never reach IDB, let alone the broker.
  const unasked = candidates.filter((c) => !answeredThisSession(c.userName))
  const answers = await Promise.all(
    unasked.map((c) => cachedAnswer(c.userName)),
  )
  const unknown: PrefetchCandidate[] = []
  // A first-hand answer about one is a fresher location and one more vote.
  const known: RankedHandle[] = []

  unasked.forEach((candidate, i) => {
    const answer = answers[i]
    if (!answer) unknown.push(candidate)
    else known.push({ userName: candidate.userName, votes: answer.votes ?? 0 })
  })

  if (unknown.length === 0 && known.length === 0) return
  await askBroker({
    type: MSG.ENQUEUE,
    candidates: unknown,
    revalidate: leastVotedFirst(known),
  })
  poller.wake()
}

// Prefetch exists to warm the shared cache, so opting out of that switches it
// off too. Settings only — prefetchWanted() adds the runtime requirements.
function prefetchAllowedBySettings(): boolean {
  if (!isEnabled()) return false
  if (!prefetchEnabled) return false
  return !isSharedCacheConfigured() || isSharedCacheEnabled()
}
function prefetchWanted(): boolean {
  return prefetchAllowedBySettings() && hasApiHeaders()
}
function syncPoller(): void {
  if (prefetchWanted()) poller.start()
  else poller.stop()
}

window.addEventListener(EVENTS.USERS_DATA, (e: Event) => {
  if (!isEnabled()) return
  const users = (e as CustomEvent).detail?.users as
    | Array<{
        userName: string
        displayName: string | null
        bio: string | null
        facts?: Partial<AccountFacts>
        priority?: PrefetchPriority
      }>
    | undefined
  if (!users) return
  void applySharedHits(users.map((u) => u.userName))
  // Queued before auth headers arrive; syncPoller() starts the draining.
  // Timeline order within the batch; the batch itself jumps the queue.
  if (prefetchAllowedBySettings()) {
    void enqueueForLookup(
      users.map((u) => ({
        userName: u.userName,
        priority: u.priority ?? 'high',
      })),
    )
  }
  for (const { userName, displayName, bio, facts } of users) {
    // Synchronously, so highlighting can read them without racing mergeCached.
    rememberBio(userName, bio, displayName ?? null, facts)

    const patch: Parameters<typeof mergeCached>[1] = { bio: bio ?? null }
    if (displayName) patch.displayName = displayName
    if (facts && Object.keys(facts).length > 0) patch.facts = facts
    mergeCached(userName, patch)
    if (shouldHighlight(userName, displayName ?? '', bio)) {
      markHighlightedArticles(userName)
    }
  }

  // Bios land here, so this is the first moment the primary tweet's account can
  // be known to match a rule — processPrimaryTweet usually runs before it.
  void syncPrimaryExceptionButton()
})

// Init
injectStyles()
startObserver()
startSwipeListener()
cleanupCache()
// Nothing is gated on this: it only redraws when the reader chose a language
// the browser would not have picked.
void initI18n().then((chosen) => {
  if (chosen) relocalize()
})
// Send any buffered community-cache contributions before the tab goes away, so
// the long 30s batching window doesn't strand a batch until the next session.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushContributions()
})
window.addEventListener('pagehide', () => flushContributions())
// Replays headers captured before this script attached its listener. The bios
// replay waits for the settings load, or it runs against empty keywords.
window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_HEADERS))
