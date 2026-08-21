// The bottom-centre slot: the rate-limit countdown, the swipe answer, and the
// rating ask, which take it from each other in that order of priority. The
// countdown owns the window it counts down to — every writer of that number
// shows the toast in the same breath.

import type { LocationData } from '../cache/cache'
import { t } from '../i18n'
import { classifySource } from '../source'
import {
  noteRatingAskShown,
  ratingAskDue,
  REVIEW_URL,
  setRatePromptState,
} from '../usage'
import toolbarIconUrl from '../../assets/icons/icon-32x32.png?inline'
import { LOCATION_TOAST_ID, RATE_TOAST_ID, RATING_ASK_ID } from '../styles'
import { getLocationDisplay } from './filters'

let rateLimitResetAt = 0
let rateLimitToastInterval: ReturnType<typeof setInterval> | null = null
// Every blocked lookup calls showRateLimitToast, so without this the next hover
// would undo the click.
let rateLimitToastDismissedUntil = 0

export function formatCountdown(ms: number): string {
  const s = Math.ceil(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? t('countdownMinSec', m, sec) : t('countdownSec', sec)
}

// ---------------------------------------------------------------------------
// Rate limit toast
// ---------------------------------------------------------------------------
/** A click closes the countdown and keeps it closed for this window. */
export function dismissRateLimitToast(): void {
  rateLimitToastDismissedUntil = rateLimitResetAt
  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
  rateLimitToastInterval = null
  document.getElementById(RATE_TOAST_ID)?.remove()
}

/** `force` un-dismisses: a swipe is the user asking again. Hovers never force. */
export function showRateLimitToast(force = false) {
  if (force) rateLimitToastDismissedUntil = 0

  // Closed by the user, and still the same window — the reset time hasn't
  // moved. A fresh window carries a later reset and shows again.
  if (rateLimitResetAt <= rateLimitToastDismissedUntil) return

  // Both are pinned to the same bottom-centre slot, and a countdown the user
  // needs beats a request they didn't ask for.
  dismissRatingAsk()

  let toast = document.getElementById(RATE_TOAST_ID)
  if (!toast) {
    toast = document.createElement('div')
    toast.id = RATE_TOAST_ID
    // Interactive, so it needs a role, a tab stop and keys doing what a click does.
    toast.title = t('toastDismiss')
    toast.setAttribute('role', 'button')
    toast.tabIndex = 0
    toast.addEventListener('click', dismissRateLimitToast)
    toast.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        dismissRateLimitToast()
      }
    })
    document.body.appendChild(toast)
  }

  if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)

  function tick() {
    const remaining = rateLimitResetAt - Date.now()
    const el = document.getElementById(RATE_TOAST_ID)
    if (remaining <= 0 || !el) {
      if (rateLimitToastInterval) clearInterval(rateLimitToastInterval)
      rateLimitToastInterval = null
      el?.remove()
      return
    }
    el.textContent = t('toastRateLimit', formatCountdown(remaining))
  }

  tick()
  rateLimitToastInterval = setInterval(tick, 1000)
}

// ---------------------------------------------------------------------------
// Location overlay toast (mobile swipe feedback)
// ---------------------------------------------------------------------------
const LOCATION_TOAST_MS = 2500

let locationToastTimer: ReturnType<typeof setTimeout> | null = null

/**
 * One-line summary for the swipe overlay, or '' when there is nothing to say.
 * The store country outranks the stated location, and one that *matches* it
 * corroborates it — so that pairing drops the VPN warning even when X flagged
 * the location inaccurate. Exported for tests.
 */
export function locationSummaryText(
  data: LocationData,
  userName?: string | null,
): string {
  const { country: sourceCountry } = classifySource(data.source)
  const corroborated = sourceCountry !== null && sourceCountry === data.location
  const country = sourceCountry ?? data.location

  const parts: string[] = []
  if (country) {
    const { emoji, label } = getLocationDisplay(country, userName)
    parts.push(`${emoji} ${label}`)
  }
  if (data.locationAccurate === false && !corroborated)
    parts.push(t('vpnBadge'))
  return parts.join(' · ')
}

/** A `pending` toast has no dismiss timer: a later call must resolve it. */
export function dismissLocationToast() {
  document.getElementById(LOCATION_TOAST_ID)?.remove()
  if (locationToastTimer) clearTimeout(locationToastTimer)
  locationToastTimer = null
}

export function renderLocationToast(text: string, pending = false) {
  dismissLocationToast()
  // Same slot again: the swipe answer is what the user just asked for.
  dismissRatingAsk()

  const toast = document.createElement('div')
  toast.id = LOCATION_TOAST_ID
  toast.textContent = text
  if (pending) toast.dataset.pending = '1'
  document.body.appendChild(toast)

  if (!pending) {
    locationToastTimer = setTimeout(() => toast.remove(), LOCATION_TOAST_MS)
  }
}

