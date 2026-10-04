-- Aka Nihongo initial schema.
-- updated_at: client clock, drives last-write-wins per record.
-- synced_at:  server clock, drives incremental pulls (`?since=`).

CREATE TABLE profiles (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  avatar      TEXT NOT NULL,
  settings    TEXT NOT NULL,           -- JSON (ProfileSettings)
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER,                 -- soft delete; hard delete by the daily cleanup
  synced_at   INTEGER NOT NULL
);

CREATE TABLE cards (
  profile_id  TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  card_id     TEXT NOT NULL,
  data        TEXT NOT NULL,           -- JSON (scheduler state)
  updated_at  INTEGER NOT NULL,
  deleted     INTEGER NOT NULL DEFAULT 0,
  synced_at   INTEGER NOT NULL,
  PRIMARY KEY (profile_id, card_id)
);
CREATE INDEX cards_synced ON cards (profile_id, synced_at);

CREATE TABLE lesson_progress (
  profile_id   TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lesson_n     INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  score        REAL,
  updated_at   INTEGER NOT NULL,
  synced_at    INTEGER NOT NULL,
  PRIMARY KEY (profile_id, lesson_n)
);
CREATE INDEX lesson_progress_synced ON lesson_progress (profile_id, synced_at);

CREATE TABLE reports (
  id          TEXT PRIMARY KEY,
  profile_id  TEXT,
  lesson_n    INTEGER,
  sentence    TEXT NOT NULL,
  note        TEXT NOT NULL,
  context     TEXT NOT NULL,
  created_at  INTEGER NOT NULL,
  received_at INTEGER NOT NULL
);

CREATE TABLE ai_cache (
  key            TEXT PRIMARY KEY,     -- kind:lesson:whitelistHash[:variant]
  kind           TEXT NOT NULL,
  lesson_n       INTEGER,
  whitelist_hash TEXT NOT NULL,
  payload        TEXT NOT NULL,        -- validated JSON
  created_at     INTEGER NOT NULL
);

CREATE TABLE rate_limits (
  key          TEXT PRIMARY KEY,       -- e.g. unlock:ip:1.2.3.4, ai:profile:<id>
  window_start INTEGER NOT NULL,
  count        INTEGER NOT NULL
);
