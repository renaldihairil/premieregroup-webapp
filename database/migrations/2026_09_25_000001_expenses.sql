-- Pengeluaran (expense reports) — pencatat pengeluaran staf, BUKAN modul
-- keuangan. Fieldnya sengaja minimal: nama pengeluaran, nominal, catatan
-- opsional + foto lampiran wajib (kamera atau upload). Tanggal DIAMBIL
-- OTOMATIS dari server saat submit (sama seperti izin_date pada tabel izin),
-- bukan input manual. Submit-only, tanpa alur approval — langsung tercatat
-- di Admin Panel "Laporan Pengeluaran"; "Riwayat Pengeluaran" milik karyawan
-- membaca baris yang sama. Tidak ada unique constraint — staf boleh mencatat
-- beberapa pengeluaran per hari.
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
