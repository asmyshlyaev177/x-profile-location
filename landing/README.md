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
├── extension_store/         # Generated PNGs for Chrome Web Store submission
│   ├── promo-small.png      # 440×280
│   ├── promo-marquee.png    # 1400×560
│   ├── screen1.png          # Store screenshots (update manually from browser)
│   └── screen2.png
├── scripts/
│   ├── generate-images.mjs  # Renders SVGs → PNGs via sharp
│   └── minify-html.mjs      # Post-build HTML minification
├── src/
│   ├── components/
│   │   ├── Hero.tsx          # Hero section with animated tilt hover-card mockup
│   │   ├── SeeItInAction.tsx # 2×2 feature cards with inline Preact previews
│   │   ├── CTA.tsx           # Bottom call-to-action
│   │   ├── Footer.tsx
│   │   ├── InstallButton.tsx # Browser-detected install link
│   │   └── PrivacyPolicy.tsx
│   ├── utils/
│   │   ├── browser.ts        # Browser detection for install links
│   │   └── constants.ts      # Store URLs
│   ├── seo.ts                # Meta tags / OG data
│   ├── app.tsx
│   ├── main.tsx
│   └── index.css             # Tailwind v4 theme + global styles
└── vite.config.ts            # Prerender plugin, sitemap
```

## Image workflow

Edit the SVG sources in `public/`, then regenerate PNGs:

```bash
pnpm generate:images   # or: node scripts/generate-images.mjs
```

The script reads `VITE_SITE_URL` from the environment (falls back to `https://x-profile-location.pages.dev`) and replaces the domain in SVG text before rendering.

Store screenshots (`screen1.png`, `screen2.png`) are not generated — retake them from the live extension when the UI changes.

## Dev & deploy

```bash
pnpm dev        # vite dev server on :5173
pnpm build      # generate images + vite build + minify HTML → dist/
pnpm preview    # preview built dist/ on :5173
pnpm deploy     # wrangler pages deploy dist/
```
