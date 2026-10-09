// For the tests that run a server entry point as its own process.

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'

export async function freePort(): Promise<number> {
  const probe = createServer()
  await new Promise<void>((done) => probe.listen(0, '127.0.0.1', done))
  const { port } = probe.address() as { port: number }
  await new Promise((done) => probe.close(done))
  return port
}

export interface ServerProcess {
  child: ChildProcess
  /** Everything written to stdout and stderr so far. */
  output(): string
}

/** Runs `node <args>`, resolving once the server logs that it is listening. */
export function startServer(
  args: string[],
  env: Record<string, string>,
): Promise<ServerProcess> {
  const child = spawn(process.execPath, args, {
    env: {
      ...process.env,
      XLOC_HOST: '127.0.0.1',
      XLOC_STATS_INTERVAL_HOURS: '0',
      ...env,
    },
  })
  let output = ''
  return new Promise((ready, fail) => {
    const onData = (chunk: Buffer): void => {
      output += chunk.toString()
      if (output.includes('listening on'))
        ready({ child, output: () => output })
    }
    child.stdout!.on('data', onData)
    child.stderr!.on('data', onData)
    child.once('exit', (code) => fail(new Error(`exited ${code}:\n${output}`)))
  })
}

/** SIGTERM, which drains and logs the shutdown stats line; resolves with the
 *  exit code. */
export function stopServer(child: ChildProcess): Promise<number | null> {
  const exited = new Promise<number | null>((done) => child.once('exit', done))
  child.kill('SIGTERM')
  return exited
}
