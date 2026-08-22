import { defineConfig } from 'vitest/config'

// Its own config so `pnpm test` and CI never pick it up: `pnpm test:deploy`
// shells out to real binaries and databases, serially, for tens of seconds.
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
