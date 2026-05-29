// content.tsx — plain DOM, no React/Preact
import { cleanupCache, clearAllCache, getCached, mergeCached } from './cache';
import { matchesAnyKeyword, setKeywords } from './keywords';
import type { LocationData } from './cache';
import { BLOCKED_COUNTRIES_KEY, COUNTRY_FLAGS, HIGHLIGHT_FLAGS_KEY, HIGHLIGHT_KEYWORDS_KEY, REGION_ABBR, REGION_FLAGS, SHOW_LOCATION_IN_FEED_KEY } from './countries';
import { isMobile } from './device';
import { EVENTS, X_GRAPHQL_PATH } from './constants';

const QUERY_ID = 'XRqGa7EeokUU5kppkh13EA';
const API_BASE = `https://${X_GRAPHQL_PATH}`;
const ABOUT_ACCOUNT_URL = `${API_BASE}/${QUERY_ID}/AboutAccountQuery`;

// X related selectors
const SEL_HOVER_CARD = '[data-testid="HoverCard"]';
const SEL_USER_NAME = '[data-testid="UserName"] a[href]';
const SEL_USER_NAME_ALT = '[data-testid="User-Name"] a[href]';
const SEL_TWEET = 'article[data-testid="tweet"]';
const SEL_PRIMARY_TWEET = `${SEL_TWEET}[tabindex="-1"]`;
const PRIMARY_TWEET_ATTR = 'data-x-loc-primary-done';
const RESET_DEFAULT = 60 * 5 * 1000;
const RE_SCREEN_NAME_HREF = /^\/([A-Za-z0-9_]{1,50})$/;
const RE_AT_MENTION = /^@[A-Za-z0-9_]{1,50}$/;
const RE_MOBILE_SOURCE = /android\s+app|app\s+store/i;
const RE_MOBILE_SOURCE_STRIP = /\s*(android\s+app|app\s+store)/i;

// ---------------------------------------------------------------------------
// Blocked countries (loaded from chrome.storage.local, set via options page)
// ---------------------------------------------------------------------------
let blockedCountries = new Set<string>();
let highlightKeywords = new Set<string>();
let highlightFlagsEnabled = false;
let highlightFlagsThreshold = 2;
let highlightFlagsUniqueOnly = false;
let showLocationInFeed = false;

chrome.storage.local.get([BLOCKED_COUNTRIES_KEY, HIGHLIGHT_KEYWORDS_KEY, HIGHLIGHT_FLAGS_KEY, SHOW_LOCATION_IN_FEED_KEY]).then((result) => {
  const r = result as Record<string, unknown>;
  blockedCountries = new Set<string>(Array.isArray(r[BLOCKED_COUNTRIES_KEY]) ? r[BLOCKED_COUNTRIES_KEY] as string[] : []);
  highlightKeywords = new Set<string>(
    Array.isArray(r[HIGHLIGHT_KEYWORDS_KEY]) ? (r[HIGHLIGHT_KEYWORDS_KEY] as string[]).map((k) => k.toLowerCase()) : [],
  );
  setKeywords([...highlightKeywords]);
  const flags = r[HIGHLIGHT_FLAGS_KEY] as { enabled?: boolean; threshold?: number; uniqueOnly?: boolean } | undefined;
  highlightFlagsEnabled = flags?.enabled ?? false;
  highlightFlagsThreshold = flags?.threshold ?? 2;
  highlightFlagsUniqueOnly = flags?.uniqueOnly ?? false;
  // Default to true on mobile when the user hasn't explicitly set the preference yet
  showLocationInFeed = SHOW_LOCATION_IN_FEED_KEY in r ? Boolean(r[SHOW_LOCATION_IN_FEED_KEY]) : isMobile;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes[BLOCKED_COUNTRIES_KEY]) {
    const next = changes[BLOCKED_COUNTRIES_KEY].newValue;
    blockedCountries = new Set<string>(Array.isArray(next) ? next : []);
  }
  if (changes[HIGHLIGHT_KEYWORDS_KEY]) {
    const next = changes[HIGHLIGHT_KEYWORDS_KEY].newValue;
    highlightKeywords = new Set<string>(Array.isArray(next) ? (next as string[]).map((k) => k.toLowerCase()) : []);
    setKeywords([...highlightKeywords]);
    rehighlightAll();
  }
  if (changes[HIGHLIGHT_FLAGS_KEY]) {
    const next = changes[HIGHLIGHT_FLAGS_KEY].newValue as { enabled?: boolean; threshold?: number; uniqueOnly?: boolean } | undefined;
    highlightFlagsEnabled = next?.enabled ?? false;
    highlightFlagsThreshold = next?.threshold ?? 2;
    highlightFlagsUniqueOnly = next?.uniqueOnly ?? false;
    rehighlightAll();
  }
  if (changes[SHOW_LOCATION_IN_FEED_KEY]) {
    showLocationInFeed = Boolean(changes[SHOW_LOCATION_IN_FEED_KEY].newValue);
    refreshFeedLocations();
  }
});

