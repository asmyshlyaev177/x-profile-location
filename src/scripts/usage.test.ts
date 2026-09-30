import { normalizeRatePrompt, normalizeUsageStats } from './settings'
import { RATE_PROMPT_KEY, USAGE_STATS_KEY } from './constants'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  __resetUsageMemo,
  dayKey,
  isAnswered,
  noteActiveDay,
  noteRatingAskShown,
  RATE_PROMPT_IGNORED_SNOOZE_MS,
  RATE_PROMPT_MIN_DAYS,
  RATE_PROMPT_SNOOZE_MS,
  ratingAskDue,
  setRatePromptState,
  SHARE_LANDING_URL,
  shareIntentUrl,
  shouldAskForRating,
} from './usage'

const stored: { current: Record<string, unknown> } = { current: {} }
const setMock = vi.fn((patch: Record<string, unknown>) => {
  Object.assign(stored.current, patch)
  return Promise.resolve()
})

;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({ ...stored.current })),
      set: setMock,
    },
  },
}

beforeEach(() => {
  stored.current = {}
  setMock.mockClear()
  __resetUsageMemo()
})

describe('counting a day of use', () => {
  it('counts the first day', async () => {
    await noteActiveDay(new Date(2026, 7, 3, 12, 0))

    expect(stored.current[USAGE_STATS_KEY]).toEqual({
      activeDays: 1,
      lastDay: '2026-08-03',
    })
  })

  it('counts a day once however many flags are drawn', async () => {
    await noteActiveDay(new Date(2026, 7, 3, 9, 0))
    __resetUsageMemo() // a second page load on the same day
    await noteActiveDay(new Date(2026, 7, 3, 23, 30))

    expect(stored.current[USAGE_STATS_KEY]).toMatchObject({ activeDays: 1 })
  })

  it('does not read storage twice on one page', async () => {
    const get = chrome.storage.local.get as unknown as ReturnType<typeof vi.fn>
    get.mockClear()

    await noteActiveDay(new Date(2026, 7, 3))
    await noteActiveDay(new Date(2026, 7, 3))

    expect(get).toHaveBeenCalledTimes(1)
  })

  it('adds the next day the extension is used', async () => {
    await noteActiveDay(new Date(2026, 7, 3))
    __resetUsageMemo()
    await noteActiveDay(new Date(2026, 7, 5))

    expect(stored.current[USAGE_STATS_KEY]).toEqual({
      activeDays: 2,
      lastDay: '2026-08-05',
    })
  })

  it('uses the local day, not UTC', () => {
    // 23:30 local on the 3rd is already the 4th in UTC. Counting in UTC would
    // give a late-evening user two days for one sitting.
    expect(dayKey(new Date(2026, 7, 3, 23, 30))).toBe('2026-08-03')
  })
})

describe('deciding whether to ask for a rating', () => {
  const used = (activeDays: number) => ({ activeDays, lastDay: '2026-08-03' })
  const idle = { status: 'idle' as const, snoozeUntil: 0 }

  it('does not ask before enough days of use', () => {
    expect(shouldAskForRating(used(RATE_PROMPT_MIN_DAYS - 1), idle)).toBe(false)
  })

  it('asks once the days are there', () => {
    expect(shouldAskForRating(used(RATE_PROMPT_MIN_DAYS), idle)).toBe(true)
  })

  it('never asks again after an answer', () => {
    const answered = { status: 'done' as const, snoozeUntil: 0 }
    expect(shouldAskForRating(used(365), answered)).toBe(false)
  })

  it('holds off for the whole snooze', () => {
    const now = Date.UTC(2026, 7, 3)
    const later = { status: 'later' as const, snoozeUntil: now + 1000 }
    expect(shouldAskForRating(used(10), later, now)).toBe(false)
    expect(shouldAskForRating(used(10), later, now + 1000)).toBe(true)
  })

  it('holds off after an ignored ask the same way', () => {
    const now = Date.UTC(2026, 7, 3)
    const asked = { status: 'asked' as const, snoozeUntil: now + 1000 }
    expect(shouldAskForRating(used(10), asked, now)).toBe(false)
    expect(shouldAskForRating(used(10), asked, now + 1000)).toBe(true)
  })
})

describe('telling an answer from an ask', () => {
  // Only an answer takes a bar off the other tabs. A bar merely being shown
  // somewhere is not one, or every tab's own note would close its own bar.
  it.each([
    ['idle', false],
    ['asked', false],
    ['later', true],
    ['done', true],
  ] as const)('%s is an answer: %s', (status, expected) => {
    expect(isAnswered({ status, snoozeUntil: 0 })).toBe(expected)
  })
})

describe('recording the answer', () => {
  it('snoozes rather than closing on Later', async () => {
    const now = Date.UTC(2026, 7, 3)
    await setRatePromptState('later', now)

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'later',
      snoozeUntil: now + RATE_PROMPT_SNOOZE_MS,
    })
  })

  it('closes for good on an answer', async () => {
    await setRatePromptState('done', Date.UTC(2026, 7, 3))

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'done',
      snoozeUntil: 0,
    })
  })

  it('never turns a closed ask back into a snooze', async () => {
    // A bar still up in another tab offers Later after the reader has rated in
    // the popup. Written as asked, that rating came back as a question in a
    // fortnight - reproduced against the built extension.
    await setRatePromptState('done', Date.UTC(2026, 7, 3))
    await setRatePromptState('later', Date.UTC(2026, 7, 4))

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'done',
      snoozeUntil: 0,
    })
  })

  it('writes a closing answer at once, before any read', () => {
    // The popup's "Rate it" is a link, and the store tab it opens closes the
    // popup. A write queued behind a read can be lost with the page.
    void setRatePromptState('done')

    expect(setMock).toHaveBeenCalledTimes(1)
  })
})

