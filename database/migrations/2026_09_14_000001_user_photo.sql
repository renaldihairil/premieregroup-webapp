-- ============================================================
--  Foto profil karyawan. Disimpan sebagai path relatif ke file
--  di storage (bukan base64). Karyawan mengunggahnya sendiri dari
--  menu Profil Saya di User App.
--  Single-clause statement so the auto-migrator can skip it if
--  already applied (or already present on a fresh install).
-- ============================================================

ALTER TABLE `users` ADD COLUMN `photo_path` VARCHAR(255) NULL DEFAULT NULL;
