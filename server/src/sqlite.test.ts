// End-to-end tests for the SQLite backend: real better-sqlite3, real schema,
// driven through the same handlers the Worker runs. This is what proves the
// db-types.ts adapter is a faithful stand-in for D1 - the handler code under
// test is not mocked at any layer.

import Database from 'better-sqlite3'
import fc from 'fast-check'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __resetContribLimit } from './contrib-limit.ts'
import type { Db, DbBoundStatement } from './db-types.ts'
import worker, {
  __resetStats,
  pruneExpired,
  recountProfiles,
  VOTE_RETENTION_MS,
  type Env,
} from './index.ts'
import { networkOf } from './network.ts'
import { WHOLE_TABLE, type ScanPolicy } from './scan.ts'
import { openDatabase, yieldingScan, type SqliteDb } from './sqlite.ts'
import { countTotals } from './stats.ts'

// Must match index.ts.
const VOTE_CAP = 10
const DAY = 24 * 60 * 60 * 1000

let db: SqliteDb
let env: Env

beforeEach(() => {
  db = openDatabase({ path: ':memory:', cacheMb: 8, mmapMb: 0 })
  env = { DB: db }
  // Both are process-wide and would carry one test's clients and count into
  // the next.
  __resetContribLimit()
  __resetStats()
})

afterEach(() => {
  db.close()
  vi.useRealTimers()
})

interface Served {
  u: string
  loc: string | null
  src: string | null
  acc: boolean
  conf: number
}

