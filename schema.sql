-- Single-row document store: the whole guild DB as one JSON blob plus a
-- version counter used for optimistic concurrency (see PUT /api/db).
CREATE TABLE IF NOT EXISTS doc (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  data       TEXT    NOT NULL,
  version    INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT    NOT NULL
);
