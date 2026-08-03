// How much the extension has been used, and whether that has earned one ask
// for a store rating.
//
// The counter is days, not lookups: a rating asked after "you hovered 50
// profiles" arrives in the middle of the session it is interrupting, whereas
// somebody who has come back on three separate days has formed an opinion and
// is not busy forming it right now.

import {
  normalizeRatePrompt,
  normalizeUsageStats,
  RATE_PROMPT_KEY,
  type RatePromptState,
  USAGE_STATS_KEY,
  type UsageStats,
} from './countries'

/** Days of use before the popup asks. */
export const RATE_PROMPT_MIN_DAYS = 3

/** How long "Later" holds it off. */
export const RATE_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

/**
 * How long an ask that was *shown and ignored* holds it off.
 *
 * Shorter than "Later", because saying nothing is not the same as saying later;
 * long enough that ignoring it is a decision the extension respects rather than
 * re-litigates on the next page load. Without this the in-page bar would appear
 * every session forever, which is the behaviour that earns one-star reviews
 * rather than five.
 */
export const RATE_PROMPT_IGNORED_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * The Chrome Web Store review tab.
 *
 * The id is the store's, not `chrome.runtime.id` — those agree for a store
 * install and disagree for every unpacked build, so reading it at runtime would
 * send developers and e2e runs to a listing that does not exist. When the Edge
 * and AMO listings from ROADMAP §5.2 ship, this becomes a per-target value.
 */
export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/mooomapkphlmpilnlcnpoilondlppbhi/reviews'

/** Local calendar day, `YYYY-MM-DD`. Local, because "a day of use" is theirs. */
export function dayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

/**
 * Whether the popup should ask, given everything that decides it. Pure, so the
 * rules are testable without a popup, storage or a clock.
 */
export function shouldAskForRating(
  usage: UsageStats,
  prompt: RatePromptState,
  now: number = Date.now(),
): boolean {
  if (prompt.status === 'done') return false
  if (usage.activeDays < RATE_PROMPT_MIN_DAYS) return false
  return prompt.status !== 'later' || now >= prompt.snoozeUntil
}

// Set once per page, so a scroll costs no storage reads after the first hit.
let notedDay: string | null = null

/** Test-only: forget that this page has already counted today. */
export function __resetUsageMemo(): void {
  notedDay = null
}

/**
 * Count today, once. Called from the content script wherever it puts something
 * on screen — the point being that the day is recorded for *use*, not for X
 * being open in a background tab.
 *
 * Two tabs racing can both see yesterday's `lastDay` and each add a day. The
 * cost of that is being asked one visit early, so it is not worth a lock.
 */
export async function noteActiveDay(now: Date = new Date()): Promise<void> {
  const today = dayKey(now)
  if (notedDay === today) return
  notedDay = today

  const stored = await chrome.storage.local.get(USAGE_STATS_KEY)
  const usage = normalizeUsageStats(stored[USAGE_STATS_KEY])
  if (usage.lastDay === today) return

  await chrome.storage.local.set({
    [USAGE_STATS_KEY]: {
      activeDays: usage.activeDays + 1,
      lastDay: today,
    } satisfies UsageStats,
  })
}

/**
 * Whether an ask is due, reading both keys itself.
 *
 * Three surfaces show this ask — the toolbar badge, the bar on X, and the card
 * in the popup — and they must agree: a badge pointing at a popup with nothing
 * in it is worse than no badge. They all call this.
 */
export async function ratingAskDue(now: number = Date.now()): Promise<boolean> {
  const stored = await chrome.storage.local.get([
    USAGE_STATS_KEY,
    RATE_PROMPT_KEY,
  ])
  return shouldAskForRating(
    normalizeUsageStats(stored[USAGE_STATS_KEY]),
    normalizeRatePrompt(stored[RATE_PROMPT_KEY]),
    now,
  )
}

/**
 * Having been shown counts for something, so an ignored ask goes quiet for a
 * few days instead of returning next session.
 *
 * Only from 'idle': a fortnight the user asked for must never be shortened to
 * three days by an ask they did not answer.
 */
export async function noteRatingAskShown(
  now: number = Date.now(),
): Promise<void> {
  const stored = await chrome.storage.local.get(RATE_PROMPT_KEY)
  if (normalizeRatePrompt(stored[RATE_PROMPT_KEY]).status !== 'idle') return

  await chrome.storage.local.set({
    [RATE_PROMPT_KEY]: {
      status: 'later',
      snoozeUntil: now + RATE_PROMPT_IGNORED_SNOOZE_MS,
    } satisfies RatePromptState,
  })
}

/** Record the answer. 'later' snoozes; 'done' is final either way. */
export async function setRatePromptState(
  status: RatePromptState['status'],
  now: number = Date.now(),
): Promise<void> {
  await chrome.storage.local.set({
    [RATE_PROMPT_KEY]: {
      status,
      snoozeUntil: status === 'later' ? now + RATE_PROMPT_SNOOZE_MS : 0,
    } satisfies RatePromptState,
  })
}
