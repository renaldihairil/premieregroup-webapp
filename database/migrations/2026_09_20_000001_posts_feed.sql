-- "Momen Kerja" feed: shared photo feed between the Admin Panel and the
-- User App. One square photo + optional caption per post, polymorphic owner
-- (user or admin), auto-expires 24h after posting (api/lib/Posts.php sweep).
CREATE TABLE IF NOT EXISTS `posts` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_kind`  ENUM('user','admin') NOT NULL,
  `owner_id`    BIGINT UNSIGNED NOT NULL,
  `photo_path`  VARCHAR(255)    NOT NULL,
  `caption`     VARCHAR(500)    NULL DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`  DATETIME        NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_posts_owner` (`owner_kind`, `owner_id`),
  KEY `ix_posts_expires` (`expires_at`),
  KEY `ix_posts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `post_likes` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`      BIGINT UNSIGNED NOT NULL,
  `liker_kind`   ENUM('user','admin') NOT NULL,
  `liker_id`     BIGINT UNSIGNED NOT NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_post_like` (`post_id`, `liker_kind`, `liker_id`),
  KEY `ix_post_likes_post` (`post_id`),
  CONSTRAINT `fk_post_likes_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `post_comments` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`         BIGINT UNSIGNED NOT NULL,
  `commenter_kind`  ENUM('user','admin') NOT NULL,
  `commenter_id`    BIGINT UNSIGNED NOT NULL,
  `comment_text`    VARCHAR(500)    NOT NULL,
  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_post_comments_post` (`post_id`),
  CONSTRAINT `fk_post_comments_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
