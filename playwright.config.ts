import { defineConfig } from '@playwright/test'
import { HEADED } from './e2e/headed'

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
    // The default for anything using Playwright's own browser fixture. Every
    // test here builds a persistent context instead (fixtures.ts, auth.setup.ts),
    // so this is only here to keep the two from ever disagreeing.
    headless: !HEADED,
    trace: 'on-first-retry',
    // Playwright's default is unlimited, which turns a single element that never
    // settles — routine on X's virtualised timeline — into a test that hangs
    // until the 60s test timeout and reports the wrong step as the culprit.
    actionTimeout: 15_000,
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
