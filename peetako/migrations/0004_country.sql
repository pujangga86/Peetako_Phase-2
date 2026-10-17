-- Peetako Phase 2C: player country (decided 17 Oct 2026).
--
-- pet.country holds an ISO 3166-1 alpha-2 code in capitals, or 'ZZ' when the player chose "Prefer not to say".
-- NULL means "not chosen yet": only pets that hatched before this migration. They get one chance to pick
-- (POST /api/country), after which the choice is locked, like the colour. New pets must choose at hatch.
-- Nothing is rebuilt and no data is lost, so existing pets, coins and scores are untouched.

ALTER TABLE pet ADD COLUMN country TEXT CHECK (country IS NULL OR (length(country) = 2 AND country = upper(country)));

-- Country filters and the country-to-country board both start from the pet's country.
CREATE INDEX idx_pet_country ON pet (country);
