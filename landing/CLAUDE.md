# `landing` — the site, and its rendered-output gates

`pnpm test:audits` is the whole gate: the token contract, then
`tests/a11y.spec.ts`, then `tests/lighthouse.spec.ts`, driven by
`landing/playwright.audits.config.ts`. Both specs need the same production
build on the :5174 preview, so one config builds it once for both. Everything
(including the ~100 MB `lighthouse` dependency) lives in `landing/`, and the
`audits` job in `.github/workflows/tests.yml` runs it on every push and PR.

⚠ **Don't add a `paths: landing/**`filter to that job.**`pnpm install`resolves the whole workspace, so the runner pays for the`lighthouse`dependency either way — a filter saves the build and the audit, not the
download — and`landing/\*\*`does not match a root`pnpm-lock.yaml`, so a
shared-token bump could put the site's contrast in the red with nothing red to
show for it.

The a11y suite runs parallel, Lighthouse serial and last: `dependencies` holds the
project back, and its single `mode: 'serial'` describe is what pins it to one
worker. Split that describe and two audits get a browser each. To iterate on
one spec, filter the run:
`pnpm exec playwright test -c playwright.audits.config.ts tests/a11y.spec.ts`.

It audits the **production build**, never `vite dev`: `webServer` runs
`pnpm build && pnpm preview:lighthouse` on **port 5174** — deliberately not 5173,
which both `dev` and `preview` use, so a dev server left running can't be silently
accepted in place of the build. Preview also applies `serveFlatHtml`, which makes
`/about` resolve to `about.html` the way Pages does; under the dev server every
subroute falls through to the SPA fallback and the suite would audit the homepage
six times over.

**Pages come from `routes.ts`**, which is already the site's one source of pages
(head, canonical, prerender list, sitemap), so a new page is audited the moment it
exists.

**Desktop config, four categories, 100 on each** — all seven pages, measured August 2026. Mobile is not what runs (`/` reproduces at 99). Lighthouse 13's fifth
category `agentic-browsing` scores 100 everywhere but is deliberately not gated:
Google is still moving its weights.

**The two `noindex` pages cannot score 100 on SEO** and are not asked to.
`is-crawlable` is _meant_ to fail on `/privacy-policy` and `/404`. Rather than
exempt them and lose the rest of the category, the spec names the one audit
allowed to fail:

```ts
expect(failed).toEqual(['is-crawlable'])
```

That asserts both halves — that `noindex: true` really reached the shipped
document, and that nothing else in SEO regressed.

⚠ `opts.onlyCategories` is **pinned explicitly**. `playAudit` otherwise derives it
from the threshold keys, so dropping `seo` for the `noindex` pages would stop the
category running at all and take `is-crawlable` with it — the assertion would pass
against an empty array and check nothing.

⚠ The landing build rewrites the comparison table in the repo `README.md`
(`readmeComparison` in `landing/vite.config.ts`). CI builds the site, so that
write must stay **idempotent** — the committed block is the generator's output
verbatim, unpadded cells and all. It was hand-aligned for a while and every
build undid that, so a CI run left the tree dirty.

⚠ The test count in that table is **generated, not typed**: `pnpm tests:count`
(`scripts/count-tests.mjs`) collects with `vitest list` and writes
`landing/src/data/test-count.ts`, which `ComparisonTable` and
`comparison-markdown` fill into the `{count}` in `comparison.testCount`. Run it
after adding tests. The hand-typed number said 609 while the suite had grown to
1007; counting `it(` with a regex misses `it.each` and lands on 799.

⚠ The site's mark (`landing/src/data/brand-mark.json`, cyan X on a dark plate →
`landing/public/favicon.svg`) is **not** the extension icon
(`src/assets/icons/*.png`, blue X + question mark). Anything on the site uses the
first; anything shown to a user as "the icon" uses the second.

## Accessibility

Three gates, each seeing what the other two cannot.

`pnpm test:tokens` (`check-tokens src/index.css`) resolves the shared ramp at
this site's hues — 183/183/284 — and measures the 38 pairs the contract names
against WCAG 2 AA and APCA. It proves the token file is sound, and nothing
about which tokens a page reached for.

`tests/a11y.spec.ts` runs axe and `auditContrast` against one loaded page —
every route plus the open lightbox, English only (the locale changes the font
stack, not the pixels). Every assertion is `expect.soft`, so one half cannot
hide the other.

- **axe** at `COMPREHENSIVE_TAGS` (WCAG 2.0/2.1/2.2 A and AA, plus
  `best-practice`), its own contrast rules off by package default. `incomplete`
  is asserted on, so a "needs review" finding gets a decision once instead of
  sitting unread. Opening the lightbox is what gives `aria-dialog-name`,
  `aria-hidden-focus` and `nested-interactive` anything to say.
- **Rendered contrast** over every visible text node, on both models.

The floor is **Lc 60**, the weakest the contract grants anything at body size —
not `--muted`'s 70. A DOM node does not say which token it used, so a stricter
floor fails sanctioned tokens. A finding means a component chose the wrong
colour, and the three it caught here name the rules:

- **A border token is not a text colour.** `--line-strong` as an arrow glyph
  measured 1.59:1.
- **No alpha tints of text tokens.** A tint has no checked floor;
  `text-muted/70`, `text-accent/90` and `text-bg/75` sat at Lc 43–59. Accent
  text is `--accent-on-soft`, never `--accent` — that one is a fill.
- **The meaning colours are text, so they answer to the text floor.**

### Re-deriving `--color-xblue` / `--color-alarm`

Both are worn as small bold labels on a tint of themselves. To move one, raise
its OKLCH lightness at fixed hue until the **worst** ground it sits on clears
Lc 62 (two points of margin over the suite's floor), capping chroma at the
largest value that still round-trips through sRGB at that lightness — declare
more and the browser clamps it, so the file stops naming the colour on screen.

⚠ The worst ground is not the obvious one. X's blue chip sits _inside_ an
alarm-tinted row on the homepage, so it is measured against a tint of a tint.
Enumerate the grounds from the failing selectors the suite prints rather than
assuming the flat surface.

⚠ **The audit cannot await a scroll-driven animation.** `.reveal` rides
`animation-timeline: view()`, whose `finished` promise never settles while the
element is in range, so every page hit the 180s timeout. The helper skips any
animation off the document timeline — that fix ships in
`@asmyshlyaev177/design-tokens`, so the version in the lockfile matters.

## Promo video

`pnpm promo:video` (this workspace) builds `extension_store/promo.mp4` — 1280×720,
silent, ~25s — from the frames `pnpm promo:shots` writes to
`extension_store/promo/` in the repo root.

The slides are composed as a real page in Chromium (this site's fonts and the
design-token palette, hues read out of `src/index.css` so the video cannot drift
from the site), recorded with Playwright and transcoded to h264. Captions live
in the script's `SLIDES`. A slide may name `video:` instead of `img:` for a clip.

The Chrome Web Store takes a **YouTube URL** and no other video: there is no
upload, and no other host is accepted. Upload it unlisted and paste the link.
