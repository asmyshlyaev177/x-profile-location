import { setTimeout as sleep } from 'node:timers/promises'
import { describe, expect, it } from 'vitest'
import { oneAtATime } from './scan.ts'

describe('oneAtATime', () => {
  const job = (log: string[], name: string, ms: number) => async () => {
    log.push(`${name} start`)
    await sleep(ms)
    log.push(`${name} end`)
  }

  it('runs jobs in order and never two at once', async () => {
    const run = oneAtATime()
    const log: string[] = []
    const first = run('retention', job(log, 'retention', 20))
    const second = run('stats', job(log, 'stats', 0))
    await Promise.all([first, second])
    expect(log).toEqual([
      'retention start',
      'retention end',
      'stats start',
      'stats end',
    ])
  })

  it('skips a job whose last run is still waiting or running', async () => {
    const run = oneAtATime()
    const log: string[] = []
    const running = run('retention', job(log, 'retention', 20))
    expect(run('retention', job(log, 'again', 0))).toBeUndefined()
    await running
    // Once it has finished, the same job queues again.
    await run('retention', job(log, 'later', 0))
    expect(log).toEqual([
      'retention start',
      'retention end',
      'later start',
      'later end',
    ])
  })

  it('runs the next job after one throws', async () => {
    const run = oneAtATime()
    const log: string[] = []
    const failing = run('retention', async () => {
      throw new Error('disk full')
    })
    await run('stats', job(log, 'stats', 0))
    await failing
    expect(log).toEqual(['stats start', 'stats end'])
  })
})
