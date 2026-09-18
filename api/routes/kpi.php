<?php
declare(strict_types=1);

/**
 * KPI — admin-built templates per division, filled in by employees.
 *
 *   Setting KPI (admin)  -> build a KPI form: indicators + sub-indicators + targets
 *   Lapor KPI (employee) -> open the form for a period, enter actuals, submit
 *   Laporan KPI (admin)  -> read every submitted report
 *
 * Templates / items       : admin only (kpi.settings.edit)
 * Reading all reports      : admin (kpi.report.view)
 * my-* endpoints           : the logged-in employee, own data only
 *
 *  GET    /api/kpi/templates                     list (item + report counts)
 *  GET    /api/kpi/templates/{id}                one template + nested items
 *  POST   /api/kpi/templates                     { name, divisionId?, periodType?, scoreMethod?, description?, status? }
 *  PATCH  /api/kpi/templates/{id}                partial meta
 *  DELETE /api/kpi/templates/{id}                (blocked if it has reports)
 *  POST   /api/kpi/templates/{id}/items          { parentId?, label, target?, valueType?, isOptional? }
 *  PATCH  /api/kpi/items/{id}                    partial
 *  DELETE /api/kpi/items/{id}                    (cascade children)
 *  POST   /api/kpi/templates/{id}/reorder        { ids: [itemId, …] }  order within one sibling group
 *
 *  GET    /api/kpi/reports?divisionId=&templateId=&status=               admin — submitted reports + summary
 *  GET    /api/kpi/reports/{id}                                          admin OR the owner — one full report
 *  POST   /api/kpi/reports/{id}/review                                   admin — toggle reviewed
 *
 *  GET    /api/kpi/my-templates                                          employee — active templates for my division
 *  GET    /api/kpi/my-report?templateId=&reportId=                       employee — blank form, or an existing report to edit
 *  POST   /api/kpi/my-report   { templateId, reportId?, subject?, weekNo?, periodStart?, periodEnd?, periodLabel?, note?, status, values:[{itemId,actual,note?}] }
 *  DELETE /api/kpi/my-report/{id}                                        employee — delete own report (not once reviewed)
 *  GET    /api/kpi/my-reports                                            employee — own report history
 */

/* ------------------------------ item tree -------------------------------- */

/** All items of a template as a 2-level tree (top-level items, each with `children`). */
function pg_kpi_item_tree(int $templateId): array
{
    $rows = Db::all(
        "SELECT * FROM kpi_template_items WHERE template_id = ? ORDER BY parent_id IS NOT NULL, sort_order, id",
        [$templateId]
    );
    $byId = [];
    foreach ($rows as $r) {
        $o = fmt_kpi_item($r);
        $o['children'] = [];
        $byId[(int) $r['id']] = $o;
    }
    $tree = [];
    foreach ($rows as $r) {
        $id  = (int) $r['id'];
        $pid = $r['parent_id'] !== null ? (int) $r['parent_id'] : 0;
        if ($pid && isset($byId[$pid])) {
            $byId[$pid]['children'][] = &$byId[$id];
        } else {
            $tree[] = &$byId[$id];
        }
    }
    // sort children by sort_order (they were appended in query order already)
    return $tree;
}

/**
 * Compute a filled scorecard.
 * $tree      = pg_kpi_item_tree() output
 * $actuals   = [itemId(string|int) => actual(float)]
 * $method    = 'percent_avg' | 'weighted_sum'
 * Returns [rowsById, totalPct, totalActual, totalTarget] where rowsById[id] =
 *   ['actual'=>, 'target'=>, 'pct'=>float|null].
 */
