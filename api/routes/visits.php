<?php
declare(strict_types=1);

/**
 * Laporan Kunjungan (Visit Reports).
 *
 *   Employee (User App — /kunjungan)
 *     GET    /api/my-visits                     own reports (list, incl. drafts)
 *     POST   /api/my-visits                     create (as DRAFT) OR update ({visitId?})
 *     POST   /api/my-visits/{id}/attachments    multipart  file=<upload>   (append)
 *     POST   /api/my-visits/{id}/submit         "Kirim" — draft -> submitted
 *     DELETE /api/my-visits/{id}                "Batal" — delete an UNSENT draft only
 *     (a report that was already sent can only be removed by an admin)
 *
 *   Admin (Admin Panel — /laporan-kunjungan)
 *     GET    /api/visits                        every report + filters + summary
 *     POST   /api/visits/{id}/review            toggle submitted <-> reviewed
 *     DELETE /api/visits/{id}                   hard delete (+ files)
 *
 *   Shared
 *     GET    /api/visits/{id}                   one report + attachments (owner OR admin)
 *     DELETE /api/visit-attachments/{id}        uploader OR admin
 *     GET    /api/visit-file?id=..&download=1   stream one attachment (owner OR admin)
 */

const PG_VISIT_MAX_ATTACH = 20;

function pg_visit_photo_cap(): int
{
    return max(262144, Env::int('VISIT_MAX_BYTES', 12582912)); // 12 MB per photo
}

/** One visit row with joins + its attachments, or null. */
function pg_visit_full(int $id): ?array
{
    $r = Db::one(
        "SELECT v.*, u.full_name AS user_name, u.division_id,
                d.name AS division_name,
                (SELECT GROUP_CONCAT(dd.name ORDER BY dd.name SEPARATOR ', ')
                   FROM user_divisions ud JOIN divisions dd ON dd.id = ud.division_id
                  WHERE ud.user_id = v.user_id) AS division_names,
                s.name AS store_live_name,
                adm.name AS reviewed_by_name
           FROM visits v
           JOIN users u ON u.id = v.user_id
           LEFT JOIN divisions d ON d.id = u.division_id
           LEFT JOIN stores s ON s.id = v.store_id
           LEFT JOIN admins adm ON adm.id = v.reviewed_by_admin_id
          WHERE v.id = ?",
        [$id]
    );
    if (!$r) {
        return null;
    }
    $atts = Db::all(
        "SELECT a.*, ci.label AS checklist_item_label
           FROM visit_attachments a
           LEFT JOIN visit_checklist_items ci ON ci.id = a.checklist_item_id
          WHERE a.visit_id = ?
          ORDER BY a.id",
        [$id]
    );
    $checked = array_map(
        fn($a) => id_str($a['item_id']),
        Db::all("SELECT item_id FROM visit_checklist_answers WHERE visit_id = ?", [$id])
    );
    return [
        'visit'            => fmt_visit($r),
        'attachments'      => array_map('fmt_visit_attachment', $atts),
        'checklistAnswers' => $checked,
    ];
}

/** Full-replace the set of checked checklist items for a visit (like KPI's
 *  report_values save) — simpler than diffing, and this list is short. */
function pg_visit_save_checklist(int $visitId, array $checkedItemIds): void
{
    Db::run("DELETE FROM visit_checklist_answers WHERE visit_id = ?", [$visitId]);
    foreach ($checkedItemIds as $itemId) {
        $itemId = (int) $itemId;
        if ($itemId <= 0) {
            continue;
        }
        try {
            Db::run("INSERT INTO visit_checklist_answers (visit_id, item_id) VALUES (?, ?)", [$visitId, $itemId]);
        } catch (\Throwable $e) {
            // stale/invalid item id (deleted, or belongs to another division) — skip it
        }
    }
}

/* ============================================================
   EMPLOYEE
   ============================================================ */

