import { afterEach, describe, expect, it } from 'vitest'
import {
  emojiKeywords,
  findKeywordMatches,
  graphemeIncludes,
  graphemeIncludesWord,
  setKeywords,
  toGraphemes,
} from './keywords'

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

describe('findKeywordMatches', () => {
  afterEach(() => setKeywords([]))

  it('gives offsets that cut the keyword out of the text exactly', () => {
    // These offsets become Range boundaries, so an off-by-one paints half a
    // word — or half a flag.
    setKeywords(['nft'])
    const text = 'we love NFT, all the nft'

    const matches = findKeywordMatches(text)

    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual([
      'NFT',
      'nft',
    ])
  })

  it('finds nothing where the highlight rule would find nothing', () => {
    // The mark exists to explain the highlight; marking a word inside a longer
    // one would explain a highlight that never happened.
    setKeywords(['nft'])
    expect(findKeywordMatches('minting nfts today')).toEqual([])
  })

  it('returns nothing at all when no keywords are set', () => {
    setKeywords([])
    expect(findKeywordMatches('anything at all')).toEqual([])
  })

  it('counts an emoji keyword in code units, not characters', () => {
    // A flag is two surrogate pairs — four code units. Offsets measured in
    // characters would land mid-surrogate and split the flag in half.
    setKeywords(['🇺🇦'])
    const text = 'slava 🇺🇦 ukraini'

    const [match] = findKeywordMatches(text)

    expect(text.slice(match.start, match.end)).toBe('🇺🇦')
  })

  it('does not mark 🇵🇸 inside 🇰🇵🇸🇴, same as the rule that fires on it', () => {
    setKeywords(['🇵🇸'])
    expect(findKeywordMatches('🇰🇵🇸🇴🇵🇾')).toEqual([])
  })

  it('finds both a word and an emoji in one pass, in reading order', () => {
    setKeywords(['crypto', '🇷🇺'])
    const text = 'crypto and 🇷🇺 stuff'

    const matches = findKeywordMatches(text)

    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual([
      'crypto',
      '🇷🇺',
    ])
  })
})

describe('emojiKeywords', () => {
  afterEach(() => setKeywords([]))

  it('returns the emoji ones, in the form they were typed', () => {
    // They are stored split into graphemes; the CSS rule that marks them needs
    // the original string back to match an <img alt>.
    setKeywords(['nft', '🏳️‍🌈', 'crypto', '🇺🇦'])
    expect(emojiKeywords()).toEqual(['🏳️‍🌈', '🇺🇦'])
  })
})