export function showLocationOverlay(
  data: LocationData,
  userName?: string | null,
) {
  const text = locationSummaryText(data, userName)
  if (!text) return
  renderLocationToast(text)
}

// ---------------------------------------------------------------------------
// The rating ask
// ---------------------------------------------------------------------------
// The popup's ask, put where people actually are. See "The rating ask" in
// CLAUDE.md for the rules it has to keep.

/** Long enough that the flag it is riding on has been read. */
const RATING_ASK_DELAY_MS = 6000

let ratingAskConsidered = false

export function dismissRatingAsk(): void {
  document.getElementById(RATING_ASK_ID)?.remove()
}

/**
 * The manifest's own icon, inlined by `?inline` — a fetchable extension URL is
 * something x.com can probe for, even while the extension is paused.
 */
function buildBrandMark(): HTMLImageElement {
  const img = document.createElement('img')
  img.src = toolbarIconUrl
  img.width = 16
  img.height = 16
  img.alt = ''
  img.setAttribute('aria-hidden', 'true')
  return img
}

function ratingAskButton(
  label: string,
  quiet: boolean,
  onClick: () => void,
): HTMLButtonElement {
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = label
  if (quiet) btn.className = 'x-loc-ask-quiet'
  btn.addEventListener('click', onClick)
  return btn
}

function showRatingAsk(): void {
  if (document.getElementById(RATING_ASK_ID)) return

  const bar = document.createElement('div')
  bar.id = RATING_ASK_ID
  bar.setAttribute('role', 'status')

  // Named, because an unattributed bar over X reads as X asking.
  const message = document.createElement('span')
  message.className = 'x-loc-ask-msg'
  message.appendChild(buildBrandMark())

  const brand = document.createElement('strong')
  brand.textContent = 'X-Pat'
  message.appendChild(brand)

  const text = document.createElement('span')
  text.textContent = t('rateAskInline')
  message.appendChild(text)
  bar.appendChild(message)

  const answer = (status: 'later' | 'done') => {
    void setRatePromptState(status)
    dismissRatingAsk()
  }

  bar.appendChild(
    ratingAskButton(t('rateAskYes'), false, () => {
      // Inside a click, so the popup blocker allows it and no worker need be awake.
      window.open(REVIEW_URL, '_blank', 'noopener')
      answer('done')
    }),
  )
  bar.appendChild(
    ratingAskButton(t('rateAskLater'), true, () => answer('later')),
  )
  bar.appendChild(ratingAskButton(t('rateAskNo'), true, () => answer('done')))

  document.body.appendChild(bar)
  // Written before it can be answered, so a page navigated away from still
  // counts as asked. The answer buttons overwrite it.
  void noteRatingAskShown()
}

/**
 * Called once per page, after the day has been counted — the count is what
 * decides the ask, so checking before it lands would be a day behind.
 */
export async function considerRatingAsk(
  stillEnabled: () => boolean,
): Promise<void> {
  if (ratingAskConsidered) return
  ratingAskConsidered = true

  if (!stillEnabled()) return
  if (!(await ratingAskDue())) return

  setTimeout(() => {
    // Both can have changed during the wait, and the other two toasts carry
    // information where this carries a request.
    if (!stillEnabled()) return
    if (document.getElementById(RATE_TOAST_ID)) return
    if (document.getElementById(LOCATION_TOAST_ID)) return
    showRatingAsk()
  }, RATING_ASK_DELAY_MS)
}
/** X's window, as the newest answer reported it. 0 while nothing is limited. */
export function rateLimitResetsAt(): number {
  return rateLimitResetAt
}

export function rateLimitRemainingMs(): number {
  return rateLimitResetAt - Date.now()
}

export function isRateLimited(): boolean {
  return rateLimitResetAt > Date.now()
}

/** Records the window and shows the countdown — the two are never done apart. */
export function noteRateLimit(resetAt: number): void {
  rateLimitResetAt = resetAt
  showRateLimitToast()
}

/** A day that has earned the ask can arrive in a tab that already declined to. */
export function rearmRatingAsk(): void {
  ratingAskConsidered = false
}

export function __resetOverlays(): void {
  rateLimitResetAt = 0
  rateLimitToastDismissedUntil = 0
  if (rateLimitToastInterval !== null) {
    clearInterval(rateLimitToastInterval)
    rateLimitToastInterval = null
  }
  if (locationToastTimer !== null) {
    clearTimeout(locationToastTimer)
    locationToastTimer = null
  }
  dismissRatingAsk()
  ratingAskConsidered = false
}