/** `ip` is the sender's address as Cloudflare, or node-server.ts, reports it. */
function post(path: string, body: unknown, ip?: string): Promise<Response> {
  const headers = new Headers({ 'content-type': 'application/json' })
  if (ip !== undefined) headers.set('cf-connecting-ip', ip)
  return worker.fetch(
    new Request(`http://cache.test${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }),
    env,
  )
}

async function contribute(
  clientId: string,
  entries: {
    u: string
    loc: string | null
    src?: string | null
    acc?: boolean
  }[],
  ip?: string,
): Promise<void> {
  const resp = await post('/v1/loc', { clientId, entries }, ip)
  expect(resp.status).toBe(200)
}

async function lookup(usernames: string[]): Promise<Served[]> {
  const resp = await post('/v1/loc/batch', { usernames })
  expect(resp.status).toBe(200)
  return ((await resp.json()) as { profiles: Served[] }).profiles
}

function voteCount(username: string): number {
  return (
    db.raw
      .prepare('SELECT COUNT(*) AS n FROM location_votes WHERE username = ?')
      .get(username) as { n: number }
  ).n
}

function labelTexts(target: SqliteDb = db): string[] {
  return target.raw
    .prepare('SELECT text FROM labels ORDER BY text')
    .pluck()
    .all() as string[]
}

/** Every non-null label id a vote holds that names no labels row. */
function danglingLabelIds(target: SqliteDb): number {
  return target.raw
    .prepare(
      `SELECT COUNT(*) FROM location_votes v
        WHERE (v.location IS NOT NULL AND NOT EXISTS (SELECT 1 FROM labels WHERE id = v.location))
           OR (v.source IS NOT NULL AND NOT EXISTS (SELECT 1 FROM labels WHERE id = v.source))`,
    )
    .pluck()
    .get() as number
}

/** A Db that remembers every SQL text it prepared. */
function recording(target: SqliteDb): { db: Db; prepared: Set<string> } {
  const prepared = new Set<string>()
  return {
    prepared,
    db: {
      prepare: (sql) => {
        prepared.add(sql)
        return target.prepare(sql)
      },
      batch: (statements) => target.batch(statements),
    },
  }
}

/** Runs `between` once before the next batch that deletes votes, as D1 lets
 *  another isolate's request run between two batches of one request. */
function interleaving(target: SqliteDb, between: () => Promise<void>): Db {
  let pending: (() => Promise<void>) | null = between
  const deletes = new WeakSet<DbBoundStatement>()
  return {
    prepare: (sql) => {
      const stmt = target.prepare(sql)
      if (!sql.startsWith('DELETE FROM location_votes')) return stmt
      return {
        all: () => stmt.all(),
        run: () => stmt.run(),
        bind: (...values) => {
          const bound = stmt.bind(...values)
          deletes.add(bound)
          return bound
        },
      }
    },
    batch: async (statements) => {
      if (pending && statements.some((s) => deletes.has(s))) {
        const run = pending
        pending = null
        await run()
      }
      return target.batch(statements)
    },
  }
}

function planOf(target: SqliteDb, sql: string): string[] {
  const binds = Array.from({ length: sql.split('?').length - 1 }, () => 0)
  return (
    target.raw.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...binds) as {
      detail: string
    }[]
  ).map((row) => row.detail)
}

describe('sqlite backend - round trip', () => {
  it('serves back what a single client contributed', async () => {
    await contribute('client-a', [
      { u: 'Alice', loc: 'United States', src: 'web', acc: true },
    ])

    const [p] = await lookup(['alice'])
    expect(p).toMatchObject({
      u: 'alice',
      loc: 'United States',
      src: 'web',
      acc: true,
      conf: 1,
    })
  })

  it('raises confidence as distinct clients agree, once per client', async () => {
    await contribute('client-a', [{ u: 'bob', loc: 'Japan', src: 'web' }])
    expect((await lookup(['bob']))[0].conf).toBe(1)

    await contribute('client-b', [{ u: 'bob', loc: 'Japan', src: 'web' }])
    expect((await lookup(['bob']))[0].conf).toBe(2)

    // Same client re-reporting is an upsert on (username, client_id), not a
    // second vote.
    await contribute('client-a', [{ u: 'bob', loc: 'Japan', src: 'web' }])
    expect((await lookup(['bob']))[0].conf).toBe(2)
    expect(voteCount('bob')).toBe(2)
  })

  it('serves the plurality tuple when clients disagree', async () => {
    await contribute('honest-1', [{ u: 'carol', loc: 'Germany', src: 'web' }])
    await contribute('honest-2', [{ u: 'carol', loc: 'Germany', src: 'web' }])
    await contribute('liar', [{ u: 'carol', loc: 'Narnia', src: 'web' }])

    const [p] = await lookup(['carol'])
    expect(p.loc).toBe('Germany')
    expect(p.conf).toBe(2)
  })

  it('breaks a tie with the newest vote, whichever came first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 0, 1))
    await contribute('first', [{ u: 'tied', loc: 'France', src: 'web' }])
    await contribute('first', [{ u: 'tied2', loc: 'Germany', src: 'web' }])
    vi.setSystemTime(Date.UTC(2026, 0, 2))
    await contribute('second', [{ u: 'tied', loc: 'Germany', src: 'web' }])
    await contribute('second', [{ u: 'tied2', loc: 'France', src: 'web' }])

    expect(await lookup(['tied', 'tied2'])).toEqual([
      { u: 'tied', loc: 'Germany', src: 'web', acc: true, conf: 1 },
      { u: 'tied2', loc: 'France', src: 'web', acc: true, conf: 1 },
    ])

    // A third vote ends the tie, and conf counts the clients behind the winner.
    vi.setSystemTime(Date.UTC(2026, 0, 3))
    await contribute('third', [{ u: 'tied', loc: 'France', src: 'web' }])
    expect(await lookup(['tied'])).toEqual([
      { u: 'tied', loc: 'France', src: 'web', acc: true, conf: 2 },
    ])
  })

  it('returns nothing for unknown names, and skips invalid ones', async () => {
    expect(await lookup(['nobody'])).toEqual([])
    // Rejected by USERNAME_RE before reaching SQL - no rows, no error.
    expect(await lookup(['has space', 'has-dash', "quote'"])).toEqual([])
  })

  it('handles a full 100-name batch in one statement', async () => {
    const names = Array.from({ length: 100 }, (_, i) => `user${i}`)
    await contribute(
      'client-a',
      names.map((u) => ({ u, loc: 'France', src: 'web' })),
    )

    const served = await lookup(names)
    expect(served).toHaveLength(100)
    expect(new Set(served.map((p) => p.loc))).toEqual(new Set(['France']))
  })

  it('stores a string that several votes share once', async () => {
    await contribute('client-a', [
      { u: 'one', loc: 'Japan', src: 'Japan Android App' },
      { u: 'two', loc: 'Japan', src: 'web' },
    ])
    await contribute('client-b', [{ u: 'one', loc: 'Japan', src: 'web' }])

    expect(labelTexts()).toEqual(['Japan', 'Japan Android App', 'web'])
    expect(voteCount('one')).toBe(2)
  })

  it('serves a location or source X left empty as null', async () => {
    await contribute('client-a', [
      { u: 'blank', loc: null, src: null },
      { u: 'half', loc: 'Kenya', src: null },
    ])

    expect(await lookup(['blank', 'half'])).toEqual([
      { u: 'blank', loc: null, src: null, acc: true, conf: 1 },
      { u: 'half', loc: 'Kenya', src: null, acc: true, conf: 1 },
    ])
    expect(labelTexts()).toEqual(['Kenya'])
  })

  it('gives strings back exactly as they were sent', async () => {
    const strings = [
      'São Paulo, Brasil 🇧🇷',
      `O'Brien "quoted" \\ back`,
      'japan',
      'Japan',
      'x'.repeat(60),
    ]
    await contribute(
      'client-a',
      strings.map((loc, i) => ({ u: `exact${i}`, loc, src: loc })),
    )

    const served = await lookup(strings.map((_, i) => `exact${i}`))
    const byName = new Map(served.map((p) => [p.u, p]))
    strings.forEach((text, i) => {
      expect(byName.get(`exact${i}`)).toMatchObject({ loc: text, src: text })
    })
  })

  it('persists across a reopen of the same file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'xloc-'))
    const path = join(dir, 'test.db')

    const first = openDatabase({ path, cacheMb: 8, mmapMb: 0 })
    env = { DB: first }
    await contribute('client-a', [{ u: 'dave', loc: 'Brazil', src: 'web' }])
    first.close()

    const second = openDatabase({ path, cacheMb: 8, mmapMb: 0 })
    env = { DB: second }
    expect((await lookup(['dave']))[0].loc).toBe('Brazil')
    second.close()

    rmSync(dir, { recursive: true, force: true })
  })
})

