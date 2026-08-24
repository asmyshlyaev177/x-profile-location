/**
 * Generates static images from SVG templates:
 *   public/og-image.svg      → public/og-image.png           (1200×630, OG + Twitter Card)
 *   src/data/brand-mark.json → public/favicon.svg            (the one place the site's mark is written)
 *   public/favicon.svg       → public/apple-touch-icon.png   (180×180, iOS home screen)
 *   public/promo-small.svg   → extension_store/promo-small.png   (440×280, Chrome store small tile)
 *   public/promo-marquee.svg → extension_store/promo-marquee.png (1400×560, Chrome store marquee tile)
 *
 * …and derivatives of the hand-taken screenshots in public/:
 *   <shot>.png → <shot>.webp        (same size, ~75% smaller)
 *   <shot>.png → <shot>-thumb.webp  (320w, for the 128px-wide gallery rail)
 * The rail was pulling ~800 KiB of full-resolution PNG to fill seven thumbnails.
 */
import sharp from 'sharp'
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const landingDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(landingDir, 'public')
const storeDir = join(landingDir, 'extension_store')
const siteUrl = process.env.VITE_SITE_URL ?? 'https://x-pat.pages.dev'
/**
 * The host written into the SVG templates, swapped for the real one below so a
 * preview build's images don't advertise production. Must stay in sync with the
 * literal text in `public/*.svg` — keep both on the production host so the
 * templates still read correctly when opened on their own.
 */
const TEMPLATE_HOST = 'x-pat.pages.dev'

mkdirSync(storeDir, { recursive: true })

async function generate(
  srcPath,
  destPath,
  width,
  height,
  { noAlpha = false } = {},
) {
  const raw = readFileSync(srcPath, 'utf8')
  const svg = Buffer.from(raw.replace(TEMPLATE_HOST, new URL(siteUrl).host))
  let pipeline = sharp(svg).resize(width, height)
  if (noAlpha) pipeline = pipeline.flatten({ background: '#0b0b12' })
  await pipeline.png({ compressionLevel: 9 }).toFile(destPath)
  console.log(
    `✓ ${destPath.replace(landingDir + '/', '')} (${width}×${height})`,
  )
}

await generate(
  join(publicDir, 'og-image.svg'),
  join(publicDir, 'og-image.png'),
  1200,
  630,
)
/**
 * The favicon is *generated*, not hand-written: the site's wordmark draws the
 * same path, and two hand-copied path strings is two chances to fix a curve in
 * one of them.
 * `src/data/brand-mark.json` is the one place it lives — JSON so this plain
 * Node script can read it without a TypeScript loader.
 */
const mark = JSON.parse(
  readFileSync(join(landingDir, 'src', 'data', 'brand-mark.json'), 'utf8'),
)
writeFileSync(
  join(publicDir, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${mark.viewBox}">
  <rect width="32" height="32" rx="${mark.radius}" fill="${mark.plate}"/>
  <path d="${mark.path}" fill="${mark.signal}"/>
</svg>
`,
)
console.log('✓ public/favicon.svg (from src/data/brand-mark.json)')

await generate(
  join(publicDir, 'favicon.svg'),
  join(publicDir, 'apple-touch-icon.png'),
  180,
  180,
)
await generate(
  join(publicDir, 'promo-small.svg'),
  join(storeDir, 'promo-small.png'),
  440,
  280,
  { noAlpha: true },
)
await generate(
  join(publicDir, 'promo-marquee.svg'),
  join(storeDir, 'promo-marquee.png'),
  1400,
  560,
  { noAlpha: true },
)

/** The hand-taken screenshots shown in the gallery, by filename in public/. */
const SHOTS = [
  'Hover_screenshot-x-profile-location.png',
  'VPN_screenshot-x-profile-location.png',
  'Flags_screenshot-x-profile-location.png',
  'Hidden_screenshot-x-profile-location.png',
  'Highlight_screenshot-x-profile-location.png',
  'Highlight2_screenshot-x-profile-location.png',
  'swipe_right.png',
]

const kb = (n) => `${Math.round(n / 1024)} kB`

for (const file of SHOTS) {
  const src = join(publicDir, file)
  const base = file.replace(/\.png$/, '')
  const before = statSync(src).size

  await sharp(src)
    .webp({ quality: 82, effort: 6 })
    .toFile(join(publicDir, `${base}.webp`))
  await sharp(src)
    .resize({ width: 320, withoutEnlargement: true })
    .webp({ quality: 74, effort: 6 })
    .toFile(join(publicDir, `${base}-thumb.webp`))

  const full = statSync(join(publicDir, `${base}.webp`)).size
  const thumb = statSync(join(publicDir, `${base}-thumb.webp`)).size
  console.log(
    `✓ ${base}: png ${kb(before)} → webp ${kb(full)}, thumb ${kb(thumb)}`,
  )
}
