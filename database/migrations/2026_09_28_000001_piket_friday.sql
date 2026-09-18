-- "Jumat Berkah" — Friday is a special cleanup day: employees on the Friday
-- piket roster get a DISTINCT reminder (own clock-time, own on/off, own
-- message) instead of the generic weekday piket reminder. Three separate
-- ALTERs so a partial re-run stays idempotent (each dup-column error is
-- individually ignorable by Db::runPendingMigrations()).
ALTER TABLE `piket_settings` ADD COLUMN `friday_time` TIME NOT NULL DEFAULT '07:00:00';
ALTER TABLE `piket_settings` ADD COLUMN `friday_enabled` TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE `piket_settings` ADD COLUMN `friday_message` VARCHAR(255) NULL;