describe('sqlite backend - vote cap', () => {
  it('keeps at most VOTE_CAP votes on a username, the newest ones', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.integer({ min: 1, max: DAY }), {
          minLength: 1,
          maxLength: 2 * VOTE_CAP + 5,
        }),
        async (gaps) => {
          const target = openDatabase({
            path: ':memory:',
            cacheMb: 8,
            mmapMb: 0,
          })
          env = { DB: target }
          try {
            let at = Date.UTC(2026, 0, 1)
            for (const [i, gap] of gaps.entries()) {
              at += gap
              vi.setSystemTime(at)
              await contribute(`cap-client-${i}`, [
                { u: 'popular', loc: 'Spain', src: 'web' },
              ])
            }
            const survivors = target.raw
              .prepare(
                'SELECT client_id FROM location_votes ORDER BY client_id',
              )
              .pluck()
              .all()
            const newest = gaps
              .map((_, i) => `cap-client-${i}`)
              .slice(-VOTE_CAP)
              .sort()
            expect(survivors).toEqual(newest)
          } finally {
            target.close()
          }
        },
      ),
      { numRuns: 60 },
    )
  })

  it('serves the value with conf at the cap, never past it', async () => {
    for (let i = 0; i < VOTE_CAP + 5; i++) {
      await contribute(`client-${i}`, [
        { u: 'popular', loc: 'Spain', src: 'web' },
      ])
    }
    expect(await lookup(['popular'])).toEqual([
      { u: 'popular', loc: 'Spain', src: 'web', acc: true, conf: VOTE_CAP },
    ])
  })

  it('brings a username already over the cap down at its next contribution', async () => {
    // Converting a database does not trim rows; the next vote on the name does.
    const seed = db.raw.prepare(
      'INSERT INTO location_votes (username, client_id, seen_at) VALUES (?, ?, ?)',
    )
    for (let i = 0; i < VOTE_CAP + 5; i++) seed.run('crowded', `old-${i}`, i)

    await contribute('newcomer', [{ u: 'crowded', loc: 'Spain', src: 'web' }])
    const survivors = db.raw
      .prepare('SELECT client_id FROM location_votes WHERE username = ?')
      .pluck()
      .all('crowded')
    expect(new Set(survivors)).toEqual(
      new Set([
        'newcomer',
        ...Array.from({ length: VOTE_CAP - 1 }, (_, i) => `old-${i + 6}`),
      ]),
    )
  })

  it('counts the cap per username, not globally', async () => {
    for (let i = 0; i < 16; i++) {
      await contribute(`client-${i}`, [
        { u: 'one', loc: 'Italy', src: 'web' },
        { u: 'two', loc: 'Italy', src: 'web' },
      ])
    }
    expect(voteCount('one')).toBe(VOTE_CAP)
    expect(voteCount('two')).toBe(VOTE_CAP)
  })

  it('keeps a vote its install re-sent while another request was evicting it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    let at = Date.UTC(2026, 0, 1)
    for (let i = 0; i < VOTE_CAP; i++) {
      vi.setSystemTime((at += 1000))
      await contribute(`c${i}`, [{ u: 'jack', loc: 'Japan' }], `10.0.${i}.1`)
    }
    // The 11th vote picks c0, the oldest, to evict; c0 corrects itself first.
    env = {
      DB: interleaving(db, async () => {
        vi.setSystemTime(at + 2000)
        const resp = await worker.fetch(
          new Request('http://cache.test/v1/loc', {
            method: 'POST',
            headers: { 'cf-connecting-ip': '10.0.0.1' },
            body: JSON.stringify({
              clientId: 'c0',
              entries: [{ u: 'jack', loc: 'Korea' }],
            }),
          }),
          { DB: db },
        )
        expect(resp.status).toBe(200)
      }),
    }
    vi.setSystemTime((at += 1000))
    await contribute('c10', [{ u: 'jack', loc: 'Japan' }], '10.0.10.1')

    const c0 = db.raw
      .prepare(
        `SELECT l.text FROM location_votes v JOIN labels l ON l.id = v.location
          WHERE v.username = 'jack' AND v.client_id = 'c0'`,
      )
      .pluck()
      .get()
    expect(c0).toBe('Korea')
    expect(voteCount('jack')).toBe(VOTE_CAP)
  })
})

