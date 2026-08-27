<?php
// /api/admin/* — site-admin: overblik og administration på tværs af klubber.
// Alle endpoints kræver is_admin = 1.

// GET /api/admin/overview
function handle_admin_overview(): void {
    require_admin();

    $clubs = db()->query(
        'SELECT c.id, c.name, c.slug, c.created_at,
                (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id)   AS user_count,
                (SELECT COUNT(*) FROM player_lists p WHERE p.club_id = c.id)     AS list_count,
                (SELECT MAX(u.last_login_at) FROM club_members cm
                 JOIN users u ON u.id = cm.user_id
                 WHERE cm.club_id = c.id)                                         AS last_activity
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

// GET /api/admin/users — alle brugere med deres medlemskaber.
function handle_admin_users_list(): void {
    require_admin();

    $rows = db()->query(
        'SELECT u.id, u.email, u.name, u.is_admin,
                u.last_login_at, u.login_count, u.created_at
         FROM users u
         ORDER BY u.name ASC'
    )->fetchAll();

    // Medlemskaber i ét opslag, grupperet pr. bruger.
    $memberships = db()->query(
        'SELECT cm.user_id, cm.club_id, cm.role, c.name AS club_name
         FROM club_members cm
         JOIN clubs c ON c.id = cm.club_id
         ORDER BY c.name ASC'
    )->fetchAll();
    $byUser = [];
    foreach ($memberships as $m) {
        $byUser[(int)$m['user_id']][] = [
            'clubId'   => (int)$m['club_id'],
            'clubName' => $m['club_name'],
            'role'     => $m['role'],
        ];
    }

    json_response(['users' => array_map(fn($r) => [
        'id'          => (int)$r['id'],
        'email'       => $r['email'],
        'name'        => $r['name'],
        'isAdmin'     => !empty($r['is_admin']),
        'lastLoginAt' => $r['last_login_at'],
        'loginCount'  => (int)$r['login_count'],
        'createdAt'   => $r['created_at'],
        'memberships' => $byUser[(int)$r['id']] ?? [],
    ], $rows)]);
}

// GET /api/admin/activity?limit=100
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

// POST /api/admin/clubs {name}
function handle_admin_create_club(): void {
    $admin = require_admin();

    $body = read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || strlen($name) > 120) {
        json_error('Klubnavn skal være mellem 1 og 120 tegn.', 422);
    }

    $slug = strtolower($name);
    $slug = strtr($slug, ['æ' => 'ae', 'ø' => 'oe', 'å' => 'aa']);
    $slug = preg_replace('/[^a-z0-9]+/', '-', $slug);
    $slug = trim($slug, '-');
    if ($slug === '') $slug = 'klub';

    $base = $slug; $i = 2;
    while (true) {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM clubs WHERE slug = ?');
        $stmt->execute([$slug]);
        if ((int)$stmt->fetch()['c'] === 0) break;
        $slug = $base . '-' . $i++;
    }

    db()->prepare('INSERT INTO clubs (name, slug) VALUES (?, ?)')->execute([$name, $slug]);
    $id = (int)db()->lastInsertId();
    log_activity($admin, 'club_create', $name);

    json_response(['club' => ['id' => $id, 'name' => $name, 'slug' => $slug]], 201);
}

// DELETE /api/admin/clubs/:id
function handle_admin_delete_club(int $id): void {
    $admin = require_admin();

    $stmt = db()->prepare('SELECT name FROM clubs WHERE id = ?');
    $stmt->execute([$id]);
    $club = $stmt->fetch();
    if (!$club) json_error('Klubben findes ikke.', 404);

    db()->prepare('DELETE FROM clubs WHERE id = ?')->execute([$id]);
    log_activity($admin, 'club_delete', $club['name']);

    json_response(['ok' => true]);
}

// POST /api/admin/users {name, email, password, isAdmin?, clubId?, role?}
// Opretter global bruger; medlemskab er valgfrit (kan tilføjes bagefter).
function handle_admin_create_user(): void {
    $admin = require_admin();

    $body = read_json_body();
    $email    = trim((string)($body['email'] ?? ''));
    $name     = trim((string)($body['name']  ?? ''));
    $password = (string)($body['password']   ?? '');
    $isAdmin  = !empty($body['isAdmin']) ? 1 : 0;
    $clubId   = isset($body['clubId']) ? (int)$body['clubId'] : null;
    $role     = (string)($body['role'] ?? 'editor');

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Ugyldig e-mail.', 422);
    if ($name === '' || strlen($name) > 120) json_error('Navn skal være mellem 1 og 120 tegn.', 422);
    if (strlen($password) < 6) json_error('Adgangskode skal være mindst 6 tegn.', 422);
    if (!in_array($role, ['owner','editor','viewer'], true)) json_error('Ugyldig rolle.', 422);

    $hash = password_hash($password, PASSWORD_BCRYPT);
    try {
        db()->prepare('INSERT INTO users (email, name, password_hash, is_admin) VALUES (?, ?, ?, ?)')
            ->execute([$email, $name, $hash, $isAdmin]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('Der findes allerede en bruger med denne e-mail.', 409);
        }
        throw $e;
    }
    $userId = (int)db()->lastInsertId();

    if ($clubId) {
        $stmt = db()->prepare('SELECT id FROM clubs WHERE id = ?');
        $stmt->execute([$clubId]);
        if ($stmt->fetch()) {
            db()->prepare('INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)')
                ->execute([$clubId, $userId, $role]);
        }
    }
    log_activity($admin, 'user_create', "$name <$email>");

    json_response(['ok' => true, 'id' => $userId], 201);
}

// PATCH /api/admin/users/:id {name?, email?, password?, isAdmin?}
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
    if (array_key_exists('password', $body)) {
        $password = (string)$body['password'];
        if (strlen($password) < 6) json_error('Adgangskode skal være mindst 6 tegn.', 422);
        $updates[] = 'password_hash = ?'; $params[] = password_hash($password, PASSWORD_BCRYPT);
    }
    if (array_key_exists('isAdmin', $body)) {
        $flag = !empty($body['isAdmin']) ? 1 : 0;
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
        if ((int)$e->errorInfo[1] === 1062) json_error('E-mailen er allerede i brug.', 409);
        throw $e;
    }
    log_activity($admin, 'user_update', $target['name']);

    json_response(['ok' => true]);
}

