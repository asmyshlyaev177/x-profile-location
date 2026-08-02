import {
  accountAgeDays,
  definedFacts,
  EMPTY_FACTS,
  formatAccountAge,
  formatFollowers,
  hasFacts,
  parseAccountFacts,
  parseAffiliation,
  parseXDate,
} from './profile'

// Copied from a recorded AboutAccountQuery response — the shapes below are
// X's, not ours, so they are pinned to real captures rather than invented.
const ABOUT_RESULT = {
  __typename: 'User',
  about_profile: {
    account_based_in: 'Netherlands',
    location_accurate: true,
    source: 'Netherlands App Store',
    username_changes: { count: '3', last_changed_at_msec: '1721030898533' },
  },
  affiliates_highlighted_label: {},
  core: {
    created_at: 'Sun Jan 22 21:18:47 +0000 2023',
    name: 'MR NFT',
    screen_name: 'MRNFT_X',
  },
  identity_profile_labels_highlighted_label: {},
  is_blue_verified: true,
  privacy: { protected: false },
  rest_id: '1617270522349322250',
  verification: { verified: false },
}

const TIMELINE_USER = {
  __typename: 'User',
  affiliates_highlighted_label: {
    label: {
      badge: { url: 'https://pbs.twimg.com/profile_images/1321/0ZxKlEKB.jpg' },
      description: 'NASA Artemis',
      url: { url: 'https://twitter.com/NASA', urlType: 'DeepLink' },
      userLabelDisplayType: 'Badge',
      userLabelType: 'BusinessLabel',
    },
  },
  core: {
    created_at: 'Tue Jul 10 21:51:25 +0000 2012',
    name: 'NASA Artemis',
    screen_name: 'NASAArtemis',
  },
  is_blue_verified: true,
  legacy: { followers_count: 33813, description: 'bio' },
  privacy: { protected: false },
  rest_id: '632344577',
}

