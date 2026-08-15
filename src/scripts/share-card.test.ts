import type { LocationData } from './cache/cache'
import { buildShareLayout, shareChips, wrapText } from './share-card'

// A predictable stand-in for canvas text measurement: every character is 10px
// wide. Real font metrics vary by machine, which would make the layout
// assertions below environment-dependent.
const measure = (s: string) => s.length * 10
const measureFont = (s: string) => measure(s)

const DATA: LocationData = {
  location: 'Japan',
  locationAccurate: true,
  source: 'Japan App Store',
}

describe('wrapText', () => {
  it('breaks on words to fit the width', () => {
    // 10px a character: 'one two' is 70, adding 'three' would be 130.
    expect(wrapText('one two three four', 100, measure)).toEqual([
      'one two',
      'three four',
    ])
    // A line exactly on the limit still fits — the break is on overflow, not
    // on reaching the width.
    expect(wrapText('abcde fghi', 100, measure)).toEqual(['abcde fghi'])
    expect(wrapText('abcde fghij', 100, measure)).toEqual(['abcde', 'fghij'])
  })

  it('keeps paragraph breaks the author put there', () => {
    expect(wrapText('first\n\nsecond', 1000, measure)).toEqual([
      'first',
      '',
      'second',
    ])
  })

  it('lets an unbreakable word overflow rather than cutting it', () => {
    // A truncated URL is worse than a wide one — it stops being checkable.
    const url = 'https://example.com/a/very/long/path/that/never/breaks'
    expect(wrapText(url, 100, measure)).toEqual([url])
  })

  it('truncates with an ellipsis past the line limit', () => {
    const long = Array.from({ length: 40 }, (_, i) => `word${i}`).join(' ')
    const lines = wrapText(long, 100, measure, 3)
    expect(lines).toHaveLength(3)
    expect(lines[2].endsWith('…')).toBe(true)
  })

  it('handles an empty post', () => {
    expect(wrapText('', 100, measure)).toEqual([''])
  })
})

describe('shareChips', () => {
  it('names the store platform alongside the account country', () => {
    expect(shareChips(DATA)).toEqual(['🇯🇵 Japan', 'App Store · 🇯🇵 Japan'])
  })

  it('tells the two mobile platforms apart', () => {
    expect(shareChips({ ...DATA, source: 'Japan Android App' })[1]).toContain(
      'Android',
    )
    expect(shareChips(DATA)[1]).toContain('App Store')
  })

  it('uses the same VPN wording as the on-page badge', () => {
    // The image and the extension must not describe the same field in two
    // different vocabularies.
    const chips = shareChips({ ...DATA, locationAccurate: false })
    expect(chips).toContain('⚠ VPN')
    // But it still must not claim a detection — the field is X declining to
    // verify a location, not X finding a proxy.
    expect(chips.join(' ')).not.toMatch(/detected|proxy|confirmed/i)
  })

  it('is empty when X said nothing, rather than inventing a chip', () => {
    expect(
      shareChips({ location: null, locationAccurate: true, source: null }),
    ).toEqual([])
  })

  it('shows a bare web source with no country', () => {
    expect(
      shareChips({ location: null, locationAccurate: true, source: 'web' }),
    ).toEqual(['Web'])
  })
})

describe('buildShareLayout', () => {
  const input = {
    userName: 'someone',
    displayName: 'Some One',
    text: 'A short post.',
    data: DATA,
  }

  it('carries the author, the handle and the post text', () => {
    const { ops } = buildShareLayout(input, { measure: measureFont })
    const texts = ops.filter((o) => o.kind === 'text').map((o) => o.text)
    expect(texts).toContain('Some One')
    expect(texts).toContain('@someone')
    expect(texts).toContain('A short post.')
  })

  it('uses none of the accusatory vocabulary', () => {
    const { ops } = buildShareLayout(
      { ...input, data: { ...DATA, locationAccurate: false } },
      { measure: measureFont },
    )
    const all = ops
      .filter((o) => o.kind === 'text')
      .map((o) => o.text)
      .join(' ')
    expect(all).not.toMatch(/evidence|exposed|caught|busted|fake/i)
  })

  it('falls back to the handle when there is no display name', () => {
    const { ops } = buildShareLayout(
      { ...input, displayName: '' },
      { measure: measureFont },
    )
    expect(ops.find((o) => o.kind === 'text')!.text).toBe('@someone')
  })

  it('grows to fit a longer post instead of clipping it', () => {
    const short = buildShareLayout(input, { measure: measureFont })
    const long = buildShareLayout(
      { ...input, text: Array.from({ length: 6 }, () => 'line').join('\n') },
      { measure: measureFont },
    )
    expect(long.height).toBeGreaterThan(short.height)
  })

  it('wraps chips to a second row rather than dropping one', () => {
    // A card that silently omitted a chip because it ran out of width would be
    // the one failure mode that actually misleads. Long names rather than a
    // long badge, so this keeps working whatever the badge wording is.
    const long = 'Averylongplacename'.repeat(3)
    const { ops, height } = buildShareLayout(
      {
        ...input,
        data: {
          location: long,
          locationAccurate: false,
          source: `${long} Android App`,
        },
      },
      { measure: measureFont },
    )
    const chipRects = ops.filter((o) => o.kind === 'rect')
    expect(chipRects).toHaveLength(3)
    // Something got pushed onto a new row, and the card grew to hold it.
    expect(new Set(chipRects.map((r) => r.y)).size).toBeGreaterThan(1)
    for (const rect of chipRects) {
      expect(rect.y + rect.height).toBeLessThanOrEqual(height)
    }
  })

  it('keeps every chip inside the card width', () => {
    const { ops, width } = buildShareLayout(input, { measure: measureFont })
    for (const op of ops) {
      if (op.kind === 'rect') expect(op.x + op.width).toBeLessThanOrEqual(width)
    }
  })
})
