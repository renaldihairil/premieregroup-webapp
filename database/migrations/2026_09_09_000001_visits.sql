-- ============================================================
--  Laporan Kunjungan (Visit Reports).
--  Karyawan mencatat agenda kunjungan ke sebuah toko, tanggal,
--  catatan, dan lampiran pendukung (foto / video). Admin meninjau.
--  Single-clause statements so the auto-migrator can skip the ones
--  already applied (or already present on a fresh db.sql install).
-- ============================================================

CREATE TABLE IF NOT EXISTS `visits` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`              BIGINT UNSIGNED NOT NULL,
  `store_id`             BIGINT UNSIGNED NULL DEFAULT NULL,
  `store_name`           VARCHAR(120)    NOT NULL DEFAULT '',
  `agenda`               VARCHAR(200)    NOT NULL,
  `visit_date`           DATE            NOT NULL,
  `note`                 TEXT            NULL DEFAULT NULL,
  `status`               ENUM('submitted','reviewed') NOT NULL DEFAULT 'submitted',
  `reviewed_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at`          DATETIME        NULL DEFAULT NULL,
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_visits_user` (`user_id`),
  KEY `ix_visits_store` (`store_id`),
  KEY `ix_visits_date` (`visit_date`),
  KEY `ix_visits_status` (`status`),
  CONSTRAINT `fk_visits_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_visits_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_visits_admin` FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `visit_attachments` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_id`      BIGINT UNSIGNED NOT NULL,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `kind`          ENUM('image','video','file') NOT NULL DEFAULT 'image',
  `file_path`     VARCHAR(255)  NOT NULL,
  `original_name` VARCHAR(255)  NULL DEFAULT NULL,
  `mime`          VARCHAR(120)  NULL DEFAULT NULL,
  `size_bytes`    INT UNSIGNED  NULL DEFAULT NULL,
  `created_at`    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_va_visit` (`visit_id`),
  KEY `ix_va_user` (`user_id`),
  CONSTRAINT `fk_va_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_va_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
