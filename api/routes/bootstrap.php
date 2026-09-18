<?php
declare(strict_types=1);

/**
 * GET /api/bootstrap
 * ------------------------------------------------------------
 * One call that hydrates the whole client cache (assets/js/core/store.js).
 * Shape mirrors the old localStorage `_db` object 1:1 so the ~15 page
 * render() functions keep reading the same field names.
 *
 *   - a USER session gets: all master data + all active users (for "Tim Saya")
 *     + ONLY their own attendance / overtime / todos / kpi reports.
 *   - an ADMIN session gets: everything (all users incl. inactive, all records).
 *   - no session: 401 (store.js treats this as "not logged in", shows /login).
 */
pg_route('GET', '/bootstrap', function (): void {
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Belum login.', 401);
    }
    $isAdmin = $p['kind'] === 'admin';
    $uid     = (int) $p['id'];

    // Revalidate the account (mirrors Guard::user / Guard::admin).
    if ($isAdmin) {
        if (!Db::one("SELECT id FROM admins WHERE id = ? AND status = 'active'", [$uid])) {
            Auth::clear();
            Http::fail('Sesi Admin tidak valid.', 401);
        }
    } else {
        if (!Db::one("SELECT id FROM users WHERE id = ? AND status = 'active' AND deleted_at IS NULL", [$uid])) {
            Auth::clear();
            Http::fail('Akun Anda nonaktif. Hubungi Admin.', 401);
        }
    }

    // Server-side sweep: expire any running overtime that blew past its deadline.
    pg_overtime_sweep();

    $divisions = array_map('fmt_division', Db::all("SELECT * FROM divisions ORDER BY name"));
    $positions = array_map('fmt_position', Db::all("SELECT * FROM positions ORDER BY id"));
    $branches  = array_map('fmt_branch',  Db::all("SELECT * FROM branches ORDER BY name"));
    $stores    = array_map('fmt_store', Db::all(
        $isAdmin ? "SELECT * FROM stores ORDER BY name"
                 : "SELECT * FROM stores WHERE status = 'active' ORDER BY name"
    ));

    $userWhere = $isAdmin
        ? "u.deleted_at IS NULL"
        : "u.deleted_at IS NULL AND u.status = 'active'";
    $users = array_map('fmt_user', Db::all(
        "SELECT u.*, (SELECT GROUP_CONCAT(ud.division_id) FROM user_divisions ud WHERE ud.user_id = u.id) AS division_ids
           FROM users u WHERE $userWhere ORDER BY u.full_name"
    ));

    $settingsRow = Db::one("SELECT * FROM attendance_settings WHERE id = 1");
    $holidayRows = Db::all("SELECT * FROM holidays ORDER BY holiday_date");
    $attendanceSettings = fmt_settings($settingsRow ?: [
        'check_in' => '08:00:00', 'check_out' => '21:00:00', 'late_tolerance_min' => 15,
        'overtime_start' => '17:00:00', 'overtime_end' => '23:59:00', 'work_days' => 'mon,tue,wed,thu,fri,sat',
    ], $holidayRows);

    $sysRow = Db::one("SELECT * FROM system_settings WHERE id = 1");
    $systemSettings = fmt_system_settings($sysRow ?: [
        'company_name' => 'Premiere Group', 'timezone' => 'Asia/Makassar',
        'locale' => 'id-ID', 'week_start' => 'mon',
    ]);

    $attWhere = $isAdmin ? '' : 'WHERE a.user_id = ' . $uid;
    $attendanceRecords = array_map('fmt_attendance', Db::all(
        "SELECT a.* FROM attendances a $attWhere ORDER BY a.attendance_date DESC, a.id DESC"
    ));

    $otWhere = $isAdmin ? '' : 'WHERE o.user_id = ' . $uid;
    $overtimeRecords = array_map('fmt_overtime', Db::all(
        "SELECT o.*, adm.name AS approved_by_name
           FROM overtimes o
           LEFT JOIN admins adm ON adm.id = o.approved_by_admin_id
           $otWhere
          ORDER BY o.start_at DESC, o.id DESC"
    ));

    $izinWhere = $isAdmin ? '' : 'WHERE i.user_id = ' . $uid;
    $izinRecords = [];
    try {
        $izinRecords = array_map('fmt_izin', Db::all(
            "SELECT i.* FROM izin i $izinWhere ORDER BY i.izin_date DESC, i.id DESC"
        ));
    } catch (\Throwable $e) { /* table not migrated yet — tolerate */ }

    $expenseWhere = $isAdmin ? '' : 'WHERE e.user_id = ' . $uid;
    $expenseRecords = [];
    try {
        $expenseRecords = array_map('fmt_expense', Db::all(
            "SELECT e.* FROM expenses e $expenseWhere ORDER BY e.expense_date DESC, e.id DESC"
        ));
    } catch (\Throwable $e) { /* table not migrated yet — tolerate */ }

    // Resi Gudang — a user gets their own catatan (drafts included, so the
    // Resi Gudang page can resume one), admin gets everyone's SUBMITTED-only
    // (for "Laporan Resi Gudang" — a draft is nobody's business but its owner).
    $warehouseWhere = $isAdmin ? "WHERE w.status = 'submitted'" : 'WHERE w.user_id = ' . $uid;
    $warehouseReceipts = [];
    try {
        $warehouseReceipts = array_map('fmt_warehouse_receipt', Db::all(
            "SELECT w.*, u.full_name AS user_name
               FROM warehouse_receipts w
               JOIN users u ON u.id = w.user_id
             $warehouseWhere
             ORDER BY w.receipt_date DESC, w.id DESC"
        ));
    } catch (\Throwable $e) { /* table not migrated yet — tolerate */ }

    // Data Supplier — shared master list (dropdown source in Catat Resi
    // Gudang + the dedicated "Data Supplier" page), same for every account.
    $warehouseSuppliers = [];
    try {
        $warehouseSuppliers = array_map('fmt_warehouse_supplier', Db::all(
            "SELECT * FROM warehouse_suppliers ORDER BY name ASC"
        ));
    } catch (\Throwable $e) { /* table not migrated yet — tolerate */ }

    // Jadwal Piket — a shared weekly roster, same visibility spirit as "Tim
    // Saya" (every account already sees every colleague's name elsewhere in
    // the app) — everyone gets the FULL roster, not just their own days, so
    // the User App can show "who else is on duty" alongside "Piket Anda".
    $piketSchedules = [];
    $piketSettings  = ['reminderTime' => '07:00', 'enabled' => true, 'fridayTime' => '07:00', 'fridayEnabled' => true, 'fridayMessage' => null];
    try {
        $piketSchedules = array_map('fmt_piket', Db::all(
            "SELECT * FROM piket_schedules ORDER BY FIELD(day_of_week,'mon','tue','wed','thu','fri','sat','sun'), id"
        ));
        $psRow = Db::one("SELECT * FROM piket_settings WHERE id = 1");
        if ($psRow) {
            $piketSettings = fmt_piket_settings($psRow);
        }
    } catch (\Throwable $e) { /* tables not migrated yet — tolerate */ }

    $notifications = [];
    $notificationsUnread = 0;
    try {
        $nKind = $isAdmin ? 'admin' : 'user';
        $notifications = array_map('fmt_notification', Db::all(
            "SELECT n.*, u.full_name AS actor_name
               FROM notifications n
               LEFT JOIN users u ON u.id = n.actor_user_id
              WHERE n.recipient_kind = ? AND n.recipient_id = ?
              ORDER BY n.id DESC LIMIT 30",
            [$nKind, $uid]
        ));
        $notificationsUnread = (int) (Db::one(
            "SELECT COUNT(*) c FROM notifications WHERE recipient_kind = ? AND recipient_id = ? AND read_at IS NULL",
            [$nKind, $uid]
        )['c'] ?? 0);
    } catch (\Throwable $e) { /* table not migrated yet — tolerate */ }

    // Private chat — the thread list + a total unread count, so the Momen
    // header's chat button shows a live badge and the panel opens instantly.
    $chatThreads = [];
    $chatUnread  = 0;
    try {
        $me = ['kind' => $nKind, 'id' => $uid];
        $rows = Db::all(
            "SELECT * FROM chat_threads
              WHERE (a_kind = ? AND a_id = ?) OR (b_kind = ? AND b_id = ?)
              ORDER BY COALESCE(last_message_at, created_at) DESC, id DESC
              LIMIT 100",
            [$nKind, $uid, $nKind, $uid]
        );
        foreach ($rows as $r) {
            $t = pg_fmt_chat_thread($r, $me);
            $chatUnread += $t['unread'];
            $chatThreads[] = $t;
        }
    } catch (\Throwable $e) { /* chat tables not migrated yet — tolerate */ }

    // Momen Kerja — ids of the currently-live posts (they self-expire in 24h,
    // so this list stays small). The client compares it against a locally
    // stored "last seen" id to badge the Momen menu with how many posts arrived
    // since the employee last opened the feed.
    $momenPostIds = [];
    try {
        $momenPostIds = array_map(
            static fn ($r) => id_str($r['id']),
            Db::all("SELECT id FROM posts WHERE expires_at > NOW() ORDER BY id")
        );
    } catch (\Throwable $e) { /* posts table not migrated yet — tolerate */ }

    $todoWhere = $isAdmin ? '' : 'WHERE t.assignee_id = ' . $uid;
    $todos = array_map('fmt_todo', Db::all(
        "SELECT t.*, cu.full_name AS creator_name, cd.name AS creator_division_name, pg.name AS program_name
           FROM todos t
           LEFT JOIN users cu ON cu.id = t.created_by_user_id
           LEFT JOIN divisions cd ON cd.id = cu.division_id
           LEFT JOIN programs pg ON pg.id = t.program_id
         $todoWhere
         ORDER BY t.created_at DESC, t.id DESC"
    ));
    // attachment count per todo (for the table badge / list indicator).
    // Tolerate the table not existing yet (older DB, migration not applied).
    $acMap = [];
    try {
        $acWhere = $isAdmin ? '' : 'WHERE t.assignee_id = ' . $uid;
        foreach (Db::all(
            "SELECT a.todo_id, COUNT(*) c
               FROM todo_attachments a JOIN todos t ON t.id = a.todo_id
               $acWhere
              GROUP BY a.todo_id"
        ) as $r) {
            $acMap[(string) $r['todo_id']] = (int) $r['c'];
        }
    } catch (\Throwable $e) {
        error_log('[premiere][bootstrap] attachment count skipped: ' . $e->getMessage());
    }
    foreach ($todos as &$t) {
        $t['attachmentCount'] = $acMap[$t['id']] ?? 0;
    }
    unset($t);

    // Job Desk — uraian tugas per divisi / jabatan. Admin gets every row;
    // a user gets only the ACTIVE ones that match their division or position.
    // Tolerate the table not existing yet (migration not applied on old DB).
    $jobDesks = [];
    try {
        if ($isAdmin) {
            $jobDesks = array_map('fmt_jobdesk', Db::all(
                "SELECT jd.*, d.name AS division_name, p.name AS position_name, adm.name AS updated_by_name
                   FROM job_desks jd
                   LEFT JOIN divisions d   ON d.id = jd.division_id
                   LEFT JOIN positions p   ON p.id = jd.position_id
                   LEFT JOIN admins    adm ON adm.id = jd.updated_by_admin_id
                  ORDER BY COALESCE(d.name, p.name), jd.title"
            ));
        } else {
            $me = Db::one("SELECT position_id FROM users WHERE id = ?", [$uid]) ?: [];
            $myDivs = pg_user_division_ids($uid);
            $divPh  = $myDivs ? implode(',', array_fill(0, count($myDivs), '?')) : 'NULL';
            $jobDesks = array_map('fmt_jobdesk', Db::all(
                "SELECT jd.*, d.name AS division_name, p.name AS position_name
                   FROM job_desks jd
                   LEFT JOIN divisions d ON d.id = jd.division_id
                   LEFT JOIN positions p ON p.id = jd.position_id
                  WHERE jd.status = 'active'
                    AND ( (jd.scope_type = 'division' AND jd.division_id IN ($divPh))
                       OR (jd.scope_type = 'position' AND jd.position_id = ?) )
                  ORDER BY jd.scope_type = 'division' DESC, jd.title",
                array_merge(
                    $myDivs,
                    [isset($me['position_id']) && $me['position_id'] !== null ? (int) $me['position_id'] : null]
                )
            ));
        }
    } catch (\Throwable $e) {
        error_log('[premiere][bootstrap] job desks skipped: ' . $e->getMessage());
    }

    // Program — program kerja + agregat progress. Admin gets all; a user gets
    // only programs they have a task in, plus their own progress within it.
    $programs = [];
    try {
        if ($isAdmin) {
            $programs = array_map('fmt_program', Db::all(
                pg_program_select(null) . " ORDER BY p.status = 'archived', p.end_date DESC, p.id DESC"
            ));
        } else {
            // A user sees only ACTIVE programs they have a task in — an archived
            // program is "put away"; its todos still live in the Todo List.
            $programs = array_map('fmt_program', Db::all(
                pg_program_select($uid)
                . " WHERE p.status <> 'archived'"
                . "   AND EXISTS (SELECT 1 FROM todos t WHERE t.program_id = p.id AND t.assignee_id = ?)"
                . " ORDER BY p.end_date DESC, p.id DESC",
                [$uid]
            ));
        }
    } catch (\Throwable $e) {
        error_log('[premiere][bootstrap] programs skipped: ' . $e->getMessage());
    }

    // KPI is fully on-demand now (templates can be large) — see /api/kpi/*.
    // A tiny hint so the User App can badge "you have a KPI form to fill".
    $kpiTemplateCount = 0;
    try {
        if ($isAdmin) {
            $kpiTemplateCount = (int) (Db::one("SELECT COUNT(*) c FROM kpi_templates")['c'] ?? 0);
        } else {
            $myDivs = pg_user_division_ids($uid);
            $divPh  = $myDivs ? implode(',', array_fill(0, count($myDivs), '?')) : 'NULL';
            $kpiTemplateCount = (int) (Db::one(
                "SELECT COUNT(*) c FROM kpi_templates WHERE status = 'active' AND (division_id IS NULL OR division_id IN ($divPh))",
                $myDivs
            )['c'] ?? 0);
        }
    } catch (\Throwable $e) { /* KPI tables not migrated yet — ignore */ }

    // Feature access — which optional sections (Todo/KPI/Program/Job Desk/
    // Kunjungan) THIS employee's app should show. Admin always gets its own
    // panel in full; this only ever narrows the employee app.
    $featureAccess = array_fill_keys(FeatureAccess::keys(), true);
    if (!$isAdmin) {
        try {
            $featureAccess = FeatureAccess::effectiveForUser($uid, pg_user_division_ids($uid));
        } catch (\Throwable $e) { /* tables not migrated yet — default everything on */ }
    }

    Http::json([
        'ok'                 => true,
        'serverDate'         => date('Y-m-d'),
        'serverTime'         => date('Y-m-d\TH:i:s'),
        'csrf'               => Auth::csrf(),
        'principal'          => pg_principal_out()['principal'],
        'branches'           => $branches,
        'stores'             => $stores,
        'positions'          => $positions,
        'divisions'          => $divisions,
        'users'              => $users,
        'attendanceSettings' => $attendanceSettings,
        'systemSettings'     => $systemSettings,
        'attendanceRecords'  => $attendanceRecords,
        'overtimeRecords'    => $overtimeRecords,
        'izinRecords'        => $izinRecords,
        'expenseRecords'     => $expenseRecords,
        'warehouseReceipts'  => $warehouseReceipts,
        'warehouseSuppliers' => $warehouseSuppliers,
        'piketSchedules'     => $piketSchedules,
        'piketSettings'      => $piketSettings,
        'notifications'      => $notifications,
        'notificationsUnread' => $notificationsUnread,
        'chatThreads'        => $chatThreads,
        'chatUnread'         => $chatUnread,
        'momenPostIds'       => $momenPostIds,
        'todos'              => $todos,
        'jobDesks'           => $jobDesks,
        'programs'           => $programs,
        'kpiTemplateCount'   => $kpiTemplateCount,
        'featureAccess'      => $featureAccess,
    ]);
});