function pg_kpi_compute(array $tree, array $actuals, string $method): array
{
    $rows = [];

    $leafVal = function (array $it) use ($actuals): float {
        $k = (string) $it['id'];
        return isset($actuals[$k]) ? (float) $actuals[$k] : 0.0;
    };

    // First pass: resolve actual/target for every node (bottom-up).
    $resolve = function (array $node) use (&$resolve, &$rows, $leafVal): array {
        if (!empty($node['children'])) {
            $a = 0.0; $t = 0.0;
            foreach ($node['children'] as $c) {
                $rc = $resolve($c);
                $a += $rc['actual'];
                $t += $rc['target'];
            }
        } else {
            $a = $leafVal($node);
            $t = (float) $node['target'];
        }
        // Cap at 100% here (the single source every caller reads) — an
        // overachieved indicator (actual > target) must never show more than
        // 100%, and must never be allowed to offset a shortfall elsewhere
        // once it is averaged/summed into the report's total_pct below.
        $pct = $t > 0 ? min(100.0, round($a / $t * 100, 1)) : null;
        $rows[(string) $node['id']]['actual'] = $a;
        $rows[(string) $node['id']]['target'] = $t;
        $rows[(string) $node['id']]['pct'] = $pct;
        return ['actual' => $a, 'target' => $t];
    };
    foreach ($tree as $node) {
        $resolve($node);
    }

    // Second pass, TOP-DOWN this time: cascade a hierarchical weight through
    // the tree for 'percent_avg' — every indicator at a given level shares
    // its parent's weight equally with its siblings, and if it has its own
    // sub-indicators, ITS share is in turn split equally among them. So 5
    // indicators -> each 20%; if one of those 5 has 4 sub-indicators, each
    // sub-indicator gets 20% / 4 = 5%. This is structural (based on sibling
    // COUNT, not on target size) and independent of $actuals, unlike the
    // bottom-up pass above.
    $assignWeight = function (array $nodes, float $share) use (&$assignWeight, &$rows): void {
        $n = count($nodes);
        if ($n === 0) {
            return;
        }
        $each = $share / $n;
        foreach ($nodes as $node) {
            $rows[(string) $node['id']]['weight'] = $each;
            if (!empty($node['children'])) {
                $assignWeight($node['children'], $each);
            }
        }
    };
    $assignWeight($tree, 100.0);

    // Every scoring LEAF — never a grouping parent, which exists purely to
    // roll up its children's actual/target for its own informational badge
    // and is never itself one of the scored indicators. An item counts only
    // when it is not "Opsional" and has a target > 0 (untargeted rows are
    // informational only).
    $leaves = [];
    $collectLeaves = function (array $node) use (&$collectLeaves, &$leaves) {
        if (!empty($node['children'])) {
            foreach ($node['children'] as $c) {
                $collectLeaves($c);
            }
            return;
        }
        $leaves[] = $node;
    };
    foreach ($tree as $node) {
        $collectLeaves($node);
    }

    $totalActual = 0.0; $totalTarget = 0.0; $totalPct = 0.0;

    if ($method === 'weighted_sum') {
        // Sum every leaf, each capped at ITS OWN target before summing — a
        // bigger indicator (bigger target) naturally counts for more, in
        // proportion to its size, but one leaf overachieving can never make
        // up for another leaf's shortfall (each is capped independently).
        foreach ($leaves as $node) {
            $r = $rows[(string) $node['id']];
            if ($node['isOptional'] || $r['target'] <= 0) {
                continue;
            }
            $totalTarget += $r['target'];
            $totalActual += min($r['actual'], $r['target']);
        }
        $totalPct = $totalTarget > 0 ? round($totalActual / $totalTarget * 100, 2) : 0.0;
    } else {
        // percent_avg: each scoring leaf counts in proportion to its
        // HIERARCHICAL weight from $assignWeight() above — 5 top-level
        // indicators with no sub-indicators -> each worth 100/5 = 20%; if one
        // of those indicators has 4 sub-indicators instead, that 20% share is
        // split evenly across its 4 subs -> 5% each. Excluded leaves
        // (Opsional, or no target) drop out of BOTH sides of the ratio below,
        // so the remaining scoring leaves' weights still sum to a clean 100%
        // among themselves. Each leaf's own pct was already capped at 100 in
        // $resolve() above, so a weighted average of them can never let one
        // leaf's overachievement offset another leaf's shortfall — the
        // result always lands between 0% and 100%.
        $weightSum = 0.0; $weightedPct = 0.0;
        foreach ($leaves as $node) {
            $r = $rows[(string) $node['id']];
            if ($node['isOptional'] || $r['target'] <= 0) {
                continue;
            }
            $totalActual += $r['actual'];
            $totalTarget += $r['target'];
            $w = $r['weight'] ?? 0.0;
            $weightSum += $w;
            $weightedPct += $w * ($r['pct'] ?? 0.0);
        }
        $totalPct = $weightSum > 0 ? round($weightedPct / $weightSum, 2) : 0.0;
    }

    return [$rows, $totalPct, $totalActual, $totalTarget];
}

/* ============================================================
   ADMIN — templates
   ============================================================ */

function pg_kpi_template_row(int $id): ?array
{
    return Db::one(
        "SELECT t.*, d.name AS division_name,
                (SELECT COUNT(*) FROM kpi_template_items i WHERE i.template_id = t.id) AS item_count,
                (SELECT COUNT(*) FROM kpi_reports r WHERE r.template_id = t.id) AS report_count
           FROM kpi_templates t LEFT JOIN divisions d ON d.id = t.division_id
          WHERE t.id = ?",
        [$id]
    );
}

