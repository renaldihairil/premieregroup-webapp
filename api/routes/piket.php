<?php
declare(strict_types=1);

/**
 * Jadwal Piket — a WEEKLY RECURRING duty roster keyed by DAY-OF-WEEK (not a
 * calendar date). Admin assigns employees to a weekday; the assignment
 * repeats every week until changed. The whole roster + the reminder settings
 * are read by EVERYONE straight from bootstrap's `piketSchedules` /
 * `piketSettings` (like Job Desk / Tim Saya, this is shared team info, not
 * per-employee private data, and `write()` already re-pulls bootstrap after
 * every call below) — so this file only carries the admin WRITE endpoints,
 * no separate GET is needed.
 *
 *   POST   /api/piket-schedules          admin: assign {dayOfWeek, userId, note?}
 *   DELETE /api/piket-schedules/{id}     admin: remove one assignment
 *   POST   /api/piket-settings           admin: save {reminderTime, enabled}
 */

const PG_PIKET_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

pg_route('POST', '/piket-schedules', function (): void {
    Guard::can('piket.settings.edit');
    $b      = Http::body();
    $day    = Validate::enum($b['dayOfWeek'] ?? '', PG_PIKET_DAYS, 'Hari piket');
    $userId = Validate::int($b['userId'] ?? '', 'Karyawan');
    $note   = Validate::optStr($b['note'] ?? null, 255);

    if (!Db::one("SELECT id FROM users WHERE id = ?", [$userId])) {
        Http::fail('Karyawan tidak ditemukan.', 422);
    }

    try {
        Db::run(
            "INSERT INTO piket_schedules (day_of_week, user_id, note) VALUES (?, ?, ?)",
            [$day, $userId, $note]
        );
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Karyawan ini sudah terjadwal piket di hari tersebut.'], 200);
        }
        throw $e;
    }
    $rec = Db::one("SELECT * FROM piket_schedules WHERE id = ?", [(int) Db::lastId()]);
    Http::json(['ok' => true, 'record' => fmt_piket($rec)]);
});

pg_route('DELETE', '/piket-schedules/{id}', function (array $p): void {
    Guard::can('piket.settings.edit');
    $id = (int) $p['id'];
    if (!Db::one("SELECT id FROM piket_schedules WHERE id = ?", [$id])) {
        Http::json(['ok' => false, 'error' => 'Jadwal piket tidak ditemukan.'], 200);
    }
    Db::run("DELETE FROM piket_schedules WHERE id = ?", [$id]);
    Http::json(['ok' => true]);
});

pg_route('POST', '/piket-settings', function (): void {
    Guard::can('piket.settings.edit');
    $b        = Http::body();
    $time     = Validate::time($b['reminderTime'] ?? '', 'Jam pengingat');
    $enabled  = !empty($b['enabled']) ? 1 : 0;
    $fTime    = Validate::time($b['fridayTime'] ?? '', 'Jam pengingat Jumat Berkah');
    $fEnabled = !empty($b['fridayEnabled']) ? 1 : 0;
    $fMessage = Validate::optStr($b['fridayMessage'] ?? null, 255);
    Db::run(
        "INSERT INTO piket_settings (id, reminder_time, enabled, friday_time, friday_enabled, friday_message)
         VALUES (1, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           reminder_time = VALUES(reminder_time), enabled = VALUES(enabled),
           friday_time = VALUES(friday_time), friday_enabled = VALUES(friday_enabled),
           friday_message = VALUES(friday_message)",
        [$time, $enabled, $fTime, $fEnabled, $fMessage]
    );
    $row = Db::one("SELECT * FROM piket_settings WHERE id = 1");
    Http::json(['ok' => true, 'settings' => fmt_piket_settings($row)]);
});
