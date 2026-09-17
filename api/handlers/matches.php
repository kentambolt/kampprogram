<?php
// /api/clubs/:id/matches — fælles kampstatistik pr. klub.
//
// Kampene upsertes på (club_id, rid, court_index), så genafsendelse fra
// flere enheder aldrig giver dubletter. Resultater er valgfrie og bruges
// udelukkende til statistik.
//
// Adgang: læse = alle klubmedlemmer (+admin), skrive = editor+ (+admin).

// Normalisér en side ({id?, name} eller ren streng pr. deltager).
function match_normalise_side($raw): array {
    if (!is_array($raw)) return [];
    $out = [];
    foreach ($raw as $p) {
        if (is_string($p)) {
            $name = trim($p);
            $id = null;
        } elseif (is_array($p)) {
            $name = trim((string)($p['name'] ?? ''));
            $id = isset($p['id']) && is_numeric($p['id']) ? (int)$p['id'] : null;
        } else {
            continue;
        }
        if ($name === '' || strlen($name) > 120) continue;
        $entry = ['name' => $name];
        if ($id) $entry['id'] = $id;
        $out[] = $entry;
    }
    return array_slice($out, 0, 12);
}

// GET /api/clubs/:id/matches?days=N — klubbens kampe (N=0/udeladt: alle).
function handle_club_matches_list(int $clubId): void {
    club_access($clubId);
    $days = isset($_GET['days']) ? max(0, (int)$_GET['days']) : 0;

    $sql = 'SELECT rid, court_index, played_at_ms, side_a, side_b, result
            FROM club_matches WHERE club_id = ?';
    $params = [$clubId];
    if ($days > 0) {
        $sql .= ' AND played_at_ms >= ?';
        $params[] = (int)(microtime(true) * 1000) - $days * 86400000;
    }
    $sql .= ' ORDER BY played_at_ms ASC LIMIT 5000';

    $stmt = db()->prepare($sql);
    $stmt->execute($params);
    json_response(['matches' => array_map(fn($r) => [
        'rid' => $r['rid'],
        'ci'  => (int)$r['court_index'],
        'ts'  => (int)$r['played_at_ms'],
        'a'   => json_decode($r['side_a'], true) ?: [],
        'b'   => json_decode($r['side_b'], true) ?: [],
        'res' => $r['result'] ?: null,
    ], $stmt->fetchAll())]);
}

// POST /api/clubs/:id/matches {matches: [{rid, ci, ts, a, b, res}]} (editor+).
function handle_club_matches_upsert(int $clubId): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $body = read_json_body();
    $list = $body['matches'] ?? null;
    if (!is_array($list)) json_error('"matches" skal være en liste.', 422);
    if (count($list) > 500) json_error('Højst 500 kampe pr. kald.', 422);

    $stmt = db()->prepare(
        'INSERT INTO club_matches (club_id, rid, court_index, played_at_ms, side_a, side_b, result)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
             played_at_ms = VALUES(played_at_ms),
             side_a = VALUES(side_a),
             side_b = VALUES(side_b),
             result = VALUES(result)'
    );

    $saved = 0;
    foreach ($list as $m) {
        if (!is_array($m)) continue;
        $rid = trim((string)($m['rid'] ?? ''));
        if ($rid === '' || strlen($rid) > 40) continue;
        $ci = isset($m['ci']) && is_numeric($m['ci']) ? (int)$m['ci'] : -1;
        if ($ci < 0 || $ci > 99) continue;
        $ts = isset($m['ts']) && is_numeric($m['ts']) ? (int)$m['ts'] : 0;
        if ($ts <= 0) continue;
        $res = $m['res'] ?? null;
        if ($res !== 'A' && $res !== 'B' && $res !== 'D') $res = null;
        $a = match_normalise_side($m['a'] ?? []);
        $b = match_normalise_side($m['b'] ?? []);
        if (!$a || !$b) continue;

        $stmt->execute([
            $clubId, $rid, $ci, $ts,
            json_encode($a, JSON_UNESCAPED_UNICODE),
            json_encode($b, JSON_UNESCAPED_UNICODE),
            $res,
        ]);
        $saved++;
    }
    if ($saved > 0) log_activity($u, 'matches_sync', (string)$saved);

    json_response(['ok' => true, 'saved' => $saved]);
}

// DELETE /api/clubs/:id/matches/:rid — slet alle kampe i en runde (editor+).
// Bruges når en kamp/runde slettes lokalt: hele runden fjernes i skyen, og
// klienten gen-sender de resterende kampe (upsert), så numre altid stemmer.
function handle_club_matches_delete(int $clubId, string $rid): void {
    [$u, $role] = club_access($clubId);
    if (!club_role_at_least($role, 'editor')) json_error('Kræver editor-rolle.', 403);

    $rid = trim($rid);
    if ($rid === '' || strlen($rid) > 40) json_error('Ugyldigt runde-id.', 422);

    $stmt = db()->prepare('DELETE FROM club_matches WHERE club_id = ? AND rid = ?');
    $stmt->execute([$clubId, $rid]);
    if ($stmt->rowCount() > 0) log_activity($u, 'matches_delete', $rid);

    json_response(['ok' => true, 'deleted' => $stmt->rowCount()]);
}
