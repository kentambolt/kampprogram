<?php
// /api/invites — invitationsflow.
//
//   POST   /api/invites              (owner)  {email, role} → opret + send mail
//   GET    /api/invites              (owner)  afventende invitationer i aktiv klub
//   DELETE /api/invites/:id          (owner)  tilbagekald invitation
//   GET    /api/invites/info?token=  (public) klubnavn + om kontoen findes
//   POST   /api/invites/accept       (auth)   {token} → tilføj medlemskab
//   POST   /api/invites/register     (public) {token, name, password} → opret konto + medlemskab + login

const INVITE_LIFETIME_DAYS = 14;

function invite_base_url(): string {
    $cfg = require __DIR__ . '/../config.php';
    if (!empty($cfg['mail']['baseUrl'])) return rtrim($cfg['mail']['baseUrl'], '/');
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    return $scheme . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
}

function invite_link(string $token): string {
    return invite_base_url() . '/?invite=' . $token;
}

// Find en gyldig (uudløbet, uaccepteret) invitation ud fra token.
function find_valid_invite(string $token): ?array {
    if (!preg_match('/^[a-f0-9]{64}$/', $token)) return null;
    $stmt = db()->prepare(
        'SELECT i.*, c.name AS club_name
         FROM invitations i
         JOIN clubs c ON c.id = i.club_id
         WHERE i.token = ? AND i.accepted_at IS NULL AND i.expires_at > NOW()'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch();
    return $row ?: null;
}

// Tilføj medlemskab ud fra en invitation og markér den accepteret.
function apply_invite(array $invite, int $userId): void {
    db()->prepare(
        'INSERT INTO club_members (club_id, user_id, role) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE role = role'   // allerede medlem → behold eksisterende rolle
    )->execute([$invite['club_id'], $userId, $invite['role']]);

    db()->prepare('UPDATE invitations SET accepted_at = NOW() WHERE id = ?')
        ->execute([$invite['id']]);
}

// POST /api/invites {email, role}
function handle_invites_create(): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $body = read_json_body();
    $email = trim((string)($body['email'] ?? ''));
    $role  = (string)($body['role'] ?? 'editor');

    if ($email === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('Ugyldig e-mail.', 422);
    }
    if (!in_array($role, ['owner','editor','viewer'], true)) {
        json_error('Ugyldig rolle.', 422);
    }

    // Er personen allerede medlem?
    $stmt = db()->prepare(
        'SELECT 1 FROM club_members cm JOIN users us ON us.id = cm.user_id
         WHERE cm.club_id = ? AND us.email = ?'
    );
    $stmt->execute([$u['club_id'], $email]);
    if ($stmt->fetch()) {
        json_error('Personen er allerede medlem af klubben.', 409);
    }

    // Genbrug/forny en eksisterende afventende invitation til samme email+klub.
    db()->prepare(
        'DELETE FROM invitations WHERE club_id = ? AND email = ? AND accepted_at IS NULL'
    )->execute([$u['club_id'], $email]);

    $token = bin2hex(random_bytes(32));
    db()->prepare(
        'INSERT INTO invitations (token, club_id, email, role, invited_by_user_id, expires_at)
         VALUES (?, ?, ?, ?, ?, NOW() + INTERVAL ' . INVITE_LIFETIME_DAYS . ' DAY)'
    )->execute([$token, $u['club_id'], $email, $role, $u['id']]);

    $link = invite_link($token);
    $mailSent = send_invitation_mail($email, $u['club_name'], $link, $role);
    log_activity($u, 'invite_create', $email);

    json_response([
        'ok'       => true,
        'mailSent' => $mailSent,
        'link'     => $link,   // så owner altid kan dele linket manuelt
    ], 201);
}

// GET /api/invites — afventende invitationer i aktiv klub.
function handle_invites_list(): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $stmt = db()->prepare(
        'SELECT id, email, role, token, created_at, expires_at
         FROM invitations
         WHERE club_id = ? AND accepted_at IS NULL AND expires_at > NOW()
         ORDER BY created_at DESC'
    );
    $stmt->execute([$u['club_id']]);
    json_response(['invites' => array_map(fn($r) => [
        'id'        => (int)$r['id'],
        'email'     => $r['email'],
        'role'      => $r['role'],
        'link'      => invite_link($r['token']),
        'createdAt' => $r['created_at'],
        'expiresAt' => $r['expires_at'],
    ], $stmt->fetchAll())]);
}

