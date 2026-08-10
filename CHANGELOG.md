# Changelog

Notable changes to X Profile Location. Newest first.

Bug reporters and feature requesters are credited by handle — if you filed the
issue, your name belongs here.

## [1.7.1]

### Added

- **X open in several tabs now costs what one tab costs.** The lookup budget
  belongs to your X session, not to a tab, but each tab used to keep its own
  idea of it: two tabs on the same feed each spent a request on the same
  account, an account X has no location for was asked about again by every new
  tab, and a rate limit one tab ran into was something every other tab had to
  hit for itself. All of it is now decided in one place, so the countdown
  appears in every tab at once, a flag one tab looks up appears in the others
  without a second lookup, and the background trickle keeps to one pace however
  many tabs are open.
- **A small mark on shared images.** A card copied from a post now carries
  `X-Pat · x-pat.pages.dev` in its bottom-right corner, so one that gets
  reposted still says where it came from. It takes its colour from the theme
  behind it, and nothing else about the image changes — still drawn and copied
  entirely in your own browser.
- **Light / dark theme**, under Display → Appearance, defaulting to matching
  your system. It covers X-Pat's own screens — the settings page and the toolbar
  popup — and not the flags and marks drawn on X, which keep following X's own
  theme so they never clash with the timeline around them.
- **Account details on hover** — account age, affiliate badge, verification,
  handle-change count and follower count. All of it read from responses the
  extension already receives, so it costs no extra lookups and none of your
  rate-limit budget.
- **Regions actually filter their countries.** Picking "Europe" or "South Asia"
  used to match only accounts X literally reported as that region; it now covers
  the countries in it too.
- **Filter by affiliation** — block an organisation and every account X badges
  as belonging to it.
- **Young accounts are marked rather than hidden**, off by default. Posts from
  an account newer than your threshold get the same orange bar down the side
  that a keyword match gets. This is the one rule that never collapses a post
  whatever "what happens to a filtered post" is set to: a young account is the
  strongest single signal for a bought or farmed one, and it is also exactly
  what somebody who joined last month looks like, which is too thin an excuse
  to take their replies away.
- **Always-show allowlist**, and **per-rule exceptions** so an account can be
  exempt from one filter without being exempt from the rest. Existing highlight
  exceptions carry over untouched.
- **The matched keyword is marked in the bio** on hover cards, so the orange bar
  down the side of a post comes with an answer to "why this account?". Emoji
  keywords are marked too — X draws those as images, so they get an outline
  rather than a highlight.
- **One exception button for every rule.** The hover-card button used to know
  about keyword highlighting and nothing else. It now covers whatever is
  actually acting on the account you are looking at — the keyword, the country,
  the affiliate badge, the age — and says which in its tooltip. It is also on
  the placeholder of a collapsed post, where there is nothing left to hover.
- **Apple and Android are told apart** instead of sharing one 📱, drawn as SVG
  so they look the same on every OS and follow X's themes.
- **Quoted posts collapse on their own**, leaving the post that quoted them
  readable.
- **Followers / Following / search-people rows are marked, never hidden** —
  hiding rows there breaks the counts.
- **Copy a post with its location flags** as a PNG — a real snapshot of the post
  as it appears, with its avatar, images, video thumbnail and X's own layout,
  plus a line naming the countries in words. Rendered in your browser and copied
  to the clipboard; nothing is uploaded. There is a small “Copy” button in the
  flags row of every hover card, and right-clicking a post does the same.
- **Import and export your settings** as JSON. The export deliberately contains
  neither your cached locations nor the anonymous shared-cache id.
- **The two filters you actually change mid-scroll are in the toolbar popup** —
  blocked locations and highlight keywords, each behind a collapsed section so
  the popup still opens as a handful of switches. Edits land on the timeline
  behind it immediately; the section you were last in is where it reopens.
- **A pause switch** in the toolbar popup.
- 33 territories X can report but the extension could not name — Jersey,
  Réunion, Greenland, Macau, Guadeloupe and the rest.

### Changed

- **An account you have excepted shows its country again.** A blocked location
  is drawn as ⚠️ while the filter is acting on the account; once you add an
  exception — or put the account on the allowlist — the row goes back to the
  country's own flag, because the filter is no longer doing anything to hide.
  It changes the moment you add the exception, on posts already on screen, and
  it changes back if you undo it. Editing the blocked list updates what is on
  screen the same way.
- **Hovering a name no longer collapses the post you hovered from.** A hover is
  a question about the author, so it is answered with a flag in the card and
  nothing else moves — the reply you were reading stays where it is, even when
  the answer turns out to be a blocked country. The account is still filtered:
  every post it renders from then on is hidden as usual.
- **The toolbar popup and the settings page are separate.** The popup holds what
  you flip while reading; the settings page is now five tabs of plain cards —
  no more accordions to open, and it follows your light/dark theme. It also
  remembers which tab you were on.
- Open source under the MIT licence, with `CONTRIBUTING.md` covering the
  architecture, the rate-limit design and the test setup.

### Fixed

- The popup's “All settings” link did nothing: the extension never declared an
  options page, so the browser had nothing to open.
- `tsc` could not typecheck the project at all: `tsconfig.app.json` listed a
  types package that was never installed.

## [1.5.4]

Releases before open-sourcing were tracked in the store listing rather than
here. The extension at this point does:

- Country flags and region tags in hover cards, on profiles, and inline in the feed
- App-store origin badge derived from X's `source` field
- VPN/proxy warning from `location_accurate`
- Hide or collapse posts from chosen countries and regions
- Bio-keyword highlighting, with per-account exceptions
- Swipe-right on mobile to look up a post's author
- Budget-aware background prefetching that reserves a share of X's
  50-per-15-minute window for the user's own hovers, with configurable share
  and pacing
- Optional community location cache (off by default), backed by a self-hosted
  consensus server
- Local IndexedDB cache with a clear-cache control
