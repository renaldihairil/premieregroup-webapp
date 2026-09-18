<?php
declare(strict_types=1);

/**
 * PREMIERE GROUP — API front controller
 * ------------------------------------------------------------
 * Plain PHP 8 + PDO. No framework, no Composer, no build step — the only
 * stack guaranteed on cPanel shared hosting. Every /api/* request lands
 * here (see api/.htaccess) and is dispatched to a route in api/routes/.
 *
 * Response contract used by the frontend (assets/js/core/store.js):
 *   - success            : HTTP 200  { "ok": true, ... }
 *   - business rejection  : HTTP 200  { "ok": false, "error": "pesan" }
 *                           (e.g. "sudah absen masuk hari ini")
 *   - not authenticated   : HTTP 401  { "error": "pesan" }
 *   - forbidden (role)    : HTTP 403  { "error": "pesan" }
 *   - stale CSRF token    : HTTP 419  { "error": "pesan" }
 *   - bad input           : HTTP 422  { "error": "pesan" }
 *   - server error        : HTTP 500  { "error": "Terjadi kesalahan pada server." }
 * No stack traces, SQL, or credentials are ever sent to the client.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

define('PG_ROOT', dirname(__DIR__));
define('PG_API', __DIR__);

require PG_API . '/lib/Env.php';
Env::load(PG_ROOT . '/.env');

$__debug = Env::bool('APP_DEBUG', false);
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Asia/Makassar') ?: 'Asia/Makassar');

/* ---------- mbstring polyfill ----------
   Some shared hosts silently drop the mbstring extension after a PHP update.
   The app only ever uses these four for length/case on short ASCII-ish text,
   so a byte-wise fallback is safe (it can only be *stricter* on length). */
if (!function_exists('mb_strlen')) {
    function mb_strlen($s, $enc = null) { return strlen((string) $s); }
    function mb_substr($s, $start, $length = null, $enc = null) {
        return $length === null ? substr((string) $s, (int) $start) : substr((string) $s, (int) $start, (int) $length);
    }
    function mb_strtolower($s, $enc = null) { return strtolower((string) $s); }
    function mb_strtoupper($s, $enc = null) { return strtoupper((string) $s); }
}

require PG_API . '/lib/Http.php';
require PG_API . '/lib/Db.php';
require PG_API . '/lib/Auth.php';
require PG_API . '/lib/Guard.php';
require PG_API . '/lib/Validate.php';
require PG_API . '/lib/Storage.php';
require PG_API . '/lib/WebPush.php';
require PG_API . '/lib/NotifSettings.php';
require PG_API . '/lib/Notify.php';
require PG_API . '/lib/Reminders.php';
require PG_API . '/lib/Posts.php';
require PG_API . '/lib/FeatureAccess.php';
require PG_API . '/lib/fmt.php';

/* ---------- last-resort error handling (never leak internals) ---------- */
set_exception_handler(function (\Throwable $e) use ($__debug) {
    error_log('[PG-API] ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    $msg = $__debug ? ($e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine())
                    : 'Terjadi kesalahan pada server.';
    Http::json(['ok' => false, 'error' => $msg], 500);
});
register_shutdown_function(function () use ($__debug) {
    $err = error_get_last();
    if ($err && in_array($err['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        error_log('[PG-API] FATAL ' . $err['message'] . ' @ ' . $err['file'] . ':' . $err['line']);
        if (!headers_sent()) {
            $msg = $__debug ? $err['message'] : 'Terjadi kesalahan pada server.';
            Http::json(['ok' => false, 'error' => $msg], 500);
        }
    }
});

/* ---------- CORS (same-origin by default; explicit allowlist optional) ---------- */
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '') {
    $allow = array_filter(array_map('trim', explode(',', (string) Env::get('CORS_ALLOWED_ORIGINS', ''))));
    if (in_array($origin, $allow, true)) {
        header('Access-Control-Allow-Origin: ' . $origin);
        header('Vary: Origin');
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-HTTP-Method-Override, X-PG-Realm');
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    }
}
if (Http::method() === 'OPTIONS') {
    Http::json(['ok' => true]);
}

/* ---------- session ---------- */
Auth::start();

/* ---------- self-healing schema (apply any pending migration) ---------- */
Db::runPendingMigrations();

/* ---------- tiny router ---------- */
$GLOBALS['PG_ROUTES'] = [];
/**
 * Register a route. $path uses {name} placeholders, e.g. "/overtime/{id}/approve".
 * $fn receives an associative array of the matched placeholders.
 */
function pg_route(string $method, string $path, callable $fn): void
{
    $GLOBALS['PG_ROUTES'][] = [strtoupper($method), $path, $fn];
}

foreach (glob(PG_API . '/routes/*.php') as $routeFile) {
    require $routeFile;
}

/* ---------- dispatch ---------- */
$method = Http::method();
$path   = Http::path();

$matchedPathButNotMethod = false;

foreach ($GLOBALS['PG_ROUTES'] as [$rMethod, $rPath, $rFn]) {
    $regex = '#^' . preg_replace('#\{([a-zA-Z_]+)\}#', '(?P<$1>[^/]+)', str_replace('#', '\#', $rPath)) . '$#';
    if (!preg_match($regex, $path, $m)) {
        continue;
    }
    if ($rMethod !== $method) {
        $matchedPathButNotMethod = true;
        continue;
    }
    // CSRF for every unsafe method (skips GET/HEAD/OPTIONS internally).
    Auth::requireCsrf();

    $params = [];
    foreach ($m as $k => $v) {
        if (!is_int($k)) {
            $params[$k] = $v;
        }
    }
    $rFn($params);
    Http::json(['ok' => true]); // safety net if a handler forgot to respond
}

if ($matchedPathButNotMethod) {
    Http::fail('Metode tidak diizinkan untuk endpoint ini.', 405);
}
Http::fail('Endpoint tidak ditemukan.', 404);
