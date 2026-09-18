<?php
declare(strict_types=1);

/**
 * Authentication.
 *   POST /api/auth/login/admin   { password, username? }  -> admin session
 *   POST /api/auth/login/user    { username }             -> employee session
 *   POST /api/auth/logout
 *   GET  /api/auth/me            -> { authenticated, principal, csrf }
 *
 * The identity is stored server-side in $_SESSION. The browser only ever
 * holds the opaque PREMIERE_SESS cookie. user_id is NEVER read from a
 * request body afterwards — always from the session (see lib/Guard.php).
 */

function pg_principal_out(): array
{
    $p = Auth::principal();
    return [
        'authenticated' => $p !== null,
        'principal'     => $p ? [
            'kind'     => $p['kind'],
            'id'       => (string) $p['id'],
            'role'     => $p['role'],
            'name'     => $p['name'],
            'username' => $p['username'] ?? null,
        ] : null,
        'csrf' => Auth::csrf(),
    ];
}

pg_route('GET', '/auth/me', function (): void {
    // Revalidate that the account behind the session still exists / is active.
    $p = Auth::principal();
    if ($p) {
        if ($p['kind'] === 'user') {
            $row = Db::one("SELECT id FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL", [$p['id']]);
        } else {
            $row = Db::one("SELECT id FROM admins WHERE id = ? AND status = 'active'", [$p['id']]);
        }
        if (!$row) {
            Auth::clear();
        }
    }
    Http::json(pg_principal_out());
});

pg_route('POST', '/auth/login/admin', function (): void {
    $body     = Http::body();
    // The one identifier field accepts EITHER a username OR an email address.
    $id       = strtolower(trim((string) ($body['identifier'] ?? $body['username'] ?? $body['email'] ?? '')));
    $password = (string) ($body['password'] ?? '');

    if ($password === '') {
        Http::json(['ok' => false, 'error' => 'Masukkan password admin.'], 200);
    }

    if ($id !== '') {
        $admin = Db::one(
            "SELECT * FROM admins WHERE (username = ? OR email = ?) AND status = 'active' LIMIT 1",
            [$id, $id]
        );
    } else {
        // No identifier typed -> single-admin convenience: the primary admin.
        $admin = Db::one(
            "SELECT * FROM admins WHERE status = 'active'
             ORDER BY (role = 'super_admin') DESC, id ASC LIMIT 1"
        );
    }

    if (!$admin) {
        Http::json(['ok' => false, 'error' => 'Akun admin tidak ditemukan.'], 200);
    }
    $storedHash = (string) $admin['password_hash'];
    // Empty, OR a plaintext value hand-typed into the column (not a bcrypt hash).
    if ($storedHash === '' || !preg_match('/^\$2[aby]\$\d\d\$/', $storedHash)) {
        Http::json([
            'ok'    => false,
            'error' => 'Password admin belum diatur dengan benar. Buka '
                     . '/api/setup.php satu kali untuk membuatnya (jangan mengetik password langsung '
                     . 'ke kolom password_hash — harus berupa hash bcrypt).',
            'code'  => 'SETUP_REQUIRED',
        ], 200);
    }
    if (!password_verify($password, $storedHash)) {
        Http::json(['ok' => false, 'error' => 'Password salah. Silakan coba lagi.'], 200);
    }

    if (password_needs_rehash((string) $admin['password_hash'], PASSWORD_BCRYPT)) {
        Db::run("UPDATE admins SET password_hash = ? WHERE id = ?",
            [password_hash($password, PASSWORD_BCRYPT), $admin['id']]);
    }
    Db::run("UPDATE admins SET last_login_at = NOW() WHERE id = ?", [$admin['id']]);

    Auth::setPrincipal([
        'kind'     => 'admin',
        'id'       => (int) $admin['id'],
        'role'     => $admin['role'],
        'name'     => $admin['name'],
        'username' => $admin['username'],
    ]);

    Http::json(['ok' => true] + pg_principal_out());
});

pg_route('POST', '/auth/login/user', function (): void {
    $body = Http::body();
    $uname = strtolower(trim((string) ($body['username'] ?? '')));

    if ($uname === '') {
        Http::json(['ok' => false, 'error' => 'Masukkan username Anda.'], 200);
    }

    $user = Db::one(
        "SELECT * FROM users WHERE username = ? AND deleted_at IS NULL LIMIT 1",
        [$uname]
    );
    if (!$user) {
        Http::json(['ok' => false, 'error' => 'Username tidak ditemukan. Hubungi Admin.'], 200);
    }
    if ($user['status'] !== 'active') {
        Http::json(['ok' => false, 'error' => 'Akun Anda nonaktif. Hubungi Admin untuk mengaktifkan.'], 200);
    }

    Auth::setPrincipal([
        'kind'     => 'user',
        'id'       => (int) $user['id'],
        'role'     => $user['role'] ?: 'staff',
        'name'     => $user['full_name'],
        'username' => $user['username'],
    ]);

    Http::json(['ok' => true] + pg_principal_out());
});

pg_route('POST', '/auth/logout', function (): void {
    Auth::clear();
    Http::json(['ok' => true]);
});
