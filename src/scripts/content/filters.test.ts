import { afterEach, describe, expect, it } from 'vitest'
import type { LocationData } from '../cache/cache'
import { agreedPlace, type RegionExclusions } from '../countries/countries'
import {
  canVpnLocationDecide,
  DEFAULT_LOCATION_MATCHING,
  type LocationMatching,
} from '../settings'
import { classifySource } from '../source'
import {
  __resetFilters,
  isBlockedLocation,
  ruleMatches,
  setBlockedPicks,
  setLocationMatching,
  setRegionExclusions,
} from './filters'

// The inputs that tell two location rules apart are sparse - a region on one side
// of an account, a member unchecked under a blocked region - so these are swept
// as a full grid rather than sampled. A reviewer's sweep of this shape found the
// six accounts the first version of judgedPlace newly hid at its defaults.
const BLOCK_LISTS: { picks: string[]; exclusions: RegionExclusions }[] = [
  { picks: ['Japan'], exclusions: {} },
  { picks: ['Kenya'], exclusions: {} },
  { picks: ['India', 'Africa'], exclusions: {} },
  { picks: ['Europe'], exclusions: {} },
  { picks: ['Europe'], exclusions: { Europe: ['Germany'] } },
  { picks: ['South Asia'], exclusions: { 'South Asia': ['India'] } },
  {
    picks: ['North America'],
    exclusions: { 'North America': ['United States'] },
  },
]
const SOURCES = [
  null,
  'Web',
  'Japan App Store',
  'Germany App Store',
  'Europe App Store',
  'India Android App',
  'Kenya App Store',
  'United States App Store',
]
const LOCATIONS = [
  null,
  'Japan',
  'Germany',
  'Europe',
  'India',
  'South Asia',
  'Africa',
  'Kenya',
  'United States',
  'North America',
]
const ACCOUNTS: LocationData[] = SOURCES.flatMap((source) =>
  LOCATIONS.flatMap((location) =>
    [true, false].map((locationAccurate) => ({
      source: source as LocationData['source'],
      location,
      locationAccurate,
    })),
  ),
)

/** effectiveBlockedLocation as it read before LOCATION_MATCHING_KEY existed. */
function verdictBeforeTheSetting(data: LocationData): string | null {
  const { country } = classifySource(data.source)
  if (country) return isBlockedLocation(country) ? country : null
  if (data.location && data.locationAccurate !== false) {
    return isBlockedLocation(data.location) ? data.location : null
  }
  return null
}

function verdict(data: LocationData): string | null {
  return ruleMatches(data).find((m) => m.rule === 'location')?.label ?? null
}

afterEach(__resetFilters)

describe('the location rule at its defaults', () => {
  // The defaults are the promise that an install which never opens the setting
  // hides exactly what it hid the day before it shipped.
  it.each(BLOCK_LISTS)(
    'hides what the rule before the setting hid, blocking $picks',
    ({ picks, exclusions }) => {
      setBlockedPicks(picks)
      setRegionExclusions(exclusions)
      setLocationMatching(DEFAULT_LOCATION_MATCHING)

      const changed = ACCOUNTS.filter(
        (data) => verdict(data) !== verdictBeforeTheSetting(data),
      )

      expect(changed).toEqual([])
    },
  )
})

describe('the VPN box', () => {
  // The popup and the options page grey the box out on canVpnLocationDecide
  // alone, so its answer has to be what the rule does: ticking the box changes
  // some verdict exactly when the box claims it can.
  it.each([
    { preferredPlace: 'store', isLocationUsedWithoutStore: true },
    { preferredPlace: 'store', isLocationUsedWithoutStore: false },
    { preferredPlace: 'location', isLocationUsedWithoutStore: true },
    { preferredPlace: 'location', isLocationUsedWithoutStore: false },
    { preferredPlace: 'either', isLocationUsedWithoutStore: true },
    { preferredPlace: 'either', isLocationUsedWithoutStore: false },
  ] as const)(
    'matters going by the $preferredPlace, web accounts $isLocationUsedWithoutStore, exactly when it says it can',
    (choices) => {
      setBlockedPicks(['Japan', 'India', 'Africa', 'Europe'])
      const verdictsWith = (isVpnLocationCounted: boolean) => {
        const matching: LocationMatching = { ...choices, isVpnLocationCounted }
        setLocationMatching(matching)
        return ACCOUNTS.map(verdict)
      }

      const isChanged =
        JSON.stringify(verdictsWith(false)) !==
        JSON.stringify(verdictsWith(true))

      expect(isChanged).toBe(
        canVpnLocationDecide({ ...choices, isVpnLocationCounted: false }),
      )
    },
  )
})

