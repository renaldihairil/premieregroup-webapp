-- ============================================================
--  Manajemen Toko — the list of stores this company runs.
--  KPI reports are made per store, so a report points at a store.
--  Single-clause statements so the auto-migrator can skip the
--  ones already applied (or already present on a fresh install).
-- ============================================================

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

ALTER TABLE `kpi_reports` ADD COLUMN `store_id` BIGINT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE `kpi_reports` ADD KEY `ix_kr_store` (`store_id`);

ALTER TABLE `kpi_reports` ADD CONSTRAINT `fk_kr_store` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
