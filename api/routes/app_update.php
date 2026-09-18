<?php
declare(strict_types=1);

/**
 * "Info Update" — admin broadcasts an app-update announcement to every
 * active user + admin (except the admin who sent it). The client shows it
 * as a popup with a Refresh button — see PG.appUpdate in pwa.js, which
 * checks for it right after every boot (covers a tapped push notification
 * cold-starting the app) and live via pg:notif-new while already open.
 *
 *   POST /app-update/notify   { title, description }
 */

pg_route('POST', '/app-update/notify', function (): void {
    $admin = Guard::can('app.update.send');
    $body  = Http::body();
    $title = Validate::str($body['title'] ?? '', 'Judul pemberitahuan', 1, 160);
    $desc  = Validate::str($body['description'] ?? '', 'Deskripsi pemberitahuan', 1, 500);

    Notify::broadcastExceptSelf('admin', (int) $admin['id'], 'app.update', $title, $desc, '/');

    Http::json(['ok' => true]);
});
