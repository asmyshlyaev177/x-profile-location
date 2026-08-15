// The card states what X returned and stops: no claim of evidence, no drafted
// reply. Layout is computed apart from the drawing, which happy-dom cannot run.

import type { LocationData } from './cache/cache'
import { canonicalLocation, flagFor } from './countries/countries'
import { classifySource, platformLabel } from './source'
import { t } from './i18n'
import { localizedLocation } from './countries/location-names'
import { drawWatermark } from './watermark'

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
 * Break text to a pixel width. `measure` is injected so wrapping can be tested
 * against a predictable width rather than whatever font is installed. A word
 * longer than the line overflows on its own line instead of being cut — a
 * truncated link is worse than a wide one.
 */
function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measure: (s: string) => number,
): string[] {
  const lines: string[] = []
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
  return lines
}

export function wrapText(
  text: string,
  maxWidth: number,
  measure: (s: string) => number,
  maxLines = MAX_BODY_LINES,
): string[] {
  const lines: string[] = []
  for (const paragraph of text.split('\n')) {
    if (paragraph.trim() === '') lines.push('')
    else lines.push(...wrapParagraph(paragraph, maxWidth, measure))
  }

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1]}…`
    return kept
  }
  return lines
}

/** The flag and the country, the country in the reader's language. */
function locationChip(location: string): string {
  const key = canonicalLocation(location)
  return `${flagFor(key)} ${localizedLocation(key)}`
}

/**
 * The chips the card carries: what X said, in X's words. The VPN chip reads
 * exactly as the on-page badge does, so the image and the extension don't
 * describe one field in two vocabularies. Neither claims *detection*:
 * `location_accurate: false` is X declining to verify, not a finding.
 */
export function shareChips(data: LocationData): string[] {
  const chips: string[] = []
  const { platform, country } = classifySource(data.source)

  if (data.location) {
    chips.push(locationChip(data.location))
  }
  if (country) {
    chips.push(`${platformLabel(platform)} · ${locationChip(country)}`)
  } else if (platform === 'web') {
    chips.push(t('platformWeb'))
  }
  if (data.locationAccurate === false) {
    chips.push(t('vpnBadge'))
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

  // A hover card shares an *account*, so no post text is legitimate. Skipping
  // the block rather than wrapping '' avoids a blank line where a post would be.
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
    const row = chipOps(chips, y, (text) => measure(text, CHIP_FONT))
    ops.push(...row.ops)
    y = row.bottom
  }

  return { width: WIDTH, height: y + PAD, ops }
}

const CHIP_HEIGHT = 44

/**
 * The chip row, starting at `top`. Chips wrap rather than shrinking or being
 * dropped: silently omitting the VPN caveat for want of width is the one
 * failure mode that actually misleads.
 */
function chipOps(
  chips: string[],
  top: number,
  measure: (text: string) => number,
): { ops: DrawOp[]; bottom: number } {
  const ops: DrawOp[] = []
  let x = PAD
  let y = top
  for (const chip of chips) {
    const width = measure(chip) + 32
    if (x > PAD && x + width > WIDTH - PAD) {
      x = PAD
      y += CHIP_HEIGHT + 12
    }
    // Compared against the message rather than sniffed for a leading '⚠': a
    // translator who drops the emoji must not silently lose the amber tint that
    // is the whole reason the caveat is on the card.
    const warn = chip === t('vpnBadge')
    ops.push({
      kind: 'rect',
      x,
      y,
      width,
      height: CHIP_HEIGHT,
      radius: 22,
      fill: warn ? 'rgba(244,165,42,0.16)' : 'rgba(29,155,240,0.16)',
    })
    ops.push({
      kind: 'text',
      text: chip,
      x: x + 16,
      y: y + 29,
      font: CHIP_FONT,
      color: warn ? WARN : ACCENT,
    })
    x += width + 12
  }
  return { ops, bottom: y + CHIP_HEIGHT }
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
  // 2x for legibility at full size, applied once rather than per coordinate.
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

  // No room reserved for it: the layout already ends on a PAD of empty card,
  // which is more than WATERMARK_BAND.
  drawWatermark(ctx, {
    width: layout.width,
    height: layout.height,
    background: BG,
  })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('Could not encode the image.'))
    }, 'image/png')
  })
}

/**
 * Put the card on the clipboard, falling back to a download — image writes need a
 * live user gesture and aren't available everywhere. The return value says which
 * happened, so the toast can be honest about where the image went.
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
