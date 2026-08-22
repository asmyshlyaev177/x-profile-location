// X's own markup and the readers over it. A data-testid X renames breaks this
// file and nothing else.

export const SEL_HOVER_CARD = '[data-testid="HoverCard"]'
export const SEL_USER_NAME = '[data-testid="UserName"] a[href]'
export const SEL_USER_NAME_ALT = '[data-testid="User-Name"] a[href]'
export const SEL_TWEET = 'article[data-testid="tweet"]'
export const SEL_PRIMARY_TWEET = `${SEL_TWEET}[tabindex="-1"]`
// Followers / Following / search-people rows.
export const SEL_USER_CELL = '[data-testid="UserCell"]'

const RE_SCREEN_NAME_HREF = /^\/([A-Za-z0-9_]{1,50})$/
const RE_AT_MENTION = /^@[A-Za-z0-9_]{1,50}$/

/** A profile link's handle; `null` for every other href X puts in a post. */
export function screenNameFromHref(
  href: string | null | undefined,
): string | null {
  return (href ?? '').match(RE_SCREEN_NAME_HREF)?.[1] ?? null
}

export function getNameEl(el: Element): Element | null {
  return (
    el.querySelector('[data-testid="User-Name"]') ??
    el.querySelector('[data-testid="UserName"]')
  )
}

// X renders a quote as a role="link" container holding its own User-Name block.
export function getQuotedTweetEl(article: Element): Element | null {
  for (const link of Array.from(
    article.querySelectorAll<Element>('div[role="link"]'),
  )) {
    if (getNameEl(link)) return link
  }
  return null
}

// textContent drops emoji: X renders them as <img alt="🏳️‍⚧️">. Walk the node
// and substitute each emoji <img> with its alt so keyword matching sees them.
export function textWithEmoji(
  el: Element,
  skip?: (child: Element) => boolean,
): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.nodeValue ?? ''
    } else if (node instanceof HTMLImageElement) {
      out += node.getAttribute('alt') ?? ''
    } else if (node instanceof Element && !skip?.(node)) {
      out += textWithEmoji(node, skip)
    }
  }
  return out
}

export interface TweetUser {
  userName: string | null
  displayName: string
}

export function extractTweetUserInfo(article: Element): TweetUser {
  const userNameEl = getNameEl(article)
  if (!userNameEl) return { userName: null, displayName: '' }
  let userName: string | null = null
  let displayName = ''
  for (const link of Array.from(
    userNameEl.querySelectorAll<HTMLAnchorElement>('a[href]'),
  )) {
    const handle = screenNameFromHref(link.getAttribute('href'))
    if (!handle) continue
    if (!userName) userName = handle
    const text = textWithEmoji(link).trim()
    if (text && !text.startsWith('@') && !displayName) displayName = text
  }
  return { userName, displayName }
}

// A quote's author is plain text, not links, so the extractor above finds
// nothing. The name block reads "<displayName>@<handle> · <time>".
export function extractQuotedTweetUserInfo(quote: Element): TweetUser {
  const userNameEl = getNameEl(quote)
  if (!userNameEl) return { userName: null, displayName: '' }
  const full = textWithEmoji(userNameEl).trim()
  // The handle is the last @-token (a display name may itself contain '@').
  const handles = [...full.matchAll(/@([A-Za-z0-9_]{1,50})/g)]
  const userName = handles.length ? handles[handles.length - 1][1] : null
  const at = userName
    ? full.toLowerCase().lastIndexOf(`@${userName.toLowerCase()}`)
    : -1
  const displayName = (at > 0 ? full.slice(0, at) : full).trim()
  return { userName, displayName }
}

export function extractScreenName(card: Element): string | null {
  const nameEl =
    card.querySelector(SEL_USER_NAME) ?? card.querySelector(SEL_USER_NAME_ALT)
  const fromHref = nameEl && screenNameFromHref(nameEl.getAttribute('href'))
  if (fromHref) return fromHref

  // Fallback: find a span with @username text
  for (const span of Array.from(card.querySelectorAll('span'))) {
    const text = span.textContent?.trim() ?? ''
    if (RE_AT_MENTION.test(text)) return text.slice(1)
  }

  return null
}

export function userCellName(cell: Element): string | null {
  for (const link of Array.from(
    cell.querySelectorAll<HTMLAnchorElement>('a[href]'),
  )) {
    const handle = screenNameFromHref(link.getAttribute('href'))
    if (handle) return handle
  }
  return null
}

/** The post's own text, with emoji restored from their <img alt>. */
export function tweetText(article: Element): string {
  const el = article.querySelector('[data-testid="tweetText"]')
  return el ? textWithEmoji(el).trim() : ''
}
