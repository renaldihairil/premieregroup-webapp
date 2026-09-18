<?php
declare(strict_types=1);

/**
 * Self-service profile editing.
 *
 *   Admin (Admin Panel — Pengaturan)
 *     GET    /api/admin-profile              { name, username, email, role, lastLoginAt }
 *     PATCH  /api/admin-profile              { name?, email? }
 *     POST   /api/admin-profile/password     { currentPassword, newPassword }
 *
 *   Employee (User App — Profil Saya)
 *     PATCH  /api/my-profile                 { fullName?, username? }
 *     POST   /api/my-profile/photo           multipart  photo=<image>
 *     DELETE /api/my-profile/photo
 *
 *   Shared
 *     GET    /api/profile-photo?id=..        stream a karyawan's profile photo
 */

const PG_PROFILE_PHOTO_CAP = 5242880; // 5 MB

/* ---------------- ADMIN ---------------- */

pg_route('GET', '/admin-profile', function (): void {
    $a = Guard::admin();
    Http::json(['ok' => true, 'profile' => [
        'id'          => id_str($a['id']),
        'name'        => $a['name'],
        'username'    => $a['username'],
        'email'       => $a['email'],
        'role'        => $a['role'],
        'lastLoginAt' => dt($a['last_login_at'] ?? null),
    ]]);
});

pg_route('PATCH', '/admin-profile', function (): void {
    $a    = Guard::admin();
    $body = Http::body();
    $set  = [];
    $args = [];

    if (array_key_exists('name', $body)) {
        $set[] = 'name = ?';
        $args[] = Validate::str($body['name'], 'Nama admin', 1, 120);
    }
    if (array_key_exists('email', $body)) {
        $email = trim((string) $body['email']);
        if ($email === '') {
            $set[] = 'email = NULL';
        } else {
            if (!filter_var($email, FILTER_VALIDATE_EMAIL) || mb_strlen($email) > 190) {
                Http::fail('Format email tidak valid.', 422);
            }
            if (Db::one("SELECT id FROM admins WHERE email = ? AND id <> ?", [$email, $a['id']])) {
                Http::json(['ok' => false, 'error' => 'Email sudah dipakai admin lain.'], 200);
            }
            $set[] = 'email = ?';
            $args[] = $email;
        }
    }
    if (!$set) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }
    $args[] = (int) $a['id'];
    Db::run("UPDATE admins SET " . implode(', ', $set) . " WHERE id = ?", $args);
    $row = Db::one("SELECT * FROM admins WHERE id = ?", [(int) $a['id']]);
    Http::json(['ok' => true, 'profile' => [
        'id' => id_str($row['id']), 'name' => $row['name'], 'username' => $row['username'],
        'email' => $row['email'], 'role' => $row['role'], 'lastLoginAt' => dt($row['last_login_at'] ?? null),
    ]]);
});

pg_route('POST', '/admin-profile/password', function (): void {
    $a    = Guard::admin();
    $body = Http::body();
    $cur  = (string) ($body['currentPassword'] ?? '');
    $new  = (string) ($body['newPassword'] ?? '');

    $row = Db::one("SELECT password_hash FROM admins WHERE id = ?", [(int) $a['id']]);
    if (!$row || !password_verify($cur, (string) $row['password_hash'])) {
        Http::json(['ok' => false, 'error' => 'Password lama salah.'], 200);
    }
    if (mb_strlen($new) < 8) {
        Http::fail('Password baru minimal 8 karakter.', 422);
    }
    if ($new === $cur) {
        Http::json(['ok' => false, 'error' => 'Password baru harus berbeda dari password lama.'], 200);
    }
    Db::run("UPDATE admins SET password_hash = ? WHERE id = ?",
        [password_hash($new, PASSWORD_BCRYPT), (int) $a['id']]);
    Http::json(['ok' => true]);
});

/* ---------------- EMPLOYEE ---------------- */

