// X's AboutAccountQuery budget, written down once: the extension paces lookups
// on it and this server sizes each client's contribution budget from it. Here
// and not in src/, because the VPS and the Docker build see only server/.

// Measured live; the real budget comes from the x-rate-limit-* headers.
export const LOOKUP_LIMIT_PER_WINDOW = 50
export const LOOKUP_WINDOW_MINUTES = 15
export const LOOKUP_WINDOW_MS = LOOKUP_WINDOW_MINUTES * 60 * 1000
