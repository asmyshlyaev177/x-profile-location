#!/usr/bin/env node
// Reconcile every locale catalogue against the English one.
//
// Fourteen of the fifteen are translated outside this repo, a file at a time,
// against whatever the English catalogue looked like when that pass started. So
// a message added here mid-translation comes back missing from whichever files
// were already in flight — silently, because a missing message just renders its
// own key in a language nobody on this side reads.
//
// This adds any key a locale is missing, in English and in the right position,
// and leaves every existing translation exactly as it was. Run it after a
// translation pass; `messages.test.ts` is what fails if you forget.
//
//   node scripts/sync-locales.mjs          report only
//   node scripts/sync-locales.mjs --write  fill the gaps

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const LOCALES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../public/_locales',
)
const write = process.argv.includes('--write')

const read = (locale) =>
  JSON.parse(readFileSync(join(LOCALES, locale, 'messages.json'), 'utf8'))

/** `$1`…`$9` a message uses, as a comparable string. */
const placeholders = (message) =>
  [...new Set(message.match(/\$\d/g) ?? [])].sort().join('')

const en = read('en')
const enKeys = Object.keys(en)
let problems = 0

for (const locale of readdirSync(LOCALES).sort()) {
  if (locale === 'en') continue
  const catalogue = read(locale)

  const missing = enKeys.filter((key) => !(key in catalogue))
  const extra = Object.keys(catalogue).filter((key) => !(key in en))
  const drift = enKeys.filter(
    (key) =>
      catalogue[key] &&
      placeholders(catalogue[key].message) !== placeholders(en[key].message),
  )
  const documented = Object.keys(catalogue).filter(
    (key) => catalogue[key].description !== undefined,
  )
  const tag = locale.replace('_', '-')
  const wrongTag = catalogue.localeTag?.message !== tag
  const longName = (catalogue.appName?.message.length ?? 0) > 50

  const notes = []
  if (missing.length) notes.push(`${missing.length} missing`)
  if (documented.length)
    notes.push(`${documented.length} carry an English description`)
  if (extra.length) notes.push(`${extra.length} unknown: ${extra.join(', ')}`)
  if (drift.length) notes.push(`substitutions changed: ${drift.join(', ')}`)
  if (wrongTag)
    notes.push(
      `localeTag is "${catalogue.localeTag?.message}", must be "${tag}"`,
    )
  if (longName)
    notes.push(
      `appName is ${catalogue.appName.message.length} chars, AMO caps it at 50`,
    )

  const untranslated = enKeys.filter(
    (key) => catalogue[key]?.message === en[key].message,
  ).length

  if (notes.length === 0) {
    console.log(`${locale.padEnd(6)} ok        (${untranslated} still English)`)
    continue
  }

  problems += 1
  console.log(`${locale.padEnd(6)} ${notes.join('; ')}`)
  if (missing.length) console.log(`       ${missing.join(', ')}`)

  // Only the mechanical half is fixed here. A wrong localeTag, an over-long
  // name or a dropped `$1` are decisions about the translation, and guessing at
  // them would bury the thing worth reading.
  if (write && (missing.length || documented.length)) {
    const merged = {}
    // Message only: descriptions are notes for whoever translates, and the one
    // file they belong in is the one being translated *from*.
    for (const key of enKeys) {
      merged[key] = { message: (catalogue[key] ?? en[key]).message }
    }
    for (const key of extra) merged[key] = { message: catalogue[key].message }
    writeFileSync(
      join(LOCALES, locale, 'messages.json'),
      JSON.stringify(merged, null, 2) + '\n',
    )
    const did = []
    if (missing.length) did.push(`filled ${missing.length} from English`)
    if (documented.length) did.push(`dropped ${documented.length} descriptions`)
    console.log(`       → ${did.join(', ')}`)
  }
}

if (problems && !write) {
  console.log('\nRun with --write to fill missing keys from English.')
}
process.exit(problems && !write ? 1 : 0)
