# X Profile Location — Landing Page

Preact + Vite landing page deployed to Cloudflare Pages.

URL: [x-profile-location.pages.dev](https://x-profile-location.pages.dev)

## Structure

```text
landing/
├── public/                  # Static assets copied to dist/
│   ├── og-image.svg         # Source for OG/Twitter card image (1200×630)
│   ├── og-image.png         # Generated — do not edit directly
│   ├── promo-small.svg      # Source for Chrome store small tile (440×280)
│   ├── promo-marquee.svg    # Source for Chrome store marquee tile (1400×560)
│   ├── favicon.svg          # Source for apple-touch-icon
│   └── apple-touch-icon.png # Generated — do not edit directly
├── extension_store/         # Chrome Web Store submission assets
│   ├── description.md       # Store listing copy (short + detailed + what's new)
│   ├── promo-small.png      # 440×280
│   ├── promo-marquee.png    # 1400×560
│   ├── screen_1..4.png      # In-page screenshots (retake by hand from X)
│   └── screen_5.png         # Options page — generated, see shoot:options
├── scripts/
│   ├── generate-images.mjs  # Renders SVGs → PNGs via sharp
│   ├── shoot-options.mjs    # Renders the options page → screen_5.png
│   └── minify-html.mjs      # Post-build HTML minification
├── src/
│   ├── components/           # Homepage order matches app.tsx
│   │   ├── SiteHeader.tsx    # Sticky header; blurs once scrolled past 24px
│   │   ├── Hero.tsx          # Headline + XPanel, the tilting mock of X with the extension running
│   │   ├── Screenshots.tsx   # Real screenshots: tablist rail + native <dialog> lightbox
│   │   ├── HowItWorks.tsx    # Three steps — the "how can it even know?" answer
│   │   ├── SeeItInAction.tsx # Features: a 5-badge legend, then three showcases
│   │   ├── Trust.tsx         # What is never sent vs. what the cache sends
│   │   ├── Faq.tsx           # Native <details>; renders a route's `faq` array
│   │   ├── CTA.tsx           # Cyan-drenched closing fold
│   │   ├── Footer.tsx
│   │   ├── InstallButton.tsx # Browser-detected install link, `signal` / `void` tones
│   │   ├── Wordmark.tsx      # Favicon glyph reused as the site mark
│   │   ├── PrivacyPolicy.tsx
│   │   ├── AboutThisAccount.tsx  # Guide — /x-about-this-account
│   │   └── EngagementFarming.tsx # Guide — /spot-engagement-farming
│   ├── utils/
│   │   ├── browser.ts        # Browser detection for install links
│   │   └── constants.ts      # Store URLs
│   ├── routes.ts             # Every page as data — see Routing below
│   ├── seo.ts                # Per-route <head>, OG data, JSON-LD
│   ├── app.tsx
│   ├── main.tsx
│   └── index.css             # Design tokens, type scale, motion — see below
└── vite.config.ts            # Prerender plugin, sitemap, __EXT_VERSION__ define
```

## Routing

`src/routes.ts` is the single source of truth: path, title, description,
`noindex`, and an optional `faq` array. It is deliberately free of JSX imports,
because `vite.config.ts` reads it at config-load time to derive
`additionalPrerenderRoutes` and the sitemap's exclusions — importing a component
tree there would drag Preact through esbuild for nothing.

**Adding a page** is two steps: an entry in `routes.ts`, and a line in the
`GUIDES` map in `app.tsx` (or a branch, if it needs a different shape). The
`<head>`, canonical, prerender list and sitemap all follow from the route entry.

A route's `faq` array is rendered visibly by `<Faq>` _and_ emitted as FAQPage
structured data by `seo.ts`. Never reword one without the other — schema that
does not match the visible copy is a manual-action risk. `<Faq>` uses native
`<details>` for the same reason hydration is deferred: the answers have to be in
the prerendered HTML whether or not JS ever runs.

`siteUrl` guards against a local `VITE_SITE_URL`. Vite loads plain `.env` in
every mode, production builds included, and `pnpm deploy` ships whatever `dist`
this machine built — so `VITE_SITE_URL=http://localhost:5173` in `.env` used to
end up in the canonical and `og:url` of the live site. A localhost value is now
ignored when `import.meta.env.PROD` is set.

## Design system

Everything visual lives in `src/index.css`; components only compose tokens.

- **Palette.** OKLCH throughout. Surfaces are a cool near-black ramp
  (`--color-void` `#0b0b12`, matching `favicon.svg` and the store tiles, not X's
  pure black). `--color-signal` is the mark's cyan `#00d4c0` and carries the
  brand. The three meaning colours are not interchangeable: `--color-xblue` is
  _X's_ blue and appears only inside product mockups, `--color-attention` means
  highlighted, `--color-alarm` means blocked or VPN. Every text/background pair
  clears WCAG AA — see the audit note below before changing one.
- **Type.** Archivo (self-hosted latin variable subset) does display and body,
  with the weight axis alone carrying the contrast: 850 for display, 400 for
  body. **Do not re-add the `wdth` axis.** Google's variable Archivo with `wdth`
  is 88 kB against 34 kB without, and that 54 kB sat on the critical path to buy
  a headline 12% wider — worth about a second of mobile LCP. Azeret Mono is
  scoped to data readouts (`.t-data`, counts, endpoints) and must not leak into
  prose or headings.
- **Motion.** Hero entrances animate transform only, never opacity: LCP is not
  recorded until an element is visible, so a fade-in with a `backwards` fill put
  the hero paragraph's LCP at 3.7s all by itself. Scroll reveals use
  `animation-timeline: view()` behind `@supports`, with `forwards` fill — never
  `both`, which would hold everything below the fold at `opacity: 0` and ship
  the page blank to any renderer that does not scroll (full-page screenshots,
  print). `prefers-reduced-motion` disables all of it.
- **Stacking.** `--z-sticky` / `--z-backdrop` / `--z-modal` / `--z-toast`. No
  bare z-index numbers. The lightbox is a native `<dialog>`, so it renders in
  the top layer and gets its focus trap and Escape handling from the platform.

`__EXT_VERSION__` is the _extension's_ version, read from the root
`package.json` at build time so the badge in the hero and footer cannot drift
from what is on the store.

## Performance

`/` scores 100 across all four Lighthouse categories (mobile, simulated
throttling). The things holding it there, in case one looks removable:

- **Hydration runs on idle** (`main.tsx`). Every page is prerendered and every
  control works without JS — the install link is a real `<a href>` — so nothing
  is lost by waiting, and it takes total blocking time from 160 ms to 0.
- **The stylesheet stays external**, and the report's "Eliminate render-blocking
  resources · 150 ms" item is a false economy. Inlining was measured twice and
  scored _worse_ both times — 99 against 100, FCP 1.2s against 1.1s — because
  the extra ~9 kB per document costs more than the round trip it saves.
  Lighthouse's own two audits disagree about it: `render-blocking-resources`
  reports "0 ms savings" while the newer `render-blocking-insight` claims 150 ms.
  There is a note in `scripts/minify-html.mjs` so nobody re-does it.
- **Analytics only loads when there is an ID to send to.** `gtag` is ~87 kB,
  two thirds unused, and with `VITE_GA_MEASUREMENT_ID` empty (every local build)
  the page used to request `gtag/js?id=` and pull the whole payload for a
  property that does not exist. It now waits for idle _and_ checks the ID.
  On production, where the ID is set, GA is what puts "Reduce unused JavaScript"
  and "Avoid legacy JavaScript" back in the report — both are entirely inside
  Google's bundle, and neither is scored.
- **Screenshots ship as WebP**, full-size and at 320w for the thumbnail rail,
  generated by `generate-images.mjs`. The rail used to pull ~800 kB of
  full-resolution PNG to fill seven 128px thumbnails.
- **`public/_headers`** gives Cloudflare Pages the year-long immutable cache for
  `/assets/*` and `/fonts/*`. Without it, repeat visits refetch ~250 kB.

`/privacy-policy` scores 100 / 100 / 100 but 66 on SEO, because it carries
`noindex: true` in `routes.ts` (which also keeps it out of the sitemap). That is
a deliberate choice, not a defect — drop the flag if you would rather the policy
were searchable.

## Image workflow

Edit the SVG sources in `public/`, then regenerate PNGs:

```bash
pnpm generate:images   # or: node scripts/generate-images.mjs
```

The script reads `VITE_SITE_URL` from the environment (falls back to `https://x-profile-location.pages.dev`) and replaces the domain in SVG text before rendering.

`screen_5.png` — the options-page shot — _is_ generated. Build the extension first (`pnpm build` in the repo root), then:

```bash
xvfb-run --auto-servernum pnpm shoot:options   # drop xvfb-run if you have a display
```

It loads `dist/chrome` into a real Chrome, seeds representative settings, and writes exactly 1280×800. Which sections are expanded is the `SETTINGS` object at the top of the script — the page has to fit 800px tall, so expanding one usually means collapsing another (the script warns when it overflows). Rerun it whenever the options UI changes.

The in-page screenshots (`screen_1..4.png`) are still taken by hand from the live extension.

## Dev & deploy

```bash
pnpm dev        # vite dev server on :5173
pnpm build      # generate images + vite build + minify HTML → dist/
pnpm preview    # preview built dist/ on :5173
pnpm deploy     # wrangler pages deploy dist/
```
