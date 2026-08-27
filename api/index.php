<?php
// =============================================================
// Kampprogram API — main router
// =============================================================

declare(strict_types=1);

require __DIR__ . '/lib/Json.php';

set_error_handler(function ($errno, $errstr, $errfile, $errline) {
    json_error("PHP-fejl: $errstr i $errfile:$errline", 500);
});
set_exception_handler(function (Throwable $e) {
    $cfg = require __DIR__ . '/config.php';
    json_error(
        $cfg['debug']
            ? sprintf('%s: %s (%s:%d)', get_class($e), $e->getMessage(), $e->getFile(), $e->getLine())
            : 'Intern serverfejl.',
        500
    );
});

require __DIR__ . '/lib/Db.php';
require __DIR__ . '/lib/Auth.php';
require __DIR__ . '/lib/Acl.php';
require __DIR__ . '/lib/Log.php';
require __DIR__ . '/lib/Mail.php';
require __DIR__ . '/handlers/auth.php';
require __DIR__ . '/handlers/player_lists.php';
require __DIR__ . '/handlers/users.php';
require __DIR__ . '/handlers/admin.php';
require __DIR__ . '/handlers/invites.php';
require __DIR__ . '/handlers/clubs.php';
require __DIR__ . '/handlers/squads.php';

// ---------- Route parsing ----------

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Path er fx "/api/player-lists/42". Skær "/api" forrest af.
$uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?? '/';
$path = preg_replace('#^.*?/api/?#', '/', $uri);   // tolerér at api ligger i en undermappe
$path = rtrim($path, '/');
if ($path === '') $path = '/';

$segments = $path === '/' ? [] : array_values(array_filter(explode('/', $path), 'strlen'));

// Tillad CORS-preflight (samme-origin er typisk, men nyttigt under udvikling).
if ($method === 'OPTIONS') {
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
    header('Access-Control-Max-Age: 600');
    http_response_code(204);
    exit;
}

// ---------- Routing ----------

try {
    $first = $segments[0] ?? '';

    if ($first === 'me') {
        if ($method !== 'GET') json_error('Method not allowed.', 405);
        handle_me();
    }

    if ($first === 'auth') {
        $action = $segments[1] ?? '';
        if ($action === 'login' && $method === 'POST') {
            handle_auth_login();
        }
        if ($action === 'logout' && $method === 'POST') {
            handle_auth_logout();
        }
        if ($action === 'change-password' && $method === 'POST') {
            handle_auth_change_password();
        }
        if ($action === 'switch-club' && $method === 'POST') {
            handle_auth_switch_club();
        }
        json_error('Auth-endpoint findes ikke.', 404);
    }

    if ($first === 'player-lists') {
        $id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
        if ($id === null) {
            if ($method === 'GET')  handle_player_lists_list();
            if ($method === 'POST') handle_player_lists_create();
        } else {
            if ($method === 'PUT' || $method === 'PATCH') handle_player_lists_update($id);
            if ($method === 'DELETE')                    handle_player_lists_delete($id);
        }
        json_error('Method not allowed.', 405);
    }

    if ($first === 'invites') {
        $second = $segments[1] ?? '';
        if ($second === 'info'     && $method === 'GET')  handle_invites_info();
        if ($second === 'accept'   && $method === 'POST') handle_invites_accept();
        if ($second === 'register' && $method === 'POST') handle_invites_register();
        $id = ctype_digit($second) ? (int)$second : null;
        if ($id === null && $second === '') {
            if ($method === 'GET')  handle_invites_list();
            if ($method === 'POST') handle_invites_create();
        }
        if ($id !== null && $method === 'DELETE') handle_invites_delete($id);
        json_error('Invite-endpoint findes ikke.', 404);
    }

    if ($first === 'clubs') {
        $id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
        if ($id !== null) {
            $third = $segments[2] ?? '';
            if ($third === 'players') {
                if ($method === 'GET') handle_club_players_list($id);
                json_error('Method not allowed.', 405);
            }
            if ($third === 'squads') {
                $sid = isset($segments[3]) && ctype_digit($segments[3]) ? (int)$segments[3] : null;
                $fifth = $segments[4] ?? '';
                if ($sid === null) {
                    if ($method === 'GET')  handle_squads_list($id);
                    if ($method === 'POST') handle_squad_create($id);
                } elseif ($fifth === 'members') {
                    $pid = isset($segments[5]) && ctype_digit($segments[5]) ? (int)$segments[5] : null;
                    if ($pid === null && $method === 'POST')   handle_squad_member_add($id, $sid);
                    if ($pid !== null && $method === 'DELETE') handle_squad_member_remove($id, $sid, $pid);
                } else {
                    if ($method === 'GET')    handle_squad_get($id, $sid);
                    if ($method === 'PUT' || $method === 'PATCH') handle_squad_update($id, $sid);
                    if ($method === 'DELETE') handle_squad_delete($id, $sid);
                }
                json_error('Hold-endpoint findes ikke.', 404);
            }
            if ($third === 'sessions') {
                $sid = isset($segments[3]) && ctype_digit($segments[3]) ? (int)$segments[3] : null;
                if ($sid === null) {
                    if ($method === 'GET')  handle_club_sessions_list($id);
                    if ($method === 'POST') handle_club_session_create($id);
                } else {
                    if ($method === 'GET')    handle_club_session_get($id, $sid);
                    if ($method === 'DELETE') handle_club_session_delete($id, $sid);
                }
                json_error('Session-endpoint findes ikke.', 404);
            }
            if ($method === 'GET')    handle_club_get($id);
            if ($method === 'PATCH' || $method === 'PUT') handle_club_update($id);
            if ($method === 'DELETE') handle_club_delete($id);
        }
        json_error('Klub-endpoint findes ikke.', 404);
    }

    if ($first === 'users') {
        $id = isset($segments[1]) && ctype_digit($segments[1]) ? (int)$segments[1] : null;
        if ($id === null) {
            if ($method === 'GET')  handle_users_list();
            if ($method === 'POST') handle_users_create();
        } else {
            if ($method === 'PATCH' || $method === 'PUT') handle_users_update($id);
            if ($method === 'DELETE')                    handle_users_delete($id);
        }
        json_error('Method not allowed.', 405);
    }

    if ($first === 'admin') {
        $second = $segments[1] ?? '';
        $id = isset($segments[2]) && ctype_digit($segments[2]) ? (int)$segments[2] : null;

        if ($second === 'overview' && $method === 'GET') handle_admin_overview();
        if ($second === 'activity' && $method === 'GET') handle_admin_activity();

        if ($second === 'clubs') {
            if ($id === null && $method === 'POST')   handle_admin_create_club();
            if ($id !== null && $method === 'DELETE') handle_admin_delete_club($id);
        }
        if ($second === 'users') {
            if ($id === null && $method === 'GET')    handle_admin_users_list();
            if ($id === null && $method === 'POST')   handle_admin_create_user();
            if ($id !== null && ($method === 'PATCH' || $method === 'PUT')) handle_admin_update_user($id);
            if ($id !== null && $method === 'DELETE') handle_admin_delete_user($id);
        }
        if ($second === 'memberships') {
            if ($method === 'POST')   handle_admin_add_membership();
            if ($method === 'DELETE') handle_admin_remove_membership();
        }
        json_error('Admin-endpoint findes ikke.', 404);
    }

    json_error('Endpoint ikke fundet.', 404);

} catch (Throwable $e) {
    $cfg = require __DIR__ . '/config.php';
    json_error(
        $cfg['debug']
            ? sprintf('%s: %s', get_class($e), $e->getMessage())
            : 'Intern serverfejl.',
        500
    );
}
