// Walks of location_votes split into username ranges, so a long scan can give
// way between them. Runs on D1 and better-sqlite3.

import type { Db } from './db-types.ts'

export interface ScanPolicy {
  /** Rows per statement, plus the rest of the votes of the username it ends on. */
  chunkRows: number
  /** Awaited after every chunk; the Node server gives its event loop a turn. */
  pause: () => Promise<void>
}

/** One statement per table, for D1: it caps the queries a Worker invocation
 *  may run, and a long query there blocks nothing. */
export const WHOLE_TABLE: ScanPolicy = {
  chunkRows: Infinity,
  pause: async () => {},
}

/** Calls `visit` for each range `username > after AND username <= upTo`, in
 *  order, up to the last username the table held when the walk began. */
export async function forEachUsernameRange(
  db: Db,
  policy: ScanPolicy,
  visit: (after: string, upTo: string) => Promise<void>,
): Promise<void> {
  const { results } = await db
    .prepare('SELECT MAX(username) AS last FROM location_votes')
    .all<{ last: string | null }>()
  const last = results?.[0]?.last ?? null
  if (last === null) return
  const endAfter = rangeEnds(db, last, policy.chunkRows)
  // USERNAME_RE takes one character at least, so every username sorts after ''.
  for (let after = ''; after !== last; ) {
    const upTo = await endAfter(after)
    await visit(after, upTo)
    await policy.pause()
    after = upTo
  }
}

/** The username `rows` rows past `after`, or `last` when fewer are left. */
function rangeEnds(
  db: Db,
  last: string,
  rows: number,
): (after: string) => Promise<string> {
  // WHOLE_TABLE: an OFFSET past the end would step through every row to say so.
  if (!Number.isFinite(rows)) return async () => last
  const sql = `SELECT username FROM location_votes WHERE username > ? AND username <= ?
    ORDER BY username LIMIT 1 OFFSET ?`
  return async (after) => {
    const { results } = await db
      .prepare(sql)
      .bind(after, last, rows - 1)
      .all<{ username: string }>()
    return results?.[0]?.username ?? last
  }
}

export interface RangeCount {
  votes: number
  /** Distinct usernames: a range ends on a whole username, so these sum. */
  profiles: number
}

/** One statement for retention and the stats line, which both count a range. */
export async function countRange(
  db: Db,
  after: string,
  upTo: string,
): Promise<RangeCount> {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS votes, COUNT(DISTINCT username) AS profiles
         FROM location_votes WHERE username > ? AND username <= ?`,
    )
    .bind(after, upTo)
    .all<Partial<RangeCount>>()
  const row = results?.[0]
  return { votes: row?.votes ?? 0, profiles: row?.profiles ?? 0 }
}

/** Runs jobs in order, one at a time, so two full-table walks never interleave
 *  and each reads the state the last one left. A job whose last run is still
 *  waiting or running is skipped (undefined), so a pass slower than its
 *  interval does not stack. Jobs report their own errors. */
export function oneAtATime(): (
  name: string,
  job: () => Promise<void>,
) => Promise<void> | undefined {
  let tail: Promise<void> = Promise.resolve()
  const pending = new Set<string>()
  return (name, job) => {
    if (pending.has(name)) return undefined
    pending.add(name)
    tail = tail
      .then(job)
      .catch(() => {})
      .finally(() => pending.delete(name))
    return tail
  }
}
