// content.tsx — plain DOM, no React/Preact
import { cleanupCache, getCached, setCached } from './cache';
import type { LocationData } from './cache';

const QUERY_ID = 'XRqGa7EeokUU5kppkh13EA';
const API_BASE = 'https://x.com/i/api/graphql';
const ABOUT_ACCOUNT_URL = `${API_BASE}/${QUERY_ID}/AboutAccountQuery`;

// X related selectors
const SEL_HOVER_CARD = '[data-testid="HoverCard"]';
const SEL_USER_NAME = '[data-testid="UserName"] a[href]';
const SEL_USER_NAME_ALT = '[data-testid="User-Name"] a[href]';
const SEL_TWEET = 'article[data-testid="tweet"]';
const SEL_PRIMARY_TWEET = `${SEL_TWEET}[tabindex="-1"]`;
const PRIMARY_TWEET_ATTR = 'data-x-loc-primary-done';
const RESET_DEFAULT = 60 * 5 * 1000;

// ---------------------------------------------------------------------------
// Country → flag emoji mapping
// ---------------------------------------------------------------------------
const COUNTRY_FLAGS: Record<string, string> = {
  'Afghanistan': '🇦🇫', 'Albania': '🇦🇱', 'Algeria': '🇩🇿', 'Andorra': '🇦🇩',
  'Angola': '🇦🇴', 'Antigua and Barbuda': '🇦🇬', 'Argentina': '🇦🇷',
  'Armenia': '🇦🇲', 'Australia': '🇦🇺', 'Austria': '🇦🇹', 'Azerbaijan': '🇦🇿',
  'Bahamas': '🇧🇸', 'Bahrain': '🇧🇭', 'Bangladesh': '🇧🇩', 'Barbados': '🇧🇧',
  'Belarus': '🇧🇾', 'Belgium': '🇧🇪', 'Belize': '🇧🇿', 'Benin': '🇧🇯',
  'Bhutan': '🇧🇹', 'Bolivia': '🇧🇴', 'Bosnia and Herzegovina': '🇧🇦',
  'Botswana': '🇧🇼', 'Brazil': '🇧🇷', 'Brunei': '🇧🇳', 'Bulgaria': '🇧🇬',
  'Burkina Faso': '🇧🇫', 'Burundi': '🇧🇮', 'Cabo Verde': '🇨🇻',
  'Cambodia': '🇰🇭', 'Cameroon': '🇨🇲', 'Canada': '🇨🇦',
  'Central African Republic': '🇨🇫', 'Chad': '🇹🇩', 'Chile': '🇨🇱',
  'China': '🇨🇳', 'Colombia': '🇨🇴', 'Comoros': '🇰🇲',
  'Congo': '🇨🇬', 'Costa Rica': '🇨🇷', 'Croatia': '🇭🇷', 'Cuba': '🇨🇺',
  'Cyprus': '🇨🇾', 'Czech Republic': '🇨🇿', 'Czechia': '🇨🇿',
  'Democratic Republic of the Congo': '🇨🇩', 'Denmark': '🇩🇰',
  'Djibouti': '🇩🇯', 'Dominica': '🇩🇲', 'Dominican Republic': '🇩🇴',
  'Ecuador': '🇪🇨', 'Egypt': '🇪🇬', 'El Salvador': '🇸🇻',
  'Equatorial Guinea': '🇬🇶', 'Eritrea': '🇪🇷', 'Estonia': '🇪🇪',
  'Eswatini': '🇸🇿', 'Ethiopia': '🇪🇹', 'Fiji': '🇫🇯', 'Finland': '🇫🇮',
  'France': '🇫🇷', 'Gabon': '🇬🇦', 'Gambia': '🇬🇲', 'Georgia': '🇬🇪',
  'Germany': '🇩🇪', 'Ghana': '🇬🇭', 'Greece': '🇬🇷', 'Grenada': '🇬🇩',
  'Guatemala': '🇬🇹', 'Guinea': '🇬🇳', 'Guinea-Bissau': '🇬🇼',
  'Guyana': '🇬🇾', 'Haiti': '🇭🇹', 'Honduras': '🇭🇳', 'Hungary': '🇭🇺',
  'Iceland': '🇮🇸', 'India': '🇮🇳', 'Indonesia': '🇮🇩', 'Iran': '🇮🇷',
  'Iraq': '🇮🇶', 'Ireland': '🇮🇪', 'Israel': '🇮🇱', 'Italy': '🇮🇹',
  'Jamaica': '🇯🇲', 'Japan': '🇯🇵', 'Jordan': '🇯🇴', 'Kazakhstan': '🇰🇿',
  'Kenya': '🇰🇪', 'Kiribati': '🇰🇮', 'Kuwait': '🇰🇼', 'Kyrgyzstan': '🇰🇬',
  'Laos': '🇱🇦', 'Latvia': '🇱🇻', 'Lebanon': '🇱🇧', 'Lesotho': '🇱🇸',
  'Liberia': '🇱🇷', 'Libya': '🇱🇾', 'Liechtenstein': '🇱🇮',
  'Lithuania': '🇱🇹', 'Luxembourg': '🇱🇺', 'Madagascar': '🇲🇬',
  'Malawi': '🇲🇼', 'Malaysia': '🇲🇾', 'Maldives': '🇲🇻', 'Mali': '🇲🇱',
  'Malta': '🇲🇹', 'Marshall Islands': '🇲🇭', 'Mauritania': '🇲🇷',
  'Mauritius': '🇲🇺', 'Mexico': '🇲🇽', 'Micronesia': '🇫🇲',
  'Moldova': '🇲🇩', 'Monaco': '🇲🇨', 'Mongolia': '🇲🇳',
  'Montenegro': '🇲🇪', 'Morocco': '🇲🇦', 'Mozambique': '🇲🇿',
  'Myanmar': '🇲🇲', 'Namibia': '🇳🇦', 'Nauru': '🇳🇷', 'Nepal': '🇳🇵',
  'Netherlands': '🇳🇱', 'New Zealand': '🇳🇿', 'Nicaragua': '🇳🇮',
  'Niger': '🇳🇪', 'Nigeria': '🇳🇬', 'North Korea': '🇰🇵',
  'North Macedonia': '🇲🇰', 'Norway': '🇳🇴', 'Oman': '🇴🇲',
  'Pakistan': '🇵🇰', 'Palau': '🇵🇼', 'Panama': '🇵🇦',
  'Papua New Guinea': '🇵🇬', 'Paraguay': '🇵🇾', 'Peru': '🇵🇪',
  'Philippines': '🇵🇭', 'Poland': '🇵🇱', 'Portugal': '🇵🇹', 'Qatar': '🇶🇦',
  'Romania': '🇷🇴', 'Russia': '🇷🇺', 'Russian Federation': '🇷🇺', 'Rwanda': '🇷🇼',
  'Saint Kitts and Nevis': '🇰🇳', 'Saint Lucia': '🇱🇨',
  'Saint Vincent and the Grenadines': '🇻🇨', 'Samoa': '🇼🇸',
  'San Marino': '🇸🇲', 'Sao Tome and Principe': '🇸🇹',
  'Saudi Arabia': '🇸🇦', 'Senegal': '🇸🇳', 'Serbia': '🇷🇸',
  'Seychelles': '🇸🇨', 'Sierra Leone': '🇸🇱', 'Singapore': '🇸🇬',
  'Slovakia': '🇸🇰', 'Slovenia': '🇸🇮', 'Solomon Islands': '🇸🇧',
  'Somalia': '🇸🇴', 'South Africa': '🇿🇦', 'South Korea': '🇰🇷',
  'South Sudan': '🇸🇸', 'Spain': '🇪🇸', 'Sri Lanka': '🇱🇰', 'Sudan': '🇸🇩',
  'Suriname': '🇸🇷', 'Sweden': '🇸🇪', 'Switzerland': '🇨🇭', 'Syria': '🇸🇾',
  'Taiwan': '🇹🇼', 'Tajikistan': '🇹🇯', 'Tanzania': '🇹🇿', 'Thailand': '🇹🇭',
  'Timor-Leste': '🇹🇱', 'Togo': '🇹🇬', 'Tonga': '🇹🇴',
  'Trinidad and Tobago': '🇹🇹', 'Tunisia': '🇹🇳', 'Turkey': '🇹🇷',
  'Turkmenistan': '🇹🇲', 'Tuvalu': '🇹🇻', 'Uganda': '🇺🇬', 'Ukraine': '🇺🇦',
  'United Arab Emirates': '🇦🇪', 'United Kingdom': '🇬🇧',
  'United States': '🇺🇸', 'Uruguay': '🇺🇾', 'Uzbekistan': '🇺🇿',
  'Vanuatu': '🇻🇺', 'Vatican City': '🇻🇦', 'Venezuela': '🇻🇪',
  'Vietnam': '🇻🇳', 'Yemen': '🇾🇪', 'Zambia': '🇿🇲', 'Zimbabwe': '🇿🇼',
};

