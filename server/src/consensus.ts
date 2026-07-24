// Pure consensus logic — no runtime dependencies, unit-testable in isolation.
//
// The source of truth for a profile's location is X's own AboutAccountQuery, so
// every honest client that looks up the same account reports the identical
// (location, source, accurate) tuple. Casual poisoning is defeated by requiring
// several *distinct* clients to agree before the value is trusted.

export interface LocationVote {
  location: string | null
  source: string | null
  locationAccurate: boolean
  seenAt: number
}

export interface Consensus {
  location: string | null
  source: string | null
  locationAccurate: boolean
  /** Number of distinct clients backing the winning tuple. */
  confidence: number
}

function tupleKey(v: {
  location: string | null
  source: string | null
  locationAccurate: boolean
}): string {
  return JSON.stringify([v.location, v.source, v.locationAccurate])
}

/**
 * Pick the (location, source, accurate) tuple with the most distinct-client
 * votes. Votes are already deduped one-per-client by the `location_votes`
 * primary key, so counting votes counts distinct clients. Ties are broken by
 * the most recently seen vote, so a fresh relocation can overtake stale data
 * once enough clients re-report it.
 */
export function pickConsensus(votes: LocationVote[]): Consensus | null {
  if (votes.length === 0) return null

  const groups = new Map<
    string,
    { vote: LocationVote; count: number; latest: number }
  >()
  for (const v of votes) {
    const k = tupleKey(v)
    const g = groups.get(k)
    if (g) {
      g.count++
      if (v.seenAt > g.latest) g.latest = v.seenAt
    } else {
      groups.set(k, { vote: v, count: 1, latest: v.seenAt })
    }
  }

  let best: { vote: LocationVote; count: number; latest: number } | null = null
  for (const g of groups.values()) {
    if (
      !best ||
      g.count > best.count ||
      (g.count === best.count && g.latest > best.latest)
    ) {
      best = g
    }
  }

  return {
    location: best!.vote.location,
    source: best!.vote.source,
    locationAccurate: best!.vote.locationAccurate,
    confidence: best!.count,
  }
}
