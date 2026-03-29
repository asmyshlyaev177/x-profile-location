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
  gap: 4px;
  padding: 1px 16px 6px;
}
.x-loc-icon {
  font-size: 20px;
  line-height: 1;
  cursor: default;
  display: inline-flex;
  align-items: center;
  user-select: none;
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

  if (data.location) {
    const { emoji, label } = getLocationDisplay(data.location);
    row.appendChild(makeIcon(emoji, label));
  }

  if (!data.locationAccurate) {
    const vpn = document.createElement('span');
    vpn.className = 'x-loc-icon-vpn';
    vpn.title = 'VPN used, location can be innacurate';
    vpn.textContent = '⚠ VPN';
    row.appendChild(vpn);
  }

  if (data.source) {
    const src = data.source.toLowerCase();
    if (src.includes('iphone') || src.includes('ipad')) {
      row.appendChild(makeIcon('🍎', 'iOS App Store'));
    } else if (src.includes('android')) {
      row.appendChild(makeIcon('🤖', 'Google Play Store'));
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

  // Find the @username span, then walk up until we reach the main content container
  // (identifiable by having 3+ children: avatar row, name row, bio, followers…).
  // At that point `el` is the name/handle row — insert our info right after it.
  const atSpan = Array.from(card.querySelectorAll('span')).find(
    (s) => s.textContent?.trim().toLowerCase() === `@${screenName.toLowerCase()}`,
  );

  if (atSpan) {
    let el: Element | null = atSpan;
    while (el && el !== card) {
      const parent: Element | null = el.parentElement;
      if (!parent || parent === card) break;
      if (parent.children.length >= 3) {
        parent.insertBefore(row, el.nextSibling);
        return;
      }
      el = parent;
    }
  }

  // Fallback: append to the card's outermost content div
  (card.querySelector('div > div > div') ?? card).appendChild(row);
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