pg_route('GET', '/kpi/templates', function (): void {
    Guard::can('kpi.settings.edit');
    $rows = Db::all(
        "SELECT t.*, d.name AS division_name,
                (SELECT COUNT(*) FROM kpi_template_items i WHERE i.template_id = t.id) AS item_count,
                (SELECT COUNT(*) FROM kpi_reports r WHERE r.template_id = t.id) AS report_count
           FROM kpi_templates t LEFT JOIN divisions d ON d.id = t.division_id
          ORDER BY d.name IS NULL, d.name, t.name"
    );
    Http::json(['ok' => true, 'templates' => array_map('fmt_kpi_template', $rows)]);
});

pg_route('GET', '/kpi/templates/{id}', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $row = pg_kpi_template_row((int) $p['id']);
    if (!$row) Http::json(['ok' => false, 'error' => 'Template KPI tidak ditemukan.'], 200);
    Http::json(['ok' => true, 'template' => fmt_kpi_template($row), 'items' => pg_kpi_item_tree((int) $p['id'])]);
});

pg_route('POST', '/kpi/templates', function (): void {
    Guard::can('kpi.settings.edit');
    $b = Http::body();
    $name   = Validate::str($b['name'] ?? '', 'Nama template', 1, 200);
    $divId  = pg_resolve_fk($b['divisionId'] ?? null, 'divisions', 'Divisi');
    $ptype  = Validate::enum($b['periodType'] ?? 'monthly', ['weekly', 'monthly'], 'Periode');
    $smeth  = Validate::enum($b['scoreMethod'] ?? 'percent_avg', ['percent_avg', 'weighted_sum'], 'Metode skor');
    $desc   = Validate::optStr($b['description'] ?? null, 5000);
    $status = Validate::enum($b['status'] ?? 'active', ['active', 'inactive'], 'Status');
    Db::run(
        "INSERT INTO kpi_templates (name, division_id, period_type, score_method, description, status)
         VALUES (?, ?, ?, ?, ?, ?)",
        [$name, $divId, $ptype, $smeth, $desc, $status]
    );
    $newTplId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID

    if ($status === 'active' && $divId) {
        foreach (Db::all("SELECT DISTINCT u.id FROM users u
                           LEFT JOIN user_divisions ud ON ud.user_id = u.id
                          WHERE u.status = 'active' AND (u.division_id = ? OR ud.division_id = ?)", [$divId, $divId]) as $t) {
            Notify::toUser((int) $t['id'], 'kpi.template_published',
                'Form KPI baru tersedia',
                'Admin membuat form KPI: ' . mb_substr($name, 0, 120) . '. Isi di menu Lapor KPI.',
                '/lapor-kpi');
        }
    }

    Http::json(['ok' => true, 'record' => fmt_kpi_template(pg_kpi_template_row($newTplId))]);
});

pg_route('PATCH', '/kpi/templates/{id}', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $id = (int) $p['id'];
    if (!Db::one("SELECT id FROM kpi_templates WHERE id = ?", [$id])) {
        Http::json(['ok' => false, 'error' => 'Template KPI tidak ditemukan.'], 200);
    }
    $b = Http::body();
    $set = []; $args = [];
    if (array_key_exists('name', $b))        { $set[] = 'name = ?';         $args[] = Validate::str($b['name'], 'Nama template', 1, 200); }
    if (array_key_exists('divisionId', $b))  { $set[] = 'division_id = ?';  $args[] = pg_resolve_fk($b['divisionId'], 'divisions', 'Divisi'); }
    if (array_key_exists('periodType', $b))  { $set[] = 'period_type = ?';  $args[] = Validate::enum($b['periodType'], ['weekly', 'monthly'], 'Periode'); }
    if (array_key_exists('scoreMethod', $b)) { $set[] = 'score_method = ?'; $args[] = Validate::enum($b['scoreMethod'], ['percent_avg', 'weighted_sum'], 'Metode skor'); }
    if (array_key_exists('description', $b)) { $set[] = 'description = ?';  $args[] = Validate::optStr($b['description'], 5000); }
    if (array_key_exists('status', $b))      { $set[] = 'status = ?';       $args[] = Validate::enum($b['status'], ['active', 'inactive'], 'Status'); }
    if (!$set) Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    $args[] = $id;
    Db::run("UPDATE kpi_templates SET " . implode(', ', $set) . " WHERE id = ?", $args);
    Http::json(['ok' => true, 'record' => fmt_kpi_template(pg_kpi_template_row($id))]);
});

pg_route('DELETE', '/kpi/templates/{id}', function (array $p): void {
    Guard::can('kpi.settings.edit');
    try {
        $n = Db::exec("DELETE FROM kpi_templates WHERE id = ?", [(int) $p['id']]);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Template ini sudah punya laporan. Nonaktifkan saja agar riwayat tetap utuh.'], 200);
        }
        throw $e;
    }
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => 'Template tidak ditemukan.']);
});

