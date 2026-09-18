<?php
declare(strict_types=1);

/**
 * Pengeluaran — a plain EXPENSE LOGBOOK for staff, not a finance module.
 * Fields are deliberately minimal: nama pengeluaran, nominal, catatan
 * opsional + foto lampiran wajib (kamera atau upload). The date is stamped
 * by the server at submit time (same as izin_date on the izin table), never
 * client input. Submit-only from the employee side — same spirit as Izin,
 * no approval workflow. It becomes a record in the Admin Panel's "Laporan
 * Pengeluaran"; the employee's own "Riwayat Pengeluaran" reads the same rows.
 *
 *   POST   /api/expenses          multipart: name, amount, note?, photo   (employee)
 *   DELETE /api/expenses/{id}                                            (admin housekeeping)
 *   GET    /api/expense-file?id=..&download=1   stream the attached photo (owner or admin)
 */

pg_route('POST', '/expenses', function (): void {
    $u = Guard::user();
    $b = Http::body(); // multipart -> $_POST

    $name = Validate::str($b['name'] ?? '', 'Nama pengeluaran', 1, 150);
    $note = Validate::optStr($b['note'] ?? null, 1000);

    $amountRaw = $b['amount'] ?? '';
    if (!is_numeric($amountRaw) || (float) $amountRaw < 0) {
        Http::fail('Nominal pengeluaran tidak valid.', 422);
    }
    $amount = (int) round((float) $amountRaw);
    if ($amount > 999999999) {
        Http::fail('Nominal pengeluaran melebihi batas.', 422);
    }

    if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
        Http::fail('Foto lampiran wajib disertakan.', 422);
    }
    $saved = Storage::saveUpload($_FILES['photo'], 'expense');
    if ($saved['kind'] !== 'image') {
        Storage::remove($saved['path']);
        Http::fail('Lampiran harus berupa foto (JPG, PNG, atau WebP).', 422);
    }

    $date = date('Y-m-d');
    Db::run(
        "INSERT INTO expenses (user_id, name, expense_date, amount, note, photo_path, photo_mime, photo_name, photo_size)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [$u['id'], $name, $date, $amount, $note, $saved['path'], $saved['mime'], $saved['name'], $saved['size']]
    );
    $rec = Db::one("SELECT * FROM expenses WHERE id = ?", [(int) Db::lastId()]);

    Notify::toAllAdmins('expense.submitted',
        'Laporan pengeluaran baru',
        Notify::userName((int) $u['id']) . ' mencatat pengeluaran "' . $name . '" — Rp ' . number_format($amount, 0, ',', '.'),
        '/laporan-pengeluaran', (int) $u['id']);

    Http::json(['ok' => true, 'record' => fmt_expense($rec)]);
});

pg_route('DELETE', '/expenses/{id}', function (array $p): void {
    Guard::admin();
    $id  = (int) $p['id'];
    $rec = Db::one("SELECT photo_path FROM expenses WHERE id = ?", [$id]);
    if (!$rec) {
        Http::json(['ok' => false, 'error' => 'Data pengeluaran tidak ditemukan.'], 200);
    }
    Db::run("DELETE FROM expenses WHERE id = ?", [$id]);
    Storage::remove($rec['photo_path'] ?? null);
    Http::json(['ok' => true]);
});

/** GET /api/expense-file?id=..&download=1 — stream the attached photo. */
pg_route('GET', '/expense-file', function (): void {
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login untuk melihat foto.', 401);
    }
    $id  = (int) Http::query('id', '0');
    $row = Db::one("SELECT * FROM expenses WHERE id = ?", [$id]);
    if (!$row) {
        Http::fail('Foto tidak ditemukan.', 404);
    }
    $isOwner = $p['kind'] === 'user' && (int) $p['id'] === (int) $row['user_id'];
    $isAdmin = $p['kind'] === 'admin';
    if (!$isOwner && !$isAdmin) {
        Http::fail('Anda tidak berhak melihat foto ini.', 403);
    }
    $download = Http::query('download', '0') === '1';
    Storage::serveFile($row['photo_path'], (string) $row['photo_mime'], (string) ($row['photo_name'] ?: 'lampiran.jpg'), $download);
});
