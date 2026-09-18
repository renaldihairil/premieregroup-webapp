<?php
declare(strict_types=1);

/**
 * Lembur / overtime — v9 lifecycle.
 *   berjalan   : started inside the Jam Lembur window; timer running.
 *   menunggu   : employee finished it; awaiting the admin decision. NOT counted.
 *   disetujui  : admin approved -> counted.
 *   ditolak    : admin rejected -> record KEPT, hours NOT counted.
 *   kadaluarsa : never finished before the Jam Lembur deadline. KEPT, NOT counted.
 *
 * The employee may start AND finish without approval. Server owns all
 * timestamps and recomputes duration_ms. Photos + description required.
 *
 *   POST   /api/overtime/start            { description, photo }
 *   POST   /api/overtime/end              { photo }
 *   POST   /api/overtime/{id}/approve
 *   POST   /api/overtime/{id}/reject      { reason? }
 *   DELETE /api/overtime/{id}
 */

/* ---------- shared settings / window helpers ---------- */

function pg_settings_row(): array
{
    $s = Db::one("SELECT * FROM attendance_settings WHERE id = 1");
    return $s ?: [
        'check_in' => '08:00:00', 'check_out' => '21:00:00', 'late_tolerance_min' => 15,
        'overtime_start' => '17:00:00', 'overtime_end' => '23:59:00',
        'work_days' => 'mon,tue,wed,thu,fri,sat',
    ];
}

function pg_hm_to_min(string $hms): int
{
    $p = explode(':', $hms);
    return ((int) ($p[0] ?? 0)) * 60 + ((int) ($p[1] ?? 0));
}

/** @return array{start:string,end:string} "HH:MM" */
function pg_overtime_window(): array
{
    $s = pg_settings_row();
    return [
        'start' => substr((string) $s['overtime_start'], 0, 5),
        'end'   => substr((string) $s['overtime_end'], 0, 5),
    ];
}

function pg_within_overtime_window(?int $nowMin = null): bool
{
    $w   = pg_overtime_window();
    $cur = $nowMin ?? ((int) date('G') * 60 + (int) date('i'));
    $a   = pg_hm_to_min($w['start']);
    $b   = pg_hm_to_min($w['end']);
    return $a <= $b ? ($cur >= $a && $cur <= $b) : ($cur >= $a || $cur <= $b);
}

/** Unix ts (seconds) of the deadline by which a running lembur must be finished. */
function pg_overtime_deadline(string $startAt): int
{
    $endMin  = pg_hm_to_min(pg_overtime_window()['end']);
    $startTs = strtotime($startAt);
    $d = strtotime(date('Y-m-d', $startTs) . ' ' . sprintf('%02d:%02d:59', intdiv($endMin, 60), $endMin % 60));
    if ($d <= $startTs) {
        $d = strtotime('+1 day', $d);
    }
    return $d;
}

/** Flip any berjalan+past-deadline rows to kadaluarsa. Runs on every overtime GET. */
function pg_overtime_sweep(): void
{
    $rows = Db::all("SELECT id, start_at FROM overtimes WHERE status = 'berjalan' AND end_at IS NULL");
    $now  = time();
    foreach ($rows as $r) {
        if ($now > pg_overtime_deadline($r['start_at'])) {
            Db::run("UPDATE overtimes SET status = 'kadaluarsa' WHERE id = ? AND status = 'berjalan'", [$r['id']]);
        }
    }
}

function pg_overtime_by_id(int $id): ?array
{
    $r = Db::one(
        "SELECT o.*, adm.name AS approved_by_name
           FROM overtimes o
           LEFT JOIN admins adm ON adm.id = o.approved_by_admin_id
          WHERE o.id = ?",
        [$id]
    );
    return $r ?: null;
}

/* ---------- routes ---------- */

