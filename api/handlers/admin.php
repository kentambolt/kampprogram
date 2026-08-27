<?php
// /api/admin/* — site-admin: overblik og administration på tværs af klubber.
// Alle endpoints kræver is_admin = 1.

// GET /api/admin/overview — klubber med antal brugere/lister + seneste aktivitet.
function handle_admin_overview(): void {
    require_admin();

    $clubs = db()->query(
        'SELECT c.id, c.name, c.slug, c.created_at,
                (SELECT COUNT(*) FROM users u WHERE u.club_id = c.id)        AS user_count,
                (SELECT COUNT(*) FROM player_lists p WHERE p.club_id = c.id) AS list_count,
                (SELECT MAX(u.last_login_at) FROM users u WHERE u.club_id = c.id) AS last_activity
         FROM clubs c
         ORDER BY c.name ASC'
    )->fetchAll();

    $stats = db()->query(
        'SELECT
            (SELECT COUNT(*) FROM users)        AS total_users,
            (SELECT COUNT(*) FROM clubs)        AS total_clubs,
            (SELECT COUNT(*) FROM player_lists) AS total_lists,
            (SELECT COUNT(*) FROM activity_log WHERE created_at > NOW() - INTERVAL 7 DAY)  AS actions_7d,
            (SELECT COUNT(*) FROM activity_log WHERE created_at > NOW() - INTERVAL 30 DAY) AS actions_30d,
            (SELECT COUNT(DISTINCT user_id) FROM activity_log
             WHERE created_at > NOW() - INTERVAL 30 DAY AND user_id IS NOT NULL)           AS active_users_30d'
    )->fetch();

    json_response([
        'clubs' => array_map(fn($c) => [
            'id'           => (int)$c['id'],
            'name'         => $c['name'],
            'slug'         => $c['slug'],
            'userCount'    => (int)$c['user_count'],
            'listCount'    => (int)$c['list_count'],
            'lastActivity' => $c['last_activity'],
            'createdAt'    => $c['created_at'],
        ], $clubs),
        'stats' => [
            'totalUsers'     => (int)$stats['total_users'],
            'totalClubs'     => (int)$stats['total_clubs'],
            'totalLists'     => (int)$stats['total_lists'],
            'actions7d'      => (int)$stats['actions_7d'],
            'actions30d'     => (int)$stats['actions_30d'],
            'activeUsers30d' => (int)$stats['active_users_30d'],
        ],
    ]);
}

// GET /api/admin/users — alle brugere på tværs af klubber, med usage-info.
function handle_admin_users_list(): void {
    require_admin();

    $rows = db()->query(
        'SELECT u.id, u.club_id, u.email, u.name, u.role, u.is_admin,
                u.last_login_at, u.login_count, u.created_at,
                c.name AS club_name
         FROM users u
         JOIN clubs c ON c.id = u.club_id
         ORDER BY c.name ASC, u.name ASC'
    )->fetchAll();

    json_response(['users' => array_map(fn($r) => [
        'id'          => (int)$r['id'],
        'clubId'      => (int)$r['club_id'],
        'clubName'    => $r['club_name'],
        'email'       => $r['email'],
        'name'        => $r['name'],
        'role'        => $r['role'],
        'isAdmin'     => !empty($r['is_admin']),
        'lastLoginAt' => $r['last_login_at'],
        'loginCount'  => (int)$r['login_count'],
        'createdAt'   => $r['created_at'],
    ], $rows)]);
}

// GET /api/admin/activity?limit=100 — seneste hændelser.
function handle_admin_activity(): void {
    require_admin();

    $limit = isset($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 100;
    $stmt = db()->prepare(
        'SELECT a.id, a.action, a.detail, a.created_at,
                u.name AS user_name, u.email AS user_email,
                c.name AS club_name
         FROM activity_log a
         LEFT JOIN users u ON u.id = a.user_id
         LEFT JOIN clubs c ON c.id = a.club_id
         ORDER BY a.id DESC
         LIMIT ' . $limit
    );
    $stmt->execute();

    json_response(['activity' => array_map(fn($r) => [
        'id'        => (int)$r['id'],
        'action'    => $r['action'],
        'detail'    => $r['detail'],
        'userName'  => $r['user_name'],
        'userEmail' => $r['user_email'],
        'clubName'  => $r['club_name'],
        'createdAt' => $r['created_at'],
    ], $stmt->fetchAll())]);
}

// POST /api/admin/clubs — opret ny klub.
function handle_admin_create_club(): void {
    $admin = require_admin();

    $body = read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || strlen($name) > 120) {
        json_error('Klubnavn skal være mellem 1 og 120 tegn.', 422);
    }

    // Slug: små bogstaver, danske tegn translittereret, alt andet → bindestreg.
    $slug = strtolower($name);
    $slug = strtr($slug, ['æ' => 'ae', 'ø' => 'oe', 'å' => 'aa']);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim($slug, '-');
    if ($slug === '') $slug = 'klub';

    // Sørg for at slug er unik (tilføj tal ved kollision).
    $base = $slug; $i = 2;
    while (true) {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM clubs WHERE slug = ?');
        $stmt->execute([$slug]);
        if ((int)$stmt->fetch()['c'] === 0) break;
        $slug = $base . '-' . $i++;
    }

    $stmt = db()->prepare('INSERT INTO clubs (name, slug) VALUES (?, ?)');
    $stmt->execute([$name, $slug]);
    $id = (int)db()->lastInsertId();
    log_activity($admin, 'club_create', $name);

    json_response(['club' => ['id' => $id, 'name' => $name, 'slug' => $slug]], 201);
}

