// Builds extension_store/promo.mp4 — the store/YouTube promo, 1280×720, silent.
//
//   pnpm promo:video            (from landing/)
//
// The slides are the landing screenshots the shot harness already produces, so
// the video cannot show a UI the site doesn't. Composition is a real page in
// Chromium — the site's fonts and tokens, no second palette to keep in sync —
// captured with Playwright's recorder and transcoded to h264.
//
// A slide may name `video` instead of `img` (a clip out of `pnpm shots`); it is
// autoplayed muted and held for the slide's duration.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LANDING = path.resolve(__dirname, '..')
const PUBLIC = path.join(LANDING, 'public')
/** Frames written by `pnpm promo:shots` — the video's own pictures, never the
 *  listing's. See the promo section of e2e/screenshots.test.ts. */
const SHOTS = path.join(LANDING, 'extension_store', 'promo')
const OUT =
  process.argv[2] ?? path.join(LANDING, 'extension_store', 'promo.mp4')

const W = 1280
const H = 720
/** Seconds each card holds, and how long consecutive cards overlap. */
const HOLD = 3.8
const CARD = { intro: 3.2, outro: 3.6 }
const FADE = 0.45
/** Past this a 2× capture is being stretched beyond its own pixels. */
const MAX_UPSCALE = 1.6

const SLIDES = [
  {
    img: 'hover.png',
    kicker: 'Hover',
    line: 'X already knows the country. It just never shows you.',
  },
  {
    img: 'feed.png',
    kicker: 'In the feed',
    line: 'Accounts already known carry their flag inline. The rest fill in as you hover.',
  },
  {
    img: 'collapsed.png',
    kicker: 'Filters',
    line: 'Collapse or hide whole countries and regions.',
  },
  {
    img: 'keyword.png',
    kicker: 'Keywords',
    line: 'Highlight the bios you came for, spare an account in one click.',
  },
  {
    img: 'popup.png',
    kicker: 'Mid-scroll',
    line: 'Both filters, editable without leaving the timeline.',
  },
]

const mark = JSON.parse(
  readFileSync(path.join(LANDING, 'src', 'data', 'brand-mark.json'), 'utf8'),
)
const version = JSON.parse(
  readFileSync(path.join(LANDING, '..', 'package.json'), 'utf8'),
).version

const tokens = readFileSync(
  path.join(
    LANDING,
    'node_modules',
    '@asmyshlyaev177',
    'design-tokens',
    'tokens.css',
  ),
  'utf8',
)

/** The hues are this project's identity — read them rather than restate them. */
const siteCss = readFileSync(path.join(LANDING, 'src', 'index.css'), 'utf8')
const hue = (name) =>
  siteCss.match(new RegExp(`--${name}-hue:\\s*([\\d.]+)`))[1]

/** Everything is inlined: a `setContent` page is `about:blank`, which may load
 *  no file:// subresource at all. */
const inline = (file, mime, dir = SHOTS) =>
  `data:${mime};base64,${readFileSync(path.join(dir, file)).toString('base64')}`

const font = (file) =>
  `url(${inline(path.join('fonts', file), 'font/woff2', PUBLIC)}) format('woff2')`

/** Box the shot sits in, and the scale that fills it without going past 1×·MAX. */
const SHOT_BOX = { w: 660, h: 560 }
async function shotSize(slide) {
  const { width, height } = await sharp(path.join(SHOTS, slide.img)).metadata()
  // Every frame comes out of `pnpm promo:shots`, which captures at SHOT_DPR=2.
  const [w, h] = [width / 2, height / 2]
  const scale = Math.min(MAX_UPSCALE, SHOT_BOX.w / w, SHOT_BOX.h / h)
  return { width: Math.round(w * scale), height: Math.round(h * scale) }
}

const at = []
let clock = 0.6 // a beat of ground before the first card
for (const seconds of [CARD.intro, ...SLIDES.map(() => HOLD), CARD.outro]) {
  at.push({ start: clock, seconds })
  clock += seconds - FADE
}
const TOTAL = clock + FADE

const markSvg = (size, plate) => `
  <svg viewBox="${mark.viewBox}" width="${size}" height="${size}" aria-hidden="true">
    ${plate ? `<rect width="32" height="32" rx="${mark.radius}" fill="${mark.plate}"/>` : ''}
    <path d="${mark.path}" fill="${mark.signal}"/>
  </svg>`