pg_route('POST', '/overtime/start', function (): void {
    $u    = Guard::user();
    $body = Http::body();
    $desc = trim((string) ($body['description'] ?? ''));
    $photo = (string) ($body['photo'] ?? '');

    if ($desc === '') {
        Http::json(['ok' => false, 'error' => 'Keterangan lembur wajib diisi.'], 200);
    }
    if (strncmp($photo, 'data:image', 10) !== 0) {
        Http::json(['ok' => false, 'error' => 'Foto selfie wajib sebelum memulai lembur.'], 200);
    }
    if (!pg_within_overtime_window()) {
        $w = pg_overtime_window();
        Http::json(['ok' => false, 'error' => "Lembur hanya dapat dimulai pada jam {$w['start']} – {$w['end']}."], 200);
    }

    pg_overtime_sweep();

    $today = date('Y-m-d');
    $open = Db::one("SELECT id FROM overtimes WHERE user_id = ? AND status = 'berjalan' AND end_at IS NULL", [$u['id']]);
    if ($open) {
        Http::json(['ok' => false, 'error' => 'Anda masih memiliki lembur yang sedang berjalan. Selesaikan dulu.'], 200);
    }
    if (Db::one("SELECT id FROM overtimes WHERE user_id = ? AND overtime_date = ?", [$u['id'], $today])) {
        Http::json(['ok' => false, 'error' => 'Anda sudah memiliki lembur untuk hari ini.'], 200);
    }

    $rel = Storage::saveDataUrl($photo, 'overtime');
    $att = Db::one("SELECT id FROM attendances WHERE user_id = ? AND attendance_date = ?", [$u['id'], $today]);

    try {
        Db::run(
            "INSERT INTO overtimes (user_id, attendance_id, overtime_date, description, start_at, start_photo, status)
             VALUES (?, ?, ?, ?, NOW(), ?, 'berjalan')",
            [$u['id'], $att['id'] ?? null, $today, $desc, $rel]
        );
    } catch (\PDOException $e) {
        Storage::remove($rel);
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Anda sudah memiliki lembur untuk hari ini.'], 200);
        }
        throw $e;
    }

    $newOtId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID
    Notify::toAllAdmins('overtime.start',
        'Lembur dimulai',
        Notify::userName((int) $u['id']) . ' memulai lembur: ' . mb_substr($desc, 0, 120),
        '/laporan-lembur', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_overtime(pg_overtime_by_id($newOtId))]);
});

pg_route('POST', '/overtime/end', function (): void {
    $u     = Guard::user();
    $body  = Http::body();
    $photo = (string) ($body['photo'] ?? '');
    if (strncmp($photo, 'data:image', 10) !== 0) {
        Http::json(['ok' => false, 'error' => 'Foto selfie wajib sebelum menyelesaikan lembur.'], 200);
    }

    pg_overtime_sweep();

    $rec = Db::one(
        "SELECT * FROM overtimes
          WHERE user_id = ? AND status = 'berjalan' AND end_at IS NULL
          ORDER BY start_at DESC LIMIT 1",
        [$u['id']]
    );
    if (!$rec) {
        $rec = Db::one(
            "SELECT * FROM overtimes WHERE user_id = ? AND overtime_date = ? ORDER BY id DESC LIMIT 1",
            [$u['id'], date('Y-m-d')]
        );
    }
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Anda belum memulai lembur.'], 200);
    }
    if ($rec['status'] === 'kadaluarsa') {
        $w = pg_overtime_window();
        Http::json(['ok' => false, 'error' => "Batas waktu lembur (jam {$w['end']}) sudah terlewat. Lembur ini tidak dihitung."], 200);
    }
    if ($rec['end_at'] !== null || $rec['status'] !== 'berjalan') {
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diselesaikan.'], 200);
    }

    $rel  = Storage::saveDataUrl($photo, 'overtime');
    $durS = max(0, time() - strtotime($rec['start_at']));

    $n = Db::exec(
        "UPDATE overtimes
            SET end_at = NOW(), end_photo = ?, duration_ms = ?, status = 'menunggu'
          WHERE id = ? AND status = 'berjalan' AND end_at IS NULL",
        [$rel, $durS * 1000, $rec['id']]
    );
    if ($n === 0) {
        Storage::remove($rel);
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diselesaikan.'], 200);
    }

    Notify::toAllAdmins('overtime.end',
        'Lembur menunggu persetujuan',
        Notify::userName((int) $u['id']) . ' menyelesaikan lembur — perlu ditinjau.',
        '/laporan-lembur', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_overtime(pg_overtime_by_id((int) $rec['id']))]);
});

