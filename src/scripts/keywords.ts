const segmenter = new Intl.Segmenter()
// Pre-compiled once; not recreated per isWordChar call.
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

// Like graphemeIncludes but only matches at word boundaries.
// Adjacent letters/digits/underscores prevent a match; symbols like # $ . do not.
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

// Text keywords: compiled into a single regex for performance.
let keywordPattern: RegExp | null = null
// Emoji keywords (surrogate pairs — flags etc.): must use grapheme search to
// respect grapheme cluster boundaries (avoids matching 🇵🇸 inside 🇰🇵🇸🇴).
let emojiKeywordGraphemes: string[][] = []

export function setKeywords(keywords: string[]): void {
  const textKws: string[] = []
  emojiKeywordGraphemes = []
  for (const kw of keywords) {
    if ([...kw].length !== kw.length) {
      emojiKeywordGraphemes.push(toGraphemes(kw))
    } else {
      textKws.push(kw)
    }
  }
  if (textKws.length === 0) {
    keywordPattern = null
  } else {
    const parts = textKws.map((kw) => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    // Negative lookbehind/lookahead on \p{L}\p{N}_ gives correct word boundaries
    // for any script (Cyrillic, Arabic, …) without needing grapheme segmentation.
    keywordPattern = new RegExp(
      `(?<![\\p{L}\\p{N}_])(${parts.join('|')})(?![\\p{L}\\p{N}_])`,
      'iu',
    )
  }
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
