-- Peetako Phase 2 schema (D1 / SQLite), fresh database `peetako-p2`.
-- Phase 1's two migrations (pet/sessions/rate_limits + push alerts) merged into one file,
-- plus the Phase 2A columns for care days and Ascension.
-- All times are Unix epoch milliseconds (UTC).

CREATE TABLE IF NOT EXISTS pet (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  call_code          TEXT    NOT NULL UNIQUE,          -- PTK- plus 6 characters
  key_hash           TEXT    NOT NULL UNIQUE,
  name               TEXT    NOT NULL,
  type               TEXT    NOT NULL CHECK (type IN ('organic', 'robot')),
  born_at            INTEGER NOT NULL,
  last_cared_at      INTEGER NOT NULL,
  stats_at           INTEGER NOT NULL,                 -- when the stored stats were last computed
  energy             REAL    NOT NULL DEFAULT 80,
  health             REAL    NOT NULL DEFAULT 80,
  temperature        REAL    NOT NULL DEFAULT 80,
  mood               REAL    NOT NULL DEFAULT 80,
  tier               INTEGER NOT NULL DEFAULT 0,
  care_days          INTEGER NOT NULL DEFAULT 0,       -- distinct UTC days with at least one care action
  last_care_day      TEXT,                             -- 'YYYY-MM-DD' (UTC) of the latest care action
  hibernation_days_used INTEGER NOT NULL DEFAULT 0,    -- reserved (hibernation not built yet)
  open_to_challenge  INTEGER NOT NULL DEFAULT 1,       -- reserved for battles
  died_at            INTEGER,
  ascended_at        INTEGER,                          -- set when the owner chose Ascension (Tier 8)
  legacy_score       INTEGER,                          -- fixed at Ascension
  legacy_from        INTEGER                           -- reserved for the Legacy Egg
);

CREATE INDEX IF NOT EXISTS idx_pet_alive ON pet (died_at, last_cared_at);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT    PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pet(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions (expires_at);

-- Fixed-window rate limits. bucket = "<action>:<hashed ip>:<window start>"
CREATE TABLE IF NOT EXISTS rate_limits (
  bucket      TEXT    PRIMARY KEY,
  count       INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);

-- Web Push care alerts: one row per device/browser that turned on alerts.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint    TEXT    PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pet(id),
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  tz          TEXT    NOT NULL DEFAULT 'Asia/Kuala_Lumpur', -- for quiet hours
  created_at  INTEGER NOT NULL,
  last_ok_at  INTEGER
);

CREATE INDEX IF NOT EXISTS idx_push_pet ON push_subscriptions (pet_id);

-- Which alerts a pet has already had. cycle_at = last_cared_at when the flags were set.
CREATE TABLE IF NOT EXISTS notify_state (
  pet_id       INTEGER PRIMARY KEY REFERENCES pet(id),
  cycle_at     INTEGER NOT NULL,
  dormant_sent INTEGER NOT NULL DEFAULT 0,
  urgent_sent  INTEGER NOT NULL DEFAULT 0,
  last_sent    INTEGER NOT NULL DEFAULT 0,
  tier_sent    INTEGER NOT NULL DEFAULT 0
);
