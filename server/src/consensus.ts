// Pure consensus logic. Every honest client reading the same account reports an
// identical tuple, so agreement between distinct clients is the signal.

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

/** The tuple with the most distinct-client votes (the primary key dedupes them),
 *  ties broken by the most recently seen vote. */
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
