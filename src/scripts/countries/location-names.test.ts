import enMessages from '../../../public/_locales/en/messages.json'
import { __setMessages } from '../i18n'
import {
  CANONICAL_LOCATIONS,
  COUNTRY_FLAGS,
  LOCATION_ALIASES,
} from './countries'
import {
  __resetLocationNames,
  aliasNote,
  isoFromFlag,
  localizedLocation,
  sortByLocalizedName,
  withLocalizedAliases,
} from './location-names'

const EN: Record<string, string> = Object.fromEntries(
  Object.entries(enMessages as Record<string, { message: string }>).map(
    ([key, entry]) => [key, entry.message],
  ),
)

/** Run `fn` as if the browser had served that locale's catalogue. */
function inLocale<T>(tag: string, fn: () => T): T {
  __setMessages({ ...EN, localeTag: tag })
  __resetLocationNames()
  try {
    return fn()
  } finally {
    __setMessages(EN)
    __resetLocationNames()
  }
}

describe('isoFromFlag', () => {
  it('reads the country code out of a flag emoji', () => {
    expect(isoFromFlag('🇯🇵')).toBe('JP')
    expect(isoFromFlag('🇦🇫')).toBe('AF')
    expect(isoFromFlag('🇺🇸')).toBe('US')
  })

  it('answers null for anything that is not a flag', () => {
    // The globes and the EU marker REGION_FLAGS uses, and plain text.
    expect(isoFromFlag('🌏')).toBeNull()
    expect(isoFromFlag('')).toBeNull()
    expect(isoFromFlag('JP')).toBeNull()
    expect(isoFromFlag('🇯')).toBeNull()
  })

  it('covers every country the extension knows', () => {
    // The claim the whole module rests on: no country name has to be
    // translated by hand, because its flag already carries its code.
    const uncovered = Object.entries(COUNTRY_FLAGS)
      .filter(([, flag]) => isoFromFlag(flag) === null)
      .map(([name]) => name)
    expect(uncovered).toEqual([])
  })
})

describe('localizedLocation', () => {
  it('leaves English alone', () => {
    // Not just a shortcut — CLDR would rename these, and the extension says
    // what X says.
    expect(localizedLocation('Japan')).toBe('Japan')
    expect(localizedLocation('Myanmar')).toBe('Myanmar')
    expect(localizedLocation('Palestine')).toBe('Palestine')
  })

  it('translates countries and regions', () => {
    inLocale('ru', () => {
      expect(localizedLocation('Japan')).toBe('Япония')
      expect(localizedLocation('Germany')).toBe('Германия')
      expect(localizedLocation('South Asia')).toBe('Южная Азия')
    })
    inLocale('ja', () => {
      expect(localizedLocation('Japan')).toBe('日本')
      expect(localizedLocation('Europe')).toBe('ヨーロッパ')
    })
  })

  it('shows the short form, which is the one that fits and the one people use', () => {
    // These sit in chips and one-line rows. CLDR's formal names for these two
    // are "Соединенные Штаты" and "中華人民共和国香港特別行政区".
    inLocale('ru', () => {
      expect(localizedLocation('United States')).toBe('США')
      expect(localizedLocation('Hong Kong')).toBe('Гонконг')
    })
    inLocale('tr', () => {
      expect(localizedLocation('United States')).toBe('ABD')
    })
    inLocale('ja', () => {
      expect(localizedLocation('Hong Kong')).toBe('香港')
    })
  })

  it('passes through anything X said that is not a country it knows', () => {
    inLocale('ru', () => {
      expect(localizedLocation('Somewhere Else')).toBe('Somewhere Else')
    })
  })

  it('translates the two regions with no standard code from the catalogue', () => {
    // Injected messages are English here, so this checks the route rather than
    // the wording: it must not fall through to Intl and come back empty.
    inLocale('ru', () => {
      expect(localizedLocation('East Asia & Pacific')).toBe(
        EN.regionEastAsiaPacific,
      )
      expect(localizedLocation('Eastern Europe (Non-EU)')).toBe(
        EN.regionEasternEuropeNonEu,
      )
    })
  })
})

describe('sortByLocalizedName', () => {
  it('orders by what the reader sees, not by the English name', () => {
    const sorted = inLocale('ru', () =>
      sortByLocalizedName(['Japan', 'Australia', 'Germany']),
    )
    // Австралия, Германия, Япония — Я is last in the Cyrillic alphabet, so
    // Japan moves from first to last.
    expect(sorted).toEqual(['Australia', 'Germany', 'Japan'])
  })

  it('leaves the English list alphabetical', () => {
    const sorted = sortByLocalizedName(['Japan', 'Australia', 'Germany'])
    expect(sorted).toEqual(['Australia', 'Germany', 'Japan'])
  })

  it('keeps every option', () => {
    const sorted = inLocale('ja', () =>
      sortByLocalizedName(CANONICAL_LOCATIONS),
    )
    expect(sorted).toHaveLength(CANONICAL_LOCATIONS.length)
    expect(new Set(sorted)).toEqual(new Set(CANONICAL_LOCATIONS))
  })
})

describe('withLocalizedAliases', () => {
  it('lets the reader search in their own language', () => {
    const aliases = inLocale('ru', () => withLocalizedAliases(LOCATION_ALIASES))
    expect(aliases.Japan).toContain('Япония')
  })

  it('matches every width CLDR knows, not just the one on screen', () => {
    // "США" is what a Russian speaker types; "Соединенные Штаты" is what the
    // formal name is. Both have to find the country, and neither is a string
    // anyone had to write down.
    const aliases = inLocale('ru', () => withLocalizedAliases(LOCATION_ALIASES))
    expect(aliases['United States']).toEqual(
      expect.arrayContaining(['США', 'Соединенные Штаты']),
    )
  })

  it('keeps the aliases that were already there', () => {
    const aliases = inLocale('ru', () => withLocalizedAliases(LOCATION_ALIASES))
    // Someone running a Russian browser who thinks in English codes, or reads
    // an English handle, must not lose the way they already searched.
    expect(aliases['United States']).toEqual(
      expect.arrayContaining([...LOCATION_ALIASES['United States']]),
    )
  })

  it('changes nothing in English', () => {
    expect(withLocalizedAliases(LOCATION_ALIASES)).toBe(LOCATION_ALIASES)
  })
})

describe('aliasNote', () => {
  it('drops an alias that only repeats the row label', () => {
    inLocale('ru', () => {
      expect(aliasNote('Japan', 'Япония')).toBeUndefined()
      expect(aliasNote('Japan', 'JP')).toBe('JP')
      // The formal name is worth showing beside the short one on screen.
      expect(aliasNote('United States', 'Соединенные Штаты')).toBe(
        'Соединенные Штаты',
      )
    })
  })

  it('passes undefined through', () => {
    expect(aliasNote('Japan', undefined)).toBeUndefined()
  })
})
