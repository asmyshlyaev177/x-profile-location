// The stylesheet the content script injects, and the class and attribute names
// it is written against.
//
// The names live here rather than in content.tsx because they are half of the
// stylesheet: `HIDDEN_ATTR` renamed on its own turns every collapse rule into a
// selector that matches nothing, silently. Keeping the pair in one file makes
// that a one-file edit, and lets a test render the real CSS over a fixture
// without importing the content script (which talks to chrome APIs the moment
// it loads).

// Set on tweets collapsed by the "hide blocked locations" feature; a user "Show"
// click swaps it for HIDDEN_REVEALED_ATTR so the tweet is never re-hidden.
export const HIDDEN_ATTR = 'data-x-loc-hidden'
export const HIDDEN_PLACEHOLDER_CLASS = 'x-loc-hidden-ph'
// The same pair again for the quoted post inside an article — tracked
// separately so a quote can be collapsed while its host stays readable.
export const QUOTE_HIDDEN_ATTR = 'data-x-loc-quote-hidden'
// Set on a people-list row whose account matches a rule. Rows there are marked,
// never hidden.
export const PEOPLE_MATCH_ATTR = 'data-x-loc-cell-match'
// Set on a post (or a quote card) whose account matched a rule that marks
// rather than hides — account age is the only one today. Carries the rule as its
// value so a later one can be styled apart if it ever earns it; today they all
// draw the same bar a keyword match does, because the reader should have one
// mark to learn rather than a colour code to decode.
export const TWEET_MARK_ATTR = 'data-x-loc-mark'
// Set on a hover card whose account the keyword/flag rule is firing on; scopes
// the generated emoji-keyword rules (see updateKeywordEmojiStyle).
export const KEYWORD_MATCH_ATTR = 'data-x-loc-kw'
// The name the matched-keyword ranges are registered under in CSS.highlights.
export const KEYWORD_HIGHLIGHT_NAME = 'x-loc-keyword'

/**
 * The rules that mark emoji keywords, generated from the current keyword list.
 *
 * Emoji cannot be marked the way words are: X renders them as `<img alt="🇷🇺">`,
 * so there is no text node for a Range to cover. A rule matching the alt is the
 * equivalent that changes no markup — scoped to KEYWORD_MATCH_ATTR, or every
 * hover card in the session would light up rather than the one the rule fired
 * on.
 *
 * The alt is user input on its way into a selector, so quotes and backslashes
 * are escaped: unescaped, a keyword could close the attribute value and write
 * rules of its own.
 */
export function emojiKeywordCss(keywords: string[]): string {
  if (keywords.length === 0) return ''
  const selectors = keywords.map(
    (kw) =>
      `[${KEYWORD_MATCH_ATTR}] img[alt="${kw.replace(/["\\]/g, '\\$&')}"]`,
  )
  return `${selectors.join(',\n')} {
  outline: 2px solid rgba(245, 158, 11, 0.75);
  outline-offset: 1px;
  border-radius: 3px;
}`
}

