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

  it('never answers below 1, which is what lets /v1/stats count cheaply', () => {
    // Every profile row is written from one of these, so `location_confidence`
    // is >= 1 on all of them and the count handleStats wants is the plain
    // COUNT(*) — the filtered one means the same thing and costs a table scan.
    // If this ever returns 0, that query has to grow a WHERE clause again.
    for (const votes of [
      [vote(null)],
      [vote('JP')],
      [vote('JP'), vote('US')],
      [vote(null), vote(null, { source: 'web' })],
    ]) {
      expect(pickConsensus(votes)?.confidence).toBeGreaterThanOrEqual(1)
    }
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
