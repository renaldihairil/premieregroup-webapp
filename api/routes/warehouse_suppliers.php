<?php
declare(strict_types=1);

/**
 * Data Supplier — a SHARED master list of supplier names (not per-employee),
 * used as the dropdown source in the "Catat Resi Gudang" form. It is purely a
 * picklist: `warehouse_receipts.supplier` stays a plain text column (no FK),
 * so deleting/renaming a supplier here never touches past resi records.
 *
 * Reached from the Resi Gudang page header ("Input Supplier"); managed by
 * any signed-in employee (it's shared company data, same spirit as Toko).
 *
 *   GET    /api/warehouse-suppliers        list (bootstrap also carries it)
 *   POST   /api/warehouse-suppliers        { name }
 *   PATCH  /api/warehouse-suppliers/{id}   { name }
 *   DELETE /api/warehouse-suppliers/{id}
 *
 * pg_whs_ensure() is the auto-register hook: warehouse_receipts.php calls it
 * on every create/update so a genuinely new supplier name typed into the resi
 * form (via its dropdown's "+ Tambah Supplier Baru") is immediately part of
 * this shared list for every other employee, no separate step needed.
 */

/** Idempotent, case-insensitive "register this supplier name if new". */
function pg_whs_ensure(string $name, ?int $userId): void
{
    $name = trim($name);
    if ($name === '') {
        return;
    }
    // INSERT IGNORE + the UNIQUE key on `name` (ci collation) makes this safe
    // even if two employees register the same new supplier at the same time.
    Db::run(
        "INSERT IGNORE INTO warehouse_suppliers (name, created_by_user_id) VALUES (?, ?)",
        [$name, $userId]
    );
}

pg_route('GET', '/warehouse-suppliers', function (): void {
    if (!Auth::principal()) {
        Http::fail('Belum login.', 401);
    }
    $rows = Db::all("SELECT * FROM warehouse_suppliers ORDER BY name ASC");
    Http::json(['ok' => true, 'items' => array_map('fmt_warehouse_supplier', $rows)]);
});

pg_route('POST', '/warehouse-suppliers', function (): void {
    $u    = Guard::user();
    $b    = Http::body();
    $name = Validate::str($b['name'] ?? '', 'Nama supplier', 1, 160);

    $dupe = Db::one("SELECT id FROM warehouse_suppliers WHERE LOWER(name) = LOWER(?)", [$name]);
    if ($dupe) {
        Http::json(['ok' => false, 'error' => 'Supplier dengan nama itu sudah ada.'], 200);
    }
    Db::run("INSERT INTO warehouse_suppliers (name, created_by_user_id) VALUES (?, ?)", [$name, (int) $u['id']]);
    $row = Db::one("SELECT * FROM warehouse_suppliers WHERE id = ?", [(int) Db::lastId()]);
    Http::json(['ok' => true, 'record' => fmt_warehouse_supplier($row)]);
});

pg_route('PATCH', '/warehouse-suppliers/{id}', function (array $p): void {
    Guard::user();
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM warehouse_suppliers WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Supplier tidak ditemukan.'], 200);
    }
    $b    = Http::body();
    $name = Validate::str($b['name'] ?? '', 'Nama supplier', 1, 160);

    $dupe = Db::one("SELECT id FROM warehouse_suppliers WHERE LOWER(name) = LOWER(?) AND id <> ?", [$name, $id]);
    if ($dupe) {
        Http::json(['ok' => false, 'error' => 'Supplier dengan nama itu sudah ada.'], 200);
    }
    Db::run("UPDATE warehouse_suppliers SET name = ? WHERE id = ?", [$name, $id]);
    $out = Db::one("SELECT * FROM warehouse_suppliers WHERE id = ?", [$id]);
    Http::json(['ok' => true, 'record' => fmt_warehouse_supplier($out)]);
});

pg_route('DELETE', '/warehouse-suppliers/{id}', function (array $p): void {
    Guard::user();
    $id = (int) $p['id'];
    // Deleting here only removes it from the picklist going forward — past
    // resi rows keep their `supplier` text untouched (no FK to cascade).
    Db::run("DELETE FROM warehouse_suppliers WHERE id = ?", [$id]);
    Http::json(['ok' => true]);
});
