// Render a post and the flags we show for it into a PNG, locally.
//
// Framing first, because it is most of the feature: this shares *a post with
// its location flags*. It is not evidence, nobody is exposed, nothing is
// caught, and there is no button that drafts a reply for you. The card states
// what X returned and stops — the reader decides what it means. Every string in
// this file is chosen on that basis, and the same rule applies to anything
// added later.
//
// Local, too: the image is drawn in the page and written to the clipboard. No
// upload, no image service, nothing leaves the browser — which is what makes it
// safe to share a card about an account without telling anyone you looked.
//
// The layout is computed separately from the drawing so it can be tested. A
// 2D canvas context doesn't exist under happy-dom, so anything that only lives
// inside a draw call is untestable by construction; keeping the arithmetic in
// buildShareLayout means the part with the bugs in it is the part under test.

import type { LocationData } from './cache'
import { canonicalLocation, COUNTRY_FLAGS, REGION_FLAGS } from './countries'
import { classifySource, platformLabel } from './source'

export interface ShareInput {
  userName: string
  displayName: string
  text: string
  data: LocationData
}

export interface TextOp {
  kind: 'text'
  text: string
  x: number
  y: number
  font: string
  color: string
}

export interface RectOp {
  kind: 'rect'
  x: number
  y: number
  width: number
  height: number
  radius: number
  fill: string
}

export type DrawOp = TextOp | RectOp

export interface ShareLayout {
  width: number
  height: number
  ops: DrawOp[]
}

const WIDTH = 900
const PAD = 48
const BG = '#15181c'
const FG = '#e7e9ea'
const MUTED = '#8b98a5'
const ACCENT = '#1d9bf0'
const WARN = '#f4a52a'

const NAME_FONT = '700 30px system-ui, -apple-system, sans-serif'
const HANDLE_FONT = '400 24px system-ui, -apple-system, sans-serif'
const BODY_FONT = '400 28px system-ui, -apple-system, sans-serif'
const CHIP_FONT = '600 22px system-ui, -apple-system, sans-serif'

const BODY_LINE_HEIGHT = 40
const MAX_BODY_LINES = 12

/**
 * Break text to a pixel width.
 *
 * `measure` is injected rather than reaching for a canvas, so the wrapping can
 * be tested against a predictable width function instead of whatever font
 * happens to be installed. A word longer than the line (a URL, an unbroken
 * string of emoji) is placed on its own line and allowed to overflow rather
 * than being cut mid-character: a truncated link is worse than a wide one.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = MAX_BODY_LINES,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word
      if (line && measure(candidate) > maxWidth) {
        lines.push(line)
        line = word
      } else {
        line = candidate
      }
    }
    if (line) lines.push(line)
  }

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`
    return kept
  }
  return lines
}

/** The flag or region marker for a location name. */
function flagFor(location: string): string {
  const key = canonicalLocation(location)
  return COUNTRY_FLAGS[key] ?? REGION_FLAGS[key] ?? '🌐'
}

/**
 * The chips the card carries: what X said, in X's words.
 *
 * The VPN chip reads exactly as the on-page badge does — "⚠ VPN". Anything else
 * would mean the image and the extension describing the same field in two
 * different vocabularies, which is its own kind of misleading. What stays out
 * either way is any claim of *detection*: `location_accurate: false` is X
 * declining to verify a location, which can be a VPN and can equally be X being
 * unsure, and the badge must not upgrade that into a finding.
 */
export function shareChips(data: LocationData): string[] {
  const chips: string[] = []
  const { platform, country } = classifySource(data.source)

  if (data.location) {
    chips.push(`${flagFor(data.location)} ${data.location}`)
  }
  if (country) {
    chips.push(`${platformLabel(platform)} · ${flagFor(country)} ${country}`)
  } else if (platform === 'web') {
    chips.push('Web')
  }
  if (data.locationAccurate === false) {
    chips.push('⚠ VPN')
  }
  return chips
}

export interface LayoutOptions {
  /** Text width measurement, injected for the same reason as in wrapText. */
  measure: (text: string, font: string) => number
}

