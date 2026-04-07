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

async function generate(src, dest, width, height) {
  const svg = readFileSync(join(root, src))
  await sharp(svg).resize(width, height).png({ compressionLevel: 9 }).toFile(join(root, dest))
  console.log(`✓ ${dest} (${width}×${height})`)
}

await generate('og-image.svg', 'og-image.png', 1200, 630)
await generate('favicon.svg', 'apple-touch-icon.png', 180, 180)
