<?php
// /api/clubs/:id/players  — klubbens fælles spillerbase
// /api/clubs/:id/squads   — hold (delmængder af spillerbasen)
//
// Adgang (genbruger club_access fra clubs.php):
//   Læse hold + spillerbase:            alle klubmedlemmer (+ admin)
//   Oprette/gemme/slette hold,
//   tilføje/fjerne holdmedlemmer:       editor+ (+ admin)

function squad_clamp_level($raw): int {
    $n = (int)$raw;
    if ($n < 1) return 1;
    if ($n > 5) return 5;
    return $n;
}

// Upsert en spiller i klubbens spillerbase; returnerer id.
function upsert_club_player(int $clubId, string $name, int $level): int {
    db()->prepare(
        'INSERT INTO club_players (club_id, name, level) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE level = VALUES(level)'
    )->execute([$clubId, $name, $level]);

    $stmt = db()->prepare('SELECT id FROM club_players WHERE club_id = ? AND name = ?');
    $stmt->execute([$clubId, $name]);
    return (int)$stmt->fetch()['id'];
}

// Validér og normalisér et players-array fra frontenden.
function squad_normalise_players($input): array {
    if (!is_array($input)) json_error('"players" skal være en liste.', 422);
    $out = [];
    foreach ($input as $p) {
        if (!is_array($p)) continue;
        $name = trim((string)($p['name'] ?? ''));
        if ($name === '' || strlen($name) > 120) continue;
        $out[] = ['name' => $name, 'level' => squad_clamp_level($p['level'] ?? 3)];
    }
    return $out;
}

// GET /api/clubs/:id/players — hele klubbens spillerbase.
function handle_club_players_list(int $clubId): void {
    club_access($clubId);
    $stmt = db()->prepare(
        'SELECT id, name, level FROM club_players WHERE club_id = ? ORDER BY name ASC'
    );
    $stmt->execute([$clubId]);
    json_response(['players' => array_map(fn($r) => [
        'id'    => (int)$r['id'],
        'name'  => $r['name'],
        'level' => (int)$r['level'],
    ], $stmt->fetchAll())]);
}

// GET /api/clubs/:id/squads — alle hold med medlemsantal.
function handle_squads_list(int $clubId): void {
    club_access($clubId);
    $stmt = db()->prepare(
        'SELECT s.id, s.name, s.updated_at,
                (SELECT COUNT(*) FROM squad_members sm WHERE sm.squad_id = s.id) AS member_count
         FROM squads s
         WHERE s.club_id = ?
         ORDER BY s.name ASC'
    );
    $stmt->execute([$clubId]);
    json_response(['squads' => array_map(fn($r) => [
        'id'          => (int)$r['id'],
        'name'        => $r['name'],
        'memberCount' => (int)$r['member_count'],
        'updatedAt'   => $r['updated_at'],
    ], $stmt->fetchAll())]);
}

// GET /api/clubs/:id/squads/:sid — ét hold med medlemmer.
function handle_squad_get(int $clubId, int $sid): void {
    club_access($clubId);
    $stmt = db()->prepare('SELECT id, name FROM squads WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $squad = $stmt->fetch();
    if (!$squad) json_error('Holdet findes ikke.', 404);

    $stmt = db()->prepare(
        'SELECT cp.id, cp.name, cp.level
         FROM squad_members sm
         JOIN club_players cp ON cp.id = sm.club_player_id
         WHERE sm.squad_id = ?
         ORDER BY cp.name ASC'
    );
    $stmt->execute([$sid]);
    json_response(['squad' => [
        'id'      => (int)$squad['id'],
        'name'    => $squad['name'],
        'members' => array_map(fn($r) => [
            'id'    => (int)$r['id'],
            'name'  => $r['name'],
            'level' => (int)$r['level'],
        ], $stmt->fetchAll()),
    ]]);
}

// POST /api/clubs/:id/squads {name, players?} — opret hold (editor+).
// Spillere upsertes i klubbens spillerbase og kobles til holdet.
function handle_squad_create(int $clubId): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $body = read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || strlen($name) > 120) json_error('Holdnavn skal være mellem 1 og 120 tegn.', 422);
    $players = squad_normalise_players($body['players'] ?? []);

    try {
        db()->prepare('INSERT INTO squads (club_id, name, created_by_user_id) VALUES (?, ?, ?)')
            ->execute([$clubId, $name, $u['id']]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) json_error('Et hold med dette navn findes allerede.', 409);
        throw $e;
    }
    $sid = (int)db()->lastInsertId();

    foreach ($players as $p) {
        $pid = upsert_club_player($clubId, $p['name'], $p['level']);
        db()->prepare('INSERT IGNORE INTO squad_members (squad_id, club_player_id) VALUES (?, ?)')
            ->execute([$sid, $pid]);
    }
    log_activity($u, 'squad_create', $name);

    json_response(['ok' => true, 'id' => $sid], 201);
}

