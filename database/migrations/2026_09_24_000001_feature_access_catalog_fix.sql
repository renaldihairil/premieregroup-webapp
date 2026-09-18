-- Feature Access catalog correction: "todo", "program", and "jobdesk" turned
-- out to be CORE features (must always show for every account) — they were
-- removed from FeatureAccess::catalog(). "absensi" was added instead (bundles
-- Izin + Lembur + the Rekap Absensi shortcut). Clean up any rows a live admin
-- may have already saved for the now-removed keys before this correction —
-- harmless no-op on a fresh install where nothing was ever toggled.
DELETE FROM `division_features` WHERE `feature_key` IN ('todo', 'program', 'jobdesk');
DELETE FROM `user_features` WHERE `feature_key` IN ('todo', 'program', 'jobdesk');
