<?php
declare(strict_types=1);

/**
 * Private 1-to-1 chat ("Chat" — opened from the Momen page header).
 *
 * A thread links two principals; either can be a user or an admin. Any signed-in
 * principal may chat any other active principal. The pair is stored canonically
 * (side "a" = the (kind,id) that sorts first) so a thread is unique per pair no
 * matter who starts it. Each side keeps its own last_read_at → its unread count.
 *
 *   GET  /api/chat/contacts                       everyone I can start a chat with
 *   GET  /api/chat/threads                        my threads + total unread
 *   POST /api/chat/threads       {withKind,withId} get-or-create a thread
 *   GET  /api/chat/threads/{id}/messages          messages (marks my side read)
 *          ?beforeId=&limit=                       (paginates backwards)
 *   POST /api/chat/threads/{id}/messages {body}   send a message (+ notify)
 *   POST /api/chat/threads/{id}/read              mark my side read
 *
 * Notifications: each incoming message fires a `chat.message` notification to
 * the recipient (bell + Web Push), toggleable in Pengaturan → Notifikasi. The
 * link is `/momen#chat-<id>` so a tap lands on Momen and opens that thread.
 */

/* ---------- helpers ---------- */

function pg_chat_me(): array
{
    $pr = Auth::principal();
    if (!$pr) {
        Http::fail('Perlu login.', 401);
    }
    return ['kind' => $pr['kind'] === 'admin' ? 'admin' : 'user', 'id' => (int) $pr['id']];
}

/** Canonical pair order: 'admin' sorts before 'user', then by numeric id. */
function pg_chat_canon(string $k1, int $i1, string $k2, int $i2): array
{
    if ($k1 !== $k2) {
        return $k1 < $k2 ? [$k1, $i1, $k2, $i2] : [$k2, $i2, $k1, $i1];
    }
    return $i1 <= $i2 ? [$k1, $i1, $k2, $i2] : [$k2, $i2, $k1, $i1];
}

function pg_chat_is_participant(array $t, array $me): bool
{
    return (($t['a_kind'] === $me['kind'] && (int) $t['a_id'] === $me['id'])
         || ($t['b_kind'] === $me['kind'] && (int) $t['b_id'] === $me['id']));
}

function pg_chat_my_read_col(array $t, array $me): string
{
    return ($t['a_kind'] === $me['kind'] && (int) $t['a_id'] === $me['id']) ? 'a_last_read_at' : 'b_last_read_at';
}

function pg_chat_other(array $t, array $me): array
{
    if ($t['a_kind'] === $me['kind'] && (int) $t['a_id'] === $me['id']) {
        return ['kind' => $t['b_kind'], 'id' => (int) $t['b_id']];
    }
    return ['kind' => $t['a_kind'], 'id' => (int) $t['a_id']];
}

function pg_chat_mark_read(array $t, array $me): void
{
    $col = pg_chat_my_read_col($t, $me);
    Db::run("UPDATE chat_threads SET `$col` = NOW() WHERE id = ?", [(int) $t['id']]);
}

/** Display info for a principal, or null when it no longer exists. */
function pg_chat_principal_info(string $kind, int $id): ?array
{
    if ($kind === 'admin') {
        $r = Db::one("SELECT id, name, role, status FROM admins WHERE id = ?", [$id]);
        if (!$r) {
            return null;
        }
        return [
            'kind' => 'admin', 'id' => id_str($r['id']), 'name' => $r['name'],
            'role' => $r['role'], 'status' => $r['status'],
            'divisionName' => 'Admin', 'photoUrl' => null,
        ];
    }
    $r = Db::one(
        "SELECT u.id, u.full_name, u.role, u.status, u.photo_path, d.name AS division_name
           FROM users u LEFT JOIN divisions d ON d.id = u.division_id
          WHERE u.id = ? AND u.deleted_at IS NULL",
        [$id]
    );
    if (!$r) {
        return null;
    }
    return [
        'kind' => 'user', 'id' => id_str($r['id']), 'name' => $r['full_name'],
        'role' => $r['role'], 'status' => $r['status'],
        'divisionName' => $r['division_name'],
        'photoUrl' => !empty($r['photo_path'])
            ? ('api/profile-photo?id=' . (int) $r['id']
               . '&v=' . substr(pathinfo((string) $r['photo_path'], PATHINFO_FILENAME), 0, 12))
            : null,
    ];
}

function pg_chat_thread_unread(array $t, array $me): int
{
    $myRead = ($t['a_kind'] === $me['kind'] && (int) $t['a_id'] === $me['id'])
        ? $t['a_last_read_at'] : $t['b_last_read_at'];
    return (int) (Db::one(
        "SELECT COUNT(*) c FROM chat_messages
          WHERE thread_id = ?
            AND NOT (sender_kind = ? AND sender_id = ?)
            AND (? IS NULL OR created_at > ?)",
        [(int) $t['id'], $me['kind'], $me['id'], $myRead, $myRead]
    )['c'] ?? 0);
}