function getLocationDisplay(loc: string): { emoji: string; label: string; isText?: boolean } {
  if (blockedCountries.has(loc)) return { emoji: '⚠️', label: loc };
  if (COUNTRY_FLAGS[loc]) return { emoji: COUNTRY_FLAGS[loc], label: loc };
  if (REGION_FLAGS[loc]) {
    const abbr = REGION_ABBR[loc];
    return abbr
      ? { emoji: abbr, label: loc, isText: true }
      : { emoji: REGION_FLAGS[loc], label: loc };
  }
  return { emoji: '🌐', label: loc };
}

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------
export let apiHeaders: Record<string, string> | null = null;
export function setApiHeaders(h: Record<string, string> | null) { apiHeaders = h; }

class NormalizedMap<V> {
  private map = new Map<string, V>();
  private key(name: string) { return name.toLowerCase(); }
  has(name: string) { return this.map.has(this.key(name)); }
  get(name: string) { return this.map.get(this.key(name)); }
  set(name: string, value: V) { this.map.set(this.key(name), value); }
  delete(name: string) { return this.map.delete(this.key(name)); }
}
// Tracks users whose location was already fetched via API this session,
// so repeat hovers skip the network and read from IDB instead.
const checkedThisSession = new Set<string>();
// Shared promises — lets concurrent processCard calls for the same user
// await the same in-flight fetch instead of getting null immediately.
const pendingMap = new NormalizedMap<Promise<LocationData | null>>();
let rateLimitResetAt = 0;
let rateLimitToastInterval: ReturnType<typeof setInterval> | null = null;

export function __testResetState() {
  checkedThisSession.clear();
  rateLimitResetAt = 0;
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === 'CLEAR_CACHE') {
    checkedThisSession.clear();
    clearAllCache();
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
}

// ---------------------------------------------------------------------------
// Rate limit toast
// ---------------------------------------------------------------------------
function showRateLimitToast() {
  let toast = document.getElementById('x-loc-rate-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'x-loc-rate-toast';
    document.body.appendChild(toast);
  }

  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval);

  function tick() {
    const remaining = rateLimitResetAt - Date.now();
    const t = document.getElementById('x-loc-rate-toast');
    if (remaining <= 0 || !t) {
      if (rateLimitToastInterval) clearInterval(rateLimitToastInterval);
      rateLimitToastInterval = null;
      t?.remove();
      return;
    }
    t.textContent = `⚠ Rate limit hit · resets in ${formatCountdown(remaining)}`;
  }

  tick();
  rateLimitToastInterval = setInterval(tick, 1000);
}

// ---------------------------------------------------------------------------
// Location overlay toast (mobile swipe feedback)
// ---------------------------------------------------------------------------
let locationToastTimer: ReturnType<typeof setTimeout> | null = null;

