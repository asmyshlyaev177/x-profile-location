import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { THEME_KEY } from '../scripts/countries'
import { applyTheme, startThemeSync } from './theme'

type ChangeListener = (
  changes: Record<string, { newValue?: unknown }>,
  area: string,
) => void

const storedRef: { current: Record<string, unknown> } = { current: {} }
const listeners: ChangeListener[] = []

;(globalThis as unknown as { chrome: unknown }).chrome = {
  storage: {
    local: { get: vi.fn(() => Promise.resolve({ ...storedRef.current })) },
    onChanged: {
      addListener: vi.fn((fn: ChangeListener) => listeners.push(fn)),
    },
  },
}

beforeEach(() => {
  storedRef.current = {}
  listeners.length = 0
})

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

describe('applyTheme', () => {
  it('pins an explicit choice on <html>', () => {
    applyTheme('dark')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')

    applyTheme('light')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('leaves no attribute at all for system', () => {
    // Not `data-theme="system"`: the stylesheet's default is already
    // `color-scheme: light dark`, and an absent attribute is what lets CSS
    // follow the OS without waiting for storage.
    applyTheme('dark')
    applyTheme('system')
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false)
  })
})

describe('startThemeSync', () => {
  it('applies what is stored', async () => {
    storedRef.current = { [THEME_KEY]: 'dark' }
    startThemeSync()

    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    )
  })

  it('follows a change made in another extension page', async () => {
    startThemeSync()
    await vi.waitFor(() => expect(listeners).toHaveLength(1))

    listeners[0]({ [THEME_KEY]: { newValue: 'light' } }, 'local')
    expect(document.documentElement.getAttribute('data-theme')).toBe('light')
  })

  it('ignores other keys and other storage areas', async () => {
    storedRef.current = { [THEME_KEY]: 'dark' }
    startThemeSync()
    await vi.waitFor(() =>
      expect(document.documentElement.getAttribute('data-theme')).toBe('dark'),
    )

    listeners[0]({ somethingElse: { newValue: 'light' } }, 'local')
    listeners[0]({ [THEME_KEY]: { newValue: 'light' } }, 'sync')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })
})
