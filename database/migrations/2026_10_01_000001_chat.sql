-- Private 1-to-1 chat ("Chat" — opened from the Momen page header).
-- A thread links two principals (each a user OR an admin). The pair is stored
-- canonically: side "a" is always the principal whose (kind,id) sorts first
-- ('admin' before 'user', then numeric id), so uq_pair blocks a duplicate
-- thread no matter who starts it. Each side keeps its own last_read_at, which
-- drives that side's unread count. last_message_* is a denormalised preview so
-- the thread list renders without touching chat_messages.
CREATE TABLE IF NOT EXISTS `chat_threads` (
  `id`                       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `a_kind`                   ENUM('user','admin') NOT NULL,
  `a_id`                     BIGINT UNSIGNED NOT NULL,
  `b_kind`                   ENUM('user','admin') NOT NULL,
  `b_id`                     BIGINT UNSIGNED NOT NULL,
  `a_last_read_at`           DATETIME NULL DEFAULT NULL,
  `b_last_read_at`           DATETIME NULL DEFAULT NULL,
  `last_message_at`          DATETIME NULL DEFAULT NULL,
  `last_message_preview`     VARCHAR(180) NOT NULL DEFAULT '',
  `last_message_sender_kind` ENUM('user','admin') NULL DEFAULT NULL,
  `last_message_sender_id`   BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_chat_pair` (`a_kind`, `a_id`, `b_kind`, `b_id`),
  KEY `ix_chat_a` (`a_kind`, `a_id`, `last_message_at`),
  KEY `ix_chat_b` (`b_kind`, `b_id`, `last_message_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `chat_messages` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `thread_id`   BIGINT UNSIGNED NOT NULL,
  `sender_kind` ENUM('user','admin') NOT NULL,
  `sender_id`   BIGINT UNSIGNED NOT NULL,
  `body`        TEXT NOT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_cm_thread` (`thread_id`, `id`),
  CONSTRAINT `fk_cm_thread` FOREIGN KEY (`thread_id`) REFERENCES `chat_threads` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
