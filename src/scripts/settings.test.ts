import {
  ACCOUNT_AGE_KEY,
  ALWAYS_SHOW_KEY,
  BLOCKED_COUNTRIES_KEY,
  EXTENSION_ENABLED_KEY,
  HIDE_BLOCKED_LOCATIONS_KEY,
  HIGHLIGHT_EXCEPTIONS_KEY,
  HIGHLIGHT_KEYWORDS_KEY,
  PREFETCH_SHARE_KEY,
  RULE_EXCEPTIONS_KEY,
  SHOW_LOCATION_IN_FEED_KEY,
} from './countries'
import {
  defaultSetting,
  exportSettings,
  importSettings,
  readSetting,
  SettingsImportError,
  SETTINGS_FORMAT,
  SETTINGS_KEYS,
  settingsFileName,
  settingValue,
} from './settings'

const store: Record<string, unknown> = {}

vi.hoisted(() => {
  // The settings module talks to chrome.storage directly, so it has to exist
  // before the import is evaluated.
  ;(globalThis as { chrome?: unknown }).chrome = {}
})

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key]
  ;(globalThis as any).chrome = {
    storage: {
      local: {
        get: vi.fn(async (keys: string[]) => {
          const out: Record<string, unknown> = {}
          for (const key of keys) if (key in store) out[key] = store[key]
          return out
        }),
        set: vi.fn(async (patch: Record<string, unknown>) => {
          Object.assign(store, patch)
        }),
      },
    },
  }
})

describe('exportSettings', () => {
  it('carries only what the user actually set', async () => {
    store[BLOCKED_COUNTRIES_KEY] = ['France']
    const file = await exportSettings()

    expect(file.format).toBe(SETTINGS_FORMAT)
    expect(file.settings).toEqual({ [BLOCKED_COUNTRIES_KEY]: ['France'] })
    // Defaults stay out, so importing into a future version doesn't pin
    // today's defaults forever.
    expect(file.settings).not.toHaveProperty(PREFETCH_SHARE_KEY)
  })

  it('never carries the shared-cache client id', async () => {
    store.sharedCacheClientId = 'abc-123'
    const file = await exportSettings()
    expect(JSON.stringify(file)).not.toContain('abc-123')
    expect(SETTINGS_KEYS).not.toContain('sharedCacheClientId')
  })
})

