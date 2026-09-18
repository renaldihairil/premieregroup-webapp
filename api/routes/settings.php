<?php
declare(strict_types=1);

/**
 * Attendance settings, holidays, and system settings. All admin-only.
 *
 *   PUT    /api/attendance-settings   partial { checkIn, checkOut, lateToleranceMin,
 *                                               overtimeStart, overtimeEnd, workDays[] }
 *   POST   /api/holidays              { date, label? }
 *   DELETE /api/holidays/{date}
 *   PUT    /api/system-settings       partial { companyName, timezone, locale, weekStart }
 */

function pg_attendance_settings_out(): array
{
    $s = Db::one("SELECT * FROM attendance_settings WHERE id = 1");
    $h = Db::all("SELECT * FROM holidays ORDER BY holiday_date");
    return fmt_settings($s, $h);
}

pg_route('PUT', '/attendance-settings', function (): void {
    Guard::can('attendance.settings.edit');
    $body = Http::body();

    Db::run("INSERT INTO attendance_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");

    $set = [];
    $args = [];
    if (array_key_exists('checkIn', $body)) {
        $set[] = 'check_in = ?';
        $args[] = Validate::time($body['checkIn'], 'Jam masuk');
    }
    if (array_key_exists('checkOut', $body)) {
        $set[] = 'check_out = ?';
        $args[] = Validate::time($body['checkOut'], 'Jam pulang');
    }
    if (array_key_exists('lateToleranceMin', $body)) {
        $v = Validate::int($body['lateToleranceMin'], 'Toleransi keterlambatan');
        $set[] = 'late_tolerance_min = ?';
        $args[] = max(0, min(600, $v));
    }
    if (array_key_exists('overtimeStart', $body)) {
        $set[] = 'overtime_start = ?';
        $args[] = Validate::time($body['overtimeStart'], 'Jam mulai lembur');
    }
    if (array_key_exists('overtimeEnd', $body)) {
        $set[] = 'overtime_end = ?';
        $args[] = Validate::time($body['overtimeEnd'], 'Jam selesai lembur');
    }
    if (array_key_exists('workDays', $body)) {
        $set[] = 'work_days = ?';
        $args[] = Validate::workDays($body['workDays']);
    }

    if ($set) {
        $args[] = 1;
        Db::run("UPDATE attendance_settings SET " . implode(', ', $set) . " WHERE id = ?", $args);

        $touchesWork = array_key_exists('checkIn', $body) || array_key_exists('checkOut', $body)
            || array_key_exists('workDays', $body) || array_key_exists('lateToleranceMin', $body);
        if ($touchesWork) {
            foreach (Db::all("SELECT id FROM users WHERE status = 'active'") as $t) {
                Notify::toUser((int) $t['id'], 'attendance.settings',
                    'Aturan absensi diperbarui',
                    'Admin memperbarui jam kerja / toleransi / hari kerja. Cek menu Absensi.',
                    '/absensi');
            }
        }
    }
    Http::json(['ok' => true, 'record' => pg_attendance_settings_out()]);
});

pg_route('POST', '/holidays', function (): void {
    Guard::can('attendance.settings.edit');
    $body  = Http::body();
    $date  = Validate::date($body['date'] ?? '', 'Tanggal');
    $label = Validate::optStr($body['label'] ?? null, 150) ?? 'Hari Libur';

    Db::run(
        "INSERT INTO holidays (holiday_date, label) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE label = VALUES(label)",
        [$date, $label]
    );
    Http::json(['ok' => true, 'holidays' => pg_attendance_settings_out()['holidays']]);
});

pg_route('DELETE', '/holidays/{date}', function (array $p): void {
    Guard::can('attendance.settings.edit');
    $date = Validate::date($p['date'], 'Tanggal');
    Db::run("DELETE FROM holidays WHERE holiday_date = ?", [$date]);
    Http::json(['ok' => true, 'holidays' => pg_attendance_settings_out()['holidays']]);
});

pg_route('PUT', '/system-settings', function (): void {
    Guard::can('system.settings.edit');
    $body = Http::body();

    Db::run("INSERT INTO system_settings (id) VALUES (1) ON DUPLICATE KEY UPDATE id = id");

    $set = [];
    $args = [];
    if (array_key_exists('companyName', $body)) {
        $set[] = 'company_name = ?';
        $args[] = Validate::str($body['companyName'], 'Nama perusahaan', 1, 150);
    }
    if (array_key_exists('timezone', $body)) {
        $tz = (string) $body['timezone'];
        if (!in_array($tz, timezone_identifiers_list(), true)) {
            Http::fail('Zona waktu tidak dikenali.', 422);
        }
        $set[] = 'timezone = ?';
        $args[] = $tz;
    }
    if (array_key_exists('locale', $body)) {
        $set[] = 'locale = ?';
        $args[] = Validate::str($body['locale'], 'Locale', 2, 10);
    }
    if (array_key_exists('weekStart', $body)) {
        $set[] = 'week_start = ?';
        $args[] = Validate::enum($body['weekStart'], ['sun', 'mon'], 'Awal minggu');
    }
    if ($set) {
        $args[] = 1;
        Db::run("UPDATE system_settings SET " . implode(', ', $set) . " WHERE id = ?", $args);
    }

    $row = Db::one("SELECT * FROM system_settings WHERE id = 1");
    Http::json(['ok' => true, 'record' => fmt_system_settings($row)]);
});
