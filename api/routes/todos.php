<?php
declare(strict_types=1);

/**
 * Todo List. Admin manages (todo.manage); employees read their own via
 * /api/bootstrap. Full CRUD is wired here so the Admin "Buat Todo" flow can
 * be activated in a later phase without touching the API again.
 *
 *   POST   /api/todos            { title, description?, divisionId?, assigneeId?, priority?, status?, progress?, deadline? }
 *   PATCH  /api/todos/{id}       partial (same fields)
 *   DELETE /api/todos/{id}
 */

function pg_todo_out(int $id): array
{
    return fmt_todo(Db::one(
        "SELECT t.*, cu.full_name AS creator_name, cd.name AS creator_division_name
           FROM todos t
           LEFT JOIN users cu ON cu.id = t.created_by_user_id
           LEFT JOIN divisions cd ON cd.id = cu.division_id
          WHERE t.id = ?",
        [$id]
    ));
}

pg_route('POST', '/todos', function (): void {
    $admin = Guard::can('todo.manage');
    $body  = Http::body();

    $title    = Validate::str($body['title'] ?? '', 'Judul todo', 1, 200);
    $desc     = Validate::optStr($body['description'] ?? null, 5000);
    $note     = Validate::optStr($body['userNote'] ?? null, 5000);
    $assignee = pg_resolve_fk($body['assigneeId'] ?? null, 'users', 'Karyawan');
    // Division is NOT entered by hand — it follows the assignee's division
    // (configured in Manajemen Tim & Divisi). Team todos (no PIC) fall back to
    // an explicitly passed divisionId, if any.
    $divId = $assignee
        ? (Db::one("SELECT division_id FROM users WHERE id = ?", [$assignee])['division_id'] ?? null)
        : pg_resolve_fk($body['divisionId'] ?? null, 'divisions', 'Divisi');
    $priority = Validate::enum($body['priority'] ?? 'mid', ['high', 'mid', 'low'], 'Prioritas');
    $status   = Validate::enum($body['status'] ?? 'todo', ['todo', 'in_progress', 'done'], 'Status');
    $progress = max(0, min(100, (int) ($body['progress'] ?? 0)));
    $deadline = isset($body['deadline']) && $body['deadline'] !== '' ? Validate::date($body['deadline'], 'Deadline') : null;
    $completedAt = $status === 'done' ? date('Y-m-d H:i:s') : null;

    Db::run(
        "INSERT INTO todos (title, description, user_note, division_id, assignee_id, created_by_admin_id, priority, status, progress, deadline, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [$title, $desc, $note, $divId, $assignee, $admin['id'], $priority, $status, $progress, $deadline, $completedAt]
    );
    $newTodoId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID
    if ($assignee) {
        Notify::toUser((int) $assignee, 'todo.assigned',
            'Tugas baru untuk Anda',
            'Admin menugaskan: ' . mb_substr($title, 0, 120)
                . ($deadline ? ' · deadline ' . $deadline : ''),
            '/todo');
    }
    Http::json(['ok' => true, 'record' => pg_todo_out($newTodoId)]);
});

/**
 * POST /api/my-todos  { title, description?, userNote?, priority?, deadline? }
 * ------------------------------------------------------------
 * A KARYAWAN creates a todo for themselves. It is assigned to them, tagged in
 * their division, and marked created_by_user_id so it shows up (labelled) in
 * the Admin Todo List.
 */
pg_route('POST', '/my-todos', function (): void {
    $u    = Guard::user();
    $body = Http::body();

    $title    = Validate::str($body['title'] ?? '', 'Judul todo', 1, 200);
    $desc     = Validate::optStr($body['description'] ?? null, 5000);
    $note     = Validate::optStr($body['userNote'] ?? null, 5000);
    $priority = Validate::enum($body['priority'] ?? 'mid', ['high', 'mid', 'low'], 'Prioritas');
    $deadline = isset($body['deadline']) && $body['deadline'] !== '' ? Validate::date($body['deadline'], 'Deadline') : null;

    Db::run(
        "INSERT INTO todos (title, description, user_note, division_id, assignee_id, created_by_user_id, priority, status, progress, deadline)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'todo', 0, ?)",
        [$title, $desc, $note, $u['division_id'] ?: null, $u['id'], $u['id'], $priority, $deadline]
    );
    $newTodoId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID

    Notify::toAllAdmins('todo.self_created',
        'Todo dibuat karyawan',
        Notify::userName((int) $u['id']) . ' menambahkan todo sendiri: ' . mb_substr($title, 0, 120),
        '/todo', (int) $u['id']);

    Http::json(['ok' => true, 'record' => pg_todo_out($newTodoId)]);
});

