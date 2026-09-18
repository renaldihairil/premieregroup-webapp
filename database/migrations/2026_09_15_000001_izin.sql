-- Izin (permission / leave) — one selfie + a text reason per employee per day.
-- Submit-only: it becomes a record in the Admin Panel's "Laporan Izin"; no
-- approval workflow. UNIQUE(user_id, izin_date) = one izin per user per day.
CREATE TABLE IF NOT EXISTS `izin` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`    BIGINT UNSIGNED NOT NULL,
  `izin_date`  DATE            NOT NULL,
  `reason`     VARCHAR(1000)   NOT NULL,
  `photo`      VARCHAR(255)    NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_izin_user_date` (`user_id`, `izin_date`),
  KEY `ix_izin_date` (`izin_date`),
  CONSTRAINT `fk_izin_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
