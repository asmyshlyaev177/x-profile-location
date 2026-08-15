import { describe, expect, it } from 'vitest'
import {
  canonicalLocation,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  DEFAULT_PREFETCH_SHARE,
  expandLocations,
  LOCATION_ALIASES,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  PREFETCH_SHARE_CHOICES,
  REGION_FLAGS,
  REGION_MEMBERS,
  regionsContaining,
  FILTER_RULES,
  ACCOUNT_AGE_CHOICES,
  DEFAULT_ACCOUNT_AGE_DAYS,
  formatAgeChoice,
  normalizeAccountAge,
  normalizeHandle,
  normalizeHandleList,
  normalizeOptionsTab,
  normalizeRuleExceptions,
  normalizeTheme,
} from './countries'

const ALL_FLAGS: Record<string, string> = { ...COUNTRY_FLAGS, ...REGION_FLAGS }

describe('canonicalLocation', () => {
  it('folds abbreviations and alternate names onto one name', () => {
    expect(canonicalLocation('USA')).toBe('United States')
    expect(canonicalLocation('America')).toBe('United States')
    expect(canonicalLocation('UK')).toBe('United Kingdom')
    expect(canonicalLocation('Russia')).toBe('Russian Federation')
    expect(canonicalLocation('Vietnam')).toBe('Viet Nam')
    expect(canonicalLocation('South Korea')).toBe('Korea')
  })

  it('is case- and whitespace-insensitive', () => {
    expect(canonicalLocation('  usa ')).toBe('United States')
    expect(canonicalLocation('UNITED STATES')).toBe('United States')
  })

  it('folds the two spellings X could report onto the same entry', () => {
    // Both are COUNTRY_FLAGS keys in their own right, so blocking one has to
    // block the other — the picker only offers the canonical one.
    expect(canonicalLocation('Czech Republic')).toBe('Czechia')
    expect(canonicalLocation('Czechia')).toBe('Czechia')
    expect(canonicalLocation('Macedonia')).toBe('North Macedonia')
    expect(canonicalLocation('North Macedonia')).toBe('North Macedonia')
  })

  it('passes an unknown location through, trimmed', () => {
    expect(canonicalLocation(' Atlantis ')).toBe('Atlantis')
    expect(canonicalLocation('')).toBe('')
  })
})

describe('LOCATION_ALIASES', () => {
  it('is keyed by names the flag maps know', () => {
    for (const canonical of Object.keys(LOCATION_ALIASES)) {
      expect(ALL_FLAGS[canonical], canonical).toBeDefined()
    }
  })

  it('never gives one alias two meanings', () => {
    const seen = new Map<string, string>()
    const clashes: string[] = []
    for (const [canonical, aliases] of Object.entries(LOCATION_ALIASES)) {
      for (const alias of aliases) {
        const key = alias.toLowerCase()
        const owner = seen.get(key)
        if (owner) clashes.push(`${alias}: ${owner} vs ${canonical}`)
        seen.set(key, canonical)
      }
    }
    expect(clashes).toEqual([])
  })

  it('only shadows a real location when both mean the same place', () => {
    // An alias that is itself a flag key wins over its own identity mapping, so
    // aliasing e.g. "Ireland" to the UK would silently swallow a country. Same
    // flag on both sides is the guard.
    for (const [canonical, aliases] of Object.entries(LOCATION_ALIASES)) {
      for (const alias of aliases) {
        if (alias in ALL_FLAGS) {
          expect(ALL_FLAGS[alias], `${alias} → ${canonical}`).toBe(
            ALL_FLAGS[canonical],
          )
        }
      }
    }
  })
})

