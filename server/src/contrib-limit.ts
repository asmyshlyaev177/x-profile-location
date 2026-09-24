// Per-client contribution budget, in memory and per window - see "The
// contribution budget" in CLAUDE.md.

import { LOOKUP_LIMIT_PER_WINDOW, LOOKUP_WINDOW_MS } from './x-lookup-budget.ts'

/** How long a client's budget window lasts: X's own lookup window. */
export const CONTRIB_WINDOW_MS = LOOKUP_WINDOW_MS

// Distinct handles one clientId may contribute per window. Each is one X lookup,
// and a window here can straddle X's reset, so it spans two X budgets; 2.2 is
// those plus 10% headroom. If real users hit it, raise it.
export const CONTRIB_HANDLE_LIMIT = Math.round(LOOKUP_LIMIT_PER_WINDOW * 2.2) // 50 * 2.2 is 110.00000000000001

// Ceiling on tracked clients, so rotating ids cannot turn the guard itself into
// a memory-exhaustion vector. Eviction resets that client's budget.
export const MAX_TRACKED_CLIENTS = 50_000

interface Budget {
  windowStart: number
  handles: Set<string>
}

const budgets = new Map<string, Budget>()

/** Shared by admission and the sweep, so the sweep never drops a budget that
 *  admission still enforces. */
function isExpired(budget: Budget, now: number): boolean {
  return now - budget.windowStart >= CONTRIB_WINDOW_MS
}

/** The subset of `usernames` this client still has budget for, in the order
 *  given. Names it already contributed this window are free. */
export function admitContributions(
  clientId: string,
  usernames: string[],
  now: number = Date.now(),
): string[] {
  let budget = budgets.get(clientId)
  if (budget === undefined || isExpired(budget, now)) {
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
  evictStaleClients(now)

  return accepted
}

/** Drop budgets from the front, where every touch re-inserting leaves the least
 *  recently active: past MAX_TRACKED_CLIENTS, and any whose window has passed,
 *  since an expired budget admits exactly what no budget would. */
function evictStaleClients(now: number): void {
  for (const [clientId, budget] of budgets) {
    if (!isExpired(budget, now) && budgets.size <= MAX_TRACKED_CLIENTS) return
    budgets.delete(clientId)
  }
}

/** Test seam - the map is process-global. */
export function __resetContribLimit(): void {
  budgets.clear()
}

/** Test seam - memory is the only observable difference an expired budget makes. */
export function __countTrackedClients(): number {
  return budgets.size
}
