-- (a) de-dup key so time-based reminders fire at most once per period.
ALTER TABLE `notifications` ADD COLUMN `dedup_key` VARCHAR(80) NULL DEFAULT NULL AFTER `link`;
ALTER TABLE `notifications` ADD KEY `ix_notif_dedup` (`recipient_kind`, `recipient_id`, `dedup_key`);

-- (b) per-principal prayer schedule (client posts today's 5 times; the server
--     sweep turns each into an in-app + push notification when it arrives, so
--     the adzan reminder works even when the app is closed).
CREATE TABLE IF NOT EXISTS `prayer_schedules` (
  `owner_kind`  ENUM('user','admin') NOT NULL,
  `owner_id`    BIGINT UNSIGNED NOT NULL,
  `for_date`    DATE            NOT NULL,
  `subuh`       DATETIME        NULL DEFAULT NULL,
  `dzuhur`      DATETIME        NULL DEFAULT NULL,
  `ashar`       DATETIME        NULL DEFAULT NULL,
  `maghrib`     DATETIME        NULL DEFAULT NULL,
  `isya`        DATETIME        NULL DEFAULT NULL,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`owner_kind`, `owner_id`),
  KEY `ix_prayer_date` (`for_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
