-- Resi Gudang — dukungan draft: karyawan bisa "Simpan Draft" dulu (belum
-- jadi laporan resmi, hanya terlihat oleh dirinya sendiri, tidak memicu
-- notifikasi ke admin, tidak ikut Laporan Resi/Laporan Resi Gudang) lalu
-- "Kirim" belakangan untuk menjadikannya submitted. Baris LAMA (sebelum
-- fitur ini ada) semuanya sudah final, karenanya default = 'submitted'.
ALTER TABLE `warehouse_receipts` ADD COLUMN `status` ENUM('draft','submitted') NOT NULL DEFAULT 'submitted' AFTER `user_id`;

ALTER TABLE `warehouse_receipts` ADD KEY `ix_whr_status` (`status`);