describe('sqlite backend - one vote per network', () => {
  function clientsVoting(username: string): string[] {
    return db.raw
      .prepare(
        'SELECT client_id FROM location_votes WHERE username = ? ORDER BY client_id',
      )
      .pluck()
      .all(username) as string[]
  }

  /** The cases need their networks apart; a 16-bit collision would merge two. */
  function expectDistinctNetworks(ips: string[]): void {
    expect(new Set(ips.map(networkOf)).size).toBe(ips.length)
  }

  it('keeps the honest answer when one network posts a forged one from many ids', async () => {
    const honest = ['198.51.100.7', '203.0.113.9', '2001:db8:1::5']
    expectDistinctNetworks([...honest, '192.0.2.1'])
    for (const [i, ip] of honest.entries()) {
      await contribute(
        `honest-${i}`,
        [{ u: 'target', loc: 'Japan', src: 'web' }],
        ip,
      )
    }
    for (let i = 0; i < 100; i++) {
      await contribute(
        `forged-${i}`,
        [{ u: 'target', loc: 'Narnia', src: 'web' }],
        `192.0.2.${i}`,
      )
    }

    expect(await lookup(['target'])).toEqual([
      { u: 'target', loc: 'Japan', src: 'web', acc: true, conf: 3 },
    ])
    expect(voteCount('target')).toBe(4)
  })

  it('keeps the newest vote from a network, whichever client cast it', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(Date.UTC(2026, 0, 1))
    await contribute('laptop', [{ u: 'home', loc: 'France' }], '198.51.100.7')
    vi.setSystemTime(Date.UTC(2026, 0, 2))
    await contribute('phone', [{ u: 'home', loc: 'Germany' }], '198.51.100.200')
    expect(clientsVoting('home')).toEqual(['phone'])
    expect(await lookup(['home'])).toEqual([
      { u: 'home', loc: 'Germany', src: null, acc: true, conf: 1 },
    ])

    vi.setSystemTime(Date.UTC(2026, 0, 3))
    await contribute('laptop', [{ u: 'home', loc: 'France' }], '198.51.100.7')
    expect(clientsVoting('home')).toEqual(['laptop'])
  })

  it('counts two networks twice, and one IPv6 /48 once however it is written', async () => {
    expectDistinctNetworks(['198.51.100.7', '203.0.113.9', '2001:db8:abcd::1'])
    await contribute('home', [{ u: 'two', loc: 'Chile' }], '198.51.100.7')
    await contribute('office', [{ u: 'two', loc: 'Chile' }], '203.0.113.9')
    expect((await lookup(['two']))[0].conf).toBe(2)

    await contribute('a', [{ u: 'six', loc: 'Peru' }], '2001:db8:abcd:1::1')
    await contribute(
      'b',
      [{ u: 'six', loc: 'Peru' }],
      '2001:DB8:ABCD:2:0:0:0:9',
    )
    expect(voteCount('six')).toBe(1)
  })

  it('moves a vote to the network its client sends from now', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    expectDistinctNetworks(['198.51.100.7', '203.0.113.9'])
    vi.setSystemTime(Date.UTC(2026, 0, 1))
    await contribute(
      'traveller',
      [{ u: 'moved', loc: 'Kenya' }],
      '198.51.100.7',
    )
    vi.setSystemTime(Date.UTC(2026, 0, 2))
    await contribute('traveller', [{ u: 'moved', loc: 'Kenya' }], '203.0.113.9')
    vi.setSystemTime(Date.UTC(2026, 0, 3))
    await contribute('local', [{ u: 'moved', loc: 'Kenya' }], '198.51.100.8')

    expect(clientsVoting('moved')).toEqual(['local', 'traveller'])
    expect((await lookup(['moved']))[0].conf).toBe(2)
  })

  it('never merges votes whose network is unknown', async () => {
    // Votes from before the column, inserted as a conversion leaves them.
    const legacy = db.raw.prepare(
      'INSERT INTO location_votes (username, client_id, seen_at) VALUES (?, ?, ?)',
    )
    for (let i = 0; i < 3; i++) legacy.run('mixed', `legacy-${i}`, Date.now())
    // No header, and an address that could not be read.
    await contribute('no-header-1', [{ u: 'mixed', loc: 'Oman' }])
    await contribute('no-header-2', [{ u: 'mixed', loc: 'Oman' }])
    await contribute('unread-1', [{ u: 'mixed', loc: 'Oman' }], 'unknown')
    await contribute('unread-2', [{ u: 'mixed', loc: 'Oman' }], 'unknown')
    await contribute('known', [{ u: 'mixed', loc: 'Oman' }], '198.51.100.7')

    expect(voteCount('mixed')).toBe(8)
    expect((await lookup(['mixed']))[0]).toMatchObject({ loc: 'Oman', conf: 5 })
  })

  it('still caps a username at VOTE_CAP votes across distinct networks', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const ips = Array.from({ length: VOTE_CAP + 5 }, (_, i) => `10.0.${i}.1`)
    expectDistinctNetworks(ips)
    for (const [i, ip] of ips.entries()) {
      vi.setSystemTime(Date.UTC(2026, 0, 1) + i * 1000)
      await contribute(`net-${i}`, [{ u: 'busy', loc: 'Fiji' }], ip)
    }

    const newest = ips
      .map((_, i) => `net-${i}`)
      .slice(-VOTE_CAP)
      .sort()
    expect(clientsVoting('busy')).toEqual(newest)
  })
})