describe('CANONICAL_LOCATIONS', () => {
  it('offers every location exactly once, aliases folded away', () => {
    expect(CANONICAL_LOCATIONS).toContain('Czechia')
    expect(CANONICAL_LOCATIONS).not.toContain('Czech Republic')
    expect(CANONICAL_LOCATIONS).not.toContain('Macedonia')
    expect(new Set(CANONICAL_LOCATIONS).size).toBe(CANONICAL_LOCATIONS.length)
  })

  it('holds only self-canonical names, sorted', () => {
    for (const name of CANONICAL_LOCATIONS) {
      expect(canonicalLocation(name)).toBe(name)
    }
    expect(CANONICAL_LOCATIONS).toEqual(
      [...CANONICAL_LOCATIONS].sort((a, b) => a.localeCompare(b)),
    )
  })

  it('covers countries and regions alike', () => {
    expect(CANONICAL_LOCATIONS).toContain('Ivory Coast')
    expect(CANONICAL_LOCATIONS).toContain('South Asia')
  })
})

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

// ---------------------------------------------------------------------------
// Region membership
// ---------------------------------------------------------------------------
describe('REGION_MEMBERS', () => {
  it('only names locations that exist, so a typo cannot silently do nothing', () => {
    // The whole failure mode this guards: 'Cote dIvoire' or 'Vietnam' in a
    // member list looks right, matches nothing, and the region quietly filters
    // one country less than it claims to.
    const known = new Set([
      ...Object.keys(COUNTRY_FLAGS),
      ...Object.keys(REGION_FLAGS),
    ])
    const unknown: string[] = []
    for (const [region, members] of Object.entries(REGION_MEMBERS)) {
      for (const member of members) {
        if (!known.has(member)) unknown.push(`${region} → ${member}`)
      }
    }
    expect(unknown).toEqual([])
  })

  it('lists every member under its canonical name', () => {
    const notCanonical: string[] = []
    for (const [region, members] of Object.entries(REGION_MEMBERS)) {
      for (const member of members) {
        if (canonicalLocation(member) !== member) {
          notCanonical.push(`${region} → ${member}`)
        }
      }
    }
    expect(notCanonical).toEqual([])
  })

  it('covers every region the flag map offers', () => {
    for (const region of Object.keys(REGION_FLAGS)) {
      expect(REGION_MEMBERS[region]?.length ?? 0).toBeGreaterThan(0)
    }
  })

  it('never repeats a country inside one region', () => {
    for (const [region, members] of Object.entries(REGION_MEMBERS)) {
      expect(new Set(members).size, region).toBe(members.length)
    }
  })

  it('builds East Asia & Pacific as the union of the three it contains', () => {
    const umbrella = new Set(REGION_MEMBERS['East Asia & Pacific'])
    for (const region of ['East Asia', 'Southeast Asia', 'Australasia']) {
      for (const member of REGION_MEMBERS[region]) {
        expect(
          umbrella.has(member),
          `${member} missing from the umbrella`,
        ).toBe(true)
      }
    }
  })
})

describe('expandLocations', () => {
  it('turns a region into itself plus its members', () => {
    const expanded = expandLocations(['South Asia'])
    // X reports both shapes, so both have to match.
    expect(expanded.has('South Asia')).toBe(true)
    expect(expanded.has('India')).toBe(true)
    expect(expanded.has('Pakistan')).toBe(true)
    expect(expanded.has('France')).toBe(false)
  })

  it('leaves a plain country alone', () => {
    expect([...expandLocations(['France'])]).toEqual(['France'])
  })

  it('canonicalises on the way in and on the way out', () => {
    const expanded = expandLocations(['EU'])
    expect(expanded.has('Europe')).toBe(true)
    expect(expanded.has('Czechia')).toBe(true)
    // 'Czech Republic' is an alias of Czechia, not a second entry.
    expect(expanded.has('Czech Republic')).toBe(false)
  })

  it('is empty for an empty list', () => {
    expect(expandLocations([]).size).toBe(0)
  })
})

describe('regionsContaining', () => {
  it('reports every region a country is counted in', () => {
    expect(regionsContaining('Egypt')).toContain('Africa')
    expect(regionsContaining('Egypt')).toContain('North Africa')
    expect(regionsContaining('Japan')).toContain('East Asia')
    expect(regionsContaining('Japan')).toContain('East Asia & Pacific')
  })

  it('is empty for something no region claims', () => {
    expect(regionsContaining('Atlantis')).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Handles, exceptions and the allowlist
// ---------------------------------------------------------------------------
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
