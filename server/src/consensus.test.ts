import { describe, expect, it } from 'vitest'
import { pickConsensus, type LocationVote } from './consensus'

function vote(
  location: string | null,
  opts: {
    source?: string | null
    accurate?: boolean
    seenAt?: number
  } = {},
): LocationVote {
  return {
    location,
    source: opts.source ?? null,
    locationAccurate: opts.accurate ?? true,
    seenAt: opts.seenAt ?? 0,
  }
}

describe('pickConsensus', () => {
  it('returns null for no votes', () => {
    expect(pickConsensus([])).toBeNull()
  })

  it('returns the single value with confidence 1', () => {
    const c = pickConsensus([vote('JP')])
    expect(c).toEqual({
      location: 'JP',
      source: null,
      locationAccurate: true,
      confidence: 1,
    })
  })

  it('counts distinct votes for the same tuple as confidence', () => {
    const c = pickConsensus([vote('JP'), vote('JP'), vote('JP')])
    expect(c?.location).toBe('JP')
    expect(c?.confidence).toBe(3)
  })

  it('picks the majority tuple over a minority (poison) one', () => {
    const votes = [vote('JP'), vote('JP'), vote('JP'), vote('US')]
    const c = pickConsensus(votes)
    expect(c?.location).toBe('JP')
    expect(c?.confidence).toBe(3)
  })

  it('treats a different source as a different tuple', () => {
    const votes = [
      vote('JP', { source: 'Japan Android App' }),
      vote('JP', { source: 'Japan Android App' }),
      vote('JP', { source: null }),
    ]
    const c = pickConsensus(votes)
    expect(c?.source).toBe('Japan Android App')
    expect(c?.confidence).toBe(2)
  })

  it('breaks ties by the most recently seen vote', () => {
    const votes = [vote('JP', { seenAt: 100 }), vote('US', { seenAt: 200 })]
    const c = pickConsensus(votes)
    expect(c?.location).toBe('US')
  })

  it('reaches consensus on a null location (checked, no public location)', () => {
    const c = pickConsensus([vote(null), vote(null)])
    expect(c).toEqual({
      location: null,
      source: null,
      locationAccurate: true,
      confidence: 2,
    })
  })

  it('distinguishes the location_accurate flag as part of the tuple', () => {
    const votes = [
      vote('TR', { accurate: false }),
      vote('TR', { accurate: false }),
      vote('TR', { accurate: true }),
    ]
    const c = pickConsensus(votes)
    expect(c?.locationAccurate).toBe(false)
    expect(c?.confidence).toBe(2)
  })
})