export function buildShareLayout(
  input: ShareInput,
  { measure }: LayoutOptions,
): ShareLayout {
  const ops: DrawOp[] = []
  const contentWidth = WIDTH - PAD * 2
  let y = PAD

  ops.push({
    kind: 'text',
    text: input.displayName || `@${input.userName}`,
    x: PAD,
    y: y + 30,
    font: NAME_FONT,
    color: FG,
  })
  y += 40

  ops.push({
    kind: 'text',
    text: `@${input.userName}`,
    x: PAD,
    y: y + 24,
    font: HANDLE_FONT,
    color: MUTED,
  })
  y += 52

  // No post text is a legitimate case, not an empty one: the hover card shares
  // an *account*, so its card is the name, the handle and the chips. Skipping
  // the block entirely (rather than wrapping '') keeps the card from carrying a
  // blank line where a post would be.
  const lines = input.text.trim()
    ? wrapText(input.text, contentWidth, (s) => measure(s, BODY_FONT))
    : []
  for (const line of lines) {
    ops.push({
      kind: 'text',
      text: line,
      x: PAD,
      y: y + 28,
      font: BODY_FONT,
      color: FG,
    })
    y += BODY_LINE_HEIGHT
  }

  const chips = shareChips(input.data)
  if (chips.length > 0) {
    y += 24
    // Chips wrap to a second row rather than shrinking or being dropped: a card
    // that silently omits the VPN caveat because it ran out of width would be
    // the one failure mode that actually misleads.
    let x = PAD
    const chipHeight = 44
    for (const chip of chips) {
      const width = measure(chip, CHIP_FONT) + 32
      if (x > PAD && x + width > WIDTH - PAD) {
        x = PAD
        y += chipHeight + 12
      }
      ops.push({
        kind: 'rect',
        x,
        y,
        width,
        height: chipHeight,
        radius: 22,
        fill: chip.startsWith('⚠')
          ? 'rgba(244,165,42,0.16)'
          : 'rgba(29,155,240,0.16)',
      })
      ops.push({
        kind: 'text',
        text: chip,
        x: x + 16,
        y: y + 29,
        font: CHIP_FONT,
        color: chip.startsWith('⚠') ? WARN : ACCENT,
      })
      x += width + 12
    }
    y += chipHeight
  }

  return { width: WIDTH, height: y + PAD, ops }
}

/** Paint a layout onto a canvas and hand back a PNG. */
export async function renderShareCard(input: ShareInput): Promise<Blob> {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable in this browser.')

  const measure = (text: string, font: string) => {
    ctx.font = font
    return ctx.measureText(text).width
  }

  const layout = buildShareLayout(input, { measure })
  // Drawn at 2x so the card is legible when someone views it full-size; the
  // scale is applied once here rather than being baked into every coordinate.
  const scale = 2
  canvas.width = layout.width * scale
  canvas.height = layout.height * scale
  ctx.scale(scale, scale)

  ctx.fillStyle = BG
  ctx.fillRect(0, 0, layout.width, layout.height)

  for (const op of layout.ops) {
    if (op.kind === 'rect') {
      ctx.fillStyle = op.fill
      ctx.beginPath()
      ctx.roundRect(op.x, op.y, op.width, op.height, op.radius)
      ctx.fill()
    } else {
      ctx.font = op.font
      ctx.fillStyle = op.color
      ctx.fillText(op.text, op.x, op.y)
    }
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the image.'))
    }, 'image/png')
  })
}

/**
 * Put the card on the clipboard, falling back to a download.
 *
 * Clipboard image writes need a live user gesture and are not available
 * everywhere; a download always works, and the user ends up with the same file
 * either way. The return value says which happened, so the toast can be honest
 * about where the image went.
 */
export async function deliverShareCard(
  blob: Blob,
  fileName: string,
): Promise<'clipboard' | 'download'> {
  try {
    const item = new ClipboardItem({ 'image/png': blob })
    await navigator.clipboard.write([item])
    return 'clipboard'
  } catch {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    URL.revokeObjectURL(url)
    return 'download'
  }
}
