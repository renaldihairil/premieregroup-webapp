<?php
declare(strict_types=1);

/**
 * Job Desk — uraian tugas per divisi / jabatan.
 * ------------------------------------------------------------
 *   GET    /api/job-desks            (admin)  list semua job desk + nama scope
 *   POST   /api/job-desks            (admin)  buat job desk baru
 *   PATCH  /api/job-desks/{id}       (admin)  ubah job desk
 *   DELETE /api/job-desks/{id}       (admin)  hapus job desk
 *   GET    /api/my-job-desks         (user)   job desk aktif yang berlaku untuk saya
 *
 * Admin menulis; karyawan hanya membaca (lihat juga /api/bootstrap yang
 * sudah menyertakan `jobDesks` — untuk user sudah difilter ke divisi /
 * jabatannya sendiri dan hanya yang berstatus aktif).
 */

const PG_JOBDESK_SELECT_ADMIN =
    "SELECT jd.*, d.name AS division_name, p.name AS position_name, adm.name AS updated_by_name
       FROM job_desks jd
       LEFT JOIN divisions d   ON d.id = jd.division_id
       LEFT JOIN positions p   ON p.id = jd.position_id
       LEFT JOIN admins    adm ON adm.id = jd.updated_by_admin_id";

/**
 * Resolve { scopeType, divisionId, positionId } from a request body.
 * On create everything is required; on edit pass $existing so an omitted
 * scope keeps whatever the row already has.
 */
function pg_jobdesk_scope(array $body, ?array $existing = null): array
{
    $scopeType = $existing['scope_type'] ?? null;
    if (array_key_exists('scopeType', $body) || $existing === null) {
        $scopeType = Validate::enum($body['scopeType'] ?? '', ['division', 'position'], 'Jenis penerapan');
    }

    $divisionId = $existing['division_id'] ?? null;
    $positionId = $existing['position_id'] ?? null;

    if ($scopeType === 'division') {
        $positionId = null;
        if (array_key_exists('divisionId', $body) || $existing === null) {
            $divisionId = Validate::int($body['divisionId'] ?? '', 'Divisi');
        }
        if (!$divisionId || !Db::one("SELECT id FROM divisions WHERE id = ?", [$divisionId])) {
            Http::fail('Divisi tidak ditemukan.', 422);
        }
    } else {
        $divisionId = null;
        if (array_key_exists('positionId', $body) || $existing === null) {
            $positionId = Validate::int($body['positionId'] ?? '', 'Jabatan');
        }
        if (!$positionId || !Db::one("SELECT id FROM positions WHERE id = ?", [$positionId])) {
            Http::fail('Jabatan tidak ditemukan.', 422);
        }
    }

    return [$scopeType, $divisionId ? (int) $divisionId : null, $positionId ? (int) $positionId : null];
}

pg_route('GET', '/job-desks', function (): void {
    Guard::can('org.manage');
    $rows = Db::all(PG_JOBDESK_SELECT_ADMIN . " ORDER BY COALESCE(d.name, p.name), jd.title");
    Http::json(['ok' => true, 'items' => array_map('fmt_jobdesk', $rows)]);
});

