-- =============================================================
-- Opgradering: v2 (én klub pr. bruger) → v3 (multi-klub)
-- =============================================================
-- Kør denne på en EKSISTERENDE database, der allerede har den
-- gamle struktur. Dine klubber, brugere og spillerlister bevares;
-- brugernes klub-tilknytning flyttes til den nye club_members-tabel.
--
-- VIGTIGT: Har brugere med samme e-mail eksisteret i flere klubber
-- (som separate rækker), beholdes kun den ældste række — kør i så
-- fald først: SELECT email, COUNT(*) FROM users GROUP BY email HAVING COUNT(*) > 1;
--
-- Importér via phpMyAdmin (Importér-fanen) eller:
--   mysql -u <user> -p <database> < upgrade_multiclub.sql
-- =============================================================

SET NAMES utf8mb4;

-- 1. Ny medlemskabstabel.
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

-- 2. Flyt eksisterende klub-tilknytninger over.
INSERT IGNORE INTO club_members (club_id, user_id, role, created_at)
SELECT club_id, id, role, created_at FROM users;

-- 3. Fjern dubletter på e-mail (behold ældste konto pr. e-mail).
DELETE u1 FROM users u1
INNER JOIN users u2
    ON u1.email = u2.email AND u1.id > u2.id;

-- 4. Gør e-mail globalt unik og drop klub-kolonnerne fra users.
ALTER TABLE users DROP FOREIGN KEY fk_users_club;
ALTER TABLE users DROP INDEX uq_club_email;
ALTER TABLE users ADD UNIQUE KEY uq_email (email);
ALTER TABLE users DROP COLUMN club_id;
ALTER TABLE users DROP COLUMN role;

-- 5. Invitationstabel.
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