function pg_fmt_chat_thread(array $t, array $me): array
{
    $other = pg_chat_other($t, $me);
    $info  = pg_chat_principal_info($other['kind'], $other['id'])
        ?? ['kind' => $other['kind'], 'id' => id_str($other['id']), 'name' => '(akun dihapus)',
            'role' => null, 'status' => 'inactive', 'divisionName' => null, 'photoUrl' => null];
    $mineLast = ($t['last_message_sender_kind'] === $me['kind']
        && (int) $t['last_message_sender_id'] === $me['id']);
    return [
        'id'          => id_str($t['id']),
        'other'       => $info,
        'lastMessage' => $t['last_message_at'] ? [
            'preview' => $t['last_message_preview'],
            'at'      => dt($t['last_message_at']),
            'mine'    => $mineLast,
        ] : null,
        'unread'      => pg_chat_thread_unread($t, $me),
        'updatedAt'   => dt($t['last_message_at'] ?: $t['created_at']),
    ];
}

function pg_fmt_chat_message(array $r, array $me): array
{
    return [
        'id'         => id_str($r['id']),
        'threadId'   => id_str($r['thread_id']),
        'mine'       => ($r['sender_kind'] === $me['kind'] && (int) $r['sender_id'] === $me['id']),
        'senderKind' => $r['sender_kind'],
        'body'       => $r['body'],
        'createdAt'  => dt($r['created_at']),
    ];
}

/* ---------- routes ---------- */

pg_route('GET', '/chat/contacts', function (): void {
    $me  = pg_chat_me();
    $out = [];
    foreach (Db::all(
        "SELECT u.id, u.full_name, u.role, u.photo_path, d.name AS division_name
           FROM users u LEFT JOIN divisions d ON d.id = u.division_id
          WHERE u.status = 'active' AND u.deleted_at IS NULL
          ORDER BY u.full_name"
    ) as $r) {
        if ($me['kind'] === 'user' && (int) $r['id'] === $me['id']) {
            continue;
        }
        $out[] = [
            'kind' => 'user', 'id' => id_str($r['id']), 'name' => $r['full_name'],
            'role' => $r['role'], 'divisionName' => $r['division_name'],
            'photoUrl' => !empty($r['photo_path'])
                ? ('api/profile-photo?id=' . (int) $r['id']
                   . '&v=' . substr(pathinfo((string) $r['photo_path'], PATHINFO_FILENAME), 0, 12))
                : null,
        ];
    }
    foreach (Db::all("SELECT id, name, role FROM admins WHERE status = 'active' ORDER BY name") as $r) {
        if ($me['kind'] === 'admin' && (int) $r['id'] === $me['id']) {
            continue;
        }
        $out[] = [
            'kind' => 'admin', 'id' => id_str($r['id']), 'name' => $r['name'],
            'role' => $r['role'], 'divisionName' => 'Admin', 'photoUrl' => null,
        ];
    }
    Http::json(['ok' => true, 'contacts' => $out]);
});

pg_route('GET', '/chat/threads', function (): void {
    $me   = pg_chat_me();
    $rows = Db::all(
        "SELECT * FROM chat_threads
          WHERE (a_kind = ? AND a_id = ?) OR (b_kind = ? AND b_id = ?)
          ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
          LIMIT 200",
        [$me['kind'], $me['id'], $me['kind'], $me['id']]
    );
    $threads = [];
    $unreadTotal = 0;
    foreach ($rows as $r) {
        $t = pg_fmt_chat_thread($r, $me);
        $unreadTotal += $t['unread'];
        $threads[] = $t;
    }
    Http::json(['ok' => true, 'threads' => $threads, 'unreadTotal' => $unreadTotal]);
});

pg_route('POST', '/chat/threads', function (): void {
    $me = pg_chat_me();
    $b  = Http::body();
    $wk = ($b['withKind'] ?? '') === 'admin' ? 'admin' : 'user';
    $wi = (int) ($b['withId'] ?? 0);
    if ($wi <= 0) {
        Http::json(['ok' => false, 'error' => 'Kontak tidak valid.'], 200);
    }
    if ($wk === $me['kind'] && $wi === $me['id']) {
        Http::json(['ok' => false, 'error' => 'Tidak bisa mengobrol dengan diri sendiri.'], 200);
    }
    $info = pg_chat_principal_info($wk, $wi);
    if (!$info || ($info['status'] ?? 'active') !== 'active') {
        Http::json(['ok' => false, 'error' => 'Kontak tidak ditemukan atau sudah nonaktif.'], 200);
    }
    [$ak, $ai, $bk, $bi] = pg_chat_canon($me['kind'], $me['id'], $wk, $wi);
    $row = Db::one(
        "SELECT * FROM chat_threads WHERE a_kind = ? AND a_id = ? AND b_kind = ? AND b_id = ?",
        [$ak, $ai, $bk, $bi]
    );
    if (!$row) {
        Db::run("INSERT INTO chat_threads (a_kind, a_id, b_kind, b_id) VALUES (?, ?, ?, ?)", [$ak, $ai, $bk, $bi]);
        $row = Db::one("SELECT * FROM chat_threads WHERE id = ?", [(int) Db::lastId()]);
    }
    Http::json(['ok' => true, 'thread' => pg_fmt_chat_thread($row, $me)]);
});