pg_route('PATCH', '/my-profile', function (): void {
    $u    = Guard::user();
    $body = Http::body();
    $set  = [];
    $args = [];

    if (array_key_exists('fullName', $body)) {
        $set[] = 'full_name = ?';
        $args[] = Validate::str($body['fullName'], 'Nama lengkap', 1, 150);
    }
    if (array_key_exists('username', $body)) {
        $uname = Validate::username($body['username']);
        if (Db::one("SELECT id FROM users WHERE username = ? AND id <> ?", [$uname, $u['id']])) {
            Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
        }
        $set[] = 'username = ?';
        $args[] = $uname;
    }
    if (!$set) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }
    $args[] = (int) $u['id'];
    try {
        Db::run("UPDATE users SET " . implode(', ', $set) . " WHERE id = ?", $args);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
        }
        throw $e;
    }

    $row = Db::one("SELECT * FROM users WHERE id = ?", [(int) $u['id']]);
    Http::json(['ok' => true, 'record' => fmt_user($row)]);
});

pg_route('POST', '/my-profile/photo', function (): void {
    $u = Guard::user();
    if (!isset($_FILES['photo']) || !is_array($_FILES['photo'])) {
        Http::json(['ok' => false, 'error' => 'Tidak ada file foto.'], 200);
    }
    $saved = Storage::saveUpload($_FILES['photo'], 'profile', PG_PROFILE_PHOTO_CAP);
    if ($saved['kind'] !== 'image') {
        Storage::remove($saved['path']);
        Http::fail('Foto profil harus berupa gambar (JPG, PNG, atau WebP).', 422);
    }
    $old = Db::one("SELECT photo_path FROM users WHERE id = ?", [(int) $u['id']])['photo_path'] ?? null;
    Db::run("UPDATE users SET photo_path = ? WHERE id = ?", [$saved['path'], (int) $u['id']]);
    if (!empty($old)) {
        Storage::remove($old);
    }
    Http::json(['ok' => true, 'record' => fmt_user(Db::one("SELECT * FROM users WHERE id = ?", [(int) $u['id']]))]);
});

pg_route('DELETE', '/my-profile/photo', function (): void {
    $u   = Guard::user();
    $old = Db::one("SELECT photo_path FROM users WHERE id = ?", [(int) $u['id']])['photo_path'] ?? null;
    Db::run("UPDATE users SET photo_path = NULL WHERE id = ?", [(int) $u['id']]);
    if (!empty($old)) {
        Storage::remove($old);
    }
    Http::json(['ok' => true, 'record' => fmt_user(Db::one("SELECT * FROM users WHERE id = ?", [(int) $u['id']]))]);
});

/* ---------------- SHARED ---------------- */

pg_route('GET', '/profile-photo', function (): void {
    if (!Auth::principal()) {
        Http::fail('Perlu login untuk melihat foto.', 401);
    }
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT photo_path FROM users WHERE id = ?", [$id]);
    if (!$row || empty($row['photo_path'])) {
        Http::fail('Foto tidak ditemukan.', 404);
    }
    $ext  = strtolower(pathinfo((string) $row['photo_path'], PATHINFO_EXTENSION));
    $mime = ['jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png', 'webp' => 'image/webp', 'gif' => 'image/gif'][$ext] ?? 'application/octet-stream';

    // PHP's session cache limiter (from session_start in Auth::start) queues
    // `Pragma: no-cache` + `Expires: <1981>` on every response. Those fight the
    // long `Cache-Control` that serveFile sets and make the browser re-fetch the
    // avatar on every render / page change (the reported flicker). Strip them and
    // pin a future Expires; serveFile then sets `Cache-Control: private,
    // max-age=86400`. The url is content-versioned (?v=<file token>), so a new
    // upload always busts the cache regardless.
    if (!headers_sent()) {
        header_remove('Pragma');
        header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 604800) . ' GMT');
    }
    Storage::serveFile($row['photo_path'], $mime, 'foto.' . $ext, false);
});
