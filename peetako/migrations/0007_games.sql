-- Peetako Phase 2 — more mini-games (decided 20 Oct 2026).
-- Adds Ikut Rentak, Lidah Pantas, Padan Motif and Panjat Pokok beside Tangkap Kelip-kelip. Every game has its own
-- leaderboards (daily, all time, by country) and its own daily top-3 badges; coins from all games share one
-- daily cap (50). Additive only: the old game_scores and game_badges tables are copied, then left unused.

-- Which game a run belongs to. Runs started before this migration are Tangkap Kelip-kelip.
ALTER TABLE game_runs ADD COLUMN game TEXT NOT NULL DEFAULT 'kelip';

-- Best score per game, per pet, per MYT day.
CREATE TABLE IF NOT EXISTS game_best (
  game    TEXT    NOT NULL,
  pet_id  INTEGER NOT NULL,
  day     TEXT    NOT NULL,
  best    INTEGER NOT NULL,
  at      INTEGER NOT NULL,
  PRIMARY KEY (game, pet_id, day)
);
CREATE INDEX IF NOT EXISTS idx_game_best_day ON game_best (game, day, best DESC);
CREATE INDEX IF NOT EXISTS idx_game_best_pet ON game_best (pet_id);
INSERT OR IGNORE INTO game_best (game, pet_id, day, best, at) SELECT 'kelip', pet_id, day, best, at FROM game_scores;

-- Daily top 3 per game (gold = 1, silver = 2, bronze = 3), given after midnight Malaysia time.
CREATE TABLE IF NOT EXISTS game_medals (
  game    TEXT    NOT NULL,
  day     TEXT    NOT NULL,
  rank    INTEGER NOT NULL CHECK (rank BETWEEN 1 AND 3),
  pet_id  INTEGER NOT NULL,
  score   INTEGER NOT NULL,
  PRIMARY KEY (game, day, rank)
);
CREATE INDEX IF NOT EXISTS idx_game_medals_pet ON game_medals (pet_id);
INSERT OR IGNORE INTO game_medals (game, day, rank, pet_id, score) SELECT 'kelip', day, rank, pet_id, score FROM game_badges;
