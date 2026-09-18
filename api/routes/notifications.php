<?php
declare(strict_types=1);

/**
 * In-app notifications for the signed-in principal (a user OR an admin).
 *
 *   GET    /api/notifications              recent list + unread count
 *   POST   /api/notifications/read         { ids: [...] }  |  { all: true }
 *   POST   /api/notifications/clear        delete all READ ones for me
 *   DELETE /api/notifications/{id}         delete one of mine
 *
 * A time-based cleanup (read + older than 45 days, or anything older than
 * 120 days) runs opportunistically on the GET so the table never grows
 * unbounded on shared hosting without a cron.
 */

const PG_NOTIF_LIST_LIMIT = 50;

/** @return array{kind:string,id:int} */
function pg_notif_principal(): array
{
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login.', 401);
    }
    return ['kind' => ($p['kind'] === 'admin' ? 'admin' : 'user'), 'id' => (int) $p['id']];
}

pg_route('GET', '/notifications', function (): void {
    $me = pg_notif_principal();

    // opportunistic cleanup (~4% of calls)
    if (random_int(1, 25) === 1) {
        try {
            Db::run("DELETE FROM notifications
                      WHERE (read_at IS NOT NULL AND read_at < (NOW() - INTERVAL 45 DAY))
                         OR created_at < (NOW() - INTERVAL 120 DAY)");
        } catch (\Throwable $e) { /* ignore */ }
    }

    $rows = Db::all(
        "SELECT n.*, u.full_name AS actor_name
           FROM notifications n
           LEFT JOIN users u ON u.id = n.actor_user_id
          WHERE n.recipient_kind = ? AND n.recipient_id = ?
          ORDER BY n.id DESC
          LIMIT " . PG_NOTIF_LIST_LIMIT,
        [$me['kind'], $me['id']]
    );
    $unread = (int) (Db::one(
        "SELECT COUNT(*) c FROM notifications WHERE recipient_kind = ? AND recipient_id = ? AND read_at IS NULL",
        [$me['kind'], $me['id']]
    )['c'] ?? 0);

    Http::json(['ok' => true, 'notifications' => array_map('fmt_notification', $rows), 'unread' => $unread]);
});

pg_route('POST', '/notifications/read', function (): void {
    $me   = pg_notif_principal();
    $body = Http::body();

    if (!empty($body['all'])) {
        Db::run("UPDATE notifications SET read_at = NOW()
                  WHERE recipient_kind = ? AND recipient_id = ? AND read_at IS NULL",
            [$me['kind'], $me['id']]);
        Http::json(['ok' => true]);
    }

    $ids = array_values(array_filter(array_map('intval', (array) ($body['ids'] ?? [])), fn ($n) => $n > 0));
    if (!$ids) {
        Http::json(['ok' => false, 'error' => 'Tidak ada notifikasi yang ditandai.'], 200);
    }
    $ph = implode(',', array_fill(0, count($ids), '?'));
    Db::run("UPDATE notifications SET read_at = NOW()
              WHERE recipient_kind = ? AND recipient_id = ? AND read_at IS NULL AND id IN ($ph)",
        array_merge([$me['kind'], $me['id']], $ids));
    Http::json(['ok' => true]);
});

pg_route('POST', '/notifications/clear', function (): void {
    $me = pg_notif_principal();
    Db::run("DELETE FROM notifications
              WHERE recipient_kind = ? AND recipient_id = ? AND read_at IS NOT NULL",
        [$me['kind'], $me['id']]);
    Http::json(['ok' => true]);
});

pg_route('DELETE', '/notifications/{id}', function (array $p): void {
    $me = pg_notif_principal();
    $n  = Db::exec("DELETE FROM notifications WHERE id = ? AND recipient_kind = ? AND recipient_id = ?",
        [(int) $p['id'], $me['kind'], $me['id']]);
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => 'Notifikasi tidak ditemukan.']);
});
