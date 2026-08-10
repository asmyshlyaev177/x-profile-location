/**
 * Whether the e2e browser is shown.
 *
 * Off by default. The suite launches a fresh browser per test, so a headed run
 * is thirty-odd windows opening and closing under the pointer — and it has to
 * steal focus to do it, which makes the machine unusable for as long as the
 * suite takes.
 *
 * The runs that exist to be watched set `E2E_HEADED=1` (see package.json): UI
 * mode, recording, and the screenshot capture. So can any one-off run:
 *
 *     E2E_HEADED=1 pnpm exec playwright test e2e/location.test.ts
 */
export const HEADED = process.env.E2E_HEADED === '1'
