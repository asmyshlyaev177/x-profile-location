import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BLOCKED_COUNTRIES_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  POPUP_SECTION_KEY,
} from '../scripts/countries'

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
