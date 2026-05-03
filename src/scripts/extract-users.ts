export interface UserBio {
  userName: string;
  displayName: string | null;
  bio: string | null;
}

export function extractUsers(_obj: unknown, depth = 0): UserBio[] {
  if (depth > 20 || !_obj || typeof _obj !== 'object') return [];
  const obj = _obj as Record<string, unknown>;

  if (obj.__typename === 'User') {
    const core = obj.core as Record<string, unknown> | undefined;
    const legacy = obj.legacy as Record<string, unknown> | undefined;
    const profileBio = obj.profile_bio as Record<string, unknown> | undefined;
    const userName = (core?.screen_name ?? legacy?.screen_name) as string | undefined;
    if (userName) {
      const displayName = (core?.name ?? legacy?.name ?? null) as string | null;
      const bio = (profileBio?.description ?? core?.description ?? legacy?.description ?? null) as string | null;
      return [{ userName, displayName, bio }];
    }
    return [];
  }

  const results: UserBio[] = [];
  const values = Array.isArray(obj) ? obj : Object.values(obj);
  for (const v of values) {
    if (v && typeof v === 'object') {
      results.push(...extractUsers(v, depth + 1));
    }
  }
  return results;
}
