<?php
declare(strict_types=1);

/**
 * Resi Gudang — catatan barang masuk gudang yang diisi karyawan di User App.
 * Bukan modul inventori: hanya mencatat penerimaan barang (tanggal, nama
 * barang, supplier, no resi, qty, harga, total, ongkir, keterangan, tanggal
 * diterima, pembayaran, pengiriman, koli). Admin Panel membacanya lewat
 * "Laporan Resi Gudang" (bootstrap mengirim warehouseReceipts).
 *
 * Tiga status independen dipakai untuk pewarnaan "Riwayat Resi" di User App
 * (lihat PG.store.warehouseReceiptStatus di assets/js/core/store.js):
 *   - status          'draft' | 'submitted' — draft HANYA terlihat pemiliknya,
 *     tak memicu notifikasi, tak ikut Laporan Resi / Laporan Resi Gudang.
 *   - payment_status  'lunas' | 'belum_lunas' (+ due_date, OPSIONAL saat
 *     belum_lunas — User App's "Jatuh Tempo" card groups belum_lunas WITH a
 *     due_date, "Non Tempo" groups belum_lunas withOUT one; see
 *     PG.store.warehouseDueUrgency)
 *   - goods_status    'klop' | 'minus' | NULL — diisi saat barang ditandai
 *     diterima (received_date terisi); NULL selama belum diterima.
 *
 * `supplier` tetap teks bebas (lihat warehouse_suppliers.php utk daftar master
 * yang mengisi dropdown-nya + auto-register nama baru via pg_whs_ensure()).
 *
 *   GET    /api/warehouse-receipts        list (own for user incl. drafts,
 *                                          submitted-only for admin)
 *   POST   /api/warehouse-receipts        create                         (karyawan)
 *   PATCH  /api/warehouse-receipts/{id}   edit — pembuatnya saja         (karyawan)
 *   DELETE /api/warehouse-receipts/{id}   pembuatnya ATAU admin (housekeeping)
 *
 * Sama seperti Kunjungan/Todo milik karyawan: pembuat boleh mengubah &
 * menghapus catatannya sendiri, tanpa alur approval. Nilai uang = rupiah
 * bulat (INT), identik kolom amount pada expenses.
 */

/** Rupiah bulat 0..999.999.999.999 dari input klien. */
function pg_whr_money(mixed $v, string $label): int
{
    if ($v === '' || $v === null) {
        return 0;
    }
    if (!is_numeric($v) || (float) $v < 0) {
        Http::fail($label . ' tidak valid.', 422);
    }
    $n = (int) round((float) $v);
    if ($n > 999999999999) {
        Http::fail($label . ' melebihi batas.', 422);
    }
    return $n;
}

/** Bilangan cacah 0..9.999.999 (qty / koli). */
function pg_whr_count(mixed $v, string $label): int
{
    if ($v === '' || $v === null) {
        return 0;
    }
    if (!is_numeric($v) || (float) $v < 0) {
        Http::fail($label . ' tidak valid.', 422);
    }
    $n = (int) round((float) $v);
    if ($n > 9999999) {
        Http::fail($label . ' melebihi batas.', 422);
    }
    return $n;
}

/** Enum yang BOLEH kosong (NULL) — beda dari Validate::enum() yang mewajibkan isi. */
function pg_whr_opt_enum(mixed $v, array $allowed, string $label): ?string
{
    if ($v === '' || $v === null) {
        return null;
    }
    $v = (string) $v;
    if (!in_array($v, $allowed, true)) {
        Http::fail($label . ' tidak valid.', 422);
    }
    return $v;
}

/**
 * Build the column => value map from a request body.
 * $mode 'create' requires the mandatory fields; 'patch' only touches keys that
 * are present.
 *
 * @return array<string,mixed>
 */
