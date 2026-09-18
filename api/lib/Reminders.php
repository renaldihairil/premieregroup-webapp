<?php
declare(strict_types=1);

/**
 * Time-based reminders — the "nudge" notifications that are not triggered by a
 * user action but by the clock:
 *
 *   todo.deadline     — an unfinished todo is due today / tomorrow
 *   program.deadline  — an active program ends within 2 days (participants with
 *                       unfinished tasks)
 *   prayer.adzan      — a prayer time from prayer_schedules has just arrived
 *                       (in-app notification + Web Push; no audio — the adzan
 *                       sound feature was removed, it replayed off-time)
 *
 * Shared cPanel hosting has no guaranteed cron, so sweep() is called two ways:
 *   1. opportunistically from GET /api/pulse (throttled to ~1×/90s)
 *   2. from GET /api/cron/sweep for anyone who CAN add a real cron line
 * Both are idempotent — Notify::pushOnce() de-dupes per period, so running the
 * sweep a hundred times a day produces at most one notification per event.
 */
final class Reminders
{
    private const THROTTLE_SECONDS = 90;
    private const PRAYER_WINDOW_MIN = 8;   // fire if now is within N minutes past the time
    private const PIKET_WINDOW_MIN = 10;   // fire if now is within N minutes past the reminder clock-time

    private static function stampPath(): string
    {
        return dirname(__DIR__, 2) . '/storage/cache/sweep.stamp';
    }

    /** True when the last sweep was long enough ago (or the stamp is missing). */
    public static function due(): bool
    {
        $p = self::stampPath();
        if (!is_file($p)) {
            return true;
        }
        return (time() - (int) @filemtime($p)) >= self::THROTTLE_SECONDS;
    }

    private static function touchStamp(): void
    {
        $p = self::stampPath();
        @is_dir(dirname($p)) || @mkdir(dirname($p), 0775, true);
        @file_put_contents($p, (string) time());
    }

    /**
     * Run every reminder pass. Returns a small counts array for the cron route.
     * $force skips the throttle (used by the explicit cron endpoint).
     */
    public static function sweep(bool $force = false): array
    {
        $out = ['todo' => 0, 'program' => 0, 'prayer' => 0, 'piket' => 0, 'skipped' => false];
        if (!$force && !self::due()) {
            $out['skipped'] = true;
            return $out;
        }
        self::touchStamp();

        try { $out['todo']    = self::todoDeadlines(); }    catch (\Throwable $e) { error_log('[premiere][remind][todo] ' . $e->getMessage()); }
        try { $out['program'] = self::programDeadlines(); } catch (\Throwable $e) { error_log('[premiere][remind][program] ' . $e->getMessage()); }
        try { $out['prayer']  = self::prayerTimes(); }      catch (\Throwable $e) { error_log('[premiere][remind][prayer] ' . $e->getMessage()); }
        try { $out['piket']   = self::piketReminders(); }   catch (\Throwable $e) { error_log('[premiere][remind][piket] ' . $e->getMessage()); }

        return $out;
    }

    /* ---------------------------------------------------------------- todos */

    /** "1 jam", "3 hari", "30 menit" — for the reminder message body. */
    private static function fmtOffset(int $seconds): string
    {
        if ($seconds % 86400 === 0 && $seconds >= 86400) {
            $n = intdiv($seconds, 86400);
            return $n . ' hari';
        }
        if ($seconds % 3600 === 0 && $seconds >= 3600) {
            $n = intdiv($seconds, 3600);
            return $n . ' jam';
        }
        return max(1, intdiv($seconds, 60)) . ' menit';
    }

