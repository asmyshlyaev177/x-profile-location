-- Shared location cache — D1 (SQLite) schema.
--
-- Two tables:
--   location_votes — one vote per (username, client_id). It is the only record:
--                    the answer served for a username is worked out from its
--                    votes when it is asked for (pickConsensus).
--   labels         — each distinct location or source string, stored once; a
--                    vote holds its id. ~670 strings carried 2.1M votes on
--                    2026-11-09; ids made the votes table 29% smaller.
--
-- Only the AboutAccountQuery-derived fields live here (location / source /
-- location_accurate). Bio and displayName are intentionally NOT stored: clients
-- get those for free from the timeline JSON, so there is nothing to share.

CREATE TABLE IF NOT EXISTS labels (
  id      INTEGER PRIMARY KEY,
  text    TEXT    NOT NULL UNIQUE,
  used_at INTEGER NOT NULL   -- ms epoch of the newest vote written with it; retention deletes by it
);

-- WITHOUT ROWID: the primary key is the table, not a second copy of its keys.
CREATE TABLE IF NOT EXISTS location_votes (
  username          TEXT    NOT NULL,             -- lowercased handle
  client_id         TEXT    NOT NULL,             -- anonymous per-install id
  location          INTEGER,                      -- labels.id, e.g. of "Japan"; NULL when X gave none
  source            INTEGER,                      -- labels.id, e.g. of "Japan Android App"; or NULL
  location_accurate INTEGER NOT NULL DEFAULT 1,   -- 0/1; X's "location may be inaccurate" flag
  seen_at           INTEGER NOT NULL DEFAULT 0,   -- ms epoch this client last observed the value
  net               INTEGER,                      -- 16-bit hash of the sender's /24 or /48 (src/network.ts); a username
                                                  --   keeps one vote per net. NULL: older than the column, or no address
  PRIMARY KEY (username, client_id)               -- one (latest) vote per client per user
) WITHOUT ROWID;

-- No secondary indexes on location_votes, deliberately:
--   * a username index would just duplicate the primary key — SQLite already uses
--     the PK (username, client_id) leading column for every `WHERE username IN (…)`.
--   * a seen_at index is still not worth it, even though the retention cleanup
--     (`DELETE ... WHERE seen_at < ?` — see pruneExpired() in src/index.ts) scans
--     on seen_at: that DELETE runs weekly from the cron and spends the abundant
--     read budget, whereas an index would add a write to every vote INSERT —
--     taxing D1's ~50x scarcer write budget on the hot path to speed up a cold
--     one. The full-table scan is the cheaper trade.
--   * no index on location or source either, so nothing may delete a label by
--     looking for votes that use it: that is a full scan per label. Retention
--     deletes labels by `used_at` instead.
--
-- The second point was re-measured on the SQLite backend, where the write-budget
-- argument does not apply, and it still holds — for a different reason. Adding
-- the seen_at index made a realistic daily retention pass over 5M rows *slower*
-- (1492ms vs 1138ms) as well as inserts 171% slower and the file 20% larger: the
-- scan was never the cost, deleting the rows was, and a second index is one more
-- structure each delete has to update. See "Indexes: don't add any" in README.md
-- for the full numbers. Do not add one without re-running that measurement,
-- which predates WITHOUT ROWID: index entries now carry the whole key, not a rowid.
