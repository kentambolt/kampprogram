<?php
// Aktivitetslog — én række pr. betydningsfuld handling.
// Fejl i logning må aldrig vælte selve requesten, deraf try/catch.

function log_activity(?array $user, string $action, ?string $detail = null): void {
    try {
        $stmt = db()->prepare(
            'INSERT INTO activity_log (club_id, user_id, action, detail) VALUES (?, ?, ?, ?)'
        );
        $stmt->execute([
            $user['club_id'] ?? null,
            $user['id'] ?? null,
            substr($action, 0, 60),
            $detail !== null ? substr($detail, 0, 190) : null,
        ]);
    } catch (Throwable $e) {
        // Logning er "best effort" — ignorér fejl.
    }
}