    private static function todoDeadlines(): int
    {
        if (!NotifSettings::isEnabled('todo.deadline')) {
            return 0;
        }
        $offset = NotifSettings::reminderOffsetSeconds('todo.deadline');
        $now    = time();

        // Every unfinished, assigned todo with a deadline — filtered by the
        // configured lead-time in PHP (deadline is a DATE column, treated as
        // ending 23:59:59 that day). Table is small so a full scan is cheap.
        $rows = Db::all(
            "SELECT id, title, assignee_id, deadline
               FROM todos
              WHERE status <> 'done' AND assignee_id IS NOT NULL AND deadline IS NOT NULL"
        );
        $n = 0;
        foreach ($rows as $r) {
            $deadlineEnd = strtotime((string) $r['deadline'] . ' 23:59:59');
            if ($deadlineEnd === false) {
                continue;
            }
            $secsLeft = $deadlineEnd - $now;
            if ($secsLeft > $offset) {
                continue; // still too early
            }
            $title = (string) $r['title'];
            $when  = $secsLeft <= 0 ? 'sudah lewat' : 'dalam ' . self::fmtOffset(max(60, $secsLeft)) . ' lagi';
            $sent  = Notify::pushOnce(
                'user', (int) $r['assignee_id'], 'todo.deadline',
                'tdl-' . $r['id'] . '-' . $r['deadline'],
                'Deadline todo mendekat',
                'Todo "' . mb_substr($title, 0, 120) . '" jatuh tempo ' . $when . '. Segera selesaikan.',
                '/todo',
                24 * 30 // dedup key already scopes it to this exact deadline value
            );
            if ($sent) {
                $n++;
            }
        }
        return $n;
    }

    /* ------------------------------------------------------------- programs */

    private static function programDeadlines(): int
    {
        if (!NotifSettings::isEnabled('program.deadline')) {
            return 0;
        }
        $offset = NotifSettings::reminderOffsetSeconds('program.deadline');
        $now    = time();

        $progs = Db::all(
            "SELECT id, name, end_date FROM programs WHERE status = 'active' AND end_date IS NOT NULL"
        );
        $n = 0;
        foreach ($progs as $p) {
            $deadlineEnd = strtotime((string) $p['end_date'] . ' 23:59:59');
            if ($deadlineEnd === false) {
                continue;
            }
            $secsLeft = $deadlineEnd - $now;
            if ($secsLeft > $offset) {
                continue;
            }
            $when = $secsLeft <= 0 ? 'sudah lewat' : 'dalam ' . self::fmtOffset(max(60, $secsLeft)) . ' lagi';
            $name = (string) $p['name'];

            // Participants who still have an unfinished task in this program.
            $parts = Db::all(
                "SELECT DISTINCT assignee_id
                   FROM todos
                  WHERE program_id = ? AND assignee_id IS NOT NULL AND status <> 'done'",
                [$p['id']]
            );
            foreach ($parts as $pt) {
                $sent = Notify::pushOnce(
                    'user', (int) $pt['assignee_id'], 'program.deadline',
                    'pdl-' . $p['id'] . '-' . $pt['assignee_id'] . '-' . $p['end_date'],
                    'Deadline program mendekat',
                    'Program "' . mb_substr($name, 0, 120) . '" berakhir ' . $when . '. Tugas Anda belum selesai.',
                    '/program',
                    24 * 30
                );
                if ($sent) {
                    $n++;
                }
            }
        }
        return $n;
    }

    /* -------------------------------------------------------------- prayers */

