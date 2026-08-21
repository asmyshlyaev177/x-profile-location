// Tests for deploy/update.ts. Like backup.test.ts these shell out to the real
// script — against a real git repository, real unit files on disk, and stub
// shims on PATH for the steps a test cannot really take (systemctl, curl, npm,
// and the interpreter whose ABI is being probed).
//
//   pnpm test:deploy
//
// The failure paths are the reason this exists: a broken upgrade that leaves
// the box not serving is the one outcome this script is for.

import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isUnitFile, missingEnvKeys, needsInstall, unitPlan } from './update.ts'

const UPDATE = join(import.meta.dirname, 'update.ts')

function available(cmd: string): boolean {
  return spawnSync('sh', ['-c', `command -v ${cmd}`]).status === 0
}
const MISSING = ['git', 'install'].filter((c) => !available(c))

let dir = ''
let origin = ''
let repo = ''
let unitDir = ''
let binDir = ''
let logFile = ''

function git(cwd: string, ...args: string[]): string {
  const r = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'test',
      GIT_AUTHOR_EMAIL: 't@test',
      GIT_COMMITTER_NAME: 'test',
      GIT_COMMITTER_EMAIL: 't@test',
    },
  })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}

function stub(name: string, body: string): void {
  const file = join(binDir, name)
  writeFileSync(file, `#!/bin/sh\n${body}\n`)
  chmodSync(file, 0o755)
}

/** Every stubbed command appends its argv here, so a test can assert on order. */
function log(): string[] {
  return existsSync(logFile)
    ? readFileSync(logFile, 'utf8').split('\n').filter(Boolean)
    : []
}

const UNIT_BODY = '[Service]\nExecStart=/usr/bin/node src/node-server.ts\n'

function commit(message: string): void {
  git(origin, 'add', '-A')
  git(origin, 'commit', '-m', message)
}

function writeInOrigin(relative: string, content: string): void {
  const file = join(origin, relative)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content)
}

beforeEach(() => {
  if (MISSING.length > 0) return
  dir = mkdtempSync(join(tmpdir(), 'xloc-update-'))
  origin = join(dir, 'origin')
  repo = join(dir, 'repo')
  unitDir = join(dir, 'systemd')
  binDir = join(dir, 'bin')
  logFile = join(dir, 'calls.log')
  mkdirSync(origin, { recursive: true })
  mkdirSync(unitDir, { recursive: true })
  mkdirSync(binDir, { recursive: true })

  git(origin, 'init', '-b', 'main')
  writeInOrigin('server/package.json', '{"name":"x-loc-cache"}\n')
  writeInOrigin('server/deploy/x-loc-cache.service', UNIT_BODY)
  writeInOrigin(
    'server/deploy/x-loc-backup.service',
    '[Service]\nExecStart=x\n',
  )
  writeInOrigin('server/deploy/x-loc-cache.env.example', 'XLOC_PORT=8787\n')
  writeInOrigin('server/src/node-server.ts', '// v1\n')
  commit('initial')

  spawnSync('git', ['clone', origin, repo], { encoding: 'utf8' })
  // Only x-loc-cache.service is "installed" on this box.
  writeFileSync(join(unitDir, 'x-loc-cache.service'), UNIT_BODY)

  stub('id', 'echo 0')
  stub('systemctl', `echo "systemctl $*" >> ${logFile}`)
  stub('curl', `echo "curl $*" >> ${logFile}; exit 0`)
  stub('npm', `echo "npm $*" >> ${logFile}`)
  // Stands in for /usr/bin/node loading better-sqlite3.
  stub('fake-node', `echo "node-probe" >> ${logFile}; exit 0`)
})

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

function run(extra: Record<string, string> = {}) {
  const base: NodeJS.ProcessEnv = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (!k.startsWith('XLOC_')) base[k] = v
  }
  return spawnSync(process.execPath, ['--experimental-strip-types', UPDATE], {
    encoding: 'utf8',
    env: {
      ...base,
      PATH: `${binDir}:${process.env.PATH}`,
      XLOC_REPO: repo,
      XLOC_UNIT_DIR: unitDir,
      XLOC_NODE: join(binDir, 'fake-node'),
      XLOC_NPM: join(binDir, 'npm'),
      XLOC_ENV_FILE: join(dir, 'absent.env'),
      XLOC_PORT: '8787',
      ...extra,
    },
  })
}

