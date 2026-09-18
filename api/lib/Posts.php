<?php
declare(strict_types=1);

/**
 * "Momen Kerja" feed housekeeping. Posts are meant to live for exactly 24
 * hours (like a story) — sweepExpired() hard-deletes anything past its
 * expires_at, file included. Called opportunistically from GET /api/pulse
 * (throttled, shared with Reminders::sweep) and from GET /api/cron/sweep.
 */
final class Posts
{
    /** Delete every expired post (row + photo file; likes/comments cascade). */
    public static function sweepExpired(): int
    {
        $rows = [];
        try {
            $rows = Db::all("SELECT id, photo_path, video_path FROM posts WHERE expires_at <= NOW()");
        } catch (\Throwable $e) {
            error_log('[premiere][posts] sweep select: ' . $e->getMessage());
            return 0;
        }
        $n = 0;
        foreach ($rows as $r) {
            try {
                Db::run("DELETE FROM posts WHERE id = ?", [$r['id']]);
                Storage::remove($r['photo_path'] ?? null);
                Storage::remove($r['video_path'] ?? null);
                $n++;
            } catch (\Throwable $e) {
                error_log('[premiere][posts] sweep delete #' . $r['id'] . ': ' . $e->getMessage());
            }
        }
        return $n;
    }
}
