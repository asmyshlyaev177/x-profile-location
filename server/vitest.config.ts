import { defineConfig } from 'vitest/config'

// Scoped to the server package so it does not inherit the extension's
// happy-dom + jest-dom setup (this is a plain Node/Worker package).
export default defineConfig({
  test: {
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
