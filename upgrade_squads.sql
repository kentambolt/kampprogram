-- =============================================================
-- Opgradering: hold (squads) + klub-spillerbase
-- =============================================================
-- Kør EFTER upgrade_multiclub.sql og upgrade_clubpages.sql.
-- Importér via phpMyAdmin → Importér.
-- =============================================================

SET NAMES utf8mb4;

-- Klubbens fælles spillerbase: én række pr. spiller i klubben.
CREATE TABLE IF NOT EXISTS club_players (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id    INT UNSIGNED NOT NULL,
    name       VARCHAR(120) NOT NULL,
    level      TINYINT UNSIGNED NOT NULL DEFAULT 3,   -- 1-5 (Nybegynder..Elite)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_player (club_id, name),
    CONSTRAINT fk_cp_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hold: navngiven delmængde af klubbens spillerbase. En spiller kan være
-- på flere hold.
CREATE TABLE IF NOT EXISTS squads (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id            INT UNSIGNED NOT NULL,
    name               VARCHAR(120) NOT NULL,
    created_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_squad (club_id, name),
    CONSTRAINT fk_sq_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE,
    CONSTRAINT fk_sq_user FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS squad_members (
    squad_id       INT UNSIGNED NOT NULL,
    club_player_id INT UNSIGNED NOT NULL,
    PRIMARY KEY (squad_id, club_player_id),
    CONSTRAINT fk_sm_squad FOREIGN KEY (squad_id)
        REFERENCES squads(id) ON DELETE CASCADE,
    CONSTRAINT fk_sm_player FOREIGN KEY (club_player_id)
        REFERENCES club_players(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
