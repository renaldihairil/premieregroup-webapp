-- Feature access — Admin decides, per division (with per-employee exceptions),
-- which optional User App sections show up for whom (Todo List, Lapor KPI,
-- Program, Job Desk, Kunjungan). Dashboard/Absensi/Momen/Profil always show —
-- they're core to every account, not part of this toggle.
-- A missing row = default ON (matches the notification_settings convention:
-- no row needed for a fresh install, new feature keys just work).
CREATE TABLE IF NOT EXISTS `division_features` (
  `division_id` BIGINT UNSIGNED NOT NULL,
  `feature_key` VARCHAR(40)     NOT NULL,
  `enabled`     TINYINT(1)      NOT NULL DEFAULT 1,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`division_id`, `feature_key`),
  CONSTRAINT `fk_df_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_features` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `feature_key` VARCHAR(40)     NOT NULL,
  `enabled`     TINYINT(1)      NOT NULL DEFAULT 1,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_id`, `feature_key`),
  CONSTRAINT `fk_uf_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
