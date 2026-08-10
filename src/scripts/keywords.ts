const segmenter = new Intl.Segmenter()
const wordCharRe = /^[\p{L}\p{N}_]$/u

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

function isWordChar(g: string): boolean {
  // ASCII fast-path: a-z A-Z 0-9 _  (covers keywords like "nft", "crypto").
  const c = g.charCodeAt(0)
  if (g.length === 1 && c < 128) {
    return (
      (c >= 97 && c <= 122) ||
      (c >= 65 && c <= 90) ||
      (c >= 48 && c <= 57) ||
      c === 95
    )
  }
  return wordCharRe.test(g)
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

// Adjacent letters/digits/underscores prevent a match; symbols like # $ . don't.
// One loop on purpose — a helper would be an object per candidate on a hot path.
// oxlint-disable-next-line sonarjs/cognitive-complexity
export function graphemeIncludesWord(
  haystack: string[],
  needle: string[],
): boolean {
  if (needle.length === 0) return true
  const nLen = needle.length
  const hLen = haystack.length
  const limit = hLen - nLen
  const needleStartIsWord = isWordChar(needle[0])
  const needleEndIsWord = isWordChar(needle[nLen - 1])
  outer: for (let i = 0; i <= limit; i++) {
    for (let j = 0; j < nLen; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    if (needleStartIsWord && i > 0 && isWordChar(haystack[i - 1])) continue
    if (needleEndIsWord && i + nLen < hLen && isWordChar(haystack[i + nLen]))
      continue
    return true
  }
  return false
}

// ---------------------------------------------------------------------------
// Keyword matching (stateful — call setKeywords whenever the set changes)
// ---------------------------------------------------------------------------

let keywordPattern: RegExp | null = null
// Compiled alongside the above, so the two can never describe different keywords.
let keywordPatternGlobal: RegExp | null = null
// Grapheme search, or 🇵🇸 matches inside 🇰🇵🇸🇴.
let emojiKeywordGraphemes: string[][] = []

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
  if (textKws.length === 0) {
    keywordPattern = null
    keywordPatternGlobal = null
  } else {
    const parts = textKws.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Word boundaries for any script, without grapheme segmentation. \p{M} and
    // ZWJ keep a match from ending mid-cluster — see the cases in keywords.test.ts.
    const source = `(?<![\\p{L}\\p{N}_\\u200d])(${parts.join('|')})(?![\\p{L}\\p{N}_\\p{M}\\u200d])`
    keywordPattern = new RegExp(source, 'iu')
    keywordPatternGlobal = new RegExp(source, 'giu')
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

export function findKeywordMatches(text: string): KeywordMatch[] {
  const matches: KeywordMatch[] = []

  if (keywordPatternGlobal !== null) {
    // matchAll clones the regex, so the stored one's lastIndex is never left set.
    for (const m of text.matchAll(keywordPatternGlobal)) {
      if (m.index === undefined) continue
      matches.push({ start: m.index, end: m.index + m[0].length })
    }
  }

  if (emojiKeywordGraphemes.length > 0) matches.push(...emojiMatchesIn(text))

  return matches.sort((a, b) => a.start - b.start)
}

export function matchesAnyKeyword(text: string): boolean {
  if (keywordPattern !== null && keywordPattern.test(text)) return true
  if (emojiKeywordGraphemes.length > 0) {
    const haystack = toGraphemes(text)
    for (const needle of emojiKeywordGraphemes) {
      if (graphemeIncludes(haystack, needle)) return true
    }
  }
  return false
}
