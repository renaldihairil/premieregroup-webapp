<?php
declare(strict_types=1);

/**
 * In-app notifications. Every helper is best-effort — a failure to notify must
 * never break the action that triggered it (all writes wrapped in try/catch).
 *
 * recipient_kind: 'user' -> users.id   |   'admin' -> admins.id
 * link: an in-app route the client opens on tap (e.g. '/laporan-izin').
 */
final class Notify
{
    /** Raw insert + Web Push. $body/$link/$dedupKey optional. */
    public static function push(string $kind, int $recipientId, string $type, string $title, string $body = '', ?string $link = null, ?int $actorUserId = null, ?string $dedupKey = null): void
    {
        if ($recipientId <= 0) {
            return;
        }
        if (!NotifSettings::isEnabled($type)) {
            return; // admin turned this notification type off in Pengaturan
        }
        $kind  = $kind === 'admin' ? 'admin' : 'user';
        $title = mb_substr($title, 0, 160);
        $body  = mb_substr($body, 0, 500);
        $link  = $link !== null ? mb_substr($link, 0, 120) : null;
        $dedupKey = $dedupKey !== null ? mb_substr($dedupKey, 0, 80) : null;

        try {
            Db::run(
                "INSERT INTO notifications (recipient_kind, recipient_id, type, title, body, link, dedup_key, actor_user_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [$kind, $recipientId, mb_substr($type, 0, 40), $title, $body, $link, $dedupKey, $actorUserId ?: null]
            );
        } catch (\Throwable $e) {
            error_log('[premiere][notify] ' . $e->getMessage());
        }

        // Layer 2: OS-level Web Push to that principal's registered devices.
        // Fully best-effort — never let this affect the caller.
        try {
            $route = $link ?: '/';
            $url   = $kind === 'admin'
                ? '/admin' . ($route === '/' ? '/' : $route)
                : $route;
            WebPush::sendToOwner($kind, $recipientId, [
                'title' => $title,
                'body'  => $body,
                'route' => $route,
                'url'   => $url,
                'tag'   => 'pg-' . mb_substr($type, 0, 24),
            ]);
        } catch (\Throwable $e) {
            error_log('[premiere][webpush] ' . $e->getMessage());
        }
    }

    /**
     * Fire a notification only if one with the same (recipient, dedup_key) has
     * NOT been created in the last $withinHours. For time-based reminders that
     * a sweep may re-evaluate many times a day.
     */
    public static function pushOnce(string $kind, int $recipientId, string $type, string $dedupKey, string $title, string $body = '', ?string $link = null, int $withinHours = 20): bool
    {
        if ($recipientId <= 0 || $dedupKey === '') {
            return false;
        }
        if (!NotifSettings::isEnabled($type)) {
            return false;
        }
        $kind = $kind === 'admin' ? 'admin' : 'user';
        try {
            $exists = Db::one(
                "SELECT id FROM notifications
                  WHERE recipient_kind = ? AND recipient_id = ? AND dedup_key = ?
                    AND created_at > (NOW() - INTERVAL ? HOUR)
                  LIMIT 1",
                [$kind, $recipientId, mb_substr($dedupKey, 0, 80), max(1, $withinHours)]
            );
        } catch (\Throwable $e) {
            $exists = null;
        }
        if ($exists) {
            return false;
        }
        self::push($kind, $recipientId, $type, $title, $body, $link, null, $dedupKey);
        return true;
    }

    public static function toUser(int $userId, string $type, string $title, string $body = '', ?string $link = null, ?int $actorUserId = null): void
    {
        self::push('user', $userId, $type, $title, $body, $link, $actorUserId);
    }

    public static function toAdmin(int $adminId, string $type, string $title, string $body = '', ?string $link = null, ?int $actorUserId = null): void
    {
        self::push('admin', $adminId, $type, $title, $body, $link, $actorUserId);
    }

    /** Fan-out to every active admin. Used for "an employee did X" events. */
    public static function toAllAdmins(string $type, string $title, string $body = '', ?string $link = null, ?int $actorUserId = null): void
    {
        try {
            $ids = Db::all("SELECT id FROM admins WHERE status = 'active'");
        } catch (\Throwable $e) {
            error_log('[premiere][notify] admins lookup: ' . $e->getMessage());
            return;
        }
        foreach ($ids as $row) {
            self::push('admin', (int) $row['id'], $type, $title, $body, $link, $actorUserId);
        }
    }

    /**
     * Fan-out to EVERY active principal (every admin + every user) except the
     * one who triggered the event. Used for team-wide announcements (e.g. a
     * new "Momen Kerja" post) where anyone posting should notify everyone else.
     */
    public static function broadcastExceptSelf(string $excludeKind, int $excludeId, string $type, string $title, string $body = '', ?string $link = null): void
    {
        try {
            $admins = Db::all("SELECT id FROM admins WHERE status = 'active'");
        } catch (\Throwable $e) {
            $admins = [];
        }
        foreach ($admins as $row) {
            $id = (int) $row['id'];
            if ($excludeKind === 'admin' && $id === $excludeId) {
                continue;
            }
            self::push('admin', $id, $type, $title, $body, $link);
        }
        try {
            $users = Db::all("SELECT id FROM users WHERE status = 'active'");
        } catch (\Throwable $e) {
            $users = [];
        }
        foreach ($users as $row) {
            $id = (int) $row['id'];
            if ($excludeKind === 'user' && $id === $excludeId) {
                continue;
            }
            self::push('user', $id, $type, $title, $body, $link);
        }
    }

    /** Convenience: an employee's display name, for message bodies. */
    public static function userName(int $userId): string
    {
        try {
            $r = Db::one("SELECT full_name FROM users WHERE id = ?", [$userId]);
            return $r ? (string) $r['full_name'] : 'Karyawan';
        } catch (\Throwable $e) {
            return 'Karyawan';
        }
    }
}
