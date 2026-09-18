-- ============================================================
--  Karyawan bisa berada di BEBERAPA divisi.
--  `users.division_id` tetap ada = divisi UTAMA (yang pertama
--  dipilih) supaya seluruh kode lama tetap jalan. Daftar lengkap
--  divisi seorang karyawan ada di `user_divisions`.
--  Single-clause statements so the auto-migrator can skip the
--  ones already applied (or already present on a fresh install).
-- ============================================================

CREATE TABLE IF NOT EXISTS `user_divisions` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `division_id` BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (`user_id`, `division_id`),
  KEY `ix_ud_division` (`division_id`),
  CONSTRAINT `fk_ud_user`     FOREIGN KEY (`user_id`)     REFERENCES `users`     (`id`) ON DELETE CASCADE  ON UPDATE CASCADE,
  CONSTRAINT `fk_ud_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO `user_divisions` (`user_id`, `division_id`)
  SELECT `id`, `division_id` FROM `users` WHERE `division_id` IS NOT NULL
  ON DUPLICATE KEY UPDATE `division_id` = `user_divisions`.`division_id`;
