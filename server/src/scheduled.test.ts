import { describe, expect, it, vi } from 'vitest'
import worker, { VOTE_RETENTION_MS as RETENTION_MS, type Env } from './index'

// Minimal D1 stand-in that records the prepared SQL and bound args. Every table
// reports the same last username to the walk in scan.ts.
function mockDb(runResult: unknown = {}) {
  const run = vi.fn().mockResolvedValue(runResult)
  const all = vi.fn().mockResolvedValue({ results: [{ last: 'z' }] })
  const bind = vi.fn((..._args: unknown[]) => ({ run, all }))
  const prepare = vi.fn((_sql: string) => ({ bind, run, all }))
  return { env: { DB: { prepare } } as unknown as Env, prepare, bind, run }
}

/** The vote DELETE binds the username range first, then the cutoff. */
const cutoffOf = (bind: ReturnType<typeof mockDb>['bind']) =>
  bind.mock.calls[0]![2] as number

describe('scheduled - retention cleanup', () => {
  it('deletes votes older than the retention window', async () => {
    const { env, prepare, bind, run } = mockDb()
    const before = Date.now()

    await worker.scheduled(null, env)

    // A DELETE against location_votes filtered on seen_at, then the profiles
    // that DELETE just stripped of their last vote.
    const deletes = prepare.mock.calls
      .map(([sql]) => sql)
      .filter((sql) => sql.startsWith('DELETE'))
    expect(deletes).toHaveLength(2)
    expect(deletes[0]).toContain('DELETE FROM location_votes')
    expect(deletes[0]).toContain('seen_at < ?')
    expect(deletes[1]).toContain('DELETE FROM profiles')
    expect(deletes[1]).toContain('NOT EXISTS')
    expect(run).toHaveBeenCalledTimes(2)

    // Cutoff is "now minus 60 days", evaluated at call time.
    const cutoff = cutoffOf(bind)
    expect(cutoff).toBeGreaterThanOrEqual(before - RETENTION_MS)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - RETENTION_MS)
  })

  it('never deletes rows within the retention window (cutoff is strictly in the past)', async () => {
    const { env, bind } = mockDb()
    await worker.scheduled(null, env)
    // A vote seen "now" is well above the cutoff, so it survives.
    expect(cutoffOf(bind)).toBeLessThan(Date.now())
  })

  it('keeps D1 to one DELETE per table however many rows it holds', async () => {
    // D1 caps the queries one Worker invocation may run, so the chunked walk
    // the Node server uses would fail there once a table grew past a few. That
    // walk also asks where each range ends, which is what the count catches:
    // per table, its last username and one DELETE, nothing else.
    const { env, prepare, run } = mockDb()
    await worker.scheduled(null, env)
    expect(run).toHaveBeenCalledTimes(2)
    expect(prepare).toHaveBeenCalledTimes(4)
  })

  // The count node-server.ts logs - votes deleted, not profiles expired. The two backends report it in different
  // shapes, and neither is guaranteed by db-types.ts, so an unreadable result
  // must degrade to 0 rather than throw - the log line is not worth failing a
  // cleanup over.
  describe('deleted-row count', () => {
    it("reads D1's nested meta.changes", async () => {
      const { env } = mockDb({ success: true, meta: { changes: 42 } })
      expect(await worker.scheduled(null, env)).toBe(42)
    })

    it("reads better-sqlite3's flat changes", async () => {
      const { env } = mockDb({ changes: 7, lastInsertRowid: 0 })
      expect(await worker.scheduled(null, env)).toBe(7)
    })

    it('reports 0 for a result shape it does not recognise', async () => {
      for (const shape of [{}, null, undefined, 5, 'ok', { changes: '3' }]) {
        const { env } = mockDb(shape)
        expect(await worker.scheduled(null, env)).toBe(0)
      }
    })
  })
})
