import type { ChildProcess } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'
import { afterEach, describe, expect, it } from 'vitest'
import { BUNDLE, BUNDLE_OPTIONS } from '../build.ts'
import { freePort, startServer, stopServer } from './test-helpers.ts'

// The service runs the committed bundle, never src/: a change built into no
// bundle deploys nothing, and one the bundle cannot run deploys an outage.

async function startBundle(
  port: number,
  dbPath: string,
): Promise<ChildProcess> {
  // Stripping off, so a .ts file left un-bundled fails here instead of quietly
  // loading Node's type stripper in production.
  const server = await startServer(['--no-experimental-strip-types', BUNDLE], {
    XLOC_PORT: String(port),
    XLOC_DB: dbPath,
  })
  return server.child
}

function post(port: number, path: string, body: unknown): Promise<Response> {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('dist/node-server.js', () => {
  let dir: string | null = null
  let child: ChildProcess | null = null

  afterEach(() => {
    child?.kill('SIGKILL')
    child = null
    if (dir) rmSync(dir, { recursive: true, force: true })
    dir = null
  })

  it('is what `pnpm build` makes of src/ today', async () => {
    const { outputFiles } = await build({ ...BUNDLE_OPTIONS, write: false })
    const isFresh = readFileSync(BUNDLE, 'utf8') === outputFiles[0]!.text
    expect(isFresh, 'stale: run `pnpm build` in server/').toBe(true)
  })

  it('serves a contribution and a lookup under plain node', async () => {
    dir = mkdtempSync(join(tmpdir(), 'x-loc-bundle-'))
    const port = await freePort()
    child = await startBundle(port, join(dir, 'x-loc-cache.db'))

    const health = await fetch(`http://127.0.0.1:${port}/healthz`)
    expect(await health.text()).toBe('ok')

    const vote = { u: 'Jack', loc: 'United States', src: 'web', acc: true }
    for (const clientId of ['install-a', 'install-b']) {
      const r = await post(port, '/v1/loc', { clientId, entries: [vote] })
      expect(await r.json()).toEqual({ ok: true })
    }
    const lookup = await post(port, '/v1/loc/batch', { usernames: ['jack'] })
    expect(await lookup.json()).toEqual({
      profiles: [
        { u: 'jack', loc: 'United States', src: 'web', acc: true, conf: 2 },
      ],
    })

    expect(await stopServer(child)).toBe(0)
  })
})
