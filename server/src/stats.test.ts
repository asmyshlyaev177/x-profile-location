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
    expect(idle.snapshot().minMs).toBeNull()
    expect(idle.snapshot().medianMs).toBeNull()
    expect(idle.snapshot().avgMs).toBeNull()
    expect(idle.snapshot().maxMs).toBeNull()

    const s = new Stats()
    s.noteRequest(
      '/v1/loc/batch',
      lookupReq('a', 'b', 'c', 'd'),
      lookupResp(1),
      1,
    )
    expect(s.snapshot().hitRate).toBe(0.25)
  })

  it('tracks fastest, median, average and slowest latency', () => {
    const s = new Stats()
    // A skewed shape on purpose: one outlier must move max and avg, not median.
    for (const ms of [10, 40, 2, 4, 400]) {
      s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), ms)
    }
    const snap = s.snapshot()
    expect(snap.minMs).toBe(2)
    expect(snap.medianMs).toBe(10)
    expect(snap.avgMs).toBe(91.2)
    expect(snap.maxMs).toBe(400)
  })

  it('takes the median between the two middle samples of an even window', () => {
    const s = new Stats()
    for (const ms of [1, 3, 8, 100]) {
      s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), ms)
    }
    expect(s.snapshot().medianMs).toBe(5.5)
  })

  it('weights the median by how often each duration occurred', () => {
    const s = new Stats()
    // 1ms x5 and 500ms x2: the histogram must answer 1, not midpoint(1, 500).
    for (const ms of [1, 1, 1, 1, 1, 500, 500]) {
      s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), ms)
    }
    expect(s.snapshot().medianMs).toBe(1)
    expect(s.snapshot().maxMs).toBe(500)
  })

  it('drains latency with the rest of the window', () => {
    const s = new Stats()
    s.noteRequest('/v1/loc/batch', lookupReq('a'), lookupResp(1), 40)
    expect(s.drain().maxMs).toBe(40)
    const fresh = s.snapshot()
    expect(fresh.minMs).toBeNull()
    expect(fresh.medianMs).toBeNull()
    expect(fresh.maxMs).toBeNull()
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
      maxMs: null,
      hitRate: null,
    })
    // The new window starts at the drain, not at construction.
    expect(Date.parse(second.since)).toBeGreaterThanOrEqual(
      Date.parse(first.since),
    )
  })
})