describe('importSettings', () => {
  const wrap = (settings: Record<string, unknown>) =>
    JSON.stringify({ format: SETTINGS_FORMAT, exportedAt: '', settings })

  it('round-trips an export', async () => {
    store[BLOCKED_COUNTRIES_KEY] = ['France', 'Japan']
    store[HIGHLIGHT_KEYWORDS_KEY] = ['crypto']
    const file = await exportSettings()

    delete store[BLOCKED_COUNTRIES_KEY]
    delete store[HIGHLIGHT_KEYWORDS_KEY]

    await importSettings(JSON.stringify(file))
    expect(store[BLOCKED_COUNTRIES_KEY]).toEqual(['France', 'Japan'])
    expect(store[HIGHLIGHT_KEYWORDS_KEY]).toEqual(['crypto'])
  })

  it('merges, so a partial file leaves untouched settings alone', async () => {
    store[BLOCKED_COUNTRIES_KEY] = ['France']
    store[HIGHLIGHT_KEYWORDS_KEY] = ['crypto']

    await importSettings(wrap({ [BLOCKED_COUNTRIES_KEY]: ['Japan'] }))

    expect(store[BLOCKED_COUNTRIES_KEY]).toEqual(['Japan'])
    expect(store[HIGHLIGHT_KEYWORDS_KEY]).toEqual(['crypto'])
  })

  it('normalizes every value rather than storing what the file said', async () => {
    // A hand-edited file is untrusted input: a bad value must not reach the
    // content script, which reads these on a hot path.
    await importSettings(
      wrap({
        [BLOCKED_COUNTRIES_KEY]: ['USA', 'usa', 42, 'Czech Republic'],
        [HIDE_BLOCKED_LOCATIONS_KEY]: 'obliterate',
        [PREFETCH_SHARE_KEY]: 99,
        [ACCOUNT_AGE_KEY]: { enabled: true, days: -1 },
        [ALWAYS_SHOW_KEY]: ['@Someone', 'someone'],
        [EXTENSION_ENABLED_KEY]: 'yes',
      }),
    )

    expect(store[BLOCKED_COUNTRIES_KEY]).toEqual(['United States', 'Czechia'])
    expect(store[HIDE_BLOCKED_LOCATIONS_KEY]).toBe('collapse')
    expect(store[PREFETCH_SHARE_KEY]).toBe(0.9)
    expect(store[ACCOUNT_AGE_KEY]).toEqual({ enabled: true, days: 180 })
    expect(store[ALWAYS_SHOW_KEY]).toEqual(['someone'])
    expect(store[EXTENSION_ENABLED_KEY]).toBe(true)
  })

  it('keeps the two exception stores in agreement, whichever the file had', async () => {
    // They mirror each other; importing one without the other would let the
    // merge-on-read resurrect whatever the stale side still held.
    await importSettings(wrap({ [HIGHLIGHT_EXCEPTIONS_KEY]: ['bob'] }))
    expect(
      (store[RULE_EXCEPTIONS_KEY] as { highlight: string[] }).highlight,
    ).toEqual(['bob'])

    await importSettings(
      wrap({ [RULE_EXCEPTIONS_KEY]: { highlight: ['carol'], location: [] } }),
    )
    expect(store[HIGHLIGHT_EXCEPTIONS_KEY]).toEqual(['carol'])
  })

  it('reports keys it does not know instead of writing them', async () => {
    const result = await importSettings(
      wrap({ [BLOCKED_COUNTRIES_KEY]: ['Japan'], somethingElse: 1 }),
    )
    expect(result.applied).toEqual([BLOCKED_COUNTRIES_KEY])
    expect(result.ignored).toEqual(['somethingElse'])
    expect(store).not.toHaveProperty('somethingElse')
  })

  it('refuses a file it cannot vouch for, storing nothing', async () => {
    const cases: Array<[string, RegExp]> = [
      ['not json at all', /valid JSON/],
      ['[]', /not a settings export/],
      ['{"format":1}', /missing its "settings"/],
      ['{"settings":{}}', /no settings to import/],
      [`{"format":99,"settings":{}}`, /newer version/],
    ]
    for (const [raw, message] of cases) {
      await expect(importSettings(raw)).rejects.toThrow(SettingsImportError)
      await expect(importSettings(raw)).rejects.toThrow(message)
    }
    expect(Object.keys(store)).toEqual([])
  })
})

describe('reading a setting', () => {
  it('answers with the default when nothing is stored', () => {
    expect(defaultSetting(SHOW_LOCATION_IN_FEED_KEY)).toBe(true)
    expect(readSetting(SHOW_LOCATION_IN_FEED_KEY, {})).toBe(true)
    expect(readSetting(HIDE_BLOCKED_LOCATIONS_KEY, {})).toBe('collapse')
  })

  it('lets a stored false win, which is the whole point of a default-on switch', () => {
    expect(
      readSetting(SHOW_LOCATION_IN_FEED_KEY, {
        [SHOW_LOCATION_IN_FEED_KEY]: false,
      }),
    ).toBe(false)
  })

  // A key removed from storage arrives as an undefined newValue, and the old
  // hand-written `Boolean(newValue)` turned that into false for every one of
  // these — the opposite of what the same key means when absent on load.
  it('reads a removed key the same way it reads an absent one', () => {
    expect(settingValue(EXTENSION_ENABLED_KEY, undefined)).toBe(true)
  })

  it('cleans what it finds, so no reader has to', () => {
    expect(
      readSetting(BLOCKED_COUNTRIES_KEY, {
        [BLOCKED_COUNTRIES_KEY]: ['usa', 'USA', 7],
      }),
    ).toEqual(['United States'])
  })
})

describe('settingsFileName', () => {
  it('sorts by date and says what it is', () => {
    expect(settingsFileName(new Date('2026-08-01T10:00:00Z'))).toBe(
      'x-pat-settings-2026-08-01.json',
    )
  })
})
