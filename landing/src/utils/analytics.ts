/**
 * The one place the page talks to Google Analytics.
 *
 * `index.html` defines `window.gtag` synchronously (a stub that pushes onto
 * `dataLayer`) and only fetches the real ~87 kB bundle on idle — but *only when
 * `VITE_GA_MEASUREMENT_ID` is set*. Every local build leaves it empty, so
 * `gtag` is genuinely absent there and the optional call below is the whole
 * fallback: no analytics, no error, no `if (import.meta.env.PROD)` scattered
 * through the components.
 *
 * Two idle waits sit in front of the first event, and neither is worth closing:
 * hydration (`main.tsx`, ≤1500 ms) is what attaches the handler at all, and
 * gtag.js (`index.html`, ≤4000 ms after `load`) is what drains the queue. A
 * click inside either window is a real `<a href>` navigating to the store, so
 * it leaves without being counted. Holding navigation open for `event_callback`
 * would delay every visitor to rescue the few clicks that land in the first
 * seconds, so `install_click` is understood to undercount slightly rather than
 * the install being made to feel slow.
 */

type EventParams = Record<string, string | number | boolean>

declare global {
  interface Window {
    gtag?: (
      command: 'event',
      name: string,
      params?: Record<string, unknown>,
    ) => void
  }
}

/** Fires a GA4 event. No-ops during SSR and in any build without a GA id. */
export function trackEvent(name: string, params: EventParams = {}): void {
  if (typeof window === 'undefined') return
  window.gtag?.('event', name, params)
}

/**
 * Where an install button was clicked. GA4 reports one `install_click` event
 * broken down by this, so the values are stable strings rather than anything
 * derived from copy that gets reworded.
 */
export type InstallPlacement =
  | 'header'
  | 'hero'
  | 'cta'
  | 'comparison'
  | 'guide_about_this_account'
  | 'guide_engagement_farming'
