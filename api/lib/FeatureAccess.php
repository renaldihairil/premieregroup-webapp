<?php
declare(strict_types=1);

/**
 * Which OPTIONAL User App sections an employee can see — Admin configures
 * this per division (with per-employee exceptions), same spirit as
 * NotifSettings: a fixed catalog in code, only the overrides live in the DB,
 * so a fresh install needs zero seeding and a new feature key just works
 * (defaults to visible everywhere until Admin narrows it).
 *
 * Dashboard, Momen, Profil, Todo List, Job Desk, and Program are considered
 * CORE — every account gets them unconditionally, they are never in this
 * catalog and never gated. Only genuinely optional sections belong here:
 *   - Absensi (bundles Izin + Lembur + the Rekap Absensi shortcut as ONE
 *     switch — they always show/hide together) — "wajib" by default, but
 *     Admin may still exclude it for a division/employee that doesn't clock
 *     in (e.g. senior positions), which is exactly what this system is for.
 *   - Kunjungan, Lapor KPI, Pengeluaran, Resi Gudang, Jadwal Piket, Kerja
 *     Staf, Hasil Kunjungan, Hasil KPI, Laporan Resi — genuinely optional per
 *     team (Kerja Staf, Hasil Kunjungan, Hasil KPI and Laporan Resi are
 *     lead/supervisor cross-staff views).
 * Future optional features get added here, not to the core list.
 *
 * This is UI-only (declutters the menu for people who don't need a section) —
 * it is NOT an access-control boundary. The underlying API routes stay
 * reachable regardless; that's a deliberate, recorded scope decision.
 */
final class FeatureAccess
{
    /** feature_key => { label } */
    public static function catalog(): array
    {
        return [
            'absensi'     => ['label' => 'Absensi (termasuk Izin & Lembur)'],
            'kunjungan'   => ['label' => 'Kunjungan'],
            'kpi'         => ['label' => 'Lapor KPI'],
            'pengeluaran' => ['label' => 'Pengeluaran'],
            'resi_gudang' => ['label' => 'Resi Gudang (catatan barang masuk gudang)'],
            'laporan_resi' => ['label' => 'Laporan Resi (laporan resi gudang semua staf)'],
            'piket'       => ['label' => 'Jadwal Piket'],
            'kerja_staf'  => ['label' => 'Kerja Staf (laporan todo semua staf)'],
            'hasil_kunjungan' => ['label' => 'Hasil Kunjungan (laporan kunjungan semua staf)'],
            'hasil_kpi'   => ['label' => 'Hasil KPI (laporan KPI semua staf)'],
        ];
    }

    /** @return string[] */
    public static function keys(): array
    {
        return array_keys(self::catalog());
    }

    /**
     * Effective on/off per feature for one employee: a per-user override
     * always wins outright; otherwise a feature is on unless ALL of the
     * employee's divisions that have an explicit row disable it (i.e. ANY
     * one of their divisions enabling it is enough — belonging to several
     * teams should only ever add access, never take it away).
     *
     * @param  int[] $divisionIds
     * @return array<string,bool>
     */
    public static function effectiveForUser(int $userId, array $divisionIds): array
    {
        $keys = self::keys();
        $out  = array_fill_keys($keys, true);

        if ($divisionIds) {
            $ph   = implode(',', array_fill(0, count($divisionIds), '?'));
            $rows = Db::all("SELECT feature_key, enabled FROM division_features WHERE division_id IN ($ph)", $divisionIds);
            $byKey = [];
            foreach ($rows as $r) {
                $byKey[$r['feature_key']][] = (bool) $r['enabled'];
            }
            foreach ($byKey as $key => $vals) {
                if (in_array($key, $keys, true)) {
                    $out[$key] = in_array(true, $vals, true);
                }
            }
        }

        foreach (Db::all("SELECT feature_key, enabled FROM user_features WHERE user_id = ?", [$userId]) as $r) {
            if (in_array($r['feature_key'], $keys, true)) {
                $out[$r['feature_key']] = (bool) $r['enabled'];
            }
        }

        return $out;
    }
}
