-- Jadwal Piket — a WEEKLY RECURRING duty roster keyed by DAY-OF-WEEK (not a
-- calendar date): admin assigns which employees are on duty each weekday;
-- the same assignment repeats every week until admin changes it. A reminder
-- notification fires once per scheduled day at an admin-configured clock time.
CREATE TABLE IF NOT EXISTS `piket_schedules` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `day_of_week`  ENUM('mon','tue','wed','thu','fri','sat','sun') NOT NULL,
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `note`         VARCHAR(255)    NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_piket_day_user` (`day_of_week`, `user_id`),
  KEY `ix_piket_user` (`user_id`),
  CONSTRAINT `fk_piket_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Singleton settings row: what time of day to fire the "Anda piket hari ini"
-- reminder, and a master on/off (separate from the generic per-type toggle in
-- Pengaturan -> Notifikasi, same split already used by Waktu Sholat).
CREATE TABLE IF NOT EXISTS `piket_settings` (
  `id`             TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `reminder_time`  TIME            NOT NULL DEFAULT '07:00:00',
  `enabled`        TINYINT(1)      NOT NULL DEFAULT 1,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `piket_settings` (`id`, `reminder_time`, `enabled`) VALUES (1, '07:00:00', 1)
  ON DUPLICATE KEY UPDATE id = id;
