import { buildSourceGlyph, classifySource, platformLabel } from './source'

describe('classifySource', () => {
  it('splits the two mobile stores rather than collapsing them', () => {
    expect(classifySource('Japan App Store')).toEqual({
      platform: 'ios',
      country: 'Japan',
      raw: 'Japan App Store',
    })
    expect(classifySource('Japan Android App')).toEqual({
      platform: 'android',
      country: 'Japan',
      raw: 'Japan Android App',
    })
  })

  it('handles multi-word countries', () => {
    expect(classifySource('United Arab Emirates App Store').country).toBe(
      'United Arab Emirates',
    )
    expect(classifySource('South Africa Android App').country).toBe(
      'South Africa',
    )
  })

  it('reads web as a platform with no country', () => {
    expect(classifySource('web')).toEqual({
      platform: 'web',
      country: null,
      raw: 'web',
    })
  })

  it('is unknown for nothing, and keeps the raw string for anything new', () => {
    expect(classifySource(null).platform).toBe('unknown')
    expect(classifySource(undefined).platform).toBe('unknown')
    expect(classifySource('   ').platform).toBe('unknown')
    // X shipping a value we have never seen must degrade to "no glyph", not to
    // a wrong glyph or a crash.
    expect(classifySource('Some Future Client')).toEqual({
      platform: 'unknown',
      country: null,
      raw: 'Some Future Client',
    })
  })

  it('is case-insensitive, since the suffix is X’s wording and not a contract', () => {
    expect(classifySource('japan app store').platform).toBe('ios')
    expect(classifySource('Japan ANDROID APP').platform).toBe('android')
    expect(classifySource('WEB').platform).toBe('web')
  })

  it('yields no country for a bare store name', () => {
    expect(classifySource('App Store')).toEqual({
      platform: 'ios',
      country: null,
      raw: 'App Store',
    })
  })
})

describe('glyphs', () => {
  it('draws a distinct mark per platform, inheriting the page text colour', () => {
    for (const platform of ['ios', 'android'] as const) {
      const svg = buildSourceGlyph(platform)!
      expect(svg.tagName.toLowerCase()).toBe('svg')
      expect(svg.querySelector('path')?.getAttribute('fill')).toBe(
        'currentColor',
      )
    }
    const web = buildSourceGlyph('web')!
    expect(web.querySelector('circle')?.getAttribute('stroke')).toBe(
      'currentColor',
    )
  })

  it('draws nothing for an unknown source, so absence never reads as a finding', () => {
    expect(buildSourceGlyph('unknown')).toBeNull()
  })

  it('names each platform for tooltips', () => {
    expect(platformLabel('ios')).toBe('App Store')
    // "Android" rather than "Google Play": it matches the robot glyph, and it
    // matches what X actually sends ("<country> Android App").
    expect(platformLabel('android')).toBe('Android')
    expect(platformLabel('web')).toBe('Web')
  })

  it('hides the glyph from assistive tech, which reads the row instead', () => {
    expect(buildSourceGlyph('ios')!.getAttribute('aria-hidden')).toBe('true')
  })
})
