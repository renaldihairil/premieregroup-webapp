<?php
declare(strict_types=1);

/**
 * "Kerja Staf" — a read-only User App view of every active employee's todos
 * that matter TODAY (created today, due today, or touched today), grouped per
 * person. Meant for lead / supervisor roles; the menu is shown only where
 * Admin enables the `kerja_staf` feature, but — like every Feature Access
 * gate in this app — the route itself stays reachable to any logged-in
 * employee (UI-only, not a security boundary; a recorded scope decision).
 *
 *   GET  /api/staff-work              today's todos, grouped by assignee
 *   POST /api/staff-work/todo         a lead assigns a todo to any staff
 *   GET  /api/staff-work-file?id=     stream one todo attachment (any employee)
 */

pg_route('GET', '/staff-work', function (): void {
    Guard::user();

    $rows = Db::all(
        "SELECT t.*, cu.full_name AS creator_name, cd.name AS creator_division_name,
                pg.name AS program_name, u.full_name AS assignee_name
           FROM todos t
           JOIN users u ON u.id = t.assignee_id AND u.status = 'active' AND u.deleted_at IS NULL
           LEFT JOIN users cu ON cu.id = t.created_by_user_id
           LEFT JOIN divisions cd ON cd.id = cu.division_id
           LEFT JOIN programs pg ON pg.id = t.program_id
          WHERE t.assignee_id IS NOT NULL
            AND ( DATE(t.created_at) = CURDATE()
               OR t.deadline = CURDATE()
               OR DATE(t.updated_at) = CURDATE() )
          ORDER BY u.full_name ASC, FIELD(t.status, 'in_progress', 'todo', 'done'), t.id DESC"
    );

    // Attachments for exactly the todos in view — one query, then bucketed.
    $todoIds = array_map(static fn ($r) => (int) $r['id'], $rows);
    $attByTodo = [];
    if ($todoIds) {
        $ph = implode(',', array_fill(0, count($todoIds), '?'));
        foreach (Db::all(
            "SELECT a.*, uu.full_name AS uploader_name
               FROM todo_attachments a
               LEFT JOIN users uu ON uu.id = a.user_id
              WHERE a.todo_id IN ($ph)
              ORDER BY a.created_at ASC, a.id ASC",
            $todoIds
        ) as $a) {
            $fa = fmt_attachment($a);
            if ($fa['fileUrl'] !== null) {
                $fa['fileUrl']     = 'api/staff-work-file?id=' . $fa['id'];
                $fa['downloadUrl'] = 'api/staff-work-file?id=' . $fa['id'] . '&download=1';
            }
            $attByTodo[(int) $a['todo_id']][] = $fa;
        }
    }

    $groups = [];
    foreach ($rows as $r) {
        $uid = (int) $r['assignee_id'];
        if (!isset($groups[$uid])) {
            $groups[$uid] = [
                'userId' => id_str($uid),
                'name'   => $r['assignee_name'],
                'todos'  => [],
                'counts' => ['todo' => 0, 'in_progress' => 0, 'done' => 0],
            ];
        }
        $t = fmt_todo($r);
        $t['attachments']     = $attByTodo[(int) $r['id']] ?? [];
        $t['attachmentCount'] = count($t['attachments']);
        $groups[$uid]['todos'][] = $t;
        $st = (string) $r['status'];
        if (isset($groups[$uid]['counts'][$st])) {
            $groups[$uid]['counts'][$st]++;
        }
    }

    Http::json([
        'ok'    => true,
        'date'  => date('Y-m-d'),
        'staff' => array_values($groups),
    ]);
});

/**
 * POST /api/staff-work/todo   { assigneeId, title, description?, priority?, deadline? }
 * ------------------------------------------------------------
 * Whoever can see "Kerja Staf" can assign a todo to ANY active employee. It is
 * stamped created_by_user_id = the assigner, so it shows everywhere as
 * "ditambahkan oleh <Nama> (<Divisi>)" — never as an admin task. The assignee
 * is notified, and admins get a heads-up too.
 */
pg_route('POST', '/staff-work/todo', function (): void {
    $u = Guard::user();
    $b = Http::body();

    $assignee = pg_resolve_fk($b['assigneeId'] ?? null, 'users', 'Karyawan');
    if (!$assignee) {
        Http::json(['ok' => false, 'error' => 'Pilih karyawan yang akan diberi tugas.'], 200);
    }
    $target = Db::one(
        "SELECT id, full_name, division_id, status FROM users WHERE id = ? AND deleted_at IS NULL",
        [$assignee]
    );
    if (!$target || $target['status'] !== 'active') {
        Http::json(['ok' => false, 'error' => 'Karyawan tidak ditemukan atau nonaktif.'], 200);
    }

    $title    = Validate::str($b['title'] ?? '', 'Judul tugas', 1, 200);
    $desc     = Validate::optStr($b['description'] ?? null, 5000);
    $priority = Validate::enum($b['priority'] ?? 'mid', ['high', 'mid', 'low'], 'Prioritas');
    $deadline = isset($b['deadline']) && $b['deadline'] !== '' ? Validate::date($b['deadline'], 'Deadline') : null;

    Db::run(
        "INSERT INTO todos (title, description, division_id, assignee_id, created_by_user_id, priority, status, progress, deadline)
         VALUES (?, ?, ?, ?, ?, ?, 'todo', 0, ?)",
        [$title, $desc, $target['division_id'] ?: null, (int) $assignee, (int) $u['id'], $priority, $deadline]
    );
    $newId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID

    $me = Db::one(
        "SELECT u.full_name, d.name AS division_name
           FROM users u LEFT JOIN divisions d ON d.id = u.division_id
          WHERE u.id = ?",
        [$u['id']]
    );
    $byLabel = ($me['full_name'] ?? 'Rekan kerja')
        . (!empty($me['division_name']) ? ' (' . $me['division_name'] . ')' : '');

    try {
        Notify::toUser((int) $assignee, 'todo.assigned',
            'Tugas baru dari rekan kerja',
            $byLabel . ' menugaskan: ' . mb_substr($title, 0, 120)
                . ($deadline ? ' · deadline ' . $deadline : ''),
            '/todo', (int) $u['id']);
        Notify::toAllAdmins('todo.self_created',
            'Tugas antar staf ditambahkan',
            $byLabel . ' menugaskan "' . mb_substr($title, 0, 100) . '" ke ' . $target['full_name'] . '.',
            '/todo', (int) $u['id']);
    } catch (\Throwable $e) {
        error_log('[premiere][staff-work][notify] ' . $e->getMessage());
    }

    Http::json(['ok' => true, 'record' => pg_todo_out($newId)]);
});

pg_route('GET', '/staff-work-file', function (): void {
    Guard::user();
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT * FROM todo_attachments WHERE id = ?", [$id]);
    if (!$row || ($row['kind'] ?? '') === 'link' || empty($row['file_path'])) {
        Http::fail('File tidak ditemukan.', 404);
    }
    if (!headers_sent()) {
        header_remove('Pragma');
        header_remove('Expires');
    }
    $download = Http::query('download', '0') === '1';
    Storage::serveFile(
        $row['file_path'],
        (string) ($row['mime'] ?: 'application/octet-stream'),
        (string) ($row['original_name'] ?: 'lampiran'),
        $download
    );
});
