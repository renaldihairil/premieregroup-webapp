-- ============================================================
--  KPI Phase 6 — auto-derived indicator sources + unit label,
--  and a completion timestamp on todos so "selesai tepat waktu"
--  can be measured. Each statement is single-clause so the
--  auto-migrator can skip the ones already applied.
-- ============================================================

ALTER TABLE `kpi_settings`
  ADD COLUMN `source` ENUM('manual','attendance_present','attendance_ontime','overtime_hours','todo_completed','todo_ontime')
  NOT NULL DEFAULT 'manual';

ALTER TABLE `kpi_settings`
  ADD COLUMN `unit` VARCHAR(20) NOT NULL DEFAULT '';

ALTER TABLE `todos`
  ADD COLUMN `completed_at` DATETIME NULL DEFAULT NULL;

ALTER TABLE `todos`
  ADD KEY `ix_todos_completed_at` (`completed_at`);

UPDATE `todos` SET `completed_at` = `updated_at` WHERE `status` = 'done' AND `completed_at` IS NULL;
