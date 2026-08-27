-- =============================================================
-- Opgradering: klubside, klub-baner og delte sessioner
-- =============================================================
-- Kør EFTER upgrade_multiclub.sql (eller på en frisk v3-database
-- der mangler disse). Importér via phpMyAdmin → Importér.
-- =============================================================

SET NAMES utf8mb4;

ALTER TABLE clubs
    ADD COLUMN default_court_count TINYINT UNSIGNED NULL DEFAULT NULL;

CREATE TABLE IF NOT EXISTS club_sessions (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id            INT UNSIGNED NOT NULL,
    name               VARCHAR(120) NOT NULL,
    payload            MEDIUMTEXT NOT NULL,
    updated_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_session_name (club_id, name),
    CONSTRAINT fk_sessions_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE,
    CONSTRAINT fk_sessions_user FOREIGN KEY (updated_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