// DELETE /api/admin/clubs/:id — slet klub (kaskade sletter brugere + lister).
function handle_admin_delete_club(int $id): void {
    $admin = require_admin();

    if ((int)$admin['club_id'] === $id) {
        json_error('Du kan ikke slette den klub, du selv er medlem af.', 409);
    }

    $stmt = db()->prepare('SELECT name FROM clubs WHERE id = ?');
    $stmt->execute([$id]);
    $club = $stmt->fetch();
    if (!$club) json_error('Klubben findes ikke.', 404);

    $stmt = db()->prepare('DELETE FROM clubs WHERE id = ?');
    $stmt->execute([$id]);
    log_activity($admin, 'club_delete', $club['name']);

    json_response(['ok' => true]);
}

// POST /api/admin/users — opret bruger i en vilkårlig klub.
function handle_admin_create_user(): void {
    $admin = require_admin();

    $body = read_json_body();
    $clubId   = (int)($body['clubId'] ?? 0);
    $email    = trim((string)($body['email'] ?? ''));
    $name     = trim((string)($body['name']  ?? ''));
    $password = (string)($body['password']   ?? '');
    $role     = (string)($body['role']       ?? 'editor');
    $isAdmin  = !empty($body['isAdmin']) ? 1 : 0;

    $stmt = db()->prepare('SELECT id FROM clubs WHERE id = ?');
    $stmt->execute([$clubId]);
    if (!$stmt->fetch()) json_error('Klubben findes ikke.', 422);

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Ugyldig e-mail.', 422);
    if ($name === '' || strlen($name) > 120) json_error('Navn skal være mellem 1 og 120 tegn.', 422);
    if (strlen($password) < 6) json_error('Adgangskode skal være mindst 6 tegn.', 422);
    if (!in_array($role, ['owner','editor','viewer'], true)) json_error('Ugyldig rolle.', 422);

    $hash = password_hash($password, PASSWORD_BCRYPT);
    try {
        $stmt = db()->prepare(
            'INSERT INTO users (club_id, email, name, password_hash, role, is_admin)
             VALUES (?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute([$clubId, $email, $name, $hash, $role, $isAdmin]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('Der findes allerede en bruger med denne e-mail i klubben.', 409);
        }
        throw $e;
    }
    log_activity($admin, 'user_create', "$name <$email>");

    json_response(['ok' => true, 'id' => (int)db()->lastInsertId()], 201);
}

// PATCH /api/admin/users/:id — redigér bruger på tværs af klubber.
function handle_admin_update_user(int $id): void {
    $admin = require_admin();

    $body = read_json_body();
    $stmt = db()->prepare('SELECT * FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Brugeren findes ikke.', 404);

    $updates = [];
    $params  = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string)$body['name']);
        if ($name === '' || strlen($name) > 120) json_error('Ugyldigt navn.', 422);
        $updates[] = 'name = ?'; $params[] = $name;
    }
    if (array_key_exists('email', $body)) {
        $email = trim((string)$body['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Ugyldig e-mail.', 422);
        $updates[] = 'email = ?'; $params[] = $email;
    }
    if (array_key_exists('role', $body)) {
        $role = (string)$body['role'];
        if (!in_array($role, ['owner','editor','viewer'], true)) json_error('Ugyldig rolle.', 422);
        $updates[] = 'role = ?'; $params[] = $role;
    }
    if (array_key_exists('password', $body)) {
        $password = (string)$body['password'];
        if (strlen($password) < 6) json_error('Adgangskode skal være mindst 6 tegn.', 422);
        $updates[] = 'password_hash = ?'; $params[] = password_hash($password, PASSWORD_BCRYPT);
    }
    if (array_key_exists('isAdmin', $body)) {
        $flag = !empty($body['isAdmin']) ? 1 : 0;
        // Man kan ikke fjerne admin-flaget fra sig selv (lockout-beskyttelse).
        if ((int)$admin['id'] === $id && $flag === 0) {
            json_error('Du kan ikke fjerne admin-rettigheder fra dig selv.', 409);
        }
        $updates[] = 'is_admin = ?'; $params[] = $flag;
    }

    if (empty($updates)) json_error('Ingen ændringer angivet.', 422);

    $params[] = $id;
    try {
        db()->prepare('UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?')->execute($params);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('E-mailen er allerede i brug i klubben.', 409);
        }
        throw $e;
    }
    log_activity($admin, 'user_update', $target['name']);

    json_response(['ok' => true]);
}

// DELETE /api/admin/users/:id
function handle_admin_delete_user(int $id): void {
    $admin = require_admin();

    if ((int)$admin['id'] === $id) json_error('Du kan ikke slette dig selv.', 409);

    $stmt = db()->prepare('SELECT name, email FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Brugeren findes ikke.', 404);

    db()->prepare('DELETE FROM users WHERE id = ?')->execute([$id]);
    log_activity($admin, 'user_delete', "{$target['name']} <{$target['email']}>");

    json_response(['ok' => true]);
}
