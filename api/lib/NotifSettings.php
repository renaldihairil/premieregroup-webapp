<?php
declare(strict_types=1);

/**
 * Admin-configurable notification catalog: per-type on/off, and for
 * "reminder" types (fired ahead of a deadline, not by a user action) how
 * long before the deadline to fire. Backed by `notification_settings`
 * (PK = type); a missing row means "use the built-in default" below, so a
 * fresh install needs zero seeding and new types just work.
 */
final class NotifSettings
{
    /**
     * type => { label, category, reminder (bool), defaultOffsetValue?, defaultOffsetUnit? }
     * Every `type` string passed to Notify::push()/pushOnce() anywhere in the
     * app MUST have an entry here, or Notify::push() will silently drop it
     * (unknown types are treated as "no settings row possible" -> falls back
     * to enabled=true, which is safe, but won't show in the admin UI).
     */
    public static function catalog(): array
    {
        return [
            // Todo
            'todo.assigned'            => ['label' => 'Todo baru ditugaskan ke karyawan',        'category' => 'Todo', 'reminder' => false],
            'todo.updated'             => ['label' => 'Todo diperbarui admin',                    'category' => 'Todo', 'reminder' => false],
            'todo.done'                => ['label' => 'Karyawan menyelesaikan todo',               'category' => 'Todo', 'reminder' => false],
            'todo.self_created'        => ['label' => 'Karyawan membuat todo sendiri',             'category' => 'Todo', 'reminder' => false],
            'todo.attachment'          => ['label' => 'Lampiran laporan todo ditambahkan',         'category' => 'Todo', 'reminder' => false],
            'todo.deadline'            => ['label' => 'Pengingat deadline todo', 'category' => 'Todo', 'reminder' => true,
                                            'defaultOffsetValue' => 1, 'defaultOffsetUnit' => 'hour'],
            // Program Kerja
            'program.assigned'         => ['label' => 'Ditambahkan ke program kerja baru',        'category' => 'Program Kerja', 'reminder' => false],
            'program.archived'         => ['label' => 'Program diarsipkan',                        'category' => 'Program Kerja', 'reminder' => false],
            'program.reactivated'      => ['label' => 'Program diaktifkan kembali',                'category' => 'Program Kerja', 'reminder' => false],
            'program.deadline_changed' => ['label' => 'Deadline program diubah admin',             'category' => 'Program Kerja', 'reminder' => false],
            'program.deadline'         => ['label' => 'Pengingat deadline program', 'category' => 'Program Kerja', 'reminder' => true,
                                            'defaultOffsetValue' => 1, 'defaultOffsetUnit' => 'day'],
            // Absensi & Lembur
            'attendance.checkin'       => ['label' => 'Karyawan absen masuk',                      'category' => 'Absensi & Lembur', 'reminder' => false],
            'attendance.checkout'      => ['label' => 'Karyawan absen pulang',                      'category' => 'Absensi & Lembur', 'reminder' => false],
            'attendance.settings'      => ['label' => 'Pengaturan jam kerja/absensi diperbarui',   'category' => 'Absensi & Lembur', 'reminder' => false],
            'overtime.start'           => ['label' => 'Karyawan memulai lembur',                    'category' => 'Absensi & Lembur', 'reminder' => false],
            'overtime.end'             => ['label' => 'Lembur selesai, menunggu persetujuan',      'category' => 'Absensi & Lembur', 'reminder' => false],
            'overtime.approved'        => ['label' => 'Lembur disetujui admin',                     'category' => 'Absensi & Lembur', 'reminder' => false],
            'overtime.rejected'        => ['label' => 'Lembur ditolak admin',                       'category' => 'Absensi & Lembur', 'reminder' => false],
            // Izin
            'izin.submitted'           => ['label' => 'Pengajuan izin baru',                        'category' => 'Izin', 'reminder' => false],
            // Pengeluaran
            'expense.submitted'        => ['label' => 'Laporan pengeluaran baru dari karyawan',      'category' => 'Pengeluaran', 'reminder' => false],
            // Resi Gudang
            'warehouse.submitted'      => ['label' => 'Resi gudang baru dari karyawan',              'category' => 'Resi Gudang', 'reminder' => false],
            // Jadwal Piket
            'piket.reminder'           => ['label' => 'Pengingat jadwal piket hari ini',             'category' => 'Jadwal Piket', 'reminder' => false],
            'piket.friday'             => ['label' => 'Pengingat Jumat Berkah (bersih-bersih)',       'category' => 'Jadwal Piket', 'reminder' => false],
            // KPI
            'kpi.submitted'            => ['label' => 'Laporan KPI dikirim karyawan',               'category' => 'KPI', 'reminder' => false],
            'kpi.reviewed'             => ['label' => 'Laporan KPI ditinjau admin',                 'category' => 'KPI', 'reminder' => false],
            'kpi.template_published'   => ['label' => 'Form KPI baru diterbitkan',                  'category' => 'KPI', 'reminder' => false],
            // Kunjungan
            'visit.submitted'          => ['label' => 'Laporan kunjungan dikirim karyawan',         'category' => 'Kunjungan', 'reminder' => false],
            'visit.reviewed'           => ['label' => 'Laporan kunjungan ditinjau admin',           'category' => 'Kunjungan', 'reminder' => false],
            // Job Desk
            'jobdesk.published'        => ['label' => 'Job Desk baru diterbitkan',                  'category' => 'Job Desk', 'reminder' => false],
            // Waktu Sholat
            'prayer.adzan'             => ['label' => 'Notifikasi waktu sholat (adzan)',            'category' => 'Waktu Sholat', 'reminder' => false],
            // Momen Kerja
            'post.shared'              => ['label' => 'Ada momen kerja baru dibagikan',             'category' => 'Momen Kerja', 'reminder' => false],
            'post.liked'               => ['label' => 'Momen Anda disukai orang lain',              'category' => 'Momen Kerja', 'reminder' => false],
            'post.commented'           => ['label' => 'Ada komentar baru di momen Anda',             'category' => 'Momen Kerja', 'reminder' => false],
            'post.comment_liked'       => ['label' => 'Komentar Anda disukai orang lain',            'category' => 'Momen Kerja', 'reminder' => false],
            'post.comment_reply'       => ['label' => 'Komentar Anda dibalas orang lain',            'category' => 'Momen Kerja', 'reminder' => false],
            // Chat
            'chat.message'             => ['label' => 'Pesan chat pribadi baru',                     'category' => 'Chat', 'reminder' => false],
            // Info Aplikasi
            'app.update'               => ['label' => 'Info update aplikasi (broadcast admin)',     'category' => 'Info Aplikasi', 'reminder' => false],
        ];
    }

