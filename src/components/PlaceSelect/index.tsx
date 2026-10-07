import { t } from '../../scripts/i18n'
import type { PreferredPlace } from '../../scripts/settings'

/** The store-or-location picker, for the popup and the options page alike. */
export function PlaceSelect({
  place,
  className,
  onPlace,
}: {
  place: PreferredPlace
  className?: string
  onPlace: (value: string) => void
}) {
  return (
    <select
      class={className}
      value={place}
      onChange={(e) => onPlace((e.target as HTMLSelectElement).value)}
    >
      <option value="store">{t('matchPlaceStore')}</option>
      <option value="location">{t('matchPlaceLocation')}</option>
    </select>
  )
}
