-- In-app notification feed. Polymorphic recipient (a users.id OR an admins.id,
-- distinguished by recipient_kind). No FK on recipient_id for that reason; a
-- lightweight time-based cleanup runs opportunistically on the API side.
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_kind` ENUM('user','admin') NOT NULL,
  `recipient_id`   BIGINT UNSIGNED NOT NULL,
  `type`           VARCHAR(40)     NOT NULL,
  `title`          VARCHAR(160)    NOT NULL,
  `body`           VARCHAR(500)    NOT NULL DEFAULT '',
  `link`           VARCHAR(120)    NULL DEFAULT NULL,
  `actor_user_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `read_at`        DATETIME        NULL DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notif_recipient` (`recipient_kind`, `recipient_id`, `read_at`),
  KEY `ix_notif_created` (`created_at`),
  CONSTRAINT `fk_notif_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
