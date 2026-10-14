-- Peetako Phase 2B: the pet's colour palette (retro frame).
-- One of: hijau (Hijau Rimba), tokay, kenyalang, puakumbu (Pua Kumbu), laut (Laut Borneo).
-- New pets get a random palette at hatch; pets from before 2B start as Hijau Rimba.
ALTER TABLE pet ADD COLUMN palette TEXT NOT NULL DEFAULT 'hijau';
