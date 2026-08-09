import {
  COMPETITORS,
  LOSS_IDS,
  ROWS,
  SCRAPED,
  SELF,
  type Cell,
} from './comparison'
import { en } from '../i18n/dict/en'

/**
 * The comparison table as GitHub-flavoured Markdown, for the repo README.
 *
 * Kept separate from `comparison.ts` so the data file stays plain data, and
 * separate from the Preact components because `vite.config.ts` calls this at
 * build time and must not pull JSX through esbuild to do it.
 *
 * English, and only English: the README is one file in one language, so it
 * reads the `en` dictionary directly rather than going through `dictFor`.
 *
 * Only the `headline` rows. A fifteen-row table in a README is scrolled past;
 * the four architectural rows are the ones that answer "why this one".
 */

function cell(value: Cell): string {
  if (value === 'yes') return '✅'
  if (value === 'no') return '❌'
  if (value === 'unstated') return '–'
  if (value === 'n/a') return '–'
  if (value === 'testCount') return en.comparison.testCount
  if (value === 'none') return en.comparison.none
  return value
}

export function comparisonMarkdown(siteUrl: string): string {
  const base = siteUrl.replace(/\/$/, '')
  const columns = [SELF, ...COMPETITORS.map((c) => c.short)]
  const rows = ROWS.filter((r) => r.headline)

  const header = `| | ${columns.join(' | ')} |`
  const divider = `| --- | ${columns.map(() => ':---:').join(' | ')} |`
  const body = rows
    .map(
      (r) =>
        `| ${en.comparison.rows[r.id].label} | ${columns.map((c) => cell(r.cells[c] ?? 'unstated')).join(' | ')} |`,
    )
    .join('\n')

  const losses = LOSS_IDS.map((id) => {
    const l = en.comparison.losses[id]
    return `- **${l.title}.** ${l.body}`
  }).join('\n')

  return `
> Generated from \`landing/src/data/comparison.ts\` by the landing build. Edit that file, not this block.

${header}
${divider}
${body}

**Where [X-Posed](${COMPETITORS[0]!.storeUrl}) is ahead of X-Pat:**

${losses}

Full fifteen-row table, with sources: [${base}/x-posed-alternative](${base}/x-posed-alternative). Store listings read ${SCRAPED}.
`
}
