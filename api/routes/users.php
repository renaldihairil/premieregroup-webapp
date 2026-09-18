<?php
declare(strict_types=1);

/**
 * Karyawan (users). Admin only (org.manage).
 *
 *   POST   /api/users                 { fullName, username, divisionIds:[..] (or divisionId), positionId?, status?, role? }
 *   PATCH  /api/users/{id}            partial: fullName, username, divisionIds (or divisionId), positionId, branchId, status, role
 *
 * A karyawan can belong to SEVERAL divisions — `divisionIds` (array). The first
 * id is the "primary" division (kept in users.division_id so all older code that
 * reads one division keeps working); the full set lives in `user_divisions`.
 *   DELETE /api/users/{id}            SOFT delete (sets deleted_at + status=inactive)
 *
 * A soft delete keeps attendance / overtime / KPI history valid (FK RESTRICT).
 */

function pg_user_out(int $id): array
{
    return fmt_user(Db::one(
        "SELECT u.*, (SELECT GROUP_CONCAT(ud.division_id) FROM user_divisions ud WHERE ud.user_id = u.id) AS division_ids
           FROM users u WHERE u.id = ?",
        [$id]
    ));
}

function pg_resolve_fk(mixed $v, string $table, string $label): ?int
{
    if ($v === null || $v === '' || $v === 0 || $v === '0') {
        return null;
    }
    $id = (int) $v;
    if (!Db::one("SELECT id FROM {$table} WHERE id = ?", [$id])) {
        Http::fail($label . ' tidak valid.', 422);
    }
    return $id;
}

/** All division ids a user belongs to (from user_divisions, or the single
 *  users.division_id as a fallback). @return int[] */
function pg_user_division_ids(int $userId): array
{
    $ids = array_map(
        static fn($r) => (int) $r['division_id'],
        Db::all("SELECT division_id FROM user_divisions WHERE user_id = ?", [$userId])
    );
    if (!$ids) {
        $d = Db::one("SELECT division_id FROM users WHERE id = ?", [$userId])['division_id'] ?? null;
        if ($d) {
            $ids = [(int) $d];
        }
    }
    return $ids;
}

/**
 * Read the requested divisions from a body: `divisionIds` (array) is preferred;
 * a scalar `divisionId` still works. Returns a de-duplicated, validated list of
 * ints with the primary (first) division at index 0. 422s if empty.
 * @return int[]
 */
function pg_user_divisions_in(array $body): array
{
    $raw = $body['divisionIds'] ?? null;
    if (!is_array($raw)) {
        $single = $body['divisionId'] ?? null;
        $raw = ($single !== null && $single !== '') ? [$single] : [];
    }
    $ids = [];
    foreach ($raw as $d) {
        $rid = pg_resolve_fk($d, 'divisions', 'Divisi');
        if ($rid && !in_array($rid, $ids, true)) {
            $ids[] = $rid;
        }
    }
    if (!$ids) {
        Http::fail('Pilih minimal satu divisi.', 422);
    }
    return $ids;
}

/** Replace a user's division set. First id is the primary (users.division_id). */
function pg_user_sync_divisions(int $userId, array $divIds): void
{
    Db::run("UPDATE users SET division_id = ? WHERE id = ?", [$divIds[0], $userId]);
    Db::run("DELETE FROM user_divisions WHERE user_id = ?", [$userId]);
    foreach ($divIds as $d) {
        Db::run("INSERT INTO user_divisions (user_id, division_id) VALUES (?, ?)", [$userId, $d]);
    }
}

pg_route('POST', '/users', function (): void {
    Guard::can('org.manage');
    $body = Http::body();

    $fullName = Validate::str($body['fullName'] ?? '', 'Nama lengkap', 1, 150);
    $username = Validate::username($body['username'] ?? '');
    $divIds   = pg_user_divisions_in($body);          // 1+ divisi, primary di index 0
    $posId    = pg_resolve_fk($body['positionId'] ?? null, 'positions', 'Jabatan');
    $branch   = pg_resolve_fk($body['branchId'] ?? null, 'branches', 'Cabang');
    $status   = Validate::enum($body['status'] ?? 'active', ['active', 'inactive'], 'Status');
    $role     = Validate::enum($body['role'] ?? 'staff', ['kepala_divisi', 'supervisor', 'staff'], 'Role');

    if (Db::one("SELECT id FROM users WHERE username = ?", [$username])) {
        Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
    }

    try {
        $newId = 0;
        Db::tx(function () use (&$newId, $username, $fullName, $divIds, $posId, $branch, $role, $status) {
            Db::run(
                "INSERT INTO users (username, full_name, division_id, position_id, branch_id, role, status)
                 VALUES (?, ?, ?, ?, ?, ?, ?)",
                [$username, $fullName, $divIds[0], $posId, $branch, $role, $status]
            );
            $newId = (int) Db::lastId();
            pg_user_sync_divisions($newId, $divIds);
        });
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
        }
        throw $e;
    }

    Http::json(['ok' => true, 'record' => pg_user_out($newId)]);
});