    private static function prayerTimes(): int
    {
        if (!NotifSettings::isEnabled('prayer.adzan')) {
            return 0;
        }
        $rows = Db::all(
            "SELECT owner_kind, owner_id, subuh, dzuhur, ashar, maghrib, isya
               FROM prayer_schedules
              WHERE for_date = CURDATE()"
        );
        if (!$rows) {
            return 0;
        }

        $labels = [
            'subuh'   => 'Subuh',
            'dzuhur'  => 'Dzuhur',
            'ashar'   => 'Ashar',
            'maghrib' => 'Maghrib',
            'isya'    => 'Isya',
        ];
        $now = time();
        $n   = 0;

        foreach ($rows as $r) {
            $kind = $r['owner_kind'] === 'admin' ? 'admin' : 'user';
            $oid  = (int) $r['owner_id'];
            foreach ($labels as $col => $label) {
                $t = $r[$col] ?? null;
                if (!$t) {
                    continue;
                }
                $ts = strtotime((string) $t);
                if ($ts === false) {
                    continue;
                }
                // Fire once the time has arrived, up to PRAYER_WINDOW_MIN late.
                if ($now < $ts || $now > $ts + self::PRAYER_WINDOW_MIN * 60) {
                    continue;
                }
                $sent = Notify::pushOnce(
                    $kind, $oid, 'prayer.adzan',
                    'pray-' . $kind . '-' . $oid . '-' . $col . '-' . date('Y-m-d'),
                    'Waktu ' . $label . ' telah tiba',
                    'Saatnya menunaikan salat ' . $label . ' (' . date('H:i', $ts) . '). Sempatkan sejenak untuk beribadah.',
                    '/',
                    12
                );
                if ($sent) {
                    $n++;
                }
            }
        }
        return $n;
    }

    /* --------------------------------------------------------- jadwal piket */

    private const DOW_CODES = [1 => 'mon', 2 => 'tue', 3 => 'wed', 4 => 'thu', 5 => 'fri', 6 => 'sat', 7 => 'sun'];

    private static function piketReminders(): int
    {
        $settings = Db::one("SELECT * FROM piket_settings WHERE id = 1");
        if (!$settings) {
            return 0;
        }
        $today = date('Y-m-d');
        $dow = self::DOW_CODES[(int) date('N')] ?? null;
        if (!$dow) {
            return 0;
        }
        $isFriday = $dow === 'fri';

        // Friday is "Jumat Berkah" — its own clock-time, on/off and message,
        // fired as a DISTINCT notification type so it reads differently from a
        // plain weekday piket nudge. Every other day uses the generic config.
        if ($isFriday) {
            $type    = 'piket.friday';
            $enabled = (bool) $settings['friday_enabled'];
            $timeStr = (string) $settings['friday_time'];
            $title   = 'Jumat Berkah — Bersih-bersih';
            $custom  = trim((string) ($settings['friday_message'] ?? ''));
        } else {
            $type    = 'piket.reminder';
            $enabled = (bool) $settings['enabled'];
            $timeStr = (string) $settings['reminder_time'];
            $title   = 'Jadwal Piket Hari Ini';
            $custom  = '';
        }
        if (!$enabled || !NotifSettings::isEnabled($type)) {
            return 0;
        }

        $ts = strtotime($today . ' ' . $timeStr);
        if ($ts === false) {
            return 0;
        }
        $now = time();
        // Fire once the clock-time has arrived, up to PIKET_WINDOW_MIN late —
        // same "arrived + short grace window" shape as prayerTimes() below.
        if ($now < $ts || $now > $ts + self::PIKET_WINDOW_MIN * 60) {
            return 0;
        }

        $rows = Db::all(
            "SELECT ps.user_id, ps.note
               FROM piket_schedules ps
               JOIN users u ON u.id = ps.user_id AND u.status = 'active' AND u.deleted_at IS NULL
              WHERE ps.day_of_week = ?",
            [$dow]
        );
        $n = 0;
        foreach ($rows as $r) {
            if ($isFriday) {
                $body = $custom !== ''
                    ? $custom
                    : 'Hari ini Jumat Berkah — waktunya piket bersih-bersih bersama. Semoga berkah!';
                if (!empty($r['note'])) {
                    $body .= ' (' . mb_substr((string) $r['note'], 0, 120) . ')';
                }
            } else {
                $body = 'Anda mendapat jadwal piket hari ini';
                $body .= !empty($r['note']) ? ': ' . mb_substr((string) $r['note'], 0, 150) : '.';
            }
            $sent = Notify::pushOnce(
                'user', (int) $r['user_id'], $type,
                'piket-' . $r['user_id'] . '-' . $today,  // one reminder per user per day, whichever type
                $title,
                $body,
                '/jadwal-piket',
                20
            );
            if ($sent) {
                $n++;
            }
        }
        return $n;
    }
}
