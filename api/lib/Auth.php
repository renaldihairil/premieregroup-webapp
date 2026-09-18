<?php
declare(strict_types=1);

/**
 * Server-side session auth. The browser only ever holds an opaque HttpOnly
 * cookie; the principal + CSRF token live in $_SESSION.
 */
final class Auth
{
    /**
     * Separate session cookies per interface so an Admin and an employee can be
     * logged in at the same time in the SAME browser (different tabs). The
     * frontend sends "X-PG-Realm: admin|user" on every /api call (see store.js).
     */
    private const COOKIE = ['admin' => 'PREMIERE_ADM', 'user' => 'PREMIERE_USR'];

    public static function start(): void
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }
        $secure   = Env::bool('SESSION_COOKIE_SECURE', true);
        $samesite = Env::get('SESSION_COOKIE_SAMESITE', 'Lax') ?: 'Lax';
        $lifetime = max(3600, Env::int('SESSION_LIFETIME_MIN', 10080) * 60);

        // A `Secure` cookie is silently dropped by the browser on a plain-HTTP
        // request, which then looks like a random logout. If this request did
        // NOT arrive over HTTPS, don't mark the cookie Secure.
        $https = (($_SERVER['HTTPS'] ?? '') !== '' && strtolower((string) $_SERVER['HTTPS']) !== 'off')
            || (($_SERVER['SERVER_PORT'] ?? '') === '443')
            || (strtolower((string) ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '')) === 'https');
        if (!$https) {
            $secure = false;
        }

        $store = self::sessionStorePath();
        if ($store !== null) {
            session_save_path($store);
        }

        // ---- keep the SERVER-SIDE session data alive as long as the cookie ----
        // Without this, PHP's session GC (gc_maxlifetime, commonly 24 min on
        // shared hosting) deletes the session file long before the 7-day cookie
        // expires — the classic "keeps logging me out" bug. Must be set BEFORE
        // session_start().
        @ini_set('session.gc_maxlifetime', (string) $lifetime);
        @ini_set('session.use_strict_mode', '1');   // never adopt an unknown SID
        @ini_set('session.cookie_lifetime', (string) $lifetime);
        @ini_set('session.use_only_cookies', '1');
        // Reduce GC churn on our private folder (a session file is still only
        // removed once it is older than gc_maxlifetime = the full window).
        @ini_set('session.gc_probability', '1');
        @ini_set('session.gc_divisor', '1000');

        // Which realm's cookie to use for THIS request:
        $hdr = $_SERVER['HTTP_X_PG_REALM'] ?? '';
        if ($hdr === 'admin' || $hdr === 'user') {
            $name = self::COOKIE[$hdr];
        } elseif (isset($_COOKIE[self::COOKIE['admin']])) {
            // Header-less request (e.g. an <img> to /api/photo). Adopt whichever
            // realm cookie the browser actually sent — prefer admin (can view all).
            $name = self::COOKIE['admin'];
        } elseif (isset($_COOKIE[self::COOKIE['user']])) {
            $name = self::COOKIE['user'];
        } else {
            $name = self::COOKIE['user'];
        }

        session_name($name);
        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path'     => '/',
            'domain'   => '',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => $samesite,
        ]);
        session_start();

        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(random_bytes(16));
        }

        // ---- sliding expiry ----
        // 1) Touch the session at most once an hour so its FILE mtime keeps
        //    advancing on active use (PHP's lazy_write would otherwise freeze
        //    the mtime after login and let GC reap an in-use session).
        // 2) Re-emit the cookie so its expiry rolls forward from last activity
        //    instead of being fixed at login time.
        $now  = time();
        $seen = (int) ($_SESSION['_seen'] ?? 0);
        if (!empty($_SESSION['auth']) && ($now - $seen) > 3600) {
            $_SESSION['_seen'] = $now;
            if (!headers_sent()) {
                setcookie(session_name(), session_id(), [
                    'expires'  => $now + $lifetime,
                    'path'     => '/',
                    'domain'   => '',
                    'secure'   => $secure,
                    'httponly' => true,
                    'samesite' => $samesite,
                ]);
            }
        }
    }

    private static function sessionStorePath(): ?string
    {
        // Prefer a project-local, non-public folder so shared hosting can't
        // list it and it survives PHP handler changes.
        $dir = dirname(__DIR__, 2) . '/storage/sessions';
        if (is_dir($dir) || @mkdir($dir, 0755, true) || is_dir($dir)) {
            return is_writable($dir) ? $dir : null;
        }
        return null;
    }

    /** @return array{kind:string,id:int,role:string,name:string,username:?string}|null */
    public static function principal(): ?array
    {
        return $_SESSION['auth'] ?? null;
    }

    /** @param array{kind:string,id:int,role:string,name:string,username:?string} $p */
    public static function setPrincipal(array $p): void
    {
        session_regenerate_id(true);
        $_SESSION['auth'] = $p;
        $_SESSION['csrf'] = bin2hex(random_bytes(16));
    }

    public static function clear(): void
    {
        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $p = session_get_cookie_params();
            setcookie(session_name(), '', [
                'expires'  => time() - 42000,
                'path'     => $p['path'],
                'domain'   => $p['domain'],
                'secure'   => $p['secure'],
                'httponly' => $p['httponly'],
                'samesite' => $p['samesite'] ?? 'Lax',
            ]);
        }
        if (session_status() === PHP_SESSION_ACTIVE) {
            session_destroy();
        }
    }

    public static function csrf(): string
    {
        return $_SESSION['csrf'] ?? '';
    }

    /** Reject unsafe methods without a matching X-CSRF-Token header. */
    public static function requireCsrf(): void
    {
        if (in_array(Http::method(), ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }
        $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
        if ($sent === '' || !hash_equals(self::csrf(), (string) $sent)) {
            Http::fail('Sesi tidak valid. Muat ulang halaman lalu coba lagi.', 419);
        }
    }
}
