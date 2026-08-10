// Snapshot a live element to a PNG, keeping the styles it is wearing. Every step
// degrades rather than aborting — see "Snapshots" in CLAUDE.md.

/** Curated: ~200 elements × ~340 properties is a data URL big enough to break. */
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
 * A computed height is a pixel value from before the insertion, so every ancestor
 * is pinned to a box with no room for what was just added.
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
 * X sizes its ellipsis boxes for its own webfont; the fallback is wider, so text
 * that fitted on the page comes out as "Some Very Long Nam…".
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
 * Laid out off-screen rather than guessed — a flat 80px of slack left a band of
 * dead background. The union of every descendant, or overflow is clipped off.
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

/** A photo base64'd inside a URL-encoded data URL is its own failure mode. */
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
 * There is no playback in the restricted context, so a video leaves a hole. Runs
 * after the styles are inlined, so the replacement inherits its box.
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
 * Anything left pointing at a URL disappears inside the SVG. Fetched rather than
 * redrawn: X loads images without `crossorigin`, so that canvas is tainted.
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

/** The timeout is load-bearing: failing is recoverable, hanging is not. */
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
  /** Runs after the styles are inlined, so anything added carries its own. */
  decorate?: (clone: Element) => void
  /** `height` is room made under the element, which the canvas is cropped to. */
  finish?: {
    height: number
    draw: (
      ctx: CanvasRenderingContext2D,
      size: { width: number; height: number },
    ) => void
  }
}

/** Throws rather than returning something half-drawn. */
export async function snapshotElement(
  el: Element,
  { background, scale = 2, padding = 16, decorate, finish }: SnapshotOptions,
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

  // Must match the real box, or the image is cropped one side and padded the
  // other. Never smaller than the element started at.
  const measured = measureClone(clone, width)
  const finalWidth = Math.max(width, measured.width)
  const finalHeight = Math.max(height, measured.height)

  const markup = new XMLSerializer().serializeToString(clone)
  const rendered = await loadImage(
    buildSvgDataUrl(markup, finalWidth, finalHeight),
  )

  const canvasWidth = finalWidth + padding * 2
  const canvasHeight = finalHeight + padding * 2 + (finish?.height ?? 0)
  const canvas = document.createElement('canvas')
  canvas.width = canvasWidth * scale
  canvas.height = canvasHeight * scale
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas is unavailable')
  ctx.scale(scale, scale)

  ctx.fillStyle = background
  ctx.fillRect(0, 0, canvasWidth, canvasHeight)
  ctx.drawImage(rendered, padding, padding, finalWidth, finalHeight)
  finish?.draw(ctx, { width: canvasWidth, height: canvasHeight })

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('could not encode the image'))
    }, 'image/png')
  })
}
