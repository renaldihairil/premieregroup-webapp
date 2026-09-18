-- ============================================================
--  PREMIERE GROUP — DATABASE (db.sql)
--  ------------------------------------------------------------
--  THE ONE FILE YOU IMPORT INTO phpMyAdmin.
--
--  Target       : MySQL 5.7+ / MariaDB 10.3+  (shared hosting / cPanel)
--  Charset      : utf8mb4 / utf8mb4_unicode_ci
--  Engine       : InnoDB (foreign keys)
--  Timezone     : app runs in Asia/Makassar (WITA, UTC+8). DATETIME columns
--                 hold WITA local time, always written by the server.
--
--  IMPORT STEPS (your workflow):
--    1. cPanel -> MySQL Databases -> create an empty database + a DB user,
--       attach the user to the database (privileges: SELECT, INSERT, UPDATE,
--       DELETE, CREATE, ALTER, INDEX, REFERENCES).
--    2. cPanel -> phpMyAdmin -> select that database -> "Import" tab ->
--       choose this file (database/db.sql) -> Go.
--    3. Put your cPanel DB name / user / password into the app config
--       (.env — see .env.example and docs/DEPLOYMENT.md). Nothing in this
--       file needs to be edited for that.
--    4. Set the admin password (see the ADMIN ACCOUNT section at the bottom).
--
--  Safe to re-run: every CREATE uses IF NOT EXISTS and every seed INSERT
--  uses ON DUPLICATE KEY UPDATE, so importing twice will not error or wipe data.
--
--  This file contains ONLY the tables the app actually uses today
--  (audit: docs/DATABASE-AUDIT.md). Tables for not-yet-built features
--  (notifications, todo_assignments) are added
--  later as migration files — proposed DDL: docs/PRODUCTION-ARCHITECTURE.md.
--
--  Do NOT import database/seed_dev.sql on a live site — that is local-dev
--  test data only.
-- ============================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
SET time_zone = "+08:00";

-- ------------------------------------------------------------
--  schema_migrations — tracks which migration files were applied
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `schema_migrations` (
  `version`     VARCHAR(50)  NOT NULL,
  `applied_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`version`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  admins — Admin Panel accounts (password login)
--  Password: bcrypt via PHP password_hash(). NEVER plain text,
--  NEVER committed. See docs/DEPLOYMENT.md to set it.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `admins` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`           VARCHAR(120)    NOT NULL,
  `username`       VARCHAR(60)     NOT NULL,
  `email`          VARCHAR(190)    NULL DEFAULT NULL,
  `password_hash`  VARCHAR(255)    NOT NULL,
  `role`           ENUM('super_admin','admin','manager') NOT NULL DEFAULT 'super_admin',
  `status`         ENUM('active','inactive')             NOT NULL DEFAULT 'active',
  `last_login_at`  DATETIME        NULL DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_admins_username` (`username`),
  UNIQUE KEY `uq_admins_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  divisions — Divisi
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `divisions` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(120)    NOT NULL,
  `description` VARCHAR(255)    NULL DEFAULT NULL,
  `status`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_divisions_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  positions — Jabatan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `positions` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(120)    NOT NULL,
  `status`     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_positions_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  branches — Cabang (kept for forward-compat; NOT used in the UI today)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `branches` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`       VARCHAR(120)    NOT NULL,
  `status`     ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_branches_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  stores — Toko yang dikelola perusahaan. Laporan KPI dibuat
--  per toko (kpi_reports.store_id). Admin only (org.manage).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `stores` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`        VARCHAR(120)    NOT NULL,
  `description` VARCHAR(255)    NULL DEFAULT NULL,
  `status`      ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_stores_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  users — Karyawan (User App, username login)
--  Soft-delete via deleted_at so historical attendance/overtime
--  records keep a valid FK. The API must soft-delete, not hard-delete.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username`     VARCHAR(60)     NOT NULL,
  `full_name`    VARCHAR(150)    NOT NULL,
  `division_id`  BIGINT UNSIGNED NOT NULL,
  `position_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `branch_id`    BIGINT UNSIGNED NULL DEFAULT NULL,
  `role`         ENUM('kepala_divisi','supervisor','staff') NOT NULL DEFAULT 'staff',
  `status`       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `photo_path`   VARCHAR(255)    NULL DEFAULT NULL,
  `deleted_at`   DATETIME        NULL DEFAULT NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_username` (`username`),
  KEY `ix_users_division` (`division_id`),
  KEY `ix_users_position` (`position_id`),
  KEY `ix_users_status` (`status`),
  CONSTRAINT `fk_users_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_users_position` FOREIGN KEY (`position_id`) REFERENCES `positions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_users_branch`   FOREIGN KEY (`branch_id`)   REFERENCES `branches`  (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  user_divisions — seorang karyawan bisa berada di beberapa divisi.
--  users.division_id = divisi UTAMA (pertama dipilih); tabel ini
--  menyimpan SEMUA divisi karyawan tsb.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `user_divisions` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `division_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `division_id`),
  KEY `ix_ud_division` (`division_id`),
  CONSTRAINT `fk_ud_user`     FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_ud_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  attendance_settings — singleton (always id = 1)
