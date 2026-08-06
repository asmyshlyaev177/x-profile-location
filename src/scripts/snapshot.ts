// Snapshot a live element to a PNG, keeping the styles it is actually wearing.
// Beats drawing a card by hand: avatar, badges, media and quoted tweets come
// free, and it stays right when X changes its layout.
//
// Clone the node, inline every computed style, re-embed every image as a data
// URI, then draw it through <foreignObject>. Steps two and three cannot be
// skipped: an SVG data URL is a restricted context, where no stylesheet of the
// page applies and no external resource is fetched.
//
// X's own webfont is behind such a URL, so text falls back to the system sans
// serif — close, not identical. Embedding it would mean shipping it.
//
// Every step degrades rather than aborting; the caller keeps the hand-drawn card
// for when the whole thing fails.

/**
 * The computed properties copied onto the clone — curated, not everything
 * getComputedStyle returns. A tweet is ~200 elements × ~340 properties, and the
 * data URL that produces is large enough to become its own problem.
 */
const STYLE_PROPS = [
  'box-sizing',
  'display',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'float',
  'clear',
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border-top-width',
  'border-right-width',
  'border-bottom-width',
  'border-left-width',
  'border-top-style',
  'border-right-style',
  'border-bottom-style',
  'border-left-style',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'border-top-left-radius',
  'border-top-right-radius',
  'border-bottom-left-radius',
  'border-bottom-right-radius',
  'background-color',
  // X draws avatars as <img> on some surfaces and background-image on others;
  // without these the second kind copies as a blank circle.
  'background-image',
  'background-size',
  'background-position',
  'background-repeat',
  'color',
  'opacity',
  'box-shadow',
  'font-family',
  'font-size',
  'font-style',
  'font-weight',
  'font-variant',
  'line-height',
  'letter-spacing',
  'word-spacing',
  'text-align',
  'text-decoration-line',
  'text-decoration-color',
  'text-indent',
  'text-transform',
  'text-overflow',
  'white-space',
  'word-break',
  'overflow-wrap',
  'vertical-align',
  'list-style-type',
  'overflow-x',
  'overflow-y',
  'flex-direction',
  'flex-wrap',
  'flex-grow',
  'flex-shrink',
  'flex-basis',
  'align-items',
  'align-self',
  'align-content',
  'justify-content',
  'gap',
  'row-gap',
  'column-gap',
  'grid-template-columns',
  'grid-template-rows',
  'grid-column',
  'grid-row',
  'object-fit',
  'object-position',
  'transform',
  'transform-origin',
  'fill',
  'stroke',
  'stroke-width',
  'visibility',
] as const

/** Inline `source`'s computed styles onto `clone`, and the same for every descendant. */
export function inlineStyles(source: Element, clone: Element): void {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll('*'))]
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))]
  // Structurally identical, so the walks stay in step; if they ever don't, the
  // shorter one wins rather than pairing the wrong nodes.
  const count = Math.min(sourceNodes.length, cloneNodes.length)

  for (let i = 0; i < count; i++) {
    const from = sourceNodes[i]
    const to = cloneNodes[i]
    if (!(to instanceof HTMLElement) && !(to instanceof SVGElement)) continue

    const computed = getComputedStyle(from)
    let css = ''
    for (const prop of STYLE_PROPS) {
      const value = computed.getPropertyValue(prop)
      if (value) css += `${prop}:${value};`
    }
    to.setAttribute('style', css)
  }
}

/**
 * Let an inserted element's ancestors grow around it.
 *
 * A computed height is always a pixel value — the height before the insertion —
 * so every ancestor is pinned to a box with no room, and the new row overflows
 * or is clipped by an `overflow: hidden` further up. Clearing the chain from the
 * insertion point to the root back to `auto` is enough.
 */
export function allowGrowth(from: Element, root: Element): void {
  let node: Element | null = from
  while (node) {
    if (node instanceof HTMLElement) {
      node.style.height = 'auto'
      node.style.minHeight = '0'
      node.style.maxHeight = 'none'
      node.style.overflow = 'visible'
    }
    if (node === root) break
    node = node.parentElement
  }
}

/**
 * Stop text being cut off with an ellipsis.
 *
 * X sizes its `text-overflow: ellipsis` boxes for its own webfont. The fallback
 * font is wider, so text that fitted on the page comes out as "Some Very Long
 * Nam…". Only the elements set to truncate are touched, and they size to their
 * content — preserving the exact box would preserve the bug.
 */
export function unclampText(clone: Element): void {
  for (const el of Array.from(clone.querySelectorAll<HTMLElement>('*'))) {
    if (el.style.textOverflow !== 'ellipsis') continue
    el.style.textOverflow = 'clip'
    el.style.overflow = 'visible'
    el.style.maxWidth = 'none'
    el.style.width = 'auto'
    el.style.flexBasis = 'auto'
  }
}

