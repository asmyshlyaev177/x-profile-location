// End-to-end tests for the SQLite backend: real better-sqlite3, real schema,
// driven through the same handlers the Worker runs. This is what proves the
// db-types.ts adapter is a faithful stand-in for D1 - the handler code under
// test is not mocked at any layer.

import Database from 'better-sqlite3'
import fc from 'fast-check'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from './db-types.ts'
import worker, { pruneExpired, VOTE_RETENTION_MS, type Env } from './index.ts'
import { WHOLE_TABLE, type ScanPolicy } from './scan.ts'
import { openDatabase, yieldingScan, type SqliteDb } from './sqlite.ts'
import { countTotals } from './stats.ts'

let db: SqliteDb
let env: Env

beforeEach(() => {
  db = openDatabase({ path: ':memory:', cacheMb: 8, mmapMb: 0 })
  env = { DB: db }
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

function post(path: string, body: unknown): Promise<Response> {
  return worker.fetch(
    new Request(`http://cache.test${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
): Promise<void> {
  const resp = await post('/v1/loc', { clientId, entries })
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

function profileCount(username: string): number {
  return (
    db.raw
      .prepare('SELECT COUNT(*) AS n FROM profiles WHERE username = ?')
      .get(username) as { n: number }
  ).n
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
  it('lets votes accumulate through the slack, then prunes to the cap', async () => {
    vi.useFakeTimers()
    // Distinct timestamps so "newest wins" eviction is deterministic.
    for (let i = 0; i < 15; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
      await contribute(`client-${i}`, [
        { u: 'popular', loc: 'Spain', src: 'web' },
      ])
    }
    // 15 = VOTE_CAP (10) + VOTE_CAP_SLACK (5): still under the prune trigger.
    expect(voteCount('popular')).toBe(15)

    vi.setSystemTime(new Date(2026, 0, 1, 0, 0, 15))
    await contribute('client-15', [{ u: 'popular', loc: 'Spain', src: 'web' }])
    expect(voteCount('popular')).toBe(10)

    // The survivors are the ten most recent clients.
    const survivors = db.raw
      .prepare('SELECT client_id FROM location_votes WHERE username = ?')
      .all('popular') as { client_id: string }[]
    expect(new Set(survivors.map((r) => r.client_id))).toEqual(
      new Set(Array.from({ length: 10 }, (_, i) => `client-${i + 6}`)),
    )
  })

  it('caps served confidence and keeps serving the value', async () => {
    vi.useFakeTimers()
    for (let i = 0; i < 20; i++) {
      vi.setSystemTime(new Date(2026, 0, 1, 0, 0, i))
      await contribute(`client-${i}`, [
        { u: 'popular', loc: 'Spain', src: 'web' },
      ])
    }
    const [p] = await lookup(['popular'])
    expect(p.loc).toBe('Spain')
    expect(p.conf).toBeLessThanOrEqual(15)
    expect(p.conf).toBeGreaterThanOrEqual(10)
    expect(voteCount('popular')).toBeLessThanOrEqual(15)
  })

  it('counts the cap per username, not globally', async () => {
    for (let i = 0; i < 16; i++) {
      await contribute(`client-${i}`, [
        { u: 'one', loc: 'Italy', src: 'web' },
        { u: 'two', loc: 'Italy', src: 'web' },
      ])
    }
    expect(voteCount('one')).toBe(10)
    expect(voteCount('two')).toBe(10)
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
    expect(await worker.scheduled(null, env)).toBe(1)

    expect(voteCount('stale')).toBe(0)
    expect(voteCount('fresh')).toBe(1)
    // A profile left with no votes goes with them - that is what sends the next
    // reader to X for a fresh value.
    expect(profileCount('stale')).toBe(0)
    expect(await lookup(['stale'])).toEqual([])
    expect((await lookup(['fresh']))[0].loc).toBe('Chile')

    // ...and the next contribution rebuilds the row.
    await contribute('new-client', [{ u: 'stale', loc: 'Peru', src: 'web' }])
    expect((await lookup(['stale']))[0].loc).toBe('Peru')
  })

  it('keeps a profile whose other vote is still inside the window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('client-a', [{ u: 'mixed', loc: 'Peru', src: 'web' }])
    vi.setSystemTime(new Date('2026-02-01T00:00:00Z'))
    await contribute('client-b', [{ u: 'mixed', loc: 'Peru', src: 'web' }])
    expect((await lookup(['mixed']))[0].conf).toBe(2)

    // Past the window for the January vote, inside it for the February one.
    vi.setSystemTime(new Date('2026-03-15T00:00:00Z'))
    expect(await worker.scheduled(null, env)).toBe(1)

    expect(voteCount('mixed')).toBe(1)
    expect(profileCount('mixed')).toBe(1)
    // Votes expire one at a time and retention does not recompute consensus,
    // so the served confidence overstates until something writes the row again.
    expect((await lookup(['mixed']))[0].conf).toBe(2)

    await contribute('client-b', [{ u: 'mixed', loc: 'Peru', src: 'web' }])
    expect((await lookup(['mixed']))[0].conf).toBe(1)
  })

  it('expires a vote on the far side of the boundary, not on it', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    const contributedAt = Date.now()
    await contribute('client-a', [{ u: 'edge', loc: 'Peru', src: 'web' }])

    // seen_at < now - VOTE_RETENTION_MS: at exactly the window it is not less.
    vi.setSystemTime(contributedAt + VOTE_RETENTION_MS)
    expect(await worker.scheduled(null, env)).toBe(0)
    expect(profileCount('edge')).toBe(1)

    vi.setSystemTime(contributedAt + VOTE_RETENTION_MS + 1)
    expect(await worker.scheduled(null, env)).toBe(1)
    expect(profileCount('edge')).toBe(0)
  })

  it('sweeps a profile that never had a vote', async () => {
    // Nothing writes one today, but a row from before location_votes existed
    // would otherwise be served forever: the vote DELETE cannot orphan what was
    // already orphaned, so the profile DELETE must not be conditional on it.
    db.raw
      .prepare('INSERT INTO profiles (username, location) VALUES (?, ?)')
      .run('voteless', 'Peru')

    expect(await worker.scheduled(null, env)).toBe(0)
    expect(profileCount('voteless')).toBe(0)
  })

  it('touches nothing when every vote is fresh', async () => {
    await contribute('client-a', [{ u: 'recent', loc: 'Peru', src: 'web' }])
    expect(await worker.scheduled(null, env)).toBe(0)
    expect(voteCount('recent')).toBe(1)
    expect(profileCount('recent')).toBe(1)
  })
})

describe('sqlite backend - chunked retention', () => {
  const NOW = Date.parse('2026-06-01T00:00:00Z')
  const CUTOFF = NOW - VOTE_RETENTION_MS
  const DAY = 24 * 60 * 60 * 1000

  interface SeedVote {
    user: string
    client: string
    /** From the cutoff: below zero is expired, zero and above is kept. */
    offset: number
    isHole: boolean
  }
  interface SeedProfile {
    user: string
    isHole: boolean
  }
  interface SeedTable {
    votes: SeedVote[]
    profiles: SeedProfile[]
  }

  /** Holes are deleted once everything is in, so range edges land next to
   *  usernames that are gone. */
  function seededDb(table: SeedTable): SqliteDb {
    const target = openDatabase({ path: ':memory:', cacheMb: 8, mmapMb: 0 })
    const vote = target.raw.prepare(
      'INSERT INTO location_votes (username, client_id, location, seen_at) VALUES (?, ?, ?, ?)',
    )
    const profile = target.raw.prepare(
      'INSERT INTO profiles (username, location, location_confidence) VALUES (?, ?, 1)',
    )
    for (const v of table.votes)
      vote.run(v.user, v.client, 'Peru', CUTOFF + v.offset)
    for (const p of table.profiles) profile.run(p.user, 'Peru')
    const dropVote = target.raw.prepare(
      'DELETE FROM location_votes WHERE username = ? AND client_id = ?',
    )
    const dropProfile = target.raw.prepare(
      'DELETE FROM profiles WHERE username = ?',
    )
    for (const v of table.votes.filter((row) => row.isHole))
      dropVote.run(v.user, v.client)
    for (const p of table.profiles.filter((row) => row.isHole))
      dropProfile.run(p.user)
    return target
  }

  function remaining(target: SqliteDb): {
    votes: unknown[]
    profiles: unknown[]
  } {
    const column = (sql: string) => target.raw.prepare(sql).pluck().all()
    return {
      votes: column(
        "SELECT username || '/' || client_id FROM location_votes ORDER BY username, client_id",
      ),
      profiles: column('SELECT username FROM profiles ORDER BY username'),
    }
  }

  // Few names, so profiles collect several votes and some votes outlive others;
  // 'e' can only ever be a profile without a vote.
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
    profiles: fc.uniqueArray(
      fc.record({
        user: fc.constantFrom('a', 'b', 'c', 'd', 'e'),
        isHole: fc.boolean(),
      }),
      { selector: (p) => p.user },
    ),
  })

  /** Retention as it was before chunking: two statements, no range walk, so
   *  a bug in scan.ts cannot hide in the answer it is compared with. */
  function pruneInTwoStatements(target: SqliteDb): number {
    const { changes } = target.raw
      .prepare('DELETE FROM location_votes WHERE seen_at < ?')
      .run(CUTOFF)
    target.raw
      .prepare(
        'DELETE FROM profiles WHERE NOT EXISTS (SELECT 1 FROM location_votes v WHERE v.username = profiles.username)',
      )
      .run()
    return changes
  }

  it('deletes what the two unchunked statements delete, at any chunk size', async () => {
    await fc.assert(
      fc.asyncProperty(
        seedTable,
        fc.integer({ min: 1, max: 16 }),
        async (table, chunkRows) => {
          const whole = seededDb(table)
          const chunked = seededDb(table)
          try {
            const expected = pruneInTwoStatements(whole)
            const policy: ScanPolicy = { chunkRows, pause: async () => {} }
            expect(await pruneExpired({ DB: chunked }, NOW, policy)).toBe(
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
    // A contribution is two writes, the vote then the profile; between chunks
    // on Node one can land anywhere in the walk. Its vote is never expired, so
    // the end state cannot depend on where it landed.
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
            pruneInTwoStatements(oracle)

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

  it('reads every range with an index seek, the bounds included', async () => {
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
      profiles: ['a', 'b'].map((user) => ({ user, isHole: false })),
    })
    const prepared = new Set<string>()
    const recording: Db = {
      prepare: (sql) => {
        prepared.add(sql)
        return target.prepare(sql)
      },
      batch: (statements) => target.batch(statements),
    }
    const policy: ScanPolicy = { chunkRows: 1, pause: async () => {} }
    await pruneExpired({ DB: recording }, NOW, policy)
    await countTotals(recording, NOW, policy)

    // Per table, its last username and where each range ends. Then two
    // DELETEs and the stats walk's three range reads.
    expect(prepared.size).toBe(9)
    for (const sql of prepared) {
      const binds = Array.from({ length: sql.split('?').length - 1 }, () => 0)
      const plan = target.raw
        .prepare(`EXPLAIN QUERY PLAN ${sql}`)
        .all(...binds) as { detail: string }[]
      const scans = plan.filter(
        (row) =>
          row.detail.startsWith('SCAN') && row.detail !== 'SCAN CONSTANT ROW',
      )
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
      profiles: users.map((user) => ({ user, isHole: false })),
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
    expect(pauses).toBe(40) // one per row of each table
    expect(turns).toBeGreaterThanOrEqual(pauses - 1)

    // Inside a slice, and in one statement, the pass keeps the loop throughout.
    expect(
      (await turnsDuring(yieldingScan({ chunkRows: 1, sliceMs: 60_000 })))[0],
    ).toBe(0)
    expect((await turnsDuring(WHOLE_TABLE))[0]).toBe(0)
  })
})

describe('sqlite backend - table layout', () => {
  it('creates both tables without a rowid', () => {
    // Each primary key is then its table, not a second b-tree of the same keys.
    // The measurement is under "Tables are WITHOUT ROWID" in CLAUDE.md.
    const layouts = db.raw
      .prepare(
        "SELECT name, wr FROM pragma_table_list WHERE schema = 'main' AND name IN ('profiles', 'location_votes') ORDER BY name",
      )
      .all()
    expect(layouts).toEqual([
      { name: 'location_votes', wr: 1 },
      { name: 'profiles', wr: 1 },
    ])
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
      writer.raw.prepare("INSERT INTO profiles (username) VALUES ('a')").run()
      reader.prepare('BEGIN').run()
      reader.prepare('SELECT COUNT(*) FROM profiles').get()
      writer.raw.prepare("INSERT INTO profiles (username) VALUES ('b')").run()

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
        db.prepare('INSERT INTO profiles (username) VALUES (?), (?)').bind('x'),
      ]),
    ).rejects.toThrow()

    expect(voteCount('eve')).toBe(before)
  })
})
