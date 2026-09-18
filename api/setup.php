<?php
declare(strict_types=1);

/**
 * PREMIERE GROUP — one-time admin password setup
 * ------------------------------------------------------------
 * Open this ONCE in a browser after deploying:   https://your-domain/api/setup.php
 *
 * It sets the bcrypt password for the admin account that db.sql shipped with an
 * empty hash. It refuses to run once ANY admin already has a password, and it
 * writes storage/.setup-lock so it cannot be re-used. Delete api/setup.php after
 * you are done if you prefer.
 */

error_reporting(E_ALL);
ini_set('display_errors', '0');

define('PG_ROOT', dirname(__DIR__));
define('PG_API', __DIR__);

require PG_API . '/lib/Env.php';
Env::load(PG_ROOT . '/.env');
date_default_timezone_set(Env::get('APP_TIMEZONE', 'Asia/Makassar') ?: 'Asia/Makassar');
require PG_API . '/lib/Db.php';

$lockFile = PG_ROOT . '/storage/.setup-lock';

function pg_setup_page(string $body, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: text/html; charset=utf-8');
    header('X-Robots-Tag: noindex');
    echo '<!doctype html><html lang="id"><head><meta charset="utf-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1">'
       . '<title>Setup Admin — Premiere Group</title><style>'
       . 'body{font:15px/1.6 system-ui,Segoe UI,Roboto,sans-serif;background:#0f172a;color:#e2e8f0;margin:0;'
       . 'display:flex;min-height:100vh;align-items:center;justify-content:center}'
       . '.card{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:28px;max-width:420px;width:92%}'
       . 'h1{font-size:18px;margin:0 0 4px}p{color:#94a3b8;font-size:13px;margin:6px 0 16px}'
       . 'label{display:block;font-size:13px;margin:12px 0 4px}'
       . 'input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #475569;'
       . 'background:#0f172a;color:#e2e8f0;font-size:14px}'
       . 'button{margin-top:18px;width:100%;padding:11px;border:0;border-radius:10px;background:#218DAE;color:#fff;'
       . 'font-size:14px;font-weight:600;cursor:pointer}.ok{color:#4ade80}.err{color:#f87171}'
       . 'code{background:#0f172a;padding:2px 6px;border-radius:6px}</style></head><body><div class="card">'
       . $body . '</div></body></html>';
    exit;
}

/* Already configured with a REAL bcrypt hash?
   A plaintext value typed into password_hash by hand (e.g. "premiere123")
   does NOT count — this page must still be usable to recover from that. */
try {
    $adminRows = Db::all("SELECT id, password_hash FROM admins");
} catch (\Throwable $e) {
    pg_setup_page('<h1>Database belum siap</h1><p class="err">Tidak dapat terhubung ke database. '
        . 'Periksa <code>.env</code> lalu import <code>database/db.sql</code> via phpMyAdmin.</p>', 500);
}

$hasValidHash = false;
foreach ($adminRows as $r) {
    $h = (string) $r['password_hash'];
    if ($h !== '' && preg_match('/^\$2[aby]\$\d\d\$/', $h)) {
        $hasValidHash = true;
        break;
    }
}

if ($hasValidHash) {
    pg_setup_page('<h1>Setup sudah selesai</h1>'
        . '<p>Password admin sudah diatur (hash bcrypt yang sah sudah ada di tabel <code>admins</code>). '
        . 'Halaman ini dinonaktifkan. Silakan hapus <code>api/setup.php</code> dari server.</p>'
        . '<p>Untuk mengganti password: kosongkan kolom <code>password_hash</code> di phpMyAdmin, '
        . 'lalu buka halaman ini lagi.</p>'
        . '<p><a style="color:#38bdf8" href="../admin.html">Buka Admin Panel &rarr;</a></p>');
}

session_name('PREMIERE_SETUP');
session_start();
if (empty($_SESSION['t'])) {
    $_SESSION['t'] = bin2hex(random_bytes(16));
}

