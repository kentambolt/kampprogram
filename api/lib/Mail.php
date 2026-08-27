<?php
// Simpel mailafsendelse via PHP's mail() — virker på Simply.com's webhoteller.
// Fejl i afsendelse vælter ikke requesten; invitationen kan altid deles via link.

function send_invitation_mail(string $toEmail, string $clubName, string $inviteLink, string $role): bool {
    $cfg = require __DIR__ . '/../config.php';
    $mailCfg = $cfg['mail'] ?? [];
    $from     = $mailCfg['from']     ?? ('noreply@' . ($_SERVER['HTTP_HOST'] ?? 'kampprogram.dk'));
    $fromName = $mailCfg['fromName'] ?? 'Kampprogram';

    $roleLabels = ['owner' => 'ejer', 'editor' => 'redaktør', 'viewer' => 'læser'];
    $roleLabel = $roleLabels[$role] ?? $role;

    $subject = "Invitation til {$clubName} på Kampprogram";
    $body = "Hej!\n\n"
        . "Du er blevet inviteret til klubben \"{$clubName}\" på Kampprogram som {$roleLabel}.\n\n"
        . "Klik på linket for at acceptere invitationen:\n"
        . "{$inviteLink}\n\n"
        . "Har du allerede en konto, logger du blot ind — ellers kan du oprette en "
        . "på samme side. Invitationen udløber om 14 dage.\n\n"
        . "Venlig hilsen\nKampprogram";

    $encodedFromName = '=?UTF-8?B?' . base64_encode($fromName) . '?=';
    $encodedSubject  = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $headers = implode("\r\n", [
        "From: {$encodedFromName} <{$from}>",
        "Reply-To: {$from}",
        "MIME-Version: 1.0",
        "Content-Type: text/plain; charset=UTF-8",
        "Content-Transfer-Encoding: 8bit",
    ]);

    try {
        return @mail($toEmail, $encodedSubject, $body, $headers);
    } catch (Throwable $e) {
        return false;
    }
}
