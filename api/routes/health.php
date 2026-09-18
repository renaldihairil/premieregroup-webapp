<?php
declare(strict_types=1);

/** GET /api/health — cheap liveness + DB connectivity probe. */
pg_route('GET', '/health', function (): void {
    $db = false;
    try {
        Db::one('SELECT 1 AS ok');
        $db = true;
    } catch (\Throwable $e) {
        $db = false;
    }
    $ext = [];
    foreach (['pdo_mysql', 'gd', 'mbstring', 'json', 'fileinfo', 'openssl'] as $e) {
        $ext[$e] = extension_loaded($e);
    }
    $storageDir = dirname(__DIR__, 2) . '/storage';

    Http::json([
        'ok'         => true,
        'service'    => 'premiere-group-api',
        'php'        => PHP_VERSION,
        'database'   => $db ? 'up' : 'down',
        'extensions' => $ext,
        'storageWritable'    => is_writable($storageDir),
        'uploadMaxFilesize'  => ini_get('upload_max_filesize'),
        'postMaxSize'        => ini_get('post_max_size'),
        'serverTime' => date('Y-m-d\TH:i:s'),
        'timezone'   => date_default_timezone_get(),
    ]);
});