describe('parseXDate', () => {
  it("reads X's created_at format as UTC", () => {
    expect(parseXDate('Sun Jan 22 21:18:47 +0000 2023')).toBe(
      Date.UTC(2023, 0, 22, 21, 18, 47),
    )
  })

  it('applies a non-zero offset back to UTC', () => {
    // 21:18 at +0200 is 19:18 UTC.
    expect(parseXDate('Sun Jan 22 21:18:47 +0200 2023')).toBe(
      Date.UTC(2023, 0, 22, 19, 18, 47),
    )
    expect(parseXDate('Sun Jan 22 21:18:47 -0500 2023')).toBe(
      Date.UTC(2023, 0, 23, 2, 18, 47),
    )
  })

  it('rejects anything that is not that format, rather than guessing', () => {
    for (const bad of [
      '',
      'yesterday',
      '2023-01-22T21:18:47Z',
      'Sun Xxx 22 21:18:47 +0000 2023',
      'Sun Jan 99 21:18:47 +0000 2023',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(parseXDate(bad)).toBeNull()
    }
  })
})

describe('parseAffiliation', () => {
  it('takes the parent handle from the badge link, lowercased', () => {
    expect(
      parseAffiliation(TIMELINE_USER.affiliates_highlighted_label),
    ).toEqual({
      handle: 'nasa',
      name: 'NASA Artemis',
      badgeUrl: 'https://pbs.twimg.com/profile_images/1321/0ZxKlEKB.jpg',
    })
  })

  it('accepts x.com links as well as twitter.com', () => {
    const parsed = parseAffiliation({
      label: { url: { url: 'https://x.com/SomeOrg' }, description: 'Some Org' },
    })
    expect(parsed?.handle).toBe('someorg')
  })

  it('is null for an unbadged account', () => {
    expect(parseAffiliation({})).toBeNull()
    expect(parseAffiliation({ label: {} })).toBeNull()
    expect(parseAffiliation(null)).toBeNull()
  })

  it('keeps a badge whose link is unusable, since the name still identifies it', () => {
    const parsed = parseAffiliation({
      label: { description: 'Some Org', url: { url: 'https://example.com/x' } },
    })
    expect(parsed).toEqual({ handle: null, name: 'Some Org', badgeUrl: null })
  })
})

describe('parseAccountFacts', () => {
  it('reads an AboutAccountQuery result', () => {
    const facts = parseAccountFacts(ABOUT_RESULT)
    expect(facts.createdAt).toBe(Date.UTC(2023, 0, 22, 21, 18, 47))
    expect(facts.handleChanges).toBe(3)
    expect(facts.restId).toBe('1617270522349322250')
    expect(facts.blueVerified).toBe(true)
    expect(facts.verified).toBe(false)
    expect(facts.isProtected).toBe(false)
    expect(facts.affiliation).toBeNull()
    // AboutAccountQuery doesn't carry a follower count.
    expect(facts.followers).toBeNull()
  })

  it('reads a timeline User node, which carries followers but no handle history', () => {
    const facts = parseAccountFacts(TIMELINE_USER)
    expect(facts.createdAt).toBe(Date.UTC(2012, 6, 10, 21, 51, 25))
    expect(facts.followers).toBe(33813)
    expect(facts.affiliation?.handle).toBe('nasa')
    expect(facts.handleChanges).toBeNull()
  })

  it('falls back to the identity label when there is no affiliate badge', () => {
    const facts = parseAccountFacts({
      affiliates_highlighted_label: {},
      identity_profile_labels_highlighted_label: {
        label: { description: 'Government official' },
      },
    })
    expect(facts.affiliation?.name).toBe('Government official')
  })

  it('returns empty facts rather than throwing on junk', () => {
    for (const junk of [null, undefined, 42, 'user', [], {}]) {
      expect(parseAccountFacts(junk)).toEqual(EMPTY_FACTS)
    }
  })

  it('ignores fields of the wrong type instead of coercing them', () => {
    const facts = parseAccountFacts({
      is_blue_verified: 'yes',
      rest_id: 12345,
      privacy: { protected: 'false' },
      legacy: { followers_count: 'lots' },
    })
    expect(facts.blueVerified).toBeNull()
    expect(facts.restId).toBeNull()
    expect(facts.isProtected).toBeNull()
    expect(facts.followers).toBeNull()
  })
})

describe('definedFacts', () => {
  it('drops nulls, so a thin sighting cannot blank a richer one', () => {
    const patch = definedFacts(parseAccountFacts(TIMELINE_USER))
    expect(patch).toHaveProperty('followers', 33813)
    expect(patch).not.toHaveProperty('handleChanges')
  })

  it('is empty for an empty account', () => {
    expect(definedFacts(EMPTY_FACTS)).toEqual({})
    expect(hasFacts(EMPTY_FACTS)).toBe(false)
    expect(hasFacts(parseAccountFacts(TIMELINE_USER))).toBe(true)
  })
})

describe('account age', () => {
  const now = Date.UTC(2026, 0, 1)
  const daysAgo = (n: number) => now - n * 24 * 60 * 60 * 1000

  it('counts whole days', () => {
    expect(accountAgeDays(daysAgo(10), now)).toBe(10)
    expect(accountAgeDays(null, now)).toBeNull()
  })

  it('never reports a negative age for a clock-skewed future date', () => {
    expect(accountAgeDays(now + 60_000, now)).toBe(0)
  })

  it('formats at the resolution a reader uses', () => {
    expect(formatAccountAge(now - 3600_000, now)).toBe('today')
    expect(formatAccountAge(daysAgo(9), now)).toBe('9d')
    expect(formatAccountAge(daysAgo(59), now)).toBe('59d')
    expect(formatAccountAge(daysAgo(60), now)).toBe('2mo')
    expect(formatAccountAge(daysAgo(400), now)).toBe('13mo')
    expect(formatAccountAge(daysAgo(365 * 4), now)).toBe('4y')
    expect(formatAccountAge(null, now)).toBeNull()
  })
})

describe('formatFollowers', () => {
  it('abbreviates the way X does', () => {
    expect(formatFollowers(0)).toBe('0')
    expect(formatFollowers(999)).toBe('999')
    expect(formatFollowers(1000)).toBe('1K')
    expect(formatFollowers(1500)).toBe('1.5K')
    expect(formatFollowers(33813)).toBe('34K')
    expect(formatFollowers(1_500_000)).toBe('1.5M')
    expect(formatFollowers(23_000_000)).toBe('23M')
  })

  it('is null for a missing or nonsense count', () => {
    expect(formatFollowers(null)).toBeNull()
    expect(formatFollowers(undefined)).toBeNull()
    expect(formatFollowers(-5)).toBeNull()
    expect(formatFollowers(NaN)).toBeNull()
  })
})
