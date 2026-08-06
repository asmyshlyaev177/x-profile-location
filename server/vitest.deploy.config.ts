import { defineConfig } from 'vitest/config'

// deploy/ has its own config so `pnpm test` (and therefore CI) never picks it
// up: these tests shell out to sqlite3, gzip, flock and dash against real
// databases on disk, and the load cases deliberately take tens of seconds.
//
//   pnpm test:deploy
//
// Serial by design — every case spawns processes and writes real files, and
// the load cases want the machine to themselves to time anything meaningfully.
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['deploy/**/*.test.ts'],
    environment: 'node',
    fileParallelism: false,
    sequence: { concurrent: false },
    testTimeout: 30_000,
  },
})
