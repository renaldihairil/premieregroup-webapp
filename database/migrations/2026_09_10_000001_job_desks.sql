-- ============================================================
--  Job Desk — uraian tugas yang ditulis Admin untuk setiap
--  divisi atau jabatan. Karyawan hanya melihat (read-only) job
--  desk yang cocok dengan divisi / jabatannya di menu Job Desk.
--  Single-clause statements so the auto-migrator can skip the
--  ones already applied (or already present on a fresh install).
-- ============================================================

CREATE TABLE IF NOT EXISTS `job_desks` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope_type`          ENUM('division','position') NOT NULL,
  `division_id`         BIGINT UNSIGNED NULL DEFAULT NULL,
  `position_id`         BIGINT UNSIGNED NULL DEFAULT NULL,
  `title`               VARCHAR(200)    NOT NULL,
  `content`             MEDIUMTEXT      NOT NULL,
  `status`              ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `updated_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_jd_division` (`division_id`),
  KEY `ix_jd_position` (`position_id`),
  KEY `ix_jd_status` (`status`),
  CONSTRAINT `fk_jd_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jd_position` FOREIGN KEY (`position_id`) REFERENCES `positions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_jd_admin`    FOREIGN KEY (`updated_by_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
