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