/* -------- items -------- */

function pg_kpi_item_payload(array $b, ?array $existing = null): array
{
    $vt = $b['valueType'] ?? ($existing['value_type'] ?? 'number');
    return [
        'label'      => Validate::str($b['label'] ?? ($existing['label'] ?? ''), 'Nama indikator', 1, 200),
        'target'     => max(0, (float) ($b['target'] ?? ($existing['target'] ?? 0))),
        'valueType'  => in_array($vt, ['number', 'money'], true) ? $vt : 'number',
        'isOptional' => (int) (bool) ($b['isOptional'] ?? ($existing['is_optional'] ?? false)),
    ];
}

pg_route('POST', '/kpi/templates/{id}/items', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $tid = (int) $p['id'];
    if (!Db::one("SELECT id FROM kpi_templates WHERE id = ?", [$tid])) {
        Http::json(['ok' => false, 'error' => 'Template tidak ditemukan.'], 200);
    }
    $b = Http::body();
    $parentId = null;
    if (!empty($b['parentId'])) {
        $par = Db::one("SELECT id, parent_id FROM kpi_template_items WHERE id = ? AND template_id = ?", [(int) $b['parentId'], $tid]);
        if (!$par) Http::json(['ok' => false, 'error' => 'Indikator induk tidak valid.'], 200);
        if ($par['parent_id'] !== null) Http::json(['ok' => false, 'error' => 'Sub-indikator tidak boleh punya sub-indikator lagi (maksimal 2 tingkat).'], 200);
        $parentId = (int) $par['id'];
    }
    $v = pg_kpi_item_payload($b);
    $sort = (int) (Db::one(
        "SELECT COALESCE(MAX(sort_order), 0) + 1 s FROM kpi_template_items WHERE template_id = ? AND parent_id " . ($parentId ? "= " . $parentId : "IS NULL"),
        [$tid]
    )['s'] ?? 1);
    Db::run(
        "INSERT INTO kpi_template_items (template_id, parent_id, label, target, value_type, is_optional, sort_order)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [$tid, $parentId, $v['label'], $v['target'], $v['valueType'], $v['isOptional'], $sort]
    );
    Http::json(['ok' => true, 'record' => fmt_kpi_item(Db::one("SELECT * FROM kpi_template_items WHERE id = ?", [(int) Db::lastId()]))]);
});

pg_route('PATCH', '/kpi/items/{id}', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $row = Db::one("SELECT * FROM kpi_template_items WHERE id = ?", [(int) $p['id']]);
    if (!$row) Http::json(['ok' => false, 'error' => 'Indikator tidak ditemukan.'], 200);
    $b = Http::body();
    $v = pg_kpi_item_payload($b, $row);
    Db::run(
        "UPDATE kpi_template_items SET label = ?, target = ?, value_type = ?, is_optional = ? WHERE id = ?",
        [$v['label'], $v['target'], $v['valueType'], $v['isOptional'], (int) $p['id']]
    );
    Http::json(['ok' => true, 'record' => fmt_kpi_item(Db::one("SELECT * FROM kpi_template_items WHERE id = ?", [(int) $p['id']]))]);
});

pg_route('DELETE', '/kpi/items/{id}', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $n = Db::exec("DELETE FROM kpi_template_items WHERE id = ?", [(int) $p['id']]);
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => 'Indikator tidak ditemukan.']);
});

pg_route('POST', '/kpi/templates/{id}/reorder', function (array $p): void {
    Guard::can('kpi.settings.edit');
    $tid = (int) $p['id'];
    $ids = Http::body()['ids'] ?? [];
    if (!is_array($ids)) Http::json(['ok' => false, 'error' => 'Format urutan tidak valid.'], 200);
    $i = 1;
    foreach ($ids as $iid) {
        Db::exec("UPDATE kpi_template_items SET sort_order = ? WHERE id = ? AND template_id = ?", [$i++, (int) $iid, $tid]);
    }
    Http::json(['ok' => true]);
});

/* ============================================================
   ADMIN — submitted reports
   ============================================================ */

