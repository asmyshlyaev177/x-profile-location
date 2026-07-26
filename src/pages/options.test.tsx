import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BACKGROUND_PREFETCH_KEY,
  OPTIONS_SECTIONS_KEY,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  SHARED_CACHE_KEY,
} from '../scripts/countries'

// Mutable backing store for the chrome.storage.local mock. It has to be in
// place before options.tsx is imported below — the module renders itself into
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
  runtime: { sendMessage: vi.fn().mockResolvedValue(undefined) },
}

const { Options } = await import('./options')

const KEYWORDS_LABEL = 'Highlight tweets by keyword'
const FLAGS_LABEL = 'Highlight tweets by flags'
const BLOCKED_LABEL = 'Blocked locations'
const PREFETCH_LABEL = 'Background lookups'

function mountOptions(sections: Record<string, boolean>) {
  storedRef.current = { [OPTIONS_SECTIONS_KEY]: sections }
  return render(<Options />)
}

function mountStored(stored: Record<string, unknown>) {
  storedRef.current = stored
  return render(<Options />)
}

function section(root: ParentNode, label: string) {
  const summary = [...root.querySelectorAll('summary')].find((el) =>
    el.textContent?.includes(label),
  )
  if (!summary) throw new Error(`no section titled "${label}"`)
  return summary.closest('details') as HTMLDetailsElement
}

/** Mimics the native <details> toggle: flip `open`, then fire the event. */
function toggle(details: HTMLDetailsElement) {
  details.open = !details.open
  fireEvent(details, new Event('toggle'))
}