export const CONTENT_CSS = `
.x-loc-info {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px;
}
.x-loc-icon {
  font-size: 20px;
  line-height: 1;
  cursor: default;
  display: inline-flex;
  align-items: center;
  user-select: none;
}
.x-loc-icon-flag {
  font-size: 26px;
}
.x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 0.5px;
}
.x-loc-store-block .x-loc-icon-flag {
  font-size: 19px;
}
.x-loc-store-block .x-loc-icon-flag.x-loc-icon-abbr {
  font-size: 13px;
}
.x-loc-store-block {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(128, 128, 128, 0.3);
  border-radius: 5px;
  padding: 2px 5px;
  margin-left: 4px;
  cursor: default;
  user-select: none;
}
/* Coloured by currentColor, so the platform mark tracks the surrounding text on
   every X theme instead of being a fixed-colour sticker.
   The Android robot is a wide, short shape — roughly 24×13 in its own viewBox —
   so at a square 13px it drew about 7px tall and read as noticeably fainter
   than the Apple mark beside it. Sizing the box slightly larger gives the robot
   presence without making the apple overbearing. */
.x-loc-glyph {
  width: 16px;
  height: 16px;
  flex: none;
  display: block;
  opacity: 0.85;
}
.x-loc-icon-ratelimit {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(180, 120, 0, 0.12);
  color: rgb(160, 100, 0);
  border: 1px solid rgba(180, 120, 0, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
.x-loc-icon-vpn {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.3px;
  line-height: 1;
  cursor: default;
  user-select: none;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  background: rgba(220, 38, 38, 0.15);
  color: rgb(200, 25, 25);
  border: 1px solid rgba(220, 38, 38, 0.4);
  border-radius: 4px;
  padding: 2px 5px;
}
#x-loc-rate-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(220, 38, 38, 0.55);
}
#x-loc-location-toast {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(24, 24, 24, 0.93);
  color: #fff;
  padding: 8px 18px;
  border-radius: 8px;
  font-size: 15px;
  font-weight: 600;
  z-index: 2147483647;
  pointer-events: none;
  white-space: nowrap;
  border: 1px solid rgba(29, 155, 240, 0.55);
}
#x-loc-location-toast[data-pending] {
  color: rgba(255, 255, 255, 0.75);
  border-color: rgba(29, 155, 240, 0.28);
}
/* Every reason a post gets pointed at draws the same bar: the keyword rule on a
   post, on a quote card, and the rules that mark instead of hiding. One
   declaration rather than three identical ones, so they cannot drift apart —
   and so a post that matches two of them has no cascade to resolve. */
article[data-x-loc-highlighted],
[data-x-loc-quote-highlighted],
[${TWEET_MARK_ATTR}='age'] {
  border-left: 3px solid #f59e0b !important;
  background: rgba(245, 158, 11, 0.05) !important;
}
/* The word that earned the orange bar, marked where the reader can see it.
   ::highlight paints ranges the script registers — it changes no markup, which
   is what makes it safe to use inside a card React owns and re-renders. Only a
   few properties are allowed here; background-color is the one that matters. */
::highlight(${KEYWORD_HIGHLIGHT_NAME}) {
  background-color: rgba(245, 158, 11, 0.4);
}
.x-loc-card {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 4px;
}
.x-loc-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 9999px;
  border: 1px solid rgba(128, 128, 128, 0.35);
  font-size: 12px;
  font-weight: 600;
  line-height: 1.5;
  color: rgb(113, 118, 123);
  cursor: default;
  user-select: none;
  white-space: nowrap;
}
.x-loc-chip-warn {
  color: rgb(160, 100, 0);
  background: rgba(180, 120, 0, 0.1);
  border-color: rgba(180, 120, 0, 0.35);
}
.x-loc-exc-btn {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: rgb(83, 100, 113);
  background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.45);
  border-radius: 9999px;
  padding: 3px 10px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
.x-loc-exc-btn:hover {
  background: rgba(128, 128, 128, 0.14);
}
/* Stacks the hover card's pieces in the order they are appended, and keeps
   buttons at their natural width — inside X's own flex column they were
   stretching to the full width of the card. */
.x-loc-hover {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
}
/* Rides at the end of the flags row, so it costs no extra line. Deliberately
   smaller and lighter than the flags it sits with: it is an action attached to
   that row, not another piece of information competing with it. */
.x-loc-share-btn {
  margin-left: 4px;
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  white-space: nowrap;
  color: rgb(83, 100, 113);
  background: transparent;
  border: 1px solid rgba(128, 128, 128, 0.4);
  border-radius: 9999px;
  padding: 2px 8px;
  cursor: pointer;
  user-select: none;
  opacity: 0.75;
}
.x-loc-share-btn:hover {
  opacity: 1;
  background: rgba(128, 128, 128, 0.14);
}
.x-loc-exc-btn.x-loc-exc-active {
  color: rgb(0, 150, 80);
  border-color: rgba(0, 150, 80, 0.5);
  background: rgba(0, 150, 80, 0.08);
}
article[${HIDDEN_ATTR}='hide'] {
  display: none !important;
}
article[${HIDDEN_ATTR}='collapse'] > :not(.${HIDDEN_PLACEHOLDER_CLASS}) {
  display: none !important;
}
/* 'hide' drops the card outright — there is no placeholder in that mode, so
   collapsing only its children would leave an empty bordered box behind. */
[${QUOTE_HIDDEN_ATTR}='hide'] {
  display: none !important;
}
[${QUOTE_HIDDEN_ATTR}='collapse'] > :not(.${HIDDEN_PLACEHOLDER_CLASS}) {
  display: none !important;
}
/* People rows are marked, never removed — see refreshPeopleCells. */
[${PEOPLE_MATCH_ATTR}] {
  border-left: 3px solid rgba(220, 38, 38, 0.55) !important;
}
.x-loc-cell-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-left: 6px;
  padding: 1px 6px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 600;
  line-height: 1.4;
  color: rgb(160, 100, 0);
  background: rgba(180, 120, 0, 0.12);
  border: 1px solid rgba(180, 120, 0, 0.35);
  cursor: default;
  user-select: none;
  vertical-align: middle;
}
.${HIDDEN_PLACEHOLDER_CLASS} {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  font-size: 14px;
  color: rgb(113, 118, 123);
  border-bottom: 1px solid rgba(128, 128, 128, 0.15);
}
.x-loc-hidden-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
}
.x-loc-hidden-show {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  line-height: 1.2;
  color: rgb(29, 155, 240);
  background: transparent;
  border: 1px solid rgba(29, 155, 240, 0.5);
  border-radius: 9999px;
  padding: 3px 12px;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
}
/* In the placeholder it is one of a row of controls, not a block under the
   flags — so it drops the stacking margin and matches the button beside it. */
.${HIDDEN_PLACEHOLDER_CLASS} .x-loc-exc-btn {
  margin-top: 0;
  font-size: 13px;
  padding: 3px 12px;
}
.x-loc-hidden-show:hover {
  background: rgba(29, 155, 240, 0.1);
}
`
