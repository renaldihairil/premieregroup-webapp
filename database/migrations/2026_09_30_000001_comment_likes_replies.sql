-- "Momen Kerja" comments gain: (1) likes per comment, (2) threaded replies.
-- post_comment_likes mirrors post_likes; parent_comment_id turns a flat
-- comment list into one-level threads (a reply points at the comment it
-- answers). No FK on parent_comment_id (self-ref FK is fragile on shared
-- MariaDB); reply cleanup is done in PHP (pg_delete_comment_subtree), and a
-- whole post's comments already cascade from fk_post_comments_post.
CREATE TABLE IF NOT EXISTS `post_comment_likes` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `comment_id` BIGINT UNSIGNED NOT NULL,
  `liker_kind` ENUM('user','admin') NOT NULL,
  `liker_id`   BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pcl` (`comment_id`, `liker_kind`, `liker_id`),
  KEY `ix_pcl_comment` (`comment_id`),
  CONSTRAINT `fk_pcl_comment` FOREIGN KEY (`comment_id`) REFERENCES `post_comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `post_comments` ADD COLUMN `parent_comment_id` BIGINT UNSIGNED NULL DEFAULT NULL;
ALTER TABLE `post_comments` ADD KEY `ix_pc_parent` (`parent_comment_id`);
