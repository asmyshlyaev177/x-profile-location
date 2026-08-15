import { afterEach, describe, expect, it } from 'vitest'
import {
  emojiKeywords,
  findKeywordMatches,
  graphemeIncludes,
  matchesAnyKeyword,
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

// ---------------------------------------------------------------------------
// Keyword matching
// ---------------------------------------------------------------------------
//
// Invisible characters are named, not pasted: "☭⃠" and "☭" look alike in source.

const ZWJ = '‍' // ZERO WIDTH JOINER
const VS16 = '️' // VARIATION SELECTOR-16 (emoji presentation)
const KEYCAP = '⃣' // COMBINING ENCLOSING KEYCAP
const NO_SIGN = '⃠' // COMBINING ENCLOSING CIRCLE BACKSLASH
const ACUTE = '́' // COMBINING ACUTE ACCENT
const HAMMER_SICKLE = '☭'
const TRANS_SYMBOL = '⚧'
const WHITE_FLAG_BASE = '\u{1F3F3}'

// Hammer and sickle inside a circle-backslash: the opposite of "☭".
const ANTI_COMMUNIST = HAMMER_SICKLE + NO_SIGN
const WHITE_FLAG = WHITE_FLAG_BASE + VS16
const TRANS_FLAG = `${WHITE_FLAG}${ZWJ}${TRANS_SYMBOL}${VS16}`
const RAINBOW_FLAG = `${WHITE_FLAG}${ZWJ}\u{1F308}`

describe('setKeywords: which matcher a keyword compiles into', () => {
  afterEach(() => setKeywords([]))

  it('sends anything past the BMP to the grapheme matcher', () => {
    setKeywords(['🇺🇦', '👍🏽', TRANS_FLAG, 'nafo'])
    expect(emojiKeywords()).toEqual(['🇺🇦', '👍🏽', TRANS_FLAG])
  })

  // Emoji to a reader, but no surrogate pair for the routing test to see —
  // which is why the text pattern needs grapheme awareness of its own.
  it('leaves BMP-only symbol sequences on the text pattern', () => {
    setKeywords([HAMMER_SICKLE, ANTI_COMMUNIST, `1${VS16}${KEYCAP}`])
    expect(emojiKeywords()).toEqual([])
  })

  it('ignores a blank keyword rather than matching every account', () => {
    // An empty alternative matches between any two non-word characters — so
    // any bio with punctuation or an emoji, which is nearly all of them.
    setKeywords(['', '   '])
    expect(matchesAnyKeyword('crypto trader 🚀')).toBe(false)
    expect(matchesAnyKeyword('he/him | dad')).toBe(false)
    expect(matchesAnyKeyword('hello!')).toBe(false)
  })

  it('replaces the previous keywords rather than adding to them', () => {
    setKeywords(['nafo'])
    setKeywords(['crypto'])
    expect(matchesAnyKeyword('nafo fella')).toBe(false)
    expect(matchesAnyKeyword('crypto guy')).toBe(true)
  })
})

describe('matchesAnyKeyword: grapheme cluster boundaries', () => {
  afterEach(() => setKeywords([]))

  it('matches a symbol standing on its own', () => {
    setKeywords([HAMMER_SICKLE])
    expect(matchesAnyKeyword(`comrade ${HAMMER_SICKLE} forever`)).toBe(true)
  })

  // Regression, found live 2026-08-03: @HoppeanGhoul and @Bl00dOld display
  // "☭⃠" and were highlighted by a keyword of "☭" — the symbol they crossed out.
  it('does not match a symbol a combining mark crosses out', () => {
    setKeywords([HAMMER_SICKLE])
    expect(matchesAnyKeyword(`HoppeanJuuzou ${ANTI_COMMUNIST}`)).toBe(false)
  })

  it('does match the crossed-out symbol when that is the keyword', () => {
    setKeywords([ANTI_COMMUNIST])
    expect(matchesAnyKeyword(`HoppeanJuuzou ${ANTI_COMMUNIST}`)).toBe(true)
    expect(matchesAnyKeyword(`comrade ${HAMMER_SICKLE} forever`)).toBe(false)
  })

  // Two clusters, not one: the guard is about a mark binding to the match.
  it('matches a symbol repeated back to back', () => {
    setKeywords([HAMMER_SICKLE])
    expect(matchesAnyKeyword(HAMMER_SICKLE + HAMMER_SICKLE)).toBe(true)
  })

  it('does not match a digit wearing a keycap', () => {
    setKeywords(['1'])
    expect(matchesAnyKeyword(`pick 1${VS16}${KEYCAP} of them`)).toBe(false)
    expect(matchesAnyKeyword('pick 1 of them')).toBe(true)
  })

  it('does not match a word whose last letter carries a combining accent', () => {
    setKeywords(['cafe'])
    expect(matchesAnyKeyword(`at the cafe${ACUTE}`)).toBe(false)
    expect(matchesAnyKeyword('at the cafe')).toBe(true)
  })

  // ⚧ is one code point, so it compiles into the text pattern — and it sits
  // inside the trans flag, joined on by a ZWJ.
  it('does not match a symbol joined into an emoji sequence', () => {
    setKeywords([TRANS_SYMBOL])
    expect(matchesAnyKeyword(`name ${TRANS_FLAG} here`)).toBe(false)
    expect(matchesAnyKeyword(`name ${TRANS_SYMBOL} here`)).toBe(true)
  })

  // A mark before the match belongs to the previous cluster.
  it('matches a keyword that follows a combining mark', () => {
    setKeywords(['nafo'])
    expect(matchesAnyKeyword(`${ANTI_COMMUNIST}nafo`)).toBe(true)
  })

  it('matches a keyword that follows an emoji', () => {
    setKeywords(['nafo'])
    expect(matchesAnyKeyword(`${TRANS_FLAG}nafo`)).toBe(true)
  })

  // भारतीय ("Indian") extends भारत ("India") by a vowel sign, which is a
  // mark rather than a letter — so it used to read as a word boundary.
  it('treats a Devanagari vowel sign as part of the word', () => {
    setKeywords(['भारत'])
    expect(matchesAnyKeyword('भारतीय लोग')).toBe(false)
    expect(matchesAnyKeyword('भारत देश')).toBe(true)
  })

  // The accepted cost of the same rule. Nikkud is rare enough in X bios that
  // missing it is the cheaper error — but it is an error.
  it('does not match a Hebrew word written with nikkud', () => {
    setKeywords(['שלום'])
    expect(matchesAnyKeyword('שָׁלוֹם עולם')).toBe(false)
    expect(matchesAnyKeyword('שלום עולם')).toBe(true)
  })
})

describe('matchesAnyKeyword: word boundaries', () => {
  afterEach(() => setKeywords([]))

  it('does not match a keyword inside a longer word', () => {
    setKeywords(['trans'])
    expect(matchesAnyKeyword('transgender rights')).toBe(false)
    expect(matchesAnyKeyword('trans rights')).toBe(true)
  })

  it('matches next to ordinary punctuation', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('loves #nft trading')).toBe(true)
    expect(matchesAnyKeyword('nft. that is all')).toBe(true)
    expect(matchesAnyKeyword('minting nfts today')).toBe(false)
  })

  // A hashtag is a word with a # in front, so the boundary rules are the word's.
  it('takes a hashtag that is the keyword, and not one that merely starts with it', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('#nft')).toBe(true)
    expect(matchesAnyKeyword('#NFT')).toBe(true)
    expect(matchesAnyKeyword('#nftlover')).toBe(false)
    expect(matchesAnyKeyword('#web3nft')).toBe(false)
  })

  it('reads a digit and an underscore as part of the word, not as a boundary', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('nft_lover')).toBe(false)
    expect(matchesAnyKeyword('lover_nft')).toBe(false)
    expect(matchesAnyKeyword('nft2')).toBe(false)
    expect(matchesAnyKeyword('@nft')).toBe(true)
  })

  it('matches a keyword alone, at the start and at the end', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('nft')).toBe(true)
    expect(matchesAnyKeyword('nft is here')).toBe(true)
    expect(matchesAnyKeyword('here is nft')).toBe(true)
  })

  it('holds the boundary on both sides of a keyword containing a slash', () => {
    setKeywords(['he/him'])
    expect(matchesAnyKeyword('bio: he/him.')).toBe(true)
    expect(matchesAnyKeyword('she/him')).toBe(false)
    expect(matchesAnyKeyword('he/himself')).toBe(false)
  })

  it('is case-insensitive, in Cyrillic as well as Latin', () => {
    setKeywords(['ukraine', 'страна'])
    expect(matchesAnyKeyword('UKRAINE forever')).toBe(true)
    expect(matchesAnyKeyword('СТРАНА моя')).toBe(true)
  })

  it('does not match a Cyrillic keyword inside a longer word', () => {
    setKeywords(['крипто'])
    expect(matchesAnyKeyword('крипторынок')).toBe(false)
    expect(matchesAnyKeyword('#крипто')).toBe(true)
  })

  it('wants a multi-word keyword spaced exactly as typed', () => {
    setKeywords(['free palestine'])
    expect(matchesAnyKeyword('a free palestine now')).toBe(true)
    expect(matchesAnyKeyword('free  palestine')).toBe(false)
  })

  // Keywords are user input on their way into a regex.
  it('treats regex metacharacters in a keyword as literal', () => {
    setKeywords(['c++', 'a.b'])
    expect(matchesAnyKeyword('i code c++ daily')).toBe(true)
    expect(matchesAnyKeyword('axb')).toBe(false)
    expect(matchesAnyKeyword('a.b')).toBe(true)
  })

  // The alternation fails "nafo" on the boundary, then backtracks into the
  // longer one — so neither order loses a match.
  it('matches the longer keyword that starts with a shorter one', () => {
    setKeywords(['nafo', 'nafofella'])
    expect(matchesAnyKeyword('nafofella')).toBe(true)
    setKeywords(['nafofella', 'nafo'])
    expect(matchesAnyKeyword('nafo')).toBe(true)
  })
})