// DELETE /api/invites/:id
function handle_invites_delete(int $id): void {
    $u = require_auth();
    require_club($u);
    require_role($u, 'owner');

    $stmt = db()->prepare('SELECT email FROM invitations WHERE id = ? AND club_id = ?');
    $stmt->execute([$id, $u['club_id']]);
    $row = $stmt->fetch();
    if (!$row) json_error('Invitationen findes ikke.', 404);

    db()->prepare('DELETE FROM invitations WHERE id = ?')->execute([$id]);
    log_activity($u, 'invite_revoke', $row['email']);
    json_response(['ok' => true]);
}

// GET /api/invites/info?token=... — public landing-info.
function handle_invites_info(): void {
    $token = (string)($_GET['token'] ?? '');
    $invite = find_valid_invite($token);
    if (!$invite) json_error('Invitationen er ugyldig eller udløbet.', 404);

    $stmt = db()->prepare('SELECT 1 FROM users WHERE email = ?');
    $stmt->execute([$invite['email']]);
    $accountExists = (bool)$stmt->fetch();

    $current = auth_current_user();

    json_response(['invite' => [
        'clubName'      => $invite['club_name'],
        'email'         => $invite['email'],
        'role'          => $invite['role'],
        'accountExists' => $accountExists,
        // Er man allerede logget ind med den inviterede e-mail, kan man acceptere direkte.
        'canAcceptNow'  => $current !== null
            && strcasecmp($current['email'], $invite['email']) === 0,
    ]]);
}

// POST /api/invites/accept {token} — kræver login med den inviterede e-mail.
function handle_invites_accept(): void {
    $u = require_auth();
    $body = read_json_body();
    $invite = find_valid_invite((string)($body['token'] ?? ''));
    if (!$invite) json_error('Invitationen er ugyldig eller udløbet.', 404);

    if (strcasecmp($u['email'], $invite['email']) !== 0) {
        json_error('Invitationen er sendt til en anden e-mail end den, du er logget ind med.', 403);
    }

    apply_invite($invite, (int)$u['id']);
    $_SESSION['club_id'] = (int)$invite['club_id'];   // skift direkte til den nye klub
    log_activity(['id' => $u['id'], 'club_id' => (int)$invite['club_id']], 'invite_accept');

    $u = auth_current_user();
    json_response(['user' => public_user($u)]);
}

// POST /api/invites/register {token, name, password} — ny konto + medlemskab + login.
function handle_invites_register(): void {
    $body = read_json_body();
    $invite = find_valid_invite((string)($body['token'] ?? ''));
    if (!$invite) json_error('Invitationen er ugyldig eller udløbet.', 404);

    $name     = trim((string)($body['name'] ?? ''));
    $password = (string)($body['password'] ?? '');
    if ($name === '' || strlen($name) > 120) json_error('Navn skal være mellem 1 og 120 tegn.', 422);
    if (strlen($password) < 6) json_error('Adgangskode skal være mindst 6 tegn.', 422);

    // Findes kontoen allerede, skal man logge ind i stedet.
    $stmt = db()->prepare('SELECT id FROM users WHERE email = ?');
    $stmt->execute([$invite['email']]);
    if ($stmt->fetch()) {
        json_error('Der findes allerede en konto med denne e-mail — log ind i stedet.', 409);
    }

    $hash = password_hash($password, PASSWORD_BCRYPT);
    db()->prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
        ->execute([$invite['email'], $name, $hash]);
    $userId = (int)db()->lastInsertId();

    apply_invite($invite, $userId);
    auth_login($userId);
    $_SESSION['club_id'] = (int)$invite['club_id'];

    db()->prepare('UPDATE users SET last_login_at = NOW(), login_count = 1 WHERE id = ?')
        ->execute([$userId]);
    log_activity(['id' => $userId, 'club_id' => (int)$invite['club_id']], 'invite_register');

    $u = auth_current_user();
    json_response(['user' => public_user($u)], 201);
}