/**
 * PATCH  /api/my-todos/{id}   { title?, description?, priority?, deadline? }
 * DELETE /api/my-todos/{id}
 * ------------------------------------------------------------
 * The EMPLOYEE side: a user may edit or delete ONLY a todo they created for
 * themselves (created_by_user_id === them) — never one an admin assigned to
 * them. Status/progress for an assigned todo still go through
 * /todos/{id}/status; this pair never touches assignment, division, or status.
 */
pg_route('PATCH', '/my-todos/{id}', function (array $p): void {
    $u    = Guard::user();
    $id   = (int) $p['id'];
    $todo = Db::one("SELECT * FROM todos WHERE id = ?", [$id]);
    if (!$todo) {
        Http::json(['ok' => false, 'error' => 'Todo tidak ditemukan.'], 200);
    }
    if ((int) ($todo['created_by_user_id'] ?? 0) !== $u['id']) {
        Http::json(['ok' => false, 'error' => 'Anda hanya bisa mengubah todo yang Anda buat sendiri.'], 200);
    }

    $body = Http::body();
    $set  = [];
    $args = [];
    if (array_key_exists('title', $body)) {
        $set[] = 'title = ?';
        $args[] = Validate::str($body['title'], 'Judul todo', 1, 200);
    }
    if (array_key_exists('description', $body)) {
        $set[] = 'description = ?';
        $args[] = Validate::optStr($body['description'], 5000);
    }
    if (array_key_exists('priority', $body)) {
        $set[] = 'priority = ?';
        $args[] = Validate::enum($body['priority'], ['high', 'mid', 'low'], 'Prioritas');
    }
    if (array_key_exists('deadline', $body)) {
        $set[] = 'deadline = ?';
        $args[] = ($body['deadline'] === '' || $body['deadline'] === null) ? null : Validate::date($body['deadline'], 'Deadline');
    }
    if (!$set) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }
    $args[] = $id;
    Db::run("UPDATE todos SET " . implode(', ', $set) . " WHERE id = ?", $args);

    Http::json(['ok' => true, 'record' => pg_todo_out($id)]);
});

pg_route('DELETE', '/my-todos/{id}', function (array $p): void {
    $u    = Guard::user();
    $id   = (int) $p['id'];
    $todo = Db::one("SELECT * FROM todos WHERE id = ?", [$id]);
    if (!$todo) {
        Http::json(['ok' => false, 'error' => 'Todo tidak ditemukan.'], 200);
    }
    if ((int) ($todo['created_by_user_id'] ?? 0) !== $u['id']) {
        Http::json(['ok' => false, 'error' => 'Anda hanya bisa menghapus todo yang Anda buat sendiri.'], 200);
    }
    foreach (Db::all("SELECT file_path FROM todo_attachments WHERE todo_id = ? AND file_path IS NOT NULL", [$id]) as $a) {
        Storage::remove($a['file_path']);
    }
    Db::run("DELETE FROM todos WHERE id = ?", [$id]); // todo_attachments cascade
    Http::json(['ok' => true]);
});

