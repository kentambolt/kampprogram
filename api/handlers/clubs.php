<?php
// /api/clubs/:id — klubside: info, indstillinger, sletning og delte sessioner.
//
// Adgang: medlem af klubben ELLER site-admin.
// Ændringer (indstillinger, slet, session-skrivning): owner/editor iht. funktion.

// Returnerer [bruger, effektiv rolle i klubben]. Site-admin får 'owner'-niveau.
function club_access(int $clubId): array {
    $u = require_auth();
    if (!empty($u['is_admin'])) return [$u, 'owner'];
    foreach ($u['clubs'] as $c) {
        if ((int)$c['club_id'] === $clubId) return [$u, $c['role']];
    }
    json_error('Du har ikke adgang til denne klub.', 403);
}

function club_role_at_least(string $role, string $required): bool {
    return (ROLE_RANK[$role] ?? 0) >= (ROLE_RANK[$required] ?? 0);
}

// GET /api/clubs/:id
function handle_club_get(int $id): void {
    [$u, $role] = club_access($id);

    $stmt = db()->prepare(
        'SELECT c.id, c.name, c.slug, c.default_court_count, c.created_at,
                (SELECT COUNT(*) FROM club_members cm WHERE cm.club_id = c.id)   AS member_count,
                (SELECT COUNT(*) FROM player_lists p WHERE p.club_id = c.id)     AS list_count,
                (SELECT COUNT(*) FROM club_sessions s WHERE s.club_id = c.id)    AS session_count
         FROM clubs c WHERE c.id = ?'
    );
    $stmt->execute([$id]);
    $c = $stmt->fetch();
    if (!$c) json_error('Klubben findes ikke.', 404);

    json_response(['club' => [
        'id'                => (int)$c['id'],
        'name'              => $c['name'],
        'slug'              => $c['slug'],
        'defaultCourtCount' => $c['default_court_count'] !== null ? (int)$c['default_court_count'] : null,
        'memberCount'       => (int)$c['member_count'],
        'listCount'         => (int)$c['list_count'],
        'sessionCount'      => (int)$c['session_count'],
        'createdAt'         => $c['created_at'],
        'yourRole'          => $role,
        'canManage'         => club_role_at_least($role, 'owner'),
        'canEdit'           => club_role_at_least($role, 'editor'),
    ]]);
}

// PATCH /api/clubs/:id {defaultCourtCount} — owner/admin.
function handle_club_update(int $id): void {
    [$u, $role] = club_access($id);
    if (!club_role_at_least($role, 'owner')) {
        json_error('Kun klubbens owner kan ændre indstillinger.', 403);
    }

    $body = read_json_body();
    if (!array_key_exists('defaultCourtCount', $body)) {
        json_error('Ingen ændringer angivet.', 422);
    }

    $raw = $body['defaultCourtCount'];
    $value = null;
    if ($raw !== null && $raw !== '') {
        $value = (int)$raw;
        if ($value < 1 || $value > 50) json_error('Antal baner skal være mellem 1 og 50.', 422);
    }

    db()->prepare('UPDATE clubs SET default_court_count = ? WHERE id = ?')->execute([$value, $id]);
    log_activity($u, 'club_settings', $value === null ? 'baner: (ikke sat)' : "baner: $value");

    json_response(['ok' => true]);
}

// DELETE /api/clubs/:id — owner af klubben eller site-admin.
function handle_club_delete(int $id): void {
    [$u, $role] = club_access($id);
    if (!club_role_at_least($role, 'owner')) {
        json_error('Kun klubbens owner (eller site-admin) kan slette klubben.', 403);
    }

    $stmt = db()->prepare('SELECT name FROM clubs WHERE id = ?');
    $stmt->execute([$id]);
    $club = $stmt->fetch();
    if (!$club) json_error('Klubben findes ikke.', 404);

    db()->prepare('DELETE FROM clubs WHERE id = ?')->execute([$id]);
    log_activity($u, 'club_delete', $club['name']);

    json_response(['ok' => true]);
}

// ── Delte sessioner (overtag en igangværende spilleaften) ──

// GET /api/clubs/:id/sessions
function handle_club_sessions_list(int $clubId): void {
    club_access($clubId);

    $stmt = db()->prepare(
        'SELECT s.id, s.name, s.created_at, s.updated_at, u.name AS updated_by
         FROM club_sessions s
         LEFT JOIN users u ON u.id = s.updated_by_user_id
         WHERE s.club_id = ?
         ORDER BY s.updated_at DESC'
    );
    $stmt->execute([$clubId]);
    json_response(['sessions' => array_map(fn($r) => [
        'id'        => (int)$r['id'],
        'name'      => $r['name'],
        'updatedBy' => $r['updated_by'],
        'createdAt' => $r['created_at'],
        'updatedAt' => $r['updated_at'],
    ], $stmt->fetchAll())]);
}

// GET /api/clubs/:id/sessions/:sid — hent payload (til at overtage).
function handle_club_session_get(int $clubId, int $sid): void {
    club_access($clubId);

    $stmt = db()->prepare('SELECT id, name, payload FROM club_sessions WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Sessionen findes ikke.', 404);

    json_response(['session' => [
        'id'      => (int)$row['id'],
        'name'    => $row['name'],
        'payload' => json_decode($row['payload'], true),
    ]]);
}

// POST /api/clubs/:id/sessions {name, payload} — gem/del aktuel session.
function handle_club_session_create(int $clubId): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) {
        json_error('Kræver editor-rolle i klubben.', 403);
    }

    $body = read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    $payload = $body['payload'] ?? null;
    if ($name === '' || strlen($name) > 120) json_error('Navn skal være mellem 1 og 120 tegn.', 422);
    if (!is_array($payload)) json_error('Ugyldig session-payload.', 422);

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE);
    if (strlen($json) > 2 * 1024 * 1024) json_error('Sessionen er for stor.', 422);

    // Samme navn i samme klub → overskriv (praktisk til "gem igen efter runde 3").
    $stmt = db()->prepare('SELECT id FROM club_sessions WHERE club_id = ? AND name = ?');
    $stmt->execute([$clubId, $name]);
    $existing = $stmt->fetch();

    if ($existing) {
        db()->prepare('UPDATE club_sessions SET payload = ?, updated_by_user_id = ? WHERE id = ?')
            ->execute([$json, $u['id'], $existing['id']]);
        $sid = (int)$existing['id'];
    } else {
        db()->prepare(
            'INSERT INTO club_sessions (club_id, name, payload, updated_by_user_id) VALUES (?, ?, ?, ?)'
        )->execute([$clubId, $name, $json, $u['id']]);
        $sid = (int)db()->lastInsertId();
    }
    log_activity($u, 'session_save', $name);

    json_response(['ok' => true, 'id' => $sid], $existing ? 200 : 201);
}

// DELETE /api/clubs/:id/sessions/:sid
function handle_club_session_delete(int $clubId, int $sid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) {
        json_error('Kræver editor-rolle i klubben.', 403);
    }

    $stmt = db()->prepare('SELECT name FROM club_sessions WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $row = $stmt->fetch();
    if (!$row) json_error('Sessionen findes ikke.', 404);

    db()->prepare('DELETE FROM club_sessions WHERE id = ?')->execute([$sid]);
    log_activity($u, 'session_delete', $row['name']);

    json_response(['ok' => true]);
}