    private const UNIT_SECONDS = ['minute' => 60, 'hour' => 3600, 'day' => 86400];

    /** @var array<string,array<string,mixed>>|null request-scoped cache */
    private static ?array $_rows = null;

    private static function rows(): array
    {
        if (self::$_rows !== null) {
            return self::$_rows;
        }
        self::$_rows = [];
        try {
            foreach (Db::all("SELECT * FROM notification_settings") as $r) {
                self::$_rows[$r['type']] = $r;
            }
        } catch (\Throwable $e) {
            // Table missing mid-migration, or DB hiccup — fail open (defaults apply).
        }
        return self::$_rows;
    }

    public static function isEnabled(string $type): bool
    {
        $rows = self::rows();
        if (isset($rows[$type])) {
            return (bool) $rows[$type]['enabled'];
        }
        return true; // no row -> default on
    }

    /** Seconds of lead-time before a deadline a reminder type should fire. */
    public static function reminderOffsetSeconds(string $type): int
    {
        $cat   = self::catalog()[$type] ?? [];
        $value = (int) ($cat['defaultOffsetValue'] ?? 1);
        $unit  = (string) ($cat['defaultOffsetUnit'] ?? 'hour');

        $rows = self::rows();
        if (isset($rows[$type]) && $rows[$type]['offset_value'] !== null && !empty($rows[$type]['offset_unit'])) {
            $value = (int) $rows[$type]['offset_value'];
            $unit  = (string) $rows[$type]['offset_unit'];
        }
        $value = max(1, min(9999, $value));
        return max(60, $value * (self::UNIT_SECONDS[$unit] ?? 3600));
    }

    /** Full catalog + effective (saved-or-default) values, for the admin UI. */
    public static function list(): array
    {
        $rows = self::rows();
        $out  = [];
        foreach (self::catalog() as $type => $c) {
            $r = $rows[$type] ?? null;
            $out[] = [
                'type'        => $type,
                'label'       => $c['label'],
                'category'    => $c['category'],
                'reminder'    => (bool) $c['reminder'],
                'enabled'     => $r ? (bool) $r['enabled'] : true,
                'offsetValue' => $c['reminder'] ? (int) ($r['offset_value'] ?? $c['defaultOffsetValue'] ?? 1) : null,
                'offsetUnit'  => $c['reminder'] ? (string) ($r['offset_unit'] ?? $c['defaultOffsetUnit'] ?? 'hour') : null,
            ];
        }
        return $out;
    }

    /** @param list<array{type:string,enabled?:bool,offsetValue?:int,offsetUnit?:string}> $items */
    public static function saveMany(array $items): void
    {
        $catalog = self::catalog();
        foreach ($items as $it) {
            $type = (string) ($it['type'] ?? '');
            if (!isset($catalog[$type])) {
                continue; // ignore unknown types rather than erroring the whole batch
            }
            $enabled = !empty($it['enabled']) ? 1 : 0;
            $ov = null;
            $ou = null;
            if ($catalog[$type]['reminder']) {
                $ov = max(1, min(9999, (int) ($it['offsetValue'] ?? 1)));
                $ou = in_array($it['offsetUnit'] ?? '', ['minute', 'hour', 'day'], true) ? $it['offsetUnit'] : 'hour';
            }
            Db::run(
                "INSERT INTO notification_settings (type, enabled, offset_value, offset_unit)
                 VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), offset_value = VALUES(offset_value), offset_unit = VALUES(offset_unit)",
                [$type, $enabled, $ov, $ou]
            );
        }
        self::$_rows = null; // next read re-fetches
    }
}
