<?php
// /api/users — opret/redigér/slet brugere i klubben.
// Kun owners må bruge disse endpoints.

function user_row_to_public(array $row): array {
    return [
        'id'        => (int)$row['id'],
        'email'     => $row['email'],
        'name'      => $row['name'],
        'role'      => $row['role'],
        'createdAt' => $row['created_at'],
    ];
}

function handle_users_list(): void {
    $u = require_auth();
    require_role($u, 'owner');

    $stmt = db()->prepare(
        'SELECT id, email, name, role, created_at
         FROM users WHERE club_id = ?
         ORDER BY name ASC'
    );
    $stmt->execute([$u['club_id']]);
    json_response(['users' => array_map('user_row_to_public', $stmt->fetchAll())]);
}

function handle_users_create(): void {
    $u = require_auth();
    require_role($u, 'owner');

    $body = read_json_body();
    $email    = trim((string)($body['email']    ?? ''));
    $name     = trim((string)($body['name']     ?? ''));
    $password = (string)        ($body['password'] ?? '');
    $role     = (string)        ($body['role']     ?? 'editor');

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Ugyldig e-mail.', 422);
    }
    if ($name === '' || strlen($name) > 120) {
        json_error('Navn skal være mellem 1 og 120 tegn.', 422);
    }
    if (strlen($password) < 6) {
        json_error('Adgangskode skal være mindst 6 tegn.', 422);
    }
    if (!in_array($role, ['owner','editor','viewer'], true)) {
        json_error('Ugyldig rolle.', 422);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    try {
        $stmt = db()->prepare(
            'INSERT INTO users (club_id, email, name, password_hash, role)
             VALUES (?, ?, ?, ?, ?)'
        );
        $stmt->execute([$u['club_id'], $email, $name, $hash, $role]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('Der findes allerede en bruger med denne e-mail.', 409);
        }
        throw $e;
    }

    $id = (int)db()->lastInsertId();
    log_activity($u, 'user_create', "$name <$email>");
    $stmt = db()->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    json_response(['user' => user_row_to_public($stmt->fetch())], 201);
}

function handle_users_update(int $id): void {
    $u = require_auth();
    require_role($u, 'owner');

    $body = read_json_body();
    $stmt = db()->prepare('SELECT id, club_id, email, name, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    $target = $stmt->fetch();
    if (!$target || (int)$target['club_id'] !== (int)$u['club_id']) {
        json_error('Brugeren findes ikke.', 404);
    }

    $updates = [];
    $params  = [];

    if (array_key_exists('name', $body)) {
        $name = trim((string)$body['name']);
        if ($name === '' || strlen($name) > 120) {
            json_error('Navn skal være mellem 1 og 120 tegn.', 422);
        }
        $updates[] = 'name = ?';
        $params[]  = $name;
    }
    if (array_key_exists('email', $body)) {
        $email = trim((string)$body['email']);
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            json_error('Ugyldig e-mail.', 422);
        }
        $updates[] = 'email = ?';
        $params[]  = $email;
    }
    if (array_key_exists('role', $body)) {
        $role = (string)$body['role'];
        if (!in_array($role, ['owner','editor','viewer'], true)) {
            json_error('Ugyldig rolle.', 422);
        }
        // Beskyt mod at fjerne den sidste owner.
        if ($target['role'] === 'owner' && $role !== 'owner') {
            $stmt = db()->prepare('SELECT COUNT(*) AS c FROM users WHERE club_id = ? AND role = "owner"');
            $stmt->execute([$u['club_id']]);
            if ((int)$stmt->fetch()['c'] <= 1) {
                json_error('Du kan ikke fjerne den sidste owner i klubben.', 409);
            }
        }
        $updates[] = 'role = ?';
        $params[]  = $role;
    }
    if (array_key_exists('password', $body)) {
        $password = (string)$body['password'];
        if (strlen($password) < 6) {
            json_error('Adgangskode skal være mindst 6 tegn.', 422);
        }
        $updates[] = 'password_hash = ?';
        $params[]  = password_hash($password, PASSWORD_BCRYPT);
    }

    if (empty($updates)) {
        json_error('Ingen ændringer angivet.', 422);
    }

    $params[] = $id;
    $sql = 'UPDATE users SET ' . implode(', ', $updates) . ' WHERE id = ?';
    try {
        db()->prepare($sql)->execute($params);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('Der findes allerede en bruger med denne e-mail.', 409);
        }
        throw $e;
    }

    log_activity($u, 'user_update', $target['name']);
    $stmt = db()->prepare('SELECT id, email, name, role, created_at FROM users WHERE id = ?');
    $stmt->execute([$id]);
    json_response(['user' => user_row_to_public($stmt->fetch())]);
}

function handle_users_delete(int $id): void {
    $u = require_auth();
    require_role($u, 'owner');

    if ((int)$id === (int)$u['id']) {
        json_error('Du kan ikke slette dig selv.', 409);
    }

    $stmt = db()->prepare('SELECT role FROM users WHERE id = ? AND club_id = ?');
    $stmt->execute([$id, $u['club_id']]);
    $target = $stmt->fetch();
    if (!$target) json_error('Brugeren findes ikke.', 404);

    if ($target['role'] === 'owner') {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM users WHERE club_id = ? AND role = "owner"');
        $stmt->execute([$u['club_id']]);
        if ((int)$stmt->fetch()['c'] <= 1) {
            json_error('Du kan ikke slette den sidste owner.', 409);
        }
    }

    $stmt = db()->prepare('DELETE FROM users WHERE id = ? AND club_id = ?');
    $stmt->execute([$id, $u['club_id']]);
    log_activity($u, 'user_delete');
    json_response(['ok' => true]);
}