function showLocationOverlay(data: LocationData) {
  const existing = document.getElementById('x-loc-location-toast');
  existing?.remove();
  if (locationToastTimer) clearTimeout(locationToastTimer);

  const mobileSource = RE_MOBILE_SOURCE.test(data.source ?? '');
  const sourceCountry = mobileSource
    ? (data.source?.replace(RE_MOBILE_SOURCE_STRIP, '').trim() || null)
    : null;
  const vpn = data.locationAccurate === false;

  let text = '';
  if (sourceCountry) {
    if (sourceCountry === data.location) {
      // AppStore and location agree — reliable, no VPN badge needed
      const { emoji } = getLocationDisplay(sourceCountry);
      text = `${emoji} ${sourceCountry}`;
    } else {
      // AppStore and location differ — show AppStore country as more reliable signal
      const { emoji } = getLocationDisplay(sourceCountry);
      text = `${emoji} ${sourceCountry}`;
      if (vpn) text += ' · ⚠ VPN';
    }
  } else {
    if (data.location) {
      const { emoji } = getLocationDisplay(data.location);
      text = `${emoji} ${data.location}`;
    }
    if (vpn) text += (text ? ' · ' : '') + '⚠ VPN';
  }
  if (!text) return;

  const toast = document.createElement('div');
  toast.id = 'x-loc-location-toast';
  toast.textContent = text;
  document.body.appendChild(toast);

  locationToastTimer = setTimeout(() => toast.remove(), 2500);
}

// ---------------------------------------------------------------------------
// API fetch
// ---------------------------------------------------------------------------
export async function fetchLocationData(userName: string): Promise<LocationData | null> {
  if (pendingMap.has(userName)) return pendingMap.get(userName)!;

  // Capture snapshot so the IIFE always uses the headers that were valid at
  // call time, even if apiHeaders is updated mid-flight.
  const capturedHeaders = apiHeaders;

  const promise = (async (): Promise<LocationData | null> => {
    const stored = await getCached(userName);

    // Skip the network if location data is already in IDB.
    // Bio-only entries (location: null, source: null) fall through.
    if (stored?.location || stored?.source) return stored;

    // Already ran the API lookup this session — return whatever IDB has (may include bio).
    if (checkedThisSession.has(userName.toLowerCase())) return stored ?? null;

    // Don't attempt without intercepted headers — avoids failures before
    // the page-script captures the session.
    if (!capturedHeaders) return null;

    if (rateLimitResetAt > Date.now()) {
      showRateLimitToast();
      return null;
    }

    try {
      const variables = JSON.stringify({ screenName: userName });
      const url = `${ABOUT_ACCOUNT_URL}?variables=${encodeURIComponent(variables)}`;

      const headers: Record<string, string> = {
        'authorization': capturedHeaders.authorization,
        'content-type': 'application/json',
        'x-twitter-client-language': capturedHeaders['x-twitter-client-language'] ?? 'en',
        'x-twitter-active-user': capturedHeaders['x-twitter-active-user'] ?? 'yes',
      };

      if (capturedHeaders['x-csrf-token']) {
        headers['x-csrf-token'] = capturedHeaders['x-csrf-token'];
      } else {
        const ct0 = getCookie('ct0');
        if (ct0) headers['x-csrf-token'] = ct0;
      }

      const resp = await fetch(url, {
        method: 'GET',
        headers,
        credentials: 'include',
      });

      if (resp.status === 429) {
        const reset = resp.headers.get('x-rate-limit-reset');
        rateLimitResetAt = reset ? parseInt(reset) * 1000 : Date.now() + RESET_DEFAULT;
        showRateLimitToast();
        return null;
      }

      if (!resp.ok) return null;

      checkedThisSession.add(userName.toLowerCase());

      const json = await resp.json();
      const profile =
        json?.data?.user_result_by_screen_name?.result?.about_profile ?? null;

      if (!profile) return stored ?? null;

      const data: LocationData = {
        bio: stored?.bio ?? null,
        location: profile.account_based_in ?? null,
        locationAccurate: profile.location_accurate !== false,
        source: profile.source ?? null,
      };
      await mergeCached(userName, data);
      return data;
    } catch {
      return null;
    }
  })();

  pendingMap.set(userName, promise);
  promise.finally(() => pendingMap.delete(userName));
  return promise;
}