// Does the admins table have an `email` column? (migration may not be applied yet)
$hasEmailCol = false;
try {
    $hasEmailCol = (bool) Db::one("SHOW COLUMNS FROM admins LIKE 'email'");
} catch (\Throwable $e) {
    $hasEmailCol = false;
}

$msg = '';
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    $token = $_POST['t'] ?? '';
    $user  = strtolower(trim((string) ($_POST['username'] ?? 'admin')));
    $email = strtolower(trim((string) ($_POST['email'] ?? '')));
    $p1    = (string) ($_POST['password'] ?? '');
    $p2    = (string) ($_POST['password2'] ?? '');

    if (!hash_equals($_SESSION['t'], (string) $token)) {
        $msg = '<p class="err">Sesi kedaluwarsa. Muat ulang halaman.</p>';
    } elseif ($user === '') {
        $msg = '<p class="err">Username wajib diisi.</p>';
    } elseif ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $msg = '<p class="err">Format email tidak valid.</p>';
    } elseif (strlen($p1) < 8) {
        $msg = '<p class="err">Password minimal 8 karakter.</p>';
    } elseif ($p1 !== $p2) {
        $msg = '<p class="err">Konfirmasi password tidak cocok.</p>';
    } else {
        $admin = Db::one("SELECT id FROM admins WHERE username = ?", [$user])
              ?: Db::one("SELECT id FROM admins ORDER BY (role='super_admin') DESC, id ASC LIMIT 1");
        if (!$admin) {
            $msg = '<p class="err">Akun admin tidak ditemukan di tabel <code>admins</code>.</p>';
        } else {
            $hash = password_hash($p1, PASSWORD_BCRYPT);
            if ($hasEmailCol) {
                Db::run(
                    "UPDATE admins SET username = ?, email = ?, password_hash = ? WHERE id = ?",
                    [$user, ($email === '' ? null : $email), $hash, $admin['id']]
                );
            } else {
                Db::run(
                    "UPDATE admins SET username = ?, password_hash = ? WHERE id = ?",
                    [$user, $hash, $admin['id']]
                );
            }
            @file_put_contents($lockFile, date('c') . " setup done\n");
            $loginAs = $email !== '' ? ($email . '</code> atau <code>' . $user) : $user;
            pg_setup_page('<h1 class="ok">Password admin berhasil dibuat</h1>'
                . '<p>Login di Admin Panel sebagai <code>' . htmlspecialchars($loginAs, ENT_QUOTES)
                . '</code> dengan password baru Anda.</p>'
                . ($hasEmailCol ? '' : '<p class="err">Kolom <code>email</code> belum ada — jalankan '
                    . '<code>database/migrations/2026_09_02_000001_admins_email.sql</code> lebih dulu '
                    . 'kalau ingin login pakai email.</p>')
                . '<p>Untuk keamanan, hapus <code>api/setup.php</code> dari server.</p>'
                . '<p><a style="color:#38bdf8" href="../admin.html">Buka Admin Panel &rarr;</a></p>');
        }
    }
}

pg_setup_page(
    '<h1>Setup Akun Admin</h1>'
    . '<p>Buat / atur ulang login admin. Aplikasi yang menyimpan hash bcrypt-nya — '
    . 'Anda cukup mengetik password yang diinginkan.</p>'
    . $msg
    . '<form method="post" autocomplete="off">'
    . '<input type="hidden" name="t" value="' . htmlspecialchars($_SESSION['t'], ENT_QUOTES) . '">'
    . '<label>Username admin</label><input name="username" value="admin" autocapitalize="none" required>'
    . ($hasEmailCol
        ? '<label>Email admin (mis. Gmail) — untuk login, boleh dikosongkan</label>'
          . '<input type="email" name="email" placeholder="nama@gmail.com" autocapitalize="none">'
        : '')
    . '<label>Password baru (min. 8 karakter)</label><input type="password" name="password" required>'
    . '<label>Ulangi password</label><input type="password" name="password2" required>'
    . '<button type="submit">Simpan</button>'
    . '</form>'
);
