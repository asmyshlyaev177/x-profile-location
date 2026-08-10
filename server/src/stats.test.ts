import { describe, expect, it } from 'vitest'
import { Stats } from './stats'

const lookupReq = (...names: string[]) => JSON.stringify({ usernames: names })
const lookupResp = (n: number) =>
  JSON.stringify({ profiles: Array.from({ length: n }, () => ({ u: 'x' })) })

describe('Stats', () => {
  it('separates lookups, contributions and everything else', () => {
    const s = new Stats()
    s.noteRequest('/v1/loc/batch', lookupReq('a', 'b', 'c'), lookupResp(2), 5)
    s.noteRequest(
      '/v1/loc',
      JSON.stringify({ clientId: 'c1', entries: [{ u: 'a' }, { u: 'b' }] }),
      '{"ok":true}',
      3,
    )
    s.noteRequest('/wp-login.php', '', 'Not found', 1)

    const snap = s.snapshot()
    expect(snap.lookups).toBe(1)
    expect(snap.lookupNames).toBe(3)
    expect(snap.lookupHits).toBe(2)
    expect(snap.contributions).toBe(1)
    expect(snap.contributedEntries).toBe(2)
    expect(snap.other).toBe(1)
  })

  it('keeps popups asking for the count out of the scanner number', () => {
    // `other` is how much junk traffic this box is taking. /v1/stats is a real
    // endpoint and the only one a client polls, so counting it there would
    // leave `other` saying nothing.
    const s = new Stats()
    s.noteRequest('/v1/stats', '', '{"profiles":44210}', 1)
    s.noteRequest('/v1/stats', '', '{"profiles":44210}', 1)
    s.noteRequest('/wp-login.php', '', 'Not found', 1)

    const snap = s.snapshot()
    expect(snap.statsReads).toBe(2)
    expect(snap.other).toBe(1)
    expect(s.drain().statsReads).toBe(2)
    expect(s.snapshot().statsReads).toBe(0)
  })

  it('computes a hit rate, and reports null rather than 0 when idle', () => {
    const idle = new Stats()
    expect(idle.snapshot().hitRate).toBeNull()
    expect(idle.snapshot().avgMs).toBeNull()

    const s = new Stats()
    s.noteRequest(
      '/v1/loc/batch',
      lookupReq('a', 'b', 'c', 'd'),
      lookupResp(1),
      1,
    )
    expect(s.snapshot().hitRate).toBe(0.25)
  })

  it('tracks average and max latency', () => {
    const s = new Stats()
    s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), 10)
    s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), 40)
    const snap = s.snapshot()
    expect(snap.avgMs).toBe(25)
    expect(snap.maxMs).toBe(40)
  })

  it('counts rejections separately from handled requests', () => {
    const s = new Stats()
    s.noteRateLimited()
    s.noteRateLimited()
    s.noteTooLarge()
    s.noteError()
    const snap = s.snapshot()
    expect(snap).toMatchObject({ rateLimited: 2, tooLarge: 1, errors: 1 })
    // Rejections never reached a handler, so they are not "requests".
    expect(snap.lookups + snap.contributions + snap.other).toBe(0)
  })

  // A malformed or truncated body must not throw out of the counters and take
  // the request down with it — stats are strictly observational.
  it('survives bodies that are not the JSON it expects', () => {
    const s = new Stats()
    for (const body of ['', 'not json', '{', '[]', 'null', '{"usernames":5}']) {
      s.noteRequest('/v1/loc/batch', body, body, 1)
    }
    const snap = s.snapshot()
    expect(snap.lookups).toBe(6)
    expect(snap.lookupNames).toBe(0)
    expect(snap.lookupHits).toBe(0)
  })

  // The per-window user count, taken from the clientId already on the wire
  // rather than from a COUNT(DISTINCT) scan — see bench/load.ts for why.
  describe('distinct installs', () => {
    const contrib = (clientId: unknown) =>
      JSON.stringify({ clientId, entries: [{ u: 'a' }] })

    it('counts each install once, however often it contributes', () => {
      const s = new Stats()
      for (const c of ['a', 'b', 'a', 'c', 'b', 'a']) {
        s.noteRequest('/v1/loc', contrib(c), '{"ok":true}', 1)
      }
      const snap = s.snapshot()
      expect(snap.users).toBe(3)
      expect(snap.contributions).toBe(6)
      expect(snap.usersCapped).toBeUndefined()
    })

    it('ignores a missing or non-string clientId', () => {
      const s = new Stats()
      for (const c of [undefined, null, '', 42, { id: 'x' }]) {
        s.noteRequest('/v1/loc', contrib(c), '{"ok":true}', 1)
      }
      expect(s.snapshot().users).toBe(0)
    })

    it('lookups contribute no identity, so they never move the count', () => {
      const s = new Stats()
      s.noteRequest(
        '/v1/loc/batch',
        JSON.stringify({ usernames: ['a'], clientId: 'sneaky' }),
        lookupResp(1),
        1,
      )
      expect(s.snapshot().users).toBe(0)
    })

    it('caps the tracked set and flags the count as a floor', () => {
      const s = new Stats()
      for (let i = 0; i < 50_050; i++) {
        s.noteRequest('/v1/loc', contrib(`c${i}`), '{"ok":true}', 0)
      }
      const snap = s.snapshot()
      expect(snap.users).toBe(50_000)
      expect(snap.usersCapped).toBe(true)
    })

    it('resets on drain, so windows do not accumulate installs', () => {
      const s = new Stats()
      s.noteRequest('/v1/loc', contrib('a'), '{"ok":true}', 1)
      expect(s.drain().users).toBe(1)
      expect(s.snapshot().users).toBe(0)
    })
  })

  it('drain() returns the window and starts a new one', () => {
    const s = new Stats()
    s.noteRequest('/v1/loc/batch', lookupReq('a', 'b'), lookupResp(2), 7)
    const first = s.drain()
    expect(first).toMatchObject({ lookups: 1, lookupNames: 2, lookupHits: 2 })

    const second = s.snapshot()
    expect(second).toMatchObject({
      lookups: 0,
      lookupNames: 0,
      lookupHits: 0,
      maxMs: 0,
      hitRate: null,
    })
    // The new window starts at the drain, not at construction.
    expect(Date.parse(second.since)).toBeGreaterThanOrEqual(
      Date.parse(first.since),
    )
  })
})
