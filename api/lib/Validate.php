<?php
declare(strict_types=1);

/**
 * Small input validators. Each throws a 422 with a human message on failure.
 * Never trust the client — every write path runs its fields through here.
 */
final class Validate
{
    public static function str(mixed $v, string $label, int $min = 1, int $max = 255): string
    {
        $v = is_string($v) ? trim($v) : '';
        $len = mb_strlen($v);
        if ($len < $min) {
            Http::fail($label . ' wajib diisi.', 422);
        }
        if ($len > $max) {
            Http::fail($label . ' terlalu panjang (maks ' . $max . ' karakter).', 422);
        }
        return $v;
    }

    public static function optStr(mixed $v, int $max = 1000): ?string
    {
        if ($v === null || $v === '') {
            return null;
        }
        $v = trim((string) $v);
        if (mb_strlen($v) > $max) {
            Http::fail('Teks terlalu panjang.', 422);
        }
        return $v === '' ? null : $v;
    }

    public static function int(mixed $v, string $label): int
    {
        if (!is_numeric($v)) {
            Http::fail($label . ' tidak valid.', 422);
        }
        return (int) $v;
    }

    public static function optInt(mixed $v): ?int
    {
        if ($v === null || $v === '') {
            return null;
        }
        return is_numeric($v) ? (int) $v : null;
    }

    public static function enum(mixed $v, array $allowed, string $label): string
    {
        $v = (string) $v;
        if (!in_array($v, $allowed, true)) {
            Http::fail($label . ' tidak valid.', 422);
        }
        return $v;
    }

    /** "HH:MM" -> "HH:MM:00" */
    public static function time(mixed $v, string $label): string
    {
        if (!is_string($v) || !preg_match('/^([01]\d|2[0-3]):([0-5]\d)$/', trim($v), $m)) {
            Http::fail($label . ' harus berformat HH:MM.', 422);
        }
        return $m[1] . ':' . $m[2] . ':00';
    }

    /** "YYYY-MM-DD" */
    public static function date(mixed $v, string $label): string
    {
        if (!is_string($v) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', trim($v))) {
            Http::fail($label . ' harus berformat YYYY-MM-DD.', 422);
        }
        $v = trim($v);
        [$y, $mo, $d] = array_map('intval', explode('-', $v));
        if (!checkdate($mo, $d, $y)) {
            Http::fail($label . ' bukan tanggal yang sah.', 422);
        }
        return $v;
    }

    public static function username(mixed $v): string
    {
        $v = strtolower(trim((string) $v));
        if (!preg_match('/^[a-z0-9._-]{3,60}$/', $v)) {
            Http::fail('Username hanya boleh huruf kecil, angka, titik, garis bawah, atau strip (3–60 karakter).', 422);
        }
        return $v;
    }

    /** work_days array -> MySQL SET string, e.g. "mon,tue,fri" */
    public static function workDays(mixed $v): string
    {
        $days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        if (!is_array($v)) {
            Http::fail('Hari kerja tidak valid.', 422);
        }
        $picked = array_values(array_intersect($days, array_map('strval', $v)));
        return implode(',', $picked);
    }
}
