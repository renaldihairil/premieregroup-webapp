<?php
declare(strict_types=1);

/**
 * Request parsing + JSON responses. Never leaks internals to the client.
 */
final class Http
{
    public static function method(): string
    {
        $m = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($m === 'POST' && isset($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'])) {
            $m = strtoupper($_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE']);
        }
        return $m;
    }

    /** Path with the /api script-dir prefix removed, e.g. "/attendance/check-in". */
    public static function path(): string
    {
        $uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
        $uri = is_string($uri) ? $uri : '/';

        $script = $_SERVER['SCRIPT_NAME'] ?? '/api/index.php';
        $base   = rtrim(str_replace('\\', '/', dirname($script)), '/'); // "/api"

        if ($base !== '' && $base !== '/' && str_starts_with($uri, $base)) {
            $uri = substr($uri, strlen($base));
        }
        $uri = '/' . trim($uri, '/');
        return $uri === '' ? '/' : $uri;
    }

    public static function query(string $key, ?string $default = null): ?string
    {
        $v = $_GET[$key] ?? null;
        return is_string($v) ? $v : $default;
    }

    /** JSON body (or form POST as a fallback). @return array<string,mixed> */
    public static function body(): array
    {
        $raw = file_get_contents('php://input');
        if ($raw === false || $raw === '') {
            return is_array($_POST) ? $_POST : [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }

    public static function json(mixed $data, int $code = 200): never
    {
        if (!headers_sent()) {
            http_response_code($code);
            header('Content-Type: application/json; charset=utf-8');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: no-store');
        }
        echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok(mixed $data = null): never
    {
        self::json($data ?? ['ok' => true]);
    }

    public static function fail(string $message, int $code = 400): never
    {
        self::json(['error' => $message], $code);
    }
}
