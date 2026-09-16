-- =============================================================
-- Kampprogram — opgradering: fælles kampstatistik pr. klub
-- Kør EFTER upgrade_photos.sql. Nye installationer: kun schema.sql.
-- =============================================================

CREATE TABLE IF NOT EXISTS club_matches (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id      INT UNSIGNED NOT NULL,
    rid          VARCHAR(40) NOT NULL,
    court_index  TINYINT UNSIGNED NOT NULL,
    played_at_ms BIGINT UNSIGNED NOT NULL,
    side_a       TEXT NOT NULL,
    side_b       TEXT NOT NULL,
    result       ENUM('A','B','D') NULL,
    updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_match (club_id, rid, court_index),
    KEY idx_club_played (club_id, played_at_ms),
    CONSTRAINT fk_cm_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
