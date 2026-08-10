import { beforeEach, describe, expect, it, vi } from 'vitest'
import worker, {
  __resetStats,
  alreadyStored,
  consensusWrites,
  groupAndCapVotes,
  parseContribution,
  type Env,
} from './index'

// Must match the constants in index.ts.
const MAX_BATCH = 100
const MAX_FIELD_LEN = 60
const VOTE_CAP = 10
const VOTE_CAP_SLACK = 5

function vote(username: string, seen_at: number, location = 'France') {
  return {
    username,
    client_id: `c${seen_at}`,
    location,
    source: 'web',
    location_accurate: 1,
    seen_at,
  }
}

function profile(over: Partial<ReturnType<typeof baseProfile>> = {}) {
  return { ...baseProfile(), ...over }
}

function baseProfile() {
  return {
    username: 'jack',
    location: 'France' as string | null,
    source: 'web' as string | null,
    location_accurate: 1,
    location_confidence: 3,
  }
}

function consensus(over: Partial<ReturnType<typeof baseConsensus>> = {}) {
  return { ...baseConsensus(), ...over }
}

function baseConsensus() {
  return {
    location: 'France' as string | null,
    source: 'web' as string | null,
    locationAccurate: true,
    confidence: 3,
  }
}

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

describe('groupAndCapVotes', () => {
  it('groups rows by username', () => {
    const { byUser, evictions } = groupAndCapVotes([
      vote('jack', 1),
      vote('elon', 2),
      vote('jack', 3),
    ])
    expect([...byUser.keys()].sort()).toEqual(['elon', 'jack'])
    expect(byUser.get('jack')).toHaveLength(2)
    expect(byUser.get('elon')).toHaveLength(1)
    expect(evictions).toEqual([])
  })

  it('returns an empty map for no rows', () => {
    const { byUser, evictions } = groupAndCapVotes([])
    expect(byUser.size).toBe(0)
    expect(evictions).toEqual([])
  })

  // Pruning is deliberately not at exactly VOTE_CAP: a popular handle sitting on
  // the cap would otherwise evict a row on every single contribution forever.
  it('lets votes pile up through the slack without evicting', () => {
    const rows = Array.from({ length: VOTE_CAP + VOTE_CAP_SLACK }, (_, i) =>
      vote('jack', i),
    )
    const { byUser, evictions } = groupAndCapVotes(rows)
    expect(evictions).toEqual([])
    expect(byUser.get('jack')).toHaveLength(VOTE_CAP + VOTE_CAP_SLACK)
  })

  it('prunes back to the cap once one row past the slack arrives', () => {
    const rows = Array.from({ length: VOTE_CAP + VOTE_CAP_SLACK + 1 }, (_, i) =>
      vote('jack', i),
    )
    const { byUser, evictions } = groupAndCapVotes(rows)
    expect(byUser.get('jack')).toHaveLength(VOTE_CAP)
    expect(evictions).toHaveLength(VOTE_CAP_SLACK + 1)
  })

  it('keeps the newest votes and evicts the oldest', () => {
    const rows = Array.from({ length: 20 }, (_, i) => vote('jack', i))
    const { byUser, evictions } = groupAndCapVotes(rows)

    // seen_at 19 down to 10 survive; 9 down to 0 are evicted.
    expect(byUser.get('jack')!.map((r) => r.seen_at)).toEqual([
      19, 18, 17, 16, 15, 14, 13, 12, 11, 10,
    ])
    expect(evictions.map((r) => r.seen_at).sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ])
  })

  it('sorts newest-first regardless of the order rows arrive in', () => {
    const shuffled = [5, 19, 0, 12, 3, 17, 8, 1, 14, 6, 11, 2, 18, 9, 4, 16]
    const { byUser } = groupAndCapVotes(shuffled.map((n) => vote('jack', n)))
    expect(byUser.get('jack')!.map((r) => r.seen_at)).toEqual([
      19, 18, 17, 16, 14, 12, 11, 9, 8, 6,
    ])
  })

  it('counts the cap per username, not across the whole batch', () => {
    const rows = [
      ...Array.from({ length: 12 }, (_, i) => vote('jack', i)),
      ...Array.from({ length: 12 }, (_, i) => vote('elon', i)),
    ]
    const { byUser, evictions } = groupAndCapVotes(rows)
    expect(evictions).toEqual([])
    expect(byUser.get('jack')).toHaveLength(12)
    expect(byUser.get('elon')).toHaveLength(12)
  })

  it('prunes only the username that is over, leaving the others whole', () => {
    const rows = [
      ...Array.from({ length: 20 }, (_, i) => vote('jack', i)),
      ...Array.from({ length: 3 }, (_, i) => vote('elon', i)),
    ]
    const { byUser, evictions } = groupAndCapVotes(rows)
    expect(byUser.get('jack')).toHaveLength(VOTE_CAP)
    expect(byUser.get('elon')).toHaveLength(3)
    expect(evictions.every((r) => r.username === 'jack')).toBe(true)
  })

  // Consensus is taken over `byUser` after this runs, so the surviving lists and
  // the rows left in the table have to be the same set.
  it('leaves byUser holding exactly the survivors, disjoint from evictions', () => {
    const rows = Array.from({ length: 20 }, (_, i) => vote('jack', i))
    const { byUser, evictions } = groupAndCapVotes(rows)
    const survivors = new Set(byUser.get('jack')!.map((r) => r.client_id))
    expect(survivors.size).toBe(VOTE_CAP)
    expect(evictions.some((r) => survivors.has(r.client_id))).toBe(false)
    expect(survivors.size + evictions.length).toBe(rows.length)
  })

  it('carries the identity a DELETE needs on every eviction', () => {
    const rows = Array.from({ length: 20 }, (_, i) => vote('jack', i))
    const { evictions } = groupAndCapVotes(rows)
    for (const ev of evictions) {
      expect(ev.username).toBe('jack')
      expect(ev.client_id).toBeTruthy()
    }
  })
})

