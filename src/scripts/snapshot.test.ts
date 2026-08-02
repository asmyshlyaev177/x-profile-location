import {
  allowGrowth,
  buildSvgDataUrl,
  inlineImages,
  inlineStyles,
  measureClone,
  replaceVideos,
  unclampText,
} from './snapshot'

// snapshotElement itself needs a 2D canvas context and an <img> that can decode
// an SVG data URL, neither of which happy-dom has. What is testable — and what
// actually breaks — is the DOM surgery it does on the way there.

function frag(html: string): HTMLElement {
  const host = document.createElement('div')
  host.innerHTML = html
  document.body.appendChild(host)
  return host
}

afterEach(() => {
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

describe('inlineStyles', () => {
  it('writes a style attribute onto the clone and every descendant', () => {
    // Nothing from the page's stylesheets reaches the SVG the snapshot renders
    // in, so an element without inline styles renders unstyled.
    const source = frag(
      '<article><div><span>hi</span></div></article>',
    ).firstElementChild!
    const clone = source.cloneNode(true) as Element

    inlineStyles(source, clone)

    expect(clone.getAttribute('style')).toBeTruthy()
    for (const el of Array.from(clone.querySelectorAll('*'))) {
      expect(el.getAttribute('style')).toBeTruthy()
    }
  })

  it('copies the background properties the avatar depends on', () => {
    // X draws profile pictures as a background-image on some surfaces. Without
    // these the avatar is copied as a blank circle, and inlineImages then has
    // nothing to find and re-embed.
    const source = frag(
      '<div style="background-image:url(https://pbs.twimg.com/a.png);background-size:cover"></div>',
    ).firstElementChild!
    const clone = source.cloneNode(true) as Element

    inlineStyles(source, clone)

    const style = clone.getAttribute('style') ?? ''
    expect(style).toContain('background-image')
    expect(style).toContain('pbs.twimg.com/a.png')
    expect(style).toContain('background-size')
  })

  it('does not touch the element it copied from', () => {
    const source = frag('<article><span>hi</span></article>').firstElementChild!
    const before = source.outerHTML
    inlineStyles(source, source.cloneNode(true) as Element)
    expect(source.outerHTML).toBe(before)
  })
})

describe('replaceVideos', () => {
  it('turns a video into its poster frame, keeping the box it occupied', () => {
    // A <video> draws nothing inside foreignObject, so a post with a video
    // would come out with a hole in it.
    const clone = frag(
      '<div><video poster="https://pbs.twimg.com/p.jpg" style="width:500px;height:280px;"></video></div>',
    )

    replaceVideos(clone)

    expect(clone.querySelector('video')).toBeNull()
    const img = clone.querySelector('img')!
    expect(img.getAttribute('src')).toBe('https://pbs.twimg.com/p.jpg')
    expect(img.getAttribute('style')).toContain('width:500px')
  })

  it('falls back to a play glyph when there is no poster', () => {
    const clone = frag('<div><video style="width:500px;"></video></div>')
    replaceVideos(clone)

    expect(clone.querySelector('video')).toBeNull()
    expect(clone.textContent).toContain('▶')
    const box = clone.firstElementChild!.firstElementChild!
    expect(box.getAttribute('style')).toContain('width:500px')
  })
})

describe('inlineImages', () => {
  function stubFetch(impl: (url: string) => Promise<Response> | Response) {
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string) => Promise.resolve(impl(url))),
    )
  }

  const PNG = new Blob(['x'], { type: 'image/png' })

  it('re-embeds an image as a data URI', async () => {
    stubFetch(() => new Response(PNG, { status: 200 }))
    const clone = frag('<div><img src="https://pbs.twimg.com/a.png"></div>')

    await inlineImages(clone)

    expect(clone.querySelector('img')!.getAttribute('src')).toMatch(/^data:/)
  })

  it('never sends the user’s cookies to fetch one', async () => {
    // These are public CDN assets; a snapshot has no business carrying
    // credentials anywhere.
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(PNG)),
    )
    vi.stubGlobal('fetch', fetchMock)

    await inlineImages(
      frag('<div><img src="https://pbs.twimg.com/a.png"></div>'),
    )

    expect(fetchMock.mock.calls[0][1]).toMatchObject({ credentials: 'omit' })
  })

  it('leaves an already-inlined image alone', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await inlineImages(frag('<div><img src="data:image/png;base64,AAA"></div>'))

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('replaces an unreachable image with a box of the same size', async () => {
    // Removing it instead would collapse the layout, so a post with a photo
    // would come out looking like a post without one.
    stubFetch(() => new Response('', { status: 403 }))
    const clone = frag(
      '<div><img src="https://pbs.twimg.com/a.png" style="width:500px;height:280px;"></div>',
    )

    await inlineImages(clone)

    expect(clone.querySelector('img')).toBeNull()
    const box = clone.firstElementChild!.firstElementChild!
    expect(box.getAttribute('style')).toContain('width:500px')
    expect(box.textContent).toContain('🖼')
  })

  it('drops an unreachable emoji rather than boxing it', async () => {
    // A grey square mid-sentence reads far worse than a missing glyph.
    stubFetch(() => new Response('', { status: 403 }))
    const clone = frag(
      '<div>hello <img src="https://abs.twimg.com/e.svg" style="height: 1.2em;"> there</div>',
    )

    await inlineImages(clone)

    expect(clone.querySelector('img')).toBeNull()
    expect(clone.textContent).not.toContain('🖼')
  })

  it('inlines a background-image, and clears one it cannot fetch', async () => {
    stubFetch((url) =>
      url.includes('good')
        ? new Response(PNG, { status: 200 })
        : new Response('', { status: 404 }),
    )
    const clone = frag(
      '<div><i id="a" style="background-image:url(https://x/good.png)"></i>' +
        '<i id="b" style="background-image:url(https://x/bad.png)"></i></div>',
    )

    await inlineImages(clone)

    expect(
      clone.querySelector<HTMLElement>('#a')!.style.backgroundImage,
    ).toContain('data:')
    expect(clone.querySelector<HTMLElement>('#b')!.style.backgroundImage).toBe(
      'none',
    )
  })
})