--  work_days is a MySQL SET: e.g. 'mon,tue,wed,thu,fri,sat'
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendance_settings` (
  `id`                 TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `check_in`           TIME NOT NULL DEFAULT '08:00:00',
  `check_out`          TIME NOT NULL DEFAULT '21:00:00',
  `late_tolerance_min` SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  `overtime_start`     TIME NOT NULL DEFAULT '17:00:00',
  `overtime_end`       TIME NOT NULL DEFAULT '23:59:00',
  `work_days`          SET('sun','mon','tue','wed','thu','fri','sat') NOT NULL DEFAULT 'mon,tue,wed,thu,fri,sat',
  `updated_at`         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `ck_attendance_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  holidays — Hari Libur (was attendanceSettings.holidays[])
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `holidays` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `holiday_date` DATE            NOT NULL,
  `label`        VARCHAR(150)    NOT NULL DEFAULT 'Hari Libur',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_holidays_date` (`holiday_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  attendances — one row per user per calendar day
--  UNIQUE (user_id, attendance_date) IS a real business rule
--  (store.attendanceToday dedup), not an assumption.
--  Photos: relative path to a file in storage, NOT base64.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `attendances` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`          BIGINT UNSIGNED NOT NULL,
  `attendance_date`  DATE            NOT NULL,
  `check_in_at`      DATETIME        NULL DEFAULT NULL,
  `check_in_photo`   VARCHAR(255)    NULL DEFAULT NULL,
  `check_out_at`     DATETIME        NULL DEFAULT NULL,
  `check_out_photo`  VARCHAR(255)    NULL DEFAULT NULL,
  `check_in_status`  ENUM('hadir','terlambat') NULL DEFAULT NULL,
  `late_minutes`     SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `created_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_attendance_user_date` (`user_id`, `attendance_date`),
  KEY `ix_attendance_date` (`attendance_date`),
  CONSTRAINT `fk_attendance_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  overtimes — Lembur. Separate entity from attendances.
