<?php
declare(strict_types=1);

/**
 * Program — program kerja yang dibuat Admin dan terintegrasi dengan Todo List.
 * ------------------------------------------------------------
 *   GET    /api/programs               (admin)  daftar program + agregat
 *   GET    /api/programs/{id}          (admin ATAU karyawan yg bertugas) detail + daftar tugas
 *   POST   /api/programs               (admin)  multipart: fields + cover + tasks(JSON)
 *   PATCH  /api/programs/{id}          (admin)  ubah field + sinkron daftar tugas
 *   POST   /api/programs/{id}/cover    (admin)  ganti cover (multipart: cover)
 *   DELETE /api/programs/{id}          (admin)  hapus program + semua todo & file-nya
 *   GET    /api/program-cover?id=..    (login)  stream gambar cover
 *
 * Setiap "tugas" dalam program = satu baris `todos` dengan `program_id` di-set,
 * di-assign ke karyawan yang dipilih. Menghapus program → todo-nya ikut CASCADE.
 */

const PG_PROGRAM_COVER_CAP = 8388608; // 8 MB

function pg_program_select(?int $forUserId): string
{
    $mine = $forUserId !== null
        ? ", (SELECT COUNT(*) FROM todos t WHERE t.program_id = p.id AND t.assignee_id = " . $forUserId . ") AS my_task_count"
        . ", (SELECT COUNT(*) FROM todos t WHERE t.program_id = p.id AND t.assignee_id = " . $forUserId . " AND t.status = 'done') AS my_done_count"
        : '';
    return "SELECT p.*, adm.name AS created_by_name,
                   (SELECT COUNT(*) FROM todos t WHERE t.program_id = p.id) AS task_count,
                   (SELECT COUNT(*) FROM todos t WHERE t.program_id = p.id AND t.status = 'done') AS done_count,
                   (SELECT COUNT(DISTINCT t.assignee_id) FROM todos t WHERE t.program_id = p.id) AS assignee_count
                   $mine
              FROM programs p
              LEFT JOIN admins adm ON adm.id = p.created_by_admin_id";
}

function pg_program_task_out(array $r): array
{
    return [
        'id'               => id_str($r['id']),
        'title'            => $r['title'],
        'description'      => $r['description'] ?? null,
        'status'          => $r['status'],
        'progress'        => (int) $r['progress'],
        'deadline'        => $r['deadline'],
        'completedAt'     => dt($r['completed_at'] ?? null),
        'assigneeId'      => id_str($r['assignee_id']),
        'assigneeName'    => $r['assignee_name'] ?? null,
        'assigneeUsername' => $r['assignee_username'] ?? null,
        'divisionName'    => $r['division_name'] ?? null,
    ];
}

function pg_program_full(int $id, ?int $forUserId): ?array
{
    $p = Db::one(pg_program_select($forUserId) . " WHERE p.id = ?", [$id]);
    if (!$p) {
        return null;
    }
    $tasks = Db::all(
        "SELECT t.id, t.title, t.description, t.status, t.progress, t.deadline, t.completed_at,
                t.assignee_id, u.full_name AS assignee_name, u.username AS assignee_username,
                d.name AS division_name
           FROM todos t
           LEFT JOIN users u ON u.id = t.assignee_id
           LEFT JOIN divisions d ON d.id = t.division_id
          WHERE t.program_id = ?
          ORDER BY u.full_name IS NULL, u.full_name, t.id",
        [$id]
    );
    return [
        'program' => fmt_program($p),
        'tasks'   => array_map('pg_program_task_out', $tasks),
    ];
}

/** Parse & validate the tasks payload -> list of [userId, title]. */
function pg_program_tasks_in(mixed $raw): array
{
    if (is_string($raw)) {
        $raw = json_decode($raw, true);
    }
    if (!is_array($raw) || !$raw) {
        Http::fail('Tambahkan minimal satu karyawan beserta tugasnya.', 422);
    }
    $out = [];
    foreach ($raw as $row) {
        if (!is_array($row)) {
            continue;
        }
        $uid   = pg_resolve_fk($row['userId'] ?? null, 'users', 'Karyawan');
        $title = Validate::str($row['title'] ?? '', 'Tugas karyawan', 1, 200);
        if (!$uid) {
            Http::fail('Pilih karyawan untuk setiap tugas.', 422);
        }
        $out[] = ['id' => isset($row['id']) && $row['id'] !== '' ? (int) $row['id'] : null, 'userId' => $uid, 'title' => $title];
    }
    if (!$out) {
        Http::fail('Tambahkan minimal satu karyawan beserta tugasnya.', 422);
    }
    return $out;
}

