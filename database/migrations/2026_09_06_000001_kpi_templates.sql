-- ============================================================
--  KPI rework — from auto-derived indicators to admin-built
--  templates per division that employees fill in.
--
--  Setting KPI (admin) = build a KPI form per division:
--    indicators + sub-indicators + targets.
--  Lapor KPI (employee) = fill that form with actuals.
--  Laporan KPI (admin) = read every submitted report.
--
--  The previous flat `kpi_settings` model is dropped (it was
--  never used on production).
-- ============================================================

DROP TABLE IF EXISTS `kpi_report_values`;
DROP TABLE IF EXISTS `kpi_reports`;
DROP TABLE IF EXISTS `kpi_template_items`;
DROP TABLE IF EXISTS `kpi_templates`;
DROP TABLE IF EXISTS `kpi_settings`;

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
  `unit`        VARCHAR(20)     NOT NULL DEFAULT '',
  `is_optional` TINYINT(1)      NOT NULL DEFAULT 0,
  `is_currency` TINYINT(1)      NOT NULL DEFAULT 0,
  `fx_rate`     DECIMAL(16,2)   NOT NULL DEFAULT 0,
  `fx_label`    VARCHAR(10)     NOT NULL DEFAULT 'Rp',
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
  `period_key`           VARCHAR(10)     NOT NULL,
  `period_label`         VARCHAR(120)    NOT NULL DEFAULT '',
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
  UNIQUE KEY `uq_kpi_report` (`template_id`, `user_id`, `period_key`),
  KEY `ix_kr_user` (`user_id`),
  KEY `ix_kr_template` (`template_id`),
  KEY `ix_kr_status` (`status`),
  CONSTRAINT `fk_kr_template` FOREIGN KEY (`template_id`) REFERENCES `kpi_templates` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_kr_user`     FOREIGN KEY (`user_id`)     REFERENCES `users` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
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
