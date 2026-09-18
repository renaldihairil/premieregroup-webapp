<?php
declare(strict_types=1);

/**
 * Izin — permission / leave. One selfie + a text reason per user per calendar
 * day (UNIQUE(user_id, izin_date)). user_id always from the session; the server
 * stamps the date. Submit-only — it just becomes a record in the Admin Panel's
 * "Laporan Izin". No approval workflow.
 *
 *   POST   /api/izin            { reason, photo }     (employee)
 *   DELETE /api/izin/{id}                              (admin housekeeping)
 */

pg_route('POST', '/izin', function (): void {
    $u      = Guard::user();
    $body   = Http::body();
    $reason = trim((string) ($body['reason'] ?? ''));
    $photo  = (string) ($body['photo'] ?? '');

    if (strncmp($photo, 'data:image', 10) !== 0) {
        Http::json(['ok' => false, 'error' => 'Foto selfie wajib sebelum mengirim izin.'], 200);
    }
    if ($reason === '') {
        Http::json(['ok' => false, 'error' => 'Keterangan izin wajib diisi.'], 200);
    }
    if (mb_strlen($reason) > 1000) {
        $reason = mb_substr($reason, 0, 1000);
    }

    $today = date('Y-m-d');
    if (Db::one("SELECT id FROM izin WHERE user_id = ? AND izin_date = ?", [$u['id'], $today])) {
        Http::json(['ok' => false, 'error' => 'Anda sudah mengirim izin untuk hari ini.'], 200);
    }

    $rel = Storage::saveDataUrl($photo, 'izin');

    try {
        Db::run(
            "INSERT INTO izin (user_id, izin_date, reason, photo) VALUES (?, ?, ?, ?)",
            [$u['id'], $today, $reason, $rel]
        );
    } catch (\PDOException $e) {
        Storage::remove($rel);
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Anda sudah mengirim izin untuk hari ini.'], 200);
        }
        throw $e;
    }

    $rec = Db::one("SELECT * FROM izin WHERE id = ?", [(int) Db::lastId()]);

    Notify::toAllAdmins('izin.submitted',
        'Pengajuan izin baru',
        Notify::userName((int) $u['id']) . ' mengajukan izin: ' . mb_substr($reason, 0, 120),
        '/laporan-izin', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_izin($rec)]);
});

pg_route('DELETE', '/izin/{id}', function (array $p): void {
    Guard::admin();
    $id  = (int) $p['id'];
    $rec = Db::one("SELECT photo FROM izin WHERE id = ?", [$id]);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data izin tidak ditemukan.'], 200);
    }
    Db::run("DELETE FROM izin WHERE id = ?", [$id]);
    Storage::remove($rec['photo'] ?? null);
    Http::json(['ok' => true]);
});