describe('alreadyStored', () => {
  it('is false when there is no stored row at all', () => {
    expect(alreadyStored(undefined, consensus())).toBe(false)
  })

  it('is true when every served field matches', () => {
    expect(alreadyStored(profile(), consensus())).toBe(true)
  })

  it.each([
    ['location', { location: 'Germany' }],
    ['source', { source: 'Japan Android App' }],
    ['confidence', { confidence: 4 }],
  ])('is false when %s differs', (_field, over) => {
    expect(alreadyStored(profile(), consensus(over))).toBe(false)
  })

  it('is false when accuracy differs', () => {
    expect(
      alreadyStored(profile(), consensus({ locationAccurate: false })),
    ).toBe(false)
    expect(alreadyStored(profile({ location_accurate: 0 }), consensus())).toBe(
      false,
    )
  })

  // The column is an integer; anything non-zero means true.
  it('compares accuracy as a truthiness, not a number', () => {
    expect(alreadyStored(profile({ location_accurate: 1 }), consensus())).toBe(
      true,
    )
    expect(
      alreadyStored(
        profile({ location_accurate: 0 }),
        consensus({ locationAccurate: false }),
      ),
    ).toBe(true)
  })

  it('treats a null location as a value like any other', () => {
    expect(
      alreadyStored(profile({ location: null }), consensus({ location: null })),
    ).toBe(true)
    expect(alreadyStored(profile({ location: null }), consensus())).toBe(false)
  })
})

