# `landing` — the site, and its Lighthouse gate

`pnpm test:lighthouse` → `landing/tests/lighthouse.spec.ts`, driven by
`landing/playwright.lighthouse.config.ts`. Everything (including the ~100 MB
`lighthouse` dependency) lives in `landing/`; `.github/workflows/lighthouse.yml`
runs it on changes under `landing/**` and nowhere else.

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

**Desktop config, four categories, 100 on each** — all six pages, measured August 2026. Mobile is not what runs (`/` reproduces at 99). Lighthouse 13's fifth
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
write must stay **idempotent**.

⚠ The site's mark (`landing/src/data/brand-mark.json`, cyan X on a dark plate →
`landing/public/favicon.svg`) is **not** the extension icon
(`src/assets/icons/*.png`, blue X + question mark). Anything on the site uses the
first; anything shown to a user as "the icon" uses the second.