pg_route('GET', '/kpi/reports', function (): void {
    Guard::can('kpi.report.view');
    $b = [
        'divisionId' => pg_resolve_fk(Http::query('divisionId'), 'divisions', 'Divisi'),
        'templateId' => (int) (Http::query('templateId') ?? 0),
        'storeId'    => (int) (Http::query('storeId') ?? 0),
        'status'     => Http::query('status'),
    ];
    $where = "WHERE r.status IN ('submitted','reviewed')";
    $args = [];
    if ($b['divisionId']) {
        // Match reports whose template is for this division OR whose author
        // belongs to this division (a karyawan can be in several divisions).
        $where .= " AND (t.division_id = ? OR EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = r.user_id AND ud.division_id = ?))";
        $args[] = $b['divisionId'];
        $args[] = $b['divisionId'];
    }
    if ($b['templateId']) { $where .= " AND r.template_id = ?"; $args[] = $b['templateId']; }
    if ($b['storeId'])    { $where .= " AND r.store_id = ?";    $args[] = $b['storeId']; }
    if (in_array($b['status'], ['submitted', 'reviewed'], true)) { $where .= " AND r.status = ?"; $args[] = $b['status']; }

    $rows = Db::all(
        "SELECT r.*, t.name AS template_name, t.division_id, d.name AS division_name,
                u.full_name AS user_name, s.name AS store_name
           FROM kpi_reports r
           JOIN kpi_templates t ON t.id = r.template_id
           LEFT JOIN divisions d ON d.id = t.division_id
           JOIN users u ON u.id = r.user_id
           LEFT JOIN stores s ON s.id = r.store_id
           $where
          ORDER BY r.submitted_at DESC, r.id DESC
          LIMIT 300",
        $args
    );
    $out = array_map('fmt_kpi_report', $rows);
    $scored = array_filter($out, fn($r) => $r['status'] !== 'draft');

    /* ---- comparison aggregates: follow EVERY active filter (store included),
            so the charts always reflect exactly what the table shows ---- */
    $aWhere = $where;
    $aArgs = $args;

    $mapAgg = fn(array $rows2, string $key) => array_map(
        fn($x) => ['name' => $x[$key] ?: '—', 'avgPct' => (float) $x['avg_pct'], 'count' => (int) $x['n']],
        $rows2
    );

    $byStore = $mapAgg(Db::all(
        "SELECT COALESCE(s.name, NULLIF(r.subject,''), '—') AS nm, ROUND(AVG(r.total_pct),1) AS avg_pct, COUNT(*) AS n
           FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id LEFT JOIN stores s ON s.id = r.store_id
           $aWhere GROUP BY nm ORDER BY avg_pct DESC, n DESC LIMIT 20", $aArgs
    ), 'nm');

    $byDivision = $mapAgg(Db::all(
        "SELECT COALESCE(d.name, 'Tanpa Divisi') AS nm, ROUND(AVG(r.total_pct),1) AS avg_pct, COUNT(*) AS n
           FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id LEFT JOIN divisions d ON d.id = t.division_id
           $aWhere GROUP BY nm ORDER BY avg_pct DESC, n DESC", $aArgs
    ), 'nm');

    $byPeriod = array_map(
        fn($x) => ['period' => $x['ym'], 'avgPct' => (float) $x['avg_pct'], 'count' => (int) $x['n']],
        Db::all(
            "SELECT DATE_FORMAT(COALESCE(r.period_start, DATE(r.submitted_at), DATE(r.created_at)), '%Y-%m') AS ym,
                    ROUND(AVG(r.total_pct),1) AS avg_pct, COUNT(*) AS n
               FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id
               $aWhere GROUP BY ym ORDER BY ym LIMIT 24", $aArgs
        )
    );

    $byWeek = array_map(
        fn($x) => ['week' => (int) $x['wk'], 'avgPct' => (float) $x['avg_pct'], 'count' => (int) $x['n']],
        Db::all(
            "SELECT r.week_no AS wk, ROUND(AVG(r.total_pct),1) AS avg_pct, COUNT(*) AS n
               FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id
               $aWhere AND r.week_no IS NOT NULL
              GROUP BY wk ORDER BY wk LIMIT 12", $aArgs
        )
    );

    Http::json([
        'ok'      => true,
        'reports' => $out,
        'summary' => [
            'total'     => count($out),
            'reviewed'  => count(array_filter($out, fn($r) => $r['status'] === 'reviewed')),
            'avgPct'    => $scored ? round(array_sum(array_map(fn($r) => $r['totalPct'], $scored)) / count($scored), 1) : null,
        ],
        'analytics' => [
            'byStore'    => $byStore,
            'byDivision' => $byDivision,
            'byPeriod'   => $byPeriod,
            'byWeek'     => $byWeek,
        ],
        'templates' => array_map('fmt_kpi_template', Db::all(
            "SELECT t.*, d.name division_name FROM kpi_templates t LEFT JOIN divisions d ON d.id=t.division_id ORDER BY t.name"
        )),
        'stores' => array_map('fmt_store', Db::all("SELECT * FROM stores ORDER BY name")),
    ]);
});