function pg_whr_fields(array $b, string $mode): array
{
    $has = static fn (string $k) => array_key_exists($k, $b);
    $out = [];

    // A draft is a scratchpad — only "Nama Barang" is truly required so far;
    // Supplier / No Resi may still be unknown while the employee is filling
    // it in gradually. "Kirim" (submitted) keeps the full requirement. The
    // client always sends `status` explicitly on every save (create AND
    // patch), so this reads the same whichever mode we're in.
    $isDraft = (string) ($b['status'] ?? 'submitted') === 'draft';

    if ($mode === 'create' || $has('date')) {
        $out['receipt_date'] = Validate::date($b['date'] ?? '', 'Tanggal');
    }
    if ($mode === 'create' || $has('itemName')) {
        $out['item_name'] = Validate::str($b['itemName'] ?? '', 'Nama barang', 1, 180);
    }
    if ($mode === 'create' || $has('supplier')) {
        $out['supplier'] = $isDraft
            ? (string) (Validate::optStr($b['supplier'] ?? null, 160) ?? '')
            : Validate::str($b['supplier'] ?? '', 'Supplier', 1, 160);
    }
    if ($mode === 'create' || $has('resiNo')) {
        $out['resi_no'] = $isDraft
            ? (string) (Validate::optStr($b['resiNo'] ?? null, 120) ?? '')
            : Validate::str($b['resiNo'] ?? '', 'No resi', 1, 120);
    }
    if ($mode === 'create' || $has('qty')) {
        $out['qty'] = pg_whr_count($b['qty'] ?? 0, 'Pcs');
    }
    if ($mode === 'create' || $has('unitPrice')) {
        $out['unit_price'] = pg_whr_money($b['unitPrice'] ?? 0, 'Harga');
    }
    if ($mode === 'create' || $has('shippingCost')) {
        $out['shipping_cost'] = pg_whr_money($b['shippingCost'] ?? 0, 'Ongkir');
    }
    if ($mode === 'create' || $has('koli')) {
        $out['koli'] = pg_whr_count($b['koli'] ?? 0, 'Koli (Karung)');
    }
    if ($mode === 'create' || $has('payment')) {
        $out['payment'] = (string) (Validate::optStr($b['payment'] ?? null, 120) ?? '');
    }
    if ($mode === 'create' || $has('shipping')) {
        $out['shipping'] = (string) (Validate::optStr($b['shipping'] ?? null, 120) ?? '');
    }
    if ($mode === 'create' || $has('note')) {
        $out['note'] = Validate::optStr($b['note'] ?? null, 1000);
    }
    if ($mode === 'create' || $has('receivedDate')) {
        $rd = $b['receivedDate'] ?? null;
        $out['received_date'] = ($rd === '' || $rd === null) ? null : Validate::date($rd, 'Tanggal diterima');
    }
    if ($mode === 'create' || $has('goodsStatus')) {
        $out['goods_status'] = pg_whr_opt_enum($b['goodsStatus'] ?? null, ['klop', 'minus'], 'Kondisi barang');
    }
    if ($mode === 'create' || $has('paymentStatus')) {
        $ps = (string) ($b['paymentStatus'] ?? 'belum_lunas');
        $out['payment_status'] = Validate::enum($ps !== '' ? $ps : 'belum_lunas', ['lunas', 'belum_lunas'], 'Status pembayaran');
    }
    if ($mode === 'create' || $has('dueDate')) {
        $dd = $b['dueDate'] ?? null;
        $out['due_date'] = ($dd === '' || $dd === null) ? null : Validate::date($dd, 'Tanggal jatuh tempo');
    }
    if ($mode === 'create' || $has('status')) {
        $st = (string) ($b['status'] ?? 'submitted');
        $out['status'] = Validate::enum($st !== '' ? $st : 'submitted', ['draft', 'submitted'], 'Status catatan');
    }

    // total_price: pakai kiriman klien bila ada & valid, jika tidak hitung
    // qty * unit_price dari nilai efektif setelah patch.
    $touchesTotal = $mode === 'create' || $has('totalPrice') || $has('qty') || $has('unitPrice');
    if ($touchesTotal) {
        if (array_key_exists('totalPrice', $b) && $b['totalPrice'] !== '' && $b['totalPrice'] !== null) {
            $out['total_price'] = pg_whr_money($b['totalPrice'], 'Total harga');
        }
    }

    return $out;
}

