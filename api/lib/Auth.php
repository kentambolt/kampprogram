<?php
// Session-baseret autentificering.

function auth_start_session(): void {
    if (session_status() === PHP_SESSION_ACTIVE) return;

    $cfg = require __DIR__ . '/../config.php';
    $s = $cfg['session'];

    session_name($s['name']);
    session_set_cookie_params([
        'lifetime' => $s['lifetime'],
        'path'     => '/',
        'secure'   => $s['secure'],
        'httponly' => $s['httponly'],
        'samesite' => $s['samesite'],
    ]);
    session_start();
}

// Returnerer den loggede brugers række (med klubnavn vedhæftet), eller null.
function auth_current_user(): ?array {
    auth_start_session();
    if (empty($_SESSION['user_id'])) return null;

    $stmt = db()->prepare(
        'SELECT u.id, u.club_id, u.email, u.name, u.role, u.is_admin,
                c.name AS club_name, c.slug AS club_slug
         FROM users u
         JOIN clubs c ON c.id = u.club_id
         WHERE u.id = ?'
    );
    $stmt->execute([$_SESSION['user_id']]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Returnerer brugeren eller afslutter med 401.
function require_auth(): array {
    $u = auth_current_user();
    if (!$u) json_error('Du er ikke logget ind.', 401);
    return $u;
}

function auth_login(int $userId): void {
    auth_start_session();
    // Regenerér session-id ved login som beskyttelse mod session-fixation.
    session_regenerate_id(true);
    $_SESSION['user_id']   = $userId;
    $_SESSION['logged_at'] = time();
}

function auth_logout(): void {
    auth_start_session();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

// Public-facing brugerobjekt (uden password_hash).
function public_user(array $row): array {
    return [
        'id'      => (int)$row['id'],
        'email'   => $row['email'],
        'name'    => $row['name'],
        'role'    => $row['role'],
        'isAdmin' => !empty($row['is_admin']),
        'club'    => [
            'id'   => (int)$row['club_id'],
            'name' => $row['club_name'] ?? null,
            'slug' => $row['club_slug'] ?? null,
        ],
    ];
}
