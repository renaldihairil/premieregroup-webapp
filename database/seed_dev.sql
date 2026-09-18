-- ============================================================
--  PREMIERE GROUP — DEVELOPMENT SEED  (OPTIONAL · LOCAL DEV ONLY)
--  ------------------------------------------------------------
--  >>> DO NOT import this on the live site. <<<
--
--  This file only exists to give a local XAMPP/Laragon copy a few
--  test employees + a sample holiday so you can click around while
--  building. Import it AFTER database/db.sql, on your local machine.
--
--  The live site imports database/db.sql ONLY.
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = "+08:00";

-- Admin account (password must be set separately; '' never matches bcrypt)
INSERT INTO `admins` (`name`, `username`, `password_hash`, `role`, `status`)
VALUES ('Admin', 'admin', '', 'super_admin', 'active')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- A couple of test employees (division/position ids from db.sql baseline:
-- divisions 1..6 = Management, Marketing, Operasional, Finance, HR, Content Creator;
-- positions 1..3 = Staff, Supervisor, Kepala Divisi)
INSERT INTO `users` (`username`, `full_name`, `division_id`, `position_id`, `role`, `status`) VALUES
  ('budi', 'Budi Santoso', 3, 1, 'staff', 'active'),
  ('sari', 'Sari Dewi',    2, 1, 'staff', 'active'),
  ('eko',  'Eko Prasetyo', 3, 2, 'supervisor', 'active')
ON DUPLICATE KEY UPDATE `full_name` = VALUES(`full_name`);

-- One sample holiday
INSERT INTO `holidays` (`holiday_date`, `label`) VALUES
  ('2026-08-17', 'Hari Kemerdekaan RI')
ON DUPLICATE KEY UPDATE `label` = VALUES(`label`);
