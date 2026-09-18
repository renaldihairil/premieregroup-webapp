-- Admin-configurable notification on/off + reminder lead-time per type.
-- A missing row means "use the built-in default" — see
-- api/lib/NotifSettings.php catalog() for the full type list + defaults.
CREATE TABLE IF NOT EXISTS `notification_settings` (
  `type`         VARCHAR(40) NOT NULL,
  `enabled`      TINYINT(1)  NOT NULL DEFAULT 1,
  `offset_value` SMALLINT UNSIGNED NULL DEFAULT NULL,
  `offset_unit`  ENUM('minute','hour','day') NULL DEFAULT NULL,
  `updated_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
