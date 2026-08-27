<?php
// PDO-singleton.

function db(): PDO {
    static $pdo = null;
    if ($pdo !== null) return $pdo;

    $cfg = require __DIR__ . '/../config.php';
    $dbc = $cfg['db'];

    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $dbc['host'], (int)$dbc['port'], $dbc['database'], $dbc['charset']
    );

    try {
        $pdo = new PDO($dsn, $dbc['username'], $dbc['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
    } catch (PDOException $e) {
        json_error(
            'Database-fejl: ' . ($cfg['debug'] ? $e->getMessage() : 'kunne ikke forbinde'),
            500
        );
    }

    return $pdo;
}
