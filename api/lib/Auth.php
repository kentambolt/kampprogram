<?php
// Session-baseret autentificering med multi-klub medlemskab.
//
// En bruger er global (én pr. e-mail) og kan være medlem af flere klubber
// via club_members. Sessionen husker den "aktive" klub; alle klub-scopede
// endpoints arbejder på den. $_SESSION['club_id'] styres af switch-club.

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

// Returnerer den loggede bruger inkl. medlemskaber og aktiv klub, eller null.
// Struktur:
//   id, email, name, is_admin,
//   clubs: [ [club_id, role, club_name, club_slug], ... ],
//   club_id / role / club_name / club_slug: den AKTIVE klub (null hvis ingen)
function auth_current_user(): ?array {
    auth_start_session();
    if (empty($_SESSION['user_id'])) return null;

    $stmt = db()->prepare('SELECT id, email, name, is_admin FROM users WHERE id = ?');
    $stmt->execute([$_SESSION['user_id']]);
    $user = $stmt->fetch();
    if (!$user) return null;

    $stmt = db()->prepare(
        'SELECT cm.club_id, cm.role, c.name AS club_name, c.slug AS club_slug,
                c.default_court_count
         FROM club_members cm
         JOIN clubs c ON c.id = cm.club_id
         WHERE cm.user_id = ?
         ORDER BY c.name ASC'
    );
    $stmt->execute([$user['id']]);
    $clubs = $stmt->fetchAll();
    $user['clubs'] = $clubs;

    // Aktiv klub: sessionens valg hvis stadig gyldigt, ellers første medlemskab.
    $active = null;
    $wanted = $_SESSION['club_id'] ?? null;
    foreach ($clubs as $c) {
        if ($wanted !== null && (int)$c['club_id'] === (int)$wanted) { $active = $c; break; }
    }
    if ($active === null && count($clubs) > 0) $active = $clubs[0];

    $user['club_id']   = $active ? (int)$active['club_id'] : null;
    $user['role']      = $active ? $active['role'] : null;
    $user['club_name'] = $active ? $active['club_name'] : null;
    $user['club_slug'] = $active ? $active['club_slug'] : null;
    $user['club_default_courts'] = ($active && $active['default_court_count'] !== null)
        ? (int)$active['default_court_count'] : null;

    return $user;
}

// Returnerer brugeren eller afslutter med 401.
function require_auth(): array {
    $u = auth_current_user();
    if (!$u) json_error('Du er ikke logget ind.', 401);
    return $u;
}

// Kræver at brugeren har en aktiv klub (medlem af mindst én).
function require_club(array $user): void {
    if (empty($user['club_id'])) {
        json_error('Du er ikke medlem af nogen klub.', 403);
    }
}

function auth_login(int $userId): void {
    auth_start_session();
    // Regenerér session-id ved login som beskyttelse mod session-fixation.
    session_regenerate_id(true);
    $_SESSION['user_id'] = $userId;
    $_SESSION['logged_at'] = time();
    unset($_SESSION['club_id']);   // aktiv klub vælges frisk
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
function public_user(array $u): array {
    return [
        'id'      => (int)$u['id'],
        'email'   => $u['email'],
        'name'    => $u['name'],
        'isAdmin' => !empty($u['is_admin']),
        'club'    => $u['club_id'] ? [
            'id'   => (int)$u['club_id'],
            'name' => $u['club_name'],
            'slug' => $u['club_slug'],
            'role' => $u['role'],
            'defaultCourtCount' => $u['club_default_courts'] ?? null,
        ] : null,
        'clubs'   => array_map(fn($c) => [
            'id'   => (int)$c['club_id'],
            'name' => $c['club_name'],
            'slug' => $c['club_slug'],
            'role' => $c['role'],
            'defaultCourtCount' => $c['default_court_count'] !== null ? (int)$c['default_court_count'] : null,
        ], $u['clubs'] ?? []),
    ];
}
