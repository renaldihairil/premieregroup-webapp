<?php
declare(strict_types=1);

/**
 * Todo attachment archive + file serving.
 *
 *   GET    /api/todo-attachments          admin: every attachment, all users (paged, filterable)
 *   GET    /api/todo-attachments/mine     user: attachments THIS user uploaded (paged)
 *   DELETE /api/todo-attachments/{id}     uploader or admin
 *   GET    /api/todo-file?id=..&download=1   stream one file (uploader or admin)
 */

function pg_attachment_page(int $per = 20): array
{
    $page = max(1, (int) Http::query('page', '1'));
    return [$page, $per, ($page - 1) * $per];
}

/** GET /api/todo-attachments — ADMIN archive of everything. */
pg_route('GET', '/todo-attachments', function (): void {
    Guard::admin();
    [$page, $per, $off] = pg_attachment_page();

    $where  = ['1=1'];
    $params = [];
    $kind = Http::query('kind', '');
    if (in_array($kind, ['image', 'file', 'link'], true)) {
        $where[] = 'a.kind = ?';
        $params[] = $kind;
    }
    $uid = (int) Http::query('userId', '0');
    if ($uid > 0) {
        $where[] = 'a.user_id = ?';
        $params[] = $uid;
    }
    $tid = (int) Http::query('todoId', '0');
    if ($tid > 0) {
        $where[] = 'a.todo_id = ?';
        $params[] = $tid;
    }
    $from = Http::query('from', '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $from)) {
        $where[] = 'a.created_at >= ?';
        $params[] = $from . ' 00:00:00';
    }
    $to = Http::query('to', '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string) $to)) {
        $where[] = 'a.created_at <= ?';
        $params[] = $to . ' 23:59:59';
    }
    $q = trim((string) Http::query('q', ''));
    if ($q !== '') {
        $where[] = '(t.title LIKE ? OR a.original_name LIKE ? OR a.label LIKE ? OR u.full_name LIKE ?)';
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like, $like);
    }
    $wsql = implode(' AND ', $where);

    $total = (int) (Db::one(
        "SELECT COUNT(*) c FROM todo_attachments a
           LEFT JOIN todos t ON t.id = a.todo_id
           LEFT JOIN users u ON u.id = a.user_id
          WHERE $wsql",
        $params
    )['c'] ?? 0);

    $rows = Db::all(
        "SELECT a.*, t.title AS todo_title, u.full_name AS uploader_name
           FROM todo_attachments a
           LEFT JOIN todos t ON t.id = a.todo_id
           LEFT JOIN users u ON u.id = a.user_id
          WHERE $wsql
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $per OFFSET $off",
        $params
    );

    Http::json([
        'ok'        => true,
        'items'     => array_map('fmt_attachment', $rows),
        'total'     => $total,
        'page'      => $page,
        'pageCount' => max(1, (int) ceil($total / $per)),
    ]);
});

/** GET /api/todo-attachments/mine — the caller's own uploads. */
pg_route('GET', '/todo-attachments/mine', function (): void {
    $u = Guard::user();
    [$page, $per, $off] = pg_attachment_page(10); // user archive: 10 cards / page

    $where  = ['a.user_id = ?'];
    $params = [$u['id']];
    $kind = Http::query('kind', '');
    if (in_array($kind, ['image', 'file', 'link'], true)) {
        $where[] = 'a.kind = ?';
        $params[] = $kind;
    }
    $tid = (int) Http::query('todoId', '0');
    if ($tid > 0) {
        $where[] = 'a.todo_id = ?';
        $params[] = $tid;
    }
    $q = trim((string) Http::query('q', ''));
    if ($q !== '') {
        $where[] = '(t.title LIKE ? OR a.original_name LIKE ? OR a.label LIKE ?)';
        $like = '%' . $q . '%';
        array_push($params, $like, $like, $like);
    }
    $wsql = implode(' AND ', $where);

    $total = (int) (Db::one(
        "SELECT COUNT(*) c FROM todo_attachments a LEFT JOIN todos t ON t.id = a.todo_id WHERE $wsql",
        $params
    )['c'] ?? 0);

    $rows = Db::all(
        "SELECT a.*, t.title AS todo_title
           FROM todo_attachments a
           LEFT JOIN todos t ON t.id = a.todo_id
          WHERE $wsql
          ORDER BY a.created_at DESC, a.id DESC
          LIMIT $per OFFSET $off",
        $params
    );

    Http::json([
        'ok'        => true,
        'items'     => array_map('fmt_attachment', $rows),
        'total'     => $total,
        'page'      => $page,
        'pageCount' => max(1, (int) ceil($total / $per)),
    ]);
});

/** DELETE /api/todo-attachments/{id} — the uploader, or any admin. */
pg_route('DELETE', '/todo-attachments/{id}', function (array $p): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM todo_attachments WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Lampiran tidak ditemukan.'], 200);
    }
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $row['user_id'];
    if (!$isOwner && $pr['kind'] !== 'admin') {
        Http::json(['ok' => false, 'error' => 'Anda tidak berhak menghapus lampiran ini.'], 200);
    }
    Db::run("DELETE FROM todo_attachments WHERE id = ?", [$id]);
    Storage::remove($row['file_path'] ?? null);
    Http::json(['ok' => true]);
});

/** GET /api/todo-file?id=..&download=1 — stream a stored attachment. */
pg_route('GET', '/todo-file', function (): void {
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login untuk melihat file.', 401);
    }
    $id  = (int) Http::query('id', '0');
    $row = Db::one("SELECT * FROM todo_attachments WHERE id = ?", [$id]);
    if (!$row || $row['kind'] === 'link') {
        Http::fail('File tidak ditemukan.', 404);
    }
    $isOwner = $pr['kind'] === 'user' && (string) $pr['id'] === (string) $row['user_id'];
    if (!$isOwner && $pr['kind'] !== 'admin') {
        Http::fail('Anda tidak berhak mengakses file ini.', 403);
    }
    $download = Http::query('download', '0') === '1';
    Storage::serveFile($row['file_path'], (string) $row['mime'], (string) $row['original_name'], $download);
});
