const segmenter = new Intl.Segmenter()

export function toGraphemes(text: string): string[] {
  // ASCII fast-path: each code unit is its own grapheme — skip Intl.Segmenter.
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) return _segmentUnicode(text)
  }
  return text.split('')
}

function _segmentUnicode(text: string): string[] {
  // for-of avoids the intermediate SegmentData[] that spread would create.
  const result: string[] = []
  for (const { segment } of segmenter.segment(text)) result.push(segment)
  return result
}

export function graphemeIncludes(
  haystack: string[],
  needle: string[],
): boolean {
  const nLen = needle.length
  const limit = haystack.length - nLen
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Every position `needle` starts at, as grapheme indices. Separate from
 * graphemeIncludes, which returns early and runs against every bio we see.
 */
/* jscpd:ignore-start -- the duplicated scan is the point; see above. */
export function graphemeIndicesOf(
  haystack: string[],
  needle: string[],
): number[] {
  const out: number[] = []
  const nLen = needle.length
  if (nLen === 0) return out
  const limit = haystack.length - nLen
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    out.push(i)
  }
  return out
}
/* jscpd:ignore-end */

// ---------------------------------------------------------------------------
// Keyword matching (stateful — call setKeywords whenever the set changes)
// ---------------------------------------------------------------------------

/** Whether a keyword has to stand alone, or may sit inside a longer word. */
export type MatchMode = 'word' | 'partial'

interface Compiled {
  /** Non-global, so `.test` never carries a lastIndex between calls. */
  test: RegExp
  all: RegExp
}

// Both modes compiled from one keyword list, so they can never describe
// different keywords.
let patterns: Record<MatchMode, Compiled | null> = { word: null, partial: null }
// Grapheme search, or 🇵🇸 matches inside 🇰🇵🇸🇴.
let emojiKeywordGraphemes: string[][] = []

// A match may not end mid-cluster in *either* mode: \p{M} and ZWJ are what keep
// a keyword from matching half an emoji — see the cases in keywords.test.ts.
// Word boundaries for any script, without grapheme segmentation, are the letters
// and digits on top of that, and only 'word' asks for them.
const CLUSTER_CHARS = '\\p{M}\\u200d'
const WORD_CHARS = '\\p{L}\\p{N}_'

function compile(keywords: string[], mode: MatchMode): Compiled | null {
  if (keywords.length === 0) return null
  const parts = keywords.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  const word = mode === 'word' ? WORD_CHARS : ''
  const source = `(?<![${word}\\u200d])(${parts.join('|')})(?![${word}${CLUSTER_CHARS}])`
  return { test: new RegExp(source, 'iu'), all: new RegExp(source, 'giu') }
}

export function setKeywords(keywords: string[]): void {
  const textKws: string[] = []
  emojiKeywordGraphemes = []
  for (const kw of keywords) {
    // An empty alternative matches almost everywhere, and blanks do reach here.
    if (kw.trim() === '') continue
    if ([...kw].length !== kw.length) {
      emojiKeywordGraphemes.push(toGraphemes(kw))
    } else {
      textKws.push(kw)
    }
  }
  patterns = {
    word: compile(textKws, 'word'),
    partial: compile(textKws, 'partial'),
  }
}

export function emojiKeywords(): string[] {
  return emojiKeywordGraphemes.map((graphemes) => graphemes.join(''))
}

/** Code-unit offsets, not grapheme indices. */
export interface KeywordMatch {
  start: number
  end: number
}

function emojiMatchesIn(text: string): KeywordMatch[] {
  const matches: KeywordMatch[] = []
  const graphemes = toGraphemes(text)
  // Grapheme index → code-unit offset, one longer so the last end is addressable.
  const offsets: number[] = []
  let at = 0
  for (const grapheme of graphemes) {
    offsets.push(at)
    at += grapheme.length
  }
  offsets.push(at)

  for (const needle of emojiKeywordGraphemes) {
    for (const i of graphemeIndicesOf(graphemes, needle)) {
      matches.push({ start: offsets[i], end: offsets[i + needle.length] })
    }
  }
  return matches
}

export function findKeywordMatches(
  text: string,
  mode: MatchMode = 'word',
): KeywordMatch[] {
  const matches: KeywordMatch[] = []
  const compiled = patterns[mode]

  if (compiled !== null) {
    // matchAll clones the regex, so the stored one's lastIndex is never left set.
    for (const m of text.matchAll(compiled.all)) {
      if (m.index === undefined) continue
      matches.push({ start: m.index, end: m.index + m[0].length })
    }
  }

  if (emojiKeywordGraphemes.length > 0) matches.push(...emojiMatchesIn(text))

  return matches.sort((a, b) => a.start - b.start)
}

export function matchesAnyKeyword(
  text: string,
  mode: MatchMode = 'word',
): boolean {
  if (patterns[mode]?.test.test(text)) return true
  if (emojiKeywordGraphemes.length > 0) {
    const haystack = toGraphemes(text)
    for (const needle of emojiKeywordGraphemes) {
      if (graphemeIncludes(haystack, needle)) return true
    }
  }
  return false
}