// ---------------------------------------------------------------------------
// Inject CSS once
// ---------------------------------------------------------------------------
function injectStyles() {
  if (document.getElementById('x-loc-styles')) return;
  const style = document.createElement('style');
  style.id = 'x-loc-styles';
  style.textContent = `
.x-loc-info {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
}
.x-loc-icon {
  font-size: 20px;
  line-height: 1;
  cursor: default;
  display: inline-flex;
  align-items: center;
  user-select: none;
}
.x-loc-icon-flag {
  font-size: 26px;
}
.x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.x-loc-store-block .x-loc-icon-flag {
  font-size: 16px;
}
.x-loc-store-block .x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 11px;
}
.x-loc-store-block {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 4px;
  padding: 1px 4px;
  margin-left: 4px;
  cursor: default;
  user-select: none;
}
.x-loc-icon-ratelimit {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(180, 120, 0, 0.12);
  color: rgb(160, 100, 0);
  border: 1px solid rgba(180, 120, 0, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
.x-loc-icon-vpn {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(220, 38, 38, 0.15);
  color: rgb(200, 25, 25);
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
#x-loc-rate-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(220, 38, 38, 0.55);
}
#x-loc-location-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(29, 155, 240, 0.55);
}
article[data-x-loc-highlighted] {
  border-left: 3px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.05) !important;
}
`;
  (document.head || document.documentElement).appendChild(style);
}

// ---------------------------------------------------------------------------
// Keyword highlight helpers
// ---------------------------------------------------------------------------

function getNameEl(el: Element): Element | null {
  return el.querySelector('[data-testid="User-Name"]') ?? el.querySelector('[data-testid="UserName"]');
}

function countFlagsInBio(bio: string): number {
  const matches = bio.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) ?? [];
  return highlightFlagsUniqueOnly ? new Set(matches).size : matches.length;
}

function extractTweetUserInfo(article: Element): { userName: string | null; displayName: string } {
  const userNameEl = getNameEl(article);
  if (!userNameEl) return { userName: null, displayName: '' };
  let userName: string | null = null;
  let displayName = '';
  for (const link of Array.from(userNameEl.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
    const href = link.getAttribute('href') ?? '';
    const m = href.match(RE_SCREEN_NAME_HREF);
    if (!m) continue;
    if (!userName) userName = m[1];
    const text = link.textContent?.trim() ?? '';
    if (text && !text.startsWith('@') && !displayName) displayName = text;
  }
  return { userName, displayName };
}

function shouldHighlight(userName: string, displayName: string, bio: string | null | undefined): boolean {
  if (matchesAnyKeyword(`${userName} ${displayName} ${bio ?? ''}`)) return true;
  if (highlightFlagsEnabled && countFlagsInBio(`${userName} ${displayName} ${bio ?? ''}`) > highlightFlagsThreshold) return true;
  return false;
}

async function tryHighlightArticle(article: Element) {
  if (highlightKeywords.size === 0 && !highlightFlagsEnabled) return;
  if (article.hasAttribute('data-x-loc-highlighted')) return;
  const { userName, displayName } = extractTweetUserInfo(article);
  if (!userName) return;
  const data = await getCached(userName);
  if (shouldHighlight(userName, displayName || data?.displayName || '', data?.bio)) {
    article.setAttribute('data-x-loc-highlighted', '1');
  }
}

function rehighlightAll() {
  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET));
  if (highlightKeywords.size === 0 && !highlightFlagsEnabled) {
    articles.forEach((a) => a.removeAttribute('data-x-loc-highlighted'));
    return;
  }
  articles.forEach((a) => {
    a.removeAttribute('data-x-loc-highlighted');
    tryHighlightArticle(a);
  });
}

const FEED_LOCATION_ATTR = 'data-x-loc-feed-done';

async function tryInjectFeedLocation(article: Element) {
  if (!showLocationInFeed) return;
  if (article.getAttribute(FEED_LOCATION_ATTR)) return;
  if (article.matches(SEL_PRIMARY_TWEET)) return;

  const { userName } = extractTweetUserInfo(article);
  if (!userName) return;

  article.setAttribute(FEED_LOCATION_ATTR, '1');

  const data = await getCached(userName);
  if (!data || (!data.location && data.locationAccurate && !data.source)) return;

  const userNameEl = getNameEl(article);
  if (!userNameEl) return;

  if (article.querySelector('.x-loc-feed-row')) return;

  const row = buildInfoRow(data);
  row.classList.add('x-loc-feed-row');
  userNameEl.insertAdjacentElement('afterend', row);
}

