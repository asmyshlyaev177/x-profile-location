// Full-table work split into rowid ranges, so a long scan can give way between
// them. Backend-agnostic: index.ts runs it on D1 as well as on better-sqlite3.

import type { Db } from './db-types.ts'

export interface ScanPolicy {
  /** Rows of rowid space per statement. */
  chunkRows: number
  /** Awaited after every chunk; the Node server gives its event loop a turn. */
  pause: () => Promise<void>
}

/** One statement per table, for D1: it caps the queries a Worker invocation
 *  may run, and a long query there blocks nothing. */
export const WHOLE_TABLE: ScanPolicy = {
  chunkRows: Number.MAX_SAFE_INTEGER,
  pause: async () => {},
}

export type ScannedTable = 'profiles' | 'location_votes'

/** Calls `visit` over consecutive rowid ranges covering the table as it stood
 *  when the walk began. A row inserted since has a higher rowid and is left
 *  for the next walk; rowids never change under UPDATE. */
export async function forEachRowidRange(
  db: Db,
  table: ScannedTable,
  policy: ScanPolicy,
  visit: (lo: number, hi: number) => Promise<void>,
): Promise<void> {
  // One subquery per bound: SQLite answers a lone MIN or MAX with a seek, but
  // both in one SELECT make it scan the whole table first.
  const { results } = await db
    .prepare(
      `SELECT (SELECT MIN(rowid) FROM ${table}) AS lo, (SELECT MAX(rowid) FROM ${table}) AS hi`,
    )
    .all<{ lo: number | null; hi: number | null }>()
  const first = results?.[0]?.lo
  const last = results?.[0]?.hi
  if (first == null || last == null) return
  for (let lo = first; lo <= last; lo += policy.chunkRows) {
    await visit(lo, Math.min(lo + policy.chunkRows - 1, last))
    await policy.pause()
  }
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
