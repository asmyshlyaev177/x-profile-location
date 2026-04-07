export type SupportedBrowser = 'chrome' | 'firefox' | 'edge'

export interface StoreEntry {
  browser: SupportedBrowser
  label: string
  url: string
}

export const STORES: Record<SupportedBrowser, StoreEntry> = {
  chrome: {
    browser: 'chrome',
    label: 'Add to Chrome',
    url: '#', // TODO: replace with Chrome Web Store URL
  },
  firefox: {
    browser: 'firefox',
    label: 'Add to Firefox',
    url: '#', // TODO: replace with AMO URL
  },
  edge: {
    browser: 'edge',
    label: 'Add to Edge',
    url: '#', // TODO: replace with Edge Add-ons URL
  },
}

/** Detects the current browser. Safe to call during SSR (returns 'chrome'). */
export function detectBrowser(): SupportedBrowser {
  if (typeof navigator === 'undefined') return 'chrome'
  const ua = navigator.userAgent
  if (ua.includes('Edg/')) return 'edge'
  if (ua.includes('Firefox/')) return 'firefox'
  return 'chrome' // Chrome, Brave, and anything else → Chrome Web Store
}