/** better-sqlite3 has to exist for the ABI probe to be worth running. */
function installNodeModules(): void {
  const module = join(repo, 'server/node_modules/better-sqlite3')
  mkdirSync(module, { recursive: true })
  writeFileSync(join(module, 'index.js'), 'module.exports = class {}\n')
}

describe.skipIf(MISSING.length > 0)('update.ts — a clean upgrade', () => {
  beforeEach(installNodeModules)

  it('pulls, restarts and reports the commit it is serving', () => {
    writeInOrigin('server/src/node-server.ts', '// v2\n')
    commit('second')
    const target = git(origin, 'rev-parse', 'HEAD')

    const r = run()

    expect(r.status).toBe(0)
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(target)
    expect(r.stdout).toContain(`serving ${target.slice(0, 7)}`)
    expect(log()).toContain('systemctl restart x-loc-cache')
    // No dependency change and a loadable module: nothing to reinstall.
    expect(log().some((line) => line.startsWith('npm '))).toBe(false)
  })

  it('is a no-op restart when there is nothing to pull', () => {
    const r = run()
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('already at')
    expect(log()).toContain('systemctl restart x-loc-cache')
  })

  it('reinstalls when package.json moved', () => {
    writeInOrigin('server/package.json', '{"name":"x-loc-cache","x":1}\n')
    commit('deps')

    const r = run()
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('dependencies changed')
    expect(log().some((line) => line.includes('npm --prefix'))).toBe(true)
  })

  it('notes a setting the box has never been told about', () => {
    const envFile = join(dir, 'live.env')
    writeFileSync(envFile, 'XLOC_PORT=8787\n')
    writeInOrigin(
      'server/deploy/x-loc-cache.env.example',
      'XLOC_PORT=8787\nXLOC_CACHE_MB=256\n',
    )
    commit('new setting')

    const r = run({ XLOC_ENV_FILE: envFile })
    expect(r.stdout).toContain('XLOC_CACHE_MB')
  })
})

describe.skipIf(MISSING.length > 0)('update.ts — the units', () => {
  beforeEach(installNodeModules)

  it('copies an installed unit that changed, and reloads systemd', () => {
    const changed =
      '[Service]\nExecStart=/usr/bin/node --new src/node-server.ts\n'
    writeInOrigin('server/deploy/x-loc-cache.service', changed)
    commit('unit')

    const r = run()

    expect(r.status).toBe(0)
    expect(readFileSync(join(unitDir, 'x-loc-cache.service'), 'utf8')).toBe(
      changed,
    )
    expect(log().indexOf('systemctl daemon-reload')).toBeLessThan(
      log().indexOf('systemctl restart x-loc-cache'),
    )
  })

  it('leaves an unchanged unit alone rather than reloading for nothing', () => {
    const r = run()
    expect(r.status).toBe(0)
    expect(log()).not.toContain('systemctl daemon-reload')
  })

  it('reports a unit that exists upstream but was never installed here', () => {
    const r = run()
    expect(r.stdout).toContain('x-loc-backup.service')
    expect(r.stdout).toContain('not installed here')
    // Reported, not silently enabled: it may want an env file this box lacks.
    expect(existsSync(join(unitDir, 'x-loc-backup.service'))).toBe(false)
  })
})

describe.skipIf(MISSING.length > 0)('update.ts — what it refuses', () => {
  it('refuses to run unprivileged', () => {
    installNodeModules()
    stub('id', 'echo 1000')
    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('run as root')
    expect(log()).not.toContain('systemctl restart x-loc-cache')
  })

  it('changes nothing when the pull itself fails', () => {
    installNodeModules()
    // A local commit the upstream does not have: --ff-only cannot proceed.
    writeFileSync(join(repo, 'server/src/node-server.ts'), '// local\n')
    git(repo, 'add', '-A')
    git(repo, 'commit', '-m', 'local work')
    writeInOrigin('server/src/node-server.ts', '// upstream\n')
    commit('upstream work')

    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('nothing was changed')
    expect(log()).not.toContain('systemctl restart x-loc-cache')
  })

  it('reinstalls on a Node upgrade that no commit reflects', () => {
    installNodeModules()
    // Fails once (the ABI break), then loads — which is what npm install fixes.
    stub(
      'fake-node',
      `echo "node-probe" >> ${logFile}
       test "$(grep -c node-probe ${logFile})" -gt 1`,
    )

    const r = run()
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('native module will not load')
    expect(log().some((line) => line.includes('npm --prefix'))).toBe(true)
  })

  it('stops before the restart when the module still will not load', () => {
    installNodeModules()
    stub('fake-node', `echo "node-probe" >> ${logFile}; exit 1`)

    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('still will not load')
    expect(r.stderr).toContain('service untouched')
    expect(log()).not.toContain('systemctl restart x-loc-cache')
  })
})