function pg_kpi_report_full(int $id): ?array
{
    $r = Db::one(
        "SELECT r.*, t.name AS template_name, t.score_method, t.division_id, d.name AS division_name,
                u.full_name AS user_name, s.name AS store_name
           FROM kpi_reports r
           JOIN kpi_templates t ON t.id = r.template_id
           LEFT JOIN divisions d ON d.id = t.division_id
           JOIN users u ON u.id = r.user_id
           LEFT JOIN stores s ON s.id = r.store_id
          WHERE r.id = ?",
        [$id]
    );
    if (!$r) return null;
    $tree = pg_kpi_item_tree((int) $r['template_id']);
    $vals = [];
    foreach (Db::all("SELECT * FROM kpi_report_values WHERE report_id = ?", [$id]) as $v) {
        $vals[(string) $v['item_id']] = ['actual' => (float) $v['actual'], 'note' => $v['note']];
    }
    $actuals = [];
    foreach ($vals as $k => $vv) $actuals[$k] = $vv['actual'];
    $comp = pg_kpi_compute($tree, $actuals, (string) $r['score_method']);
    $rowsById = $comp[0];
    // attach actual/pct/note onto each node for the reader
    $attach = function (&$node) use (&$attach, $rowsById, $vals) {
        $c = $rowsById[(string) $node['id']] ?? ['actual' => 0, 'target' => (float) $node['target'], 'pct' => null, 'weight' => null];
        $node['actual'] = $c['actual'];
        $node['computedTarget'] = $c['target'];
        $node['pct'] = $c['pct'];
        $node['weight'] = $c['weight'] ?? null;
        $node['valueNote'] = $vals[(string) $node['id']]['note'] ?? '';
        foreach ($node['children'] as &$ch) $attach($ch);
    };
    foreach ($tree as &$n) $attach($n);
    return ['report' => fmt_kpi_report($r), 'scoreMethod' => $r['score_method'], 'items' => $tree];
}

pg_route('GET', '/kpi/reports/{id}', function (array $p): void {
    // Admin (kpi.report.view) sees any report; an employee sees only their own.
    $pr = Auth::principal();
    if (!$pr) Http::fail('Perlu login.', 401);
    $id = (int) $p['id'];
    $owner = Db::one("SELECT user_id FROM kpi_reports WHERE id = ?", [$id]);
    if (!$owner) Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $owner['user_id'];
    if (!$isOwner) Guard::can('kpi.report.view');
    Http::json(['ok' => true] + pg_kpi_report_full($id));
});

pg_route('POST', '/kpi/reports/{id}/review', function (array $p): void {
    $admin = Guard::can('kpi.report.view');
    $row = Db::one("SELECT * FROM kpi_reports WHERE id = ?", [(int) $p['id']]);
    if (!$row) Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    if ($row['status'] === 'draft') Http::json(['ok' => false, 'error' => 'Laporan ini masih draft.'], 200);
    $to = $row['status'] === 'reviewed' ? 'submitted' : 'reviewed';
    Db::exec(
        "UPDATE kpi_reports SET status = ?, reviewed_by_admin_id = ?, reviewed_at = ? WHERE id = ?",
        [$to, $to === 'reviewed' ? $admin['id'] : null, $to === 'reviewed' ? date('Y-m-d H:i:s') : null, (int) $p['id']]
    );
    if ($to === 'reviewed') {
        Notify::toUser((int) $row['user_id'], 'kpi.reviewed',
            'Laporan KPI ditinjau admin',
            'Laporan KPI Anda' . (!empty($row['period_label']) ? ' periode ' . $row['period_label'] : '') . ' sudah ditinjau admin.',
            '/lapor-kpi');
    }
    Http::json(['ok' => true, 'status' => $to]);
});

