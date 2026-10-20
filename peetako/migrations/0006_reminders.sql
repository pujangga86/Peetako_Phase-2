-- Peetako Phase 2: daily reminders (decided 20 Oct 2026).
--
-- Adds the bookkeeping for the "streak at risk" alert and the daily alert cap. Additive only.
-- "day" columns are Malaysia dates 'YYYY-MM-DD' (UTC+8), the same day the check-in resets on.

-- Malaysia day on which the "streak at risk" alert was last delivered (at most one a day).
ALTER TABLE notify_state ADD COLUMN streak_day TEXT;
-- Daily cap: how many capped alerts were delivered on sent_day. "Last chance" alerts are never capped.
ALTER TABLE notify_state ADD COLUMN sent_day TEXT;
ALTER TABLE notify_state ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0;