describe.skipIf(MISSING.length > 0)('update.ts — rollback', () => {
  beforeEach(installNodeModules)

  it('puts the tree back on the old commit when healthz never answers', () => {
    const before = git(repo, 'rev-parse', 'HEAD')
    writeInOrigin('server/src/node-server.ts', '// broken\n')
    commit('breaks it')
    stub('curl', `echo "curl $*" >> ${logFile}; exit 22`)

    const r = run()

    expect(r.status).toBe(1)
    expect(git(repo, 'rev-parse', 'HEAD')).toBe(before)
    expect(r.stderr).toContain('rolling back')
    // Restarted twice: once on the new code, once on the restored code.
    expect(
      log().filter((l) => l === 'systemctl restart x-loc-cache'),
    ).toHaveLength(2)
  })

  it('says so plainly when even the old commit will not serve', () => {
    writeInOrigin('server/src/node-server.ts', '// v2\n')
    commit('second')
    stub('curl', `exit 22`)

    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('STILL not serving')
    expect(r.stderr).toContain('this is not the new code')
  })

  it('restores the unit files too, not just the source', () => {
    writeInOrigin(
      'server/deploy/x-loc-cache.service',
      '[Service]\nExecStart=/usr/bin/node --broken src/node-server.ts\n',
    )
    commit('bad unit')
    stub('curl', `echo "curl $*" >> ${logFile}; exit 22`)

    run()

    expect(readFileSync(join(unitDir, 'x-loc-cache.service'), 'utf8')).toBe(
      UNIT_BODY,
    )
  })
})

describe('update.ts — the decisions on their own', () => {
  it('reinstalls only for a dependency change', () => {
    expect(needsInstall(['server/package.json'])).toBe(true)
    expect(needsInstall(['server/package-lock.json'])).toBe(true)
    expect(needsInstall(['server/src/index.ts', 'README.md'])).toBe(false)
    expect(needsInstall([])).toBe(false)
    // A lockfile somewhere else in the monorepo is not this server's.
    expect(needsInstall(['package.json', 'e2e/package.json'])).toBe(false)
  })

  it('knows a unit file from the scripts beside it', () => {
    expect(isUnitFile('x-loc-cache.service')).toBe(true)
    expect(isUnitFile('x-loc-backup.timer')).toBe(true)
    expect(isUnitFile('x-loc-alert@.service')).toBe(true)
    expect(isUnitFile('backup.ts')).toBe(false)
    expect(isUnitFile('Caddyfile')).toBe(false)
    expect(isUnitFile('x-loc-cache.env.example')).toBe(false)
  })

  it('updates what is installed and only reports what is not', () => {
    const plan = unitPlan(
      ['x-loc-cache.service', 'x-loc-backup.timer', 'lib.ts', 'Caddyfile'],
      (name) => name === 'x-loc-cache.service',
    )
    expect(plan.update).toEqual(['x-loc-cache.service'])
    expect(plan.unseen).toEqual(['x-loc-backup.timer'])
  })

  it('names the settings the live env file has never heard of', () => {
    expect(
      missingEnvKeys('XLOC_PORT=8787\nXLOC_CACHE_MB=256\n', 'XLOC_PORT=9000\n'),
    ).toEqual(['XLOC_CACHE_MB'])
    // Commented-out and blank lines set nothing.
    expect(missingEnvKeys('# XLOC_NEW=1\n\n', 'XLOC_PORT=1\n')).toEqual([])
    // A key the box sets and upstream dropped is not this script's business.
    expect(
      missingEnvKeys('XLOC_PORT=1\n', 'XLOC_PORT=1\nXLOC_GONE=2\n'),
    ).toEqual([])
  })
})
