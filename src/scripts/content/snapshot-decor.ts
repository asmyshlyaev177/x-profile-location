// The post as it goes into a shared image: our rows in, the reader's controls
// out. Every style is inline — no stylesheet reaches inside the SVG a snapshot
// is drawn from.

import type { LocationData } from '../cache/cache'
import { canonicalLocation, flagEmojiFor } from '../countries/countries'
import { localizedLocation } from '../countries/location-names'
import { t } from '../i18n'
import { allowGrowth } from '../snapshot'
import { buildSourceGlyph, classifySource } from '../source'
import { HIDDEN_PLACEHOLDER_CLASS } from '../styles'
import { getNameEl, SEL_PRIMARY_TWEET } from './tweet-dom'

// flagEmojiFor throughout, never getLocationDisplay: in a shared image a ⚠️
// reads as something X said.
/**
 * Names in words, because a flag in a reposted image is a coloured rectangle
 * nobody can hover.
 */
function buildSnapshotLocationRow(data: LocationData): HTMLElement {
  const row = document.createElement('div')
  // No `color`: it inherits X's own from the inlined ancestor styles, so it
  // reads correctly on either theme.
  row.setAttribute(
    'style',
    'display:flex;align-items:center;flex-wrap:nowrap;gap:8px;' +
      'margin:0 0 4px;white-space:nowrap;font-size:14px;font-weight:600;' +
      'line-height:1.2;font-family:system-ui,-apple-system,sans-serif;',
  )

  const { platform, country: storeCountry } = classifySource(data.source)

  if (storeCountry) {
    const block = document.createElement('span')
    block.setAttribute(
      'style',
      'display:inline-flex;align-items:center;gap:5px;' +
        'border:1px solid rgba(128,128,128,0.35);border-radius:6px;' +
        'padding:2px 8px;',
    )
    const glyph = buildSourceGlyph(platform)
    if (glyph) {
      // The class the page styles it with means nothing here, so the box is
      // given directly.
      glyph.setAttribute('style', 'width:16px;height:16px;display:block;')
      block.appendChild(glyph)
    }
    const label = document.createElement('span')
    label.textContent = `${flagEmojiFor(storeCountry)} ${localizedLocation(
      canonicalLocation(storeCountry),
    )}`
    block.appendChild(label)
    row.appendChild(block)
  }

  if (data.location) {
    const loc = document.createElement('span')
    loc.textContent = `${flagEmojiFor(data.location)} ${localizedLocation(
      canonicalLocation(data.location),
    )}`
    row.appendChild(loc)
  }

  if (data.locationAccurate === false) {
    const vpn = document.createElement('span')
    // The on-page badge's colours, so the image says it the same way.
    vpn.setAttribute(
      'style',
      'display:inline-flex;align-items:center;font-size:12px;font-weight:700;' +
        'background:rgba(220,38,38,0.15);color:rgb(200,25,25);' +
        'border:1px solid rgba(220,38,38,0.4);border-radius:4px;padding:2px 6px;',
    )
    vpn.textContent = t('vpnBadge')
    row.appendChild(vpn)
  }

  return row
}

/** Buttons aimed at the reader rather than part of the post. */
const RE_READER_ACTION = /^(subscribe|follow|following|unfollow)$/i

export function decorateSnapshot(clone: Element, data: LocationData): void {
  clone
    .querySelectorAll(
      `.x-loc-share-btn, .x-loc-exc-btn, .x-loc-card, .${HIDDEN_PLACEHOLDER_CLASS}, .x-loc-info`,
    )
    .forEach((el) => el.remove())

  // Controls aimed at the reader, which in a shared image invite a click that
  // cannot work. Grok by substring: X localises the label, not the name in it.
  clone
    .querySelectorAll('[data-testid="caret"], [aria-label*="Grok" i]')
    .forEach((el) => el.remove())
  for (const btn of Array.from(
    clone.querySelectorAll<HTMLElement>('[role="button"]'),
  )) {
    if (RE_READER_ACTION.test(btn.textContent?.trim() ?? '')) btn.remove()
  }

  const row = buildSnapshotLocationRow(data)

  // Where the page puts it, which differs by layout — after the block in a feed,
  // inside it on a status page, whose block is sized for the text.
  const nameEl = getNameEl(clone)
  const handleDiv = clone.matches(SEL_PRIMARY_TWEET)
    ? (nameEl?.children[1] ?? null)
    : null

  if (handleDiv) {
    handleDiv.insertAdjacentElement('afterend', row)
  } else if (nameEl) {
    nameEl.insertAdjacentElement('afterend', row)
    // Same reasoning, for the layout where the row does sit outside the block.
    if (nameEl instanceof HTMLElement) {
      nameEl.style.marginBottom = '0'
      nameEl.style.paddingBottom = '0'
    }
  } else {
    clone.prepend(row)
  }

  // Without this the row has nowhere to go: every ancestor is carrying the
  // pixel height it had before the row existed.
  allowGrowth(row.parentElement ?? clone, clone)
}
