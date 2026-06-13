/**
 * Generates static images from SVG templates:
 *   public/og-image.svg      → public/og-image.png           (1200×630, OG + Twitter Card)
 *   public/favicon.svg       → public/apple-touch-icon.png   (180×180, iOS home screen)
 *   public/promo-small.svg   → extension_store/promo-small.png   (440×280, Chrome store small tile)
 *   public/promo-marquee.svg → extension_store/promo-marquee.png (1400×560, Chrome store marquee tile)
 */
import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const landingDir = join(dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = join(landingDir, 'public')
const storeDir = join(landingDir, 'extension_store')
const siteUrl =
  process.env.VITE_SITE_URL ?? 'https://x-profile-location.pages.dev'

mkdirSync(storeDir, { recursive: true })

async function generate(
  srcPath,
  destPath,
  width,
  height,
  { noAlpha = false } = {},
) {
  const raw = readFileSync(srcPath, 'utf8')
  const svg = Buffer.from(
    raw.replace('x-profile-location.pages.dev', new URL(siteUrl).host),
  )
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
