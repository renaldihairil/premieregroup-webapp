<?php
declare(strict_types=1);

/**
 * Attendance — selfie check-in / check-out. One row per user per calendar day
 * (enforced by UNIQUE(user_id, attendance_date)). user_id always from session.
 * Server stamps the time; the client never sends a timestamp.
 *
 *   POST   /api/attendance/check-in    { photo }
 *   POST   /api/attendance/check-out   { photo }
 *   DELETE /api/attendance/{id}        (admin housekeeping)
 */

pg_route('POST', '/attendance/check-in', function (): void {
    $u     = Guard::user();
    $photo = (string) (Http::body()['photo'] ?? '');
    if (strncmp($photo, 'data:image', 10) !== 0) {
        Http::json(['ok' => false, 'error' => 'Foto selfie wajib sebelum menyimpan absensi.'], 200);
    }

    $today = date('Y-m-d');
    if (Db::one("SELECT id FROM attendances WHERE user_id = ? AND attendance_date = ?", [$u['id'], $today])) {
        Http::json(['ok' => false, 'error' => 'Anda sudah absen masuk hari ini.'], 200);
    }

    $s        = pg_settings_row();
    $nowMin   = (int) date('G') * 60 + (int) date('i');
    $schedMin = pg_hm_to_min((string) $s['check_in']);
    $tol      = (int) $s['late_tolerance_min'];
    $late     = $nowMin > $schedMin + $tol;

    $rel = Storage::saveDataUrl($photo, 'attendance');

    try {
        Db::run(
            "INSERT INTO attendances
                (user_id, attendance_date, check_in_at, check_in_photo, check_in_status, late_minutes)
             VALUES (?, ?, NOW(), ?, ?, ?)",
            [$u['id'], $today, $rel, $late ? 'terlambat' : 'hadir', $late ? max(0, $nowMin - $schedMin) : 0]
        );
    } catch (\PDOException $e) {
        Storage::remove($rel);
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Anda sudah absen masuk hari ini.'], 200);
        }
        throw $e;
    }

    $rec = Db::one("SELECT * FROM attendances WHERE id = ?", [(int) Db::lastId()]);

    Notify::toAllAdmins('attendance.checkin',
        'Absen masuk' . ($late ? ' (terlambat)' : ''),
        Notify::userName((int) $u['id']) . ' absen masuk pukul ' . date('H:i')
            . ($late ? ' — terlambat ' . max(0, $nowMin - $schedMin) . ' menit' : ''),
        '/laporan-absensi', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_attendance($rec)]);
});

pg_route('POST', '/attendance/check-out', function (): void {
    $u     = Guard::user();
    $photo = (string) (Http::body()['photo'] ?? '');
    if (strncmp($photo, 'data:image', 10) !== 0) {
        Http::json(['ok' => false, 'error' => 'Foto selfie wajib sebelum menyimpan absensi.'], 200);
    }

    $today = date('Y-m-d');
    $rec = Db::one("SELECT * FROM attendances WHERE user_id = ? AND attendance_date = ?", [$u['id'], $today]);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Anda belum absen masuk hari ini.'], 200);
    }
    if ($rec['check_out_at'] !== null) {
        Http::json(['ok' => false, 'error' => 'Anda sudah absen pulang hari ini.'], 200);
    }

    $rel = Storage::saveDataUrl($photo, 'attendance');
    $n = Db::exec(
        "UPDATE attendances SET check_out_at = NOW(), check_out_photo = ?
          WHERE id = ? AND check_out_at IS NULL",
        [$rel, $rec['id']]
    );
    if ($n === 0) {
        Storage::remove($rel);
        Http::json(['ok' => false, 'error' => 'Anda sudah absen pulang hari ini.'], 200);
    }

    Notify::toAllAdmins('attendance.checkout',
        'Absen pulang',
        Notify::userName((int) $u['id']) . ' absen pulang pukul ' . date('H:i') . '.',
        '/laporan-absensi', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_attendance(Db::one("SELECT * FROM attendances WHERE id = ?", [$rec['id']]))]);
});

pg_route('DELETE', '/attendance/{id}', function (array $p): void {
    Guard::admin();
    $id  = (int) $p['id'];
    $rec = Db::one("SELECT check_in_photo, check_out_photo FROM attendances WHERE id = ?", [$id]);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data absensi tidak ditemukan.'], 200);
    }
    // overtimes.attendance_id -> ON DELETE SET NULL, so this is safe.
    Db::run("DELETE FROM attendances WHERE id = ?", [$id]);
    Storage::remove($rec['check_in_photo'] ?? null);
    Storage::remove($rec['check_out_photo'] ?? null);
    Http::json(['ok' => true]);
});
