import { definedFacts, parseAccountFacts } from './profile'
import type { AccountFacts } from './profile'

export interface UserBio {
  userName: string
  displayName: string | null
  bio: string | null
  /**
   * Account age, affiliate badge, verification, follower count — all of it
   * already sitting in this same node. Only the fields X actually sent are
   * present, so a node that omits one can't blank a value learned elsewhere.
   */
  facts: Partial<AccountFacts>
}

/**
 * Walks a GraphQL response for User nodes. The walk is depth-first over the
 * response's own key/element order, so the result comes back in the order the
 * timeline lists its entries — which is what the prefetch queue consumes as
 * "the order accounts appear on the page".
 */
export function extractUsers(_obj: unknown, depth = 0): UserBio[] {
  if (depth > 20 || !_obj || typeof _obj !== 'object') return []
  const obj = _obj as Record<string, unknown>

  if (obj.__typename === 'User') {
    const core = obj.core as Record<string, unknown> | undefined
    const profileBio = obj.profile_bio as Record<string, unknown> | undefined
    // X's `legacy` object is not read anywhere any more: measured live against
    // a logged-in home timeline (August 2026), all 57 User nodes carried
    // `profile_bio.description` and an empty `legacy`.
    const userName = core?.screen_name as string | undefined
    if (userName) {
      const displayName = (core?.name ?? null) as string | null
      const bio = (profileBio?.description ?? null) as string | null
      return [
        {
          userName,
          displayName,
          bio,
          facts: definedFacts(parseAccountFacts(obj)),
        },
      ]
    }
    return []
  }

  const results: UserBio[] = []
  const values = Array.isArray(obj) ? obj : Object.values(obj)
  for (const v of values) {
    if (v && typeof v === 'object') {
      results.push(...extractUsers(v, depth + 1))
    }
  }
  return results
}
