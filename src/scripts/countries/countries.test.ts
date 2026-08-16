import { describe, expect, it } from 'vitest'
import {
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  LOCATION_ALIASES,
  REGION_FLAGS,
  REGION_MEMBERS,
  canonicalLocation,
  expandLocations,
  includedMembers,
  regionsContaining,
} from './countries'

const ALL_FLAGS = { ...COUNTRY_FLAGS, ...REGION_FLAGS }
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

  it('skips the members the user unchecked, and only those', () => {
    const expanded = expandLocations(['South Asia'], {
      'South Asia': ['Nepal'],
    })
    expect(expanded.has('South Asia')).toBe(true)
    expect(expanded.has('India')).toBe(true)
    expect(expanded.has('Nepal')).toBe(false)
  })

  it('matches the label alone when every member is unchecked', () => {
    const expanded = expandLocations(['South Asia'], {
      'South Asia': [...REGION_MEMBERS['South Asia']],
    })
    expect([...expanded]).toEqual(['South Asia'])
  })

  it('keeps a member blocked through a region that still covers it', () => {
    const expanded = expandLocations(['East Asia', 'East Asia & Pacific'], {
      'East Asia': ['Japan'],
    })
    expect(expanded.has('Japan')).toBe(true)
  })

  it('keeps a member blocked when it is also picked by name', () => {
    const expanded = expandLocations(['South Asia', 'Nepal'], {
      'South Asia': ['Nepal'],
    })
    expect(expanded.has('Nepal')).toBe(true)
  })
})

describe('includedMembers', () => {
  it('is every member when nothing is excluded', () => {
    expect(includedMembers('South Asia')).toEqual(REGION_MEMBERS['South Asia'])
  })

  it('is empty for something that is not a region', () => {
    expect(includedMembers('France')).toEqual([])
  })

  it('compares by canonical name, not by the spelling stored', () => {
    expect(
      includedMembers('Europe', { Europe: ['Czech Republic'] }),
    ).not.toContain('Czechia')
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
