<?php
declare(strict_types=1);

/**
 * Admin-configurable notification catalog (on/off per type + reminder
 * lead-time for deadline-based types). Admin-only.
 *
 *   GET /api/notification-settings   -> { ok, items:[{type,label,category,
 *                                          reminder,enabled,offsetValue,offsetUnit}] }
 *   PUT /api/notification-settings   { items:[{type,enabled,offsetValue?,offsetUnit?}] }
 */

pg_route('GET', '/notification-settings', function (): void {
    Guard::can('notification.settings.edit');
    Http::json(['ok' => true, 'items' => NotifSettings::list()]);
});

pg_route('PUT', '/notification-settings', function (): void {
    Guard::can('notification.settings.edit');
    $items = (array) (Http::body()['items'] ?? []);
    if (!$items) {
        Http::json(['ok' => false, 'error' => 'Tidak ada data untuk disimpan.'], 200);
    }
    try {
        NotifSettings::saveMany($items);
    } catch (\Throwable $e) {
        error_log('[premiere][notif-settings] save: ' . $e->getMessage());
        Http::json(['ok' => false, 'error' => 'Gagal menyimpan pengaturan notifikasi.'], 200);
    }
    Http::json(['ok' => true, 'items' => NotifSettings::list()]);
});
