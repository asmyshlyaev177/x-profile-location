import { describe, expect, it } from 'vitest';
import { extractUsers } from './extract-users';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeUser(
  screenName: string,
  opts: {
    via?: 'core' | 'legacy';
    legacyDesc?: string | null;
    profileBioDesc?: string | null;
  } = {},
) {
  const { via = 'core', legacyDesc, profileBioDesc } = opts;
  return {
    __typename: 'User',
    core: via === 'core' ? { screen_name: screenName } : undefined,
    legacy: {
      ...(via === 'legacy' ? { screen_name: screenName } : {}),
      ...(legacyDesc !== undefined ? { description: legacyDesc } : {}),
    },
    profile_bio: profileBioDesc !== undefined ? { description: profileBioDesc } : undefined,
  };
}

// Wraps a value in `n` layers of `{ child: <value> }` to reach a given depth.
function nest(value: unknown, layers: number): unknown {
  let result = value;
  for (let i = 0; i < layers; i++) result = { child: result };
  return result;
}

// ---------------------------------------------------------------------------
// Base cases
// ---------------------------------------------------------------------------
describe('base cases', () => {
  it('returns [] for null', () => {
    expect(extractUsers(null)).toEqual([]);
  });

  it('returns [] for undefined', () => {
    expect(extractUsers(undefined)).toEqual([]);
  });

  it('returns [] for a string', () => {
    expect(extractUsers('hello')).toEqual([]);
  });

  it('returns [] for a number', () => {
    expect(extractUsers(42)).toEqual([]);
  });

  it('returns [] for a boolean', () => {
    expect(extractUsers(true)).toEqual([]);
  });

  it('returns [] for an empty object', () => {
    expect(extractUsers({})).toEqual([]);
  });

  it('returns [] for an empty array', () => {
    expect(extractUsers([])).toEqual([]);
  });

  it('returns [] for an object with no User nodes', () => {
    expect(extractUsers({ a: 1, b: { c: 'x' } })).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Direct User node — screen_name source
// ---------------------------------------------------------------------------
describe('User node — screen_name from core', () => {
  it('extracts screenName from core.screen_name', () => {
    const user = makeUser('alice', { via: 'core' });
    expect(extractUsers(user)).toEqual([{ screenName: 'alice', bio: null }]);
  });

  it('falls back to legacy.screen_name when core is absent', () => {
    const user = makeUser('bob', { via: 'legacy' });
    expect(extractUsers(user)).toEqual([{ screenName: 'bob', bio: null }]);
  });

  it('core.screen_name takes priority over legacy.screen_name when both present', () => {
    const user = {
      __typename: 'User',
      core: { screen_name: 'primary' },
      legacy: { screen_name: 'secondary', description: 'bio' },
    };
    expect(extractUsers(user)).toEqual([{ screenName: 'primary', bio: 'bio' }]);
  });

  it('returns [] when __typename is User but no screen_name anywhere', () => {
    const user = { __typename: 'User', core: {}, legacy: {} };
    expect(extractUsers(user)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Direct User node — bio source priority
// ---------------------------------------------------------------------------
describe('User node — bio extraction', () => {
  it('returns null bio when no description fields present', () => {
    const user = makeUser('charlie');
    expect(extractUsers(user)).toEqual([{ screenName: 'charlie', bio: null }]);
  });

  it('uses legacy.description when profile_bio is absent', () => {
    const user = makeUser('dave', { legacyDesc: 'legacy bio' });
    expect(extractUsers(user)).toEqual([{ screenName: 'dave', bio: 'legacy bio' }]);
  });

  it('uses profile_bio.description when present', () => {
    const user = makeUser('eve', { profileBioDesc: 'profile bio' });
    expect(extractUsers(user)).toEqual([{ screenName: 'eve', bio: 'profile bio' }]);
  });

  it('profile_bio.description takes priority over legacy.description', () => {
    const user = makeUser('frank', { legacyDesc: 'legacy', profileBioDesc: 'profile' });
    expect(extractUsers(user)).toEqual([{ screenName: 'frank', bio: 'profile' }]);
  });

  it('falls back to legacy.description when profile_bio.description is null', () => {
    const user = makeUser('grace', { legacyDesc: 'legacy bio', profileBioDesc: null });
    expect(extractUsers(user)).toEqual([{ screenName: 'grace', bio: 'legacy bio' }]);
  });

  it('returns null bio when both descriptions are null', () => {
    const user = makeUser('heidi', { legacyDesc: null, profileBioDesc: null });
    expect(extractUsers(user)).toEqual([{ screenName: 'heidi', bio: null }]);
  });

  it('handles empty string bio', () => {
    const user = makeUser('ivan', { legacyDesc: '' });
    // empty string is falsy but still a valid description value
    expect(extractUsers(user)).toEqual([{ screenName: 'ivan', bio: '' }]);
  });
});

// ---------------------------------------------------------------------------
// Non-User __typename nodes — should still recurse into children
// ---------------------------------------------------------------------------
describe('non-User __typename nodes', () => {
  it('recurses into a node with a different __typename', () => {
    const payload = {
      __typename: 'Tweet',
      author: makeUser('judy', { legacyDesc: 'hi' }),
    };
    expect(extractUsers(payload)).toEqual([{ screenName: 'judy', bio: 'hi' }]);
  });

  it('does not treat a non-User node as a User', () => {
    const node = { __typename: 'Tweet', core: { screen_name: 'fake' } };
    expect(extractUsers(node)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nested structures
// ---------------------------------------------------------------------------
describe('nested objects', () => {
  it('finds a User nested one level deep', () => {
    const payload = { data: makeUser('kate', { legacyDesc: 'bio' }) };
    expect(extractUsers(payload)).toEqual([{ screenName: 'kate', bio: 'bio' }]);
  });

  it('finds multiple Users at different nesting levels', () => {
    const payload = {
      a: makeUser('user1', { legacyDesc: 'bio1' }),
      b: {
        c: makeUser('user2', { legacyDesc: 'bio2' }),
      },
    };
    const result = extractUsers(payload);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ screenName: 'user1', bio: 'bio1' });
    expect(result).toContainEqual({ screenName: 'user2', bio: 'bio2' });
  });

  it('handles null values inside nested objects without throwing', () => {
    const payload = { a: null, b: makeUser('lena', { legacyDesc: 'ok' }) };
    expect(extractUsers(payload)).toEqual([{ screenName: 'lena', bio: 'ok' }]);
  });

  it('handles primitive values in nested objects', () => {
    const payload = { x: 1, y: 'str', z: makeUser('mia') };
    expect(extractUsers(payload)).toEqual([{ screenName: 'mia', bio: null }]);
  });
});

// ---------------------------------------------------------------------------
// Array inputs
// ---------------------------------------------------------------------------
describe('array inputs', () => {
  it('finds a User directly inside an array', () => {
    const arr = [makeUser('nina', { legacyDesc: 'b' })];
    expect(extractUsers(arr)).toEqual([{ screenName: 'nina', bio: 'b' }]);
  });

  it('finds multiple Users in an array', () => {
    const arr = [
      makeUser('oscar', { legacyDesc: 'bio-o' }),
      makeUser('pat', { legacyDesc: 'bio-p' }),
    ];
    const result = extractUsers(arr);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ screenName: 'oscar', bio: 'bio-o' });
    expect(result).toContainEqual({ screenName: 'pat', bio: 'bio-p' });
  });

  it('skips null and primitive entries in an array', () => {
    const arr = [null, 42, 'x', makeUser('quinn')];
    expect(extractUsers(arr)).toEqual([{ screenName: 'quinn', bio: null }]);
  });

  it('handles nested arrays', () => {
    const arr = [[makeUser('rose', { legacyDesc: 'nested' })]];
    expect(extractUsers(arr)).toEqual([{ screenName: 'rose', bio: 'nested' }]);
  });
});

// ---------------------------------------------------------------------------
// Depth limit
// ---------------------------------------------------------------------------
describe('depth limit', () => {
  it('finds a User at exactly depth 20', () => {
    // nest() wraps at depth 1 per layer; extractUsers starts at depth 0 and
    // passes depth+1 for each child traversal, so 20 layers reaches depth 20.
    const payload = nest(makeUser('sam', { legacyDesc: 'deep' }), 20);
    expect(extractUsers(payload)).toEqual([{ screenName: 'sam', bio: 'deep' }]);
  });

  it('does NOT find a User at depth 21', () => {
    const payload = nest(makeUser('tom', { legacyDesc: 'too deep' }), 21);
    expect(extractUsers(payload)).toEqual([]);
  });

  it('still finds Users at shallower levels even when deeper nodes are cut off', () => {
    const payload = {
      shallow: makeUser('uma', { legacyDesc: 'found' }),
      deep: nest(makeUser('vic', { legacyDesc: 'lost' }), 21),
    };
    expect(extractUsers(payload)).toEqual([{ screenName: 'uma', bio: 'found' }]);
  });
});

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
                                result: makeUser('wendy', { legacyDesc: 'Timeline bio' }),
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
    };
    expect(extractUsers(payload)).toEqual([{ screenName: 'wendy', bio: 'Timeline bio' }]);
  });

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
    });

    const payload = {
      data: {
        home: {
          home_timeline_urt: {
            instructions: [
              {
                entries: [makeEntry('xena', 'bio x'), makeEntry('yara', 'bio y')],
              },
            ],
          },
        },
      },
    };

    const result = extractUsers(payload);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ screenName: 'xena', bio: 'bio x' });
    expect(result).toContainEqual({ screenName: 'yara', bio: 'bio y' });
  });
});

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
                              result: makeUser('zara', { legacyDesc: 'primary bio' }),
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
                                    result: makeUser('amir', { legacyDesc: 'reply bio' }),
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
    };

    const result = extractUsers(payload);
    expect(result).toHaveLength(2);
    expect(result).toContainEqual({ screenName: 'zara', bio: 'primary bio' });
    expect(result).toContainEqual({ screenName: 'amir', bio: 'reply bio' });
  });
});