describe('sqlite backend - retention', () => {
  it('deletes votes past the window and leaves recent ones', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('old-client', [{ u: 'stale', loc: 'Peru', src: 'web' }])

    vi.setSystemTime(new Date('2026-04-01T00:00:00Z')) // > 60 days later
    await contribute('new-client', [{ u: 'fresh', loc: 'Chile', src: 'web' }])

    // The real driver's count, not a mocked one - this is what gets logged.
    expect(await worker.scheduled(null, env)).toEqual({
      deleted: 1,
      profiles: 1,
    })

    expect(voteCount('stale')).toBe(0)
    expect(voteCount('fresh')).toBe(1)
    // That is what sends the next reader to X for a fresh value.
    expect(await lookup(['stale'])).toEqual([])
    expect((await lookup(['fresh']))[0].loc).toBe('Chile')

    // ...and the next contribution brings it back.
    await contribute('new-client', [{ u: 'stale', loc: 'Peru', src: 'web' }])
    expect((await lookup(['stale']))[0].loc).toBe('Peru')
  })

  it('takes an expired vote out of the served confidence at once', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('client-a', [{ u: 'mixed', loc: 'Peru', src: 'web' }])
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    await contribute('client-b', [{ u: 'mixed', loc: 'Peru', src: 'web' }])
    expect((await lookup(['mixed']))[0].conf).toBe(2)

    // Past the window for the January vote, inside it for the February one.
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'))
    expect((await worker.scheduled(null, env)).deleted).toBe(1)
    expect((await lookup(['mixed']))[0].conf).toBe(1)
  })

  it('expires a vote on the far side of the boundary, not on it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const contributedAt = Date.now()
    await contribute('client-a', [{ u: 'edge', loc: 'Peru', src: 'web' }])

    // seen_at < now - VOTE_RETENTION_MS: at exactly the window it is not less.
    vi.setSystemTime(contributedAt + VOTE_RETENTION_MS)
    expect((await worker.scheduled(null, env)).deleted).toBe(0)
    expect(labelTexts()).toEqual(['Peru', 'web'])

    vi.setSystemTime(contributedAt + VOTE_RETENTION_MS + 1)
    expect((await worker.scheduled(null, env)).deleted).toBe(1)
    expect(voteCount('edge')).toBe(0)
    expect(labelTexts()).toEqual([])
  })

  it('deletes a label no vote wrote within the window, and keeps one a recent vote wrote', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('client-a', [
      { u: 'gone', loc: 'Peru', src: 'Peru Android App' },
      { u: 'kept', loc: 'Chile', src: 'web' },
    ])
    // A later vote on another account refreshes the strings it uses.
    vi.setSystemTime(new Date('2026-02-15T00:00:00Z'))
    await contribute('client-b', [{ u: 'later', loc: 'Chile', src: 'web' }])

    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'))
    await worker.scheduled(null, env)

    expect(labelTexts()).toEqual(['Chile', 'web'])
    expect(await lookup(['gone', 'kept', 'later'])).toEqual([
      { u: 'later', loc: 'Chile', src: 'web', acc: true, conf: 1 },
    ])
  })

  it('touches nothing when every vote is fresh', async () => {
    await contribute('client-a', [{ u: 'recent', loc: 'Peru', src: 'web' }])
    expect(await worker.scheduled(null, env)).toEqual({
      deleted: 0,
      profiles: 1,
    })
    expect(voteCount('recent')).toBe(1)
    expect(labelTexts()).toEqual(['Peru', 'web'])
  })

  // The answer a reader should get from the votes a model of the rules keeps:
  // newest VOTE_CAP per name, none older than the window; most clients wins,
  // a tie goes to the newest vote.
  interface ModelVote {
    loc: string | null
    src: string | null
    acc: boolean
    seenAt: number
  }
  type Model = Map<string, Map<string, ModelVote>>

  function expectedServed(model: Model): Served[] {
    const served: Served[] = []
    for (const [u, byClient] of [...model].sort(([a], [b]) =>
      a < b ? -1 : 1,
    )) {
      const groups = new Map<
        string,
        { vote: ModelVote; n: number; latest: number }
      >()
      for (const v of byClient.values()) {
        const key = JSON.stringify([v.loc, v.src, v.acc])
        const g = groups.get(key) ?? { vote: v, n: 0, latest: 0 }
        groups.set(key, {
          vote: v,
          n: g.n + 1,
          latest: Math.max(g.latest, v.seenAt),
        })
      }
      const best = [...groups.values()].sort(
        (a, b) => b.n - a.n || b.latest - a.latest,
      )[0]
      if (!best) continue
      const { loc, src, acc } = best.vote
      served.push({ u, loc, src, acc, conf: best.n })
    }
    return served
  }

  function modelContribute(
    model: Model,
    clientId: string,
    at: number,
    entries: ModelEntry[],
  ): void {
    for (const e of entries) {
      const byClient = model.get(e.u) ?? new Map<string, ModelVote>()
      byClient.set(clientId, { loc: e.loc, src: e.src, acc: e.acc, seenAt: at })
      model.set(e.u, byClient)
    }
    for (const byClient of model.values()) {
      const oldestFirst = [...byClient].sort(
        ([, a], [, b]) => a.seenAt - b.seenAt,
      )
      for (const [cid] of oldestFirst.slice(
        0,
        Math.max(0, byClient.size - VOTE_CAP),
      ))
        byClient.delete(cid)
    }
  }

  function modelPrune(model: Model, cutoff: number): void {
    for (const [u, byClient] of model) {
      for (const [cid, v] of byClient)
        if (v.seenAt < cutoff) byClient.delete(cid)
      if (byClient.size === 0) model.delete(u)
    }
  }

  interface ModelEntry {
    u: string
    loc: string | null
    src: string | null
    acc: boolean
  }
  type Step =
    | {
        kind: 'contribute'
        day: number
        clientId: string
        entries: ModelEntry[]
      }
    | { kind: 'prune'; day: number; chunkRows: number }

  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({
      kind: fc.constant('contribute' as const),
      day: fc.integer({ min: 0, max: 150 }),
      clientId: fc.constantFrom(
        ...Array.from({ length: 13 }, (_, i) => `c${i}`),
      ),
      entries: fc.array(
        fc.record({
          u: fc.constantFrom('a', 'b', 'c'),
          loc: fc.constantFrom('Peru', 'Chile', 'Japan', null),
          src: fc.constantFrom('web', 'Peru App Store', null),
          acc: fc.boolean(),
        }),
        { minLength: 1, maxLength: 3 },
      ),
    }),
    fc.record({
      kind: fc.constant('prune' as const),
      day: fc.integer({ min: 0, max: 150 }),
      chunkRows: fc.integer({ min: 1, max: 4 }),
    }),
  )

  it('keeps every label a vote points at, and serves what the newest contributors sent', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const start = Date.UTC(2026, 0, 1)
    await fc.assert(
      fc.asyncProperty(fc.array(step, { maxLength: 25 }), async (steps) => {
        const target = openDatabase({ path: ':memory:', cacheMb: 8, mmapMb: 0 })
        env = { DB: target }
        __resetContribLimit()
        const model: Model = new Map()
        try {
          for (const [i, s] of steps.entries()) {
            // Days go back and forth; the step index keeps every time distinct.
            const at = start + s.day * DAY + i
            vi.setSystemTime(at)
            if (s.kind === 'contribute') {
              await contribute(s.clientId, s.entries)
              modelContribute(model, s.clientId, at, s.entries)
            } else {
              await pruneExpired(env, at, {
                chunkRows: s.chunkRows,
                pause: async () => {},
              })
              modelPrune(model, at - VOTE_RETENTION_MS)
            }
            expect(danglingLabelIds(target)).toBe(0)
          }
          expect(await lookup(['a', 'b', 'c'])).toEqual(expectedServed(model))
        } finally {
          target.close()
        }
      }),
      { numRuns: 150 },
    )
  })
})

