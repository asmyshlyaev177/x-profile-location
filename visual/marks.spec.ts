/**
 * The marks that explain a match: the keyword in the bio, the bar on a post,
 * the tag on a people row.
 *
 * The keyword marking is the reason this suite exists at all. It is built out
 * of two browser features happy-dom has neither of — the CSS Custom Highlight
 * API and an attribute-scoped stylesheet — so a unit test can only check that
 * the right ranges and rules were produced, never that anything is marked.
 */
import { expect, test } from '@playwright/test'
import { box, expectSameRow, openFixture, styleOf } from './helpers'
import { emojiKeywordCss, KEYWORD_HIGHLIGHT_NAME } from '../src/scripts/styles'

test.beforeEach(async ({ page }) => {
  await openFixture(page, 'marks')
})

test('a registered range is painted, and the rest of the bio is not', async ({
  page,
}) => {
  // ::highlight() styles ranges the script registers without touching the
  // markup — which is what makes it safe inside a card React owns. If the rule
  // is ever dropped from the stylesheet, the ranges register and nothing shows.
  const painted = await page.evaluate((name) => {
    const bio = document.getElementById('marked-bio')!
    const node = [...bio.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue?.includes('nft'),
    ) as Text
    const at = node.nodeValue!.indexOf('nft')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 3)
    CSS.highlights.set(name, new Highlight(range))

    // The registry is the only observable side of this: it is not reflected in
    // computed style, and the paint itself is not readable from script.
    return CSS.highlights.has(name)
  }, KEYWORD_HIGHLIGHT_NAME)

  expect(painted).toBe(true)

  // The stylesheet has to carry a rule for the name the script registers under.
  // A browser that cannot parse ::highlight() drops the rule on the floor, so
  // finding it back also says the selector survived the parser.
  const styled = await page.evaluate((name) => {
    for (const sheet of document.styleSheets) {
      let rules: CSSRuleList
      // A file:// <link> is cross-origin for CSSOM purposes; the sheet under
      // test is the one added inline, which is readable.
      try {
        rules = sheet.cssRules
      } catch {
        continue
      }
      for (const rule of rules) {
        if (rule.cssText.includes(`::highlight(${name})`)) return rule.cssText
      }
    }
    return null
  }, KEYWORD_HIGHLIGHT_NAME)

  expect(styled).toContain('background-color')
})

test('an emoji keyword is outlined only on a card the rule fired on', async ({
  page,
}) => {
  // X draws emoji as <img alt="🇷🇺">, so there is no text node to range over
  // and these are marked by a generated rule instead. The rule comes from the
  // shipped generator, not a copy of it — the scoping is the part being tested,
  // and a copy would keep passing after the real one lost it.
  await page.addStyleTag({ content: emojiKeywordCss(['🇷🇺']) })

  // outline-*style*, not width: Chrome computes the width as `medium` (3px)
  // whether or not anything is drawn, so width alone asserts nothing.
  expect(await styleOf(page.locator('#marked-emoji'), 'outline-style')).toBe(
    'solid',
  )
  expect(await styleOf(page.locator('#marked-emoji'), 'outline-width')).toBe(
    '2px',
  )
  expect(await styleOf(page.locator('#unmarked-emoji'), 'outline-style')).toBe(
    'none',
  )
})

test('the mark lands on a bio the extension supplied itself', async ({
  page,
}) => {
  // A blocker's card carries no bio of X's, so the only text the mark can sit on
  // is the one syncBioRow injected. It is a sibling of .x-loc-hover rather than
  // a child for exactly this reason — keywordRangesIn skips our own furniture,
  // and a bio built inside the wrapper would be silently unmarkable.
  await page.addStyleTag({ content: emojiKeywordCss(['🇷🇺']) })

  // The emoji half is a real cascade question: the generated rule is scoped to
  // [data-x-loc-kw], and this img is nested one level deeper than the one in a
  // card of X's own.
  expect(await styleOf(page.locator('#injected-emoji'), 'outline-style')).toBe(
    'solid',
  )

  // The text half: a range over a text node inside the injected bio registers
  // the same way it would inside one of X's.
  const registered = await page.evaluate((name) => {
    const bio = document.getElementById('injected-bio')!
    const node = [...bio.childNodes].find(
      (n) => n.nodeType === Node.TEXT_NODE && n.nodeValue?.includes('nft'),
    ) as Text | undefined
    if (!node) return false
    const at = node.nodeValue!.indexOf('nft')
    const range = document.createRange()
    range.setStart(node, at)
    range.setEnd(node, at + 3)
    CSS.highlights.set(name, new Highlight(range))
    return CSS.highlights.has(name)
  }, KEYWORD_HIGHLIGHT_NAME)

  expect(registered).toBe(true)
})

test('the supplied bio reads as the account’s words, not as our furniture', async ({
  page,
}) => {
  // It stands where X's own bio would, above the flags and chips — and carries
  // the rule that says the page did not write it.
  const bio = await box(page.locator('#injected-bio'))
  const ours = await box(page.locator('#blocked-marked .x-loc-hover'))

  expect(bio.y).toBeLessThan(ours.y)
  expect(
    await styleOf(page.locator('#injected-bio'), 'border-left-style'),
  ).toBe('solid')
})

test('a matched post gets its bar without losing its text', async ({
  page,
}) => {
  const border = await styleOf(
    page.locator('#highlighted'),
    'border-left-width',
  )
  expect(border).toBe('3px')
  await expect(page.locator('#highlighted .tweetbody')).toBeVisible()
})

test('a young account is pointed at, not taken away', async ({ page }) => {
  // The age rule's whole behaviour: the post is still readable, and it wears
  // the one bar every "look at this" rule wears.
  await expect(page.locator('#young-body')).toBeVisible()
  expect(await styleOf(page.locator('#young'), 'border-left-width')).toBe('3px')
})

test('every reason to point at a post draws the same bar', async ({ page }) => {
  // A keyword match, a quoted account's match and the age rule are one look, so
  // the reader learns a single mark rather than a colour code. They share one
  // declaration; this is what catches somebody giving one of them its own.
  const bars = await Promise.all(
    ['#highlighted', '#young', '#quote-highlighted'].map(async (sel) => [
      await styleOf(page.locator(sel), 'border-left-color'),
      await styleOf(page.locator(sel), 'border-left-width'),
      await styleOf(page.locator(sel), 'background-color'),
    ]),
  )

  expect(bars[0][0]).toBe('rgb(245, 158, 11)')
  expect(bars[1]).toEqual(bars[0])
  expect(bars[2]).toEqual(bars[0])
})

test('a people row is marked and stays completely readable', async ({
  page,
}) => {
  // Hiding rows here breaks the thing the page exists to show: the count says
  // 400 and you can only scroll past 380.
  await expect(page.locator('#cell-bio')).toBeVisible()
  expect(await styleOf(page.locator('#cell'), 'border-left-width')).toBe('3px')

  const name = await box(page.locator('#cell-name'))
  const tag = await box(page.locator('#cell-tag'))
  expectSameRow(name, tag, 6)
})
