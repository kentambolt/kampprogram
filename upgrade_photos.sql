-- =============================================================
-- Kampprogram — opgradering: valgfrit spillerfoto
-- Kør EFTER upgrade_squads.sql (kræver tabellen club_players).
-- Nye installationer behøver kun schema.sql.
-- =============================================================

ALTER TABLE club_players
    ADD COLUMN photo MEDIUMTEXT NULL AFTER level;
