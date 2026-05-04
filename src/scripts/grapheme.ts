const segmenter = new Intl.Segmenter()

export function toGraphemes(text: string): string[] {
  return [...segmenter.segment(text)].map((s) => s.segment)
}

export function graphemeIncludes(haystack: string[], needle: string[]): boolean {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}