/**
 * The box the clone actually needs, by laying it out off-screen — every style is
 * already inlined, so it lays out exactly as the SVG will. Guessing came first
 * (a flat 80px of slack) and left a band of dead background under every post.
 *
 * Measured from the union of every descendant's box: overflow doesn't widen a
 * parent's rect, so the root alone gives back the width unclampText was
 * deliberately allowed to exceed, and the viewport clips the handle off.
 */
export function measureClone(
  clone: Element,
  width: number,
): { width: number; height: number } {
  const host = document.createElement('div')
  host.setAttribute(
    'style',
    `position:absolute;left:-99999px;top:0;width:${width}px;` +
      'visibility:hidden;pointer-events:none;',
  )
  host.appendChild(clone)
  document.body.appendChild(host)

  const root = clone.getBoundingClientRect()
  let right = root.right
  let bottom = root.bottom
  for (const el of Array.from(clone.querySelectorAll('*'))) {
    const rect = el.getBoundingClientRect()
    // Hidden elements and decorations; counting them stretches the image to
    // reach something invisible.
    if (rect.width === 0 && rect.height === 0) continue
    if (rect.right > right) right = rect.right
    if (rect.bottom > bottom) bottom = rect.bottom
  }

  // The clone is handed back to the caller to serialize, so it only visits.
  host.removeChild(clone)
  host.remove()

  return {
    width: Math.ceil(right - root.left),
    height: Math.ceil(bottom - root.top),
  }
}

/** A blob as a `data:` URI. */
function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => resolve(String(reader.result)))
    reader.addEventListener('error', () =>
      reject(new Error('could not read image')),
    )
    reader.readAsDataURL(blob)
  })
}

/**
 * A post photo can be megabytes, base64'd inside a data URL that is then
 * URL-encoded. Two of those is a string big enough to be its own failure mode.
 */
const MAX_IMAGE_EDGE = 1400

// Below this, decoding to measure costs more than it could save. Avatars and
// emoji — most of what gets inlined — never come close.
const SHRINK_THRESHOLD_CHARS = 400_000

/** Re-encode an oversized image down to MAX_IMAGE_EDGE, or pass it through. */
async function shrinkIfHuge(dataUrl: string): Promise<string> {
  if (dataUrl.length <= SHRINK_THRESHOLD_CHARS) return dataUrl
  const img = await loadImage(dataUrl, 5_000).catch(() => null)
  if (!img) return dataUrl
  const longest = Math.max(img.naturalWidth, img.naturalHeight)
  if (longest <= MAX_IMAGE_EDGE) return dataUrl

  const ratio = MAX_IMAGE_EDGE / longest
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(img.naturalWidth * ratio)
  canvas.height = Math.round(img.naturalHeight * ratio)
  const ctx = canvas.getContext('2d')
  if (!ctx) return dataUrl
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
  // JPEG: only photos reach here, and the size saving is the point.
  return canvas.toDataURL('image/jpeg', 0.9)
}

/** A grey box of the same size, so losing a resource doesn't collapse the layout. */
function placeholderFor(el: Element, glyph: string): HTMLElement {
  const box = document.createElement('div')
  box.setAttribute(
    'style',
    `${el.getAttribute('style') ?? ''};display:flex;align-items:center;` +
      'justify-content:center;background:rgba(128,128,128,0.22);' +
      'border-radius:12px;color:rgba(255,255,255,0.72);font-size:26px;',
  )
  box.textContent = glyph
  return box
}

/**
 * Swap `<video>` for something that can render: there is no playback in the
 * restricted context, so a post with a video would come out with a hole in it.
 * X's `poster` is the frame the user is looking at anyway; without one it
 * becomes a play-glyph box.
 *
 * Runs after the styles are inlined, so the replacement inherits the video's box
 * and the surrounding layout doesn't move.
 */
export function replaceVideos(clone: Element): void {
  for (const video of Array.from(clone.querySelectorAll('video'))) {
    const poster = video.getAttribute('poster')
    if (poster) {
      const img = document.createElement('img')
      img.setAttribute('src', poster)
      img.setAttribute(
        'style',
        `${video.getAttribute('style') ?? ''};object-fit:cover;`,
      )
      video.replaceWith(img)
    } else {
      video.replaceWith(placeholderFor(video, '▶'))
    }
  }
}

