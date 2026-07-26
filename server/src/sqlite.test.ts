// End-to-end tests for the SQLite backend: real better-sqlite3, real schema,
// driven through the same handlers the Worker runs. This is what proves the
// db-types.ts adapter is a faithful stand-in for D1 — the handler code under
// test is not mocked at any layer.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index.ts'
import { openDatabase, type SqliteDb } from './sqlite.ts'

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

describe('sqlite backend — round trip', () => {
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
    // Rejected by USERNAME_RE before reaching SQL — no rows, no error.
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
    const { mkdtempSync, rmSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
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

describe('sqlite backend — vote cap', () => {
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

describe('sqlite backend — retention', () => {
  it('deletes votes past the window and leaves recent ones', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    await contribute('old-client', [{ u: 'stale', loc: 'Peru', src: 'web' }])

    vi.setSystemTime(new Date('2026-04-01T00:00:00Z')) // > 60 days later
    await contribute('new-client', [{ u: 'fresh', loc: 'Chile', src: 'web' }])

    await worker.scheduled(null, env)

    expect(voteCount('stale')).toBe(0)
    expect(voteCount('fresh')).toBe(1)
    // The consensus row survives its votes — that is deliberate: a profile whose
    // votes aged out keeps serving its last known value until someone re-votes.
    expect((await lookup(['stale']))[0].loc).toBe('Peru')
  })
})

describe('sqlite adapter', () => {
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
