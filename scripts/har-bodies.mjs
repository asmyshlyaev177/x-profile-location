import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

const BODIES = 'bodies'

// X's bundles and fonts: identical for every viewer, never read by the scrub, and
// 87% of the corpus as inline copies (673 of 769 MB, 155 distinct bodies, 2026-11-09).
const isStatic = (mime) => /javascript|font/.test(mime || '')

/** Move each static body into `<harDir>/bodies/<sha256>` and point `content._file`
 *  at it, the field the replayer reads back. Returns every body the HAR references. */
export function externaliseBodies(har, harDir) {
  const refs = new Set()
  for (const entry of har.log.entries) {
    const content = entry.response?.content
    if (typeof content?._file === 'string') refs.add(content._file)
    if (!content?.text || !isStatic(content.mimeType)) continue

    const bytes = Buffer.from(
      content.text,
      content.encoding === 'base64' ? 'base64' : 'utf8',
    )
    const file = `${BODIES}/${createHash('sha256').update(bytes).digest('hex')}`
    writeOnce(path.join(harDir, file), bytes)
    content._file = file
    delete content.text
    delete content.encoding
    refs.add(file)
  }
  return refs
}

/** Content-addressed, so an existing file already holds these bytes. */
function writeOnce(target, bytes) {
  if (existsSync(target)) return
  mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.tmp`
  writeFileSync(tmp, bytes)
  renameSync(tmp, target)
}

/** Delete what no recording references, a stale `.tmp` included. Returns the count. */
export function pruneBodies(harDir, refs) {
  const dir = path.join(harDir, BODIES)
  if (!existsSync(dir)) return 0
  let removed = 0
  for (const name of readdirSync(dir)) {
    if (refs.has(`${BODIES}/${name}`)) continue
    rmSync(path.join(dir, name))
    removed++
  }
  return removed
}
