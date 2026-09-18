-- ============================================================
--  Laporan Kunjungan — tambah status 'draft'.
--  Alur baru di User App: laporan yang sedang dibuat berstatus
--  'draft' (belum terkirim / tidak terlihat Admin). Tombol
--  "Kirim" mengubahnya jadi 'submitted'; tombol "Batal" menghapus
--  draft-nya. Baris lama tetap 'submitted' / 'reviewed'.
--  Single-clause statement so the auto-migrator can skip it if
--  already applied.
-- ============================================================

ALTER TABLE `visits` MODIFY COLUMN `status` ENUM('draft','submitted','reviewed') NOT NULL DEFAULT 'submitted';