pg_route('POST', '/job-desks', function (): void {
    $admin = Guard::can('org.manage');
    $body  = Http::body();

    [$scopeType, $divisionId, $positionId] = pg_jobdesk_scope($body, null);
    $title   = Validate::str($body['title'] ?? '', 'Judul job desk', 1, 200);
    $content = Validate::str($body['content'] ?? '', 'Uraian tugas', 1, 20000);
    $status  = Validate::enum($body['status'] ?? 'active', ['active', 'inactive'], 'Status');

    Db::run(
        "INSERT INTO job_desks (scope_type, division_id, position_id, title, content, status, updated_by_admin_id)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
        [$scopeType, $divisionId, $positionId, $title, $content, $status, (int) $admin['id']]
    );
    $newJdId = (int) Db::lastId();   // capture BEFORE any Notify insert bumps LAST_INSERT_ID

    if ($status === 'active') {
        $targets = $scopeType === 'division'
            ? Db::all("SELECT DISTINCT u.id FROM users u
                        LEFT JOIN user_divisions ud ON ud.user_id = u.id
                       WHERE u.status = 'active' AND (u.division_id = ? OR ud.division_id = ?)", [$divisionId, $divisionId])
            : Db::all("SELECT id FROM users WHERE status = 'active' AND position_id = ?", [$positionId]);
        foreach ($targets as $t) {
            Notify::toUser((int) $t['id'], 'jobdesk.published',
                'Job Desk baru',
                'Admin menambahkan uraian tugas: ' . mb_substr($title, 0, 120),
                '/job-desk');
        }
    }

    $row = Db::one(PG_JOBDESK_SELECT_ADMIN . " WHERE jd.id = ?", [$newJdId]);
    Http::json(['ok' => true, 'record' => fmt_jobdesk($row)]);
});

pg_route('PATCH', '/job-desks/{id}', function (array $p): void {
    $admin = Guard::can('org.manage');
    $id    = (int) $p['id'];
    $existing = Db::one("SELECT * FROM job_desks WHERE id = ?", [$id]);
    if (!$existing) {
        Http::json(['ok' => false, 'error' => 'Job desk tidak ditemukan.'], 200);
    }
    $body = Http::body();

    $set  = ['updated_by_admin_id = ?'];
    $args = [(int) $admin['id']];

    if (array_key_exists('scopeType', $body) || array_key_exists('divisionId', $body) || array_key_exists('positionId', $body)) {
        [$scopeType, $divisionId, $positionId] = pg_jobdesk_scope($body, $existing);
        $set[] = 'scope_type = ?';
        $args[] = $scopeType;
        $set[] = 'division_id = ?';
        $args[] = $divisionId;
        $set[] = 'position_id = ?';
        $args[] = $positionId;
    }
    if (array_key_exists('title', $body)) {
        $set[] = 'title = ?';
        $args[] = Validate::str($body['title'], 'Judul job desk', 1, 200);
    }
    if (array_key_exists('content', $body)) {
        $set[] = 'content = ?';
        $args[] = Validate::str($body['content'], 'Uraian tugas', 1, 20000);
    }
    if (array_key_exists('status', $body)) {
        $set[] = 'status = ?';
        $args[] = Validate::enum($body['status'], ['active', 'inactive'], 'Status');
    }

    $args[] = $id;
    Db::run("UPDATE job_desks SET " . implode(', ', $set) . " WHERE id = ?", $args);

    $row = Db::one(PG_JOBDESK_SELECT_ADMIN . " WHERE jd.id = ?", [$id]);
    Http::json(['ok' => true, 'record' => fmt_jobdesk($row)]);
});

pg_route('DELETE', '/job-desks/{id}', function (array $p): void {
    Guard::can('org.manage');
    $n = Db::exec("DELETE FROM job_desks WHERE id = ?", [(int) $p['id']]);
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => 'Job desk tidak ditemukan.']);
});

pg_route('GET', '/my-job-desks', function (): void {
    $u      = Guard::user();
    $myDivs = pg_user_division_ids((int) $u['id']);
    $divPh  = $myDivs ? implode(',', array_fill(0, count($myDivs), '?')) : 'NULL';
    $rows = Db::all(
        "SELECT jd.*, d.name AS division_name, p.name AS position_name
           FROM job_desks jd
           LEFT JOIN divisions d ON d.id = jd.division_id
           LEFT JOIN positions p ON p.id = jd.position_id
          WHERE jd.status = 'active'
            AND ( (jd.scope_type = 'division' AND jd.division_id IN ($divPh))
               OR (jd.scope_type = 'position' AND jd.position_id = ?) )
          ORDER BY jd.scope_type = 'division' DESC, jd.title",
        array_merge($myDivs, [$u['position_id'] !== null ? (int) $u['position_id'] : null])
    );
    Http::json(['ok' => true, 'items' => array_map('fmt_jobdesk', $rows)]);
});