pg_route('GET', '/my-visits', function (): void {
    $u = Guard::user();
    $rows = Db::all(
        "SELECT v.*, s.name AS store_live_name,
                (SELECT COUNT(*) FROM visit_attachments a WHERE a.visit_id = v.id) AS attachment_count
           FROM visits v
           LEFT JOIN stores s ON s.id = v.store_id
          WHERE v.user_id = ?
          ORDER BY v.visit_date DESC, v.id DESC",
        [$u['id']]
    );
    Http::json(['ok' => true, 'reports' => array_map('fmt_visit', $rows)]);
});

pg_route('POST', '/my-visits', function (): void {
    $u = Guard::user();
    $b = Http::body();

    $agenda    = Validate::str($b['agenda'] ?? '', 'Agenda kunjungan', 1, 200);
    $visitDate = Validate::date($b['visitDate'] ?? '', 'Tanggal kunjungan');
    $note      = Validate::optStr($b['note'] ?? null, 5000);

    // Store: resolve against the managed list. A store is optional only as a
    // graceful fallback when there is genuinely no store data yet.
    $storeId   = null;
    $storeName = trim((string) ($b['storeName'] ?? ''));
    if (!empty($b['storeId'])) {
        $s = Db::one("SELECT id, name FROM stores WHERE id = ?", [(int) $b['storeId']]);
        if (!$s) {
            Http::json(['ok' => false, 'error' => 'Toko yang dipilih tidak ditemukan.'], 200);
        }
        $storeId   = (int) $s['id'];
        $storeName = $s['name'];
    }
    if ($storeName === '') {
        Http::json(['ok' => false, 'error' => 'Pilih toko yang dikunjungi.'], 200);
    }
    $storeName = mb_substr($storeName, 0, 120);

    $rid = (int) ($b['visitId'] ?? $b['reportId'] ?? 0);
    if ($rid > 0) {
        $cur = Db::one("SELECT * FROM visits WHERE id = ?", [$rid]);
        if (!$cur || (string) $cur['user_id'] !== (string) $u['id']) {
            Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
        }
        if ($cur['status'] === 'reviewed') {
            Http::json(['ok' => false, 'error' => 'Laporan sudah direview admin dan terkunci.'], 200);
        }
        Db::run(
            "UPDATE visits SET store_id = ?, store_name = ?, agenda = ?, visit_date = ?, note = ? WHERE id = ?",
            [$storeId, $storeName, $agenda, $visitDate, $note, $rid]
        );
        $id = $rid;
    } else {
        // A brand-new report starts as a DRAFT: it is NOT sent to the Admin
        // panel until the employee taps "Kirim" (POST /my-visits/{id}/submit).
        Db::run(
            "INSERT INTO visits (user_id, store_id, store_name, agenda, visit_date, note, status)
             VALUES (?, ?, ?, ?, ?, ?, 'draft')",
            [$u['id'], $storeId, $storeName, $agenda, $visitDate, $note]
        );
        $id = (int) Db::lastId();
    }

    if (array_key_exists('checklist', $b)) {
        pg_visit_save_checklist($id, (array) $b['checklist']);
    }

    $full = pg_visit_full($id);
    Http::json(['ok' => true, 'record' => $full['visit'], 'data' => $full]);
});

/* Finalise a draft — "Kirim". Flips draft -> submitted so it appears in the
   Admin panel. Idempotent for an already-submitted report; blocked once
   reviewed. Owner only. */
