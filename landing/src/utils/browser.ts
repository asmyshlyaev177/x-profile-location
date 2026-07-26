import { CHROME_STORE_URL } from './constants'

export type SupportedBrowser = 'chrome' | 'edge' | 'brave'

export interface StoreEntry {
  browser: SupportedBrowser
  label: string
  url: string
}

export const STORES: Record<SupportedBrowser, StoreEntry> = {
  chrome: {
    browser: 'chrome',
    label: 'Add to Chrome',
    url: CHROME_STORE_URL,
  },
  edge: {
    browser: 'edge',
    label: 'Add to Edge',
    url: '#', // TODO: replace with Edge Add-ons URL
  },
  brave: {
    browser: 'brave',
    label: 'Add to Brave',
    url: CHROME_STORE_URL, // Brave installs Chrome Web Store extensions directly
  },
}

/** Every browser the extension is known to run in, for the support list. */
export const SUPPORTED_DESKTOP = 'Chrome · Edge · Brave'

/**
 * Android browsers that run desktop Chrome extensions. Lemur is the one the
 * swipe-to-reveal gesture was built against.
 */
export const SUPPORTED_ANDROID = 'Lemur Browser'

/** Detects the current browser from the UA alone. Safe during SSR. */
export function detectBrowser(): SupportedBrowser {
  if (typeof navigator === 'undefined') return 'chrome'
  if (navigator.userAgent.includes('Edg/')) return 'edge'

  return 'chrome' // Chrome, Brave, and anything else → Chrome Web Store
}

/**
 * Brave ships Chrome's user-agent verbatim, so the only reliable signal is the
 * `navigator.brave` handshake — which is async, hence the separate entry point.
 */
export async function detectBrowserAsync(): Promise<SupportedBrowser> {
  const ua = detectBrowser()
  if (ua !== 'chrome') return ua

  const brave = (
    navigator as Navigator & { brave?: { isBrave?: () => Promise<boolean> } }
  ).brave
  try {
    if (brave?.isBrave && (await brave.isBrave())) return 'brave'
  } catch {
    // Ignore: an unexpected shape just means "not Brave".
  }

  return 'chrome'
}
