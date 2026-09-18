-- "Momen Kerja" — a post may now carry a short VERTICAL video (9:16, ≤60s)
-- instead of a photo. Still exactly one medium per post (photo XOR video XOR
-- text-only), still auto-expires 24h (Posts::sweepExpired also unlinks the
-- video file). Separate ALTERs so a partial re-run stays idempotent.
ALTER TABLE `posts` ADD COLUMN `video_path` VARCHAR(255) NULL DEFAULT NULL;
ALTER TABLE `posts` ADD COLUMN `video_mime` VARCHAR(60)  NULL DEFAULT NULL;
