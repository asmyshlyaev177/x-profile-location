import { useState } from 'preact/hooks'
import {
  flagFor,
  includedMembers,
  type RegionExclusions,
  REGION_MEMBERS,
} from '../../scripts/countries/countries'
import {
  localizedLocation,
  sortByLocalizedName,
} from '../../scripts/countries/location-names'
import { t } from '../../scripts/i18n'
import { withoutLocation, withRegionExclusions } from '../../scripts/settings'
import css from './LocationChips.module.css'

export interface LocationChipsProps {
  blocked: string[]
  exclusions: RegionExclusions
  /** The host page's own chip styling — the popup and the options page differ. */
  classes: { chips: string; chip: string; flag: string; remove: string }
  onBlocked: (next: string[]) => void
  onExclusions: (next: RegionExclusions) => void
}

/**
 * Which of a region's countries it still covers. Unchecking every one leaves
 * the region matching only profiles that say the region itself.
 */
function RegionPicker({
  region,
  covered,
  flagClass,
  onDropped,
}: {
  region: string
  covered: Set<string>
  flagClass: string
  onDropped: (dropped: string[]) => void
}) {
  const members = REGION_MEMBERS[region]
  const toggle = (member: string, keep: boolean) => {
    const dropped = new Set(members.filter((m) => !covered.has(m)))
    if (keep) dropped.delete(member)
    else dropped.add(member)
    onDropped([...dropped])
  }
  return (
    <div class={css.picker}>
      <div class={css.pickerHead}>
        <span class={css.pickerTitle}>{localizedLocation(region)}</span>
        <button class={css.bulk} onClick={() => onDropped([])}>
          {t('regionAll')}
        </button>
        <button class={css.bulk} onClick={() => onDropped([...members])}>
          {t('regionNone')}
        </button>
      </div>
      <p class={css.pickerNote}>{t('regionPickTitle')}</p>
      <div class={css.members}>
        {sortByLocalizedName(members).map((member) => (
          <label key={member} class={css.member}>
            <input
              type="checkbox"
              checked={covered.has(member)}
              onChange={(e) =>
                toggle(member, (e.target as HTMLInputElement).checked)
              }
            />
            <span class={flagClass}>{flagFor(member)}</span>
            <span>{localizedLocation(member)}</span>
          </label>
        ))}
      </div>
    </div>
  )
}

/**
 * The blocked-location list. A region chip opens the picker below the list
 * rather than in place: at 57 countries it is taller than the chips are, and
 * the popup is 320px wide.
 */
export function LocationChips({
  blocked,
  exclusions,
  classes,
  onBlocked,
  onExclusions,
}: LocationChipsProps) {
  const [openRegion, setOpenRegion] = useState<string | null>(null)
  const open = openRegion && blocked.includes(openRegion) ? openRegion : null

  if (blocked.length === 0) return null
  return (
    <>
      <div class={classes.chips}>
        {blocked.map((location) => {
          const members = REGION_MEMBERS[location]
          const covered = includedMembers(location, exclusions)
          const name = localizedLocation(location)
          return (
            <span key={location} class={classes.chip}>
              {/* The chip's own body opens the picker; a plain country has
                  nothing to open, so it stays text. */}
              {members ? (
                <button
                  class={css.open}
                  title={t('regionPickTitle')}
                  aria-expanded={open === location}
                  onClick={() =>
                    setOpenRegion(open === location ? null : location)
                  }
                >
                  <span class={classes.flag}>{flagFor(location)}</span>
                  {name}
                  <span class={css.count}>
                    {covered.length}/{members.length}
                  </span>
                </button>
              ) : (
                <>
                  <span class={classes.flag}>{flagFor(location)}</span>
                  {name}
                </>
              )}
              <button
                class={classes.remove}
                onClick={() => onBlocked(withoutLocation(blocked, location))}
                title={t('removeItem', name)}
              >
                ×
              </button>
            </span>
          )
        })}
      </div>

      {open && (
        <RegionPicker
          region={open}
          covered={new Set(includedMembers(open, exclusions))}
          flagClass={classes.flag}
          onDropped={(dropped) =>
            onExclusions(withRegionExclusions(exclusions, open, dropped))
          }
        />
      )}
    </>
  )
}
