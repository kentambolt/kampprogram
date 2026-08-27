<?php
// Rolle-baseret adgangskontrol.

const ROLE_RANK = [
    'viewer' => 1,
    'editor' => 2,
    'owner'  => 3,
];

function role_at_least(array $user, string $required): bool {
    $a = ROLE_RANK[$user['role']] ?? 0;
    $b = ROLE_RANK[$required]     ?? 0;
    return $a >= $b;
}

function require_role(array $user, string $required): void {
    if (!role_at_least($user, $required)) {
        json_error('Du har ikke rettigheder til denne handling.', 403);
    }
}

// Site-admin: må se og administrere ALLE klubber (🛠 Admin-panelet).
function require_admin(): array {
    $u = require_auth();
    if (empty($u['is_admin'])) {
        json_error('Kræver administrator-rettigheder.', 403);
    }
    return $u;
}