const REGION_FLAGS: Record<string, string> = {
  'Africa': '⚠️',
  'Australasia': '🌏',
  'East Asia & Pacific': '🌏',
  'Europe': '🇪🇺',
  'North Africa': '🌍',
  'North America': '🌎',
  'South America': '🌎',
  'South Asia': '⚠️',
  'West Asia': '🌍',
};

function getLocationDisplay(loc: string): { emoji: string; label: string } {
  if (COUNTRY_FLAGS[loc]) return { emoji: COUNTRY_FLAGS[loc], label: loc };
  if (REGION_FLAGS[loc]) return { emoji: REGION_FLAGS[loc], label: loc };
  return { emoji: '🌐', label: loc };
}

// ---------------------------------------------------------------------------
// Types & state
// ---------------------------------------------------------------------------
let apiHeaders: Record<string, string> | null = null;
const cache = new Map<string, LocationData | null>();
// Shared promises — lets concurrent processCard calls for the same user
// await the same in-flight fetch instead of getting null immediately.
const pendingMap = new Map<string, Promise<LocationData | null>>();
let rateLimitResetAt = 0;
let rateLimitToastInterval: ReturnType<typeof setInterval> | null = null;

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
// API fetch
// ---------------------------------------------------------------------------
async function fetchLocationData(screenName: string): Promise<LocationData | null> {
  const lower = screenName.toLowerCase();
  if (cache.has(lower)) return cache.get(lower)!;
  if (pendingMap.has(lower)) return pendingMap.get(lower)!;

  // Capture snapshot so the IIFE always uses the headers that were valid at
  // call time, even if apiHeaders is updated mid-flight.
  const capturedHeaders = apiHeaders;

  const promise = (async (): Promise<LocationData | null> => {
    // Check persistent cache before hitting the network
    const stored = await getCached(lower);
    if (stored !== undefined) {
      cache.set(lower, stored);
      return stored;
    }

    // Don't attempt without intercepted headers — avoids caching failures
    // from unauthenticated requests before the page-script captures the session.
    if (!capturedHeaders) return null;

    if (rateLimitResetAt > Date.now()) {
      showRateLimitToast();
      return null;
    }

    try {
      const variables = JSON.stringify({ screenName });
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

      if (!resp.ok) {
        cache.set(lower, null);
        return null;
      }

      const json = await resp.json();
      const profile =
        json?.data?.user_result_by_screen_name?.result?.about_profile ?? null;

      if (!profile) {
        cache.set(lower, null);
        return null;
      }

      const data: LocationData = {
        location: profile.account_based_in ?? null,
        locationAccurate: profile.location_accurate !== false,
        source: profile.source ?? null,
      };
      cache.set(lower, data);
      await setCached(lower, data);
      return data;
    } catch {
      cache.set(lower, null);
      return null;
    }
  })();

  pendingMap.set(lower, promise);
  promise.finally(() => pendingMap.delete(lower));
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
.x-loc-store-block .x-loc-icon-flag {
  font-size: 16px;
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
`;
  (document.head || document.documentElement).appendChild(style);
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
    const match = href.match(/^\/([A-Za-z0-9_]{1,50})$/);
    if (match) return match[1];
  }

  // Fallback: find a span with @username text
  const spans = card.querySelectorAll('span');
  for (const span of Array.from(spans)) {
    const text = span.textContent?.trim() ?? '';
    if (/^@[A-Za-z0-9_]{1,50}$/.test(text)) {
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

  const mobileSource = /android\s+app|app\s+store/i.test(data?.source ?? '');
  const sourceCountry = mobileSource
    && data.source?.replace(/\s*(android\s+app|app\s+store)/i, '').trim() || null;

  if (data?.location) {
    const { emoji, label } = getLocationDisplay(data.location);
    const icon = makeIcon(emoji, label);
    icon.classList.add('x-loc-icon-flag');
    row.appendChild(icon);

    if (sourceCountry) {
      const { emoji: storeFlag } = getLocationDisplay(sourceCountry);
      const block = document.createElement('span');
      block.className = 'x-loc-store-block';
      block.title = data.source!;

      const phone = document.createElement('span');
      phone.textContent = '📱';

      const flag = document.createElement('span');
      flag.className = 'x-loc-icon-flag';
      flag.textContent = storeFlag;

      block.appendChild(phone);
      block.appendChild(flag);
      row.appendChild(block);
    }
  } else if (sourceCountry) {
    row.appendChild(makeIcon('📱', data.source!));
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
function insertIntoCard(card: Element, screenName: string, el: HTMLElement) {
  const atSpan = Array.from(card.querySelectorAll('span')).find(
    (s) => s.textContent?.trim().toLowerCase() === `@${screenName.toLowerCase()}`,
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
async function processCard(card: Element) {
  if (card.getAttribute('data-x-loc-done')) return;

  const screenName = extractScreenName(card);
  // Don't mark done yet — card content may not be rendered. The observer will
  // retry when React adds content inside the card.
  if (!screenName) return;

  card.setAttribute('data-x-loc-done', '1');

  const data = await fetchLocationData(screenName);

  if (data === null && rateLimitResetAt > Date.now()) {
    insertIntoCard(card, screenName, buildRateLimitRow());
    return;
  }

  if (!data || (!data.location && data.locationAccurate && !data.source)) return;

  const row = buildInfoRow(data);
  insertIntoCard(card, screenName, row);
}

// ---------------------------------------------------------------------------
// Process primary tweet author on status pages
// ---------------------------------------------------------------------------
async function processPrimaryTweet() {
  if (!/\/status\/\d+/.test(location.pathname)) return;

  const tweet = document.querySelector(SEL_PRIMARY_TWEET);
  if (!tweet || tweet.getAttribute(PRIMARY_TWEET_ATTR)) return;

  const userNameEl =
    tweet.querySelector('[data-testid="User-Name"]') ??
    tweet.querySelector('[data-testid="UserName"]');
  if (!userNameEl) return;

  const link = userNameEl.querySelector('a[href]');
  if (!link) return;

  const href = link.getAttribute('href') ?? '';
  const m = href.match(/^\/([A-Za-z0-9_]{1,50})$/);
  if (!m) return;

  const screenName = m[1];
  tweet.setAttribute(PRIMARY_TWEET_ATTR, '1');

  const data = await fetchLocationData(screenName);

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
// Listen for captured headers from page-script
// ---------------------------------------------------------------------------
window.addEventListener('x-loc-headers-captured', (e: Event) => {
  const headers = (e as CustomEvent).detail?.headers;
  if (headers?.authorization) {
    apiHeaders = headers;
  }
});

// ---------------------------------------------------------------------------
// Init
// ---------------------------------------------------------------------------
injectStyles();
startObserver();
cleanupCache();
// Request headers in case page-script already captured them before document_idle
window.dispatchEvent(new CustomEvent('x-loc-request-headers'));
