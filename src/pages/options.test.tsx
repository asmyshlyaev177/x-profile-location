import {
  DEFAULT_MIN_CONFIDENCE,
  MIN_CONFIDENCE_CHOICES,
} from '../scripts/settings'
import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BACKGROUND_PREFETCH_KEY,
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  MIN_CONFIDENCE_KEY,
  OPTIONS_TAB_KEY,
  PREFETCH_PACING_KEY,
  PREFETCH_SHARE_KEY,
  REGION_EXCLUSIONS_KEY,
  RULE_EXCEPTIONS_KEY,
  SHARED_CACHE_KEY,
  SHOW_ADVANCED_KEY,
  THEME_KEY,
} from '../scripts/constants'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/preact'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { REGION_MEMBERS } from '../scripts/countries/countries'
import type { OptionsTabId } from '../scripts/settings'
import { isSharedCacheConfigured } from '../scripts/cache/shared-cache'

// The real module reads CACHE_API_BASE at import time; the options page only
// asks it whether a server is configured at all.
vi.mock('../scripts/cache/shared-cache', () => ({
  isSharedCacheConfigured: vi.fn(() => true),
}))

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

const BLOCKED_LABEL = 'Locations'
const PREFETCH_LABEL = 'Background lookups'
const CONFIDENCE_LABEL = 'Shared cache trust'

// Sections live behind tabs since the Phase 2 redesign, so a test has to say
// which tab it is looking at. Seeded through storage rather than clicked:
// selecting a tab writes OPTIONS_TAB_KEY, and several tests here assert that
// merely loading the page writes nothing.
function mountStored(
  stored: Record<string, unknown>,
  tab: OptionsTabId = 'data',
) {
  storedRef.current = { [OPTIONS_TAB_KEY]: tab, ...stored }
  return render(<Options />)
}

function tabButton(root: ParentNode, label: string) {
  return [...root.querySelectorAll('button[role="tab"]')].find((el) =>
    el.textContent?.includes(label),
  )
}

/**
 * The card carrying a given heading. Sections are plain <section> cards since
 * the accordions were removed — nothing to expand, so a test just finds the
 * card and reads inside it.
 */
function section(root: ParentNode, label: string) {
  const heading = [...root.querySelectorAll('h2')].find((el) =>
    el.textContent?.includes(label),
  )
  if (!heading) throw new Error(`no section titled "${label}"`)
  return heading.closest('section') as HTMLElement
}

beforeEach(() => {
  setMock.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
})

