import { playwrightProxy } from 'test-proxy-recorder'

// Runs once after the whole suite — resets the proxy to transparent mode and
// redacts secrets from the recorded .har files (HAR redaction happens here, not
// per-test). Do NOT call teardown() per-test (afterAll): it flips the global
// mode and breaks parallel replay.
export default async function globalTeardown() {
  await playwrightProxy
    .teardown()
    .catch((err) => console.warn('test-proxy-recorder teardown', err))
}