pg_route('GET', '/warehouse-receipts', function (): void {
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Belum login.', 401);
    }
    $isAdmin = ($p['kind'] ?? '') === 'admin';
    // Admin only ever sees SUBMITTED receipts (a draft is an employee's own
    // unfinished scratchpad); the owner sees their own drafts too, since this
    // is also how the Resi Gudang page loads its own records to resume one.
    $where = $isAdmin ? "WHERE w.status = 'submitted'" : 'WHERE w.user_id = ' . (int) $p['id'];
    $rows = array_map('fmt_warehouse_receipt', Db::all(
        "SELECT w.*, u.full_name AS user_name
           FROM warehouse_receipts w
           JOIN users u ON u.id = w.user_id
         $where
         ORDER BY w.receipt_date DESC, w.id DESC"
    ));
    Http::json(['ok' => true, 'items' => $rows]);
});

/**
 * "Laporan Resi" — a read-only User App view of EVERY staff's warehouse
 * receipts (the User-side mirror of the Admin "Laporan Resi Gudang"). Sibling
 * of "Hasil Kunjungan" / "Hasil KPI": any signed-in employee may call it; page
 * visibility is narrowed per division via Feature Access key `laporan_resi`
 * (UI-only gate). The plain GET /api/warehouse-receipts above still scopes a
 * user to their OWN rows, so this endpoint exists to return the whole set.
 */
pg_route('GET', '/warehouse-receipts-all', function (): void {
    Guard::user();

    $rows = Db::all(
        "SELECT w.*, u.full_name AS user_name,
                d.name AS division_name,
                (SELECT GROUP_CONCAT(dd.name ORDER BY dd.name SEPARATOR ', ')
                   FROM user_divisions ud JOIN divisions dd ON dd.id = ud.division_id
                  WHERE ud.user_id = w.user_id) AS division_names,
                (SELECT GROUP_CONCAT(ud.division_id)
                   FROM user_divisions ud
                  WHERE ud.user_id = w.user_id) AS division_ids
           FROM warehouse_receipts w
           JOIN users u ON u.id = w.user_id
           LEFT JOIN divisions d ON d.id = u.division_id
          WHERE w.status = 'submitted'
          ORDER BY w.receipt_date DESC, w.id DESC
          LIMIT 1000"
    );
    $items = array_map('fmt_warehouse_receipt', $rows);

    $totalValue = 0;
    $totalShip  = 0;
    $totalQty   = 0;
    $totalKoli  = 0;
    $received   = 0;
    $staffSeen  = [];
    foreach ($items as $it) {
        $totalValue += $it['totalPrice'];
        $totalShip  += $it['shippingCost'];
        $totalQty   += $it['qty'];
        $totalKoli  += $it['koli'];
        if ($it['receivedDate']) {
            $received++;
        }
        $staffSeen[$it['userId']] = true;
    }

    Http::json([
        'ok'        => true,
        'items'     => $items,
        'divisions' => array_map('fmt_division', Db::all("SELECT * FROM divisions ORDER BY name")),
        'summary'   => [
            'count'       => count($items),
            'totalValue'  => $totalValue,
            'totalShip'   => $totalShip,
            'totalQty'    => $totalQty,
            'totalKoli'   => $totalKoli,
            'received'    => $received,
            'pending'     => count($items) - $received,
            'staffCount'  => count($staffSeen),
        ],
    ]);
});

