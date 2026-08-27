<?php
// /api/users — medlemmer af den AKTIVE klub.
// Kun owners i klubben må ændre. Nye medlemmer kommer via invitationer
// (se invites.php) — direkte oprettelse er fjernet.

function member_row_to_public(array $row): array {
    return [
        'id'          => (int)$row['id'],
        'email'       => $row['email'],
        'name'        => $row['name'],
        'role'        => $row['role'],
        'lastLoginAt' => $row['last_login_at'] ?? null,
        'memberSince' => $row['member_since'] ?? null,
    ];
}

function handle_users_list(): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $stmt = db()->prepare(
        'SELECT us.id, us.email, us.name, us.last_login_at,
                cm.role, cm.created_at AS member_since
         FROM club_members cm
         JOIN users us ON us.id = cm.user_id
         WHERE cm.club_id = ?
         ORDER BY us.name ASC'
    );
    $stmt->execute([$u['club_id']]);
    json_response(['users' => array_map('member_row_to_public', $stmt->fetchAll())]);
}

// PATCH /api/users/:id — ændr medlemmets rolle i den aktive klub.
function handle_users_update(int $id): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $body = read_json_body();

    $stmt = db()->prepare(
        'SELECT cm.role, us.name FROM club_members cm
         JOIN users us ON us.id = cm.user_id
         WHERE cm.club_id = ? AND cm.user_id = ?'
    );
    $stmt->execute([$u['club_id'], $id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Medlemmet findes ikke i klubben.', 404);

    if (!array_key_exists('role', $body)) {
        json_error('Ingen ændringer angivet.', 422);
    }
    $role = (string)$body['role'];
    if (!in_array($role, ['owner','editor','viewer'], true)) {
        json_error('Ugyldig rolle.', 422);
    }

    // Beskyt mod at fjerne den sidste owner i klubben.
    if ($target['role'] === 'owner' && $role !== 'owner') {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ? AND role = "owner"');
        $stmt->execute([$u['club_id']]);
        if ((int)$stmt->fetch()['c'] <= 1) {
            json_error('Du kan ikke fjerne den sidste owner i klubben.', 409);
        }
    }

    db()->prepare('UPDATE club_members SET role = ? WHERE club_id = ? AND user_id = ?')
        ->execute([$role, $u['club_id'], $id]);
    log_activity($u, 'member_role_change', "{$target['name']} → $role");

    json_response(['ok' => true]);
}

// DELETE /api/users/:id — fjern medlemmet fra den aktive klub.
// Brugerens konto slettes IKKE (de kan være medlem af andre klubber).
function handle_users_delete(int $id): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $stmt = db()->prepare(
        'SELECT cm.role, us.name FROM club_members cm
         JOIN users us ON us.id = cm.user_id
         WHERE cm.club_id = ? AND cm.user_id = ?'
    );
    $stmt->execute([$u['club_id'], $id]);
    $target = $stmt->fetch();
    if (!$target) json_error('Medlemmet findes ikke i klubben.', 404);

    if ($target['role'] === 'owner') {
        $stmt = db()->prepare('SELECT COUNT(*) AS c FROM club_members WHERE club_id = ? AND role = "owner"');
        $stmt->execute([$u['club_id']]);
        if ((int)$stmt->fetch()['c'] <= 1) {
            json_error('Du kan ikke fjerne den sidste owner fra klubben.', 409);
        }
    }

    db()->prepare('DELETE FROM club_members WHERE club_id = ? AND user_id = ?')
        ->execute([$u['club_id'], $id]);
    log_activity($u, 'member_remove', $target['name']);

    json_response(['ok' => true]);
}