pg_route('PATCH', '/todos/{id}', function (array $p): void {
    Guard::can('todo.manage');
    $id = (int) $p['id'];
    $before = Db::one("SELECT assignee_id, title, deadline, priority FROM todos WHERE id = ?", [$id]);
    if (!$before) {
        Http::json(['ok' => false, 'error' => 'Todo tidak ditemukan.'], 200);
    }
    $body = Http::body();
    $set = [];
    $args = [];

    $simple = [
        'title'       => fn($v) => Validate::str($v, 'Judul todo', 1, 200),
        'description' => fn($v) => Validate::optStr($v, 5000),
        'priority'    => fn($v) => Validate::enum($v, ['high', 'mid', 'low'], 'Prioritas'),
        'status'      => fn($v) => Validate::enum($v, ['todo', 'in_progress', 'done'], 'Status'),
    ];
    foreach ($simple as $key => $fn) {
        if (array_key_exists($key, $body)) {
            $col = $key === 'description' ? 'description' : $key;
            $set[] = "$col = ?";
            $args[] = $fn($body[$key]);
        }
    }
    // Stamp / clear the completion time so KPI can measure "selesai tepat waktu".
    if (array_key_exists('status', $body)) {
        $set[] = $body['status'] === 'done'
            ? 'completed_at = COALESCE(completed_at, NOW())'
            : 'completed_at = NULL';
    }
    if (array_key_exists('userNote', $body)) {
        $set[] = 'user_note = ?';
        $args[] = Validate::optStr($body['userNote'], 5000);
    }
    $reassignedTo = null;
    if (array_key_exists('assigneeId', $body)) {
        $newAssignee = pg_resolve_fk($body['assigneeId'], 'users', 'Karyawan');
        $prevAssignee = Db::one("SELECT assignee_id FROM todos WHERE id = ?", [$id])['assignee_id'] ?? null;
        if ($newAssignee && (string) $newAssignee !== (string) $prevAssignee) {
            $reassignedTo = (int) $newAssignee;
        }
        $set[] = 'assignee_id = ?';
        $args[] = $newAssignee;
        // Keep the division in sync with the (new) assignee automatically.
        if ($newAssignee && !array_key_exists('divisionId', $body)) {
            $set[] = 'division_id = ?';
            $args[] = Db::one("SELECT division_id FROM users WHERE id = ?", [$newAssignee])['division_id'] ?? null;
        }
    }
    if (array_key_exists('divisionId', $body)) {
        $set[] = 'division_id = ?';
        $args[] = pg_resolve_fk($body['divisionId'], 'divisions', 'Divisi');
    }
    if (array_key_exists('progress', $body)) {
        $set[] = 'progress = ?';
        $args[] = max(0, min(100, (int) $body['progress']));
    }
    if (array_key_exists('deadline', $body)) {
        $set[] = 'deadline = ?';
        $args[] = ($body['deadline'] === '' || $body['deadline'] === null) ? null : Validate::date($body['deadline'], 'Deadline');
    }
    if (!$set) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }
    $args[] = $id;
    Db::run("UPDATE todos SET " . implode(', ', $set) . " WHERE id = ?", $args);

    $after = Db::one("SELECT assignee_id, title, deadline, priority FROM todos WHERE id = ?", [$id]);
    if ($reassignedTo) {
        Notify::toUser($reassignedTo, 'todo.assigned',
            'Tugas baru untuk Anda',
            'Admin menugaskan: ' . mb_substr((string) ($after['title'] ?? 'Tugas'), 0, 120)
                . (!empty($after['deadline']) ? ' · deadline ' . $after['deadline'] : ''),
            '/todo');
    } elseif (!empty($after['assignee_id'])) {
        // Existing assignee, no reassign — tell them if something meaningful changed.
        $changed = ($before['title'] !== $after['title'])
            || ((string) $before['deadline'] !== (string) $after['deadline'])
            || ($before['priority'] !== $after['priority'])
            || array_key_exists('description', $body);
        if ($changed) {
            $bits = [];
            if ($before['title'] !== $after['title']) { $bits[] = 'judul'; }
            if ((string) $before['deadline'] !== (string) $after['deadline']) {
                $bits[] = $after['deadline'] ? 'deadline ' . $after['deadline'] : 'deadline dihapus';
            }
            if ($before['priority'] !== $after['priority']) { $bits[] = 'prioritas'; }
            Notify::toUser((int) $after['assignee_id'], 'todo.updated',
                'Todo Anda diperbarui admin',
                mb_substr((string) $after['title'], 0, 100) . ($bits ? ' — perubahan: ' . implode(', ', $bits) : ''),
                '/todo');
        }
    }
    Http::json(['ok' => true, 'record' => pg_todo_out($id)]);
});

pg_route('DELETE', '/todos/{id}', function (array $p): void {
    Guard::can('todo.manage');
    $id = (int) $p['id'];
    foreach (Db::all("SELECT file_path FROM todo_attachments WHERE todo_id = ? AND file_path IS NOT NULL", [$id]) as $a) {
        Storage::remove($a['file_path']);
    }
    $n = Db::exec("DELETE FROM todos WHERE id = ?", [$id]); // todo_attachments cascade
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => 'Todo tidak ditemukan.']);
});