pg_route('POST', '/warehouse-receipts', function (): void {
    $u = Guard::user();
    $b = Http::body();

    $fields = pg_whr_fields($b, 'create');
    if (!isset($fields['total_price'])) {
        $fields['total_price'] = min(999999999999, $fields['qty'] * $fields['unit_price']);
    }

    $fields['user_id'] = (int) $u['id'];
    if (!isset($fields['status'])) {
        $fields['status'] = 'submitted';
    }
    $cols = array_keys($fields);
    $ph   = implode(', ', array_fill(0, count($cols), '?'));
    Db::run(
        'INSERT INTO warehouse_receipts (`' . implode('`, `', $cols) . '`) VALUES (' . $ph . ')',
        array_values($fields)
    );
    $id  = (int) Db::lastId();
    $row = Db::one("SELECT w.*, u.full_name AS user_name FROM warehouse_receipts w JOIN users u ON u.id = w.user_id WHERE w.id = ?", [$id]);

    pg_whs_ensure((string) $fields['supplier'], (int) $u['id']);

    // A draft is not a report yet — admin only hears about it once submitted.
    if ($fields['status'] === 'submitted') {
        Notify::toAllAdmins(
            'warehouse.submitted',
            'Resi gudang baru',
            Notify::userName((int) $u['id']) . ' mencatat penerimaan "' . $fields['item_name'] . '" dari ' . $fields['supplier']
                . ' (' . $fields['qty'] . ' pcs).',
            '/laporan-resi-gudang',
            (int) $u['id']
        );
    }

    Http::json(['ok' => true, 'record' => fmt_warehouse_receipt($row)]);
});

pg_route('PATCH', '/warehouse-receipts/{id}', function (array $p): void {
    $u   = Guard::user();
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM warehouse_receipts WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Data resi gudang tidak ditemukan.'], 200);
    }
    if ((int) $row['user_id'] !== (int) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Anda hanya bisa mengubah catatan yang Anda buat sendiri.'], 200);
    }

    $b      = Http::body();
    $fields = pg_whr_fields($b, 'patch');
    if (!$fields) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }

    // Jaga konsistensi total bila qty / harga / total ikut berubah.
    if (!array_key_exists('total_price', $fields)
        && (array_key_exists('qty', $fields) || array_key_exists('unit_price', $fields))) {
        $qty   = $fields['qty']        ?? (int) $row['qty'];
        $price = $fields['unit_price'] ?? (int) $row['unit_price'];
        $fields['total_price'] = min(999999999999, $qty * $price);
    }

    $wasDraft = ($row['status'] ?? 'submitted') === 'draft';

    $set  = [];
    $args = [];
    foreach ($fields as $col => $val) {
        $set[]  = "`$col` = ?";
        $args[] = $val;
    }
    $args[] = $id;
    Db::run("UPDATE warehouse_receipts SET " . implode(', ', $set) . " WHERE id = ?", $args);

    if (array_key_exists('supplier', $fields)) {
        pg_whs_ensure((string) $fields['supplier'], (int) $u['id']);
    }

    // Only "Kirim" (draft -> submitted, the moment it becomes a real report)
    // notifies admin — a routine edit of an already-submitted receipt, or a
    // draft staying a draft, must not spam a new notification each time.
    if ($wasDraft && ($fields['status'] ?? null) === 'submitted') {
        Notify::toAllAdmins(
            'warehouse.submitted',
            'Resi gudang baru',
            Notify::userName((int) $u['id']) . ' mencatat penerimaan "' . ($fields['item_name'] ?? $row['item_name'])
                . '" dari ' . ($fields['supplier'] ?? $row['supplier']) . '.',
            '/laporan-resi-gudang',
            (int) $u['id']
        );
    }

    $out = Db::one("SELECT w.*, u.full_name AS user_name FROM warehouse_receipts w JOIN users u ON u.id = w.user_id WHERE w.id = ?", [$id]);
    Http::json(['ok' => true, 'record' => fmt_warehouse_receipt($out)]);
});

pg_route('DELETE', '/warehouse-receipts/{id}', function (array $p): void {
    $principal = Auth::principal();
    if (!$principal) {
        Http::fail('Belum login.', 401);
    }
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM warehouse_receipts WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Data resi gudang tidak ditemukan.'], 200);
    }
    $isAdmin = ($principal['kind'] ?? '') === 'admin';
    $isOwner = ($principal['kind'] ?? '') === 'user' && (int) $principal['id'] === (int) $row['user_id'];
    if (!$isAdmin && !$isOwner) {
        Http::json(['ok' => false, 'error' => 'Anda tidak berhak menghapus catatan ini.'], 200);
    }
    Db::run("DELETE FROM warehouse_receipts WHERE id = ?", [$id]);
    Http::json(['ok' => true]);
});
