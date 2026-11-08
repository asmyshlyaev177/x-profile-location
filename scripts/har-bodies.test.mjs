/**
 * Tests for the shared body store. The contract is the replayer's: it reads
 * `content._file` relative to the HAR's folder and serves those bytes as the body.
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { externaliseBodies, pruneBodies } from './har-bodies.mjs'

const SCRIPT = 'window.bundle=function(){return 42};'.repeat(200)
const FONT_BYTES = Buffer.from([0x77, 0x4f, 0x46, 0x46, 0x00, 0x01, 0xff, 0x80])

const entry = (url, content) => ({
  request: { method: 'GET', url },
  response: { status: 200, content },
})

const harWith = (...entries) => ({ log: { entries } })

/** The bytes the replayer would serve for this entry. */
const servedBytes = (dir, e) =>
  e.response.content._file
    ? readFileSync(path.join(dir, e.response.content._file))
    : Buffer.from(
        e.response.content.text,
        e.response.content.encoding === 'base64' ? 'base64' : 'utf8',
      )

let dir
beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'har-bodies-'))
})

describe('externaliseBodies', () => {
  it('moves a script body out of the HAR and serves the same bytes', () => {
    const e = entry('https://abs.twimg.com/main.js', {
      mimeType: 'application/javascript; charset=utf-8',
      text: SCRIPT,
    })
    externaliseBodies(harWith(e), dir)

    expect(e.response.content.text).toBeUndefined()
    expect(servedBytes(dir, e).toString('utf8')).toBe(SCRIPT)
  })

  it('stores a base64 font as its decoded bytes', () => {
    const e = entry('https://abs.twimg.com/font.woff', {
      mimeType: 'application/font-woff',
      text: FONT_BYTES.toString('base64'),
      encoding: 'base64',
    })
    externaliseBodies(harWith(e), dir)

    expect(e.response.content.encoding).toBeUndefined()
    expect(servedBytes(dir, e).equals(FONT_BYTES)).toBe(true)
  })

  it('keeps one copy of a body that several recordings share', () => {
    const js = () =>
      entry('https://abs.twimg.com/main.js', {
        mimeType: 'application/javascript',
        text: SCRIPT,
      })
    externaliseBodies(harWith(js()), dir)
    externaliseBodies(harWith(js(), js()), dir)

    expect(readdirSync(path.join(dir, 'bodies'))).toHaveLength(1)
  })

  it('leaves JSON and markup inline, where the scrub reads them', () => {
    const json = entry('https://x.com/i/api/graphql/q', {
      mimeType: 'application/json',
      text: '{"data":{}}',
    })
    const html = entry('https://x.com/', {
      mimeType: 'text/html',
      text: '<html></html>',
    })
    const har = harWith(json, html)
    const before = JSON.stringify(har)
    externaliseBodies(har, dir)

    expect(JSON.stringify(har)).toBe(before)
  })

  it('changes nothing on a second run', () => {
    const har = harWith(
      entry('https://abs.twimg.com/main.js', {
        mimeType: 'application/javascript',
        text: SCRIPT,
      }),
    )
    externaliseBodies(har, dir)
    const once = JSON.stringify(har)
    externaliseBodies(har, dir)

    expect(JSON.stringify(har)).toBe(once)
  })

  it('reports every body a recording points at, new or already stored', () => {
    const fresh = entry('https://abs.twimg.com/a.js', {
      mimeType: 'application/javascript',
      text: SCRIPT,
    })
    const stored = entry('https://abs.twimg.com/b.js', {
      mimeType: 'application/javascript',
      _file: 'bodies/already-there',
    })
    const refs = externaliseBodies(harWith(fresh, stored), dir)

    expect([...refs].sort()).toEqual(
      [fresh.response.content._file, 'bodies/already-there'].sort(),
    )
  })
})

describe('pruneBodies', () => {
  it('deletes bodies no recording points at and keeps the rest', () => {
    const e = entry('https://abs.twimg.com/main.js', {
      mimeType: 'application/javascript',
      text: SCRIPT,
    })
    const refs = externaliseBodies(harWith(e), dir)
    writeFileSync(path.join(dir, 'bodies', 'orphan'), 'old bundle')

    expect(pruneBodies(dir, refs)).toBe(1)
    expect(readdirSync(path.join(dir, 'bodies'))).toEqual([
      path.basename(e.response.content._file),
    ])
  })
})