pg_route('PATCH', '/users/{id}', function (array $p): void {
    Guard::can('org.manage');
    $id = (int) $p['id'];
    $cur = Db::one("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", [$id]);
    if (!$cur) {
        Http::json(['ok' => false, 'error' => 'Karyawan tidak ditemukan.'], 200);
    }
    $body = Http::body();
    $set = [];
    $args = [];

    // Divisions are stored in user_divisions (+ users.division_id = primary) and
    // synced separately from the single-column SET below.
    $newDivIds = null;
    if (array_key_exists('divisionIds', $body) || array_key_exists('divisionId', $body)) {
        $newDivIds = pg_user_divisions_in($body);
    }

    if (array_key_exists('fullName', $body)) {
        $set[] = 'full_name = ?';
        $args[] = Validate::str($body['fullName'], 'Nama lengkap', 1, 150);
    }
    if (array_key_exists('username', $body)) {
        $uname = Validate::username($body['username']);
        if (Db::one("SELECT id FROM users WHERE username = ? AND id <> ?", [$uname, $id])) {
            Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
        }
        $set[] = 'username = ?';
        $args[] = $uname;
    }
    if (array_key_exists('positionId', $body)) {
        $set[] = 'position_id = ?';
        $args[] = pg_resolve_fk($body['positionId'], 'positions', 'Jabatan');
    }
    if (array_key_exists('branchId', $body)) {
        $set[] = 'branch_id = ?';
        $args[] = pg_resolve_fk($body['branchId'], 'branches', 'Cabang');
    }
    if (array_key_exists('status', $body)) {
        $set[] = 'status = ?';
        $args[] = Validate::enum($body['status'], ['active', 'inactive'], 'Status');
    }
    if (array_key_exists('role', $body)) {
        $set[] = 'role = ?';
        $args[] = Validate::enum($body['role'], ['kepala_divisi', 'supervisor', 'staff'], 'Role');
    }
    if (!$set && $newDivIds === null) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }

    try {
        Db::tx(function () use ($set, $args, $id, $newDivIds) {
            if ($set) {
                $a = $args;
                $a[] = $id;
                Db::run("UPDATE users SET " . implode(', ', $set) . " WHERE id = ?", $a);
            }
            if ($newDivIds !== null) {
                pg_user_sync_divisions($id, $newDivIds);
            }
        });
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => 'Username sudah dipakai karyawan lain.'], 200);
        }
        throw $e;
    }

    Http::json(['ok' => true, 'record' => pg_user_out($id)]);
});

pg_route('DELETE', '/users/{id}', function (array $p): void {
    Guard::can('org.manage');
    $id = (int) $p['id'];
    $cur = Db::one("SELECT id FROM users WHERE id = ? AND deleted_at IS NULL", [$id]);
    if (!$cur) {
        Http::json(['ok' => false, 'error' => 'Karyawan tidak ditemukan.'], 200);
    }
    // SOFT delete — keep the row so historical FKs stay valid. Free the username
    // so it can be reused (append a tombstone suffix).
    Db::tx(function () use ($id) {
        $u = Db::one("SELECT username FROM users WHERE id = ?", [$id]);
        $tomb = substr('x_' . $u['username'] . '_' . dechex(time()), 0, 60);
        Db::run(
            "UPDATE users SET deleted_at = NOW(), status = 'inactive', username = ? WHERE id = ?",
            [$tomb, $id]
        );
        // Todos of a deleted user lose their PIC (matches ON DELETE SET NULL intent).
        Db::run("UPDATE todos SET assignee_id = NULL WHERE assignee_id = ?", [$id]);
        // Free the division memberships (kept users.division_id for history).
        Db::run("DELETE FROM user_divisions WHERE user_id = ?", [$id]);
    });
    Http::json(['ok' => true]);
});