describe('sqlite backend - /v1/stats', () => {
  async function servedCount(): Promise<number> {
    const resp = await worker.fetch(
      new Request('http://cache.test/v1/stats'),
      env,
    )
    return ((await resp.json()) as { profiles: number }).profiles
  }

  it('counts once before the first pass, and contributions do not move it', async () => {
    await contribute('client-a', [
      { u: 'one', loc: 'Peru', src: 'web' },
      { u: 'two', loc: 'Peru', src: 'web' },
    ])
    await contribute('client-b', [{ u: 'two', loc: 'Chile', src: 'web' }])
    expect(await servedCount()).toBe(2)

    await contribute('client-a', [{ u: 'three', loc: 'Peru', src: 'web' }])
    expect(await servedCount()).toBe(2)
  })

  it('serves the usernames a pass left with a vote', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('client-a', [{ u: 'stale', loc: 'Peru', src: 'web' }])
    vi.setSystemTime(new Date('2026-04-01T00:00:00Z'))
    await contribute('client-a', [{ u: 'fresh', loc: 'Peru', src: 'web' }])
    await contribute('client-b', [
      { u: 'fresh', loc: 'Peru', src: 'web' },
      { u: 'other', loc: 'Peru', src: 'web' },
    ])
    expect(await servedCount()).toBe(3)

    await pruneExpired(env, Date.now(), yieldingScan({ chunkRows: 1 }))
    expect(await servedCount()).toBe(2)
  })

  it('moves only when a recount walks the votes, then serves the usernames with a vote', async () => {
    await contribute('client-a', [{ u: 'one', loc: 'Peru', src: 'web' }])
    expect(await servedCount()).toBe(1)

    await contribute('client-a', [
      { u: 'two', loc: 'Peru', src: 'web' },
      { u: 'three', loc: 'Peru', src: 'web' },
    ])
    await contribute('client-b', [{ u: 'two', loc: 'Chile', src: 'web' }])
    expect(await servedCount()).toBe(1)

    expect(await recountProfiles(env, yieldingScan({ chunkRows: 1 }))).toBe(3)
    expect(await servedCount()).toBe(3)
  })

  it('recounts in chunks to what one statement counts', async () => {
    // One to three votes a username, so a chunk often ends inside a username.
    const usernames = ['ann', 'bob', 'cy', 'dee', 'eve']
    for (const [i, client] of ['c1', 'c2', 'c3'].entries()) {
      await contribute(
        client,
        usernames.slice(i).map((u) => ({ u, loc: 'Peru', src: 'web' })),
      )
    }
    expect(await recountProfiles(env, WHOLE_TABLE)).toBe(usernames.length)

    for (const chunkRows of [1, 2, 3, 5]) {
      let pauses = 0
      const pause = async () => void pauses++
      expect(await recountProfiles(env, { chunkRows, pause })).toBe(
        usernames.length,
      )
      expect(await servedCount()).toBe(usernames.length)
      // At one row a chunk, each range is one whole username.
      if (chunkRows === 1) expect(pauses).toBe(usernames.length)
    }
  })

  async function maxAgeMs(): Promise<number> {
    const resp = await worker.fetch(
      new Request('http://cache.test/v1/stats'),
      env,
    )
    return (
      Number(/max-age=(\d+)/.exec(resp.headers.get('cache-control')!)![1]) *
      1000
    )
  }

  it('recounts on a Worker request once the number is as old as its max-age', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    await contribute('client-a', [{ u: 'one', loc: 'Peru', src: 'web' }])
    const ttl = await maxAgeMs()
    await contribute('client-a', [{ u: 'two', loc: 'Peru', src: 'web' }])

    vi.advanceTimersByTime(ttl - 1)
    expect(await servedCount()).toBe(1)
    vi.advanceTimersByTime(1)
    expect(await servedCount()).toBe(2)
  })

  it('never recounts on a request where walks own the number', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    env = { ...env, profilesCountedByWalks: true }
    await contribute('client-a', [{ u: 'one', loc: 'Peru', src: 'web' }])
    expect(await servedCount()).toBe(1)
    await contribute('client-a', [{ u: 'two', loc: 'Peru', src: 'web' }])

    vi.advanceTimersByTime(30 * DAY)
    expect(await servedCount()).toBe(1)
    await recountProfiles(env, WHOLE_TABLE)
    expect(await servedCount()).toBe(2)
  })
})

