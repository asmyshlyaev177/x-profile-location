import { describe, expect, it, vi } from 'vitest'
import worker, { type Env } from './index'

const RETENTION_MS = 60 * 24 * 60 * 60 * 1000 // must match VOTE_RETENTION_MS

// Minimal D1 stand-in that records the prepared SQL and bound args.
function mockDb() {
  const run = vi.fn().mockResolvedValue({})
  const bind = vi.fn((..._args: unknown[]) => ({ run }))
  const prepare = vi.fn((_sql: string) => ({ bind }))
  return { env: { DB: { prepare } } as unknown as Env, prepare, bind, run }
}

describe('scheduled — retention cleanup', () => {
  it('deletes votes older than the retention window', async () => {
    const { env, prepare, bind, run } = mockDb()
    const before = Date.now()

    await worker.scheduled(
      {} as ScheduledController,
      env,
      {} as ExecutionContext,
    )

    // A single DELETE against location_votes, filtered on seen_at.
    expect(prepare).toHaveBeenCalledTimes(1)
    const sql = prepare.mock.calls[0][0]
    expect(sql).toContain('DELETE FROM location_votes')
    expect(sql).toContain('seen_at < ?')
    expect(run).toHaveBeenCalledTimes(1)

    // Cutoff is "now minus 60 days", evaluated at call time.
    const cutoff = bind.mock.calls[0][0] as number
    expect(cutoff).toBeGreaterThanOrEqual(before - RETENTION_MS)
    expect(cutoff).toBeLessThanOrEqual(Date.now() - RETENTION_MS)
  })

  it('never deletes rows within the retention window (cutoff is strictly in the past)', async () => {
    const { env, bind } = mockDb()
    await worker.scheduled(
      {} as ScheduledController,
      env,
      {} as ExecutionContext,
    )
    const cutoff = bind.mock.calls[0][0] as number
    // A vote seen "now" is well above the cutoff, so it survives.
    expect(cutoff).toBeLessThan(Date.now())
  })
})
