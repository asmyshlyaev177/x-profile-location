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
} from './constants'

import {
  ACCOUNT_AGE_CHOICES,
  DEFAULT_ACCOUNT_AGE_DAYS,
  DEFAULT_PREFETCH_SHARE,
  FILTER_RULES,
  PREFETCH_SHARE_CHOICES,
  SETTINGS_FORMAT,
  SETTINGS_KEYS,
  SettingsImportError,
  defaultSetting,
  exportSettings,
  formatAgeChoice,
  importSettings,
  normalizeAccountAge,
  normalizeHandle,
  normalizeHandleList,
  normalizeOptionsTab,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  normalizeRuleExceptions,
  normalizeTheme,
  readSetting,
  settingValue,
  settingsFileName,
  withKeyword,
  withLocation,
  withoutKeyword,
  withoutLocation,
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

describe('the list edits both editors make', () => {
  it('stores a keyword the way the content script matches on it', () => {
    expect(withKeyword([], '  CRYPTO ')).toEqual(['crypto'])
    expect(withKeyword(['nft'], 'crypto')).toEqual(['crypto', 'nft'])
  })

  it('folds a location onto the name X reports', () => {
    expect(withLocation([], 'usa')).toEqual(['United States'])
    expect(withLocation(['Japan'], 'Czech Republic')).toEqual([
      'Japan',
      'Czechia',
    ])
  })

  // Identity is the caller's signal that there is nothing to write — a popup
  // that stored on every keystroke would wake the content script for nothing.
  it('hands back the same list when the edit changes nothing', () => {
    const keywords = ['crypto']
    expect(withKeyword(keywords, 'CRYPTO')).toBe(keywords)
    expect(withKeyword(keywords, '   ')).toBe(keywords)

    const blocked = ['United States']
    expect(withLocation(blocked, 'America')).toBe(blocked)
  })

  it('removes by the stored form, whatever form was clicked', () => {
    expect(withoutKeyword(['crypto', 'nft'], ' Crypto ')).toEqual(['nft'])
    expect(withoutLocation(['United States', 'Japan'], 'USA')).toEqual([
      'Japan',
    ])
  })
})

describe('settingsFileName', () => {
  it('sorts by date and says what it is', () => {
    expect(settingsFileName(new Date('2026-08-01T10:00:00Z'))).toBe(
      'x-pat-settings-2026-08-01.json',
    )
  })
})

// Moved here with the vocabulary they cover — countries.ts is country data now.
describe('normalizePrefetchShare', () => {
  it('defaults to 80% when nothing usable is stored', () => {
    expect(DEFAULT_PREFETCH_SHARE).toBe(0.8)
    for (const stored of [undefined, null, '', 'nonsense', NaN, {}, []]) {
      expect(normalizePrefetchShare(stored)).toBe(DEFAULT_PREFETCH_SHARE)
    }
  })

  it('keeps every offered choice as-is', () => {
    for (const choice of PREFETCH_SHARE_CHOICES) {
      expect(normalizePrefetchShare(choice)).toBe(choice)
    }
  })

  it('accepts the numeric string a <select> hands back', () => {
    expect(normalizePrefetchShare('0.3')).toBe(0.3)
  })

  it('snaps anything else to the nearest choice', () => {
    expect(normalizePrefetchShare(0.72)).toBe(0.7)
    expect(normalizePrefetchShare(0.44)).toBe(0.5)
    expect(normalizePrefetchShare(0.83)).toBe(0.8)
    // Ties go to the smaller share — leaving more room for the user's hovers.
    expect(normalizePrefetchShare(0.4)).toBe(0.3)
    expect(normalizePrefetchShare(0.75)).toBe(0.7)
  })

  it('never lets an out-of-range value take the whole window', () => {
    expect(normalizePrefetchShare(0)).toBe(0.3)
    expect(normalizePrefetchShare(-5)).toBe(0.3)
    expect(normalizePrefetchShare(1)).toBe(0.9)
    expect(normalizePrefetchShare(1000)).toBe(0.9)
  })
})

describe('normalizePrefetchPacing', () => {
  it('spreads lookups out unless instant was explicitly chosen', () => {
    expect(normalizePrefetchPacing('instant')).toBe('instant')
    for (const stored of [undefined, null, '', 'spread', 'nonsense', 0, true]) {
      expect(normalizePrefetchPacing(stored)).toBe('spread')
    }
  })
})

describe('normalizeTheme', () => {
  it('keeps an explicit choice', () => {
    expect(normalizeTheme('light')).toBe('light')
    expect(normalizeTheme('dark')).toBe('dark')
  })

  it('falls back to following the system for anything else', () => {
    // Including 'auto' and 'os', which are what an imported file written by
    // some other extension's export would plausibly carry.
    for (const stored of [undefined, null, '', 'auto', 'os', 0, true, {}]) {
      expect(normalizeTheme(stored)).toBe('system')
    }
  })
})

describe('normalizeHandle', () => {
  it('strips the @ and lowercases, so one account is one entry', () => {
    expect(normalizeHandle('@Jack')).toBe('jack')
    expect(normalizeHandle('  JACK  ')).toBe('jack')
    expect(normalizeHandle('@@jack')).toBe('jack')
  })
})

describe('normalizeHandleList', () => {
  it('drops blanks, duplicates and non-strings, keeping the original order', () => {
    expect(
      normalizeHandleList([
        '@Bob',
        'alice',
        'bob',
        '',
        '  ',
        42,
        null,
        'Carol',
      ]),
    ).toEqual(['bob', 'alice', 'carol'])
  })

  it('is empty for anything that is not a list', () => {
    for (const junk of [null, undefined, 'bob', {}, 7]) {
      expect(normalizeHandleList(junk)).toEqual([])
    }
  })
})

describe('normalizeRuleExceptions', () => {
  it('gives every rule a list, even when storage holds none', () => {
    const ex = normalizeRuleExceptions(undefined)
    for (const rule of FILTER_RULES) expect(ex[rule]).toEqual([])
  })

  it('folds the old single-purpose highlight list into the highlight rule', () => {
    const ex = normalizeRuleExceptions({ location: ['zoe'] }, ['@Bob', 'alice'])
    expect(ex.highlight).toEqual(['bob', 'alice'])
    expect(ex.location).toEqual(['zoe'])
  })

  it('does not double up a handle present in both the old and new stores', () => {
    const ex = normalizeRuleExceptions({ highlight: ['bob'] }, ['@Bob'])
    expect(ex.highlight).toEqual(['bob'])
  })

  it('ignores rules it does not know', () => {
    const ex = normalizeRuleExceptions({ nonsense: ['bob'] })
    expect(ex).not.toHaveProperty('nonsense')
  })
})

describe('normalizeAccountAge', () => {
  it('defaults to off, at six months', () => {
    expect(normalizeAccountAge(undefined)).toEqual({
      enabled: false,
      days: DEFAULT_ACCOUNT_AGE_DAYS,
    })
    expect(DEFAULT_ACCOUNT_AGE_DAYS).toBe(180)
  })

  it('keeps a stored threshold and clamps nonsense to something usable', () => {
    expect(normalizeAccountAge({ enabled: true, days: 90 }).days).toBe(90)
    expect(normalizeAccountAge({ enabled: true, days: 1095 }).days).toBe(1095)
    expect(normalizeAccountAge({ enabled: true, days: 0 }).days).toBe(180)
    expect(normalizeAccountAge({ enabled: true, days: -5 }).days).toBe(180)
    expect(normalizeAccountAge({ enabled: true, days: 99999 }).days).toBe(3650)
  })

  it('keeps a threshold the dropdown no longer offers, rather than snapping it', () => {
    // Saved before the choices changed, or hand-edited. Snapping would quietly
    // widen or narrow a filter somebody set on purpose; the options page adds
    // the odd value to the dropdown instead.
    expect(normalizeAccountAge({ enabled: true, days: 30 }).days).toBe(30)
    expect(normalizeAccountAge({ enabled: true, days: '45' }).days).toBe(45)
  })
})

describe('formatAgeChoice', () => {
  it('writes every offered threshold the way a person would say it', () => {
    expect(ACCOUNT_AGE_CHOICES.map(formatAgeChoice)).toEqual([
      '3 months',
      '6 months',
      '1 year',
      '3 years',
    ])
  })

  it('falls back to days for a short odd value', () => {
    expect(formatAgeChoice(30)).toBe('30 days')
    expect(formatAgeChoice(45)).toBe('45 days')
  })
})

describe('normalizeOptionsTab', () => {
  it('falls back to display for anything unrecognised', () => {
    expect(normalizeOptionsTab('filters')).toBe('filters')
    expect(normalizeOptionsTab('nope')).toBe('display')
    expect(normalizeOptionsTab(undefined)).toBe('display')
  })
})
