-- ============================================================
--  KPI refinement:
--   - indicator value type: plain number vs money (Rp)
--   - the reporting period is chosen by the employee (Pekan 1–4,
--     a date range, and/or a free text label) — no longer derived
--     by the app; one employee may file many reports per template
--     (different toko / period), and edit or delete them.
--  Each statement is single-clause so the auto-migrator can skip
--  the ones already applied (or not applicable to a fresh install).
-- ============================================================

ALTER TABLE `kpi_template_items` ADD COLUMN `value_type` ENUM('number','money') NOT NULL DEFAULT 'number';

UPDATE `kpi_template_items` SET `value_type` = 'money' WHERE `is_currency` = 1;

ALTER TABLE `kpi_reports` ADD COLUMN `week_no` TINYINT UNSIGNED NULL DEFAULT NULL;

ALTER TABLE `kpi_reports` ADD COLUMN `period_start` DATE NULL DEFAULT NULL;

ALTER TABLE `kpi_reports` ADD COLUMN `period_end` DATE NULL DEFAULT NULL;

ALTER TABLE `kpi_reports` DROP INDEX `uq_kpi_report`;

ALTER TABLE `kpi_reports` MODIFY COLUMN `period_key` VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE `kpi_reports` MODIFY COLUMN `period_label` VARCHAR(160) NOT NULL DEFAULT '';
