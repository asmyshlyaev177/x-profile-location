import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  POPUP_SECTION_KEY,
  RATE_PROMPT_KEY,
  USAGE_STATS_KEY,
} from '../scripts/countries'
import { RATE_PROMPT_MIN_DAYS, RATE_PROMPT_SNOOZE_MS } from '../scripts/usage'

// Mutable backing store for the chrome.storage.local mock. It has to be in
// place before popup.tsx is imported below — the module renders itself into
// document.body on import, which reads storage.
const storedRef: { current: Record<string, unknown> } = { current: {} }
const setMock = vi.fn()

;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: {
      get: vi.fn(() => Promise.resolve({ ...storedRef.current })),
      set: setMock,
    },
    onChanged: { addListener: vi.fn() },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    getURL: (p: string) => p,
  },
  tabs: { create: vi.fn().mockResolvedValue(undefined) },
}

const { Popup } = await import('./popup')

function mountStored(stored: Record<string, unknown>) {
  storedRef.current = stored
  return render(<Popup />)
}

/** The written value for a key, from the most recent set() that carried it. */
function lastWrite(key: string): unknown {
  const calls = setMock.mock.calls.filter(
    (c) => c[0] && Object.hasOwn(c[0] as object, key),
  )
  return calls.length
    ? (calls[calls.length - 1][0] as Record<string, unknown>)[key]
    : undefined
}

beforeEach(() => {
  setMock.mockClear()
  storedRef.current = {}
  // The module rendered itself into document.body on import; clear it so each
  // test's own render is the only Popup in the tree.
  document.body.innerHTML = ''
})

afterEach(cleanup)

