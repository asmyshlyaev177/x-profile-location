import { normalizeRatePrompt, normalizeUsageStats } from './settings'
import { RATE_PROMPT_KEY, USAGE_STATS_KEY } from './constants'
// Days of use, and whether they have earned one ask for a store rating.

import type { RatePromptState, UsageStats } from './settings'

export const RATE_PROMPT_MIN_DAYS = 3

export const RATE_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export const RATE_PROMPT_IGNORED_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

/** Long enough that the flag the bar is riding on has been read. */
export const RATING_ASK_DELAY_MS = 6000

export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/mooomapkphlmpilnlcnpoilondlppbhi/reviews'

export const SHARE_LANDING_URL = 'https://x-pat.pages.dev'

/** X's post composer, prefilled. The landing URL rides on its own line. */
export function shareIntentUrl(text: string): string {
  return `https://x.com/intent/post?text=${encodeURIComponent(`${text}\n\n${SHARE_LANDING_URL}`)}`
}

export function dayKey(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

export function shouldAskForRating(
  usage: UsageStats,
  prompt: RatePromptState,
  now: number = Date.now(),
): boolean {
  return usage.activeDays >= RATE_PROMPT_MIN_DAYS && isAskOpen(prompt, now)
}

/** Neither closed for good nor inside a snooze. */
function isAskOpen(prompt: RatePromptState, now: number): boolean {
  if (prompt.status === 'done') return false
  return prompt.status === 'idle' || now >= prompt.snoozeUntil
}

export function isAnswered(prompt: RatePromptState): boolean {
  return prompt.status === 'later' || prompt.status === 'done'
}

let notedDay: string | null = null

export function __resetUsageMemo(): void {
  notedDay = null
}

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

async function readRatePrompt(): Promise<RatePromptState> {
  const stored = await chrome.storage.local.get(RATE_PROMPT_KEY)
  return normalizeRatePrompt(stored[RATE_PROMPT_KEY])
}

export async function noteRatingAskShown(
  now: number = Date.now(),
): Promise<void> {
  // Any open ask, not only a first one: a snooze that ran out and went
  // unrecorded brought the bar back on every page load.
  if (!isAskOpen(await readRatePrompt(), now)) return

  await chrome.storage.local.set({
    [RATE_PROMPT_KEY]: {
      status: 'asked',
      snoozeUntil: now + RATE_PROMPT_IGNORED_SNOOZE_MS,
    } satisfies RatePromptState,
  })
}

export async function setRatePromptState(
  status: 'later' | 'done',
  now: number = Date.now(),
): Promise<void> {
  // Only Later reads first, so a bar left up elsewhere cannot reopen a closed
  // ask. 'done' is written at once: the popup can close before a read returns.
  if (status === 'later' && (await readRatePrompt()).status === 'done') return
  await chrome.storage.local.set({
    [RATE_PROMPT_KEY]: {
      status,
      snoozeUntil: status === 'later' ? now + RATE_PROMPT_SNOOZE_MS : 0,
    } satisfies RatePromptState,
  })
}
