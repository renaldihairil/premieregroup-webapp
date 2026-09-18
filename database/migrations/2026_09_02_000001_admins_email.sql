-- ============================================================
--  Migration 2026_09_02_000001_admins_email
--  Adds an optional `email` to `admins` so an admin can sign in
--  with a Gmail/email address as well as a username. The password
--  is still stored (as a bcrypt hash) in `admins.password_hash`.
--
--  Run this ONCE in phpMyAdmin (database `premiere_group` -> SQL tab)
--  if you imported db.sql BEFORE this migration existed. A fresh
--  import of db.sql already includes the column — skip it then.
-- ============================================================

ALTER TABLE `admins`
  ADD COLUMN `email` VARCHAR(190) NULL DEFAULT NULL AFTER `username`;

ALTER TABLE `admins`
  ADD UNIQUE KEY `uq_admins_email` (`email`);

INSERT INTO `schema_migrations` (`version`) VALUES ('2026_09_02_000001_admins_email')
  ON DUPLICATE KEY UPDATE `version` = `version`;
