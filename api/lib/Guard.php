<?php
declare(strict_types=1);

/**
 * Authorization. Authentication (a valid session) is NOT the same as
 * authorization (allowed to touch this data). Every endpoint calls one
 * of these before doing anything.
 */
final class Guard
{
    /** Returns the live users row for the session user, or 401s. */
    public static function user(): array
    {
        $p = Auth::principal();
        if (!$p || ($p['kind'] ?? '') !== 'user') {
            Http::fail('Anda perlu login sebagai karyawan.', 401);
        }
        $u = Db::one(
            "SELECT * FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL",
            [$p['id']]
        );
        if (!$u) {
            Auth::clear();
            Http::fail('Akun Anda nonaktif. Hubungi Admin.', 401);
        }
        return $u;
    }

    /** Returns the live admins row for the session admin, or 401/403s. */
    public static function admin(): array
    {
        $p = Auth::principal();
        if (!$p || ($p['kind'] ?? '') !== 'admin') {
            Http::fail('Akses Admin diperlukan.', 403);
        }
        $a = Db::one("SELECT * FROM admins WHERE id = ? AND status = 'active'", [$p['id']]);
        if (!$a) {
            Auth::clear();
            Http::fail('Sesi Admin tidak valid.', 401);
        }
        return $a;
    }

    private const PERMISSIONS = [
        'attendance.settings.edit' => ['super_admin', 'admin'],
        'notification.settings.edit' => ['super_admin', 'admin'],
        'overtime.approve'         => ['super_admin', 'admin', 'manager'],
        'org.manage'               => ['super_admin', 'admin'],
        'system.settings.edit'     => ['super_admin'],
        'kpi.settings.edit'        => ['super_admin', 'admin'],
        'todo.manage'              => ['super_admin', 'admin', 'manager'],
        'app.update.send'          => ['super_admin', 'admin'],
        'visit.settings.edit'      => ['super_admin', 'admin'],
        'feature.access.edit'      => ['super_admin', 'admin'],
        'piket.settings.edit'      => ['super_admin', 'admin'],
    ];

    /** Requires an admin session AND the given permission. */
    public static function can(string $permission): array
    {
        $admin = self::admin();
        $role  = $admin['role'] ?? '';
        $allowed = self::PERMISSIONS[$permission] ?? null;
        if ($allowed !== null && !in_array($role, $allowed, true)) {
            Http::fail('Anda tidak memiliki izin untuk tindakan ini.', 403);
        }
        return $admin;
    }

    /**
     * Ownership check: the session user must own $ownerId, unless the session
     * is an admin (admins may read anyone's data).
     */
    public static function ownOrAdmin(int $ownerId): void
    {
        $p = Auth::principal();
        if (($p['kind'] ?? '') === 'admin') {
            return;
        }
        if (($p['kind'] ?? '') === 'user' && (int) $p['id'] === $ownerId) {
            return;
        }
        Http::fail('Anda hanya dapat mengakses data milik Anda sendiri.', 403);
    }
}
