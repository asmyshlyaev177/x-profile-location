import { describe, expect, it } from 'vitest'
import {
  canonicalLocation,
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  DEFAULT_OPTIONS_SECTIONS,
  DEFAULT_PREFETCH_SHARE,
  LOCATION_ALIASES,
  normalizeOptionsSections,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  PREFETCH_SHARE_CHOICES,
  REGION_FLAGS,
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

describe('normalizeOptionsSections', () => {
  it('returns the defaults when nothing is stored', () => {
    expect(normalizeOptionsSections(undefined)).toEqual(
      DEFAULT_OPTIONS_SECTIONS,
    )
    expect(normalizeOptionsSections(null)).toEqual(DEFAULT_OPTIONS_SECTIONS)
    expect(normalizeOptionsSections('nonsense')).toEqual(
      DEFAULT_OPTIONS_SECTIONS,
    )
  })

  it('keeps stored values, overriding the defaults in both directions', () => {
    expect(
      normalizeOptionsSections({ keywords: false, exceptions: true }),
    ).toEqual({
      ...DEFAULT_OPTIONS_SECTIONS,
      keywords: false,
      exceptions: true,
    })
  })

  it('drops unknown ids and coerces non-booleans', () => {
    const result = normalizeOptionsSections({
      keywords: 0,
      flags: 'yes',
      removedSection: true,
    })
    expect(result).toEqual({
      ...DEFAULT_OPTIONS_SECTIONS,
      keywords: false,
      flags: true,
    })
    expect('removedSection' in result).toBe(false)
  })

  it('does not mutate the shared defaults', () => {
    const before = { ...DEFAULT_OPTIONS_SECTIONS }
    normalizeOptionsSections({ keywords: false, flags: true, blocked: false })
    expect(DEFAULT_OPTIONS_SECTIONS).toEqual(before)
  })
})

describe('normalizePrefetchShare', () => {
  it('defaults to 70% when nothing usable is stored', () => {
    expect(DEFAULT_PREFETCH_SHARE).toBe(0.7)
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
    // Ties go to the smaller share — leaving more room for the user's hovers.
    expect(normalizePrefetchShare(0.4)).toBe(0.3)
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