// DELETE /api/admin/users/:id — sletter kontoen globalt (medlemskaber kaskade-slettes).
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

// POST /api/admin/memberships {userId, clubId, role} — tilføj/opdatér medlemskab.
function handle_admin_add_membership(): void {
    $admin = require_admin();

    $body = read_json_body();
    $userId = (int)($body['userId'] ?? 0);
    $clubId = (int)($body['clubId'] ?? 0);
    $role   = (string)($body['role'] ?? 'editor');

    if (!in_array($role, ['owner','editor','viewer'], true)) json_error('Ugyldig rolle.', 422);

    $stmt = db()->prepare('SELECT name FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) json_error('Brugeren findes ikke.', 404);

    $stmt = db()->prepare('SELECT name FROM clubs WHERE id = ?');
    $stmt->execute([$clubId]);
    $club = $stmt->fetch();
    if (!$club) json_error('Klubben findes ikke.', 404);

    db()->prepare(
        'INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role)'
    )->execute([$clubId, $userId, $role]);
    log_activity($admin, 'membership_add', "{$user['name']} → {$club['name']} ($role)");

    json_response(['ok' => true]);
}

// DELETE /api/admin/memberships?userId=&clubId= — fjern medlemskab.
function handle_admin_remove_membership(): void {
    $admin = require_admin();

    $userId = (int)($_GET['userId'] ?? 0);
    $clubId = (int)($_GET['clubId'] ?? 0);

    $stmt = db()->prepare(
        'SELECT us.name AS user_name, c.name AS club_name, cm.role
         FROM club_members cm
         JOIN users us ON us.id = cm.user_id
         JOIN clubs c ON c.id = cm.club_id
         WHERE cm.club_id = ? AND cm.user_id = ?'
    );
    $stmt->execute([$clubId, $userId]);
    $m = $stmt->fetch();
    if (!$m) json_error('Medlemskabet findes ikke.', 404);

    // Beskyt mod at fjerne klubbens sidste owner.
    if ($m['role'] === 'owner') {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ? AND role = "owner"');
        $stmt->execute([$clubId]);
        if ((int)$stmt->fetch()['c'] <= 1) {
            json_error('Du kan ikke fjerne klubbens sidste owner.', 409);
        }
    }

    db()->prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?')
        ->execute([$clubId, $userId]);
    log_activity($admin, 'membership_remove', "{$m['user_name']} ← {$m['club_name']}");

    json_response(['ok' => true]);
}
