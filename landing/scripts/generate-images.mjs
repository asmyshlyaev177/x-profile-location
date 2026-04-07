/**
 * Generates static images from SVG templates:
 *   public/og-image.svg   → public/og-image.png  (1200×630, OG + Twitter Card)
 *   public/favicon.svg    → public/apple-touch-icon.png (180×180, iOS home screen)
 */
import sharp from 'sharp'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'public')
const siteUrl = process.env.VITE_SITE_URL ?? 'https://x-profile-location.pages.dev'

async function generate(src, dest, width, height) {
  const raw = readFileSync(join(root, src), 'utf8')
  const svg = Buffer.from(raw.replace('x-profile-location.pages.dev', new URL(siteUrl).host))
  await sharp(svg).resize(width, height).png({ compressionLevel: 9 }).toFile(join(root, dest))
  console.log(`✓ ${dest} (${width}×${height})`)
}

await generate('og-image.svg', 'og-image.png', 1200, 630)
await generate('favicon.svg', 'apple-touch-icon.png', 180, 180)
