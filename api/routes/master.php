<?php
declare(strict_types=1);

/**
 * Master data — Divisi / Jabatan / Cabang. Admin only (org.manage).
 *
 *   POST   /api/master/{coll}
 *   PATCH  /api/master/{coll}/{id}
 *   DELETE /api/master/{coll}/{id}
 *
 * {coll} in: divisions | positions | branches | stores
 * Deactivate (status=inactive) instead of delete whenever a record has
 * dependents — DELETE is blocked by FK ON DELETE RESTRICT and returns a
 * friendly message.
 */

function pg_master_cfg(string $coll): array
{
    $map = [
        'divisions' => ['table' => 'divisions', 'hasDesc' => true,  'label' => 'Divisi',  'fmt' => 'fmt_division'],
        'positions' => ['table' => 'positions', 'hasDesc' => false, 'label' => 'Jabatan', 'fmt' => 'fmt_position'],
        'branches'  => ['table' => 'branches',  'hasDesc' => false, 'label' => 'Cabang',  'fmt' => 'fmt_branch'],
        'stores'    => ['table' => 'stores',    'hasDesc' => true,  'label' => 'Toko',    'fmt' => 'fmt_store'],
    ];
    if (!isset($map[$coll])) {
        Http::fail('Koleksi data tidak dikenali.', 404);
    }
    return $map[$coll];
}

pg_route('POST', '/master/{coll}', function (array $p): void {
    Guard::can('org.manage');
    $cfg  = pg_master_cfg($p['coll']);
    $body = Http::body();

    $name   = Validate::str($body['name'] ?? '', 'Nama ' . $cfg['label'], 1, 120);
    $status = Validate::enum($body['status'] ?? 'active', ['active', 'inactive'], 'Status');
    $desc   = $cfg['hasDesc'] ? Validate::optStr($body['description'] ?? null, 255) : null;

    $cols = $cfg['hasDesc'] ? '(name, status, description)' : '(name, status)';
    $vals = $cfg['hasDesc'] ? [$name, $status, $desc] : [$name, $status];
    $ph   = $cfg['hasDesc'] ? '(?, ?, ?)' : '(?, ?)';

    try {
        Db::run("INSERT INTO {$cfg['table']} $cols VALUES $ph", $vals);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => $cfg['label'] . ' dengan nama ini sudah ada.'], 200);
        }
        throw $e;
    }

    $row = Db::one("SELECT * FROM {$cfg['table']} WHERE id = ?", [(int) Db::lastId()]);
    Http::json(['ok' => true, 'record' => $cfg['fmt']($row)]);
});

pg_route('PATCH', '/master/{coll}/{id}', function (array $p): void {
    Guard::can('org.manage');
    $cfg = pg_master_cfg($p['coll']);
    $id  = (int) $p['id'];
    if (!Db::one("SELECT id FROM {$cfg['table']} WHERE id = ?", [$id])) {
        Http::json(['ok' => false, 'error' => $cfg['label'] . ' tidak ditemukan.'], 200);
    }
    $body = Http::body();

    $set = [];
    $args = [];
    if (array_key_exists('name', $body)) {
        $set[] = 'name = ?';
        $args[] = Validate::str($body['name'], 'Nama ' . $cfg['label'], 1, 120);
    }
    if (array_key_exists('status', $body)) {
        $set[] = 'status = ?';
        $args[] = Validate::enum($body['status'], ['active', 'inactive'], 'Status');
    }
    if ($cfg['hasDesc'] && array_key_exists('description', $body)) {
        $set[] = 'description = ?';
        $args[] = Validate::optStr($body['description'], 255);
    }
    if (!$set) {
        Http::json(['ok' => false, 'error' => 'Tidak ada perubahan.'], 200);
    }
    $args[] = $id;

    try {
        Db::run("UPDATE {$cfg['table']} SET " . implode(', ', $set) . " WHERE id = ?", $args);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => $cfg['label'] . ' dengan nama ini sudah ada.'], 200);
        }
        throw $e;
    }

    $row = Db::one("SELECT * FROM {$cfg['table']} WHERE id = ?", [$id]);
    Http::json(['ok' => true, 'record' => $cfg['fmt']($row)]);
});

pg_route('DELETE', '/master/{coll}/{id}', function (array $p): void {
    Guard::can('org.manage');
    $cfg = pg_master_cfg($p['coll']);
    $id  = (int) $p['id'];
    try {
        $n = Db::exec("DELETE FROM {$cfg['table']} WHERE id = ?", [$id]);
    } catch (\PDOException $e) {
        if ($e->getCode() === '23000') {
            Http::json(['ok' => false, 'error' => $cfg['label'] . ' ini masih dipakai oleh data lain. Pindahkan karyawan / data terkait terlebih dahulu sebelum menghapus.'], 200);
        }
        throw $e;
    }
    Http::json($n ? ['ok' => true] : ['ok' => false, 'error' => $cfg['label'] . ' tidak ditemukan.']);
});
