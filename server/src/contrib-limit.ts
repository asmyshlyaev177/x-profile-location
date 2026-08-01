// Per-client contribution budget.
//
// POST /v1/loc trusts whatever a client sends. That is fine as long as the
// expensive part — actually looking a handle up on X — is what bounds a client,
// and it is: X allows an install ~50 AboutAccountQuery lookups per 15 minutes,
// so an honest client physically cannot report many distinct handles. A
// poisoner skips that step entirely and can post any number of handles it likes
// with a fresh `clientId` per burst.
//
// Open-sourcing publishes the endpoint and its body shape, so this stops being
// theoretical. Combined with VOTE_CAP (index.ts) keeping only the 10 newest
// votes per handle, an unbounded contributor can evict the honest votes for any
// handle it names — which is exactly what the client-side confidence threshold
// (MIN_CONFIDENCE_KEY, see src/scripts/shared-cache.ts) cannot defend against on
// its own.
//
// The guard is deliberately the cheap half of the problem: it caps how many
// *distinct handles* one `clientId` may contribute per window. It does not stop
// an attacker who mints a new id per request — nothing short of attestation
// would — but it makes the cost of poisoning scale with the number of ids they
// have to manufacture and rotate, where today one id poisons without limit.
//
// Held in memory rather than in SQLite on purpose. Counting a client's recent
// handles from location_votes would need an index on client_id, and the schema
// comment in schema.sql has the measurements for why a second index on that
// table is the wrong trade (slower inserts, slower retention pass, bigger file)
// — to defend a budget that is a guardrail, not a security boundary. In-memory
// costs one map and nothing on the write path. The Node/SQLite deployment is a
// single process, so the count is exact there; on Workers each isolate keeps its
// own, which weakens but does not break it.

/** How long a client's budget window lasts. Matches X's own lookup window. */
export const CONTRIB_WINDOW_MS = 15 * 60 * 1000

// Distinct handles one clientId may contribute per window. X caps an honest
// install at ~50 lookups per window; the headroom above that covers several tabs
// sharing an id, the revalidation the server itself asks for, and a client whose
// buffered contributions straddle a window boundary. An honest client should
// never reach this — if legitimate users start hitting it, raise it rather than
// letting it silently drop their data.
export const CONTRIB_HANDLE_LIMIT = 200

// Ceiling on how many clients are tracked at once, so the guard cannot itself be
// turned into a memory-exhaustion vector by rotating ids — which is precisely
// what the attacker it targets is already doing. At the cap, the least recently
// active client is evicted; that client's budget resets, which is the same
// position it would be in without the guard at all.
export const MAX_TRACKED_CLIENTS = 50_000

interface Budget {
  windowStart: number
  handles: Set<string>
}

const budgets = new Map<string, Budget>()

/**
 * Filter `usernames` down to the ones this client still has budget for, and
 * charge them to it. Names the client has already contributed this window are
 * free — re-reporting a handle is what an honest client does when a location
 * changes or the server asks it to revalidate, and it cannot grow the table.
 *
 * Returns the accepted subset, in the order given.
 */
export function admitContributions(
  clientId: string,
  usernames: string[],
  now: number = Date.now(),
): string[] {
  let budget = budgets.get(clientId)
  if (budget === undefined || now - budget.windowStart >= CONTRIB_WINDOW_MS) {
    budget = { windowStart: now, handles: new Set() }
  } else {
    // Re-insert so iteration order stays least-recently-active first, which is
    // what the eviction below relies on.
    budgets.delete(clientId)
  }

  const accepted: string[] = []
  for (const u of usernames) {
    if (budget.handles.has(u)) {
      accepted.push(u)
      continue
    }
    if (budget.handles.size >= CONTRIB_HANDLE_LIMIT) continue
    budget.handles.add(u)
    accepted.push(u)
  }

  budgets.set(clientId, budget)

  if (budgets.size > MAX_TRACKED_CLIENTS) {
    // Drop the stalest entries. Map iterates in insertion order and every touch
    // re-inserts, so the front of the map is the least recently active.
    const excess = budgets.size - MAX_TRACKED_CLIENTS
    let dropped = 0
    for (const key of budgets.keys()) {
      budgets.delete(key)
      if (++dropped >= excess) break
    }
  }

  return accepted
}

/** Test seam — the map is process-global. */
export function __resetContribLimit(): void {
  budgets.clear()
}