pg_route('POST', '/my-visits/{id}/submit', function (array $p): void {
    $u  = Guard::user();
    $id = (int) $p['id'];
    $v  = Db::one("SELECT * FROM visits WHERE id = ?", [$id]);
    if (!$v || (string) $v['user_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    if ($v['status'] === 'reviewed') {
        Http::json(['ok' => false, 'error' => 'Laporan sudah direview admin dan terkunci.'], 200);
    }
    if ($v['status'] === 'draft') {
        Db::run("UPDATE visits SET status = 'submitted' WHERE id = ?", [$id]);
        Notify::toAllAdmins('visit.submitted',
            'Laporan kunjungan baru',
            Notify::userName((int) $u['id']) . ' mengirim laporan kunjungan'
                . (!empty($v['store_name']) ? ' ke ' . $v['store_name'] : '') . '.',
            '/laporan-kunjungan', (int) $u['id']);
    }
    $full = pg_visit_full($id);
    Http::json(['ok' => true, 'record' => $full['visit'], 'data' => $full]);
});

/* Cancel an UNSENT report — "Batal". Deletes the draft row + its photo files.
   Strictly draft-only: a report that was already sent (submitted/reviewed)
   can never be deleted by an employee — only an admin removes those
   (DELETE /api/visits/{id} + POST /api/visits/purge-stale). */
pg_route('DELETE', '/my-visits/{id}', function (array $p): void {
    $u  = Guard::user();
    $id = (int) $p['id'];
    $v  = Db::one("SELECT * FROM visits WHERE id = ?", [$id]);
    if (!$v || (string) $v['user_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    if ($v['status'] !== 'draft') {
        Http::json(['ok' => false, 'error' => 'Laporan yang sudah dikirim tidak dapat dibatalkan.'], 200);
    }
    foreach (Db::all("SELECT file_path FROM visit_attachments WHERE visit_id = ?", [$id]) as $a) {
        if (!empty($a['file_path'])) {
            Storage::remove($a['file_path']);
        }
    }
    Db::exec("DELETE FROM visits WHERE id = ?", [$id]); // visit_attachments cascade
    Http::json(['ok' => true]);
});

pg_route('POST', '/my-visits/{id}/attachments', function (array $p): void {
    $u  = Guard::user();
    $id = (int) $p['id'];
    $v  = Db::one("SELECT * FROM visits WHERE id = ?", [$id]);
    if (!$v || (string) $v['user_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    if ($v['status'] === 'reviewed') {
        Http::json(['ok' => false, 'error' => 'Laporan sudah direview admin dan terkunci.'], 200);
    }
    $count = (int) (Db::one("SELECT COUNT(*) c FROM visit_attachments WHERE visit_id = ?", [$id])['c'] ?? 0);
    if ($count >= PG_VISIT_MAX_ATTACH) {
        Http::json(['ok' => false, 'error' => 'Lampiran untuk satu laporan maksimal ' . PG_VISIT_MAX_ATTACH . '.'], 200);
    }
    if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
        Http::json(['ok' => false, 'error' => 'Tidak ada file yang dipilih.'], 200);
    }
    $saved = Storage::saveUpload($_FILES['file'], 'visit', pg_visit_photo_cap());
    if ($saved['kind'] !== 'image') {
        Storage::remove($saved['path']);
        Http::json(['ok' => false, 'error' => 'Lampiran kunjungan hanya boleh berupa foto (JPG, PNG, atau WebP).'], 200);
    }
    // Optional: tag this photo as evidence for one checklist item (multipart
    // form field, alongside the file — see PG.store.visitUploadAttachment).
    $checklistItemId = null;
    if (!empty($_POST['checklistItemId'])) {
        $ci = Db::one("SELECT id FROM visit_checklist_items WHERE id = ?", [(int) $_POST['checklistItemId']]);
        if ($ci) {
            $checklistItemId = (int) $ci['id'];
        }
    }
    Db::run(
        "INSERT INTO visit_attachments (visit_id, checklist_item_id, user_id, kind, file_path, original_name, mime, size_bytes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        [$id, $checklistItemId, $u['id'], $saved['kind'], $saved['path'], $saved['name'], $saved['mime'], $saved['size']]
    );
    $row = Db::one("SELECT * FROM visit_attachments WHERE id = ?", [(int) Db::lastId()]);
    Http::json(['ok' => true, 'record' => fmt_visit_attachment($row)]);
});

/* ============================================================
   ADMIN
   ============================================================ */

/** Cutoff date: a visit is "stale" (>= 1 week old) when visit_date is before this. */
function pg_visit_stale_cutoff(): string
{
    return date('Y-m-d', strtotime('-7 days'));
}

pg_route('GET', '/visits', function (): void {
    Guard::can('visit.report.view');

    $staleCutoff = pg_visit_stale_cutoff();

    // Admin never sees employee drafts — only reports that were actually sent.
    $where  = ["v.status <> 'draft'"];
    $params = [];

    if ((string) (Http::query('staleOnly') ?? '') === '1') {
        $where[] = 'v.visit_date < ?';
        $params[] = $staleCutoff;
    }

    $divisionId = pg_resolve_fk(Http::query('divisionId'), 'divisions', 'Divisi');
    if ($divisionId) {
        // Match if the visitor belongs to this division — primary OR any of
        // their divisions (a karyawan can be in several).
        $where[]  = '(u.division_id = ? OR EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = v.user_id AND ud.division_id = ?))';
        $params[] = $divisionId;
        $params[] = $divisionId;
    }

    $storeId = (int) (Http::query('storeId') ?? 0);
    if ($storeId) { $where[] = 'v.store_id = ?'; $params[] = $storeId; }

    $userId = (int) (Http::query('userId') ?? 0);
    if ($userId) { $where[] = 'v.user_id = ?'; $params[] = $userId; }

    $status = (string) (Http::query('status') ?? '');
    if (in_array($status, ['submitted', 'reviewed'], true)) { $where[] = 'v.status = ?'; $params[] = $status; }

    $from = (string) (Http::query('from') ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $from)) { $where[] = 'v.visit_date >= ?'; $params[] = $from; }
    $to = (string) (Http::query('to') ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $to)) { $where[] = 'v.visit_date <= ?'; $params[] = $to; }

    $wsql = implode(' AND ', $where);

    $rows = Db::all(
        "SELECT v.*, u.full_name AS user_name, u.division_id, d.name AS division_name,
                (SELECT GROUP_CONCAT(dd.name ORDER BY dd.name SEPARATOR ', ')
                   FROM user_divisions ud JOIN divisions dd ON dd.id = ud.division_id
                  WHERE ud.user_id = v.user_id) AS division_names,
                s.name AS store_live_name,
                (SELECT COUNT(*) FROM visit_attachments a WHERE a.visit_id = v.id) AS attachment_count
           FROM visits v
           JOIN users u ON u.id = v.user_id
           LEFT JOIN divisions d ON d.id = u.division_id
           LEFT JOIN stores s ON s.id = v.store_id
          WHERE $wsql
          ORDER BY v.visit_date DESC, v.id DESC
          LIMIT 400",
        $params
    );
    $out = array_map('fmt_visit', $rows);

    $reviewed = count(array_filter($out, fn($r) => $r['status'] === 'reviewed'));
    $storesVisited = count(array_unique(array_filter(array_map(
        fn($r) => $r['storeName'] !== '' ? $r['storeName'] : null,
        $out
    ))));

    // Stale = visits older than 1 week — counted GLOBALLY (ignores the active
    // filters) so the "bersihkan laporan lama" warning always shows the truth.
    $stale = Db::one(
        "SELECT COUNT(*) AS c,
                MIN(v.visit_date) AS oldest,
                (SELECT COUNT(*) FROM visit_attachments a JOIN visits v2 ON v2.id = a.visit_id
                  WHERE v2.visit_date < ? AND v2.status <> 'draft') AS photos
           FROM visits v WHERE v.visit_date < ? AND v.status <> 'draft'",
        [$staleCutoff, $staleCutoff]
    ) ?: [];

    Http::json([
        'ok'      => true,
        'reports' => $out,
        'summary' => [
            'total'         => count($out),
            'reviewed'      => $reviewed,
            'pending'       => count($out) - $reviewed,
            'storesVisited' => $storesVisited,
            'staleBefore'   => $staleCutoff,
            'staleCount'    => (int) ($stale['c'] ?? 0),
            'stalePhotos'   => (int) ($stale['photos'] ?? 0),
            'staleOldest'   => $stale['oldest'] ?? null,
        ],
        'stores'    => array_map('fmt_store', Db::all("SELECT * FROM stores ORDER BY name")),
        'divisions' => array_map('fmt_division', Db::all("SELECT * FROM divisions ORDER BY name")),
        'users'     => array_map(
            fn($r) => ['id' => id_str($r['id']), 'fullName' => $r['full_name']],
            Db::all("SELECT id, full_name FROM users WHERE deleted_at IS NULL ORDER BY full_name")
        ),
    ]);
});

