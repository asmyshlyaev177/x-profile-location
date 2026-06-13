import { describe, expect, it } from 'vitest'
import { graphemeIncludes, graphemeIncludesWord, toGraphemes } from './keywords'

describe('graphemeIncludes', () => {
  it('finds a plain text substring', () => {
    expect(
      graphemeIncludes(toGraphemes('hello world'), toGraphemes('world')),
    ).toBe(true)
  })

  it('returns false for absent plain text', () => {
    expect(graphemeIncludes(toGraphemes('hello'), toGraphemes('xyz'))).toBe(
      false,
    )
  })

  it('matches a flag that is genuinely present', () => {
    expect(graphemeIncludes(toGraphemes('🇺🇦 slava'), toGraphemes('🇺🇦'))).toBe(
      true,
    )
  })

  // Regression: 🇰🇵🇸🇴 contains the Regional Indicator code points P and S
  // adjacent across flag boundaries. A naive string.includes('🇵🇸') would
  // match here because it doesn't respect grapheme cluster boundaries.
  it('does not match 🇵🇸 inside 🇰🇵🇸🇴 (cross-flag boundary false positive)', () => {
    const bio = toGraphemes('🇰🇵🇸🇴🇵🇾☠')
    expect(graphemeIncludes(bio, toGraphemes('🇵🇸'))).toBe(false)
  })

  it('correctly matches each individual flag in 🇰🇵🇸🇴🇵🇾', () => {
    const bio = toGraphemes('🇰🇵🇸🇴🇵🇾☠')
    expect(graphemeIncludes(bio, toGraphemes('🇰🇵'))).toBe(true)
    expect(graphemeIncludes(bio, toGraphemes('🇸🇴'))).toBe(true)
    expect(graphemeIncludes(bio, toGraphemes('🇵🇾'))).toBe(true)
  })

  it('returns true for an empty needle', () => {
    expect(graphemeIncludes(toGraphemes('anything'), [])).toBe(true)
  })
})

describe('graphemeIncludesWord', () => {
  it('matches keyword as a whole word', () => {
    expect(
      graphemeIncludesWord(toGraphemes('i love nft art'), toGraphemes('nft')),
    ).toBe(true)
  })

  it('does not match keyword inside a longer word', () => {
    expect(
      graphemeIncludesWord(toGraphemes('nftart'), toGraphemes('nft')),
    ).toBe(false)
    expect(graphemeIncludesWord(toGraphemes('mynft'), toGraphemes('nft'))).toBe(
      false,
    )
    expect(
      graphemeIncludesWord(toGraphemes('mynftart'), toGraphemes('nft')),
    ).toBe(false)
  })

  it('matches keyword adjacent to symbols like # and $', () => {
    expect(graphemeIncludesWord(toGraphemes('#nft'), toGraphemes('nft'))).toBe(
      true,
    )
    expect(graphemeIncludesWord(toGraphemes('$nft'), toGraphemes('nft'))).toBe(
      true,
    )
    expect(graphemeIncludesWord(toGraphemes('nft!'), toGraphemes('nft'))).toBe(
      true,
    )
    expect(
      graphemeIncludesWord(
        toGraphemes('loves #nft trading'),
        toGraphemes('nft'),
      ),
    ).toBe(true)
  })

  it('matches keyword at start and end of string', () => {
    expect(graphemeIncludesWord(toGraphemes('nft'), toGraphemes('nft'))).toBe(
      true,
    )
    expect(
      graphemeIncludesWord(toGraphemes('nft trader'), toGraphemes('nft')),
    ).toBe(true)
    expect(
      graphemeIncludesWord(toGraphemes('love nft'), toGraphemes('nft')),
    ).toBe(true)
  })

  it('does not match keyword when preceded by a digit', () => {
    expect(graphemeIncludesWord(toGraphemes('1nft'), toGraphemes('nft'))).toBe(
      false,
    )
  })

  it('returns true for an empty needle', () => {
    expect(graphemeIncludesWord(toGraphemes('anything'), [])).toBe(true)
  })

  it('matches non-Latin keyword as a whole word (Cyrillic)', () => {
    expect(
      graphemeIncludesWord(toGraphemes('люблю крипто'), toGraphemes('крипто')),
    ).toBe(true)
    expect(
      graphemeIncludesWord(toGraphemes('крипто'), toGraphemes('крипто')),
    ).toBe(true)
  })

  it('does not match non-Latin keyword inside a longer word (Cyrillic)', () => {
    // крипторынок = "crypto market" — "крипто" is a prefix, not a standalone word
    expect(
      graphemeIncludesWord(toGraphemes('крипторынок'), toGraphemes('крипто')),
    ).toBe(false)
    expect(
      graphemeIncludesWord(toGraphemes('некрипто'), toGraphemes('крипто')),
    ).toBe(false)
  })

  it('matches non-Latin keyword adjacent to symbols (Cyrillic)', () => {
    expect(
      graphemeIncludesWord(toGraphemes('#крипто'), toGraphemes('крипто')),
    ).toBe(true)
    expect(
      graphemeIncludesWord(toGraphemes('крипто!'), toGraphemes('крипто')),
    ).toBe(true)
  })
})
