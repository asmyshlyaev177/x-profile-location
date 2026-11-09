// A database in the layout before votes-only, for the tests of its conversion.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import Database from 'better-sqlite3'

export interface OldVote {
  username: string
  client_id: string
  location: string | null
  source: string | null
  location_accurate: number
  seen_at: number
}

const T = Date.UTC(2026, 10, 1)

// The values that copy least obviously: NULLs, a false flag, one string used
// as both a location and a source, and a profile left with no vote at all.
export const OLD_VOTES: OldVote[] = [
  {
    username: 'alice',
    client_id: 'c1',
    location: 'Japan',
    source: 'Japan App Store',
    location_accurate: 1,
    seen_at: T + 1,
  },
  {
    username: 'alice',
    client_id: 'c2',
    location: 'Japan',
    source: null,
    location_accurate: 0,
    seen_at: T + 2,
  },
  {
    username: 'bob',
    client_id: 'c1',
    location: null,
    source: null,
    location_accurate: 1,
    seen_at: T + 3,
  },
  {
    username: 'carol',
    client_id: 'c3',
    location: 'Japan',
    source: 'web',
    location_accurate: 1,
    seen_at: T + 4,
  },
  {
    username: 'dave',
    client_id: 'c1',
    location: 'web',
    source: 'Peru',
    location_accurate: 1,
    seen_at: T + 5,
  },
]

export function createOldLayoutDatabase(file: string, votes = OLD_VOTES): void {
  const db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.exec(
    readFileSync(
      join(import.meta.dirname, 'schema-before-votes-only.sql'),
      'utf8',
    ),
  )
  const vote = db.prepare(
    'INSERT INTO location_votes VALUES (@username, @client_id, @location, @source, @location_accurate, @seen_at)',
  )
  const profile = db.prepare(
    'INSERT OR REPLACE INTO profiles VALUES (?, ?, ?, ?, 1, ?)',
  )
  db.transaction(() => {
    for (const v of votes) {
      vote.run(v)
      profile.run(
        v.username,
        v.location,
        v.source,
        v.location_accurate,
        v.seen_at,
      )
    }
    profile.run('nobody-voted', 'Chile', null, 1, T)
  })()
  db.pragma('wal_checkpoint(TRUNCATE)')
  db.close()
}

/** Every vote with its labels resolved, in key order: the old rows' shape. */
export function readVotes(file: string): OldVote[] {
  const db = new Database(file, { readonly: true })
  const isOld = db
    .prepare("SELECT 1 FROM sqlite_master WHERE name = 'profiles'")
    .get()
  const rows = db
    .prepare(
      isOld
        ? 'SELECT * FROM location_votes ORDER BY username, client_id'
        : `SELECT v.username, v.client_id, l.text AS location, s.text AS source, v.location_accurate, v.seen_at
             FROM location_votes v
             LEFT JOIN labels l ON l.id = v.location
             LEFT JOIN labels s ON s.id = v.source
            ORDER BY v.username, v.client_id`,
    )
    .all() as OldVote[]
  db.close()
  return rows
}
