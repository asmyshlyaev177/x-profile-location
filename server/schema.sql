-- Shared location cache — D1 (SQLite) schema.
--
-- Two tables:
--   profiles       — the consensus-resolved answer served to clients (one row/user)
--   location_votes — one vote per (username, client_id); consensus is recomputed
--                    from these on every contribution.
--
-- Only the AboutAccountQuery-derived fields live here (location / source /
-- location_accurate). Bio and displayName are intentionally NOT stored: clients
-- get those for free from the timeline JSON, so there is nothing to share.

CREATE TABLE IF NOT EXISTS profiles (
  username            TEXT    PRIMARY KEY,        -- lowercased handle
  location            TEXT,                       -- e.g. "JP", "EUR", or NULL
  source              TEXT,                       -- e.g. "Japan Android App" or NULL
  location_accurate   INTEGER NOT NULL DEFAULT 1, -- 0/1; X's "location may be inaccurate" flag
  location_confidence INTEGER NOT NULL DEFAULT 0, -- distinct clients backing the winning tuple
  updated_at          INTEGER NOT NULL DEFAULT 0  -- ms epoch of last consensus update
);

CREATE TABLE IF NOT EXISTS location_votes (
  username          TEXT    NOT NULL,             -- lowercased handle
  client_id         TEXT    NOT NULL,             -- anonymous per-install id
  location          TEXT,
  source            TEXT,
  location_accurate INTEGER NOT NULL DEFAULT 1,
  seen_at           INTEGER NOT NULL DEFAULT 0,   -- ms epoch this client last observed the value
  PRIMARY KEY (username, client_id)               -- one (latest) vote per client per user
);

-- No secondary indexes on location_votes, deliberately:
--   * a username index would just duplicate the primary key — SQLite already uses
--     the PK (username, client_id) leading column for every `WHERE username IN (…)`.
--   * a seen_at index is still not worth it, even though the retention cleanup
--     (`DELETE ... WHERE seen_at < ?`, see scheduled() in src/index.ts) scans on
--     seen_at: that DELETE runs weekly and spends the abundant read budget,
--     whereas an index would add a write to every vote INSERT — taxing D1's ~50x
--     scarcer write budget on the hot path to speed up a cold one. The weekly
--     full-table scan is the cheaper trade.
--
-- The second point was re-measured on the SQLite backend, where the write-budget
-- argument does not apply, and it still holds — for a different reason. Adding
-- the seen_at index made a realistic daily retention pass over 5M rows *slower*
-- (1492ms vs 1138ms) as well as inserts 171% slower and the file 20% larger: the
-- scan was never the cost, deleting the rows was, and a second index is one more
-- structure each delete has to update. See "Indexes: don't add any" in README.md
-- for the full numbers. Do not add one without re-running that measurement.
