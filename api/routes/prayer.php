<?php
declare(strict_types=1);

/**
 * Prayer schedule for the signed-in principal.
 *
 *   POST /api/prayer/schedule  { times: { subuh, dzuhur, ashar, maghrib, isya } }
 *
 * Each value is either "HH:MM" (interpreted as today, server timezone) or a full
 * ISO datetime. The server stores today's 5 times; the reminder sweep
 * (Reminders::prayerTimes) turns each into an in-app + Web Push notification the
 * moment it arrives — so the adzan reminder works even with the app closed.
 * The full adzan audio itself is played in-app when the user opens the app.
 */

pg_route('POST', '/prayer/schedule', function (): void {
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login.', 401);
    }
    $kind = $p['kind'] === 'admin' ? 'admin' : 'user';
    $oid  = (int) $p['id'];

    $times = (array) (Http::body()['times'] ?? []);
    $cols  = ['subuh', 'dzuhur', 'ashar', 'maghrib', 'isya'];
    $today = date('Y-m-d');
    $vals  = [];

    foreach ($cols as $c) {
        $raw = trim((string) ($times[$c] ?? ''));
        if ($raw === '') {
            $vals[$c] = null;
            continue;
        }
        if (preg_match('/^\d{1,2}:\d{2}$/', $raw)) {
            $ts = strtotime($today . ' ' . $raw);
        } else {
            $ts = strtotime($raw);
        }
        if ($ts === false) {
            $vals[$c] = null;
            continue;
        }
        // Clamp to "today" so a bad client clock can't schedule far-future spam.
        if (date('Y-m-d', $ts) !== $today) {
            $vals[$c] = null;
            continue;
        }
        $vals[$c] = date('Y-m-d H:i:s', $ts);
    }

    if (!array_filter($vals)) {
        Http::json(['ok' => false, 'error' => 'Jadwal salat kosong.'], 200);
    }

    try {
        Db::run(
            "INSERT INTO prayer_schedules
                (owner_kind, owner_id, for_date, subuh, dzuhur, ashar, maghrib, isya)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                for_date = VALUES(for_date),
                subuh    = VALUES(subuh),
                dzuhur   = VALUES(dzuhur),
                ashar    = VALUES(ashar),
                maghrib  = VALUES(maghrib),
                isya     = VALUES(isya)",
            [$kind, $oid, $today, $vals['subuh'], $vals['dzuhur'], $vals['ashar'], $vals['maghrib'], $vals['isya']]
        );
    } catch (\Throwable $e) {
        error_log('[premiere][prayer] schedule: ' . $e->getMessage());
        Http::json(['ok' => false, 'error' => 'Gagal menyimpan jadwal salat.'], 200);
    }

    Http::json(['ok' => true, 'date' => $today, 'times' => $vals]);
});