function pg_program_spawn_todo(int $programId, int $userId, string $title, int $adminId, ?string $deadline): void
{
    $divId = Db::one("SELECT division_id FROM users WHERE id = ?", [$userId])['division_id'] ?? null;
    Db::run(
        "INSERT INTO todos (title, division_id, assignee_id, program_id, created_by_admin_id, priority, status, progress, deadline)
         VALUES (?, ?, ?, ?, ?, 'mid', 'todo', 0, ?)",
        [$title, $divId, $userId, $programId, $adminId, $deadline]
    );
}

/* ---------- reads ---------- */

pg_route('GET', '/programs', function (): void {
    Guard::can('todo.manage');
    $rows = Db::all(pg_program_select(null) . " ORDER BY p.status = 'archived', p.end_date DESC, p.id DESC");
    Http::json(['ok' => true, 'items' => array_map('fmt_program', $rows)]);
});

pg_route('GET', '/programs/{id}', function (array $p): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    $id  = (int) $p['id'];
    $uid = $pr['kind'] === 'user' ? (int) $pr['id'] : null;

    if ($pr['kind'] !== 'admin') {
        $has = Db::one("SELECT 1 FROM todos WHERE program_id = ? AND assignee_id = ? LIMIT 1", [$id, $uid]);
        if (!$has) {
            Http::fail('Anda tidak terlibat dalam program ini.', 403);
        }
    }
    $full = pg_program_full($id, $uid);
    if (!$full) {
        Http::fail('Program tidak ditemukan.', 404);
    }
    Http::json(['ok' => true] + $full);
});

/* ---------- writes (admin) ---------- */

