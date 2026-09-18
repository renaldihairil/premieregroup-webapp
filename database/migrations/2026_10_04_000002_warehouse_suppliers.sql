-- Data Supplier — daftar master supplier BERSAMA (bukan per-karyawan), dipakai
-- sebagai isi dropdown "Supplier" di form Catat Resi Gudang. `warehouse_receipts`
-- TETAP menyimpan `supplier` sebagai teks bebas (tidak diubah jadi foreign key) —
-- tabel ini murni daftar "nama supplier yang sudah pernah dipakai/didaftarkan",
-- bertambah otomatis setiap kali resi baru pakai nama supplier yang belum ada
-- (lihat pg_whs_ensure() di api/routes/warehouse_suppliers.php), dan bisa
-- dikelola manual (tambah/ubah/hapus) lewat halaman User App "Data Supplier".
-- UNIQUE KEY pada `name` pakai collation ci (case-insensitive) bawaan tabel,
-- jadi "PT Sumber Makmur" dan "pt sumber makmur" dianggap sama.
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

-- Backfill: setiap nama supplier yang sudah pernah dipakai di resi gudang
-- yang sudah ada, langsung terdaftar sebagai supplier dikenal (biar dropdown
-- tidak kosong begitu fitur ini aktif).
INSERT IGNORE INTO `warehouse_suppliers` (`name`)
SELECT DISTINCT TRIM(`supplier`) FROM `warehouse_receipts` WHERE TRIM(`supplier`) <> '';
