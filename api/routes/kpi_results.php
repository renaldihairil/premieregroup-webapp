<?php
declare(strict_types=1);

/**
 * "Hasil KPI" — a read-only User App view of EVERY employee's KPI reports,
 * grouped per person. The KPI sibling of "Kerja Staf" / "Hasil Kunjungan".
 * Three filters: periode (template period type), divisi, and bulan.
 *
 *   GET /api/kpi-results?period=&divisionId=&month=   reports, grouped per staff
 *   GET /api/kpi-results/{id}                         one report + item breakdown
 *
 * Only sent reports appear (submitted / reviewed — never a draft), exactly like
 * the Admin "Laporan KPI" list. Page visibility is narrowed per division via
 * Feature Access (key `hasil_kpi`) — a UI-only gate, so these routes stay
 * reachable to any signed-in employee, matching every other Feature Access key.
 * The generic GET /api/kpi/reports/{id} refuses a non-admin who is not the
 * report's author, so this feature ships its own detail route.
 */

pg_route('GET', '/kpi-results', function (): void {
    Guard::user();

    $period     = (string) (Http::query('period') ?? '');
    $divisionId = pg_resolve_fk(Http::query('divisionId'), 'divisions', 'Divisi');
    $month      = (string) (Http::query('month') ?? '');

    $monthExpr = "DATE_FORMAT(COALESCE(r.period_start, DATE(r.submitted_at), DATE(r.created_at)), '%Y-%m')";

    $where = ["r.status IN ('submitted','reviewed')"];
    $args  = [];
    if (in_array($period, ['weekly', 'monthly'], true)) {
        $where[] = 't.period_type = ?';
        $args[]  = $period;
    }
    if ($divisionId) {
        // Match reports whose template is for this division OR whose author
        // belongs to it (a karyawan can be in several divisions).
        $where[] = '(t.division_id = ? OR EXISTS (SELECT 1 FROM user_divisions ud WHERE ud.user_id = r.user_id AND ud.division_id = ?))';
        $args[]  = $divisionId;
        $args[]  = $divisionId;
    }
    if (preg_match('/^\d{4}-\d{2}$/', $month)) {
        $where[] = "$monthExpr = ?";
        $args[]  = $month;
    }
    $wsql = implode(' AND ', $where);

    $rows = Db::all(
        "SELECT r.*, t.name AS template_name, t.period_type, t.division_id, d.name AS division_name,
                u.full_name AS user_name, s.name AS store_name
           FROM kpi_reports r
           JOIN kpi_templates t ON t.id = r.template_id
           LEFT JOIN divisions d ON d.id = t.division_id
           JOIN users u ON u.id = r.user_id
           LEFT JOIN stores s ON s.id = r.store_id
          WHERE $wsql
          ORDER BY u.full_name ASC, r.submitted_at DESC, r.id DESC
          LIMIT 400",
        $args
    );

    $groups   = [];
    $reviewed = 0;
    $pctSum   = 0.0;
    $pctN     = 0;
    foreach ($rows as $r) {
        $uid = (int) $r['user_id'];
        if (!isset($groups[$uid])) {
            $groups[$uid] = [
                'userId'       => id_str($uid),
                'name'         => $r['user_name'],
                'divisionName' => $r['division_name'] ?? null,
                'reports'      => [],
                'counts'       => ['submitted' => 0, 'reviewed' => 0],
                '_pctSum'      => 0.0,
                '_pctN'        => 0,
            ];
        }
        $fr = fmt_kpi_report($r);
        $fr['periodType'] = $r['period_type'];
        $groups[$uid]['reports'][] = $fr;

        $st = (string) $r['status'];
        if (isset($groups[$uid]['counts'][$st])) {
            $groups[$uid]['counts'][$st]++;
        }
        if ($st === 'reviewed') {
            $reviewed++;
        }
        $groups[$uid]['_pctSum'] += (float) $r['total_pct'];
        $groups[$uid]['_pctN']++;
        $pctSum += (float) $r['total_pct'];
        $pctN++;
    }

    $staff = [];
    foreach ($groups as $g) {
        $g['avgPct'] = $g['_pctN'] ? round($g['_pctSum'] / $g['_pctN'], 1) : null;
        unset($g['_pctSum'], $g['_pctN']);
        $staff[] = $g;
    }

    // Bulan options — every month that actually holds a sent report.
    $months = array_map(
        static fn ($m) => $m['ym'],
        Db::all(
            "SELECT DISTINCT $monthExpr AS ym
               FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id
              WHERE r.status IN ('submitted','reviewed')
              ORDER BY ym DESC
              LIMIT 36"
        )
    );

    Http::json([
        'ok'      => true,
        'filters' => [
            'period'     => $period,
            'divisionId' => $divisionId ? id_str($divisionId) : '',
            'month'      => $month,
        ],
        'staff'   => $staff,
        'summary' => [
            'staffCount'  => count($staff),
            'reportCount' => count($rows),
            'reviewed'    => $reviewed,
            'avgPct'      => $pctN ? round($pctSum / $pctN, 1) : null,
        ],
        'divisions' => array_map('fmt_division', Db::all("SELECT * FROM divisions ORDER BY name")),
        'months'    => $months,
    ]);
});

pg_route('GET', '/kpi-results/{id}', function (array $p): void {
    Guard::user();
    $id   = (int) $p['id'];
    $full = pg_kpi_report_full($id);
    if (!$full) {
        Http::json(['ok' => false, 'error' => 'Laporan tidak ditemukan.'], 200);
    }
    $pt = Db::one(
        "SELECT t.period_type FROM kpi_reports r JOIN kpi_templates t ON t.id = r.template_id WHERE r.id = ?",
        [$id]
    );
    if ($pt) {
        $full['report']['periodType'] = $pt['period_type'];
    }
    Http::json(['ok' => true] + $full);
});
