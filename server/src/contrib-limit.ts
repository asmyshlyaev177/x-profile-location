// Per-client contribution budget, in memory and per window — see "The
// contribution budget" in CLAUDE.md.

/** How long a client's budget window lasts. Matches X's own lookup window. */
export const CONTRIB_WINDOW_MS = 15 * 60 * 1000

// Distinct handles one clientId may contribute per window. An honest client
// should never reach this; if real users do, raise it.
export const CONTRIB_HANDLE_LIMIT = 200

// Ceiling on tracked clients, so rotating ids cannot turn the guard itself into
// a memory-exhaustion vector. Eviction resets that client's budget.
export const MAX_TRACKED_CLIENTS = 50_000

interface Budget {
  windowStart: number
  handles: Set<string>
}

const budgets = new Map<string, Budget>()

/** The subset of `usernames` this client still has budget for, in the order
 *  given. Names it already contributed this window are free. */
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
  evictStaleClients()

  return accepted
}

/** Drop the stalest budgets past MAX_TRACKED_CLIENTS: every touch re-inserts,
 *  so the front of the map is the least recently active. */
function evictStaleClients(): void {
  if (budgets.size <= MAX_TRACKED_CLIENTS) return
  const excess = budgets.size - MAX_TRACKED_CLIENTS
  let dropped = 0
  for (const key of budgets.keys()) {
    budgets.delete(key)
    if (++dropped >= excess) break
  }
}

/** Test seam — the map is process-global. */
export function __resetContribLimit(): void {
  budgets.clear()
}