/**
 * Kumpulan foto kunjungan.
 *   GET /api/visit-photos                -> daftar toko + jumlah foto + cover
 *   GET /api/visit-photos?store=<nama>   -> semua foto satu toko (+ konteks laporan)
 */
pg_route('GET', '/visit-photos', function (): void {
    Guard::can('visit.report.view');
    $store = trim((string) (Http::query('store') ?? ''));

    if ($store !== '') {
        $noStore = ($store === 'Tanpa Toko');
        $where = ($noStore ? "(v.store_name IS NULL OR v.store_name = '')" : "v.store_name = ?")
               . " AND v.status <> 'draft'";
        $args  = $noStore ? [] : [$store];
        $rows = Db::all(
            "SELECT a.id, a.original_name, a.size_bytes, a.created_at,
                    v.id AS visit_id, v.agenda, v.visit_date, v.status,
                    u.full_name AS user_name
               FROM visit_attachments a
               JOIN visits v ON v.id = a.visit_id
               JOIN users u ON u.id = v.user_id
              WHERE $where
              ORDER BY a.id DESC
              LIMIT 500",
            $args
        );
        Http::json([
            'ok'        => true,
            'storeName' => $store,
            'photos'    => array_map(function ($r) {
                $id = (int) $r['id'];
                return [
                    'id'          => id_str($r['id']),
                    'name'        => $r['original_name'],
                    'sizeBytes'   => $r['size_bytes'] !== null ? (int) $r['size_bytes'] : null,
                    'fileUrl'     => 'api/visit-file?id=' . $id,
                    'downloadUrl' => 'api/visit-file?id=' . $id . '&download=1',
                    'createdAt'   => dt($r['created_at']),
                    'visitId'     => id_str($r['visit_id']),
                    'agenda'      => $r['agenda'],
                    'visitDate'   => $r['visit_date'],
                    'status'      => $r['status'],
                    'userName'    => $r['user_name'],
                ];
            }, $rows),
        ]);
    }

    $rows = Db::all(
        "SELECT COALESCE(NULLIF(v.store_name, ''), 'Tanpa Toko') AS store_name,
                COUNT(DISTINCT v.id) AS visit_count,
                COUNT(a.id) AS photo_count,
                MAX(a.id) AS cover_id,
                MAX(a.created_at) AS last_at
           FROM visits v
           JOIN visit_attachments a ON a.visit_id = v.id
          WHERE v.status <> 'draft'
          GROUP BY store_name
          ORDER BY photo_count DESC, store_name"
    );
    Http::json([
        'ok'          => true,
        'totalPhotos' => (int) (Db::one(
            "SELECT COUNT(*) c FROM visit_attachments a JOIN visits v ON v.id = a.visit_id WHERE v.status <> 'draft'"
        )['c'] ?? 0),
        'stores'      => array_map(fn($r) => [
            'storeName'  => $r['store_name'],
            'visitCount' => (int) $r['visit_count'],
            'photoCount' => (int) $r['photo_count'],
            'coverUrl'   => $r['cover_id'] ? ('api/visit-file?id=' . (int) $r['cover_id']) : null,
            'lastAt'     => dt($r['last_at']),
        ], $rows),
    ]);
});