describe('background lookups section', () => {
  const PREFETCH = 'Prefetch locations in the background'
  const SPREAD = 'Spread lookups over'
  const CACHE = 'Use the shared community cache'

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

  it('defaults to an 85% share, spread, with nothing stored', async () => {
    const { container } = mountStored({})

    await waitFor(() => expect(shareSelect(container).value).toBe('0.85'))
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
    await waitFor(() => expect(shareSelect(container).value).toBe('0.85'))

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
      await waitFor(() => expect(shareSelect(container).value).toBe('0.85'))

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

// The threshold the shared cache trusts (MIN_CONFIDENCE_KEY) is a documented
// trade-off rather than a preference, so it lives behind a section that the
// options page does not advertise — see the reasoning in shared-cache.ts.
describe('advanced section', () => {
  // The tab is what is (or isn't) offered; the section inside it is where the
  // one setting lives.
  function hasAdvanced(root: ParentNode) {
    return tabButton(root, 'Advanced') !== undefined
  }

  function confidenceSelect(root: ParentNode) {
    return section(root, CONFIDENCE_LABEL).querySelector(
      'select',
    ) as HTMLSelectElement
  }

  afterEach(() => {
    history.pushState({}, '', '/')
  })

  it('is absent for a normal install', async () => {
    const { container } = mountStored({}, 'advanced')
    await waitFor(() => expect(hasAdvanced(container)).toBe(false))
  })

  it('is shown once it has been enabled', async () => {
    const { container } = mountStored({ [SHOW_ADVANCED_KEY]: true }, 'advanced')
    await waitFor(() => expect(hasAdvanced(container)).toBe(true))
    expect(confidenceSelect(container).value).toBe(
      String(DEFAULT_MIN_CONFIDENCE),
    )
  })

  it('?advanced=1 reveals it and remembers the choice', async () => {
    history.pushState({}, '', '/options.html?advanced=1')
    const { container } = mountStored({}, 'advanced')

    await waitFor(() => expect(hasAdvanced(container)).toBe(true))
    expect(setMock).toHaveBeenCalledWith({ [SHOW_ADVANCED_KEY]: true })
  })

  it('?advanced=0 hides it again', async () => {
    history.pushState({}, '', '/options.html?advanced=0')
    const { container } = mountStored({ [SHOW_ADVANCED_KEY]: true }, 'advanced')

    await waitFor(() => expect(setMock).toHaveBeenCalled())
    expect(hasAdvanced(container)).toBe(false)
    expect(setMock).toHaveBeenCalledWith({ [SHOW_ADVANCED_KEY]: false })
  })

  it('loads a stored threshold and persists a change', async () => {
    const { container } = mountStored(
      { [SHOW_ADVANCED_KEY]: true, [MIN_CONFIDENCE_KEY]: 2 },
      'advanced',
    )
    await waitFor(() => expect(confidenceSelect(container).value).toBe('2'))

    const select = confidenceSelect(container)
    select.value = '3'
    fireEvent.change(select)

    expect(setMock).toHaveBeenCalledWith({ [MIN_CONFIDENCE_KEY]: 3 })
  })

  // Storage is hand-editable, and 0 would trust a single unverified report
  // while a large value would silently serve nothing at all.
  it('clamps an out-of-range stored threshold', async () => {
    const { container } = mountStored(
      { [SHOW_ADVANCED_KEY]: true, [MIN_CONFIDENCE_KEY]: 99 },
      'advanced',
    )
    await waitFor(() =>
      expect(confidenceSelect(container).value).toBe(
        String(MIN_CONFIDENCE_CHOICES[MIN_CONFIDENCE_CHOICES.length - 1]),
      ),
    )
  })

  it('stays hidden when the shared cache is not configured', async () => {
    vi.mocked(isSharedCacheConfigured).mockReturnValue(false)
    const { container } = mountStored({ [SHOW_ADVANCED_KEY]: true }, 'advanced')
    await waitFor(() => expect(hasAdvanced(container)).toBe(false))
    vi.mocked(isSharedCacheConfigured).mockReturnValue(true)
  })
})

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------
describe('tabs', () => {
  function tabs(root: ParentNode) {
    return [...root.querySelectorAll('button[role="tab"]')].map(
      (el) => el.textContent ?? '',
    )
  }

  it('opens on Display when nothing is stored', async () => {
    const { container } = mountStored({}, 'display')
    await waitFor(() => expect(tabs(container).length).toBeGreaterThan(0))
    const active = container.querySelector('[aria-selected="true"]')
    expect(active?.textContent).toContain('Display')
  })

  it('remembers the tab the user was last on', async () => {
    const { container } = mountStored({}, 'filters')
    await waitFor(() =>
      expect(
        container.querySelector('[aria-selected="true"]')?.textContent,
      ).toContain('Filters'),
    )
    expect(setMock).not.toHaveBeenCalled()
  })

  it('persists a tab change', async () => {
    const { container } = mountStored({}, 'display')
    await waitFor(() => expect(tabButton(container, 'Filters')).toBeDefined())

    fireEvent.click(tabButton(container, 'Filters')!)

    expect(setMock).toHaveBeenCalledWith({ [OPTIONS_TAB_KEY]: 'filters' })
    await waitFor(() => expect(section(container, BLOCKED_LABEL)).toBeDefined())
  })

  it('falls back to Display when the stored tab is no longer offered', async () => {
    // ?advanced=0 while sitting on Advanced would otherwise leave the page on a
    // tab with no button and no content.
    const { container } = mountStored(
      { [SHOW_ADVANCED_KEY]: false },
      'advanced',
    )
    await waitFor(() =>
      expect(
        container.querySelector('[aria-selected="true"]')?.textContent,
      ).toContain('Display'),
    )
  })
})

// ---------------------------------------------------------------------------
// Filters tab
// ---------------------------------------------------------------------------
describe('blocked locations', () => {
  const SOUTH_ASIA = REGION_MEMBERS['South Asia']
  const COVERAGE = /(\d+)\/(\d+)/

  /** The chip body of the one blocked region, which is what opens the picker. */
  function regionChip(root: ParentNode) {
    return [...section(root, BLOCKED_LABEL).querySelectorAll('button')].find(
      (el) => COVERAGE.test(el.textContent ?? ''),
    )
  }

  const coverage = (root: ParentNode) =>
    regionChip(root)?.textContent?.match(COVERAGE)?.[0]

  it('shows how many countries of a region it covers', async () => {
    const { container } = mountStored(
      { [BLOCKED_COUNTRIES_KEY]: ['South Asia', 'France'] },
      'filters',
    )
    await waitFor(() => expect(regionChip(container)).toBeDefined())

    // A plain country stands for itself, so it gets no count and no picker.
    expect(
      [...section(container, BLOCKED_LABEL).querySelectorAll('button')].filter(
        (el) => COVERAGE.test(el.textContent ?? ''),
      ),
    ).toHaveLength(1)
    expect(coverage(container)).toBe(
      `${SOUTH_ASIA.length}/${SOUTH_ASIA.length}`,
    )
  })

  it('counts only the members still checked', async () => {
    const { container } = mountStored(
      {
        [BLOCKED_COUNTRIES_KEY]: ['South Asia'],
        [REGION_EXCLUSIONS_KEY]: { 'South Asia': ['Nepal'] },
      },
      'filters',
    )
    await waitFor(() => expect(regionChip(container)).toBeDefined())
    expect(coverage(container)).toBe(
      `${SOUTH_ASIA.length - 1}/${SOUTH_ASIA.length}`,
    )
  })

  it('unchecking a country excludes it from the region', async () => {
    const { container } = mountStored(
      { [BLOCKED_COUNTRIES_KEY]: ['South Asia'] },
      'filters',
    )
    await waitFor(() => expect(regionChip(container)).toBeDefined())
    fireEvent.click(regionChip(container) as HTMLElement)

    const nepal = [
      ...section(container, BLOCKED_LABEL).querySelectorAll('label'),
    ].find((el) => el.textContent?.includes('Nepal'))
    fireEvent.click(nepal?.querySelector('input') as HTMLInputElement)

    expect(setMock).toHaveBeenCalledWith({
      [REGION_EXCLUSIONS_KEY]: { 'South Asia': ['Nepal'] },
    })
    await waitFor(() =>
      expect(coverage(container)).toBe(
        `${SOUTH_ASIA.length - 1}/${SOUTH_ASIA.length}`,
      ),
    )
  })

  it('"None" leaves the region matching only its own label', async () => {
    const { container } = mountStored(
      { [BLOCKED_COUNTRIES_KEY]: ['South Asia'] },
      'filters',
    )
    await waitFor(() => expect(regionChip(container)).toBeDefined())
    fireEvent.click(regionChip(container) as HTMLElement)

    const none = [
      ...section(container, BLOCKED_LABEL).querySelectorAll('button'),
    ].find((el) => el.textContent === 'None')
    fireEvent.click(none as HTMLElement)

    expect(setMock).toHaveBeenCalledWith({
      [REGION_EXCLUSIONS_KEY]: { 'South Asia': [...SOUTH_ASIA] },
    })
    await waitFor(() =>
      expect(coverage(container)).toBe(`0/${SOUTH_ASIA.length}`),
    )
  })

  it('closes the picker with the region it belongs to', async () => {
    const { container } = mountStored(
      { [BLOCKED_COUNTRIES_KEY]: ['South Asia'] },
      'filters',
    )
    await waitFor(() => expect(regionChip(container)).toBeDefined())
    fireEvent.click(regionChip(container) as HTMLElement)

    const card = section(container, BLOCKED_LABEL)
    expect(card.textContent).toContain('Nepal')
    fireEvent.click(
      card.querySelector('button[title^="Remove"]') as HTMLElement,
    )

    await waitFor(() =>
      expect(section(container, BLOCKED_LABEL).textContent).not.toContain(
        'Nepal',
      ),
    )
  })

  it('folds an alias onto one chip, matching what is actually blocked', async () => {
    const { container } = mountStored(
      { [BLOCKED_COUNTRIES_KEY]: ['Czech Republic', 'Czechia'] },
      'filters',
    )
    await waitFor(() => expect(section(container, BLOCKED_LABEL)).toBeDefined())
    const text = section(container, BLOCKED_LABEL).textContent ?? ''
    expect(text).toContain('Czechia')
    expect(text).not.toContain('Czech Republic')
  })
})

describe('account age filter', () => {
  it('persists the toggle and the threshold together', async () => {
    const { container } = mountStored({}, 'filters')
    await waitFor(() => expect(section(container, 'Account age')).toBeDefined())

    const details = section(container, 'Account age')
    const check = details.querySelector(
      'input[type="checkbox"]',
    ) as HTMLInputElement
    fireEvent.click(check)

    expect(setMock).toHaveBeenCalledWith({
      [ACCOUNT_AGE_KEY]: { enabled: true, days: 180 },
    })

    const select = details.querySelector('select') as HTMLSelectElement
    await waitFor(() => expect(select.disabled).toBe(false))
    select.value = '1095'
    fireEvent.change(select)

    expect(setMock).toHaveBeenCalledWith({
      [ACCOUNT_AGE_KEY]: { enabled: true, days: 1095 },
    })
  })
})

// ---------------------------------------------------------------------------
// Exceptions tab
// ---------------------------------------------------------------------------
describe('account age thresholds', () => {
  it('offers months and years, not days', async () => {
    const { container } = mountStored({}, 'filters')
    await waitFor(() => expect(section(container, 'Account age')).toBeDefined())

    const options = [
      ...section(container, 'Account age').querySelectorAll('option'),
    ].map((o) => o.textContent)
    expect(options).toEqual(['3 months', '6 months', '1 year', '3 years'])
  })

  it('keeps a stored threshold the list no longer offers, and shows it', async () => {
    // Somebody who set 30 days before the choices changed must not have their
    // filter silently moved to the nearest option.
    const { container } = mountStored(
      { [ACCOUNT_AGE_KEY]: { enabled: true, days: 30 } },
      'filters',
    )
    await waitFor(() => expect(section(container, 'Account age')).toBeDefined())

    const select = section(container, 'Account age').querySelector(
      'select',
    ) as HTMLSelectElement
    expect(select.value).toBe('30')
    expect(
      [...select.querySelectorAll('option')].map((o) => o.textContent),
    ).toContain('30 days')
    // Nothing was written — showing a setting must not change it.
    expect(setMock).not.toHaveBeenCalled()
  })
})

describe('per-rule exceptions', () => {
  it('shows the old highlight-only list under the highlight rule', async () => {
    const { container } = mountStored(
      { [HIGHLIGHT_EXCEPTIONS_KEY]: ['legacyuser'] },
      'exceptions',
    )
    await waitFor(() =>
      expect(section(container, 'Per-rule exceptions').textContent).toContain(
        '@legacyuser',
      ),
    )
  })

  it('writes both stores, so a removal cannot be resurrected', async () => {
    const { container } = mountStored(
      { [HIGHLIGHT_EXCEPTIONS_KEY]: ['bob'] },
      'exceptions',
    )
    await waitFor(() =>
      expect(section(container, 'Per-rule exceptions').textContent).toContain(
        '@bob',
      ),
    )

    const remove = [
      ...section(container, 'Per-rule exceptions').querySelectorAll('button'),
    ].find((b) => b.title === 'Remove @bob')
    fireEvent.click(remove!)

    const written = setMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(written[HIGHLIGHT_EXCEPTIONS_KEY]).toEqual([])
    expect(
      (written[RULE_EXCEPTIONS_KEY] as { highlight: string[] }).highlight,
    ).toEqual([])
  })

  it('keeps the allowlist separate from the per-rule lists', async () => {
    const { container } = mountStored(
      { [ALWAYS_SHOW_KEY]: ['friend'] },
      'exceptions',
    )
    await waitFor(() =>
      expect(section(container, 'Always show').textContent).toContain(
        '@friend',
      ),
    )
    expect(section(container, 'Per-rule exceptions').textContent).not.toContain(
      '@friend',
    )
  })
})

// ---------------------------------------------------------------------------
// Master switch
// ---------------------------------------------------------------------------
describe('master switch', () => {
  it('persists being turned off and says so', async () => {
    const { container } = mountStored({}, 'display')
    await waitFor(() => expect(container.textContent).toContain('Enabled'))

    const master = container.querySelector(
      'header input[type="checkbox"]',
    ) as HTMLInputElement
    fireEvent.click(master)

    expect(setMock).toHaveBeenCalledWith({ [EXTENSION_ENABLED_KEY]: false })
    await waitFor(() => expect(container.textContent).toContain('Paused'))
  })
})

// ---------------------------------------------------------------------------
// Appearance
// ---------------------------------------------------------------------------
describe('theme', () => {
  function themeSelect(root: ParentNode) {
    return section(root, 'Appearance').querySelector(
      'select',
    ) as HTMLSelectElement
  }

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('follows the system with nothing stored, and writes nothing to say so', async () => {
    const { container } = mountStored({}, 'display')

    await waitFor(() => expect(themeSelect(container).value).toBe('system'))
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(setMock).not.toHaveBeenCalled()
  })

  it('shows the stored choice', async () => {
    const { container } = mountStored({ [THEME_KEY]: 'dark' }, 'display')

    await waitFor(() => expect(themeSelect(container).value).toBe('dark'))
  })

  it('paints the page as soon as it is picked, without waiting for storage', async () => {
    const { container } = mountStored({}, 'display')
    await waitFor(() => expect(themeSelect(container).value).toBe('system'))

    const select = themeSelect(container)
    select.value = 'dark'
    fireEvent.change(select)

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
    expect(setMock).toHaveBeenCalledWith({ [THEME_KEY]: 'dark' })
  })

  it('takes the attribute back off when system is chosen again', async () => {
    const { container } = mountStored({ [THEME_KEY]: 'dark' }, 'display')
    await waitFor(() => expect(themeSelect(container).value).toBe('dark'))

    const select = themeSelect(container)
    select.value = 'system'
    fireEvent.change(select)

    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
    expect(setMock).toHaveBeenCalledWith({ [THEME_KEY]: 'system' })
  })
})
