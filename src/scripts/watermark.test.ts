import { WATERMARK_TEXT, watermarkInk } from './watermark'

// drawWatermark itself needs a 2D context, which happy-dom has none of. What
// can break silently is the colour: an ink that matches the backdrop leaves the
// mark invisible, and nothing about the image says so.

/** How light the returned ink is, 0–1. */
function brightness(ink: string): number {
  const [r, g, b] = ink.match(/[\d.]+/g)!.map(Number)
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

describe('watermarkInk', () => {
  // The snapshot paints X's own backdrop behind the post, so the mark meets
  // whichever theme the user is reading in.
  it('goes dark on the light theme', () => {
    for (const bg of ['rgb(255, 255, 255)', '#fff', '#ffffff']) {
      expect(brightness(watermarkInk(bg))).toBeLessThan(0.2)
    }
  })

  it('goes light on the dim and lights-out themes', () => {
    for (const bg of ['rgb(0, 0, 0)', 'rgb(21, 32, 43)', '#15181c']) {
      expect(brightness(watermarkInk(bg))).toBeGreaterThan(0.8)
    }
  })

  it('reads the modern rgb() syntax as well as the comma form', () => {
    expect(watermarkInk('rgb(255 255 255)')).toBe(watermarkInk('#fff'))
    expect(watermarkInk('rgb(0 0 0 / 100%)')).toBe(watermarkInk('#000'))
  })

  it('falls back to an ink that reads on either when nothing decides it', () => {
    // A see-through backdrop leaves whatever is behind the image in charge, and
    // an unparsed colour tells us nothing. Guessing wrong here is a mark that
    // cannot be seen at all, so neither guesses.
    for (const bg of ['rgba(0, 0, 0, 0)', '#0000', 'transparent', 'wat']) {
      const mid = brightness(watermarkInk(bg))
      expect(mid).toBeGreaterThan(0.3)
      expect(mid).toBeLessThan(0.7)
    }
  })
})

describe('WATERMARK_TEXT', () => {
  it('points at the site rather than only naming the extension', () => {
    expect(WATERMARK_TEXT).toContain('x-pat.pages.dev')
  })
})
