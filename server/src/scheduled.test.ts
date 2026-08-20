import { describe, expect, it, vi } from 'vitest'
import worker, { VOTE_RETENTION_MS as RETENTION_MS, type Env } from './index'

// Minimal D1 stand-in that records the prepared SQL and bound args.
function mockDb(runResult: unknown = {}) {
  const run = vi.fn().mockResolvedValue(runResult)
  const bind = vi.fn((..._args: unknown[]) => ({ run }))
  const prepare = vi.fn((_sql: string) => ({ bind, run }))
  return { env: { DB: { prepare } } as unknown as Env, prepare, bind, run }
}

describe('scheduled — retention cleanup', () => {
  it('deletes votes older than the retention window', async () => {
    const { env, prepare, bind, run } = mockDb()
    const before = Date.now()

    await worker.scheduled(null, env)

    // A DELETE against location_votes filtered on seen_at, then the profiles
    // that DELETE just stripped of their last vote.
    expect(prepare).toHaveBeenCalledTimes(2)
    const sql = prepare.mock.calls[0][0]
    expect(sql).toContain('DELETE FROM location_votes')
    expect(sql).toContain('seen_at < ?')
    const orphans = prepare.mock.calls[1][0]
    expect(orphans).toContain('DELETE FROM profiles')
    expect(orphans).toContain('NOT EXISTS')
    expect(run).toHaveBeenCalledTimes(2)

    // Cutoff is "now minus 60 days", evaluated at call time.
    const cutoff = bind.mock.calls[0][0] as number
    expect(cutoff).toBeGreaterThanOrEqual(before - RETENTION_MS)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - RETENTION_MS)
  })

  it('never deletes rows within the retention window (cutoff is strictly in the past)', async () => {
    const { env, bind } = mockDb()
    await worker.scheduled(null, env)
    const cutoff = bind.mock.calls[0][0] as number
    // A vote seen "now" is well above the cutoff, so it survives.
    expect(cutoff).toBeLessThan(Date.now())
  })

  // The count node-server.ts logs — votes deleted, not profiles expired. The two backends report it in different
  // shapes, and neither is guaranteed by db-types.ts, so an unreadable result
  // must degrade to 0 rather than throw — the log line is not worth failing a
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