describe('buildSvgDataUrl', () => {
  it('carries the XHTML namespace, without which nothing inside renders', () => {
    const url = buildSvgDataUrl('<p>hi</p>', 100, 50)
    const decoded = decodeURIComponent(
      url.replace(/^data:image\/svg\+xml;charset=utf-8,/, ''),
    )

    expect(decoded).toContain('xmlns="http://www.w3.org/2000/svg"')
    expect(decoded).toContain('xmlns="http://www.w3.org/1999/xhtml"')
    expect(decoded).toContain('<foreignObject')
    expect(decoded).toContain('<p>hi</p>')
  })

  it('sizes the viewport to what it was given', () => {
    const decoded = decodeURIComponent(buildSvgDataUrl('', 640, 480))
    expect(decoded).toContain('width="640"')
    expect(decoded).toContain('height="480"')
  })

  it('escapes markup so the URL survives being a URL', () => {
    const url = buildSvgDataUrl('<p title="a&b">x y</p>', 10, 10)
    expect(url).not.toContain(' ')
    expect(url).not.toContain('"')
  })
})

describe('unclampText', () => {
  it('lets a truncated name render in full', () => {
    // X sizes those boxes for its own webfont, which the snapshot cannot load —
    // so the wider fallback turns a name that fitted into "Some Very Long Nam…".
    const clone = frag(
      '<div><span id="n" style="text-overflow:ellipsis;overflow:hidden;max-width:120px;width:120px">A very long display name</span></div>',
    )

    unclampText(clone)

    const el = clone.querySelector<HTMLElement>('#n')!
    expect(el.style.textOverflow).toBe('clip')
    expect(el.style.overflow).toBe('visible')
    expect(el.style.maxWidth).toBe('none')
    expect(el.style.width).toBe('auto')
  })

  it('leaves elements that were not truncating alone', () => {
    const clone = frag(
      '<div><span id="n" style="overflow:hidden">x</span></div>',
    )
    unclampText(clone)
    expect(clone.querySelector<HTMLElement>('#n')!.style.overflow).toBe(
      'hidden',
    )
  })
})

describe('measureClone', () => {
  it('measures the clone without leaving it in the document', () => {
    // Guessing the height is what padded every short post with dead background.
    const clone = document.createElement('div')
    clone.setAttribute('style', 'height:140px')

    const before = document.body.childElementCount
    const measured = measureClone(clone, 600)

    expect(measured.width).toBeGreaterThanOrEqual(0)
    expect(measured.height).toBeGreaterThanOrEqual(0)
    expect(document.body.childElementCount).toBe(before)
    expect(clone.isConnected).toBe(false)
  })

  it('ignores zero-sized boxes so nothing stretches to reach a hidden node', () => {
    const clone = document.createElement('div')
    clone.innerHTML = '<span style="width:0;height:0"></span>'
    expect(() => measureClone(clone, 600)).not.toThrow()
  })
})

describe('allowGrowth', () => {
  it('clears the pinned box from the insertion point up to the root', () => {
    // Computed heights pin every ancestor to the box it had before anything was
    // inserted, so the new row has nowhere to go.
    const root = frag(
      '<article style="height:200px;overflow:hidden"><div id="mid" style="height:100px;overflow:hidden">' +
        '<span id="leaf" style="height:20px"></span></div></article>',
    ).firstElementChild!
    const leaf = root.querySelector<HTMLElement>('#leaf')!

    allowGrowth(leaf, root)

    for (const id of ['#leaf', '#mid']) {
      expect(root.querySelector<HTMLElement>(id)!.style.height).toBe('auto')
      expect(root.querySelector<HTMLElement>(id)!.style.overflow).toBe(
        'visible',
      )
    }
    expect((root as HTMLElement).style.height).toBe('auto')
  })

  it('stops at the root rather than walking into the page', () => {
    const host = frag(
      '<div id="outside" style="height:500px"><article><span id="leaf"></span></article></div>',
    )
    const root = host.querySelector('article')!
    allowGrowth(host.querySelector('#leaf')!, root)

    expect(host.querySelector<HTMLElement>('#outside')!.style.height).toBe(
      '500px',
    )
  })
})
