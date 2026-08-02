// Snapshot a live element to a PNG, keeping the styles it is actually wearing.
//
// The share card used to be drawn by hand on a canvas: a name, a handle, the
// post text, some chips. It was legible but it was an *illustration* of a post
// rather than the post — wrong font, wrong spacing, no avatar, no verified
// badge, no images, no quoted tweet. Snapshotting the real article gives back
// everything X renders, for free, and stays right when X changes its layout.
//
// How it works, and why it has to be done the long way round:
//
//   1. The node is cloned, because we are about to mutate it and it is on the
//      user's screen.
//   2. Every computed style is copied inline onto the clone. This is the part
//      that cannot be skipped: the snapshot is rendered from an SVG data URL,
//      which is a *restricted context* — no stylesheet of the page applies
//      inside it, and no external resource is fetched.
//   3. Every image is refetched and re-embedded as a data URI, for the same
//      reason. Avatars, media, and the <img> tags X uses for emoji all vanish
//      otherwise.
//   4. The clone goes inside <foreignObject>, and that SVG is drawn to a canvas.
//
// The one thing that cannot be recovered is X's own webfont, which lives behind
// a URL the restricted context won't load. Text falls back to the system sans
// serif — close, not identical. Embedding the font would mean shipping it.
//
// Anything here can fail on a page we do not control, so every step degrades:
// an image that won't fetch is dropped rather than aborting the snapshot, and
// the caller keeps the hand-drawn card as a fallback for when the whole thing
// fails.

/**
 * The computed properties copied onto the clone.
 *
 * Curated rather than "everything getComputedStyle returns". A tweet is around
 * two hundred elements and the full set is ~340 properties each — that is tens
 * of thousands of declarations, and the data URL it produces is large enough to
 * become its own problem. This list is what visibly matters for a post.
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
  // The avatar is the reason these are here. X draws profile pictures both as
  // <img> and as a background-image depending on the surface, and without the
  // background properties the second kind is copied as a blank circle —
  // inlineImages would then have nothing to find and re-embed.
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
  // The clone is structurally identical, so the two walks stay in step. If they
  // ever don't, the shorter one wins rather than mismatching pairs.
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
 * inlineStyles copies *computed* styles, and a computed height is always a
 * pixel value — the height the element had before anything was added to it. So
 * every ancestor of a newly inserted row is pinned to a box with no room for
 * it, and the row either overflows its container or is clipped away entirely by
 * an `overflow: hidden` further up. Either way it does not appear where it was
 * put, which is the whole failure.
 *
 * Clearing the pinned box back to `auto` on the chain from the insertion point
 * to the root is enough: those are exactly the elements that have to get taller.
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
 * Stop text from being cut off with an ellipsis.
 *
 * X truncates names and titles with `text-overflow: ellipsis` against a width
 * measured for its own webfont. That font cannot be loaded in the context the
 * snapshot renders in, so the fallback is a little wider — and text that fitted
 * on the page comes out clipped to "Some Very Long Nam…" in the image.
 *
 * Only the elements actually configured to truncate are touched, and they are
 * allowed to size to their content instead. Preserving the exact box would mean
 * preserving the truncation, which is the bug.
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
 * The box the clone actually needs, by laying it out.
 *
 * The alternative is guessing — the first version added a flat 80px of slack
 * whenever anything was inserted, which left a band of empty background under
 * every post that needed less. Since every style is already inlined, attaching
 * the clone off-screen lays it out exactly as the SVG will.
 *
 * Both dimensions are taken from the union of every descendant's box, not from
 * the root's own rect. `unclampText` deliberately lets a name grow past the
 * width X had sized it to, and content that overflows its parent does not make
 * that parent's rect any wider — so measuring the root alone gives back the
 * width the name was *supposed* to fit in, and the SVG viewport then clips the
 * handle off the right-hand edge.
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
    // Zero-sized boxes are hidden elements and decorations; letting them count
    // would stretch the image to reach something invisible.
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
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(new Error('could not read image'))
    reader.readAsDataURL(blob)
  })
}

/**
 * A photo in a post can be several megabytes, and it ends up base64'd inside a
 * data URL that also has to be URL-encoded. Two of those turn the snapshot into
 * a string big enough to be its own failure mode, for detail nobody can see at
 * the size the card is viewed.
 */