beforeEach(() => {
  setMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('options page section state', () => {
  // Restoring state flips `open` programmatically, which fires `toggle` too —
  // those events must not clobber the values that were just loaded, nor write
  // anything back to storage.
  it('restores the stored open/closed state', async () => {
    const { container } = mountOptions({ keywords: false, flags: true })

    await waitFor(() => {
      expect(section(container, KEYWORDS_LABEL).open).toBe(false)
    })
    expect(section(container, FLAGS_LABEL).open).toBe(true)
    expect(setMock).not.toHaveBeenCalled()
  })

  it('persists a section the user opens', async () => {
    const { container } = mountOptions({ flags: false })
    await waitFor(() =>
      expect(section(container, FLAGS_LABEL).open).toBe(false),
    )

    toggle(section(container, FLAGS_LABEL))

    expect(setMock).toHaveBeenCalledWith({
      [OPTIONS_SECTIONS_KEY]: expect.objectContaining({ flags: true }),
    })
    await waitFor(() => expect(section(container, FLAGS_LABEL).open).toBe(true))
  })

  it('persists a section the user closes without touching the others', async () => {
    const { container } = mountOptions({ keywords: true, blocked: true })
    await waitFor(() =>
      expect(section(container, KEYWORDS_LABEL).open).toBe(true),
    )

    toggle(section(container, KEYWORDS_LABEL))

    const last = setMock.mock.calls.at(-1)?.[0] as Record<
      string,
      Record<string, boolean>
    >
    expect(last[OPTIONS_SECTIONS_KEY]).toMatchObject({
      keywords: false,
      blocked: true,
    })
    await waitFor(() =>
      expect(section(container, KEYWORDS_LABEL).open).toBe(false),
    )
    expect(section(container, BLOCKED_LABEL).open).toBe(true)
  })

  it('does not write on a toggle event that changes nothing', async () => {
    const { container } = mountOptions({ keywords: true })
    await waitFor(() =>
      expect(section(container, KEYWORDS_LABEL).open).toBe(true),
    )
    setMock.mockClear()

    fireEvent(section(container, KEYWORDS_LABEL), new Event('toggle'))

    expect(setMock).not.toHaveBeenCalled()
  })
})

describe('background lookups section', () => {
  const PREFETCH = 'Prefetch locations in the background'
  const SPREAD = 'Spread lookups over'
  const CACHE = 'Use shared community location cache'

  function shareSelect(root: ParentNode) {
    return section(root, PREFETCH_LABEL).querySelector(
      'select',
    ) as HTMLSelectElement
  }

  /** The section's checkbox whose label contains `text` — order-independent. */
  function checkbox(root: ParentNode, text: string) {
    const label = [
      ...section(root, PREFETCH_LABEL).querySelectorAll('label'),
    ].find((l) => l.textContent?.includes(text))
    if (!label) throw new Error(`no option labelled "${text}"`)
    return label.querySelector('input[type="checkbox"]') as HTMLInputElement
  }

  it('defaults to a 70% share, spread, with nothing stored', async () => {
    const { container } = mountStored({})

    await waitFor(() => expect(shareSelect(container).value).toBe('0.7'))
    expect(checkbox(container, PREFETCH).checked).toBe(true)
    expect(checkbox(container, SPREAD).checked).toBe(true)
    // Defaults are applied in memory only — the first write should be the user's.
    expect(setMock).not.toHaveBeenCalled()
  })

  it('shows the stored share and pacing', async () => {
    const { container } = mountStored({
      [PREFETCH_SHARE_KEY]: 0.3,
      [PREFETCH_PACING_KEY]: 'instant',
    })

    await waitFor(() => expect(shareSelect(container).value).toBe('0.3'))
    expect(checkbox(container, SPREAD).checked).toBe(false)
  })

  it('persists a new share as a number, not the select’s string', async () => {
    const { container } = mountStored({})
    await waitFor(() => expect(shareSelect(container).value).toBe('0.7'))

    const select = shareSelect(container)
    select.value = '0.9'
    fireEvent.change(select)

    expect(setMock).toHaveBeenCalledWith({ [PREFETCH_SHARE_KEY]: 0.9 })
    await waitFor(() => expect(shareSelect(container).value).toBe('0.9'))
  })

  it('persists the pacing mode in both directions', async () => {
    const { container } = mountStored({})
    await waitFor(() => expect(checkbox(container, SPREAD).checked).toBe(true))

    fireEvent.click(checkbox(container, SPREAD))
    expect(setMock).toHaveBeenCalledWith({ [PREFETCH_PACING_KEY]: 'instant' })
    await waitFor(() => expect(checkbox(container, SPREAD).checked).toBe(false))

    fireEvent.click(checkbox(container, SPREAD))
    expect(setMock).toHaveBeenCalledWith({ [PREFETCH_PACING_KEY]: 'spread' })
    await waitFor(() => expect(checkbox(container, SPREAD).checked).toBe(true))
  })

  it('disables the share and pacing controls while prefetch is off', async () => {
    const { container } = mountStored({ [BACKGROUND_PREFETCH_KEY]: false })

    await waitFor(() =>
      expect(checkbox(container, PREFETCH).checked).toBe(false),
    )
    expect(shareSelect(container).disabled).toBe(true)
    expect(checkbox(container, SPREAD).disabled).toBe(true)
  })

  // The community cache is what background prefetch feeds, so it leads the
  // section and switching it off switches everything under it off too.
  describe('community cache gate', () => {
    it('comes first in the section', async () => {
      const { container } = mountStored({})
      await waitFor(() => expect(shareSelect(container).value).toBe('0.7'))

      const labels = [
        ...section(container, PREFETCH_LABEL).querySelectorAll('label'),
      ].map((l) => l.textContent ?? '')
      expect(labels[0]).toContain(CACHE)
    })

    it('disables every lookup control when switched off', async () => {
      const { container } = mountStored({ [SHARED_CACHE_KEY]: false })

      await waitFor(() =>
        expect(checkbox(container, CACHE).checked).toBe(false),
      )
      expect(checkbox(container, PREFETCH).disabled).toBe(true)
      expect(shareSelect(container).disabled).toBe(true)
      expect(checkbox(container, SPREAD).disabled).toBe(true)
      // The prefetch setting keeps its own stored value, it is only overridden.
      expect(checkbox(container, PREFETCH).checked).toBe(true)
    })

    it('leaves them alone while switched on', async () => {
      const { container } = mountStored({ [SHARED_CACHE_KEY]: true })

      await waitFor(() => expect(checkbox(container, CACHE).checked).toBe(true))
      expect(checkbox(container, PREFETCH).disabled).toBe(false)
      expect(shareSelect(container).disabled).toBe(false)
      expect(checkbox(container, SPREAD).disabled).toBe(false)
    })
  })
})