pg_route('DELETE', '/kpi/reports/{id}', function (array $p): void {
    Guard::can('kpi.report.view');
    $id  = (int) $p['id'];
    $row = Db::one("SELECT id FROM kpi_reports WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    Db::exec("DELETE FROM kpi_reports WHERE id = ?", [$id]);   // kpi_report_values cascades
    Http::json(['ok' => true]);
});

/* ============================================================
   EMPLOYEE — my templates / my report
   ============================================================ */

function pg_kpi_user_templates(int $userId): array
{
    $divs  = pg_user_division_ids($userId);
    $divPh = $divs ? implode(',', array_fill(0, count($divs), '?')) : 'NULL';
    return Db::all(
        "SELECT t.*, d.name AS division_name,
                (SELECT COUNT(*) FROM kpi_template_items i WHERE i.template_id = t.id) AS item_count
           FROM kpi_templates t LEFT JOIN divisions d ON d.id = t.division_id
          WHERE t.status = 'active' AND (t.division_id IS NULL OR t.division_id IN ($divPh))
          ORDER BY t.name",
        $divs
    );
}

pg_route('GET', '/kpi/my-templates', function (): void {
    $u = Guard::user();
    Http::json(['ok' => true, 'templates' => array_map('fmt_kpi_template', pg_kpi_user_templates((int) $u['id']))]);
});

/** The user's division must match the template (or the template is division-less). */
function pg_kpi_template_for_user(int $templateId, int $userId): array
{
    $tpl = Db::one("SELECT t.*, d.name AS division_name FROM kpi_templates t LEFT JOIN divisions d ON d.id=t.division_id WHERE t.id = ? AND t.status = 'active'", [$templateId]);
    if (!$tpl) Http::json(['ok' => false, 'error' => 'Template KPI tidak tersedia.'], 200);
    $divs = pg_user_division_ids($userId);
    if ($tpl['division_id'] !== null && !in_array((int) $tpl['division_id'], $divs, true)) {
        Http::json(['ok' => false, 'error' => 'Template ini bukan untuk divisi Anda.'], 200);
    }
    return $tpl;
}
function pg_kpi_opt_date(mixed $v): ?string
{
    if ($v === null || $v === '') return null;
    return Validate::date($v, 'Tanggal');
}

pg_route('GET', '/kpi/my-report', function (): void {
    $u   = Guard::user();
    $tid = (int) (Http::query('templateId') ?? 0);
    $tpl = pg_kpi_template_for_user($tid, (int) $u['id']);

    $rid = (int) (Http::query('reportId') ?? 0);
    $existing = null;
    if ($rid) {
        $existing = Db::one("SELECT * FROM kpi_reports WHERE id = ? AND user_id = ? AND template_id = ?", [$rid, $u['id'], $tid]);
        if (!$existing) Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }

    $vals = [];
    if ($existing) {
        foreach (Db::all("SELECT * FROM kpi_report_values WHERE report_id = ?", [$existing['id']]) as $v) {
            $vals[(string) $v['item_id']] = ['actual' => (float) $v['actual'], 'note' => $v['note']];
        }
    }

    Http::json([
        'ok'       => true,
        'template' => fmt_kpi_template($tpl),
        'items'    => pg_kpi_item_tree($tid),
        'report'   => $existing ? fmt_kpi_report($existing) : null,
        'values'   => $vals,
        'locked'   => $existing && $existing['status'] === 'reviewed',
    ]);
});

pg_route('POST', '/kpi/my-report', function (): void {
    $u   = Guard::user();
    $b   = Http::body();
    $tid = (int) ($b['templateId'] ?? 0);
    $tpl = pg_kpi_template_for_user($tid, (int) $u['id']);

    $status = Validate::enum($b['status'] ?? 'draft', ['draft', 'submitted'], 'Status');
    $subject     = Validate::optStr($b['subject'] ?? null, 200) ?? '';
    $periodLabel = Validate::optStr($b['periodLabel'] ?? null, 160) ?? '';
    $note        = Validate::optStr($b['note'] ?? null, 5000);

    // A report is filed against a managed store. When one is picked its name is
    // also copied into `subject` so historical display stays stable.
    $storeId = null;
    if (!empty($b['storeId'])) {
        $s = Db::one("SELECT id, name FROM stores WHERE id = ? AND status = 'active'", [(int) $b['storeId']]);
        if (!$s) Http::json(['ok' => false, 'error' => 'Toko tidak valid atau sudah nonaktif.'], 200);
        $storeId = (int) $s['id'];
        $subject = $s['name'];
    }
    $weekNo      = isset($b['weekNo']) && $b['weekNo'] !== '' && $b['weekNo'] !== null
        ? max(1, min(53, (int) $b['weekNo'])) : null;
    $pStart = pg_kpi_opt_date($b['periodStart'] ?? null);
    $pEnd   = pg_kpi_opt_date($b['periodEnd'] ?? null);
    if ($pStart && $pEnd && $pEnd < $pStart) {
        Http::json(['ok' => false, 'error' => 'Tanggal selesai tidak boleh sebelum tanggal mulai.'], 200);
    }
    $periodKey = $pStart ?: ($weekNo ? ('W' . $weekNo) : '');

    $rid = (int) ($b['reportId'] ?? 0);
    $existing = null;
    if ($rid) {
        $existing = Db::one("SELECT * FROM kpi_reports WHERE id = ? AND user_id = ? AND template_id = ?", [$rid, $u['id'], $tid]);
        if (!$existing) Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
        if ($existing['status'] === 'reviewed') {
            Http::json(['ok' => false, 'error' => 'Laporan ini sudah direview admin. Hubungi admin bila perlu revisi.'], 200);
        }
    }

    // valid leaf items of this template
    $items = Db::all("SELECT id, parent_id FROM kpi_template_items WHERE template_id = ?", [$tid]);
    $hasChild = [];
    foreach ($items as $it) if ($it['parent_id'] !== null) $hasChild[(int) $it['parent_id']] = true;
    $leafIds = [];
    foreach ($items as $it) if (empty($hasChild[(int) $it['id']])) $leafIds[(int) $it['id']] = true;

    $clean = [];
    foreach (($b['values'] ?? []) as $v) {
        $iid = (int) ($v['itemId'] ?? 0);
        if (!isset($leafIds[$iid])) continue;
        $clean[$iid] = [
            'actual' => max(0, (float) ($v['actual'] ?? 0)),
            'note'   => Validate::optStr($v['note'] ?? null, 500) ?? '',
        ];
    }

    $tree = pg_kpi_item_tree($tid);
    $actuals = [];
    foreach ($clean as $iid => $vv) $actuals[(string) $iid] = $vv['actual'];
    [, $totalPct, $totalActual, $totalTarget] = pg_kpi_compute($tree, $actuals, (string) $tpl['score_method']);

    if ($existing) {
        $submittedAt = $status === 'submitted' ? ($existing['submitted_at'] ?: date('Y-m-d H:i:s')) : $existing['submitted_at'];
        Db::run(
            "UPDATE kpi_reports SET store_id = ?, period_key = ?, period_label = ?, week_no = ?, period_start = ?, period_end = ?,
                 subject = ?, note = ?, status = ?, total_pct = ?, total_actual = ?, total_target = ?, submitted_at = ?
             WHERE id = ?",
            [$storeId, $periodKey, $periodLabel, $weekNo, $pStart, $pEnd, $subject, $note, $status, $totalPct, $totalActual, $totalTarget, $submittedAt, $existing['id']]
        );
        $rid = (int) $existing['id'];
    } else {
        Db::run(
            "INSERT INTO kpi_reports (template_id, user_id, store_id, period_key, period_label, week_no, period_start, period_end, subject, status, total_pct, total_actual, total_target, note, submitted_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [$tid, $u['id'], $storeId, $periodKey, $periodLabel, $weekNo, $pStart, $pEnd, $subject, $status, $totalPct, $totalActual, $totalTarget, $note,
             $status === 'submitted' ? date('Y-m-d H:i:s') : null]
        );
        $rid = (int) Db::lastId();
    }

    Db::exec("DELETE FROM kpi_report_values WHERE report_id = ?", [$rid]);
    foreach ($clean as $iid => $vv) {
        Db::run("INSERT INTO kpi_report_values (report_id, item_id, actual, note) VALUES (?, ?, ?, ?)", [$rid, $iid, $vv['actual'], $vv['note']]);
    }

    if ($status === 'submitted') {
        Notify::toAllAdmins('kpi.submitted',
            'Laporan KPI dikirim',
            Notify::userName((int) $u['id']) . ' mengirim laporan KPI'
                . ($subject !== '' ? ' (' . mb_substr($subject, 0, 100) . ')' : '')
                . ' — pencapaian ' . round($totalPct, 1) . '%.',
            '/laporan-kpi', (int) $u['id']);
    }

    Http::json(['ok' => true] + pg_kpi_report_full($rid));
});

