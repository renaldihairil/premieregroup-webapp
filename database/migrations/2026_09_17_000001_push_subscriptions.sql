-- Web Push subscriptions. Polymorphic owner (a users.id OR an admins.id).
-- One physical device (endpoint) may map to both an admin-owner and a
-- user-owner row if the same person uses both apps on it; a dead endpoint
-- (HTTP 404/410 from the push service) is removed for every owner.
CREATE TABLE IF NOT EXISTS `push_subscriptions` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `owner_kind`  ENUM('user','admin') NOT NULL,
  `owner_id`    BIGINT UNSIGNED NOT NULL,
  `endpoint`    VARCHAR(500)    NOT NULL,
  `p256dh`      VARCHAR(160)    NOT NULL,
  `auth`        VARCHAR(64)     NOT NULL,
  `ua`          VARCHAR(200)    NULL DEFAULT NULL,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `last_ok_at`  DATETIME        NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_owner_endpoint` (`owner_kind`, `owner_id`, `endpoint`(191)),
  KEY `ix_endpoint` (`endpoint`(191))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
