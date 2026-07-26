/**
 * Options-page accordion persistence (OPTIONS_SECTIONS_KEY).
 *
 * Everything here happens on the extension's own options page — no x.com
 * traffic, so these tests need no HAR recordings and spend none of the
 * 50-per-15-minutes AboutAccountQuery budget.
 *
 * Each test gets a fresh browser profile (see fixtures.ts), so storage starts
 * out with no OPTIONS_SECTIONS_KEY and the page renders its defaults.
 */
import { test, expect } from './fixtures'
import {
  expectSectionOpen,
  openOptionsPage,
  optionsSection,
  readStoredSections,
  setSectionOpen,
  writeStoredSections,
} from './helpers'

test('sections start at their defaults, with nothing stored yet', async ({
  context,
  extensionId,
}) => {
  const optPage = await openOptionsPage(context, extensionId)

  await expectSectionOpen(optPage, 'keywords', true)
  await expectSectionOpen(optPage, 'blocked', true)
  await expectSectionOpen(optPage, 'flags', false)
  await expectSectionOpen(optPage, 'exceptions', false)
  await expectSectionOpen(optPage, 'prefetch', false)
  // Defaults are applied in memory, not written out — the first write should be
  // the user's, so a later change of default still reaches existing installs.
  expect(await readStoredSections(optPage)).toBeUndefined()

  await optPage.close()
})

test('what the user opens and closes is still that way in a new tab', async ({
  context,
  extensionId,
}) => {
  const optPage = await openOptionsPage(context, extensionId)

  // Both directions, so neither assertion can pass on a default.
  await setSectionOpen(optPage, 'keywords', false)
  await setSectionOpen(optPage, 'flags', true)

  expect(await readStoredSections(optPage)).toEqual({
    keywords: false,
    flags: true,
    exceptions: false,
    prefetch: false,
    blocked: true,
  })
  await optPage.close()

  const reopened = await openOptionsPage(context, extensionId)
  await expectSectionOpen(reopened, 'flags', true)
  await expectSectionOpen(reopened, 'keywords', false)
  // Untouched sections keep their defaults.
  await expectSectionOpen(reopened, 'blocked', true)
  await expectSectionOpen(reopened, 'exceptions', false)
  await reopened.close()
})

test('restoring stored state neither reopens a closed section nor writes back', async ({
  context,
  extensionId,
}) => {
  const optPage = await openOptionsPage(context, extensionId)

  // Deliberately partial: a write-back would fill in the two missing ids, so the
  // stored value doubles as the assertion that nothing was written.
  const seeded = { keywords: false, flags: true }
  await writeStoredSections(optPage, seeded)
  await optPage.reload()

  // Restoring flips `open` programmatically, and Chrome delivers a `toggle` event
  // for each flip exactly as it does for a click — so the restore path runs the
  // same handler the user's clicks do, and must neither reopen `keywords` nor
  // write anything back. (The ordering that let a stale view of the state clobber
  // the loaded values is pinned by the unit test, where the event is synchronous.)
  // `flags` first: it is the one whose stored value differs from the default, so
  // its arrival proves the load landed — both ids come from the same update.
  await expectSectionOpen(optPage, 'flags', true)
  await expectSectionOpen(optPage, 'keywords', false)
  expect(await readStoredSections(optPage)).toEqual(seeded)

  // A real click still persists from there, and still only touches its own id.
  await optionsSection(optPage, 'exceptions').locator('summary').click()
  await expect
    .poll(() => readStoredSections(optPage), { timeout: 5_000 })
    .toEqual({
      keywords: false,
      flags: true,
      exceptions: true,
      prefetch: false,
      blocked: true,
    })

  await optPage.close()
})
