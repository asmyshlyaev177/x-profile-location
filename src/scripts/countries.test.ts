import { describe, expect, it } from 'vitest'
import {
  DEFAULT_OPTIONS_SECTIONS,
  DEFAULT_PREFETCH_SHARE,
  normalizeOptionsSections,
  normalizePrefetchPacing,
  normalizePrefetchShare,
  PREFETCH_SHARE_CHOICES,
} from './countries'

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