// PUT /api/clubs/:id/squads/:sid {name?, players?} — overskriv hold (editor+).
// players (hvis angivet) erstatter holdets medlemsliste 1:1.
function handle_squad_update(int $clubId, int $sid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $stmt = db()->prepare('SELECT id, name FROM squads WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $squad = $stmt->fetch();
    if (!$squad) json_error('Holdet findes ikke.', 404);

    $body = read_json_body();

    if (array_key_exists('name', $body)) {
        $name = trim((string)$body['name']);
        if ($name === '' || strlen($name) > 120) json_error('Ugyldigt holdnavn.', 422);
        try {
            db()->prepare('UPDATE squads SET name = ? WHERE id = ?')->execute([$name, $sid]);
        } catch (PDOException $e) {
            if ((int)$e->errorInfo[1] === 1062) json_error('Et hold med dette navn findes allerede.', 409);
            throw $e;
        }
    }

    if (array_key_exists('players', $body)) {
        $players = squad_normalise_players($body['players']);
        db()->prepare('DELETE FROM squad_members WHERE squad_id = ?')->execute([$sid]);
        foreach ($players as $p) {
            $pid = upsert_club_player($clubId, $p['name'], $p['level']);
            db()->prepare('INSERT IGNORE INTO squad_members (squad_id, club_player_id) VALUES (?, ?)')
                ->execute([$sid, $pid]);
        }
    }
    log_activity($u, 'squad_update', $squad['name']);

    json_response(['ok' => true]);
}

// DELETE /api/clubs/:id/squads/:sid — slet hold (editor+).
// Spillerne bliver i klubbens spillerbase — kun holdet forsvinder.
function handle_squad_delete(int $clubId, int $sid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $stmt = db()->prepare('SELECT name FROM squads WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $squad = $stmt->fetch();
    if (!$squad) json_error('Holdet findes ikke.', 404);

    db()->prepare('DELETE FROM squads WHERE id = ?')->execute([$sid]);
    log_activity($u, 'squad_delete', $squad['name']);

    json_response(['ok' => true]);
}

// POST /api/clubs/:id/squads/:sid/members {playerId} ELLER {name, level}
// Tilføj et medlem til holdet (editor+). Med name/level oprettes spilleren
// i klubbens spillerbase, hvis den ikke findes.
function handle_squad_member_add(int $clubId, int $sid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $stmt = db()->prepare('SELECT name FROM squads WHERE id = ? AND club_id = ?');
    $stmt->execute([$sid, $clubId]);
    $squad = $stmt->fetch();
    if (!$squad) json_error('Holdet findes ikke.', 404);

    $body = read_json_body();

    if (!empty($body['playerId'])) {
        $pid = (int)$body['playerId'];
        $stmt = db()->prepare('SELECT id FROM club_players WHERE id = ? AND club_id = ?');
        $stmt->execute([$pid, $clubId]);
        if (!$stmt->fetch()) json_error('Spilleren findes ikke i klubben.', 404);
    } else {
        $name = trim((string)($body['name'] ?? ''));
        if ($name === '' || strlen($name) > 120) json_error('Ugyldigt spillernavn.', 422);
        $pid = upsert_club_player($clubId, $name, squad_clamp_level($body['level'] ?? 3));
    }

    db()->prepare('INSERT IGNORE INTO squad_members (squad_id, club_player_id) VALUES (?, ?)')
        ->execute([$sid, $pid]);
    log_activity($u, 'squad_member_add', $squad['name']);

    json_response(['ok' => true]);
}

// DELETE /api/clubs/:id/squads/:sid/members/:pid — fjern fra hold (editor+).
function handle_squad_member_remove(int $clubId, int $sid, int $pid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $stmt = db()->prepare(
        'SELECT s.name FROM squads s WHERE s.id = ? AND s.club_id = ?'
    );
    $stmt->execute([$sid, $clubId]);
    $squad = $stmt->fetch();
    if (!$squad) json_error('Holdet findes ikke.', 404);

    $del = db()->prepare('DELETE FROM squad_members WHERE squad_id = ? AND club_player_id = ?');
    $del->execute([$sid, $pid]);
    if ($del->rowCount() === 0) json_error('Spilleren er ikke på holdet.', 404);
    log_activity($u, 'squad_member_remove', $squad['name']);

    json_response(['ok' => true]);
}
