// content.tsx — plain DOM, no React/Preact

const QUERY_ID = 'XRqGa7EeokUU5kppkh13EA';
const API_BASE = 'https://x.com/i/api/graphql';
const BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

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
  'Romania': '🇷🇴', 'Russia': '🇷🇺', 'Rwanda': '🇷🇼',
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
  'Africa': '🌍',
  'Australasia': '🌏',
  'East Asia & Pacific': '🌏',
  'Europe': '🌍',
  'North Africa': '🌍',
  'North America': '🌎',
  'South America': '🌎',
  'South Asia': '🌏',
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
interface LocationData {
  location: string | null;
  locationAccurate: boolean;
  source: string | null;
}

let apiHeaders: Record<string, string> | null = null;
const cache = new Map<string, LocationData | null>();
const pendingSet = new Set<string>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

async function fetchLocationData(screenName: string): Promise<LocationData | null> {
  const lower = screenName.toLowerCase();
  if (cache.has(lower)) return cache.get(lower)!;
  if (pendingSet.has(lower)) return null;

  pendingSet.add(lower);
  try {
    const variables = JSON.stringify({ screenName });
    const url = `${API_BASE}/${QUERY_ID}/AboutAccountQuery?variables=${encodeURIComponent(variables)}`;

    const headers: Record<string, string> = {
      'authorization': BEARER,
      'content-type': 'application/json',
      'x-twitter-client-language': 'en',
      'x-twitter-active-user': 'yes',
    };

    if (apiHeaders?.authorization) {
      headers['authorization'] = apiHeaders.authorization;
    }
    if (apiHeaders?.['x-csrf-token']) {
      headers['x-csrf-token'] = apiHeaders['x-csrf-token'];
    } else {
      const ct0 = getCookie('ct0');
      if (ct0) headers['x-csrf-token'] = ct0;
    }
    if (apiHeaders?.['x-twitter-active-user']) {
      headers['x-twitter-active-user'] = apiHeaders['x-twitter-active-user'];
    }

    const resp = await fetch(url, {
      method: 'GET',
      headers,
      credentials: 'include',
    });

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
    return data;
  } catch {
    cache.set(lower, null);
    return null;
  } finally {
    pendingSet.delete(lower);
  }
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
  flex-wrap: wrap;
  gap: 6px;
  padding: 4px 16px 8px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
.x-loc-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
}
.x-loc-location {
  background: rgba(29, 155, 240, 0.12);
  color: rgb(29, 155, 240);
}
.x-loc-vpn {
  background: rgba(255, 165, 0, 0.12);
  color: rgb(205, 127, 50);
}
.x-loc-source {
  background: rgba(113, 118, 123, 0.1);
  color: rgb(83, 100, 113);
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
    card.querySelector('[data-testid="UserName"] a[href]') ??
    card.querySelector('[data-testid="User-Name"] a[href]');
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
function buildInfoRow(data: LocationData): HTMLElement {
  const row = document.createElement('div');
  row.className = 'x-loc-info';

  if (data.location) {
    const { emoji, label } = getLocationDisplay(data.location);
    const badge = document.createElement('span');
    badge.className = 'x-loc-badge x-loc-location';
    badge.textContent = `${emoji} ${label}`;
    row.appendChild(badge);
  }

  if (!data.locationAccurate) {
    const badge = document.createElement('span');
    badge.className = 'x-loc-badge x-loc-vpn';
    badge.textContent = '🔒 VPN/Proxy';
    row.appendChild(badge);
  }

  if (data.source) {
    const src = data.source.toLowerCase();
    let sourceText: string | null = null;
    if (src.includes('iphone') || src.includes('ipad')) {
      sourceText = '🍎 iOS App Store';
    } else if (src.includes('android')) {
      sourceText = '▶ Google Play';
    }
    if (sourceText) {
      const badge = document.createElement('span');
      badge.className = 'x-loc-badge x-loc-source';
      badge.textContent = sourceText;
      row.appendChild(badge);
    }
  }

  return row;
}

// ---------------------------------------------------------------------------
// Process a hover card
// ---------------------------------------------------------------------------
async function processCard(card: Element) {
  if (card.getAttribute('data-x-loc-done')) return;
  card.setAttribute('data-x-loc-done', '1');

  const screenName = extractScreenName(card);
  if (!screenName) return;

  const data = await fetchLocationData(screenName);
  if (!data || (!data.location && data.locationAccurate && !data.source)) return;

  const row = buildInfoRow(data);

  // Find insertion point
  const followingCountEl = card.querySelector('[data-testid="userFollowingCount"]');
  if (followingCountEl) {
    // Insert after the follower/following section (parent row)
    const section = followingCountEl.closest('div[class]') ?? followingCountEl.parentElement;
    if (section?.parentElement) {
      section.parentElement.insertBefore(row, section.nextSibling);
      return;
    }
  }

  // After last child of card's first child div
  const firstDiv = card.querySelector('div');
  if (firstDiv) {
    firstDiv.appendChild(row);
    return;
  }

  // Fallback: append to card
  card.appendChild(row);
}

// ---------------------------------------------------------------------------
// MutationObserver
// ---------------------------------------------------------------------------
function startObserver() {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element)) continue;

        // Check if node itself is the hover card
        if ((node as Element).matches('[data-testid="HoverCard"]')) {
          processCard(node as Element);
        }

        // Check descendants
        const cards = (node as Element).querySelectorAll('[data-testid="HoverCard"]');
        for (const card of Array.from(cards)) {
          processCard(card);
        }
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
