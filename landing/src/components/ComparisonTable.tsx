import { COMPETITORS, SELF, type Cell, type Row } from '../data/comparison'
import { TEST_COUNT } from '../data/test-count'
import { useT } from '../i18n/context'
import { fill } from '../i18n/fill'
import type { Dict } from '../i18n/dict/en'

/**
 * The comparison grid, shared by /x-posed-alternative (every row) and the
 * homepage (the `headline` subset). A real <table>, not a grid of divs: a
 * screen reader needs `scope` to announce "Firefox, X-Pat, no" rather than
 * reciting sixty loose symbols.
 */

/**
 * Two cells hold a measured value rather than a verdict, and both are copy in
 * fifteen languages. `comparison.ts` stores the key; the count comes from
 * `test-count.ts`, so the claim cannot drift from the suite.
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
      <span class="text-accent text-[1.125rem] leading-none" aria-hidden="true">
        ✓
      </span>
    )
  }
  // One weight for both: an alpha tint of --muted has no checked floor. The
  // glyph carries the distinction, `cellLabel` carries the word.
  if (value === 'no' || value === 'unstated' || value === 'n/a') {
    return (
      <span class="text-muted text-[1.125rem] leading-none" aria-hidden="true">
        {value === 'no' ? '✕' : '–'}
      </span>
    )
  }
  // A measured value ("1007 tests", "none") says more than a tick could.
  return (
    <span class="text-ink font-mono text-[0.75rem] font-medium">
      {measured(value, t) ?? value}
    </span>
  )
}

/**
 * What a screen reader hears. `unstated` is "not stated", never "no": a silent
 * listing is not a claim that the feature is absent.
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
  /** The full page shows row notes and full store names; the homepage teaser
   *  shows neither. */
  detailed?: boolean
}

export function ComparisonTable({ rows, detailed = false }: Props) {
  const t = useT()
  // The store name is what someone searching by name types, so on the full
  // page it belongs in the column head, not only in the sources at the foot.
  const columns = [
    { label: SELF, full: null },
    ...COMPETITORS.map((c) => ({ label: c.short, full: c.name })),
  ]

  return (
    // Five columns of prose cannot reflow below ~640px, so the table scrolls
    // in its own box rather than the whole page scrolling sideways.
    <div class="border-line bg-surface overflow-x-auto rounded-2xl border">
      <table class="w-full min-w-[42rem] border-collapse text-start">
        <caption class="sr-only">{t.table.caption}</caption>
        <thead>
          <tr class="border-line border-b">
            <th scope="col" class="t-data px-5 py-4 font-normal">
              {t.table.feature}
            </th>
            {columns.map((col) => (
              <th
                key={col.label}
                scope="col"
                class={`px-4 py-4 text-center align-bottom text-[0.8125rem] font-semibold ${
                  detailed ? 'min-w-[9rem]' : ''
                } ${col.label === SELF ? 'text-accent' : 'text-body'}`}
              >
                <span class="block whitespace-nowrap">{col.label}</span>
                {detailed && col.full ? (
                  <span class="text-muted mt-1 block text-[0.6875rem] leading-tight font-normal">
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
              <tr key={row.id} class="border-line/60 border-b last:border-0">
                <th
                  scope="row"
                  class="text-ink max-w-[26rem] px-5 py-4 text-[0.875rem] leading-snug font-medium"
                >
                  {copy.label}
                  {detailed && copy.note ? (
                    <span class="text-muted mt-1.5 block text-[0.8125rem] leading-relaxed font-normal">
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
                        col.label === SELF ? 'bg-accent/[0.04]' : ''
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