describe('sqlite backend - chunked retention', () => {
  const NOW = Date.parse('2026-06-01T00:00:00Z')
  const CUTOFF = NOW - VOTE_RETENTION_MS

  interface SeedVote {
    user: string
    client: string
    /** From the cutoff: below zero is expired, zero and above is kept. */
    offset: number
    isHole: boolean
  }
  interface SeedLabel {
    text: string
    offset: number
  }
  interface SeedTable {
    votes: SeedVote[]
    labels: SeedLabel[]
  }

  /** Holes are deleted once everything is in, so range edges land next to
   *  usernames that are gone. */
  function seededDb(table: SeedTable): SqliteDb {
    const target = openDatabase({ path: ':memory:', cacheMb: 8, mmapMb: 0 })
    const vote = target.raw.prepare(
      'INSERT INTO location_votes (username, client_id, seen_at) VALUES (?, ?, ?)',
    )
    const label = target.raw.prepare(
      'INSERT INTO labels (text, used_at) VALUES (?, ?)',
    )
    for (const v of table.votes) vote.run(v.user, v.client, CUTOFF + v.offset)
    for (const l of table.labels) label.run(l.text, CUTOFF + l.offset)
    const dropVote = target.raw.prepare(
      'DELETE FROM location_votes WHERE username = ? AND client_id = ?',
    )
    for (const v of table.votes.filter((row) => row.isHole))
      dropVote.run(v.user, v.client)
    return target
  }

  function remaining(target: SqliteDb): { votes: unknown[]; labels: string[] } {
    return {
      votes: target.raw
        .prepare(
          "SELECT username || '/' || client_id FROM location_votes ORDER BY username, client_id",
        )
        .pluck()
        .all(),
      labels: labelTexts(target),
    }
  }

  // Few names, so usernames collect several votes and some votes outlive others.
  const seedTable: fc.Arbitrary<SeedTable> = fc.record({
    votes: fc.uniqueArray(
      fc.record({
        user: fc.constantFrom('a', 'b', 'c', 'd'),
        client: fc.constantFrom('c1', 'c2', 'c3'),
        offset: fc.constantFrom(-DAY, -1, 0, 1),
        isHole: fc.boolean(),
      }),
      { selector: (v) => `${v.user}/${v.client}` },
    ),
    labels: fc.uniqueArray(
      fc.record({
        text: fc.constantFrom('Peru', 'web', 'Chile'),
        offset: fc.constantFrom(-DAY, -1, 0, 1),
      }),
      { selector: (l) => l.text },
    ),
  })

  /** Retention as single statements, no range walk, so a bug in scan.ts
   *  cannot hide in the answer it is compared with. */
  function pruneInStatements(target: SqliteDb): {
    deleted: number
    profiles: number
  } {
    const { changes } = target.raw
      .prepare('DELETE FROM location_votes WHERE seen_at < ?')
      .run(CUTOFF)
    target.raw.prepare('DELETE FROM labels WHERE used_at < ?').run(CUTOFF)
    const profiles = target.raw
      .prepare('SELECT COUNT(DISTINCT username) FROM location_votes')
      .pluck()
      .get() as number
    return { deleted: changes, profiles }
  }

  it('deletes and counts what single statements do, at any chunk size', async () => {
    await fc.assert(
      fc.asyncProperty(
        seedTable,
        fc.integer({ min: 1, max: 16 }),
        async (table, chunkRows) => {
          const whole = seededDb(table)
          const chunked = seededDb(table)
          try {
            const expected = pruneInStatements(whole)
            const policy: ScanPolicy = { chunkRows, pause: async () => {} }
            expect(await pruneExpired({ DB: chunked }, NOW, policy)).toEqual(
              expected,
            )
            expect(remaining(chunked)).toEqual(remaining(whole))
          } finally {
            whole.close()
            chunked.close()
          }
        },
      ),
      { numRuns: 300 },
    )
  })

  function contributeTo(target: SqliteDb, u: string, clientId: string) {
    return worker.fetch(
      new Request('http://cache.test/v1/loc', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId,
          entries: [{ u, loc: 'Peru', src: 'web' }],
        }),
      }),
      { DB: target },
    )
  }

  it('ends where contributing first and pruning after would, with contributions between chunks', async () => {
    // Between chunks on Node a contribution can land anywhere in the walk. Its
    // vote and labels are never expired, so the end state cannot depend on where.
    const midWalk = fc.array(
      fc.record({
        u: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
        clientId: fc.constantFrom('c1', 'c2', 'c3'),
      }),
      { maxLength: 8 },
    )
    await fc.assert(
      fc.asyncProperty(
        seedTable,
        midWalk,
        fc.integer({ min: 1, max: 6 }),
        async (table, contributions, chunkRows) => {
          const oracle = seededDb(table)
          const chunked = seededDb(table)
          try {
            for (const c of contributions)
              await contributeTo(oracle, c.u, c.clientId)
            pruneInStatements(oracle)

            const queue = [...contributions]
            const pause = async () => {
              const next = queue.shift()
              if (next) await contributeTo(chunked, next.u, next.clientId)
            }
            await pruneExpired({ DB: chunked }, NOW, { chunkRows, pause })
            for (const c of queue) await contributeTo(chunked, c.u, c.clientId)
            expect(remaining(chunked)).toEqual(remaining(oracle))
          } finally {
            oracle.close()
            chunked.close()
          }
        },
      ),
      { numRuns: 200 },
    )
  })

  it('reads every range of location_votes with an index seek, the bounds included', async () => {
    // A walk that opens with a full scan holds the event loop for that scan,
    // which is the stall the chunks exist to avoid.
    // Fresh, so retention leaves rows behind and the stats walk has ranges
    // to read.
    const target = seededDb({
      votes: ['a', 'b'].map((user) => ({
        user,
        client: 'c1',
        offset: DAY,
        isHole: false,
      })),
      labels: [],
    })
    const { db: recorded, prepared } = recording(target)
    const policy: ScanPolicy = { chunkRows: 1, pause: async () => {} }
    await pruneExpired({ DB: recorded }, NOW, policy)
    await countTotals(recorded, NOW, policy)
    await recountProfiles({ DB: recorded }, policy)

    // The last username and where each range ends; then the vote DELETE, the
    // range count, the labels DELETE and the stats walk's installs read. The
    // recount prepares nothing the other two walks do not.
    expect(prepared.size).toBe(6)
    for (const sql of prepared) {
      const scans = planOf(target, sql).filter(
        (detail) => detail.startsWith('SCAN') && detail !== 'SCAN CONSTANT ROW',
      )
      // Exempt by design: labels held ~700 rows on 2026-11-09, read once a day,
      // and an index on used_at would add a write to every contribution.
      if (sql.startsWith('DELETE FROM labels')) {
        expect(scans).toEqual(['SCAN labels'])
        continue
      }
      expect({ sql, scans }).toEqual({ sql, scans: [] })
    }
    target.close()
  })

  /** Event-loop turns taken while a pass runs, and the pauses it asked for. */
  async function turnsDuring(policy: ScanPolicy): Promise<[number, number]> {
    const users = Array.from({ length: 20 }, (_, i) => `u${i}`)
    const target = seededDb({
      votes: users.map((user, i) => ({
        user,
        client: 'c1',
        offset: i % 2 ? -1 : 1,
        isHole: false,
      })),
      labels: [],
    })
    let pauses = 0
    const counted: ScanPolicy = {
      chunkRows: policy.chunkRows,
      pause: () => {
        pauses++
        return policy.pause()
      },
    }
    let turns = 0
    let isDone = false
    const tick = (): void => {
      if (isDone) return
      turns++
      setImmediate(tick)
    }
    setImmediate(tick)
    await pruneExpired({ DB: target }, NOW, counted)
    isDone = true
    target.close()
    return [turns, pauses]
  }

  it('gives the event loop a turn between chunks once a slice is spent', async () => {
    const [turns, pauses] = await turnsDuring(
      yieldingScan({ chunkRows: 1, sliceMs: 0 }),
    )
    expect(pauses).toBe(20) // one per vote
    expect(turns).toBeGreaterThanOrEqual(pauses - 1)

    // Inside a slice, and in one statement, the pass keeps the loop throughout.
    expect(
      (await turnsDuring(yieldingScan({ chunkRows: 1, sliceMs: 60_000 })))[0],
    ).toBe(0)
    expect((await turnsDuring(WHOLE_TABLE))[0]).toBe(0)
  })
})

