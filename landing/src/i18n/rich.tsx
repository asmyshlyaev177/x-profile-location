import type { VNode } from 'preact'

/**
 * A very small inline-markup renderer for dictionary strings.
 *
 * Dictionaries are plain `.ts` holding plain strings — no JSX — because
 * `vite.config.ts` loads them at config-load time to build the sitemap and the
 * prerender list, exactly as it does `routes.ts`. But a good third of the
 * page's prose has emphasis or a link inside the sentence, and the alternative
 * to markup is splitting each of those into `…Before` / `…Accent` / `…After`
 * keys. That falls apart the moment a language moves the emphasised phrase,
 * which Japanese, Turkish and Arabic all do — the fragments would have to be
 * reassembled in an order the key names hardcode.
 *
 * So the sentence stays one string and carries four tags:
 *
 *   <b>…</b>          emphasis, in the page's "strong" colour
 *   <em>…</em>        emphasis, italic
 *   <a href="…">…</a> a link, styled as the page styles links
 *   <br>              a hard break
 *
 * Deliberately not `dangerouslySetInnerHTML`: these strings are trusted, but
 * parsing them into VNodes means the classes live here rather than being
 * duplicated into 15 dictionaries, and a malformed tag renders visibly as
 * text instead of silently restructuring the document.
 */

const TAG =
  /<(b|strong|em|br)\s*\/?>|<\/(b|strong|em)>|<a\s+href="([^"]*)">|<\/a>/

const EMPHASIS_CLASS = 'text-ink font-semibold'
const LINK_CLASS = 'text-accent underline decoration-1 underline-offset-4'

interface Frame {
  tag: 'b' | 'em' | 'a'
  href?: string
  children: (string | VNode)[]
}

/** The element a closed frame becomes. */
function element(frame: Frame): VNode {
  if (frame.tag === 'a') {
    return (
      <a href={frame.href} class={LINK_CLASS}>
        {frame.children}
      </a>
    )
  }
  if (frame.tag === 'em') return <em class="italic">{frame.children}</em>
  return <b class={EMPHASIS_CLASS}>{frame.children}</b>
}

/**
 * Turns a dictionary string into renderable children.
 *
 * Unmatched or unknown markup is left as literal text rather than throwing —
 * a typo in one locale's copy should show up as a stray angle bracket on that
 * one page, not take the whole build down.
 */
export function rich(source: string): (string | VNode)[] {
  const root: (string | VNode)[] = []
  const stack: Frame[] = []
  let rest = source

  const out = () => (stack.length ? stack[stack.length - 1]!.children : root)

  const close = (tag: Frame['tag']) => {
    const frame = stack[stack.length - 1]
    if (!frame || frame.tag !== tag) return false
    stack.pop()
    out().push(element(frame))
    return true
  }

  /** One matched tag, applied — or emitted as text when it closes nothing. */
  const apply = (m: RegExpExecArray) => {
    const [raw, open, closing, href] = m
    if (open === 'br') {
      out().push(<br />)
      return
    }
    if (open) {
      stack.push({ tag: open === 'em' ? 'em' : 'b', children: [] })
      return
    }
    if (href !== undefined) {
      stack.push({ tag: 'a', href, children: [] })
      return
    }
    const closed = closing ? close(closing === 'em' ? 'em' : 'b') : close('a')
    if (!closed) out().push(raw)
  }

  for (;;) {
    const m = TAG.exec(rest)
    if (!m) break

    if (m.index > 0) out().push(rest.slice(0, m.index))
    rest = rest.slice(m.index + m[0].length)
    apply(m)
  }

  if (rest) out().push(rest)

  // An unclosed tag: flush what it collected as plain children so the words
  // still reach the page.
  while (stack.length) {
    const frame = stack.pop()!
    out().push(...frame.children)
  }

  return root
}

/** `rich()` as a component, for the common `<P>{t.some.paragraph}</P>` case. */
export function Rich({ text }: { text: string }) {
  return <>{rich(text)}</>
}
