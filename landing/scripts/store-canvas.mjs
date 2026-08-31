// Turns the landing screenshots into Chrome Web Store screenshots.
//
//   pnpm shots      (from the repo root — retakes the captures, then runs this)
//
// The store accepts exactly 1280×800 and nothing else, while a capture is the
// size of the thing it photographs: a hover card is ~300px wide. So each one is
// centred on the canvas at its own scale rather than stretched to fill it — a
// hover card blown up to 1280px wide reads as a mockup, not a screenshot.
//
// `screen_5.png` is not made here: the options page is captured at store size
// directly by `shoot-options.mjs`, which has a whole page to work with.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO = path.resolve(__dirname, '..', '..')
const LANDING = path.join(REPO, 'landing', 'public')
const STORE = path.join(REPO, 'landing', 'extension_store')

const WIDTH = 1280
const HEIGHT = 800
/** Margin around the shot, so it reads as presented rather than cropped. */
const INSET = 50

// Ordered as the listing shows them: the feed with a post filtered away, the
// copied proof, the hover card, the VPN warning. screen_5 (options, blocked
// locations) comes from shoot-options.mjs.
const SHOTS = [
  ['Hidden_screenshot-x-profile-location.png', 'screen_1.png'],
  ['Copy_screenshot-x-profile-location.png', 'screen_2.png'],
  ['Hover_screenshot-x-profile-location.png', 'screen_3.png'],
  ['VPN_screenshot-x-profile-location.png', 'screen_4.png'],
]

for (const [from, to] of SHOTS) {
  const inner = await sharp(path.join(LANDING, from))
    .resize({
      width: WIDTH - INSET * 2,
      height: HEIGHT - INSET * 2,
      fit: 'inside',
    })
    .toBuffer()

  await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      // The options-page shot's own background, so the listing's five images
      // sit on one colour.
      background: '#f7f8f9',
    },
  })
    .composite([{ input: inner, gravity: 'centre' }])
    .png()
    .toFile(path.join(STORE, to))

  console.log(`${to}  ←  ${from}`)
}