describe('going by either place', () => {
  // A VPN-flagged location that disagrees with the store, the VPN box off: one
  // blocked place is not enough, even the store; both blocked still block.
  const isDisputed = (data: LocationData, isVpnLocationCounted: boolean) => {
    const { country: store } = classifySource(data.source)
    return (
      !isVpnLocationCounted &&
      data.locationAccurate === false &&
      store !== null &&
      data.location !== null &&
      agreedPlace(store, data.location) === null
    )
  }

  it.each(BLOCK_LISTS)(
    'hides what going by the store or by the location would, both when disputed, blocking $picks',
    ({ picks, exclusions }) => {
      setBlockedPicks(picks)
      setRegionExclusions(exclusions)
      const choices = [true, false].flatMap((isLocationUsedWithoutStore) =>
        [true, false].map((isVpnLocationCounted) => ({
          isLocationUsedWithoutStore,
          isVpnLocationCounted,
        })),
      )

      const disagreements = choices.flatMap((choice) => {
        const verdictsBy = (matching: LocationMatching) => {
          setLocationMatching(matching)
          return ACCOUNTS.map((data) => verdict(data) !== null)
        }
        // Going by either, a web account's location is the place present, so
        // the web-accounts box is on whatever it was left at.
        const webOn = { ...choice, isLocationUsedWithoutStore: true }
        const byStore = verdictsBy({ ...webOn, preferredPlace: 'store' })
        const byLocation = verdictsBy({ ...webOn, preferredPlace: 'location' })
        const byAnyLocation = verdictsBy({
          ...webOn,
          preferredPlace: 'location',
          isVpnLocationCounted: true,
        })
        const expected = ACCOUNTS.map((data, i) =>
          isDisputed(data, choice.isVpnLocationCounted)
            ? byStore[i] && byAnyLocation[i]
            : byStore[i] || byLocation[i],
        )
        return verdictsBy({ ...choice, preferredPlace: 'either' })
          .map((isHidden, i) => ({ isHidden, data: ACCOUNTS[i], choice }))
          .filter(({ isHidden }, i) => isHidden !== expected[i])
      })

      expect(disagreements).toEqual([])
    },
  )

  it('lets a VPN-flagged account through on one blocked place until the VPN box is ticked', () => {
    setBlockedPicks(['Japan'])
    const flagged = { location: 'Kenya', locationAccurate: false } as const
    const byEither = (isVpnLocationCounted: boolean) => {
      setLocationMatching({
        ...DEFAULT_LOCATION_MATCHING,
        preferredPlace: 'either',
        isVpnLocationCounted,
      })
      return [
        verdict({ ...flagged, source: 'Japan App Store' }),
        verdict({ ...flagged, source: 'Germany App Store' }),
      ]
    }

    expect(byEither(false)).toEqual([null, null])
    setBlockedPicks(['Japan', 'Kenya'])
    expect(byEither(false)).toEqual(['Japan', null])
    setBlockedPicks(['Japan'])
    expect(byEither(true)).toEqual(['Japan', null])
    setBlockedPicks(['Kenya'])
    expect(byEither(true)).toEqual(['Kenya', 'Kenya'])
  })

  it('names whichever of the two places is blocked', () => {
    setBlockedPicks(['Kenya'])
    setLocationMatching({
      ...DEFAULT_LOCATION_MATCHING,
      preferredPlace: 'either',
    })

    expect(
      verdict({
        source: 'Japan App Store',
        location: 'Kenya',
        locationAccurate: true,
      }),
    ).toBe('Kenya')
    expect(
      verdict({
        source: 'Kenya App Store',
        location: 'Japan',
        locationAccurate: true,
      }),
    ).toBe('Kenya')
  })
})
