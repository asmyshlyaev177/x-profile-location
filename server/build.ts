#!/usr/bin/env -S node --experimental-strip-types
// Bundles the Node server into dist/node-server.js, the file the service runs.
// Committed, not built on the box — see "The Node deployment" in CLAUDE.md.

import { join, resolve } from 'node:path'
import { build, type BuildOptions } from 'esbuild'

export const BUNDLE_OPTIONS = {
  absWorkingDir: import.meta.dirname,
  entryPoints: ['src/node-server.ts'],
  outfile: 'dist/node-server.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // better-sqlite3 is native: it loads from node_modules at runtime.
  packages: 'external',
  banner: { js: '// Generated from src/ by `pnpm build` — do not edit.' },
} satisfies BuildOptions

export const BUNDLE = join(import.meta.dirname, BUNDLE_OPTIONS.outfile)

if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  await build(BUNDLE_OPTIONS)
}