--  UNIQUE (user_id, overtime_date) — 1 overtime per user per day
--  (store.overtimeToday dedup). duration_ms is RECOMPUTED by the
--  server from end_at - start_at; never trusted from the client.
--  status:  berjalan | menunggu | disetujui | ditolak | kadaluarsa
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `overtimes` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`             BIGINT UNSIGNED NOT NULL,
  `attendance_id`       BIGINT UNSIGNED NULL DEFAULT NULL,
  `overtime_date`       DATE            NOT NULL,
  `description`         VARCHAR(1000)   NOT NULL,
  `start_at`            DATETIME        NOT NULL,
  `start_photo`         VARCHAR(255)    NOT NULL,
  `end_at`              DATETIME        NULL DEFAULT NULL,
  `end_photo`           VARCHAR(255)    NULL DEFAULT NULL,
  `duration_ms`         BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `status`              ENUM('berjalan','menunggu','disetujui','ditolak','kadaluarsa') NOT NULL DEFAULT 'berjalan',
  `rejection_reason`    VARCHAR(500)    NULL DEFAULT NULL,
  `approved_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `approved_at`         DATETIME        NULL DEFAULT NULL,
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_overtime_user_date` (`user_id`, `overtime_date`),
  KEY `ix_overtime_date` (`overtime_date`),
  KEY `ix_overtime_status` (`status`),
  KEY `ix_overtime_user_status` (`user_id`, `status`),
  CONSTRAINT `fk_overtime_user`       FOREIGN KEY (`user_id`)              REFERENCES `users`       (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_attendance` FOREIGN KEY (`attendance_id`)        REFERENCES `attendances` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_overtime_admin`      FOREIGN KEY (`approved_by_admin_id`) REFERENCES `admins`      (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  izin — permission / leave. One selfie + a text reason per user
--  per day (UNIQUE user_id, izin_date). Submit-only, no approval;
--  shows up in the Admin Panel's "Laporan Izin".
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  notifications — in-app notification feed. Polymorphic recipient
--  (users.id OR admins.id via recipient_kind). Time-based cleanup
--  runs opportunistically from the API.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notifications` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `recipient_kind` ENUM('user','admin') NOT NULL,
  `recipient_id`   BIGINT UNSIGNED NOT NULL,
  `type`           VARCHAR(40)     NOT NULL,
  `title`          VARCHAR(160)    NOT NULL,
  `body`           VARCHAR(500)    NOT NULL DEFAULT '',
  `link`           VARCHAR(120)    NULL DEFAULT NULL,
  `dedup_key`      VARCHAR(80)     NULL DEFAULT NULL,
  `actor_user_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `read_at`        DATETIME        NULL DEFAULT NULL,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notif_recipient` (`recipient_kind`, `recipient_id`, `read_at`),
  KEY `ix_notif_created` (`created_at`),
  KEY `ix_notif_dedup` (`recipient_kind`, `recipient_id`, `dedup_key`),
  CONSTRAINT `fk_notif_actor` FOREIGN KEY (`actor_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  prayer_schedules — client posts today's 5 prayer times; the
--  server sweep turns each into a notification when it arrives.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  push_subscriptions — Web Push (RFC 8291) device subscriptions.
--  Polymorphic owner. Dead endpoints (404/410) are pruned on send.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_kind`  ENUM('user','admin') NOT NULL,
  `owner_id`    BIGINT UNSIGNED NOT NULL,
  `endpoint`    VARCHAR(500)    NOT NULL,
  `p256dh`      VARCHAR(160)    NOT NULL,
  `auth`        VARCHAR(64)     NOT NULL,
  `ua`          VARCHAR(200)    NULL DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_ok_at`  DATETIME        NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_owner_endpoint` (`owner_kind`, `owner_id`, `endpoint`(191)),
  KEY `ix_endpoint` (`endpoint`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  programs — program kerja (Admin). Setiap tugas dalam program
--  menjadi satu todo (todos.program_id). Cover 1:1 opsional.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  todos — single-assignee model (matches current app).
--  If Todo ever needs many assignees, add todo_assignments
--  (DDL in docs/PRODUCTION-ARCHITECTURE.md) — do NOT store
--  "Renaldi, Aldi, Rika" as a string.
--  program_id: set when the todo was spawned from a Program.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `todos` (
  `id`                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`               VARCHAR(200)    NOT NULL,
  `description`         TEXT            NULL,
  `user_note`           TEXT            NULL DEFAULT NULL,
  `division_id`         BIGINT UNSIGNED NULL DEFAULT NULL,
  `assignee_id`         BIGINT UNSIGNED NULL DEFAULT NULL,
  `program_id`          BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_by_user_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `priority`            ENUM('high','mid','low')            NOT NULL DEFAULT 'mid',
  `status`              ENUM('todo','in_progress','done')   NOT NULL DEFAULT 'todo',
  `progress`            TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `deadline`            DATE            NULL DEFAULT NULL,
  `completed_at`        DATETIME        NULL DEFAULT NULL,
  `created_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_todos_assignee` (`assignee_id`),
  KEY `ix_todos_division` (`division_id`),
  KEY `ix_todos_status` (`status`),
  KEY `ix_todos_completed_at` (`completed_at`),
  KEY `ix_todos_creator_user` (`created_by_user_id`),
  KEY `ix_todos_program` (`program_id`),
  CONSTRAINT `fk_todos_division`      FOREIGN KEY (`division_id`)         REFERENCES `divisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_todos_assignee`      FOREIGN KEY (`assignee_id`)         REFERENCES `users`     (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_todos_program`       FOREIGN KEY (`program_id`)          REFERENCES `programs`  (`id`) ON DELETE CASCADE   ON UPDATE CASCADE,
  CONSTRAINT `fk_todos_admin`         FOREIGN KEY (`created_by_admin_id`) REFERENCES `admins`    (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_todos_creator_user`  FOREIGN KEY (`created_by_user_id`)  REFERENCES `users`     (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  todo_attachments — supporting files for a todo work report
--  (photos, PDFs/documents, or links) uploaded by the assignee.
--  Files live on disk (storage/uploads/todo/YYYY/MM/); the DB keeps
--  only the relative path. Deleting a todo removes its attachments.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  KPI — admin builds a template (form) per division; employees
--  fill it in each period; admin reads every submission.
--    kpi_templates       one KPI form per division
--    kpi_template_items  indicators + sub-indicators (parent_id)
--    kpi_reports         one submission per user/template/period
--    kpi_report_values   the filled-in actuals, per leaf item
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `kpi_templates` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`         VARCHAR(200)    NOT NULL,
  `division_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `period_type`  ENUM('weekly','monthly') NOT NULL DEFAULT 'monthly',
  `score_method` ENUM('percent_avg','weighted_sum') NOT NULL DEFAULT 'percent_avg',
  `description`  TEXT            NULL,
  `status`       ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_kpi_templates_division` (`division_id`),
  CONSTRAINT `fk_kpi_templates_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kpi_template_items` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `template_id` BIGINT UNSIGNED NOT NULL,
  `parent_id`   BIGINT UNSIGNED NULL DEFAULT NULL,
  `label`       VARCHAR(200)    NOT NULL,
  `target`      DECIMAL(16,2)   NOT NULL DEFAULT 0,
  `value_type`  ENUM('number','money') NOT NULL DEFAULT 'number',
  `is_optional` TINYINT(1)      NOT NULL DEFAULT 0,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_kti_template` (`template_id`),
  KEY `ix_kti_parent` (`parent_id`),
  CONSTRAINT `fk_kti_template` FOREIGN KEY (`template_id`) REFERENCES `kpi_templates` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_kti_parent`   FOREIGN KEY (`parent_id`)   REFERENCES `kpi_template_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kpi_reports` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `template_id`          BIGINT UNSIGNED NOT NULL,
  `user_id`              BIGINT UNSIGNED NOT NULL,
  `store_id`             BIGINT UNSIGNED NULL DEFAULT NULL,
  `period_key`           VARCHAR(20)     NOT NULL DEFAULT '',
  `period_label`         VARCHAR(160)    NOT NULL DEFAULT '',
  `week_no`              TINYINT UNSIGNED NULL DEFAULT NULL,
  `period_start`         DATE            NULL DEFAULT NULL,
  `period_end`           DATE            NULL DEFAULT NULL,
  `subject`              VARCHAR(200)    NOT NULL DEFAULT '',
  `status`               ENUM('draft','submitted','reviewed') NOT NULL DEFAULT 'draft',
  `total_pct`            DECIMAL(6,2)    NOT NULL DEFAULT 0,
  `total_actual`         DECIMAL(18,2)   NOT NULL DEFAULT 0,
  `total_target`         DECIMAL(18,2)   NOT NULL DEFAULT 0,
  `note`                 TEXT            NULL,
  `submitted_at`         DATETIME        NULL DEFAULT NULL,
  `reviewed_by_admin_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `reviewed_at`          DATETIME        NULL DEFAULT NULL,
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_kr_user` (`user_id`),
  KEY `ix_kr_template` (`template_id`),
  KEY `ix_kr_status` (`status`),
  KEY `ix_kr_store` (`store_id`),
  CONSTRAINT `fk_kr_template` FOREIGN KEY (`template_id`) REFERENCES `kpi_templates` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kr_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kr_store`    FOREIGN KEY (`store_id`)    REFERENCES `stores` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_kr_admin`    FOREIGN KEY (`reviewed_by_admin_id`) REFERENCES `admins` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `kpi_report_values` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `report_id` BIGINT UNSIGNED NOT NULL,
  `item_id`   BIGINT UNSIGNED NOT NULL,
  `actual`    DECIMAL(16,2)   NOT NULL DEFAULT 0,
  `note`      VARCHAR(500)    NOT NULL DEFAULT '',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_krv` (`report_id`, `item_id`),
  KEY `ix_krv_report` (`report_id`),
  CONSTRAINT `fk_krv_report` FOREIGN KEY (`report_id`) REFERENCES `kpi_reports` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_krv_item`   FOREIGN KEY (`item_id`)   REFERENCES `kpi_template_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  visits — Laporan Kunjungan lapangan. Karyawan mencatat agenda
--  kunjungan ke sebuah toko (dari `stores`), tanggal, catatan, dan
--  checklist kegiatan (per divisi, diatur Admin) dengan foto buktinya.
--  Admin meninjau di panel.
--    visits                    satu laporan per kunjungan
--    visit_attachments         foto pendukung (kind selalu 'image';
--                              enum menyimpan video/file untuk kompatibilitas);
--                              checklist_item_id opsional -- foto bukti utk 1 item checklist
--    visit_checklist_items     daftar item checklist per divisi (diatur Admin)
--    visit_checklist_answers   item mana yg dicentang pada 1 laporan kunjungan
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `visits` (
  `id`                   BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`              BIGINT UNSIGNED NOT NULL,
  `store_id`             BIGINT UNSIGNED NULL DEFAULT NULL,
  `store_name`           VARCHAR(120)    NOT NULL DEFAULT '',
  `agenda`               VARCHAR(200)    NOT NULL,
  `visit_date`           DATE            NOT NULL,
  `note`                 TEXT            NULL DEFAULT NULL,
  `status`               ENUM('draft','submitted','reviewed') NOT NULL DEFAULT 'submitted',
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
  `id`                BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_id`          BIGINT UNSIGNED NOT NULL,
  `checklist_item_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `user_id`           BIGINT UNSIGNED NOT NULL,
  `kind`              ENUM('image','video','file') NOT NULL DEFAULT 'image',
  `file_path`         VARCHAR(255)  NOT NULL,
  `original_name`     VARCHAR(255)  NULL DEFAULT NULL,
  `mime`              VARCHAR(120)  NULL DEFAULT NULL,
  `size_bytes`        INT UNSIGNED  NULL DEFAULT NULL,
  `created_at`        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_va_visit` (`visit_id`),
  KEY `ix_va_user` (`user_id`),
  KEY `ix_va_checklist_item` (`checklist_item_id`),
  CONSTRAINT `fk_va_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_va_user`  FOREIGN KEY (`user_id`)  REFERENCES `users`  (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_va_checklist_item` FOREIGN KEY (`checklist_item_id`) REFERENCES `visit_checklist_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `visit_checklist_items` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `division_id` BIGINT UNSIGNED NOT NULL,
  `label`       VARCHAR(200)    NOT NULL,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_vci_division` (`division_id`),
  CONSTRAINT `fk_vci_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `visit_checklist_answers` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_id`   BIGINT UNSIGNED NOT NULL,
  `item_id`    BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vca_visit_item` (`visit_id`, `item_id`),
  KEY `ix_vca_item` (`item_id`),
  CONSTRAINT `fk_vca_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_vca_item`  FOREIGN KEY (`item_id`)  REFERENCES `visit_checklist_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  Feature access — Admin decides, per division (+ per-employee exceptions),
--  which optional User App sections show up for whom (Todo List, Lapor KPI,
--  Program, Job Desk, Kunjungan). Dashboard/Absensi/Momen/Profil always show.
--  A missing row = default ON.
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  expenses — pencatat pengeluaran staf (BUKAN modul keuangan): nama
--  pengeluaran, nominal, catatan opsional + foto lampiran wajib. Tanggal
--  diambil otomatis dari server saat submit. Submit-only, sama seperti
--  izin: langsung tercatat di Admin Panel "Laporan Pengeluaran".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expenses` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`       BIGINT UNSIGNED NOT NULL,
  `name`          VARCHAR(150)    NOT NULL,
  `expense_date`  DATE            NOT NULL,
  `amount`        INT UNSIGNED    NOT NULL DEFAULT 0,
  `note`          VARCHAR(1000)   NULL,
  `photo_path`    VARCHAR(255)    NOT NULL,
  `photo_mime`    VARCHAR(100)    NOT NULL DEFAULT 'image/jpeg',
  `photo_name`    VARCHAR(200)    NULL,
  `photo_size`    INT UNSIGNED    NULL,
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_expenses_user_date` (`user_id`, `expense_date`),
  KEY `ix_expenses_date` (`expense_date`),
  CONSTRAINT `fk_expenses_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  piket_schedules / piket_settings — jadwal piket MINGGUAN berulang, keyed
--  by hari (bukan tanggal): admin assign karyawan per hari, terus berulang
--  tiap minggu sampai diubah lagi. Reminder terkirim sekali per hari jadwal
--  pada jam yang admin atur di piket_settings.
-- ------------------------------------------------------------
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

CREATE TABLE IF NOT EXISTS `piket_settings` (
  `id`              TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `reminder_time`   TIME            NOT NULL DEFAULT '07:00:00',
  `enabled`         TINYINT(1)      NOT NULL DEFAULT 1,
  `friday_time`     TIME            NOT NULL DEFAULT '07:00:00',
  `friday_enabled`  TINYINT(1)      NOT NULL DEFAULT 1,
  `friday_message`  VARCHAR(255)    NULL,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `piket_settings` (`id`, `reminder_time`, `enabled`, `friday_time`, `friday_enabled`) VALUES (1, '07:00:00', 1, '07:00:00', 1)
  ON DUPLICATE KEY UPDATE id = id;

-- ------------------------------------------------------------
--  job_desks — uraian tugas per divisi / jabatan (ditulis Admin,
--  dibaca karyawan di menu Job Desk; karyawan tidak bisa mengubah).
-- ------------------------------------------------------------
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

-- ------------------------------------------------------------
--  system_settings — singleton (always id = 1)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id`           TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `company_name` VARCHAR(150) NOT NULL DEFAULT 'Premiere Group',
  `timezone`     VARCHAR(64)  NOT NULL DEFAULT 'Asia/Makassar',
  `locale`       VARCHAR(10)  NOT NULL DEFAULT 'id-ID',
  `week_start`   ENUM('sun','mon') NOT NULL DEFAULT 'mon',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `ck_system_settings_singleton` CHECK (`id` = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  notification_settings — admin-configurable on/off + reminder
--  lead-time per notification type. A missing row means "use the
--  built-in default" (see api/lib/NotifSettings.php catalog()).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `notification_settings` (
  `type`         VARCHAR(40) NOT NULL,
  `enabled`      TINYINT(1)  NOT NULL DEFAULT 1,
  `offset_value` SMALLINT UNSIGNED NULL DEFAULT NULL,
  `offset_unit`  ENUM('minute','hour','day') NULL DEFAULT NULL,
  `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  posts — "Momen Kerja" feed (shared by both interfaces). An
--  optional square photo AND/OR text caption per post (at least
--  one required — enforced in PHP, not the schema); polymorphic
--  owner (a user OR an admin can post). `expires_at` = created_at
--  + 24h; a sweep (api/lib/Posts.php) hard-deletes the row + its
--  photo file (if any) once expired — nothing here is permanent.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `posts` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_kind`  ENUM('user','admin') NOT NULL,
  `owner_id`    BIGINT UNSIGNED NOT NULL,
  `photo_path`  VARCHAR(255)    NULL DEFAULT NULL,
  `video_path`  VARCHAR(255)    NULL DEFAULT NULL,
  `video_mime`  VARCHAR(60)     NULL DEFAULT NULL,
  `caption`     VARCHAR(500)    NULL DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `expires_at`  DATETIME        NOT NULL,
  PRIMARY KEY (`id`),
  KEY `ix_posts_owner` (`owner_kind`, `owner_id`),
  KEY `ix_posts_expires` (`expires_at`),
  KEY `ix_posts_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  post_likes — one row per (post, liker). Cascades with the post.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `post_likes` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`      BIGINT UNSIGNED NOT NULL,
  `liker_kind`   ENUM('user','admin') NOT NULL,
  `liker_id`     BIGINT UNSIGNED NOT NULL,
  `created_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_post_like` (`post_id`, `liker_kind`, `liker_id`),
  KEY `ix_post_likes_post` (`post_id`),
  CONSTRAINT `fk_post_likes_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ------------------------------------------------------------
--  post_comments — cascades with the post. Deletable by its author or any
--  admin (moderation). `parent_comment_id` = one-level threaded replies
--  (no self-ref FK; reply cleanup is done in PHP).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `post_comments` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`            BIGINT UNSIGNED NOT NULL,
  `parent_comment_id`  BIGINT UNSIGNED NULL DEFAULT NULL,
  `commenter_kind`     ENUM('user','admin') NOT NULL,
  `commenter_id`       BIGINT UNSIGNED NOT NULL,
  `comment_text`       VARCHAR(500)    NOT NULL,
  `created_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_post_comments_post` (`post_id`),
  KEY `ix_pc_parent` (`parent_comment_id`),
  CONSTRAINT `fk_post_comments_post` FOREIGN KEY (`post_id`) REFERENCES `posts` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `post_comment_likes` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `comment_id` BIGINT UNSIGNED NOT NULL,
  `liker_kind` ENUM('user','admin') NOT NULL,
  `liker_id`   BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_pcl` (`comment_id`, `liker_kind`, `liker_id`),
  KEY `ix_pcl_comment` (`comment_id`),
  CONSTRAINT `fk_pcl_comment` FOREIGN KEY (`comment_id`) REFERENCES `post_comments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--  Private 1-to-1 chat (see migration 2026_10_01_000001_chat.sql).
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

--  Resi Gudang — catatan barang masuk gudang (see migration
--  2026_10_02_000001_warehouse_receipts.sql). Karyawan mengisi di User App,
--  Admin menerimanya di "Laporan Resi Gudang". Nilai uang = rupiah bulat.
CREATE TABLE IF NOT EXISTS `warehouse_receipts` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `status`         ENUM('draft','submitted') NOT NULL DEFAULT 'submitted',
  `receipt_date`   DATE            NOT NULL,
  `item_name`      VARCHAR(180)    NOT NULL,
  `supplier`       VARCHAR(160)    NOT NULL,
  `resi_no`        VARCHAR(120)    NOT NULL,
  `qty`            INT UNSIGNED    NOT NULL DEFAULT 0,
  `unit_price`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `total_price`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `shipping_cost`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `note`           VARCHAR(1000)   NULL,
  `received_date`  DATE            NULL DEFAULT NULL,
  `goods_status`   ENUM('klop','minus') NULL DEFAULT NULL,
  `payment`        VARCHAR(120)    NOT NULL DEFAULT '',
  `payment_status` ENUM('lunas','belum_lunas') NOT NULL DEFAULT 'belum_lunas',
  `due_date`       DATE            NULL DEFAULT NULL,
  `shipping`       VARCHAR(120)    NOT NULL DEFAULT '',
  `koli`           INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_whr_user_date` (`user_id`, `receipt_date`),
  KEY `ix_whr_date` (`receipt_date`),
  KEY `ix_whr_payment_status` (`payment_status`, `due_date`),
  KEY `ix_whr_status` (`status`),
  CONSTRAINT `fk_whr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--  Data Supplier — daftar master supplier bersama (lihat migration
--  2026_10_04_000002_warehouse_suppliers.sql), dipakai sebagai dropdown
--  "Supplier" di form Catat Resi Gudang; bertambah otomatis via pg_whs_ensure()
--  dan bisa dikelola manual lewat halaman User App "Data Supplier".
CREATE TABLE IF NOT EXISTS `warehouse_suppliers` (
  `id`                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`               VARCHAR(160)    NOT NULL,
  `created_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL,
  `created_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_whs_name` (`name`),
  KEY `ix_whs_created_by` (`created_by_user_id`),
  CONSTRAINT `fk_whs_user` FOREIGN KEY (`created_by_user_id`) REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
--  BASELINE ROWS (safe for a live site — no secrets)
--  Starter master data so the app is not empty on first run.
-- ============================================================

INSERT INTO `attendance_settings` (`id`) VALUES (1)
  ON DUPLICATE KEY UPDATE `id` = `id`;

INSERT INTO `system_settings` (`id`) VALUES (1)
  ON DUPLICATE KEY UPDATE `id` = `id`;

INSERT INTO `divisions` (`name`, `description`) VALUES
  ('Management',      'Kepemimpinan & strategi perusahaan'),
  ('Marketing',       'Konten, sosial media, promosi'),
  ('Operasional',     'Operasional harian & logistik'),
  ('Finance',         'Keuangan & administrasi'),
  ('HR',              'Rekrutmen & pengelolaan karyawan'),
  ('Content Creator', 'Produksi konten kreatif')
  ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `positions` (`name`) VALUES
  ('Staff'), ('Supervisor'), ('Kepala Divisi')
  ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

INSERT INTO `schema_migrations` (`version`) VALUES ('2026_09_01_000001_initial')
  ON DUPLICATE KEY UPDATE `version` = `version`;

-- ============================================================
--  ADMIN ACCOUNT
--  ------------------------------------------------------------
--  One admin row is created with an EMPTY password_hash on purpose.
--  Login stays disabled until a real bcrypt hash is set — an empty
--  string can never match password_verify(), so this is safe to ship.
--
--  SET THE ADMIN PASSWORD (pick ONE, after the PHP backend is deployed):
--
--   A) First-run screen (recommended) — the login page detects the empty
--      hash and asks you to create the password. Nothing to run.
--
--   B) One SQL line in phpMyAdmin. First generate a bcrypt hash:
--        php -r "echo password_hash('YOUR_STRONG_PASSWORD', PASSWORD_BCRYPT), PHP_EOL;"
--      then run (paste the $2y$... string):
--        UPDATE `admins` SET `password_hash` = '$2y$10$....' WHERE `username` = 'admin';
--
--  Username is 'admin'. Change name/username here before import if you like.
-- ============================================================
INSERT INTO `admins` (`name`, `username`, `password_hash`, `role`, `status`)
VALUES ('Admin', 'admin', '', 'super_admin', 'active')
  ON DUPLICATE KEY UPDATE `username` = `username`;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
--  END OF db.sql
-- ============================================================
