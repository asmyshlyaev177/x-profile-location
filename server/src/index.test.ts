import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { __resetStats, parseContribution, type Env } from './index'

// Must match the constants in index.ts.
const MAX_BATCH = 100
const MAX_FIELD_LEN = 60
const STATS_TTL_MS = 3 * 60 * 1000

describe('parseContribution', () => {
  it('cleans and keeps a well-formed entry', () => {
    expect(
      parseContribution({
        entries: [{ u: 'Jack', loc: 'France', src: 'web' }],
      }),
    ).toEqual([{ u: 'jack', loc: 'France', src: 'web', acc: 1 }])
  })

  it('returns nothing when entries is missing or not an array', () => {
    for (const body of [
      null,
      undefined,
      {},
      { entries: 'nope' },
      { entries: 5 },
      42,
    ]) {
      expect(parseContribution(body)).toEqual([])
    }
  })

  it('lowercases and trims the username', () => {
    const [v] = parseContribution({ entries: [{ u: '  ELonMusk  ' }] })
    expect(v.u).toBe('elonmusk')
  })

  // Untrusted input: anything unrecognisable is dropped, never rejected, so a
  // poisoner learns nothing from the response.
  it('drops entries whose username cannot be a handle', () => {
    const entries = [
      { u: 'has space' },
      { u: 'has-dash' },
      { u: 'has.dot' },
      { u: '' },
      { u: 'a'.repeat(51) },
      { u: 42 },
      { u: null },
      {},
      null,
      'not an object',
      7,
    ]
    expect(parseContribution({ entries })).toEqual([])
  })

  it('keeps a 50-character handle and drops the 51st', () => {
    const ok = 'a'.repeat(50)
    expect(parseContribution({ entries: [{ u: ok }] })).toEqual([
      { u: ok, loc: null, src: null, acc: 1 },
    ])
  })

  it('treats acc as true unless it is exactly false', () => {
    const entries = [
      { u: 'a', acc: false },
      { u: 'b', acc: true },
      { u: 'c' },
      { u: 'd', acc: 0 },
      { u: 'e', acc: 'false' },
    ]
    expect(parseContribution({ entries }).map((v) => v.acc)).toEqual([
      0, 1, 1, 1, 1,
    ])
  })

  it('trims location and source, and nulls them when blank or not a string', () => {
    const [v] = parseContribution({
      entries: [{ u: 'a', loc: '  France  ', src: '   ' }],
    })
    expect(v).toEqual({ u: 'a', loc: 'France', src: null, acc: 1 })

    const [w] = parseContribution({ entries: [{ u: 'b', loc: 12, src: {} }] })
    expect(w).toEqual({ u: 'b', loc: null, src: null, acc: 1 })
  })

  it('truncates an over-long location to the field limit', () => {
    const [v] = parseContribution({
      entries: [{ u: 'a', loc: 'x'.repeat(MAX_FIELD_LEN + 40) }],
    })
    expect(v.loc).toHaveLength(MAX_FIELD_LEN)
  })

  it('takes at most MAX_BATCH entries, in the order given', () => {
    const entries = Array.from({ length: MAX_BATCH + 25 }, (_, i) => ({
      u: `user${i}`,
    }))
    const parsed = parseContribution({ entries })
    expect(parsed).toHaveLength(MAX_BATCH)
    expect(parsed[0].u).toBe('user0')
    expect(parsed.at(-1)!.u).toBe(`user${MAX_BATCH - 1}`)
  })

  // The cap is applied before parsing, so junk in the first 100 does not let a
  // valid entry from position 150 through.
  it('counts dropped entries against the batch cap', () => {
    const entries = [
      ...Array.from({ length: MAX_BATCH }, () => ({ u: 'not a handle' })),
      { u: 'jack' },
    ]
    expect(parseContribution({ entries })).toEqual([])
  })
})

describe('GET /v1/stats', () => {
  // A number the popup shows while it is open, so the request rate follows how
  // many people have a popup open - the one thing here that isn't driven by
  // someone actually reading a timeline.
  function countingEnv(n: number) {
    const all = vi.fn().mockResolvedValue({ results: [{ n }] })
    const prepare = vi.fn((_sql: string) => ({ all }))
    return { env: { DB: { prepare } } as unknown as Env, prepare, all }
  }

  const ask = (env: Env) =>
    worker.fetch(new Request('http://cache.test/v1/stats'), env)

  beforeEach(__resetStats)

  it('answers how many accounts the cache holds', async () => {
    const { env } = countingEnv(44_210)
    const resp = await ask(env)

    expect(resp.status).toBe(200)
    expect(await resp.json()).toEqual({ profiles: 44_210 })
  })

  it('counts once before any retention pass, not once a client', async () => {
    // A distinct count over every vote holds the event loop for as long as it
    // runs, so only a cold process or isolate pays it, and only once.
    const { env, all } = countingEnv(7)
    for (let i = 0; i < 25; i++) await ask(env)

    expect(all).toHaveBeenCalledTimes(1)
  })

  it('tells the browser how long to hold on to the answer', async () => {
    // A saving where the browser honours it, not the protection, which is the
    // count held between retention passes. Set on this response only - `json()` is shared with the batch
    // lookup, which must not be cacheable.
    const { env } = countingEnv(1)
    const resp = await ask(env)

    expect(resp.headers.get('Cache-Control')).toBe(
      `public, max-age=${STATS_TTL_MS / 1000}`,
    )
    expect(resp.headers.get('Access-Control-Allow-Origin')).toBe('*')
  })

  it('is a GET, and nothing else', async () => {
    const { env, prepare } = countingEnv(1)
    const resp = await worker.fetch(
      new Request('http://cache.test/v1/stats', { method: 'POST' }),
      env,
    )

    expect(resp.status).toBe(404)
    expect(prepare).not.toHaveBeenCalled()
  })

  it('answers 0 rather than failing when the row comes back empty', async () => {
    const all = vi.fn().mockResolvedValue({})
    const env = { DB: { prepare: vi.fn(() => ({ all })) } } as unknown as Env

    expect(await (await ask(env)).json()).toEqual({ profiles: 0 })
  })
})