pg_route('POST', '/visits/{id}/review', function (array $p): void {
    $adm = Guard::can('visit.report.view');
    $id  = (int) $p['id'];
    $v   = Db::one("SELECT * FROM visits WHERE id = ?", [$id]);
    if (!$v) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    if ($v['status'] === 'reviewed') {
        Db::run("UPDATE visits SET status = 'submitted', reviewed_by_admin_id = NULL, reviewed_at = NULL WHERE id = ?", [$id]);
    } else {
        Db::run("UPDATE visits SET status = 'reviewed', reviewed_by_admin_id = ?, reviewed_at = NOW() WHERE id = ?", [$adm['id'], $id]);
        Notify::toUser((int) $v['user_id'], 'visit.reviewed',
            'Laporan kunjungan ditinjau admin',
            'Laporan kunjungan Anda' . ($v['agenda'] !== '' ? ' — ' . mb_substr((string) $v['agenda'], 0, 100) : '') . ' sudah ditinjau admin.',
            '/kunjungan');
    }
    Http::json(['ok' => true, 'data' => pg_visit_full($id)]);
});

pg_route('DELETE', '/visits/{id}', function (array $p): void {
    Guard::can('visit.report.view');
    $id = (int) $p['id'];
    $v  = Db::one("SELECT id FROM visits WHERE id = ?", [$id]);
    if (!$v) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    foreach (Db::all("SELECT file_path FROM visit_attachments WHERE visit_id = ?", [$id]) as $a) {
        Storage::remove($a['file_path'] ?? null);
    }
    Db::run("DELETE FROM visits WHERE id = ?", [$id]);
    Http::json(['ok' => true]);
});

