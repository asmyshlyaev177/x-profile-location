// The keyword / flag rule and the marks it paints — see "Marking the matched
// keyword" in CLAUDE.md.

import { HIGHLIGHT_FLAGS_KEY } from '../constants'
import {
  emojiKeywords,
  findKeywordMatches,
  type Keyword,
  matchesAnyKeyword,
  setKeywords,
} from '../keywords'
import { defaultSetting } from '../settings'
import {
  emojiKeywordCss,
  KEYWORD_HIGHLIGHT_NAME,
  KEYWORD_MATCH_ATTR,
} from '../styles'
import { getBioInfo } from './bio-cache'
import { isEnabled } from './enabled'
import { isExcepted } from './filters'
import { extractScreenName, SEL_HOVER_CARD } from './tweet-dom'

// Every default below comes from SETTINGS_REGISTRY, so a default lives in one
// place rather than here, in the popup and in the options page.
const DEFAULT_FLAGS = defaultSetting(HIGHLIGHT_FLAGS_KEY)

let highlightKeywords: Keyword[] = []
let highlightFlagsEnabled = DEFAULT_FLAGS.enabled
let highlightFlagsThreshold = DEFAULT_FLAGS.threshold
let highlightFlagsUniqueOnly = DEFAULT_FLAGS.uniqueOnly

/** Nothing to look for, so the callers that scan a post can stop at the door. */
export function hasHighlightRule(): boolean {
  return highlightKeywords.length > 0 || highlightFlagsEnabled
}

export function setHighlightKeywords(keywords: Keyword[]): void {
  highlightKeywords = keywords
  setKeywords(keywords)
  updateKeywordEmojiStyle()
}

export function setHighlightFlags(flags: typeof DEFAULT_FLAGS): void {
  highlightFlagsEnabled = flags.enabled
  highlightFlagsThreshold = flags.threshold
  highlightFlagsUniqueOnly = flags.uniqueOnly
}

function countFlagsInBio(bio: string): number {
  const matches = bio.match(/[\u{1F1E6}-\u{1F1FF}]{2}/gu) ?? []
  return highlightFlagsUniqueOnly ? new Set(matches).size : matches.length
}

// Whether the account matches a keyword/flag rule, ignoring the exceptions list.
// Used both for highlighting and to decide when to offer the hover-card button.
export function matchesHighlightRule(
  userName: string,
  displayName: string,
  bio: string | null | undefined,
): boolean {
  // Joined, not concatenated: a keyword may not span the gap between a handle
  // and the name beside it.
  if (matchesAnyKeyword(`${userName} ${displayName} ${bio ?? ''}`)) return true
  if (
    highlightFlagsEnabled &&
    countFlagsInBio(`${userName} ${displayName} ${bio ?? ''}`) >
      highlightFlagsThreshold
  )
    return true
  return false
}

export function shouldHighlight(
  userName: string,
  displayName: string,
  bio: string | null | undefined,
): boolean {
  if (isExcepted('highlight', userName)) return false
  return matchesHighlightRule(userName, displayName, bio)
}

// Marking the matched keyword in a hover card. Cosmetic either way.

function highlightRegistry(): typeof CSS.highlights | null {
  return typeof CSS !== 'undefined' && 'highlights' in CSS
    ? CSS.highlights
    : null
}

/** Text node by text node, so a keyword split across two is missed rather than
 *  mismarked. Our own injected text is skipped. */
export function keywordRangesIn(root: Element): Range[] {
  const ranges: Range[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.parentElement?.closest('.x-loc-hover')
        ? NodeFilter.FILTER_REJECT
        : NodeFilter.FILTER_ACCEPT
    },
  })

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue
    if (!text) continue
    for (const { start, end } of findKeywordMatches(text)) {
      const range = document.createRange()
      range.setStart(node, start)
      range.setEnd(node, end)
      ranges.push(range)
    }
  }
  return ranges
}

/** A full rescan: the registry is one global object, so nothing can be stranded. */
export async function markKeywords(): Promise<void> {
  const registry = highlightRegistry()
  const cards = Array.from(document.querySelectorAll<Element>(SEL_HOVER_CARD))
  const ranges: Range[] = []

  for (const card of cards) {
    const userName = isEnabled() ? extractScreenName(card) : null
    const info = userName ? await getBioInfo(userName) : null
    if (
      !userName ||
      !info ||
      !shouldHighlight(userName, info.displayName ?? '', info.bio)
    ) {
      card.removeAttribute(KEYWORD_MATCH_ATTR)
      continue
    }
    card.setAttribute(KEYWORD_MATCH_ATTR, '1')
    ranges.push(...keywordRangesIn(card))
  }

  if (!registry) return
  if (ranges.length === 0) registry.delete(KEYWORD_HIGHLIGHT_NAME)
  else registry.set(KEYWORD_HIGHLIGHT_NAME, new Highlight(...ranges))
}

export function clearKeywordMarks(): void {
  highlightRegistry()?.delete(KEYWORD_HIGHLIGHT_NAME)
  document
    .querySelectorAll(`[${KEYWORD_MATCH_ATTR}]`)
    .forEach((el) => el.removeAttribute(KEYWORD_MATCH_ATTR))
}

/** Its own <style>, so the static rules stay static. */
export function updateKeywordEmojiStyle(): void {
  const emoji = isEnabled() ? emojiKeywords() : []
  let style = document.getElementById('x-loc-kw-styles')
  if (emoji.length === 0) {
    style?.remove()
    return
  }
  if (!style) {
    style = document.createElement('style')
    style.id = 'x-loc-kw-styles'
    ;(document.head || document.documentElement).appendChild(style)
  }
  style.textContent = emojiKeywordCss(emoji)
}
export function __resetHighlight(): void {
  setHighlightKeywords([])
  setHighlightFlags(DEFAULT_FLAGS)
}