describe('reading back what was stored', () => {
  it('treats anything unrecognised as never used', () => {
    for (const junk of [undefined, null, 'yesterday', 42, { activeDays: -3 }]) {
      expect(normalizeUsageStats(junk)).toEqual({ activeDays: 0, lastDay: '' })
    }
  })

  it('treats an unknown status as unanswered', () => {
    expect(normalizeRatePrompt({ status: 'maybe', snoozeUntil: 5 })).toEqual({
      status: 'idle',
      snoozeUntil: 5,
    })
  })

  it('keeps a real snooze', () => {
    expect(normalizeRatePrompt({ status: 'later', snoozeUntil: 5 })).toEqual({
      status: 'later',
      snoozeUntil: 5,
    })
  })

  it('keeps an ignored ask', () => {
    expect(normalizeRatePrompt({ status: 'asked', snoozeUntil: 5 })).toEqual({
      status: 'asked',
      snoozeUntil: 5,
    })
  })
})

describe('the answer every surface reads', () => {
  // The badge, the bar on X and the popup card all ask this one question. A
  // badge inviting a click that opens a popup with nothing in it is worse than
  // no badge, so they cannot be allowed to disagree.
  it('is no until the days are there', async () => {
    stored.current[USAGE_STATS_KEY] = {
      activeDays: RATE_PROMPT_MIN_DAYS - 1,
      lastDay: '2026-08-03',
    }
    expect(await ratingAskDue()).toBe(false)
  })

  it('is yes once they are', async () => {
    stored.current[USAGE_STATS_KEY] = {
      activeDays: RATE_PROMPT_MIN_DAYS,
      lastDay: '2026-08-03',
    }
    expect(await ratingAskDue()).toBe(true)
  })

  it('is no on an install that has never been used', async () => {
    expect(await ratingAskDue()).toBe(false)
  })
})

describe('an ask that was ignored', () => {
  const used = { activeDays: 30, lastDay: '2026-08-03' }

  it('goes quiet for a few days on its own', async () => {
    stored.current[USAGE_STATS_KEY] = used
    const now = Date.UTC(2026, 7, 3)
    await noteRatingAskShown(now)

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'asked',
      snoozeUntil: now + RATE_PROMPT_IGNORED_SNOOZE_MS,
    })
    expect(await ratingAskDue(now)).toBe(false)
    expect(await ratingAskDue(now + RATE_PROMPT_IGNORED_SNOOZE_MS)).toBe(true)
  })

  it('goes quiet again each time it is ignored', async () => {
    // Only an ask from idle used to be recorded. Once the first snooze ran
    // out, no ask was recorded again, and the bar came back on every page load
    // until it was answered - reproduced against the built extension.
    stored.current[USAGE_STATS_KEY] = used
    const now = Date.UTC(2026, 7, 20)
    stored.current[RATE_PROMPT_KEY] = { status: 'later', snoozeUntil: now - 1 }

    await noteRatingAskShown(now)

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'asked',
      snoozeUntil: now + RATE_PROMPT_IGNORED_SNOOZE_MS,
    })
    expect(await ratingAskDue(now + 60_000)).toBe(false)
  })

  it('never shortens a snooze the user asked for', async () => {
    // "Later" is a fortnight. Showing a bar the user then ignored must not
    // quietly turn that into three days.
    const now = Date.UTC(2026, 7, 3)
    await setRatePromptState('later', now)
    await noteRatingAskShown(now + 1000)

    expect(stored.current[RATE_PROMPT_KEY]).toEqual({
      status: 'later',
      snoozeUntil: now + RATE_PROMPT_SNOOZE_MS,
    })
  })

  it('cannot reopen a closed one', async () => {
    await setRatePromptState('done')
    await noteRatingAskShown()

    expect(stored.current[RATE_PROMPT_KEY]).toMatchObject({ status: 'done' })
  })
})

describe('showing the bar, from every state the prompt can be in', () => {
  // The rules above, checked against every state at once: whatever came
  // before, a bar just shown is not due again right away, a snooze the reader
  // chose keeps its length, and a closed ask stays closed.
  const now = Date.UTC(2026, 8, 30)
  const BEFORE = {
    'never asked': { status: 'idle', snoozeUntil: 0 },
    'ignored, snooze over': { status: 'asked', snoozeUntil: now - 1 },
    'ignored, still snoozed': { status: 'asked', snoozeUntil: now + 1 },
    'Later, snooze over': { status: 'later', snoozeUntil: now - 1 },
    'Later, still snoozed': { status: 'later', snoozeUntil: now + 1 },
    answered: { status: 'done', snoozeUntil: 0 },
  } as const

  it.each(Object.entries(BEFORE))('%s', async (_, before) => {
    stored.current[USAGE_STATS_KEY] = { activeDays: 30, lastDay: '2026-09-30' }
    stored.current[RATE_PROMPT_KEY] = before

    await noteRatingAskShown(now)
    const after = normalizeRatePrompt(stored.current[RATE_PROMPT_KEY])

    expect(await ratingAskDue(now)).toBe(false)
    if (before.status === 'done') expect(after).toEqual(before)
    else expect(after.snoozeUntil).toBeGreaterThanOrEqual(before.snoozeUntil)
  })
})

describe('shareIntentUrl', () => {
  it('prefills the composer with the text and the landing URL', () => {
    const url = shareIntentUrl('Flags on every profile')
    expect(url.startsWith('https://x.com/intent/post?text=')).toBe(true)
    const text = decodeURIComponent(url.split('text=')[1]!)
    expect(text).toBe(`Flags on every profile\n\n${SHARE_LANDING_URL}`)
  })
})
