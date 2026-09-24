import { mkdtempSync, rmSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  freePort,
  startServer,
  stopServer,
  type ServerProcess,
} from './test-helpers'

// Drives src/node-server.ts over HTTP and reads the stats line it logs on
// shutdown, which is what the operator sees. The adapter, the router and Stats
// each decide part of which counter a request lands in, so no unit test can
// show the whole answer.

/** node:http rather than fetch: fetch normalises the path and refuses TRACE,
 *  and those are exactly the requests the counters got wrong. */
function send(
  port: number,
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<number> {
  return new Promise((done, fail) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers })
    req.on('response', (res) => {
      res.resume()
      res.on('end', () => done(res.statusCode!))
    })
    req.on('error', fail)
    req.end(body === undefined ? undefined : JSON.stringify(body))
  })
}

function statsLine(output: string): Record<string, unknown> {
  const line = output.split('\n').find((l) => l.includes('] stats {'))
  if (line === undefined) throw new Error(`no stats line in:\n${output}`)
  return JSON.parse(line.slice(line.indexOf('{'))) as Record<string, unknown>
}

describe('src/node-server.ts', () => {
  let dir: string | null = null
  let server: ServerProcess | null = null

  afterEach(() => {
    server?.child.kill('SIGKILL')
    server = null
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('counts each request under the route that served it', async () => {
    dir = mkdtempSync(join(tmpdir(), 'x-loc-stats-'))
    const dbPath = join(dir, 'x-loc-cache.db')
    const port = await freePort()
    server = await startServer(
      [
        '--experimental-strip-types',
        join(import.meta.dirname, 'node-server.ts'),
      ],
      { XLOC_PORT: String(port), XLOC_DB: dbPath, XLOC_RATE_LIMIT: '0' },
    )

    // What a browser sends ahead of the extension's JSON POSTs from x.com.
    const preflight = {
      origin: 'https://x.com',
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    }
    const json = { 'content-type': 'application/json' }
    const vote = { u: 'jack', loc: 'Japan', src: 'web', acc: true }
    const jack = { usernames: ['jack'] }
    const statuses = [
      await send(port, 'OPTIONS', '/v1/loc', undefined, preflight),
      await send(
        port,
        'POST',
        '/v1/loc',
        { clientId: 'a', entries: [vote] },
        json,
      ),
      await send(port, 'OPTIONS', '/v1/loc/batch', undefined, preflight),
      await send(port, 'POST', '/v1/loc/batch', jack, json),
      // Lookups too: the router reads the path the URL parser makes of these.
      await send(port, 'POST', '//cdn.example/v1/loc/batch', jack, json),
      await send(port, 'POST', '/v1/x/../loc/batch', jack, json),
      await send(port, 'GET', '/v1/stats'),
      // The API's paths under methods it does not serve, and a scanner.
      await send(port, 'GET', '/v1/loc'),
      await send(port, 'HEAD', '/v1/stats'),
      await send(port, 'POST', '/v1/stats', {}, json),
      await send(port, 'TRACE', '/v1/loc'),
      await send(port, 'OPTIONS', '/wp-login.php'),
    ]
    expect(statuses).toEqual([
      204, 200, 204, 200, 200, 200, 200, 404, 404, 404, 405, 204,
    ])

    expect(await stopServer(server.child)).toBe(0)
    expect(statsLine(server.output())).toMatchObject({
      lookups: 3,
      lookupNames: 3,
      lookupHits: 3,
      contributions: 1,
      contributedEntries: 1,
      users: 1,
      statsReads: 1,
      preflights: 2,
      other: 5,
    })
  })
})
