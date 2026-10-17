-- Peetako Phase 2C: social and economy.
--
-- Decided 16 Oct 2026: the four-word Secret Key is replaced by a 6-digit PIN and players choose their own
-- Call Code. Existing pets (test pets only) are reset, so the pet table is rebuilt instead of migrated.
-- Every table that points at a pet is dropped first and recreated empty.
-- All times are Unix epoch milliseconds (UTC). "day" columns are Malaysia dates 'YYYY-MM-DD' (UTC+8),
-- because daily limits and the daily leaderboard reset at 00:00 MYT.

DROP TABLE IF EXISTS notify_state;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS pet;
DELETE FROM rate_limits;

CREATE TABLE pet (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  call_code          TEXT    NOT NULL UNIQUE,          -- as chosen: PTK- plus 6 to 8 letters/digits
  code_key           TEXT    NOT NULL UNIQUE,          -- look-alike-proof form: 0→O, 1 and L→I (uniqueness and login)
  pin_hash           TEXT    NOT NULL,                 -- HMAC of code_key + 6-digit PIN
  pin_fail_streak    INTEGER NOT NULL DEFAULT 0,       -- wrong PINs since the last success or lock
  pin_fail_day       TEXT,                             -- MYT day of pin_fail_count
  pin_fail_count     INTEGER NOT NULL DEFAULT 0,       -- wrong PINs on pin_fail_day
  pin_locked_until   INTEGER NOT NULL DEFAULT 0,
  reg_ip             TEXT,                             -- hashed network at hatch; only used to refuse self-referrals
  name               TEXT    NOT NULL,
  name_status        TEXT    NOT NULL DEFAULT 'ok',    -- ok | hidden (reported, waiting for review) | approved
  title              TEXT,                             -- Tier 7 custom title
  title_status       TEXT    NOT NULL DEFAULT 'ok',
  type               TEXT    NOT NULL CHECK (type IN ('organic', 'robot')),
  palette            TEXT    NOT NULL DEFAULT 'hijau',
  born_at            INTEGER NOT NULL,
  last_cared_at      INTEGER NOT NULL,
  stats_at           INTEGER NOT NULL,
  energy             REAL    NOT NULL DEFAULT 80,
  health             REAL    NOT NULL DEFAULT 80,
  temperature        REAL    NOT NULL DEFAULT 80,
  mood               REAL    NOT NULL DEFAULT 80,
  tier               INTEGER NOT NULL DEFAULT 0,
  tier_paid          INTEGER NOT NULL DEFAULT 0,       -- highest tier whose coin reward was paid
  care_days          INTEGER NOT NULL DEFAULT 0,
  last_care_day      TEXT,
  hibernation_days_used INTEGER NOT NULL DEFAULT 0,
  open_to_challenge  INTEGER NOT NULL DEFAULT 1,
  died_at            INTEGER,
  ascended_at        INTEGER,
  legacy_score       INTEGER,
  legacy_from        INTEGER,
  coins              INTEGER NOT NULL DEFAULT 0 CHECK (coins >= 0),
  equipped           TEXT    NOT NULL DEFAULT '{}',    -- JSON { head, neck, back, backdrop } of item ids
  checkin_day        TEXT,                             -- MYT day of the last daily check-in
  streak             INTEGER NOT NULL DEFAULT 0,       -- consecutive check-in days
  referred_by        INTEGER,                          -- pet id from an invite link
  referral_state     INTEGER NOT NULL DEFAULT 0,       -- 0 waiting, 1 paid, 2 void
  battle_wins        INTEGER NOT NULL DEFAULT 0,
  battle_losses      INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_pet_alive ON pet (died_at, last_cared_at);

CREATE TABLE sessions (
  token_hash  TEXT    PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pet(id),
  created_at  INTEGER NOT NULL,
  expires_at  INTEGER NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);

CREATE TABLE push_subscriptions (
  endpoint    TEXT    PRIMARY KEY,
  pet_id      INTEGER NOT NULL REFERENCES pet(id),
  p256dh      TEXT    NOT NULL,
  auth        TEXT    NOT NULL,
  tz          TEXT    NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  created_at  INTEGER NOT NULL,
  last_ok_at  INTEGER
);
CREATE INDEX idx_push_pet ON push_subscriptions (pet_id);

CREATE TABLE notify_state (
  pet_id       INTEGER PRIMARY KEY REFERENCES pet(id),
  cycle_at     INTEGER NOT NULL,
  dormant_sent INTEGER NOT NULL DEFAULT 0,
  urgent_sent  INTEGER NOT NULL DEFAULT 0,
  last_sent    INTEGER NOT NULL DEFAULT 0,
  tier_sent    INTEGER NOT NULL DEFAULT 0
);

-- Per-pet daily counters (coins earned from care and the mini-game, gifts sent, battles, Pampers, ...).
CREATE TABLE daily (
  pet_id  INTEGER NOT NULL,
  day     TEXT    NOT NULL,
  kind    TEXT    NOT NULL,
  n       INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (pet_id, day, kind)
);
CREATE INDEX idx_daily_day ON daily (day);

-- Cosmetics a pet owns (bought or received as a gift). Each item once per pet.
CREATE TABLE inventory (
  pet_id       INTEGER NOT NULL,
  item         TEXT    NOT NULL,
  acquired_at  INTEGER NOT NULL,
  from_pet     INTEGER,                                -- set when it was a gift
  PRIMARY KEY (pet_id, item)
);

-- Things that happened to a pet while its owner was away (gift received, Pampered, challenged).
CREATE TABLE events (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id    INTEGER NOT NULL,
  kind      TEXT    NOT NULL,                          -- gift | pamper | battle | referral
  from_pet  INTEGER,
  data      TEXT    NOT NULL DEFAULT '{}',
  at        INTEGER NOT NULL,
  seen      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_events_pet ON events (pet_id, seen, id);

-- Tangkap Kelip-kelip: one row per started run (anti-cheat), best score per pet per MYT day.
CREATE TABLE game_runs (
  token_hash  TEXT    PRIMARY KEY,
  pet_id      INTEGER NOT NULL,
  started_at  INTEGER NOT NULL,
  finished_at INTEGER
);
CREATE INDEX idx_game_runs_started ON game_runs (started_at);

CREATE TABLE game_scores (
  pet_id  INTEGER NOT NULL,
  day     TEXT    NOT NULL,
  best    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (pet_id, day)
);
CREATE INDEX idx_game_scores_day ON game_scores (day, best DESC);

-- Reports of a pet name or Tier 7 title. The text is hidden at the first report until an admin decides.
CREATE TABLE reports (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  pet_id       INTEGER NOT NULL,
  field        TEXT    NOT NULL CHECK (field IN ('name', 'title')),
  text         TEXT    NOT NULL,
  reporter_pet INTEGER NOT NULL,
  created_at   INTEGER NOT NULL,
  status       TEXT    NOT NULL DEFAULT 'open',       -- open | approved | rejected | dropped
  resolved_at  INTEGER
);
CREATE INDEX idx_reports_open ON reports (status, created_at);

-- Friendly battles (no penalty for the loser).
CREATE TABLE battles (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  attacker  INTEGER NOT NULL,
  defender  INTEGER NOT NULL,
  winner    INTEGER NOT NULL,
  at        INTEGER NOT NULL
);
CREATE INDEX idx_battles_at ON battles (at);
