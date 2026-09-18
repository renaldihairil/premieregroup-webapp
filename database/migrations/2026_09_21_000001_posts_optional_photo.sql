-- "Momen Kerja" posts may now be text-only (like a tweet/thread) — a photo is
-- no longer mandatory, so photo_path must accept NULL. POST /posts still
-- requires at least a photo OR a non-empty caption (enforced in PHP).
ALTER TABLE `posts` MODIFY COLUMN `photo_path` VARCHAR(255) NULL DEFAULT NULL;
