-- Peetako Phase 2: alignment with the GDD (decided 20 Oct 2026).
--
-- Adds Bond between pairs of pets, contacts, blocks, Mentor Boost, automatic hibernation, the Legacy Egg
-- and the Tangkap Kelip-kelip daily top-3 badges. Additive only: no table is rebuilt and no data is lost.
-- All times are Unix epoch milliseconds (UTC); "day" columns are Malaysia dates 'YYYY-MM-DD' (UTC+8).

-- Hibernation: hibernation_days_used (already in the table) counts for this Malaysia month 'YYYY-MM'.
ALTER TABLE pet ADD COLUMN hib_month TEXT;
-- Mentor Boost: this pet's stats decay 10% slower until this time.
ALTER TABLE pet ADD COLUMN mentor_until INTEGER NOT NULL DEFAULT 0;
-- Legacy Egg: 1 once the owner of this fallen or ascended pet has claimed its egg (legacy_from on the new pet points back).
ALTER TABLE pet ADD COLUMN legacy_claimed INTEGER NOT NULL DEFAULT 0;

-- Bond points shared by a pair of pets, stored once with the smaller pet id first.
CREATE TABLE IF NOT EXISTS bonds (
  a           INTEGER NOT NULL,
  b           INTEGER NOT NULL,
  points      INTEGER NOT NULL DEFAULT 0,
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (a, b),
  CHECK (a < b)
);

-- Saved Call Codes ("Friends"). At most 100 per pet (checked in code).
CREATE TABLE IF NOT EXISTS contacts (
  pet_id      INTEGER NOT NULL,
  contact_id  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (pet_id, contact_id)
);

-- Blocked pets. A blocked pet cannot Pamper, battle, gift or Mentor Boost its blocker. At most 200 per pet.
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id  INTEGER NOT NULL,
  blocked_id  INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id)
);
CREATE INDEX IF NOT EXISTS idx_blocks_blocked ON blocks (blocked_id);

-- Tangkap Kelip-kelip: the day's top 3 (gold = 1, silver = 2, bronze = 3), given after midnight Malaysia time.
CREATE TABLE IF NOT EXISTS game_badges (
  day     TEXT    NOT NULL,
  rank    INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  pet_id  INTEGER NOT NULL,
  score   INTEGER NOT NULL,
  PRIMARY KEY (day, rank)
);
CREATE INDEX IF NOT EXISTS idx_game_badges_pet ON game_badges (pet_id);