pg_route('POST', '/programs', function (): void {
    $admin = Guard::can('todo.manage');
    $b     = Http::body(); // multipart -> $_POST, else JSON

    $name  = Validate::str($b['name'] ?? '', 'Nama program', 1, 160);
    $desc  = Validate::optStr($b['description'] ?? null, 5000);
    $start = Validate::date($b['startDate'] ?? '', 'Tanggal mulai');
    $end   = Validate::date($b['endDate'] ?? '', 'Tanggal berakhir');
    if ($end < $start) {
        Http::fail('Tanggal berakhir tidak boleh sebelum tanggal mulai.', 422);
    }
    $status = Validate::enum($b['status'] ?? 'active', ['active', 'archived'], 'Status');
    $tasks  = pg_program_tasks_in($b['tasks'] ?? null);

    $coverPath = null;
    if (isset($_FILES['cover']) && is_array($_FILES['cover']) && ($_FILES['cover']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_OK) {
        $saved = Storage::saveUpload($_FILES['cover'], 'program', PG_PROGRAM_COVER_CAP);
        if ($saved['kind'] !== 'image') {
            Storage::remove($saved['path']);
            Http::fail('Cover program harus berupa gambar (JPG, PNG, atau WebP).', 422);
        }
        $coverPath = $saved['path'];
    }

    Db::run(
        "INSERT INTO programs (name, description, start_date, end_date, cover_path, status, created_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [$name, $desc, $start, $end, $coverPath, $status, (int) $admin['id']]
    );
    $id = (int) Db::lastId();
    $notified = [];
    foreach ($tasks as $t) {
        pg_program_spawn_todo($id, $t['userId'], $t['title'], (int) $admin['id'], $end);
        $uidT = (int) $t['userId'];
        if ($uidT && !isset($notified[$uidT])) {
            $notified[$uidT] = true;
            Notify::toUser($uidT, 'program.assigned',
                'Anda dilibatkan di program baru',
                'Program "' . mb_substr($name, 0, 100) . '" — tugas Anda otomatis masuk ke Todo List. Deadline ' . $end . '.',
                '/program');
        }
    }

    Http::json(['ok' => true, 'record' => fmt_program(Db::one(pg_program_select(null) . " WHERE p.id = ?", [$id]))]
        + pg_program_full($id, null));
});

pg_route('PATCH', '/programs/{id}', function (array $p): void {
    $admin = Guard::can('todo.manage');
    $id    = (int) $p['id'];
    $cur   = Db::one("SELECT * FROM programs WHERE id = ?", [$id]);
    if (!$cur) {
        Http::json(['ok' => false, 'error' => 'Program tidak ditemukan.'], 200);
    }
    $b = Http::body();

    $set  = [];
    $args = [];
    if (array_key_exists('name', $b)) {
        $set[] = 'name = ?';
        $args[] = Validate::str($b['name'], 'Nama program', 1, 160);
    }
    if (array_key_exists('description', $b)) {
        $set[] = 'description = ?';
        $args[] = Validate::optStr($b['description'], 5000);
    }
    $newStart = array_key_exists('startDate', $b) ? Validate::date($b['startDate'], 'Tanggal mulai') : $cur['start_date'];
    $newEnd   = array_key_exists('endDate', $b)   ? Validate::date($b['endDate'], 'Tanggal berakhir') : $cur['end_date'];
    if ($newEnd < $newStart) {
        Http::fail('Tanggal berakhir tidak boleh sebelum tanggal mulai.', 422);
    }
    if (array_key_exists('startDate', $b)) {
        $set[] = 'start_date = ?';
        $args[] = $newStart;
    }
    if (array_key_exists('endDate', $b)) {
        $set[] = 'end_date = ?';
        $args[] = $newEnd;
    }
    if (array_key_exists('status', $b)) {
        $set[] = 'status = ?';
        $args[] = Validate::enum($b['status'], ['active', 'archived'], 'Status');
    }
    if ($set) {
        $a2 = $args;
        $a2[] = $id;
        Db::run("UPDATE programs SET " . implode(', ', $set) . " WHERE id = ?", $a2);
    }
    // Deadline program berubah -> samakan deadline semua todo program ini.
    if (array_key_exists('endDate', $b) && $newEnd !== $cur['end_date']) {
        Db::run("UPDATE todos SET deadline = ? WHERE program_id = ?", [$newEnd, $id]);
    }

    // Sinkron daftar tugas (opsional).
    $newTaskUsers = [];
    if (array_key_exists('tasks', $b)) {
        $incoming = pg_program_tasks_in($b['tasks']);
        $existing = [];
        foreach (Db::all("SELECT id FROM todos WHERE program_id = ?", [$id]) as $r) {
            $existing[(int) $r['id']] = true;
        }
        $keep = [];
        foreach ($incoming as $t) {
            if ($t['id'] && isset($existing[$t['id']])) {
                $keep[$t['id']] = true;
                $divId = Db::one("SELECT division_id FROM users WHERE id = ?", [$t['userId']])['division_id'] ?? null;
                Db::run(
                    "UPDATE todos SET title = ?, assignee_id = ?, division_id = ? WHERE id = ? AND program_id = ?",
                    [$t['title'], $t['userId'], $divId, $t['id'], $id]
                );
            } else {
                pg_program_spawn_todo($id, $t['userId'], $t['title'], (int) $admin['id'], $newEnd);
                if ((int) $t['userId'] > 0) { $newTaskUsers[(int) $t['userId']] = true; }
            }
        }
        $remove = array_values(array_filter(array_keys($existing), fn($tid) => !isset($keep[$tid])));
        if ($remove) {
            $ph = implode(',', array_fill(0, count($remove), '?'));
            foreach (Db::all("SELECT file_path FROM todo_attachments WHERE todo_id IN ($ph) AND file_path IS NOT NULL", $remove) as $a) {
                Storage::remove($a['file_path']);
            }
            Db::exec("DELETE FROM todos WHERE id IN ($ph) AND program_id = ?", array_merge($remove, [$id]));
        }
    }

    // --- notify participants ---
    $partIds = array_map(fn($r) => (int) $r['assignee_id'],
        Db::all("SELECT DISTINCT assignee_id FROM todos WHERE program_id = ? AND assignee_id IS NOT NULL", [$id]));
    $pname = mb_substr((string) $cur['name'], 0, 100);
    $newStatus = array_key_exists('status', $b) ? $b['status'] : $cur['status'];

    if (array_key_exists('status', $b) && $newStatus !== $cur['status']) {
        foreach ($partIds as $pid) {
            Notify::toUser($pid,
                $newStatus === 'archived' ? 'program.archived' : 'program.reactivated',
                $newStatus === 'archived' ? 'Program diarsipkan' : 'Program diaktifkan kembali',
                'Program "' . $pname . '" ' . ($newStatus === 'archived'
                    ? 'diarsipkan admin. Tugasnya tetap ada di Todo List Anda.'
                    : 'kembali aktif.'),
                '/program');
        }
    } elseif (array_key_exists('endDate', $b) && $newEnd !== $cur['end_date']) {
        foreach ($partIds as $pid) {
            Notify::toUser($pid, 'program.deadline_changed',
                'Deadline program diperbarui',
                'Deadline program "' . $pname . '" kini ' . $newEnd . '. Todo terkait ikut diperbarui.',
                '/program');
        }
    }
    foreach (array_keys($newTaskUsers) as $pid) {
        Notify::toUser($pid, 'program.assigned',
            'Anda dilibatkan di program',
            'Anda mendapat tugas baru di program "' . $pname . '". Cek Todo List Anda.',
            '/program');
    }

    Http::json(['ok' => true, 'record' => fmt_program(Db::one(pg_program_select(null) . " WHERE p.id = ?", [$id]))]
        + pg_program_full($id, null));
});

pg_route('POST', '/programs/{id}/cover', function (array $p): void {
    Guard::can('todo.manage');
    $id  = (int) $p['id'];
    $cur = Db::one("SELECT * FROM programs WHERE id = ?", [$id]);
    if (!$cur) {
        Http::json(['ok' => false, 'error' => 'Program tidak ditemukan.'], 200);
    }
    if (!isset($_FILES['cover']) || !is_array($_FILES['cover'])) {
        Http::json(['ok' => false, 'error' => 'Tidak ada file cover.'], 200);
    }
    $saved = Storage::saveUpload($_FILES['cover'], 'program', PG_PROGRAM_COVER_CAP);
    if ($saved['kind'] !== 'image') {
        Storage::remove($saved['path']);
        Http::fail('Cover program harus berupa gambar (JPG, PNG, atau WebP).', 422);
    }
    if (!empty($cur['cover_path'])) {
        Storage::remove($cur['cover_path']);
    }
    Db::run("UPDATE programs SET cover_path = ? WHERE id = ?", [$saved['path'], $id]);
    Http::json(['ok' => true, 'record' => fmt_program(Db::one(pg_program_select(null) . " WHERE p.id = ?", [$id]))]);
});

pg_route('DELETE', '/programs/{id}', function (array $p): void {
    Guard::can('todo.manage');
    $id  = (int) $p['id'];
    $cur = Db::one("SELECT * FROM programs WHERE id = ?", [$id]);
    if (!$cur) {
        Http::json(['ok' => false, 'error' => 'Program tidak ditemukan.'], 200);
    }
    foreach (Db::all(
        "SELECT a.file_path FROM todo_attachments a JOIN todos t ON t.id = a.todo_id
          WHERE t.program_id = ? AND a.file_path IS NOT NULL",
        [$id]
    ) as $a) {
        Storage::remove($a['file_path']);
    }
    if (!empty($cur['cover_path'])) {
        Storage::remove($cur['cover_path']);
    }
    Db::exec("DELETE FROM programs WHERE id = ?", [$id]); // todos + todo_attachments cascade
    Http::json(['ok' => true]);
});

pg_route('GET', '/program-cover', function (): void {
    if (!Auth::principal()) {
        Http::fail('Perlu login untuk melihat gambar.', 401);
    }
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT cover_path FROM programs WHERE id = ?", [$id]);
    if (!$row || empty($row['cover_path'])) {
        Http::fail('Cover tidak ditemukan.', 404);
    }
    $ext  = strtolower(pathinfo((string) $row['cover_path'], PATHINFO_EXTENSION));
    $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'][$ext] ?? 'application/octet-stream';
    Storage::serveFile($row['cover_path'], $mime, 'cover.' . $ext, false);
});
