import { definedFacts, parseAccountFacts } from './profile'
import type { AccountFacts } from './profile'

export interface UserBio {
  userName: string
  displayName: string | null
  bio: string | null
  /** Only the fields X sent, so a node that omits one can't blank it. */
  facts: Partial<AccountFacts>
}

/** Every User node in a GraphQL response, depth-first — so, timeline order. */
export function extractUsers(_obj: unknown, depth = 0): UserBio[] {
  if (depth > 20 || !_obj || typeof _obj !== 'object') return []
  const obj = _obj as Record<string, unknown>

  if (obj.__typename === 'User') {
    const core = obj.core as Record<string, unknown> | undefined
    const profileBio = obj.profile_bio as Record<string, unknown> | undefined
    // `legacy` is deliberately never read: measured live in August 2026, all 57
    // User nodes on a home timeline carried `profile_bio` and an empty `legacy`.
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
