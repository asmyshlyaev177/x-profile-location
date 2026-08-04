import { describe, expect, it } from 'vitest'
import { extractUsers } from './extract-users'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUser(
  userName: string,
  opts: {
    bioDesc?: string | null
  } = {},
) {
  const { bioDesc } = opts
  return {
    __typename: 'User',
    core: { screen_name: userName },
    profile_bio: bioDesc === undefined ? undefined : { description: bioDesc },
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
    const user = makeUser('alice')
    expect(extractUsers(user)).toEqual([
      { userName: 'alice', displayName: null, bio: null, facts: {} },
    ])
  })

  it('ignores a screen_name on the legacy object', () => {
    // Identity moved to `core`. Reading legacy would resurrect a shape X has
    // retired — see the bio test below for the live measurement.
    const user = {
      __typename: 'User',
      legacy: { screen_name: 'secondary', description: 'bio' },
    }
    expect(extractUsers(user)).toEqual([])
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
  it('returns null bio when profile_bio is absent', () => {
    const user = makeUser('charlie')
    expect(extractUsers(user)).toEqual([
      { userName: 'charlie', displayName: null, bio: null, facts: {} },
    ])
  })

  it('uses profile_bio.description', () => {
    const user = makeUser('eve', { bioDesc: 'profile bio' })
    expect(extractUsers(user)).toEqual([
      { userName: 'eve', displayName: null, bio: 'profile bio', facts: {} },
    ])
  })

  it('ignores a description on the legacy object', () => {
    // Measured live against a home timeline (August 2026): every one of 57 User
    // nodes carried profile_bio.description and an empty legacy.
    const user = {
      __typename: 'User',
      core: { screen_name: 'dave' },
      legacy: { description: 'legacy bio' },
    }
    expect(extractUsers(user)).toEqual([
      { userName: 'dave', displayName: null, bio: null, facts: {} },
    ])
  })

  it('returns null bio when profile_bio.description is null', () => {
    const user = makeUser('heidi', { bioDesc: null })
    expect(extractUsers(user)).toEqual([
      { userName: 'heidi', displayName: null, bio: null, facts: {} },
    ])
  })

  it('keeps an empty-string bio, which is a value and not an absence', () => {
    const user = makeUser('ivan', { bioDesc: '' })
    expect(extractUsers(user)).toEqual([
      { userName: 'ivan', displayName: null, bio: '', facts: {} },
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
      author: makeUser('judy', { bioDesc: 'hi' }),
    }
    expect(extractUsers(payload)).toEqual([
      { userName: 'judy', displayName: null, bio: 'hi', facts: {} },
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
    const payload = { data: makeUser('kate', { bioDesc: 'bio' }) }
    expect(extractUsers(payload)).toEqual([
      { userName: 'kate', displayName: null, bio: 'bio', facts: {} },
    ])
  })

  it('finds multiple Users at different nesting levels', () => {
    const payload = {
      a: makeUser('user1', { bioDesc: 'bio1' }),
      b: {
        c: makeUser('user2', { bioDesc: 'bio2' }),
      },
    }
    const result = extractUsers(payload)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'user1',
      displayName: null,
      bio: 'bio1',
      facts: {},
    })
    expect(result).toContainEqual({
      userName: 'user2',
      displayName: null,
      bio: 'bio2',
      facts: {},
    })
  })

  it('handles null values inside nested objects without throwing', () => {
    const payload = { a: null, b: makeUser('lena', { bioDesc: 'ok' }) }
    expect(extractUsers(payload)).toEqual([
      { userName: 'lena', displayName: null, bio: 'ok', facts: {} },
    ])
  })

  it('handles primitive values in nested objects', () => {
    const payload = { x: 1, y: 'str', z: makeUser('mia') }
    expect(extractUsers(payload)).toEqual([
      { userName: 'mia', displayName: null, bio: null, facts: {} },
    ])
  })
})

// ---------------------------------------------------------------------------
// Array inputs
// ---------------------------------------------------------------------------
describe('array inputs', () => {
  it('finds a User directly inside an array', () => {
    const arr = [makeUser('nina', { bioDesc: 'b' })]
    expect(extractUsers(arr)).toEqual([
      { userName: 'nina', displayName: null, bio: 'b', facts: {} },
    ])
  })

  it('finds multiple Users in an array', () => {
    const arr = [
      makeUser('oscar', { bioDesc: 'bio-o' }),
      makeUser('pat', { bioDesc: 'bio-p' }),
    ]
    const result = extractUsers(arr)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({
      userName: 'oscar',
      displayName: null,
      bio: 'bio-o',
      facts: {},
    })
    expect(result).toContainEqual({
      userName: 'pat',
      displayName: null,
      bio: 'bio-p',
      facts: {},
    })
  })

  it('skips null and primitive entries in an array', () => {
    const arr = [null, 42, 'x', makeUser('quinn')]
    expect(extractUsers(arr)).toEqual([
      { userName: 'quinn', displayName: null, bio: null, facts: {} },
    ])
  })

  it('handles nested arrays', () => {
    const arr = [[makeUser('rose', { bioDesc: 'nested' })]]
    expect(extractUsers(arr)).toEqual([
      { userName: 'rose', displayName: null, bio: 'nested', facts: {} },
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
    const payload = nest(makeUser('sam', { bioDesc: 'deep' }), 20)
    expect(extractUsers(payload)).toEqual([
      { userName: 'sam', displayName: null, bio: 'deep', facts: {} },
    ])
  })

  it('does NOT find a User at depth 21', () => {
    const payload = nest(makeUser('tom', { bioDesc: 'too deep' }), 21)
    expect(extractUsers(payload)).toEqual([])
  })

  it('still finds Users at shallower levels even when deeper nodes are cut off', () => {
    const payload = {
      shallow: makeUser('uma', { bioDesc: 'found' }),
      deep: nest(makeUser('vic', { bioDesc: 'lost' }), 21),
    }
    expect(extractUsers(payload)).toEqual([
      { userName: 'uma', displayName: null, bio: 'found', facts: {} },
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
                                  bioDesc: 'Timeline bio',
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
      { userName: 'wendy', displayName: null, bio: 'Timeline bio', facts: {} },
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
                  result: makeUser(name, { bioDesc: bio }),
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
      facts: {},
    })
    expect(result).toContainEqual({
      userName: 'yara',
      displayName: null,
      bio: 'bio y',
      facts: {},
    })
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
                                bioDesc: 'primary bio',
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
                                      bioDesc: 'reply bio',
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
      facts: {},
    })
    expect(result).toContainEqual({
      userName: 'amir',
      displayName: null,
      bio: 'reply bio',
      facts: {},
    })
  })
})

// ---------------------------------------------------------------------------
// Account facts riding along with the bio
// ---------------------------------------------------------------------------
describe('account facts', () => {
  it('carries the facts the same node already contains', () => {
    const user = {
      __typename: 'User',
      core: {
        screen_name: 'artemis',
        name: 'NASA Artemis',
        created_at: 'Tue Jul 10 21:51:25 +0000 2012',
      },
      is_blue_verified: true,
      privacy: { protected: false },
      relationship_perspectives: { blocked_by: true },
      rest_id: '632344577',
      affiliates_highlighted_label: {
        label: {
          description: 'NASA',
          url: { url: 'https://twitter.com/NASA' },
        },
      },
    }

    const [parsed] = extractUsers(user)
    expect(parsed.userName).toBe('artemis')
    expect(parsed.facts).toEqual({
      createdAt: Date.UTC(2012, 6, 10, 21, 51, 25),
      blockedBy: true,
      blueVerified: true,
      isProtected: false,
      restId: '632344577',
      affiliation: { handle: 'nasa', name: 'NASA', badgeUrl: null },
    })
  })

  it('omits fields the node did not carry, rather than sending nulls', () => {
    const [parsed] = extractUsers({
      __typename: 'User',
      core: { screen_name: 'sparse' },
    })
    expect(parsed.facts).toEqual({})
    // A merge target must be able to tell "not in this response" from
    // "explicitly nothing" — see mergeCached's facts branch.
    expect('blockedBy' in parsed.facts).toBe(false)
  })
})