// The other half of the same keyword list: 'partial' drops the word boundaries
// and keeps every grapheme-cluster guard, because half an emoji is not a match
// in any mode. What the two modes are *for* is in constants.ts.
describe("matchesAnyKeyword: 'partial'", () => {
  afterEach(() => setKeywords([]))

  it('matches a keyword inside a longer word', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('minting nfts today', 'partial')).toBe(true)
    expect(matchesAnyKeyword('web3nft', 'partial')).toBe(true)
    expect(matchesAnyKeyword('nft_lover', 'partial')).toBe(true)
  })

  it('matches a keyword inside a longer hashtag', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('#nftlover', 'partial')).toBe(true)
    expect(matchesAnyKeyword('#NFTLover', 'partial')).toBe(true)
  })

  it('still matches everything the whole-word mode does', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('#nft', 'partial')).toBe(true)
    expect(matchesAnyKeyword('nft. that is all', 'partial')).toBe(true)
    expect(matchesAnyKeyword('minting bread', 'partial')).toBe(false)
  })

  it('is case-insensitive, in Cyrillic as well as Latin', () => {
    setKeywords(['крипто'])
    expect(matchesAnyKeyword('КРИПТОрынок', 'partial')).toBe(true)
    expect(matchesAnyKeyword('крипторынок')).toBe(false)
  })

  // The cluster guards are what stop a "partial" match from being half a
  // character rather than half a word.
  it('does not match a symbol a combining mark crosses out', () => {
    setKeywords([HAMMER_SICKLE])
    expect(matchesAnyKeyword(`X ${ANTI_COMMUNIST}`, 'partial')).toBe(false)
    expect(matchesAnyKeyword(`X ${HAMMER_SICKLE}`, 'partial')).toBe(true)
  })

  it('does not match a symbol joined into an emoji sequence', () => {
    setKeywords([TRANS_SYMBOL])
    expect(matchesAnyKeyword(`name ${TRANS_FLAG} here`, 'partial')).toBe(false)
  })

  it('does not match a word whose last letter carries a combining accent', () => {
    setKeywords(['cafe'])
    expect(matchesAnyKeyword(`at the cafe${ACUTE}`, 'partial')).toBe(false)
  })

  // The grapheme matcher never had word boundaries to drop, so the mode is inert
  // for it — an emoji that is genuinely present matches either way.
  it('leaves the emoji matcher alone', () => {
    setKeywords(['🇺🇦', '🇵🇸'])
    expect(matchesAnyKeyword('slava 🇺🇦', 'partial')).toBe(true)
    expect(matchesAnyKeyword('🇰🇵🇸🇴', 'partial')).toBe(false)
  })

  it('is the same keyword list either mode reads', () => {
    setKeywords(['nft'])
    expect(matchesAnyKeyword('nfts', 'partial')).toBe(true)
    setKeywords([])
    expect(matchesAnyKeyword('nfts', 'partial')).toBe(false)
  })
})