/**
 * POST /api/visits/purge-stale   { before?: "YYYY-MM-DD" }
 * Hapus permanen SEMUA laporan kunjungan yang visit_date-nya sebelum `before`
 * (default: 1 minggu lalu) beserta seluruh file fotonya. Admin only.
 * Pengaman: `before` tidak pernah boleh lebih baru dari 1 minggu lalu.
 */
pg_route('POST', '/visits/purge-stale', function (): void {
    Guard::can('visit.report.view');

    $maxBefore = pg_visit_stale_cutoff();
    $before = (string) (Http::body()['before'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $before) || $before > $maxBefore) {
        $before = $maxBefore;
    }

    $ids = array_map(fn($r) => (int) $r['id'], Db::all("SELECT id FROM visits WHERE visit_date < ?", [$before]));
    if (!$ids) {
        Http::json(['ok' => true, 'removed' => 0, 'photosRemoved' => 0, 'before' => $before]);
    }

    $ph      = implode(',', array_fill(0, count($ids), '?'));
    $files   = Db::all("SELECT file_path FROM visit_attachments WHERE visit_id IN ($ph)", $ids);
    $removedFiles = 0;
    foreach ($files as $f) {
        if (!empty($f['file_path'])) { Storage::remove($f['file_path']); $removedFiles++; }
    }
    Db::run("DELETE FROM visits WHERE id IN ($ph)", $ids); // visit_attachments cascade

    Http::json([
        'ok'            => true,
        'removed'       => count($ids),
        'photosRemoved' => $removedFiles,
        'before'        => $before,
    ]);
});

/* ============================================================
   SHARED
   ============================================================ */

pg_route('GET', '/visits/{id}', function (array $p): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    $id   = (int) $p['id'];
    $full = pg_visit_full($id);
    if (!$full) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $full['visit']['userId'];
    if (!$isOwner) {
        Guard::can('visit.report.view');
    }
    Http::json(['ok' => true, 'visit' => $full['visit'], 'attachments' => $full['attachments'], 'checklistAnswers' => $full['checklistAnswers']]);
});

pg_route('DELETE', '/visit-attachments/{id}', function (array $p): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM visit_attachments WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Lampiran tidak ditemukan.'], 200);
    }
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $row['user_id'];
    if (!$isOwner && $pr['kind'] !== 'admin') {
        Http::json(['ok' => false, 'error' => 'Anda tidak berhak menghapus lampiran ini.'], 200);
    }
    if ($isOwner) {
        $v = Db::one("SELECT status FROM visits WHERE id = ?", [(int) $row['visit_id']]);
        if ($v && $v['status'] === 'reviewed') {
            Http::json(['ok' => false, 'error' => 'Laporan sudah direview admin dan terkunci.'], 200);
        }
    }
    Db::run("DELETE FROM visit_attachments WHERE id = ?", [$id]);
    Storage::remove($row['file_path'] ?? null);
    Http::json(['ok' => true]);
});

pg_route('GET', '/visit-file', function (): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login untuk melihat file.', 401);
    }
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT * FROM visit_attachments WHERE id = ?", [$id]);
    if (!$row) {
        Http::fail('File tidak ditemukan.', 404);
    }
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $row['user_id'];
    if (!$isOwner && $pr['kind'] !== 'admin') {
        Http::fail('Anda tidak berhak mengakses file ini.', 403);
    }
    $download = (Http::query('download') ?? '0') === '1';
    Storage::serveFile($row['file_path'], (string) $row['mime'], (string) $row['original_name'], $download);
});
