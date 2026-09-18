<?php
declare(strict_types=1);

/**
 * Web Push subscription management for the signed-in principal.
 *
 *   GET    /api/push/config        { ok, enabled, publicKey }   (enabled=false -> hide the UI)
 *   POST   /api/push/subscribe     { endpoint, keys:{p256dh, auth} }
 *   POST   /api/push/unsubscribe   { endpoint }
 *   POST   /api/push/test          send a test push to my own devices
 */

/** @return array{kind:string,id:int} */
function pg_push_principal(): array
{
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login.', 401);
    }
    return ['kind' => ($p['kind'] === 'admin' ? 'admin' : 'user'), 'id' => (int) $p['id']];
}

pg_route('GET', '/push/config', function (): void {
    $pk = WebPush::available() ? WebPush::publicKeyB64u() : null;
    Http::json(['ok' => true, 'enabled' => (bool) $pk, 'publicKey' => $pk]);
});

pg_route('POST', '/push/subscribe', function (): void {
    $me   = pg_push_principal();
    $body = Http::body();

    $endpoint = trim((string) ($body['endpoint'] ?? ''));
    $keys     = (array) ($body['keys'] ?? []);
    $p256dh   = trim((string) ($keys['p256dh'] ?? ''));
    $auth     = trim((string) ($keys['auth'] ?? ''));

    if ($endpoint === '' || !preg_match('#^https://#', $endpoint) || $p256dh === '' || $auth === '') {
        Http::json(['ok' => false, 'error' => 'Data langganan tidak lengkap.'], 200);
    }
    if (mb_strlen($endpoint) > 500 || mb_strlen($p256dh) > 160 || mb_strlen($auth) > 64) {
        Http::json(['ok' => false, 'error' => 'Data langganan tidak valid.'], 200);
    }

    $ua = mb_substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 200);

    try {
        Db::run(
            "INSERT INTO push_subscriptions (owner_kind, owner_id, endpoint, p256dh, auth, ua)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE p256dh = VALUES(p256dh), auth = VALUES(auth), ua = VALUES(ua), last_ok_at = NULL",
            [$me['kind'], $me['id'], $endpoint, $p256dh, $auth, $ua ?: null]
        );
    } catch (\Throwable $e) {
        error_log('[premiere][push] subscribe: ' . $e->getMessage());
        Http::json(['ok' => false, 'error' => 'Gagal menyimpan langganan.'], 200);
    }

    Http::json(['ok' => true]);
});

pg_route('POST', '/push/unsubscribe', function (): void {
    $me       = pg_push_principal();
    $endpoint = trim((string) (Http::body()['endpoint'] ?? ''));
    if ($endpoint === '') {
        Http::json(['ok' => false, 'error' => 'Endpoint kosong.'], 200);
    }
    Db::run("DELETE FROM push_subscriptions WHERE owner_kind = ? AND owner_id = ? AND endpoint = ?",
        [$me['kind'], $me['id'], $endpoint]);
    Http::json(['ok' => true]);
});

pg_route('POST', '/push/test', function (): void {
    $me = pg_push_principal();
    if (!WebPush::available() || !WebPush::publicKeyB64u()) {
        Http::json(['ok' => false, 'error' => 'Push belum aktif di server.'], 200);
    }
    $n = 0;
    try {
        $n = (int) (Db::one("SELECT COUNT(*) c FROM push_subscriptions WHERE owner_kind = ? AND owner_id = ?",
            [$me['kind'], $me['id']])['c'] ?? 0);
    } catch (\Throwable $e) {}
    if (!$n) {
        Http::json(['ok' => false, 'error' => 'Belum ada perangkat terdaftar.'], 200);
    }
    WebPush::sendToOwner($me['kind'], $me['id'], [
        'title' => 'Notifikasi HP aktif ✅',
        'body'  => 'Premiere Group akan mengirim pemberitahuan ke layar perangkat ini.',
        'route' => '/',
        'url'   => $me['kind'] === 'admin' ? '/admin/' : '/',
        'tag'   => 'pg-test',
    ]);
    Http::json(['ok' => true, 'devices' => $n]);
});
