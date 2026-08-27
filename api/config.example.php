<?php
// =============================================================
// SKABELON — kopiér til config.php og udfyld dine egne værdier.
// config.php er gitignoret og må aldrig committes med rigtige
// credentials (repoet publiceres offentligt via GitHub Pages).
// =============================================================

return [
    // MySQL-forbindelse (host/database/brugernavn står i Simply.com's
    // kontrolpanel under Servere + Databaser).
    'db' => [
        'host'     => 'mysqlXX.unoeuro.com',
        'port'     => 3306,
        'database' => 'CHANGE_ME',
        'username' => 'CHANGE_ME',
        'password' => 'CHANGE_ME',
        'charset'  => 'utf8mb4',
    ],

    // Cookie-indstillinger til PHP-sessions.
    'session' => [
        'name'     => 'kampprogram_sid',
        'lifetime' => 60 * 60 * 24 * 30,   // 30 dage
        'secure'   => true,                // kræver HTTPS (sæt false ved lokal HTTP-test)
        'httponly' => true,
        'samesite' => 'Lax',
    ],

    // Vis detaljerede PHP-fejl i API-svar (kun under udvikling).
    'debug' => false,
];
