<?php
// /api/auth/login, /api/auth/logout, /api/me, /api/auth/change-password

function handle_auth_login(): void {
    $body = read_json_body();
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($email === '' || $password === '') {
        json_error('Email og adgangskode skal udfyldes.', 422);
    }

    $stmt = db()->prepare(
        'SELECT u.*, c.name AS club_name, c.slug AS club_slug
         FROM users u
         JOIN clubs c ON c.id = u.club_id
         WHERE u.email = ?
         LIMIT 1'
    );
    $stmt->execute([$email]);
    $row = $stmt->fetch();

    if (!$row || !password_verify($password, $row['password_hash'])) {
        // Let brute-force-dæmpning: en halv sekunds straf pr. fejlet forsøg.
        usleep(500000);
        // Bevidst vag fejlbesked — afslør ikke om brugeren findes.
        json_error('Forkert email eller adgangskode.', 401);
    }

    auth_login((int)$row['id']);

    // Opdatér usage-statistik + log.
    $stmt = db()->prepare(
        'UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?'
    );
    $stmt->execute([$row['id']]);
    log_activity(['id' => (int)$row['id'], 'club_id' => (int)$row['club_id']], 'login');

    json_response(['user' => public_user($row)]);
}

function handle_auth_logout(): void {
    $u = auth_current_user();
    if ($u) log_activity($u, 'logout');
    auth_logout();
    json_response(['ok' => true]);
}

function handle_me(): void {
    $u = auth_current_user();
    if (!$u) json_response(['user' => null]);
    json_response(['user' => public_user($u)]);
}

function handle_auth_change_password(): void {
    $u = require_auth();
    $body = read_json_body();
    $current = (string)($body['currentPassword'] ?? '');
    $next    = (string)($body['newPassword']     ?? '');

    if (strlen($next) < 6) {
        json_error('Ny adgangskode skal være mindst 6 tegn.', 422);
    }

    $stmt = db()->prepare('SELECT password_hash FROM users WHERE id = ?');
    $stmt->execute([$u['id']]);
    $row = $stmt->fetch();
    if (!$row || !password_verify($current, $row['password_hash'])) {
        usleep(500000);
        json_error('Nuværende adgangskode er forkert.', 401);
    }

    $hash = password_hash($next, PASSWORD_BCRYPT);
    $stmt = db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?');
    $stmt->execute([$hash, $u['id']]);
    log_activity($u, 'password_change');

    json_response(['ok' => true]);
}