function injectFeedLocationForUser(userName: string, data: LocationData) {
  if (!showLocationInFeed) return;
  if (!data.location && data.locationAccurate && !data.source) return;
  const lc = userName.toLowerCase();
  document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
    if (extractTweetUserInfo(article).userName?.toLowerCase() !== lc) return;
    if (article.matches(SEL_PRIMARY_TWEET)) return;
    const userNameEl = getNameEl(article);
    if (!userNameEl || article.querySelector('.x-loc-feed-row')) return;
    article.setAttribute(FEED_LOCATION_ATTR, '1');
    const row = buildInfoRow(data);
    row.classList.add('x-loc-feed-row');
    userNameEl.insertAdjacentElement('afterend', row);
  });
}

function refreshFeedLocations() {
  const articles = Array.from(document.querySelectorAll<Element>(SEL_TWEET));
  if (!showLocationInFeed) {
    articles.forEach((a) => {
      a.removeAttribute(FEED_LOCATION_ATTR);
      a.querySelectorAll('.x-loc-feed-row').forEach((el) => el.remove());
    });
    return;
  }
  articles.forEach((a) => {
    a.removeAttribute(FEED_LOCATION_ATTR);
    tryInjectFeedLocation(a);
  });
}

// ---------------------------------------------------------------------------
// Extract screen name from hover card
// ---------------------------------------------------------------------------
function extractScreenName(card: Element): string | null {
  // Try data-testid="UserName" or "User-Name"
  const nameEl =
    card.querySelector(SEL_USER_NAME) ??
    card.querySelector(SEL_USER_NAME_ALT);
  if (nameEl) {
    const href = nameEl.getAttribute('href') ?? '';
    const match = href.match(RE_SCREEN_NAME_HREF);
    if (match) return match[1];
  }

  // Fallback: find a span with @username text
  const spans = card.querySelectorAll('span');
  for (const span of Array.from(spans)) {
    const text = span.textContent?.trim() ?? '';
    if (RE_AT_MENTION.test(text)) {
      return text.slice(1);
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Build info row DOM element
// ---------------------------------------------------------------------------
function makeIcon(emoji: string, tooltip: string): HTMLElement {
  const span = document.createElement('span');
  span.className = 'x-loc-icon';
  span.textContent = emoji;
  span.title = tooltip;
  return span;
}

function buildInfoRow(data: LocationData): HTMLElement {
  const row = document.createElement('div');
  row.className = 'x-loc-info';

  const mobileSource = RE_MOBILE_SOURCE.test(data?.source ?? '');
  const sourceCountry = mobileSource
    && data.source?.replace(RE_MOBILE_SOURCE_STRIP, '').trim() || null;

  if (sourceCountry) {
    const { emoji: storeFlag, isText: storeFlagIsText } = getLocationDisplay(sourceCountry);
    const block = document.createElement('span');
    block.className = 'x-loc-store-block';
    block.title = data.source!;

    const phone = document.createElement('span');
    phone.textContent = '📱';

    const flag = document.createElement('span');
    flag.className = `x-loc-icon-flag ${storeFlagIsText ? 'x-loc-icon-abbr' : ''}`;
    flag.textContent = storeFlag;

    block.appendChild(phone);
    block.appendChild(flag);
    row.appendChild(block);
  }

  if (data?.location) {
    const { emoji, label, isText } = getLocationDisplay(data.location);
    const icon = makeIcon(emoji, label);
    icon.classList.add('x-loc-icon-flag');
    if (isText) icon.classList.add('x-loc-icon-abbr');
    row.appendChild(icon);
  }

  if (data?.locationAccurate === false) {
    const vpn = document.createElement('span');
    vpn.className = 'x-loc-icon-vpn';
    vpn.title = 'VPN used, location can be inaccurate';
    vpn.textContent = '⚠ VPN';
    row.appendChild(vpn);
  }

  return row;
}

function buildRateLimitRow(): HTMLElement {
  const row = document.createElement('div');
  row.className = 'x-loc-info';

  const badge = document.createElement('span');
  badge.className = 'x-loc-icon-ratelimit';
  badge.title = 'X API rate limit reached — location lookups paused until reset';
  badge.textContent = `⏱ ${formatCountdown(rateLimitResetAt - Date.now())}`;
  row.appendChild(badge);

  const interval = setInterval(() => {
    const remaining = rateLimitResetAt - Date.now();
    if (remaining <= 0 || !badge.isConnected) {
      clearInterval(interval);
      return;
    }
    badge.textContent = `⏱ ${formatCountdown(remaining)}`;
  }, 1000);

  return row;
}

// ---------------------------------------------------------------------------
// Insert a row element into a hover card at the right position
// ---------------------------------------------------------------------------
function insertIntoCard(card: Element, userName: string, el: HTMLElement) {
  const atSpan = Array.from(card.querySelectorAll('span')).find(
    (s) => s.textContent?.trim().toLowerCase() === `@${userName.toLowerCase()}`,
  );

  if (atSpan) {
    let node: Element | null = atSpan;
    while (node && node !== card) {
      const parent: Element | null = node.parentElement;
      if (!parent || parent === card) break;
      if (parent.children.length >= 3) {
        parent.insertBefore(el, node.nextSibling);
        return;
      }
      node = parent;
    }
  }

  (card.querySelector('div > div > div') ?? card).appendChild(el);
}

// ---------------------------------------------------------------------------
// Process a hover card
// ---------------------------------------------------------------------------
const HOVER_CARD_DONE_ATTR = 'data-x-loc-done';

async function processCard(card: Element) {
  if (card.getAttribute(HOVER_CARD_DONE_ATTR)) return;

  const userName = extractScreenName(card);
  // Don't mark done yet — card content may not be rendered. The observer will
  // retry when React adds content inside the card.
  if (!userName) return;

  card.setAttribute(HOVER_CARD_DONE_ATTR, '1');

  const data = await fetchLocationData(userName);

  if (data === null && rateLimitResetAt > Date.now()) {
    insertIntoCard(card, userName, buildRateLimitRow());
    return;
  }

  if (!data || (!data.location && data.locationAccurate && !data.source)) return;

  const row = buildInfoRow(data);
  insertIntoCard(card, userName, row);
  injectFeedLocationForUser(userName, data);
}

// ---------------------------------------------------------------------------
// Process primary tweet author on status pages
// ---------------------------------------------------------------------------
async function processPrimaryTweet() {
  if (!/\/status\/\d+/.test(location.pathname)) return;

  const tweet = document.querySelector(SEL_PRIMARY_TWEET);
  if (!tweet || tweet.getAttribute(PRIMARY_TWEET_ATTR)) return;

  const userNameEl = getNameEl(tweet);
  if (!userNameEl) return;

  const link = userNameEl.querySelector('a[href]');
  if (!link) return;

  const href = link.getAttribute('href') ?? '';
  const m = href.match(RE_SCREEN_NAME_HREF);
  if (!m) return;

  const userName = m[1];
  tweet.setAttribute(PRIMARY_TWEET_ATTR, '1');

  const data = await fetchLocationData(userName);

  let row: HTMLElement | null = null;
  if (data === null && rateLimitResetAt > Date.now()) {
    row = buildRateLimitRow();
  } else if (data && (data.location || !data.locationAccurate || data.source)) {
    row = buildInfoRow(data);
  }

  if (!row) return;

  // Guard against double-injection if React re-renders before await resolves
  const handleDiv = userNameEl.children[1] as Element | undefined;
  if (handleDiv?.nextElementSibling?.classList.contains('x-loc-info')) return;

  (row as HTMLElement).style.marginTop = '2px';
  if (handleDiv) {
    handleDiv.insertAdjacentElement('afterend', row);
  } else {
    userNameEl.appendChild(row);
  }
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------
function startObserver() {
  const observer = new MutationObserver((mutations) => {
    // Deduplicate within a single batch so we don't call processCard twice
    // for the same card if multiple child nodes are added in one mutation.
    const seen = new Set<Element>();

    function tryProcess(card: Element) {
      if (!seen.has(card)) {
        seen.add(card);
        processCard(card);
      }
    }

    const nodes = mutations
      .flatMap(m => Array.from(m.addedNodes))
      .filter((n): n is Element => n instanceof Element);

    // Highlight newly added tweets and inject cached feed locations
    for (const node of nodes) {
      if (node.matches(SEL_TWEET)) {
        tryHighlightArticle(node);
        tryInjectFeedLocation(node);
      } else {
        node.querySelectorAll<Element>(SEL_TWEET).forEach((t) => {
          tryHighlightArticle(t);
          tryInjectFeedLocation(t);
        });
      }
    }

    for (const node of nodes) {
      const card = node.closest(SEL_HOVER_CARD) ?? node.querySelector(SEL_HOVER_CARD);
      if (card) { tryProcess(card as Element); break; }

      if (node.matches(SEL_TWEET) || node.querySelector(SEL_TWEET)) {
        processPrimaryTweet(); break;
      }
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
}

// ---------------------------------------------------------------------------
// Swipe-right on a tweet to fetch location (mobile)
// ---------------------------------------------------------------------------
function startSwipeListener() {
  let startX = 0;
  let startY = 0;

  document.body.addEventListener('touchstart', (e: TouchEvent) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.body.addEventListener('touchend', async (e: TouchEvent) => {
    const dx = e.changedTouches[0].clientX - startX;
    const dy = Math.abs(e.changedTouches[0].clientY - startY);

    // Require a clear rightward swipe, not a vertical scroll or tap
    if (dx < 40 || dy > 50) return;

    const article = (e.target as Element).closest<Element>(SEL_TWEET);
    if (!article) return;

    const { userName } = extractTweetUserInfo(article);
    if (!userName) return;

    const data = await fetchLocationData(userName);
    if (!data || (!data.location && data.locationAccurate !== false && !data.source)) return;

    // Inject below username even if showLocationInFeed is off — user explicitly swiped
    if (!article.querySelector('.x-loc-feed-row')) {
      const userNameEl = getNameEl(article);
      if (userNameEl) {
        article.setAttribute(FEED_LOCATION_ATTR, '1');
        const row = buildInfoRow(data);
        row.classList.add('x-loc-feed-row');
        userNameEl.insertAdjacentElement('afterend', row);
      }
    }

    showLocationOverlay(data);
  }, { passive: true });
}

// ---------------------------------------------------------------------------
// Listen for captured headers from page-script
// ---------------------------------------------------------------------------
window.addEventListener(EVENTS.HEADERS_CAPTURED, (e: Event) => {
  const headers = (e as CustomEvent).detail?.headers;
  if (headers?.authorization) {
    apiHeaders = headers;
  }
});

// ---------------------------------------------------------------------------
// Listen for user bio data intercepted from timeline/tweet API responses
// ---------------------------------------------------------------------------
window.addEventListener(EVENTS.USERS_DATA, (e: Event) => {
  const users = (e as CustomEvent).detail?.users as Array<{ userName: string; displayName: string | null; bio: string | null }> | undefined;
  if (!users) return;
  for (const { userName, displayName, bio } of users) {
    const patch: Parameters<typeof mergeCached>[1] = { bio: bio ?? null };
    if (displayName) patch.displayName = displayName;
    mergeCached(userName, patch);
    if (shouldHighlight(userName, displayName ?? '', bio)) {
      const lc = userName.toLowerCase();
      document.querySelectorAll<Element>(SEL_TWEET).forEach((article) => {
        const sn = extractTweetUserInfo(article).userName ?? '';
        if (sn?.toLowerCase() === lc) article.setAttribute('data-x-loc-highlighted', '1');
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
injectStyles();
startObserver();
startSwipeListener();
cleanupCache();
// Request headers in case page-script already captured them before document_idle
window.dispatchEvent(new CustomEvent(EVENTS.REQUEST_HEADERS));
