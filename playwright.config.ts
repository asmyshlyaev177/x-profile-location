import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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
    command: 'test-proxy-recorder https://x.com --port 8100 --dir ./e2e/recordings',
    url: 'http://localhost:8100/__control',
    reuseExistingServer: true,
    timeout: 10_000,
  },
});