/** Every `url(...)` in a background-image, so those can be inlined too. */
function backgroundUrls(value: string): string[] {
  return [...value.matchAll(/url\(["']?(.*?)["']?\)/g)]
    .map((m) => m[1])
    .filter((u) => u && !u.startsWith('data:'))
}

/**
 * Re-embed every image the clone references as a data URI — anything left
 * pointing at a URL silently disappears inside the SVG.
 *
 * `credentials: 'omit'`: these are public CDN assets and a snapshot has no
 * business carrying cookies. Redrawing the loaded element onto a canvas would
 * skip the round trip, but X loads its images without `crossorigin`, so that
 * canvas is tainted and cannot be exported at all.
 *
 * A refusal becomes a placeholder of the same size, so a post with an
 * unreachable photo still looks like a post with a photo in it.
 */
export async function inlineImages(clone: Element): Promise<void> {
  const embed = async (url: string): Promise<string> => {
    const resp = await fetch(url, { credentials: 'omit', mode: 'cors' })
    if (!resp.ok) throw new Error(String(resp.status))
    return shrinkIfHuge(await blobToDataUrl(await resp.blob()))
  }

  const images = Array.from(clone.querySelectorAll('img')).map(async (img) => {
    const src = img.getAttribute('src')
    if (!src || src.startsWith('data:')) return
    try {
      img.setAttribute('src', await embed(src))
    } catch {
      // A grey square mid-sentence reads worse than a missing glyph.
      const isTiny = (img.getAttribute('style') ?? '').includes('height: 1.2em')
      if (isTiny) img.remove()
      else img.replaceWith(placeholderFor(img, '🖼'))
    }
  })

  const backgrounds = Array.from(clone.querySelectorAll<HTMLElement>('*')).map(
    async (el) => {
      const value = el.style.backgroundImage
      if (!value || value === 'none') return
      for (const url of backgroundUrls(value)) {
        try {
          el.style.backgroundImage = value.replace(url, await embed(url))
        } catch {
          el.style.backgroundImage = 'none'
        }
      }
    },
  )

  await Promise.all([...images, ...backgrounds])
}

/** Wrap a serialized clone in an SVG that a canvas can draw. */
export function buildSvgDataUrl(
  markup: string,
  width: number,
  height: number,
): string {
  // foreignObject content is parsed as XML; without the XHTML namespace nothing
  // inside renders at all.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${markup}</div>` +
    `</foreignObject></svg>`
  // encodeURIComponent over base64: debuggable, and no second copy of an
  // already-large string.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const LOAD_TIMEOUT_MS = 15_000

/**
 * Decode a data URL into an image. The timeout is load-bearing: an `<img>` that
 * neither loads nor errors leaves the promise pending and the "Rendering…" toast
 * up forever. Failing is recoverable, hanging is not.
 */
function loadImage(
  src: string,
  timeoutMs = LOAD_TIMEOUT_MS,
): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const timer = setTimeout(
      () => reject(new Error('snapshot timed out')),
      timeoutMs,
    )
    img.addEventListener('load', () => {
      clearTimeout(timer)
      resolve(img)
    })
    img.addEventListener('error', () => {
      clearTimeout(timer)
      reject(new Error('snapshot did not render'))
    })
    img.src = src
  })
}

export interface SnapshotOptions {
  /** Painted behind the element, since a post is usually transparent. */
  background: string
  /** Device-pixel multiplier. 2 keeps it readable when viewed full size. */
  scale?: number
  /** Padding around the element, in CSS pixels. */
  padding?: number
  /**
   * Last chance to edit the clone. Runs after the styles are inlined, so
   * anything added here has to carry its own.
   */
  decorate?: (clone: Element) => void
}

/**
 * Render an element to a PNG as it currently appears. Throws rather than
 * returning something half-drawn, so the caller can fall back to its own card.
 */
export async function snapshotElement(
  el: Element,
  { background, scale = 2, padding = 16, decorate }: SnapshotOptions,
): Promise<Blob> {
  const rect = el.getBoundingClientRect()
  const width = Math.ceil(rect.width)
  const height = Math.ceil(rect.height)
  if (width === 0 || height === 0) {
    throw new Error('nothing to snapshot')
  }

  const clone = el.cloneNode(true) as Element
  inlineStyles(el, clone)
  unclampText(clone)
  // Before inlineImages, so a video's poster gets inlined with everything else.
  replaceVideos(clone)
  decorate?.(clone)
  await inlineImages(clone)

  // Inside foreignObject there is no parent to size it, so "auto" width
  // collapses to nothing. Height still grows, since `decorate` may add a row.
  if (clone instanceof HTMLElement) {
    clone.style.width = `${width}px`
    clone.style.height = 'auto'
    clone.style.margin = '0'
    clone.style.position = 'static'
  }

  // The viewport has to match the real box or the image comes out cropped one
  // side and padded the other. Never smaller than the element started at, so a
  // failed measurement can't shrink it.
  const measured = measureClone(clone, width)
  const finalWidth = Math.max(width, measured.width)
  const finalHeight = Math.max(height, measured.height)

  const markup = new XMLSerializer().serializeToString(clone)
  const rendered = await loadImage(
    buildSvgDataUrl(markup, finalWidth, finalHeight),
  )

  const canvas = document.createElement('canvas')
  canvas.width = (finalWidth + padding * 2) * scale
  canvas.height = (finalHeight + padding * 2) * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is unavailable')
  ctx.scale(scale, scale)

  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(rendered, padding, padding, finalWidth, finalHeight)

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('could not encode the image'))
    }, 'image/png')
  })
}