/** Cutoff: a todo is "stale" when it was completed before this date (1 week ago). */
function pg_todo_stale_cutoff(): string
{
    return date('Y-m-d', strtotime('-7 days'));
}

/**
 * POST /api/todos/purge-stale   { before?: "YYYY-MM-DD" }
 * Hapus permanen SEMUA todo yang sudah SELESAI (status = 'done') dan
 * completed_at-nya sebelum `before` (default: 1 minggu lalu), beserta
 * file lampirannya. Todo yang belum selesai tidak pernah tersentuh.
 */
pg_route('POST', '/todos/purge-stale', function (): void {
    Guard::can('todo.manage');

    $maxBefore = pg_todo_stale_cutoff();
    $before = (string) (Http::body()['before'] ?? '');
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $before) || $before > $maxBefore) {
        $before = $maxBefore;
    }

    $ids = array_map(
        fn($r) => (int) $r['id'],
        Db::all("SELECT id FROM todos WHERE status = 'done' AND completed_at IS NOT NULL AND completed_at < ?", [$before . ' 00:00:00'])
    );
    if (!$ids) {
        Http::json(['ok' => true, 'removed' => 0, 'filesRemoved' => 0, 'before' => $before]);
    }

    $ph = implode(',', array_fill(0, count($ids), '?'));
    $filesRemoved = 0;
    foreach (Db::all("SELECT file_path FROM todo_attachments WHERE todo_id IN ($ph) AND file_path IS NOT NULL", $ids) as $a) {
        Storage::remove($a['file_path']);
        $filesRemoved++;
    }
    Db::exec("DELETE FROM todos WHERE id IN ($ph)", $ids); // todo_attachments cascade

    Http::json(['ok' => true, 'removed' => count($ids), 'filesRemoved' => $filesRemoved, 'before' => $before]);
});

/**
 * PATCH /api/todos/{id}/status   { status?, progress? }
 * ------------------------------------------------------------
 * The EMPLOYEE side: a user may move ONLY their own assigned todo along
 * (status + progress). Everything else about a todo stays admin-only.
 */
pg_route('PATCH', '/todos/{id}/status', function (array $p): void {
    $u   = Guard::user();
    $id  = (int) $p['id'];
    $todo = Db::one("SELECT * FROM todos WHERE id = ?", [$id]);
    if (!$todo) {
        Http::json(['ok' => false, 'error' => 'Todo tidak ditemukan.'], 200);
    }
    if ((string) $todo['assignee_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Todo ini bukan tugas Anda.'], 200);
    }

    $body = Http::body();
    $statusExplicit   = array_key_exists('status', $body);
    $progressExplicit = array_key_exists('progress', $body);
    $noteExplicit     = array_key_exists('note', $body);
    if (!$statusExplicit && !$progressExplicit && !$noteExplicit) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }

    $status   = $statusExplicit
        ? Validate::enum($body['status'], ['todo', 'in_progress', 'done'], 'Status')
        : $todo['status'];
    $progress = $progressExplicit
        ? max(0, min(100, (int) $body['progress']))
        : (int) $todo['progress'];

    // Keep status and progress consistent.
    if ($statusExplicit) {
        if ($status === 'done') {
            $progress = 100;
        } elseif ($status === 'todo' && !$progressExplicit) {
            $progress = 0;
        }
    } elseif ($progressExplicit) {
        if ($progress >= 100) {
            $status = 'done';
        } elseif ($progress > 0) {
            $status = 'in_progress';
        } else {
            $status = 'todo';
        }
    }
    if ($status === 'done') {
        $progress = 100;
    }

    // Completion timestamp for KPI ("selesai" / "selesai tepat waktu").
    $compl = $status === 'done' ? 'COALESCE(completed_at, NOW())' : 'NULL';

    if ($noteExplicit) {
        Db::exec(
            "UPDATE todos SET status = ?, progress = ?, completed_at = $compl, user_note = ? WHERE id = ?",
            [$status, $progress, Validate::optStr($body['note'], 5000), $id]
        );
    } else {
        Db::exec("UPDATE todos SET status = ?, progress = ?, completed_at = $compl WHERE id = ?", [$status, $progress, $id]);
    }

    // Notify admins when the assignee just completed the task.
    if ($status === 'done' && $todo['status'] !== 'done') {
        Notify::toAllAdmins('todo.done',
            'Todo diselesaikan',
            Notify::userName((int) $u['id']) . ' menyelesaikan todo: ' . mb_substr((string) $todo['title'], 0, 120),
            '/todo', (int) $u['id']);
    }

    Http::json(['ok' => true, 'record' => pg_todo_out($id)]);
});

