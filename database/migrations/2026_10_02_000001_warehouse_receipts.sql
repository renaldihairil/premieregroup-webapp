-- Resi Gudang (warehouse receipts) — catatan barang masuk gudang yang diisi
-- karyawan di User App; Admin Panel menerimanya di "Laporan Resi Gudang".
-- Bukan modul inventori — hanya pencatat penerimaan barang: tanggal, nama
-- barang, supplier, no resi, qty, harga satuan, total, ongkir, keterangan,
-- tanggal diterima, cara/status pembayaran, ekspedisi pengiriman, dan jumlah
-- koli. Karyawan boleh membuat, mengubah, dan menghapus catatannya sendiri
-- (mirip my-visits) — Admin bisa menghapus untuk housekeeping. Tanpa alur
-- approval. Semua nilai uang disimpan sebagai rupiah bulat (BIGINT), sama
-- seperti kolom amount pada tabel expenses.
CREATE TABLE IF NOT EXISTS `warehouse_receipts` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `receipt_date`   DATE            NOT NULL,
  `item_name`      VARCHAR(180)    NOT NULL,
  `supplier`       VARCHAR(160)    NOT NULL,
  `resi_no`        VARCHAR(120)    NOT NULL,
  `qty`            INT UNSIGNED    NOT NULL DEFAULT 0,
  `unit_price`     BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `total_price`    BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `shipping_cost`  BIGINT UNSIGNED NOT NULL DEFAULT 0,
  `note`           VARCHAR(1000)   NULL,
  `received_date`  DATE            NULL DEFAULT NULL,
  `payment`        VARCHAR(120)    NOT NULL DEFAULT '',
  `shipping`       VARCHAR(120)    NOT NULL DEFAULT '',
  `koli`           INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_whr_user_date` (`user_id`, `receipt_date`),
  KEY `ix_whr_date` (`receipt_date`),
  CONSTRAINT `fk_whr_user` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
