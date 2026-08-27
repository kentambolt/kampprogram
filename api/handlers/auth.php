<?php
// /api/auth/login, /api/auth/logout, /api/auth/switch-club,
// /api/auth/change-password, /api/me

function handle_auth_login(): void {
    $body = read_json_body();
    $email = trim((string)($body['email'] ?? ''));
    $password = (string)($body['password'] ?? '');

    if ($email === '' || $password === '') {
        json_error('Email og adgangskode skal udfyldes.', 422);
    }

    $stmt = db()->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
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
    db()->prepare('UPDATE users SET last_login_at = NOW(), login_count = login_count + 1 WHERE id = ?')
        ->execute([$row['id']]);

    $u = auth_current_user();
    log_activity($u, 'login');
    json_response(['user' => public_user($u)]);
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

// POST /api/auth/switch-club {clubId} — skift aktiv klub i sessionen.
function handle_auth_switch_club(): void {
    $u = require_auth();
    $body = read_json_body();
    $clubId = (int)($body['clubId'] ?? 0);

    $isMember = false;
    foreach ($u['clubs'] as $c) {
        if ((int)$c['club_id'] === $clubId) { $isMember = true; break; }
    }
    if (!$isMember) json_error('Du er ikke medlem af den klub.', 403);

    $_SESSION['club_id'] = $clubId;
    $u = auth_current_user();
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
    db()->prepare('UPDATE users SET password_hash = ? WHERE id = ?')->execute([$hash, $u['id']]);
    log_activity($u, 'password_change');

    json_response(['ok' => true]);
}
