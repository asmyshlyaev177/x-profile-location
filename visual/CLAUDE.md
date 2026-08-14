# `visual` — the layout suite

`pnpm test:visual`. Headless, no session, no HARs — runs in CI on every push.

Exists because happy-dom has no layout engine — no boxes, no cascade, no CSS
Custom Highlight API. Every bug the injected UI has shipped with (buttons
stretched by X's flex column, pieces inserted in reverse order, a placeholder
margin knocking a button out of its row) was invisible to a unit test.

Fixtures are **hardcoded HTML** standing in for X's DOM with our markup in it. The
stylesheet is **not** a copy — `openFixture()` imports `CONTENT_CSS` from
`src/scripts/styles.ts`, so the suite fails when shipped rules change. Anything a
fixture needs a rule of its own to look right is a rule that belongs in the extension.

`popup.html` is our own page and its stylesheet is a CSS module, so
`openPopupFixture()` reads `src/pages/popup.module.css` off disk (Vite hashes
those names and Playwright's loader wouldn't resolve the import). Rename a class
in one place only and the element goes unstyled — which is why
`the fixture is wearing the real stylesheet` asserts two concrete values first.

Assertions are **layout facts** (boxes, computed styles), never pixel diffs — a
screenshot baseline compares font rendering as much as layout and teaches everyone
to re-baseline without looking. `expectSameRow`, `right()`, `styleOf()` in
`visual/helpers.ts` are the vocabulary.

⚠️ Two traps:

- **`outline-width` is not a signal** — Chrome computes it as `medium` (3px)
  whether or not anything is drawn. Assert `outline-style`.
- **`sheet.cssRules` throws on a `file://` `<link>`** (cross-origin for CSSOM).
  Wrap the walk in try/catch.

Anything the extension draws into X — a new element, class, chip or tone — owes a
`visual/fixtures/*.html` entry **and** assertions in the matching spec.
