<?php
declare(strict_types=1);

/**
 * GET /api/photo?rec={attendance|overtime}&id={id}&slot={in|out|start|end}
 * ------------------------------------------------------------
 * Serves a stored selfie. Photos live on disk (path in the DB) and are NEVER
 * publicly reachable — this endpoint authorizes first:
 *   - the employee who owns the row, OR
 *   - any admin session.
 * The <img src> in the frontend is unchanged; the session cookie carries auth.
 */
pg_route('GET', '/photo', function (): void {
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login untuk melihat foto.', 401);
    }

    $rec  = Http::query('rec', '');
    $id   = (int) Http::query('id', '0');
    $slot = Http::query('slot', '');

    if ($id <= 0 || !in_array($rec, ['attendance', 'overtime', 'izin'], true)) {
        Http::fail('Permintaan foto tidak valid.', 400);
    }

    if ($rec === 'attendance') {
        $row = Db::one("SELECT user_id, check_in_photo, check_out_photo FROM attendances WHERE id = ?", [$id]);
        $col = $slot === 'out' ? 'check_out_photo' : 'check_in_photo';
    } elseif ($rec === 'izin') {
        $row = Db::one("SELECT user_id, photo FROM izin WHERE id = ?", [$id]);
        $col = 'photo';
    } else {
        $row = Db::one("SELECT user_id, start_photo, end_photo FROM overtimes WHERE id = ?", [$id]);
        $col = $slot === 'end' ? 'end_photo' : 'start_photo';
    }
    if (!$row) {
        Http::fail('Foto tidak ditemukan.', 404);
    }

    $isOwner = $p['kind'] === 'user' && (int) $p['id'] === (int) $row['user_id'];
    $isAdmin = $p['kind'] === 'admin';
    if (!$isOwner && !$isAdmin) {
        Http::fail('Anda tidak berhak melihat foto ini.', 403);
    }

    // Selfies never change once taken — let the client cache them. PHP's session
    // limiter queues Pragma:no-cache + Expires:(past) on every response; strip
    // them so the Cache-Control that Storage::serve sets is actually honoured.
    if (!headers_sent()) {
        header_remove('Pragma');
        header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 604800) . ' GMT');
    }

    Storage::serve($row[$col] ?? null); // never-returns; streams the file
});