describe('matchesAnyKeyword: the grapheme matcher', () => {
  afterEach(() => setKeywords([]))

  it('matches a flag that is genuinely present', () => {
    setKeywords(['🇺🇦'])
    expect(matchesAnyKeyword('slava 🇺🇦')).toBe(true)
  })

  it('does not match a flag spelled across two others', () => {
    setKeywords(['🇵🇸'])
    expect(matchesAnyKeyword('🇰🇵🇸🇴')).toBe(false)
  })

  // A skin tone modifier joins the cluster the way a combining mark does.
  it('keeps a skin tone modifier out of a plain emoji keyword', () => {
    setKeywords(['👍'])
    expect(matchesAnyKeyword('nice 👍🏽 job')).toBe(false)
    expect(matchesAnyKeyword('nice 👍 job')).toBe(true)
  })

  it('does not match a toned emoji keyword against the plain one', () => {
    setKeywords(['👍🏽'])
    expect(matchesAnyKeyword('nice 👍 job')).toBe(false)
    expect(matchesAnyKeyword('nice 👍🏽 job')).toBe(true)
  })

  it('does not match a flag that is only the start of a ZWJ sequence', () => {
    setKeywords([WHITE_FLAG])
    expect(matchesAnyKeyword(`flag ${RAINBOW_FLAG} here`)).toBe(false)
    expect(matchesAnyKeyword(`flag ${WHITE_FLAG} here`)).toBe(true)
  })

  it('does not match a ZWJ sequence against its own first half', () => {
    setKeywords([RAINBOW_FLAG])
    expect(matchesAnyKeyword(`flag ${WHITE_FLAG} only`)).toBe(false)
  })

  it('tells apart two flags built on the same base', () => {
    setKeywords([TRANS_FLAG])
    expect(matchesAnyKeyword(`bio ${RAINBOW_FLAG}`)).toBe(false)
    expect(matchesAnyKeyword(`bio ${TRANS_FLAG}`)).toBe(true)
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

  it('cuts the keyword out of the longer word it sits in', () => {
    setKeywords(['nft'])
    const text = 'minting nfts today'

    const [match, ...rest] = findKeywordMatches(text, 'partial')

    expect(rest).toEqual([])
    expect(text.slice(match.start, match.end)).toBe('nft')
    expect(match.start).toBe(text.indexOf('nft'))
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

  it('does not mark a symbol a combining mark crosses out, same as the rule', () => {
    setKeywords([HAMMER_SICKLE])
    expect(findKeywordMatches(`HoppeanJuuzou ${ANTI_COMMUNIST}`)).toEqual([])
  })

  it('marks each of two symbols standing side by side', () => {
    setKeywords([HAMMER_SICKLE])
    const text = HAMMER_SICKLE + HAMMER_SICKLE

    const matches = findKeywordMatches(text)

    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual([
      HAMMER_SICKLE,
      HAMMER_SICKLE,
    ])
  })

  it('marks a symbol next to a crossed-out one without taking the mark', () => {
    // One character late and the Range paints the neighbour's circle-backslash.
    setKeywords([HAMMER_SICKLE])
    const text = `${ANTI_COMMUNIST} vs ${HAMMER_SICKLE}`

    const [match, ...rest] = findKeywordMatches(text)

    expect(rest).toEqual([])
    expect(text.slice(match.start, match.end)).toBe(HAMMER_SICKLE)
    expect(match.start).toBe(text.lastIndexOf(HAMMER_SICKLE))
  })

  it('marks the whole keyword when it is a symbol plus its mark', () => {
    setKeywords([ANTI_COMMUNIST])
    const text = `HoppeanJuuzou ${ANTI_COMMUNIST}`

    const [match] = findKeywordMatches(text)

    expect(text.slice(match.start, match.end)).toBe(ANTI_COMMUNIST)
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

  it('sorts a trailing word behind a leading emoji', () => {
    // Emoji are collected after the text pass, so the sort is what restores
    // reading order.
    setKeywords(['crypto', '🇷🇺'])
    const text = '🇷🇺 and crypto'

    const matches = findKeywordMatches(text)

    expect(matches.map((m) => text.slice(m.start, m.end))).toEqual([
      '🇷🇺',
      'crypto',
    ])
  })
})

// The hover-card mark answers "why is this highlighted?", so it may never point
// at a word the rule did not fire on — nor stay away from one it did.
describe('the rule and the mark agree', () => {
  afterEach(() => setKeywords([]))

  const cases: Array<{ name: string; keywords: string[]; text: string }> = [
    { name: 'a plain word', keywords: ['nafo'], text: 'nafo fella here' },
    { name: 'a word inside a word', keywords: ['nafo'], text: 'nafofella' },
    {
      name: 'a symbol on its own',
      keywords: [HAMMER_SICKLE],
      text: `comrade ${HAMMER_SICKLE}`,
    },
    {
      name: 'a crossed-out symbol',
      keywords: [HAMMER_SICKLE],
      text: `HoppeanJuuzou ${ANTI_COMMUNIST}`,
    },
    {
      name: 'a keycapped digit',
      keywords: ['1'],
      text: `pick 1${VS16}${KEYCAP}`,
    },
    {
      name: 'a decomposed accent',
      keywords: ['cafe'],
      text: `at the cafe${ACUTE}`,
    },
    {
      name: 'a symbol inside a ZWJ sequence',
      keywords: [TRANS_SYMBOL],
      text: `name ${TRANS_FLAG} here`,
    },
    {
      name: 'a Devanagari vowel sign',
      keywords: ['भारत'],
      text: 'भारतीय लोग',
    },
    { name: 'a flag across two others', keywords: ['🇵🇸'], text: '🇰🇵🇸🇴🇵🇾' },
    { name: 'a skin tone modifier', keywords: ['👍'], text: 'nice 👍🏽 job' },
    {
      name: 'a flag that is half a ZWJ sequence',
      keywords: [WHITE_FLAG],
      text: `flag ${RAINBOW_FLAG}`,
    },
    {
      name: 'a word and an emoji together',
      keywords: ['crypto', '🇷🇺'],
      text: 'crypto and 🇷🇺 stuff',
    },
    { name: 'no keywords at all', keywords: [], text: 'crypto trader 🚀' },
    { name: 'a blank keyword', keywords: [''], text: 'crypto trader 🚀' },
  ]

  it.each(cases)('on $name', ({ keywords, text }) => {
    setKeywords(keywords)
    for (const mode of ['word', 'partial'] as const) {
      expect(findKeywordMatches(text, mode).length > 0).toBe(
        matchesAnyKeyword(text, mode),
      )
    }
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
