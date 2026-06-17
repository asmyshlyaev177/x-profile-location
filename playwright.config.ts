import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  // Resets the proxy and redacts secrets from the recorded .har files after
  // the suite. Required for redaction to reach the HARs (not just .mock.json).
  globalTeardown: './e2e/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    headless: false,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: 'e2e',
      testIgnore: /auth\.setup\.ts/,
      dependencies: ['setup'],
    },
  ],
  webServer: {
    // Proxy forwards to real x.com; records/replays extension API calls.
    // Target, port, recordings dir, and redaction come from
    // test-proxy-recorder.config.ts (auto-discovered).
    command: 'test-proxy-recorder',
    url: 'http://localhost:8100/__control',
    reuseExistingServer: true,
    timeout: 10_000,
  },
})
