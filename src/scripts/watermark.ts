// The mark in the corner of every image the extension hands out, and the only
// thing on one that isn't X's own content: a card that gets reposted still says
// where it came from.
//
// Both image paths end at a canvas — the snapshot of a live post and the drawn
// fallback card — so they share this rather than each drawing their own.
//
// Colour is the one part that can't be fixed in advance. The snapshot paints X's
// own backdrop behind the post, which is white on one theme and near-black on
// the other two.

/** The name reads as a name; the host is where to find it. */
export const WATERMARK_TEXT = 'X-Pat · x-pat.pages.dev'

const FONT = '600 12px system-ui, -apple-system, sans-serif'

/** Distance from the bottom-right corner, in CSS pixels. */
const INSET = 10

/**
 * Room a caller has to leave under its content for the mark. The drawn card's
 * padding already covers it; a snapshot is cropped to the post, so it grows.
 */
export const WATERMARK_BAND = 18

const INK_ON_LIGHT = 'rgba(15, 20, 25, 0.6)' // X's light-theme text colour
const INK_ON_DARK = 'rgba(231, 233, 234, 0.6)' // and its dark one
const INK_ON_EITHER = 'rgba(128, 138, 148, 0.85)' // legible against both

interface Rgba {
  rgb: [number, number, number]
  alpha: number
}

/**
 * A CSS colour as channels, or null for one this doesn't read. Only two forms
 * can reach it: `getComputedStyle` serializes a background colour as `rgb()` or
 * `rgba()` in every engine, and the literals in this repo are hex.
 */
function parseColor(color: string): Rgba | null {
  const value = color.trim().toLowerCase()
  return value.startsWith('#') ? parseHex(value) : parseRgb(value)
}

function parseHex(value: string): Rgba | null {
  const digits = value.slice(1)
  // #rgb and #rgba carry one digit a channel, doubled to make the byte.
  const short = digits.length === 3 || digits.length === 4
  const long = digits.length === 6 || digits.length === 8
  if ((!short && !long) || !/^[0-9a-f]+$/.test(digits)) return null

  const size = short ? 1 : 2
  const channel = (i: number) => {
    const part = digits.slice(i * size, i * size + size)
    return Number.parseInt(short ? part + part : part, 16)
  }
  const hasAlpha = digits.length === 4 || digits.length === 8
  return {
    rgb: [channel(0), channel(1), channel(2)],
    alpha: hasAlpha ? channel(3) / 255 : 1,
  }
}

function parseRgb(value: string): Rgba | null {
  if (!value.startsWith('rgb')) return null
  // Covers `rgb(0, 0, 0)` and `rgb(0 0 0 / 50%)` alike.
  const parts = value.match(/[\d.]+%?/g)
  if (!parts || parts.length < 3) return null

  const rgb = parts.slice(0, 3).map((p) => Number.parseFloat(p))
  if (rgb.some(Number.isNaN)) return null
  const raw = parts[3]
  const alpha =
    raw === undefined
      ? 1
      : Number.parseFloat(raw) / (raw.endsWith('%') ? 100 : 1)
  return {
    rgb: [rgb[0], rgb[1], rgb[2]],
    alpha: Number.isNaN(alpha) ? 1 : alpha,
  }
}

/**
 * Ink that stays readable on `background`. A colour this can't read, or one
 * see-through enough that whatever is behind it decides, gets the mid grey that
 * works on both — guessing wrong is a mark nobody can see.
 */
export function watermarkInk(background: string): string {
  const color = parseColor(background)
  if (!color || color.alpha < 0.5) return INK_ON_EITHER
  // Weighted for perception but not gamma-corrected: this only has to answer
  // light or dark, and every X theme sits at one end or the other.
  const [r, g, b] = color.rgb
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.5 ? INK_ON_LIGHT : INK_ON_DARK
}

export interface WatermarkTarget {
  /** Canvas size in CSS pixels — the mark is anchored to its bottom-right. */
  width: number
  height: number
  /** What it is being drawn onto, so the ink can stay readable on it. */
  background: string
}

/** Draw the mark into the bottom-right corner of a canvas. */
export function drawWatermark(
  ctx: CanvasRenderingContext2D,
  { width, height, background }: WatermarkTarget,
): void {
  ctx.save()
  ctx.font = FONT
  ctx.fillStyle = watermarkInk(background)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(WATERMARK_TEXT, width - INSET, height - INSET)
  ctx.restore()
}
