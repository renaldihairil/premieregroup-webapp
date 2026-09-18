-- Resi Gudang — status pelunasan & kondisi barang, dipakai untuk pewarnaan
-- "Riwayat Resi" dan kartu ringkasan di User App:
--   payment_status  'lunas' (sudah ditransfer) | 'belum_lunas' (belum) — DEFAULT
--                    belum_lunas krn resi baru masuk umumnya belum dibayar.
--   due_date        tanggal jatuh tempo — hanya relevan selama belum_lunas;
--                    "Resi Jatuh Tempo" = belum_lunas DAN due_date sudah lewat.
--   goods_status    'klop' (barang datang sesuai) | 'minus' (barang datang
--                    kurang) — diisi user saat menandai barang diterima,
--                    NULL selama barang belum diterima (received_date kosong).
ALTER TABLE `warehouse_receipts` ADD COLUMN `payment_status` ENUM('lunas','belum_lunas') NOT NULL DEFAULT 'belum_lunas' AFTER `payment`;

ALTER TABLE `warehouse_receipts` ADD COLUMN `due_date` DATE NULL DEFAULT NULL AFTER `payment_status`;

ALTER TABLE `warehouse_receipts` ADD COLUMN `goods_status` ENUM('klop','minus') NULL DEFAULT NULL AFTER `received_date`;

ALTER TABLE `warehouse_receipts` ADD KEY `ix_whr_payment_status` (`payment_status`, `due_date`);
