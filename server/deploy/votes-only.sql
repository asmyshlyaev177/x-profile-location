-- Converts a database from the layout with a `profiles` table, attached as
-- `live`, into a new one made from schema.sql. vacuum.ts runs it in one
-- transaction and checks the result vote by vote.
--
-- `profiles` is not copied: a profile with a vote is worked out from its votes
-- on read, and one with none was due for the retention sweep.

-- Commonest first: SQLite stores id 1 in zero bytes and up to 127 in one.
-- used_at holds what a vote write would have set it to: its newest vote.
INSERT INTO main.labels (text, used_at)
SELECT text, MAX(seen_at)
  FROM (SELECT location AS text, seen_at FROM live.location_votes
         WHERE location IS NOT NULL
        UNION ALL
        SELECT source, seen_at FROM live.location_votes
         WHERE source IS NOT NULL)
 GROUP BY text
 ORDER BY COUNT(*) DESC, text;

-- LEFT JOINs, so a vote with no location or no source keeps its NULL.
INSERT INTO main.location_votes
       (username, client_id, location, source, location_accurate, seen_at)
SELECT v.username, v.client_id, l.id, s.id, v.location_accurate, v.seen_at
  FROM live.location_votes v
  LEFT JOIN main.labels l ON l.text = v.location
  LEFT JOIN main.labels s ON s.text = v.source
 ORDER BY v.username, v.client_id;
