import { COMPETITORS, SELF, type Cell, type Row } from '../data/comparison'
import { TEST_COUNT } from '../data/test-count'
import { useT } from '../i18n/context'
import { fill } from '../i18n/fill'
import type { Dict } from '../i18n/dict/en'

/**
 * The comparison grid. Shared by /x-posed-alternative (every row) and the
 * homepage (the `headline` subset), so the two can never disagree.
 *
 * A real <table> rather than a grid of divs: the row and column headers are the
 * only thing making a cell of four ticks mean anything, and a screen reader
 * needs `scope` to announce "Firefox, X-Pat, no" instead of reciting sixty
 * loose symbols.
 */

/**
 * Two cells hold a measured value rather than a verdict, and both are copy —
 * "1007 tests" and "none" have to be sayable in fifteen languages.
 * `comparison.ts` stores the dictionary key; this resolves it, and the count
 * itself comes from `test-count.ts` so the claim cannot drift from the suite.
 */
function measured(value: Cell, t: Dict): string | null {
  if (value === 'testCount')
    return fill(t.comparison.testCount, { count: String(TEST_COUNT) })
  if (value === 'none') return t.comparison.none
  return null
}

/** Symbol plus a word, never a symbol alone — see `cellLabel`. */
function CellMark({ value, t }: { value: Cell; t: Dict }) {
  if (value === 'yes') {
    return (
      <span class="text-signal text-[1.125rem] leading-none" aria-hidden="true">
        ✓
      </span>
    )
  }
  if (value === 'no') {
    return (
      <span
        class="text-faint/70 text-[1.125rem] leading-none"
        aria-hidden="true"
      >
        ✕
      </span>
    )
  }
  if (value === 'unstated' || value === 'n/a') {
    return (
      <span
        class="text-faint/45 text-[1.125rem] leading-none"
        aria-hidden="true"
      >
        –
      </span>
    )
  }
  // A measured value ("1007 tests", "none") says more than a tick could.
  return (
    <span class="text-text font-mono text-[0.75rem] font-medium">
      {measured(value, t) ?? value}
    </span>
  )
}

/**
 * What a screen reader hears. `unstated` is read as "not stated" rather than
 * "no" on purpose: for the two closed-source extensions it means their listing
 * is silent, which is not the same claim as the feature being absent.
 */
function cellLabel(value: Cell, t: Dict): string {
  if (value === 'yes') return t.table.yes
  if (value === 'no') return t.table.no
  if (value === 'unstated') return t.table.notStated
  if (value === 'n/a') return t.table.notApplicable
  return measured(value, t) ?? value
}

interface Props {
  rows: Row[]
  /**
   * The full page shows row notes and the competitors' full store names; the
   * homepage subset shows neither, because it is a teaser under a heading that
   * has already named them.
   */
  detailed?: boolean
}

export function ComparisonTable({ rows, detailed = false }: Props) {
  const t = useT()
  // The store name is what someone searching for a competitor by name actually
  // types, so on the full page it belongs in the column head rather than only
  // in the sources list at the foot.
  const columns = [
    { label: SELF, full: null },
    ...COMPETITORS.map((c) => ({ label: c.short, full: c.name })),
  ]

  return (
    // The table has five columns of prose and cannot reflow below ~640px, so it
    // scrolls inside its own box. Without this the whole page scrolls sideways
    // on a phone, which breaks every other section too.
    <div class="border-hair bg-ink-1 overflow-x-auto rounded-2xl border">
      <table class="w-full min-w-[42rem] border-collapse text-start">
        <caption class="sr-only">{t.table.caption}</caption>
        <thead>
          <tr class="border-hair border-b">
            <th scope="col" class="t-data px-5 py-4 font-normal">
              {t.table.feature}
            </th>
            {columns.map((col) => (
              <th
                key={col.label}
                scope="col"
                class={`px-4 py-4 text-center align-bottom text-[0.8125rem] font-semibold ${
                  detailed ? 'min-w-[9rem]' : ''
                } ${col.label === SELF ? 'text-signal' : 'text-body'}`}
              >
                <span class="block whitespace-nowrap">{col.label}</span>
                {detailed && col.full ? (
                  <span class="text-faint mt-1 block text-[0.6875rem] leading-tight font-normal">
                    {col.full}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const copy = t.comparison.rows[row.id]
            return (
              <tr key={row.id} class="border-hair/60 border-b last:border-0">
                <th
                  scope="row"
                  class="text-text max-w-[26rem] px-5 py-4 text-[0.875rem] leading-snug font-medium"
                >
                  {copy.label}
                  {detailed && copy.note ? (
                    <span class="text-faint mt-1.5 block text-[0.8125rem] leading-relaxed font-normal">
                      {copy.note}
                    </span>
                  ) : null}
                </th>
                {columns.map((col) => {
                  const value = row.cells[col.label] ?? 'unstated'
                  return (
                    <td
                      key={col.label}
                      class={`px-4 py-4 text-center align-middle ${
                        col.label === SELF ? 'bg-signal/[0.04]' : ''
                      }`}
                    >
                      <CellMark value={value} t={t} />
                      <span class="sr-only">{cellLabel(value, t)}</span>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
