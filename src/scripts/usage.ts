// Days of use, and whether they have earned one ask for a store rating.

import {
  normalizeRatePrompt,
  normalizeUsageStats,
  RATE_PROMPT_KEY,
  type RatePromptState,
  USAGE_STATS_KEY,
  type UsageStats,
} from './countries'

export const RATE_PROMPT_MIN_DAYS = 3

export const RATE_PROMPT_SNOOZE_MS = 14 * 24 * 60 * 60 * 1000

export const RATE_PROMPT_IGNORED_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000

export const REVIEW_URL =
  'https://chromewebstore.google.com/detail/mooomapkphlmpilnlcnpoilondlppbhi/reviews'

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
  if (prompt.status === 'done') return false
  if (usage.activeDays < RATE_PROMPT_MIN_DAYS) return false
  return prompt.status !== 'later' || now >= prompt.snoozeUntil
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