const MAX_IMAGE_EDGE = 1400

// Below this, decoding the image to measure it costs more than it could save.
// Avatars and emoji — the overwhelming majority of what gets inlined — never
// come close.
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
  // JPEG: this path only triggers for photos, where the size saving is the
  // entire point and the alpha channel is not in use.
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
 * Swap `<video>` for something that can actually render.
 *
 * A video inside foreignObject draws nothing — there is no playback in the
 * restricted context an SVG image renders in, so a post with a video or a GIF
 * would come out with a hole in it. X gives every video a `poster`, which is
 * the frame the user is looking at anyway; that becomes an `<img>` and gets
 * inlined with the rest. Without a poster it becomes a play-glyph box.
 *
 * Runs after the styles are inlined, so the replacement inherits the box the
 * video occupied and the surrounding layout doesn't move.
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
 * Re-embed every image the clone references as a data URI.
 *
 * Nothing external loads inside the SVG, so anything left pointing at a URL
 * silently disappears — avatars, post media, and the `<img>` tags X uses for
 * emoji in the post text.
 *
 * Fetched with `credentials: 'omit'`: these are public CDN assets, and a
 * snapshot has no business carrying the user's cookies anywhere. Redrawing the
 * already-loaded element onto a canvas would avoid the round trip, but X does
 * not load its images with `crossorigin`, so that canvas is tainted and cannot
 * be exported at all.
 *
 * An image that refuses becomes a placeholder of the same size rather than
 * disappearing, so a post with an unreachable photo still looks like a post
 * with a photo in it.
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
      // Emoji and other small inline images are better dropped than boxed —
      // a grey square mid-sentence reads far worse than a missing glyph.
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
  // The wrapper carries the XHTML namespace: foreignObject content is parsed as
  // XML, and without it nothing inside renders at all.
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<foreignObject x="0" y="0" width="100%" height="100%">` +
    `<div xmlns="http://www.w3.org/1999/xhtml">${markup}</div>` +
    `</foreignObject></svg>`
  // encodeURIComponent rather than base64: it keeps the payload debuggable and
  // avoids a second full copy of a string that is already large.
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

const LOAD_TIMEOUT_MS = 15_000

/**
 * Decode a data URL into an image.
 *
 * The timeout is not belt-and-braces: an `<img>` that neither loads nor errors
 * leaves the promise pending forever, and the only thing the user sees is a
 * "Rendering…" toast that never resolves. Failing is recoverable — the caller
 * falls back to the drawn card — and hanging is not.
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
    img.onload = () => {
      clearTimeout(timer)
      resolve(img)
    }
    img.onerror = () => {
      clearTimeout(timer)
      reject(new Error('snapshot did not render'))
    }
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
   * Last chance to edit the clone before it is serialized.
   *
   * Runs *after* the computed styles are inlined, so anything added here has to
   * carry its own inline styles — nothing from the page's stylesheets reaches
   * the restricted context the snapshot renders in.
   */
  decorate?: (clone: Element) => void
}

/**
 * Render an element to a PNG as it currently appears.
 *
 * Throws rather than returning something half-drawn, so a caller can fall back
 * to a card it knows how to draw itself.
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
  // Before inlineImages, so a video's poster is inlined along with everything
  // else rather than left pointing at a URL that won't load.
  replaceVideos(clone)
  decorate?.(clone)
  await inlineImages(clone)

  // The element's own box has to be pinned: inside foreignObject it has no
  // parent to size it, so a width of "auto" collapses it to nothing. Height is
  // left to grow, since `decorate` may have added a row.
  if (clone instanceof HTMLElement) {
    clone.style.width = `${width}px`
    clone.style.height = 'auto'
    clone.style.margin = '0'
    clone.style.position = 'static'
  }

  // Measured, not guessed: the decoration and the unclamped text both change
  // the box, and the SVG viewport has to match or the image comes out cropped
  // on one side and padded with dead background on the other. Never smaller
  // than the element started at, so a failed measurement can't shrink it.
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
