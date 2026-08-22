# `src/manifests` — the store listing

Bedframe rules for this folder (keep browser files to deltas from
`base.manifest.ts`, each exporting a `BuildTarget`; `dist/<browser>/manifest.json`
is output, not source) are in `.claude/skills/bedframe/SKILL.md`.

`name` in `base.manifest.ts` is the **store listing title** on Chrome and AMO, not
just the in-browser label, so it carries the search keywords. `short_name` is what
the browser shows when space is tight.

Two halves, deliberately: "X profile location" is the exact phrase people search
and doubles as what the extension reveals; "filter and highlight" are verbs, so
the title says what you _do_ rather than listing topics. **No "VPN"** — the
weakest of the three signals, it reads as a VPN product in a store search, and
over-claiming fights the neutral posture the brand is built on. It stays in the
store description and the landing copy, both of which are indexed.

Currently 48 characters. **AMO caps the name at 50**, Chrome at 75 — check any
edit against 50, not 75. (Edge caps at 45; we publish to Chrome and AMO only.)

The text lives in `public/_locales/*/messages.json`, which is what localizes the
listing as well as the UI: both stores resolve `__MSG_*__` against the catalogue
the extension reads. `messages.test.ts` holds `appDesc` to `pkg.description`, so
the two cannot drift the way a hand-copied string would.

## Keys that are load-bearing

**`options_page` + `open_in_tab`.** `chrome.runtime.openOptionsPage()` throws "No
Options page defined" without the key, which is what broke the popup's "All settings"
link. Nothing declared it before the popup was split out, because `default_popup` _was_
the options page. `open_in_tab` because the settings page is a full-width five-tab
screen; the embedded dialog Chrome otherwise shows is the cramped box the redesign
existed to escape.

**`web_accessible_resources` stays narrow.** Only the MAIN-world page-script chunks need
it, and the build plugin appends those hashed files itself. Never expose `pages/*` or a
broad `assets/*` — that only lets x.com fingerprint the extension.

**Firefox (`firefox.ts`) differs in three ways that all break the build or the linter:**

- No MV3 `background.service_worker`; the same module runs as a non-persistent
  background script. crxjs reads `manifest.background.scripts[0]` un-optional-chained
  when built with `browser: 'firefox'`, so the key MUST be the array form.
- `author` must be a plain string. Chrome's `{ email }` object is a hard
  `MANIFEST_FIELD_INVALID` in the AMO linter, and Chrome ignores the key anyway.
- `browser_specific_settings.gecko.id` is **permanent add-on identity**. Changing it
  after the first AMO submission creates a new add-on rather than an update. Renaming
  was only safe because nothing has been submitted yet.

`world: 'MAIN'` on a content script landed in Firefox 128; page-script.ts needs it to
patch the page's own fetch/XHR.
