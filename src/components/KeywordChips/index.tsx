import type { ComponentChildren } from 'preact'
import { t } from '../../scripts/i18n'
import type { Keyword, MatchMode } from '../../scripts/keywords'
import { withKeywordMode, withoutKeyword } from '../../scripts/settings'
import css from './KeywordChips.module.css'

const asMode = (value: string): MatchMode =>
  value === 'partial' ? 'partial' : 'word'

// A function, not a constant: `t` is only useful once initI18n has run, which
// is after this module is imported.
const modeOptions = () => (
  <>
    <option value="word">{t('kwMatchWhole')}</option>
    <option value="partial">{t('kwMatchPartial')}</option>
  </>
)

/**
 * The keyword input with the mode the next keyword will be added under. The
 * choice sticks, so a run of partial keywords is chosen once rather than fixed
 * one badge at a time afterwards.
 */
export function KeywordAddRow({
  mode,
  onMode,
  children,
}: {
  mode: MatchMode
  onMode: (mode: MatchMode) => void
  /** The keyword input; it takes the width the select doesn't. */
  children: ComponentChildren
}) {
  return (
    <div class={css.addRow}>
      {children}
      <select
        class={css.newMode}
        value={mode}
        aria-label={t('kwMatchNewLabel')}
        title={t('kwMatchNewLabel')}
        onChange={(e) => onMode(asMode((e.target as HTMLSelectElement).value))}
      >
        {modeOptions()}
      </select>
    </div>
  )
}

export interface KeywordChipsProps {
  keywords: Keyword[]
  /** The host page's own chip styling — the popup and the options page differ. */
  classes: { chips: string; chip: string; remove: string }
  onChange: (next: Keyword[]) => void
}

/**
 * The keyword list, each chip carrying the choice that decides how its own
 * keyword is read. One select per keyword rather than one for the whole list:
 * "nft" wants to be found inside "NFTguy" and "art" does not want to be found
 * inside "partido".
 */
export function KeywordChips({
  keywords,
  classes,
  onChange,
}: KeywordChipsProps) {
  if (keywords.length === 0) return null
  return (
    <div class={classes.chips}>
      {keywords.map((kw) => (
        <span
          key={kw.text}
          class={`${classes.chip} ${css.chip}`}
          data-mode={kw.mode}
        >
          {kw.text}
          <span class={css.caret} aria-hidden="true">
            ▾
          </span>
          {/* Covers the chip, so the whole badge opens the list — and carries no
              text of its own, so the mode costs the chip no width. */}
          <select
            class={css.mode}
            value={kw.mode}
            aria-label={t('kwMatchLabel', kw.text)}
            title={t('kwMatchLabel', kw.text)}
            onChange={(e) =>
              onChange(
                withKeywordMode(
                  keywords,
                  kw.text,
                  asMode((e.target as HTMLSelectElement).value),
                ),
              )
            }
          >
            {modeOptions()}
          </select>
          <button
            class={`${classes.remove} ${css.remove}`}
            onClick={() => onChange(withoutKeyword(keywords, kw.text))}
            title={t('removeItem', kw.text)}
          >
            ×
          </button>
        </span>
      ))}
    </div>
  )
}
