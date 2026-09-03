-- A private place to keep a full snapshot of `doc` before a destructive
-- change, so it can be restored later. Never served by any Worker route —
-- unlike R2 (see /api/img/:key), a table with no route pointing at it can't
-- leak by way of a guessed key.
--
-- Run once:  wrangler d1 execute sabertooth --remote --file=./schema_archive.sql
CREATE TABLE IF NOT EXISTS doc_archive (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  label       TEXT    NOT NULL,
  data        TEXT    NOT NULL,
  version     INTEGER NOT NULL,
  archived_at TEXT    NOT NULL
);
