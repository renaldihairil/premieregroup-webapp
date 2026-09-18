<?php
declare(strict_types=1);

/**
 * GET /api/pulse
 * ------------------------------------------------------------
 * A tiny "has anything changed?" probe for the clients' realtime loop.
 * Returns a short digest string (`rev`) computed from the row count and the
 * newest created_at / updated_at of every operational table. When the digest
 * differs from the one the client last saw, the client re-pulls /api/bootstrap
 * and re-renders — so data a user submits shows up in the Admin Panel (and
 * vice-versa) within one poll interval, no manual refresh.
 *
 * Deliberately cheap: ~20 indexed COUNT/MAX aggregates, response ~40 bytes.
 * Any logged-in principal (user or admin) may call it.
 */

pg_route('GET', '/pulse', function (): void {
    if (!Auth::principal()) {
        Http::json(['ok' => false, 'error' => 'auth'], 200);
    }

    // Tables whose changes any screen might care about. schema_migrations is
    // intentionally excluded (internal, changes only on deploy).
    $watch = [
        'attendances', 'attendance_settings', 'overtimes', 'izin', 'holidays', 'expenses',
        'warehouse_receipts', 'warehouse_suppliers',
        'notifications',
        'todos', 'todo_attachments',
        'visits', 'visit_attachments', 'visit_checklist_items', 'visit_checklist_answers',
        'kpi_reports', 'kpi_report_values', 'kpi_templates', 'kpi_template_items',
        'programs',
        'posts', 'post_likes', 'post_comments', 'post_comment_likes',
        'chat_threads', 'chat_messages',
        'users', 'user_divisions', 'divisions', 'positions', 'stores', 'branches',
        'job_desks', 'system_settings', 'admins',
        'division_features', 'user_features',
        'piket_schedules', 'piket_settings',
    ];

    // Which of updated_at / created_at each table actually has.
    $tsCols = [];
    foreach (Db::all(
        "SELECT TABLE_NAME tn, COLUMN_NAME cn
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND COLUMN_NAME IN ('updated_at', 'created_at')"
    ) as $r) {
        $tsCols[$r['tn']][] = $r['cn'];
    }

    $parts = [];
    foreach ($watch as $t) {
        $cols = $tsCols[$t] ?? [];
        $sel  = ['COUNT(*) c'];
        if (in_array('updated_at', $cols, true)) {
            $sel[] = 'COALESCE(UNIX_TIMESTAMP(MAX(updated_at)), 0) u';
        }
        if (in_array('created_at', $cols, true)) {
            $sel[] = 'COALESCE(UNIX_TIMESTAMP(MAX(created_at)), 0) k';
        }
        try {
            $row = Db::one('SELECT ' . implode(', ', $sel) . ' FROM `' . $t . '`');
        } catch (\Throwable $e) {
            continue; // table missing (fresh install mid-migration) — skip, not fatal
        }
        $ts = max((int) ($row['u'] ?? 0), (int) ($row['k'] ?? 0));
        $parts[] = $t . ':' . (int) ($row['c'] ?? 0) . ':' . $ts;
    }

    // Opportunistic time-based reminders (todo/program deadlines, prayer times).
    // Internally throttled to ~1×/90s and fully de-duped, so this stays cheap
    // even though every client hits /pulse every 12–15s.
    try {
        Reminders::sweep(false);
    } catch (\Throwable $e) {
        error_log('[premiere][pulse][sweep] ' . $e->getMessage());
    }
    // Expired "Momen Kerja" posts — a single indexed SELECT when nothing is due,
    // cheap enough to run on every pulse (no separate throttle needed).
    try {
        Posts::sweepExpired();
    } catch (\Throwable $e) {
        error_log('[premiere][pulse][posts-sweep] ' . $e->getMessage());
    }

    Http::json(['ok' => true, 'rev' => md5(implode('|', $parts))]);
});

/**
 * GET /api/cron/sweep
 * ------------------------------------------------------------
 * For hosts that CAN add a real cron line. Forces a reminder pass regardless
 * of the throttle. Safe to call as often as you like — Notify::pushOnce()
 * de-dupes every reminder per period. Optional ?key= must match CRON_KEY when
 * that env var is set; otherwise open (the sweep only ever writes notification
 * rows the app would have created anyway).
 *
 *   Suggested cPanel cron (every 5 min):
 *     curl -s https://premieregroup.my.id/api/cron/sweep
 */
pg_route('GET', '/cron/sweep', function (): void {
    $need = (string) (Env::get('CRON_KEY', '') ?? '');
    if ($need !== '' && (string) ($_GET['key'] ?? '') !== $need) {
        Http::json(['ok' => false, 'error' => 'auth'], 200);
    }
    $counts = Reminders::sweep(true);
    $counts['posts'] = 0;
    try {
        $counts['posts'] = Posts::sweepExpired();
    } catch (\Throwable $e) {
        error_log('[premiere][cron][posts-sweep] ' . $e->getMessage());
    }
    Http::json(['ok' => true, 'counts' => $counts]);
});