describe('the filter accordions', () => {
  it('starts collapsed, so the popup is still a handful of switches', async () => {
    // The whole reason these are accordions and the options page's are not: an
    // open list editor would push the switches people came for off the bottom.
    const { container, queryByPlaceholderText } = mountStored({
      [BLOCKED_COUNTRIES_KEY]: ['Japan'],
      [HIGHLIGHT_KEYWORDS_KEY]: ['nft'],
    })
    await waitFor(() =>
      expect(container.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    for (const b of container.querySelectorAll('[aria-expanded]')) {
      expect(b.getAttribute('aria-expanded')).toBe('false')
    }
    expect(queryByPlaceholderText('Country or region…')).toBeNull()
  })

  it('says how many entries a collapsed list holds', async () => {
    // Collapsed, the only thing that can tell you a filter is doing something.
    const { getByText } = mountStored({
      [BLOCKED_COUNTRIES_KEY]: ['Japan', 'India'],
    })

    await waitFor(() => {
      const button = getByText('Blocked locations').closest('button')!
      expect(button.textContent).toContain('2')
    })
  })

  it('reopens the section it was left on', async () => {
    const { getByPlaceholderText } = mountStored({
      [POPUP_SECTION_KEY]: 'keywords',
    })

    // Adding three countries one at a time should not mean opening the same
    // section three times.
    await waitFor(() =>
      expect(getByPlaceholderText('Add a keyword…')).toBeTruthy(),
    )
  })

  it('remembers the section as it is opened', async () => {
    const { getByText, container } = mountStored({})
    await waitFor(() =>
      expect(container.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    fireEvent.click(getByText('Blocked locations'))

    await waitFor(() => expect(lastWrite(POPUP_SECTION_KEY)).toBe('locations'))
  })

  it('opens one at a time', async () => {
    const { getByText, container } = mountStored({
      [POPUP_SECTION_KEY]: 'locations',
    })
    await waitFor(() =>
      expect(
        container.querySelector('[aria-expanded="true"]')?.textContent,
      ).toContain('Blocked locations'),
    )

    fireEvent.click(getByText('Highlight keywords'))

    await waitFor(() => {
      const expanded = container.querySelectorAll('[aria-expanded="true"]')
      expect(expanded).toHaveLength(1)
      expect(expanded[0].textContent).toContain('Highlight keywords')
    })
  })
})

describe('editing the filters from the popup', () => {
  it('writes a keyword to the key the content script listens on', async () => {
    // Same key the options page writes, so the timeline behind the popup
    // updates without it being reopened.
    const { getByPlaceholderText } = mountStored({
      [POPUP_SECTION_KEY]: 'keywords',
      [HIGHLIGHT_KEYWORDS_KEY]: ['crypto'],
    })

    const input = await waitFor(() => getByPlaceholderText('Add a keyword…'))
    fireEvent.input(input, { target: { value: 'NFT' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(lastWrite(HIGHLIGHT_KEYWORDS_KEY)).toEqual(['crypto', 'nft']),
    )
  })

  it('removes a keyword without disturbing the rest', async () => {
    const { getByTitle } = mountStored({
      [POPUP_SECTION_KEY]: 'keywords',
      [HIGHLIGHT_KEYWORDS_KEY]: ['crypto', 'nft'],
    })

    fireEvent.click(await waitFor(() => getByTitle('Remove nft')))

    await waitFor(() =>
      expect(lastWrite(HIGHLIGHT_KEYWORDS_KEY)).toEqual(['crypto']),
    )
  })

  it('canonicalises a country before storing it', async () => {
    // "USA" and "United States" are the same filter; storage keeps one of them
    // so the content script's comparison has one thing to match.
    const { getByPlaceholderText } = mountStored({
      [POPUP_SECTION_KEY]: 'locations',
    })

    const input = await waitFor(() =>
      getByPlaceholderText('Country or region…'),
    )
    fireEvent.input(input, { target: { value: 'USA' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    await waitFor(() =>
      expect(lastWrite(BLOCKED_COUNTRIES_KEY)).toEqual(['United States']),
    )
  })

  it('removes a blocked location', async () => {
    const { getByTitle } = mountStored({
      [POPUP_SECTION_KEY]: 'locations',
      [BLOCKED_COUNTRIES_KEY]: ['Japan', 'India'],
    })

    fireEvent.click(await waitFor(() => getByTitle('Remove Japan')))

    await waitFor(() =>
      expect(lastWrite(BLOCKED_COUNTRIES_KEY)).toEqual(['India']),
    )
  })

  it('writes nothing merely by being opened', async () => {
    // A popup that saved on load would rewrite every key each time it is
    // opened, and a normalizer disagreeing with what is stored would quietly
    // become a migration.
    mountStored({
      [BLOCKED_COUNTRIES_KEY]: ['Japan'],
      [HIGHLIGHT_KEYWORDS_KEY]: ['nft'],
      [POPUP_SECTION_KEY]: 'locations',
    })
    await waitFor(() =>
      expect(document.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    expect(setMock).not.toHaveBeenCalled()
  })
})

describe('the rating ask', () => {
  const enoughUse = {
    [USAGE_STATS_KEY]: {
      activeDays: RATE_PROMPT_MIN_DAYS,
      lastDay: '2026-08-03',
    },
  }

  it('stays away until the extension has been used for a few days', async () => {
    const { queryByText } = mountStored({
      [USAGE_STATS_KEY]: {
        activeDays: RATE_PROMPT_MIN_DAYS - 1,
        lastDay: '2026-08-03',
      },
    })
    await waitFor(() =>
      expect(document.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    expect(queryByText(/Rate it/)).toBeNull()
  })

  it('appears once it has', async () => {
    const { findByText } = mountStored(enoughUse)
    expect(await findByText(/Rate it/)).toBeTruthy()
  })

  it('does not come back after Later, for a fortnight', async () => {
    const { findByText } = mountStored(enoughUse)
    const before = Date.now()
    fireEvent.click(await findByText('Later'))

    await waitFor(() => expect(lastWrite(RATE_PROMPT_KEY)).toBeTruthy())
    const written = lastWrite(RATE_PROMPT_KEY) as {
      status: string
      snoozeUntil: number
    }
    expect(written.status).toBe('later')
    expect(written.snoozeUntil).toBeGreaterThanOrEqual(
      before + RATE_PROMPT_SNOOZE_MS,
    )
  })

  it('never comes back after No thanks', async () => {
    const { findByText } = mountStored(enoughUse)
    fireEvent.click(await findByText('No thanks'))

    await waitFor(() =>
      expect(lastWrite(RATE_PROMPT_KEY)).toMatchObject({ status: 'done' }),
    )
  })

  it('treats rating as answered, so it is asked once', async () => {
    // The click opens the store in a new tab; the state has to be written on
    // the way out or the next open asks again.
    const { findByText } = mountStored(enoughUse)
    fireEvent.click(await findByText(/Rate it/))

    await waitFor(() =>
      expect(lastWrite(RATE_PROMPT_KEY)).toMatchObject({ status: 'done' }),
    )
  })

  it('links to the store listing, not to a runtime id', async () => {
    // chrome.runtime.id is a random string for every unpacked build, so the
    // link has to be the store's own.
    const { findByText } = mountStored(enoughUse)
    const link = (await findByText(/Rate it/)) as HTMLAnchorElement
    expect(link.href).toContain('chromewebstore.google.com')
  })

  it('does not ask while the extension is paused', async () => {
    const { queryByText } = mountStored({
      ...enoughUse,
      [EXTENSION_ENABLED_KEY]: false,
    })
    await waitFor(() =>
      expect(document.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    expect(queryByText(/Rate it/)).toBeNull()
  })

  it('leaves a way to the store even when it is not asking', async () => {
    // The card is a request and goes away once answered; the footer link is
    // just the way to the listing, for anyone who goes looking on their own.
    const { findByText, queryByText } = mountStored({})

    const link = (await findByText('Rate ★')) as HTMLAnchorElement
    expect(link.href).toContain('chromewebstore.google.com')
    expect(queryByText(/Rate it/)).toBeNull()
  })

  it('counts the footer link as answered, so it will not ask later', async () => {
    // Somebody who has already been to the review page should not be asked to
    // go there again a week from now.
    const { findByText } = mountStored({})
    fireEvent.click(await findByText('Rate ★'))

    await waitFor(() =>
      expect(lastWrite(RATE_PROMPT_KEY)).toMatchObject({ status: 'done' }),
    )
  })

  it('stays gone once answered', async () => {
    const { queryByText } = mountStored({
      ...enoughUse,
      [RATE_PROMPT_KEY]: { status: 'done', snoozeUntil: 0 },
    })
    await waitFor(() =>
      expect(document.querySelector('[aria-expanded]')).toBeTruthy(),
    )

    expect(queryByText(/Rate it/)).toBeNull()
  })
})
