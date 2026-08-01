# Changelog

Notable changes to X Profile Location. Newest first.

Bug reporters and feature requesters are credited by handle — if you filed the
issue, your name belongs here.

## [Unreleased]

### Added

- Open source under the MIT licence, with `CONTRIBUTING.md` covering the
  architecture, the rate-limit design and the test setup.

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