/* ============================================================
   TODO ATTACHMENTS  (work-report supporting files)
   ------------------------------------------------------------
   Photos / documents / links attached by the assignee. The admin
   sees them read-only in the todo detail + the archive page.
   ============================================================ */

function pg_todo_or_404(int $id): array
{
    $t = Db::one("SELECT * FROM todos WHERE id = ?", [$id]);
    if (!$t) {
        Http::json(['ok' => false, 'error' => 'Todo tidak ditemukan.'], 200);
    }
    return $t;
}

/** GET /api/todos/{id}/attachments — assignee or any admin. */
pg_route('GET', '/todos/{id}/attachments', function (array $p): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    $id   = (int) $p['id'];
    $todo = pg_todo_or_404($id);
    if ($pr['kind'] === 'user' && (string) $todo['assignee_id'] !== (string) $pr['id']) {
        Http::json(['ok' => false, 'error' => 'Todo ini bukan tugas Anda.'], 200);
    }
    $rows = Db::all(
        "SELECT a.*, u.full_name AS uploader_name
           FROM todo_attachments a
           LEFT JOIN users u ON u.id = a.user_id
          WHERE a.todo_id = ?
          ORDER BY a.created_at DESC, a.id DESC",
        [$id]
    );
    Http::json(['ok' => true, 'items' => array_map('fmt_attachment', $rows)]);
});

/** POST /api/todos/{id}/attachments — assignee only.
 *   multipart:  file=<upload>  [label=<text>]
 *   json:       { "kind":"link", "url":"https://…", "label":"…" }
 */
pg_route('POST', '/todos/{id}/attachments', function (array $p): void {
    $u    = Guard::user();
    $id   = (int) $p['id'];
    $todo = pg_todo_or_404($id);
    if ((string) $todo['assignee_id'] !== (string) $u['id']) {
        Http::json(['ok' => false, 'error' => 'Todo ini bukan tugas Anda.'], 200);
    }

    $count = (int) (Db::one("SELECT COUNT(*) c FROM todo_attachments WHERE todo_id = ?", [$id])['c'] ?? 0);
    if ($count >= 40) {
        Http::json(['ok' => false, 'error' => 'Lampiran untuk satu todo maksimal 40.'], 200);
    }

    // ---- link ----
    $body = Http::body();
    if (($body['kind'] ?? null) === 'link' || (!isset($_FILES['file']) && !empty($body['url']))) {
        $url = trim((string) ($body['url'] ?? ''));
        if (!preg_match('#^https?://.+#i', $url) || mb_strlen($url) > 1000) {
            Http::json(['ok' => false, 'error' => 'Link harus berupa URL http(s) yang valid.'], 200);
        }
        $label = Validate::optStr($body['label'] ?? null, 255);
        Db::run(
            "INSERT INTO todo_attachments (todo_id, user_id, kind, url, label) VALUES (?, ?, 'link', ?, ?)",
            [$id, $u['id'], $url, $label]
        );
    } else {
        // ---- file upload (multipart) ----
        if (!isset($_FILES['file']) || !is_array($_FILES['file'])) {
            Http::json(['ok' => false, 'error' => 'Tidak ada file yang dipilih.'], 200);
        }
        $saved = Storage::saveUpload($_FILES['file'], 'todo');
        $label = Validate::optStr($_POST['label'] ?? null, 255);
        Db::run(
            "INSERT INTO todo_attachments (todo_id, user_id, kind, file_path, original_name, mime, size_bytes, label)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [$id, $u['id'], $saved['kind'], $saved['path'], $saved['name'], $saved['mime'], $saved['size'], $label]
        );
    }

    $attId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID
    Notify::toAllAdmins('todo.attachment',
        'Lampiran laporan kerja',
        Notify::userName((int) $u['id']) . ' menambahkan lampiran pada todo: ' . mb_substr((string) $todo['title'], 0, 110),
        '/todo', (int) $u['id']);

    $row = Db::one(
        "SELECT a.*, u.full_name AS uploader_name
           FROM todo_attachments a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.id = ?",
        [$attId]
    );
    Http::json(['ok' => true, 'record' => fmt_attachment($row)]);
});