async function html() {
  const shots = await Promise.all(SLIDES.map(shotSize))

  const media = (slide, size) =>
    slide.video
      ? `<video src="${inline(slide.video, 'video/mp4')}" width="${size.width}" autoplay muted></video>`
      : `<img src="${inline(slide.img, 'image/png')}" width="${size.width}" height="${size.height}">`

  const cards = [
    `<section class="card intro" style="--at:${at[0].start}s;--for:${at[0].seconds}s">
       <div class="brand">${markSvg(56, true)}<span>X-Pat</span></div>
       <h1>See where any X profile is <em>really from</em></h1>
       <p class="sub">Country flag, VPN badge and source platform — read from X's own data.</p>
     </section>`,
    ...SLIDES.map(
      (slide, i) => `
      <section class="card shot" style="--at:${at[i + 1].start}s;--for:${at[i + 1].seconds}s">
        <div class="copy">
          <span class="kicker">${slide.kicker}</span>
          <p class="line">${slide.line}</p>
        </div>
        <figure>${media(slide, shots[i])}</figure>
      </section>`,
    ),
    `<section class="card outro" style="--at:${at.at(-1).start}s;--for:${at.at(-1).seconds}s">
       <div class="brand">${markSvg(56, true)}<span>X-Pat</span></div>
       <h2>Free · open source · no account, no API key</h2>
       <p class="sub">Chrome · Edge · Brave · Lemur Browser — v${version}</p>
       <p class="cta">Add to Chrome</p>
     </section>`,
  ].join('\n')

  return `<!doctype html>
<html class="dark" lang="en"><head><meta charset="utf-8"><style>
@font-face{font-family:Archivo;src:${font('archivo-latin-var.woff2')};font-weight:100 900}
@font-face{font-family:'Azeret Mono';src:${font('azeret-mono-latin-var.woff2')};font-weight:100 900}
${tokens}
:root{--brand-hue:${hue('brand')};--accent-hue:${hue('accent')};--neutral-hue:${hue('neutral')}}
*{margin:0;padding:0;box-sizing:border-box}
body{width:${W}px;height:${H}px;overflow:hidden;background:var(--bg);color:var(--ink);
  font-family:Archivo,system-ui,sans-serif;-webkit-font-smoothing:antialiased}
body::after{content:'';position:fixed;inset:0;pointer-events:none;
  background:radial-gradient(120% 80% at 80% 0%,color-mix(in oklab,var(--primary) 22%,transparent),transparent 60%)}
.card{position:absolute;inset:0;display:grid;align-content:center;gap:28px;padding:0 84px;
  opacity:0;animation:card var(--for) both;animation-delay:var(--at)}
@keyframes card{
  0%{opacity:0;transform:translateY(14px) scale(.995)}
  ${((FADE / HOLD) * 100).toFixed(1)}%{opacity:1;transform:none}
  ${(100 - (FADE / HOLD) * 100).toFixed(1)}%{opacity:1;transform:none}
  100%{opacity:0;transform:scale(1.006)}}
.intro,.outro{justify-items:center;text-align:center}
.brand{display:flex;align-items:center;gap:14px;font-size:34px;font-weight:700;letter-spacing:-.02em}
h1{font-size:60px;font-weight:800;line-height:1.05;letter-spacing:-.03em;max-width:20ch}
h1 em{font-style:normal;color:var(--accent-on-soft)}
h2{font-size:40px;font-weight:700;letter-spacing:-.02em}
.sub{font-size:22px;color:var(--muted);max-width:44ch;line-height:1.4}
.cta{margin-top:8px;padding:14px 30px;border-radius:999px;font-size:22px;font-weight:700;
  background:var(--primary);color:var(--on-primary)}
.shot{grid-template-columns:1fr auto;align-items:center;gap:56px}
.kicker{font-family:'Azeret Mono',monospace;font-size:15px;font-weight:600;letter-spacing:.16em;
  text-transform:uppercase;color:var(--accent-on-soft)}
.line{margin-top:16px;font-size:38px;font-weight:700;line-height:1.15;letter-spacing:-.02em}
/* The frame carries the drift, not the image inside it: a transform on the
   image alone escapes the padding and clips against the frame's border. */
figure{display:grid;place-items:center;padding:18px;border-radius:20px;
  background:var(--surface);border:1px solid var(--line);
  box-shadow:0 40px 90px -50px rgba(0,0,0,.95);
  animation:kb var(--for) both linear;animation-delay:var(--at)}
figure img,figure video{display:block;border-radius:10px}
@keyframes kb{from{transform:scale(1)}to{transform:scale(1.045)}}
.bar{position:fixed;left:0;bottom:0;height:3px;width:100%;transform-origin:left;
  background:var(--accent);transform:scaleX(0);animation:bar ${TOTAL}s linear both}
@keyframes bar{to{transform:scaleX(1)}}
body{animation-play-state:paused}
body *,body::after{animation-play-state:inherit}
body.go{animation-play-state:running}
</style></head><body>${cards}<div class="bar"></div></body></html>`
}

const dir = mkdtempSync(path.join(os.tmpdir(), 'promo-'))
const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  recordVideo: { dir, size: { width: W, height: H } },
})
const page = await context.newPage()
await page.setContent(await html())
await page.evaluate(() => document.fonts.ready)
await page.evaluate(() => document.body.classList.add('go'))
await page.waitForTimeout(TOTAL * 1000 + 300)
const webm = await page.video().path()
await context.close()
await browser.close()

execFileSync(
  'ffmpeg',
  [
    '-y',
    '-i',
    webm,
    '-r',
    '30',
    '-c:v',
    'libx264',
    '-crf',
    '20',
    '-preset',
    'veryslow',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    OUT,
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
)
rmSync(dir, { recursive: true, force: true })
console.log(`wrote ${path.relative(LANDING, OUT)}  ${TOTAL.toFixed(1)}s`)
