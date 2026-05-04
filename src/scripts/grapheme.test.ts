import { describe, expect, it } from 'vitest'
import { graphemeIncludes, toGraphemes } from './grapheme'

describe('graphemeIncludes', () => {
  it('finds a plain text substring', () => {
    expect(graphemeIncludes(toGraphemes('hello world'), toGraphemes('world'))).toBe(true)
  })

  it('returns false for absent plain text', () => {
    expect(graphemeIncludes(toGraphemes('hello'), toGraphemes('xyz'))).toBe(false)
  })

  it('matches a flag that is genuinely present', () => {
    expect(graphemeIncludes(toGraphemes('🇺🇦 slava'), toGraphemes('🇺🇦'))).toBe(true)
  })

  // Regression: 🇰🇵🇸🇴 contains the Regional Indicator code points P and S
  // adjacent across flag boundaries. A naive string.includes('🇵🇸') would
  // match here because it doesn't respect grapheme cluster boundaries.
  it('does not match 🇵🇸 inside 🇰🇵🇸🇴 (cross-flag boundary false positive)', () => {
    const bio = toGraphemes('🇰🇵🇸🇴🇵🇾☠')
    expect(graphemeIncludes(bio, toGraphemes('🇵🇸'))).toBe(false)
  })

  it('correctly matches each individual flag in 🇰🇵🇸🇴🇵🇾', () => {
    const bio = toGraphemes('🇰🇵🇸🇴🇵🇾☠')
    expect(graphemeIncludes(bio, toGraphemes('🇰🇵'))).toBe(true)
    expect(graphemeIncludes(bio, toGraphemes('🇸🇴'))).toBe(true)
    expect(graphemeIncludes(bio, toGraphemes('🇵🇾'))).toBe(true)
  })

  it('returns true for an empty needle', () => {
    expect(graphemeIncludes(toGraphemes('anything'), [])).toBe(true)
  })
})
