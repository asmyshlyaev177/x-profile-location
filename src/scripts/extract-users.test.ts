import { describe, expect, it } from 'vitest'
import { extractUsers } from './extract-users'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUser(
  userName: string,
  opts: {
    via?: 'core' | 'legacy'
    legacyDesc?: string | null
    profileBioDesc?: string | null
  } = {},
) {
  const { via = 'core', legacyDesc, profileBioDesc } = opts
  return {
    __typename: 'User',
    core: via === 'core' ? { screen_name: userName } : undefined,
    legacy: {
      ...(via === 'legacy' ? { screen_name: userName } : {}),
      ...(legacyDesc !== undefined ? { description: legacyDesc } : {}),
    },
    profile_bio:
      profileBioDesc !== undefined
        ? { description: profileBioDesc }
        : undefined,
  }
}

// Wraps a value in `n` layers of `{ child: <value> }` to reach a given depth.
function nest(value: unknown, layers: number): unknown {
  let result = value
  for (let i = 0; i < layers; i++) result = { child: result }
  return result
}

// ---------------------------------------------------------------------------
// Base cases
// ---------------------------------------------------------------------------
describe('base cases', () => {
  it('returns [] for null', () => {
    expect(extractUsers(null)).toEqual([])
  })

  it('returns [] for undefined', () => {
    expect(extractUsers(undefined)).toEqual([])
  })

  it('returns [] for a string', () => {
    expect(extractUsers('hello')).toEqual([])
  })

  it('returns [] for a number', () => {
    expect(extractUsers(42)).toEqual([])
  })

  it('returns [] for a boolean', () => {
    expect(extractUsers(true)).toEqual([])
  })

  it('returns [] for an empty object', () => {
    expect(extractUsers({})).toEqual([])
  })

  it('returns [] for an empty array', () => {
    expect(extractUsers([])).toEqual([])
  })

  it('returns [] for an object with no User nodes', () => {
    expect(extractUsers({ a: 1, b: { c: 'x' } })).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Direct User node — screen_name source
// ---------------------------------------------------------------------------
describe('User node — screen_name from core', () => {
  it('extracts userName from core.screen_name', () => {
    const user = makeUser('alice', { via: 'core' })
    expect(extractUsers(user)).toEqual([
      { userName: 'alice', displayName: null, bio: null },
    ])
  })

  it('falls back to legacy.screen_name when core is absent', () => {
    const user = makeUser('bob', { via: 'legacy' })
    expect(extractUsers(user)).toEqual([
      { userName: 'bob', displayName: null, bio: null },
    ])
  })

  it('core.screen_name takes priority over legacy.screen_name when both present', () => {
    const user = {
      __typename: 'User',
      core: { screen_name: 'primary' },
      legacy: { screen_name: 'secondary', description: 'bio' },
    }
    expect(extractUsers(user)).toEqual([
      { userName: 'primary', displayName: null, bio: 'bio' },
    ])
  })

  it('returns [] when __typename is User but no screen_name anywhere', () => {
    const user = { __typename: 'User', core: {}, legacy: {} }
    expect(extractUsers(user)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Direct User node — bio source priority
// ---------------------------------------------------------------------------
describe('User node — bio extraction', () => {
  it('returns null bio when no description fields present', () => {
    const user = makeUser('charlie')
    expect(extractUsers(user)).toEqual([
      { userName: 'charlie', displayName: null, bio: null },
    ])
  })

  it('uses legacy.description when profile_bio is absent', () => {
    const user = makeUser('dave', { legacyDesc: 'legacy bio' })
    expect(extractUsers(user)).toEqual([
      { userName: 'dave', displayName: null, bio: 'legacy bio' },
    ])
  })

  it('uses profile_bio.description when present', () => {
    const user = makeUser('eve', { profileBioDesc: 'profile bio' })
    expect(extractUsers(user)).toEqual([
      { userName: 'eve', displayName: null, bio: 'profile bio' },
    ])
  })

  it('profile_bio.description takes priority over legacy.description', () => {
    const user = makeUser('frank', {
      legacyDesc: 'legacy',
      profileBioDesc: 'profile',
    })
    expect(extractUsers(user)).toEqual([
      { userName: 'frank', displayName: null, bio: 'profile' },
    ])
  })

  it('falls back to legacy.description when profile_bio.description is null', () => {
    const user = makeUser('grace', {
      legacyDesc: 'legacy bio',
      profileBioDesc: null,
    })
    expect(extractUsers(user)).toEqual([
      { userName: 'grace', displayName: null, bio: 'legacy bio' },
    ])
  })

  it('returns null bio when both descriptions are null', () => {
    const user = makeUser('heidi', { legacyDesc: null, profileBioDesc: null })
    expect(extractUsers(user)).toEqual([
      { userName: 'heidi', displayName: null, bio: null },
    ])
  })

  it('handles empty string bio', () => {
    const user = makeUser('ivan', { legacyDesc: '' })
    // empty string is falsy but still a valid description value
    expect(extractUsers(user)).toEqual([
      { userName: 'ivan', displayName: null, bio: '' },
    ])
  })
})

// ---------------------------------------------------------------------------
// Non-User __typename nodes — should still recurse into children
// ---------------------------------------------------------------------------
describe('non-User __typename nodes', () => {
  it('recurses into a node with a different __typename', () => {
    const payload = {
      __typename: 'Tweet',
      author: makeUser('judy', { legacyDesc: 'hi' }),
    }
    expect(extractUsers(payload)).toEqual([
      { userName: 'judy', displayName: null, bio: 'hi' },
    ])
  })

  it('does not treat a non-User node as a User', () => {
    const node = { __typename: 'Tweet', core: { screen_name: 'fake' } }
    expect(extractUsers(node)).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Nested structures
// ---------------------------------------------------------------------------
describe('nested objects', () => {
  it('finds a User nested one level deep', () => {
    const payload = { data: makeUser('kate', { legacyDesc: 'bio' }) }
    expect(extractUsers(payload)).toEqual([
      { userName: 'kate', displayName: null, bio: 'bio' },
    ])
  })

  it('finds multiple Users at different nesting levels', () => {
    const payload = {
      a: makeUser('user1', { legacyDesc: 'bio1' }),
      b: {
        c: makeUser('user2', { legacyDesc: 'bio2' }),
      },
    }
    const result = extractUsers(payload)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'user1',
      displayName: null,
      bio: 'bio1',
    })
    expect(result).toContainEqual({
      userName: 'user2',
      displayName: null,
      bio: 'bio2',
    })
  })

  it('handles null values inside nested objects without throwing', () => {
    const payload = { a: null, b: makeUser('lena', { legacyDesc: 'ok' }) }
    expect(extractUsers(payload)).toEqual([
      { userName: 'lena', displayName: null, bio: 'ok' },
    ])
  })

  it('handles primitive values in nested objects', () => {
    const payload = { x: 1, y: 'str', z: makeUser('mia') }
    expect(extractUsers(payload)).toEqual([
      { userName: 'mia', displayName: null, bio: null },
    ])
  })
})

// ---------------------------------------------------------------------------
// Array inputs
// ---------------------------------------------------------------------------
describe('array inputs', () => {
  it('finds a User directly inside an array', () => {
    const arr = [makeUser('nina', { legacyDesc: 'b' })]
    expect(extractUsers(arr)).toEqual([
      { userName: 'nina', displayName: null, bio: 'b' },
    ])
  })

  it('finds multiple Users in an array', () => {
    const arr = [
      makeUser('oscar', { legacyDesc: 'bio-o' }),
      makeUser('pat', { legacyDesc: 'bio-p' }),
    ]
    const result = extractUsers(arr)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'oscar',
      displayName: null,
      bio: 'bio-o',
    })
    expect(result).toContainEqual({
      userName: 'pat',
      displayName: null,
      bio: 'bio-p',
    })
  })

  it('skips null and primitive entries in an array', () => {
    const arr = [null, 42, 'x', makeUser('quinn')]
    expect(extractUsers(arr)).toEqual([
      { userName: 'quinn', displayName: null, bio: null },
    ])
  })

  it('handles nested arrays', () => {
    const arr = [[makeUser('rose', { legacyDesc: 'nested' })]]
    expect(extractUsers(arr)).toEqual([
      { userName: 'rose', displayName: null, bio: 'nested' },
    ])
  })
})

// ---------------------------------------------------------------------------
// Depth limit
// ---------------------------------------------------------------------------
describe('depth limit', () => {
  it('finds a User at exactly depth 20', () => {
    // nest() wraps at depth 1 per layer; extractUsers starts at depth 0 and
    // passes depth+1 for each child traversal, so 20 layers reaches depth 20.
    const payload = nest(makeUser('sam', { legacyDesc: 'deep' }), 20)
    expect(extractUsers(payload)).toEqual([
      { userName: 'sam', displayName: null, bio: 'deep' },
    ])
  })

  it('does NOT find a User at depth 21', () => {
    const payload = nest(makeUser('tom', { legacyDesc: 'too deep' }), 21)
    expect(extractUsers(payload)).toEqual([])
  })

  it('still finds Users at shallower levels even when deeper nodes are cut off', () => {
    const payload = {
      shallow: makeUser('uma', { legacyDesc: 'found' }),
      deep: nest(makeUser('vic', { legacyDesc: 'lost' }), 21),
    }
    expect(extractUsers(payload)).toEqual([
      { userName: 'uma', displayName: null, bio: 'found' },
    ])
  })
})

// ---------------------------------------------------------------------------
// Real-world API shapes
// ---------------------------------------------------------------------------
describe('HomeTimeline-like shape', () => {
  it('extracts author from a tweet entry', () => {
    const payload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                type: 'TimelineAddEntries',
                entries: [
                  {
                    content: {
                      itemContent: {
                        tweet_results: {
                          result: {
                            __typename: 'Tweet',
                            core: {
                              user_results: {
                                result: makeUser('wendy', {
                                  legacyDesc: 'Timeline bio',
                                }),
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                ],
              },
            ],
          },
        },
      },
    }
    expect(extractUsers(payload)).toEqual([
      { userName: 'wendy', displayName: null, bio: 'Timeline bio' },
    ])
  })

  it('extracts multiple authors from multiple tweet entries', () => {
    const makeEntry = (name: string, bio: string) => ({
      content: {
        itemContent: {
          tweet_results: {
            result: {
              __typename: 'Tweet',
              core: {
                user_results: {
                  result: makeUser(name, { legacyDesc: bio }),
                },
              },
            },
          },
        },
      },
    })

    const payload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [
                  makeEntry('xena', 'bio x'),
                  makeEntry('yara', 'bio y'),
                ],
              },
            ],
          },
        },
      },
    }

    const result = extractUsers(payload)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'xena',
      displayName: null,
      bio: 'bio x',
    })
    expect(result).toContainEqual({
      userName: 'yara',
      displayName: null,
      bio: 'bio y',
    })
  })
})

// ---------------------------------------------------------------------------
// followers count (used to prioritize background prefetch)
// ---------------------------------------------------------------------------
describe('followers count', () => {
  it('extracts legacy.followers_count when present', () => {
    const user = {
      __typename: 'User',
      core: { screen_name: 'popular' },
      legacy: { followers_count: 322122 },
    }
    expect(extractUsers(user)).toEqual([
      { userName: 'popular', displayName: null, bio: null, followers: 322122 },
    ])
  })

  it('omits followers (not null) when the User has no count', () => {
    const user = makeUser('nofollowers')
    const [result] = extractUsers(user)
    expect('followers' in result).toBe(false)
  })

  it('ignores a non-numeric followers_count', () => {
    const user = {
      __typename: 'User',
      core: { screen_name: 'weird' },
      legacy: { followers_count: '1000' },
    }
    const [result] = extractUsers(user)
    expect('followers' in result).toBe(false)
  })

  it('extracts a zero follower count', () => {
    const user = {
      __typename: 'User',
      core: { screen_name: 'brandnew' },
      legacy: { followers_count: 0 },
    }
    expect(extractUsers(user)).toEqual([
      { userName: 'brandnew', displayName: null, bio: null, followers: 0 },
    ])
  })
})

describe('TweetDetail-like shape (replies)', () => {
  it('extracts both the primary tweet author and a reply author', () => {
    const payload = {
      data: {
        threaded_conversation_with_injections_v2: {
          instructions: [
            {
              type: 'TimelineAddEntries',
              entries: [
                {
                  // Primary tweet
                  content: {
                    itemContent: {
                      tweet_results: {
                        result: {
                          __typename: 'Tweet',
                          core: {
                            user_results: {
                              result: makeUser('zara', {
                                legacyDesc: 'primary bio',
                              }),
                            },
                          },
                        },
                      },
                    },
                  },
                },
                {
                  // Reply thread (TimelineTimelineModule adds extra nesting)
                  content: {
                    items: [
                      {
                        item: {
                          itemContent: {
                            tweet_results: {
                              result: {
                                __typename: 'Tweet',
                                core: {
                                  user_results: {
                                    result: makeUser('amir', {
                                      legacyDesc: 'reply bio',
                                    }),
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      },
    }

    const result = extractUsers(payload)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'zara',
      displayName: null,
      bio: 'primary bio',
    })
    expect(result).toContainEqual({
      userName: 'amir',
      displayName: null,
      bio: 'reply bio',
    })
  })
})