pg_route('GET', '/chat/threads/{id}/messages', function (array $p): void {
    $me  = pg_chat_me();
    $tid = (int) $p['id'];
    $t   = Db::one("SELECT * FROM chat_threads WHERE id = ?", [$tid]);
    if (!$t || !pg_chat_is_participant($t, $me)) {
        Http::json(['ok' => false, 'error' => 'Percakapan tidak ditemukan.'], 200);
    }
    $limit    = min(100, max(10, (int) (Http::query('limit') ?? 40)));
    $beforeId = (int) (Http::query('beforeId') ?? 0);
    $args = [$tid];
    $cond = '';
    if ($beforeId > 0) {
        $cond = ' AND id < ?';
        $args[] = $beforeId;
    }
    $rows = array_reverse(Db::all(
        "SELECT * FROM chat_messages WHERE thread_id = ?$cond ORDER BY id DESC LIMIT " . $limit,
        $args
    ));
    pg_chat_mark_read($t, $me);
    $other = pg_chat_other($t, $me);
    Http::json([
        'ok'       => true,
        'threadId' => id_str($tid),
        'other'    => pg_chat_principal_info($other['kind'], $other['id']),
        'messages' => array_map(static fn ($r) => pg_fmt_chat_message($r, $me), $rows),
        'hasMore'  => count($rows) >= $limit,
    ]);
});

pg_route('POST', '/chat/threads/{id}/messages', function (array $p): void {
    $me  = pg_chat_me();
    $tid = (int) $p['id'];
    $t   = Db::one("SELECT * FROM chat_threads WHERE id = ?", [$tid]);
    if (!$t || !pg_chat_is_participant($t, $me)) {
        Http::json(['ok' => false, 'error' => 'Percakapan tidak ditemukan.'], 200);
    }
    $body = Validate::str(Http::body()['body'] ?? '', 'Pesan', 1, 4000);

    Db::run(
        "INSERT INTO chat_messages (thread_id, sender_kind, sender_id, body) VALUES (?, ?, ?, ?)",
        [$tid, $me['kind'], $me['id'], $body]
    );
    $mid     = (int) Db::lastId();
    $preview = mb_substr(trim(preg_replace('/\s+/', ' ', $body) ?? $body), 0, 180);
    $readCol = pg_chat_my_read_col($t, $me);
    Db::run(
        "UPDATE chat_threads
            SET last_message_at = NOW(), last_message_preview = ?,
                last_message_sender_kind = ?, last_message_sender_id = ?, `$readCol` = NOW()
          WHERE id = ?",
        [$preview, $me['kind'], $me['id'], $tid]
    );

    $other      = pg_chat_other($t, $me);
    $senderName = $me['kind'] === 'user'
        ? Notify::userName($me['id'])
        : (Db::one("SELECT name FROM admins WHERE id = ?", [$me['id']])['name'] ?? 'Admin');
    try {
        Notify::push(
            $other['kind'], $other['id'], 'chat.message',
            'Pesan dari ' . $senderName, $preview, '/momen#chat-' . $tid,
            $me['kind'] === 'user' ? $me['id'] : null, 'chat-' . $tid
        );
    } catch (\Throwable $e) {
        error_log('[premiere][chat][notify] ' . $e->getMessage());
    }

    $msg = Db::one("SELECT * FROM chat_messages WHERE id = ?", [$mid]);
    Http::json(['ok' => true, 'message' => pg_fmt_chat_message($msg, $me)]);
});

pg_route('POST', '/chat/threads/{id}/read', function (array $p): void {
    $me = pg_chat_me();
    $t  = Db::one("SELECT * FROM chat_threads WHERE id = ?", [(int) $p['id']]);
    if (!$t || !pg_chat_is_participant($t, $me)) {
        Http::json(['ok' => false, 'error' => 'Percakapan tidak ditemukan.'], 200);
    }
    pg_chat_mark_read($t, $me);
    Http::json(['ok' => true]);
});