pg_route('POST', '/overtime/{id}/approve', function (array $p): void {
    $admin = Guard::can('overtime.approve');
    $id    = (int) $p['id'];

    $rec = pg_overtime_by_id($id);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data lembur tidak ditemukan.'], 200);
    }
    if ($rec['status'] === 'berjalan' || $rec['end_at'] === null) {
        Http::json(['ok' => false, 'error' => 'Karyawan belum menyelesaikan lembur ini.'], 200);
    }
    if ($rec['status'] !== 'menunggu') {
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diproses.'], 200);
    }

    $n = Db::exec(
        "UPDATE overtimes
            SET status = 'disetujui', approved_by_admin_id = ?, approved_at = NOW(), rejection_reason = NULL
          WHERE id = ? AND status = 'menunggu'",
        [$admin['id'], $id]
    );
    if ($n === 0) {
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diproses.'], 200);
    }

    Notify::toUser((int) $rec['user_id'], 'overtime.approved',
        'Lembur disetujui',
        'Lembur Anda tanggal ' . $rec['overtime_date'] . ' disetujui admin dan dihitung.',
        '/absensi');

    Http::json(['ok' => true, 'record' => fmt_overtime(pg_overtime_by_id($id))]);
});

pg_route('POST', '/overtime/{id}/reject', function (array $p): void {
    $admin  = Guard::can('overtime.approve');
    $id     = (int) $p['id'];
    $reason = Validate::optStr(Http::body()['reason'] ?? null, 500);

    $rec = pg_overtime_by_id($id);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data lembur tidak ditemukan.'], 200);
    }
    if ($rec['status'] === 'berjalan' || $rec['end_at'] === null) {
        Http::json(['ok' => false, 'error' => 'Karyawan belum menyelesaikan lembur ini.'], 200);
    }
    if ($rec['status'] !== 'menunggu') {
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diproses.'], 200);
    }

    $n = Db::exec(
        "UPDATE overtimes
            SET status = 'ditolak', rejection_reason = ?, approved_by_admin_id = ?, approved_at = NOW()
          WHERE id = ? AND status = 'menunggu'",
        [$reason, $admin['id'], $id]
    );
    if ($n === 0) {
        Http::json(['ok' => false, 'error' => 'Lembur ini sudah diproses.'], 200);
    }

    Notify::toUser((int) $rec['user_id'], 'overtime.rejected',
        'Lembur ditolak',
        'Lembur Anda tanggal ' . $rec['overtime_date'] . ' ditolak admin' .
            ($reason ? ' — alasan: ' . mb_substr($reason, 0, 140) : '') . '. Tidak dihitung.',
        '/absensi');

    Http::json(['ok' => true, 'record' => fmt_overtime(pg_overtime_by_id($id))]);
});

pg_route('DELETE', '/overtime/{id}', function (array $p): void {
    Guard::can('overtime.approve');
    $id  = (int) $p['id'];
    $rec = Db::one("SELECT start_photo, end_photo FROM overtimes WHERE id = ?", [$id]);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data lembur tidak ditemukan.'], 200);
    }
    Db::run("DELETE FROM overtimes WHERE id = ?", [$id]);
    Storage::remove($rec['start_photo'] ?? null);
    Storage::remove($rec['end_photo'] ?? null);
    Http::json(['ok' => true]);
});
