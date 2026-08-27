-- =============================================================
-- Kampprogram database schema (v3 — multi-klub medlemskab)
-- =============================================================
-- FRISK INSTALLATION. Har du allerede en kørende v2-database,
-- så brug upgrade_multiclub.sql i stedet.
--
-- Importér med phpMyAdmin (Importér-fanen) eller:
--   mysql -u <user> -p <database> < schema.sql
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS clubs (
    id                  INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name                VARCHAR(120) NOT NULL,
    slug                VARCHAR(60)  NOT NULL UNIQUE,
    default_court_count TINYINT UNSIGNED NULL DEFAULT NULL,
    created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Delte "igangværende sessioner": et klubmedlem kan gemme aftenens session,
-- og et andet medlem kan hente den og fortsætte med at generere runder.
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

-- Global brugerkonto — én pr. e-mail, uafhængig af klubber.
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    email         VARCHAR(190) NOT NULL UNIQUE,
    name          VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_admin      TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    login_count   INT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Medlemskab: en bruger kan være med i flere klubber med hver sin rolle.
CREATE TABLE IF NOT EXISTS club_members (
    club_id    INT UNSIGNED NOT NULL,
    user_id    INT UNSIGNED NOT NULL,
    role       ENUM('owner','editor','viewer') NOT NULL DEFAULT 'editor',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (club_id, user_id),
    CONSTRAINT fk_cm_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE,
    CONSTRAINT fk_cm_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Invitationer: owner inviterer pr. e-mail; modtageren accepterer via link.
CREATE TABLE IF NOT EXISTS invitations (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    token              CHAR(64) NOT NULL UNIQUE,
    club_id            INT UNSIGNED NOT NULL,
    email              VARCHAR(190) NOT NULL,
    role               ENUM('owner','editor','viewer') NOT NULL DEFAULT 'editor',
    invited_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at         TIMESTAMP NOT NULL,
    accepted_at        TIMESTAMP NULL DEFAULT NULL,
    INDEX idx_inv_email (email),
    CONSTRAINT fk_inv_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE,
    CONSTRAINT fk_inv_user FOREIGN KEY (invited_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS player_lists (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id            INT UNSIGNED NOT NULL,
    name               VARCHAR(120) NOT NULL,
    players            JSON NOT NULL,
    created_by_user_id INT UNSIGNED NULL,
    created_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at         TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_listname (club_id, name),
    CONSTRAINT fk_lists_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE,
    CONSTRAINT fk_lists_user FOREIGN KEY (created_by_user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id    INT UNSIGNED NULL,
    user_id    INT UNSIGNED NULL,
    action     VARCHAR(60)  NOT NULL,
    detail     VARCHAR(190) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at),
    INDEX idx_user (user_id),
    CONSTRAINT fk_log_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE SET NULL,
    CONSTRAINT fk_log_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- Default site-admin. Skift adgangskoden efter første login!
--   E-mail:      admin@kampprogram.local
--   Adgangskode: changeme
-- -----------------------------------------------------------------

INSERT IGNORE INTO clubs (id, name, slug) VALUES
    (1, 'Min Klub', 'min-klub');

INSERT IGNORE INTO users (id, email, name, password_hash, is_admin) VALUES
    (1, 'admin@kampprogram.local', 'Administrator',
     '$2b$10$uzD40sNEFGv7qVLwNUbU0uwiFTLG872aL/zySs52f03cczJz1YuoG',
     1);

INSERT IGNORE INTO club_members (club_id, user_id, role) VALUES
    (1, 1, 'owner');