describe('sqlite backend - batch lookup', () => {
  it('finds the asked usernames by the votes primary key', async () => {
    await contribute('client-a', [{ u: 'alice', loc: 'Peru', src: 'web' }])
    const { db: recorded, prepared } = recording(db)
    await worker.fetch(
      new Request('http://cache.test/v1/loc/batch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ usernames: ['alice', 'bob'] }),
      }),
      { DB: recorded },
    )

    expect(prepared.size).toBe(1)
    const plan = planOf(db, [...prepared][0]!)
    expect(plan.some((d) => d.includes('USING PRIMARY KEY (username=?)'))).toBe(
      true,
    )
    expect(plan.filter((d) => d.startsWith('SCAN'))).toEqual([])
  })
})

describe('sqlite backend - table layout', () => {
  it('creates location_votes without a rowid', () => {
    // Its primary key is then the table, not a second b-tree of the same keys.
    // The measurement is under "Tables" in CLAUDE.md.
    const layouts = db.raw
      .prepare(
        "SELECT name, wr FROM pragma_table_list WHERE schema = 'main' AND name = 'location_votes'",
      )
      .all()
    expect(layouts).toEqual([{ name: 'location_votes', wr: 1 }])
  })

  it('refuses a file in the layout from before votes-only, and leaves it as it was', () => {
    // Served by this code, its profiles would all read as "no location" while
    // /healthz stayed green, so update.ts would never roll back.
    const dir = mkdtempSync(join(tmpdir(), 'xloc-old-'))
    const path = join(dir, 'old.db')
    const old = new Database(path)
    old.exec(`CREATE TABLE profiles (
        username TEXT PRIMARY KEY, location TEXT, source TEXT,
        location_accurate INTEGER NOT NULL DEFAULT 1,
        location_confidence INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL DEFAULT 0
      ) WITHOUT ROWID;
      CREATE TABLE location_votes (
        username TEXT NOT NULL, client_id TEXT NOT NULL, location TEXT, source TEXT,
        location_accurate INTEGER NOT NULL DEFAULT 1, seen_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (username, client_id)
      ) WITHOUT ROWID;
      INSERT INTO profiles (username, location) VALUES ('jack', 'Japan');
      INSERT INTO location_votes (username, client_id, location) VALUES ('jack', 'c1', 'Japan');`)
    old.close()
    const before = readFileSync(path)
    try {
      expect(() => openDatabase({ path, cacheMb: 8, mmapMb: 0 })).toThrow(
        /deploy\/vacuum\.ts/,
      )
      expect(readFileSync(path).equals(before)).toBe(true)
      const after = new Database(path, { readonly: true })
      const tables = after
        .prepare(
          "SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name",
        )
        .pluck()
        .all()
      after.close()
      expect(tables).toEqual(['location_votes', 'profiles'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('sqlite adapter', () => {
  it('truncates the WAL without waiting on a reader that holds a snapshot', () => {
    // The backup's VACUUM INTO is such a reader for up to minutes; waiting out
    // busy_timeout there would hold the event loop for 5 s.
    const dir = mkdtempSync(join(tmpdir(), 'x-loc-wal-'))
    const path = join(dir, 'x-loc-cache.db')
    const writer = openDatabase({ path, cacheMb: 8, mmapMb: 0 })
    const reader = new Database(path)
    try {
      const vote = writer.raw.prepare(
        "INSERT INTO location_votes (username, client_id) VALUES (?, 'c1')",
      )
      vote.run('a')
      reader.prepare('BEGIN').run()
      reader.prepare('SELECT COUNT(*) FROM location_votes').get()
      vote.run('b')

      const startedAt = performance.now()
      writer.truncateWal()
      expect(performance.now() - startedAt).toBeLessThan(1000)
      expect(writer.raw.pragma('busy_timeout', { simple: true })).toBe(5000)

      // With the reader gone, the next call empties the WAL.
      reader.prepare('COMMIT').run()
      writer.truncateWal()
      expect(statSync(`${path}-wal`).size).toBe(0)
    } finally {
      reader.close()
      writer.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('applies the tuning pragmas', () => {
    const wal = db.raw.pragma('journal_mode', { simple: true })
    expect(wal).toBe('memory') // :memory: databases cannot use WAL
    expect(db.raw.pragma('synchronous', { simple: true })).toBe(1) // NORMAL
    // Negative cache_size is a KiB budget, not a page count.
    expect(db.raw.pragma('cache_size', { simple: true })).toBe(-8 * 1024)
  })

  it('rolls back the whole batch when one statement fails', async () => {
    await contribute('client-a', [{ u: 'eve', loc: 'Kenya', src: 'web' }])
    const before = voteCount('eve')

    await expect(
      db.batch([
        db.prepare('DELETE FROM location_votes WHERE username = ?').bind('eve'),
        db
          .prepare('INSERT INTO labels (text, used_at) VALUES (?, ?)')
          .bind('x'),
      ]),
    ).rejects.toThrow()

    expect(voteCount('eve')).toBe(before)
  })
})
