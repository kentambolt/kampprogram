-- =============================================================
-- Kampprogram database schema (v2)
-- =============================================================
-- Importér med:   mysql -u <user> -p <database> < schema.sql
-- Eller via phpMyAdmin: vælg databasen → Importér → vælg denne fil.
--
-- Indholdet er idempotent: kører du det igen, ændres intet
-- (CREATE TABLE IF NOT EXISTS + INSERT IGNORE).
-- =============================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS clubs (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name       VARCHAR(120) NOT NULL,
    slug       VARCHAR(60)  NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id       INT UNSIGNED NOT NULL,
    email         VARCHAR(190) NOT NULL,
    name          VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('owner','editor','viewer') NOT NULL DEFAULT 'editor',
    is_admin      TINYINT(1) NOT NULL DEFAULT 0,
    last_login_at TIMESTAMP NULL DEFAULT NULL,
    login_count   INT UNSIGNED NOT NULL DEFAULT 0,
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_club_email (club_id, email),
    CONSTRAINT fk_users_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE CASCADE
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

-- Simpel aktivitetslog til admin-oversigten ("hvem bruger siden, og til hvad").
CREATE TABLE IF NOT EXISTS activity_log (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    club_id    INT UNSIGNED NULL,
    user_id    INT UNSIGNED NULL,
    action     VARCHAR(60)  NOT NULL,       -- fx 'login', 'list_create', 'user_delete'
    detail     VARCHAR(190) NULL,           -- fx listens navn
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_created (created_at),
    INDEX idx_user (user_id),
    CONSTRAINT fk_log_club FOREIGN KEY (club_id)
        REFERENCES clubs(id) ON DELETE SET NULL,
    CONSTRAINT fk_log_user FOREIGN KEY (user_id)
        REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------
-- Default site-admin.
--
-- Skift adgangskoden efter første login!
--
--   E-mail:      admin@kampprogram.local
--   Adgangskode: changeme
--
-- Brugeren er BÅDE owner i klubben "Min Klub" og site-admin
-- (is_admin = 1), som giver adgang til 🛠 Admin-panelet på tværs
-- af alle klubber.
-- -----------------------------------------------------------------

INSERT IGNORE INTO clubs (id, name, slug) VALUES
    (1, 'Min Klub', 'min-klub');

INSERT IGNORE INTO users (id, club_id, email, name, password_hash, role, is_admin) VALUES
    (1, 1, 'admin@kampprogram.local', 'Administrator',
     '$2b$10$uzD40sNEFGv7qVLwNUbU0uwiFTLG872aL/zySs52f03cczJz1YuoG',
     'owner', 1);

-- -----------------------------------------------------------------
-- Opgradering fra schema v1 (kun nødvendigt hvis du allerede har
-- importeret en tidligere version af denne fil — ellers ignorér):
--
--   ALTER TABLE users ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0;
--   ALTER TABLE users ADD COLUMN last_login_at TIMESTAMP NULL DEFAULT NULL;
--   ALTER TABLE users ADD COLUMN login_count INT UNSIGNED NOT NULL DEFAULT 0;
--   UPDATE users SET is_admin = 1 WHERE id = 1;
-- -----------------------------------------------------------------
