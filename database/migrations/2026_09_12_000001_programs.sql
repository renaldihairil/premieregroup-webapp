-- ============================================================
--  Program — program kerja yang dibuat Admin. Admin memilih
--  karyawan yang bertugas + menuliskan tugas masing-masing;
--  tiap tugas otomatis menjadi satu todo di Todo List karyawan
--  itu (todos.program_id menandai asal todo-nya). Progress
--  program dihitung dari status todo-todo tersebut.
--  Single-clause statements so the auto-migrator can skip the
--  ones already applied (or already present on a fresh install).
-- ============================================================

CREATE TABLE IF NOT EXISTS `programs` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`                VARCHAR(160)    NOT NULL,
  `description`         TEXT            NULL DEFAULT NULL,
  `start_date`          DATE            NOT NULL,
  `end_date`            DATE            NOT NULL,
  `cover_path`          VARCHAR(255)    NULL DEFAULT NULL,
  `status`              ENUM('active','archived') NOT NULL DEFAULT 'active',
  `created_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_programs_status` (`status`),
  KEY `ix_programs_dates` (`start_date`, `end_date`),
  CONSTRAINT `fk_programs_admin` FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `todos` ADD COLUMN `program_id` BIGINT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE `todos` ADD KEY `ix_todos_program` (`program_id`);

ALTER TABLE `todos` ADD CONSTRAINT `fk_todos_program` FOREIGN KEY (`program_id`) REFERENCES `programs` (`id`) ON DELETE CASCADE ON UPDATE CASCADE;