describe('consensusWrites', () => {
  function mockEnv() {
    const bind = vi.fn((...args: unknown[]) => ({ args }))
    const prepare = vi.fn((sql: string) => ({ sql, bind }))
    return { env: { DB: { prepare } } as unknown as Env, prepare, bind }
  }

  const now = 1_700_000_000_000

  it('writes one upsert per username whose consensus moved', () => {
    const { env, prepare, bind } = mockEnv()
    const writes = consensusWrites(env, {
      now,
      affected: ['jack'],
      byUser: new Map([['jack', [vote('jack', 5, 'Germany')]]]),
      current: new Map(),
    })

    expect(writes).toHaveLength(1)
    expect(prepare.mock.calls[0][0]).toContain('INSERT INTO profiles')
    expect(bind).toHaveBeenCalledWith('jack', 'Germany', 'web', 1, 1, now)
  })

  it('writes nothing for a username with no surviving votes', () => {
    const { env, prepare } = mockEnv()
    const writes = consensusWrites(env, {
      now,
      affected: ['jack'],
      byUser: new Map(),
      current: new Map(),
    })
    expect(writes).toEqual([])
    expect(prepare).not.toHaveBeenCalled()
  })

  // Trading a read for a skipped write is the point: D1's write budget is far
  // scarcer than its reads, and `updated_at` is never served.
  it('writes nothing when the stored row already says the same thing', () => {
    const { env, prepare } = mockEnv()
    const writes = consensusWrites(env, {
      now,
      affected: ['jack'],
      byUser: new Map([['jack', [vote('jack', 5)]]]),
      current: new Map([['jack', profile({ location_confidence: 1 })]]),
    })
    expect(writes).toEqual([])
    expect(prepare).not.toHaveBeenCalled()
  })

  it('writes when only the confidence moved', () => {
    const { env, bind } = mockEnv()
    const writes = consensusWrites(env, {
      now,
      affected: ['jack'],
      byUser: new Map([['jack', [vote('jack', 5), vote('jack', 6)]]]),
      current: new Map([['jack', profile({ location_confidence: 1 })]]),
    })
    expect(writes).toHaveLength(1)
    expect(bind).toHaveBeenCalledWith('jack', 'France', 'web', 1, 2, now)
  })

  it('stores accuracy as an integer', () => {
    const { env, bind } = mockEnv()
    consensusWrites(env, {
      now,
      affected: ['jack'],
      byUser: new Map([
        ['jack', [{ ...vote('jack', 5), location_accurate: 0 }]],
      ]),
      current: new Map(),
    })
    expect(bind).toHaveBeenCalledWith('jack', 'France', 'web', 0, 1, now)
  })

  it('skips the unchanged users and writes the changed ones', () => {
    const { env } = mockEnv()
    const writes = consensusWrites(env, {
      now,
      affected: ['jack', 'elon', 'ada'],
      byUser: new Map([
        ['jack', [vote('jack', 5)]],
        ['elon', [vote('elon', 6, 'Germany')]],
        ['ada', [vote('ada', 7)]],
      ]),
      current: new Map([
        ['jack', profile({ location_confidence: 1 })],
        ['ada', profile({ username: 'ada', location: 'Spain' })],
      ]),
    })
    expect(writes).toHaveLength(2)
  })
})

describe('GET /v1/stats', () => {
  // A number the popup shows while it is open, so the request rate follows how
  // many people have a popup open — the one thing here that isn't driven by
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

  it('counts without a WHERE clause, which is what keeps it off a table scan', async () => {
    // `location_confidence > 0` would mean the same thing here (consensus.ts
    // never writes a row below 1) and cost a scan instead of an index read.
    const { env, prepare } = countingEnv(1)
    await ask(env)

    expect(prepare.mock.calls[0][0]).not.toMatch(/where/i)
  })

  it('asks the database once a window, not once a client', async () => {
    // The whole reason this endpoint is affordable: the count is the same for
    // everyone, so the cost is per window rather than per reader.
    const { env, all } = countingEnv(7)
    for (let i = 0; i < 25; i++) await ask(env)

    expect(all).toHaveBeenCalledTimes(1)
  })

  it('tells the browser how long to hold on to the answer', async () => {
    // Half of what the popup asks for while it is open never leaves the
    // browser. Set on this response only — `json()` is shared with the batch
    // lookup, which must not be cacheable.
    const { env } = countingEnv(1)
    const resp = await ask(env)

    expect(resp.headers.get('Cache-Control')).toBe('public, max-age=60')
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
