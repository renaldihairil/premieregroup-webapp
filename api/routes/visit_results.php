<?php
declare(strict_types=1);

/**
 * "Hasil Kunjungan" — a read-only User App view of EVERY employee's visit
 * reports for one day, grouped per person. It is the Kunjungan sibling of
 * "Kerja Staf" (today's todos): same read-only, cross-staff spirit, but scoped
 * to Kunjungan and split into two fixed days the UI flips between — today and
 * yesterday.
 *
 *   GET /api/visit-results?day=today|yesterday   reports for that day, per staff
 *   GET /api/visit-results-file?id=              stream one visit photo (any staff)
 *
 * Only genuinely-sent reports appear (never an employee's local draft), exactly
 * like the Admin "Laporan Kunjungan" list. Visibility of this page is narrowed
 * per division via Feature Access (key `hasil_kunjungan`) — a UI-only gate, so
 * the routes below stay reachable to any signed-in employee, matching the
 * deliberate scope of every other Feature Access key.
 *
 * The generic GET /api/visit-file restricts a non-admin to their OWN report's
 * photos, so this feature ships its own /api/visit-results-file that any
 * employee may call — mirroring /api/staff-work-file for Kerja Staf.
 */

pg_route('GET', '/visit-results', function (): void {
    Guard::user();

    $day = (string) (Http::query('day') ?? 'today');
    if (!in_array($day, ['today', 'yesterday'], true)) {
        $day = 'today';
    }
    $date = date('Y-m-d', $day === 'yesterday' ? strtotime('-1 day') : time());

    $rows = Db::all(
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
          WHERE v.status <> 'draft' AND v.visit_date = ?
          ORDER BY u.full_name ASC, v.id DESC",
        [$date]
    );

    $visitIds   = array_map(static fn ($r) => (int) $r['id'], $rows);
    $attByVisit = [];
    if ($visitIds) {
        $ph = implode(',', array_fill(0, count($visitIds), '?'));
        foreach (Db::all(
            "SELECT a.*, ci.label AS checklist_item_label
               FROM visit_attachments a
               LEFT JOIN visit_checklist_items ci ON ci.id = a.checklist_item_id
              WHERE a.visit_id IN ($ph)
              ORDER BY a.id ASC",
            $visitIds
        ) as $a) {
            $fa = fmt_visit_attachment($a);
            if (($fa['fileUrl'] ?? null) !== null) {
                $fa['fileUrl']     = 'api/visit-results-file?id=' . $fa['id'];
                $fa['downloadUrl'] = 'api/visit-results-file?id=' . $fa['id'] . '&download=1';
            }
            $attByVisit[(int) $a['visit_id']][] = $fa;
        }
    }

    $groups   = [];
    $reviewed = 0;
    $stores   = [];
    foreach ($rows as $r) {
        $uid = (int) $r['user_id'];
        if (!isset($groups[$uid])) {
            $groups[$uid] = [
                'userId'       => id_str($uid),
                'name'         => $r['user_name'],
                'divisionName' => ($r['division_names'] ?? null) ?: ($r['division_name'] ?? null),
                'visits'       => [],
                'counts'       => ['submitted' => 0, 'reviewed' => 0],
            ];
        }
        $v = fmt_visit($r);
        $v['attachments']     = $attByVisit[(int) $r['id']] ?? [];
        $v['attachmentCount'] = count($v['attachments']);
        $groups[$uid]['visits'][] = $v;

        $st = (string) $r['status'];
        if (isset($groups[$uid]['counts'][$st])) {
            $groups[$uid]['counts'][$st]++;
        }
        if ($st === 'reviewed') {
            $reviewed++;
        }
        if (($v['storeName'] ?? '') !== '') {
            $stores[$v['storeName']] = true;
        }
    }

    Http::json([
        'ok'      => true,
        'day'     => $day,
        'date'    => $date,
        'staff'   => array_values($groups),
        'summary' => [
            'staffCount'    => count($groups),
            'visitCount'    => count($rows),
            'reviewed'      => $reviewed,
            'storesVisited' => count($stores),
        ],
    ]);
});

pg_route('GET', '/visit-results-file', function (): void {
    Guard::user();
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT * FROM visit_attachments WHERE id = ?", [$id]);
    if (!$row || ($row['kind'] ?? '') === 'link' || empty($row['file_path'])) {
        Http::fail('File tidak ditemukan.', 404);
    }
    if (!headers_sent()) {
        header_remove('Pragma');
        header_remove('Expires');
    }
    $download = (Http::query('download') ?? '0') === '1';
    Storage::serveFile(
        $row['file_path'],
        (string) ($row['mime'] ?: 'application/octet-stream'),
        (string) ($row['original_name'] ?: 'lampiran'),
        $download
    );
});
