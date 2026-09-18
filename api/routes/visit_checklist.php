<?php
declare(strict_types=1);

/**
 * Visit checklist — Admin defines, PER DIVISION, a flat list of checklist
 * items an employee must go through during a store visit; each item pairs
 * with its own photo evidence (see visit_attachments.checklist_item_id in
 * api/routes/visits.php). Mirrors the KPI template pattern: a live FK
 * reference, no label snapshot — deleting an item cascades away any
 * historical answers for it (same tradeoff as kpi_template_items).
 *
 *   Admin (Admin Panel — "Atur Checklist" on Laporan Kunjungan)
 *     GET    /api/visit-checklist-items?divisionId=      list for one division
 *     POST   /api/visit-checklist-items                  { divisionId, label }
 *     PATCH  /api/visit-checklist-items/{id}              { label }
 *     DELETE /api/visit-checklist-items/{id}
 *     POST   /api/visit-checklist-items/reorder           { divisionId, orderedIds:[...] }
 *
 *   Employee (User App — Buat Laporan Kunjungan)
 *     GET    /api/my-visit-checklist                      items for MY division(s)
 */

pg_route('GET', '/visit-checklist-items', function (): void {
    Guard::can('visit.settings.edit');
    $divisionId = pg_resolve_fk(Http::query('divisionId'), 'divisions', 'Divisi');
    if (!$divisionId) {
        Http::json(['ok' => true, 'items' => []]);
    }
    $rows = Db::all(
        "SELECT * FROM visit_checklist_items WHERE division_id = ? ORDER BY sort_order, id",
        [$divisionId]
    );
    Http::json(['ok' => true, 'items' => array_map('fmt_visit_checklist_item', $rows)]);
});

pg_route('POST', '/visit-checklist-items', function (): void {
    Guard::can('visit.settings.edit');
    $body = Http::body();
    $divisionId = pg_resolve_fk($body['divisionId'] ?? null, 'divisions', 'Divisi');
    if (!$divisionId) {
        Http::json(['ok' => false, 'error' => 'Pilih divisi terlebih dahulu.'], 200);
    }
    $label = Validate::str($body['label'] ?? '', 'Nama checklist', 1, 200);
    $next = (int) (Db::one(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM visit_checklist_items WHERE division_id = ?",
        [$divisionId]
    )['n'] ?? 1);
    Db::run(
        "INSERT INTO visit_checklist_items (division_id, label, sort_order) VALUES (?, ?, ?)",
        [$divisionId, $label, $next]
    );
    $row = Db::one("SELECT * FROM visit_checklist_items WHERE id = ?", [(int) Db::lastId()]);
    Http::json(['ok' => true, 'record' => fmt_visit_checklist_item($row)]);
});

pg_route('PATCH', '/visit-checklist-items/{id}', function (array $p): void {
    Guard::can('visit.settings.edit');
    $id  = (int) $p['id'];
    $row = Db::one("SELECT id FROM visit_checklist_items WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Item checklist tidak ditemukan.'], 200);
    }
    $label = Validate::str(Http::body()['label'] ?? '', 'Nama checklist', 1, 200);
    Db::run("UPDATE visit_checklist_items SET label = ? WHERE id = ?", [$label, $id]);
    Http::json(['ok' => true, 'record' => fmt_visit_checklist_item(
        Db::one("SELECT * FROM visit_checklist_items WHERE id = ?", [$id])
    )]);
});

pg_route('DELETE', '/visit-checklist-items/{id}', function (array $p): void {
    Guard::can('visit.settings.edit');
    $id  = (int) $p['id'];
    $row = Db::one("SELECT id FROM visit_checklist_items WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Item checklist tidak ditemukan.'], 200);
    }
    // Any photo evidence already tagged to this item (across every past visit)
    // loses its physical file too -- ON DELETE SET NULL on visit_attachments
    // would otherwise leave the row behind pointing at an orphaned file.
    foreach (Db::all("SELECT file_path FROM visit_attachments WHERE checklist_item_id = ?", [$id]) as $a) {
        Storage::remove($a['file_path'] ?? null);
    }
    Db::run("DELETE FROM visit_attachments WHERE checklist_item_id = ?", [$id]);
    Db::run("DELETE FROM visit_checklist_items WHERE id = ?", [$id]); // answers cascade
    Http::json(['ok' => true]);
});

pg_route('POST', '/visit-checklist-items/reorder', function (): void {
    Guard::can('visit.settings.edit');
    $body       = Http::body();
    $divisionId = pg_resolve_fk($body['divisionId'] ?? null, 'divisions', 'Divisi');
    $orderedIds = array_map('intval', (array) ($body['orderedIds'] ?? []));
    if (!$divisionId || !$orderedIds) {
        Http::json(['ok' => false, 'error' => 'Data tidak lengkap.'], 200);
    }
    foreach ($orderedIds as $i => $itemId) {
        Db::run(
            "UPDATE visit_checklist_items SET sort_order = ? WHERE id = ? AND division_id = ?",
            [$i + 1, $itemId, $divisionId]
        );
    }
    $rows = Db::all("SELECT * FROM visit_checklist_items WHERE division_id = ? ORDER BY sort_order, id", [$divisionId]);
    Http::json(['ok' => true, 'items' => array_map('fmt_visit_checklist_item', $rows)]);
});

pg_route('GET', '/my-visit-checklist', function (): void {
    $u   = Guard::user();
    $ids = pg_user_division_ids((int) $u['id']);
    if (!$ids) {
        Http::json(['ok' => true, 'items' => []]);
    }
    $ph   = implode(',', array_fill(0, count($ids), '?'));
    $rows = Db::all(
        "SELECT * FROM visit_checklist_items WHERE division_id IN ($ph) ORDER BY sort_order, id",
        $ids
    );
    Http::json(['ok' => true, 'items' => array_map('fmt_visit_checklist_item', $rows)]);
});
