<?php
// /api/player-lists endpoints.
//
// Datamodel: hver liste tilhører en klub, og selve spillerne gemmes som JSON
// ({name, level} per spiller). Det er den simpleste form, og passer 1:1 til
// hvordan frontend allerede har dem internt.

function pl_row_to_public(array $row): array {
    return [
        'id'        => (int)$row['id'],
        'name'      => $row['name'],
        'players'   => json_decode($row['players'], true) ?: [],
        'createdAt' => $row['created_at'],
        'updatedAt' => $row['updated_at'],
    ];
}

function pl_normalise_players($input): array {
    if (!is_array($input)) {
        json_error('"players" skal være en liste.', 422);
    }
    $out = [];
    foreach ($input as $p) {
        if (!is_array($p)) continue;
        $name = trim((string)($p['name'] ?? ''));
        if ($name === '') continue;
        $level = (int)($p['level'] ?? 3);
        if ($level > 5) $level = 5;
        if ($level < 1) $level = 1;
        $out[] = ['name' => $name, 'level' => $level];
    }
    return $out;
}

function handle_player_lists_list(): void {
    $u = require_auth();
    require_club($u);
    $stmt = db()->prepare(
        'SELECT id, name, players, created_at, updated_at
         FROM player_lists
         WHERE club_id = ?
         ORDER BY name ASC'
    );
    $stmt->execute([$u['club_id']]);
    $lists = array_map('pl_row_to_public', $stmt->fetchAll());
    json_response(['lists' => $lists]);
}

function handle_player_lists_create(): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'editor');

    $body = read_json_body();
    $name = trim((string)($body['name'] ?? ''));
    if ($name === '' || strlen($name) > 120) {
        json_error('Listenavn skal være mellem 1 og 120 tegn.', 422);
    }
    $players = pl_normalise_players($body['players'] ?? []);

    try {
        $stmt = db()->prepare(
            'INSERT INTO player_lists (club_id, name, players, created_by_user_id)
             VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $u['club_id'],
            $name,
            json_encode($players, JSON_UNESCAPED_UNICODE),
            $u['id'],
        ]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('En liste med dette navn findes allerede.', 409);
        }
        throw $e;
    }

    $id = (int)db()->lastInsertId();
    log_activity($u, 'list_create', $name);
    $stmt = db()->prepare('SELECT id, name, players, created_at, updated_at FROM player_lists WHERE id = ?');
    $stmt->execute([$id]);
    json_response(['list' => pl_row_to_public($stmt->fetch())], 201);
}

function handle_player_lists_update(int $id): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'editor');

    $body = read_json_body();
    $stmt = db()->prepare(
        'SELECT id, name, players, created_at, updated_at
         FROM player_lists WHERE id = ? AND club_id = ?'
    );
    $stmt->execute([$id, $u['club_id']]);
    $row = $stmt->fetch();
    if (!$row) json_error('Listen findes ikke.', 404);

    $name = isset($body['name']) ? trim((string)$body['name']) : $row['name'];
    if ($name === '' || strlen($name) > 120) {
        json_error('Listenavn skal være mellem 1 og 120 tegn.', 422);
    }
    $players = array_key_exists('players', $body)
        ? pl_normalise_players($body['players'])
        : (json_decode($row['players'], true) ?: []);

    try {
        $stmt = db()->prepare('UPDATE player_lists SET name = ?, players = ? WHERE id = ?');
        $stmt->execute([$name, json_encode($players, JSON_UNESCAPED_UNICODE), $id]);
    } catch (PDOException $e) {
        if ((int)$e->errorInfo[1] === 1062) {
            json_error('En anden liste med dette navn findes allerede.', 409);
        }
        throw $e;
    }

    log_activity($u, 'list_update', $name);
    $stmt = db()->prepare('SELECT id, name, players, created_at, updated_at FROM player_lists WHERE id = ?');
    $stmt->execute([$id]);
    json_response(['list' => pl_row_to_public($stmt->fetch())]);
}

function handle_player_lists_delete(int $id): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'editor');

    $stmt = db()->prepare('SELECT name FROM player_lists WHERE id = ? AND club_id = ?');
    $stmt->execute([$id, $u['club_id']]);
    $row = $stmt->fetch();
    if (!$row) json_error('Listen findes ikke.', 404);

    $stmt = db()->prepare('DELETE FROM player_lists WHERE id = ? AND club_id = ?');
    $stmt->execute([$id, $u['club_id']]);
    log_activity($u, 'list_delete', $row['name']);

    json_response(['ok' => true]);
}