pg_route('DELETE', '/kpi/my-report/{id}', function (array $p): void {
    $u = Guard::user();
    $row = Db::one("SELECT * FROM kpi_reports WHERE id = ?", [(int) $p['id']]);
    if (!$row) Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    if ((string) $row['user_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Ini bukan laporan Anda.'], 200);
    }
    if ($row['status'] === 'reviewed') {
        Http::json(['ok' => false, 'error' => 'Laporan yang sudah direview admin tidak dapat dihapus.'], 200);
    }
    Db::exec("DELETE FROM kpi_reports WHERE id = ?", [(int) $p['id']]);
    Http::json(['ok' => true]);
});

pg_route('GET', '/kpi/my-reports', function (): void {
    $u = Guard::user();
    $rows = Db::all(
        "SELECT r.*, t.name AS template_name, t.division_id, d.name AS division_name,
                u.full_name AS user_name, s.name AS store_name
           FROM kpi_reports r
           JOIN kpi_templates t ON t.id = r.template_id
           LEFT JOIN divisions d ON d.id = t.division_id
           JOIN users u ON u.id = r.user_id
           LEFT JOIN stores s ON s.id = r.store_id
          WHERE r.user_id = ?
          ORDER BY r.updated_at DESC, r.id DESC
          LIMIT 100",
        [$u['id']]
    );
    Http::json(['ok' => true, 'reports' => array_map('fmt_kpi_report', $rows)]);
});
