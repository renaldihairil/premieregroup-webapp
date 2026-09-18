-- ============================================================
--  Migration 2026_09_03_000001_todo_attachments
--  Adds `todo_attachments` — supporting files (photos / documents /
--  links) for a todo work report, uploaded by the assignee.
--
--  Run this ONCE in phpMyAdmin (database `premiere_group` -> SQL tab)
--  if you imported db.sql BEFORE this migration existed. A fresh
--  import of db.sql already includes the table — skip it then.
-- ============================================================

CREATE TABLE IF NOT EXISTS `todo_attachments` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `todo_id`       BIGINT UNSIGNED NOT NULL,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `kind`          ENUM('image','file','link') NOT NULL,
  `file_path`     VARCHAR(255)  NULL DEFAULT NULL,
  `original_name` VARCHAR(255)  NULL DEFAULT NULL,
  `mime`          VARCHAR(120)  NULL DEFAULT NULL,
  `size_bytes`    INT UNSIGNED  NULL DEFAULT NULL,
  `url`           VARCHAR(1000) NULL DEFAULT NULL,
  `label`         VARCHAR(255)  NULL DEFAULT NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_ta_todo` (`todo_id`),
  KEY `ix_ta_user` (`user_id`),
  KEY `ix_ta_kind` (`kind`),
  CONSTRAINT `fk_ta_todo` FOREIGN KEY (`todo_id`) REFERENCES `todos` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_ta_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `schema_migrations` (`version`) VALUES ('2026_09_03_000001_todo_attachments')
  ON DUPLICATE KEY UPDATE `version` = `version`;
