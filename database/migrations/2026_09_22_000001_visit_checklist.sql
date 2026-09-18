-- Visit checklist — admin defines, PER DIVISION, a flat list of checklist
-- items employees must go through during a store visit; each checked item
-- carries its own photo evidence (tagged via visit_attachments.checklist_item_id).
CREATE TABLE IF NOT EXISTS `visit_checklist_items` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `division_id` BIGINT UNSIGNED NOT NULL,
  `label`       VARCHAR(200)    NOT NULL,
  `sort_order`  INT             NOT NULL DEFAULT 0,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_vci_division` (`division_id`),
  CONSTRAINT `fk_vci_division` FOREIGN KEY (`division_id`) REFERENCES `divisions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `visit_checklist_answers` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `visit_id`   BIGINT UNSIGNED NOT NULL,
  `item_id`    BIGINT UNSIGNED NOT NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_vca_visit_item` (`visit_id`, `item_id`),
  KEY `ix_vca_item` (`item_id`),
  CONSTRAINT `fk_vca_visit` FOREIGN KEY (`visit_id`) REFERENCES `visits` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_vca_item`  FOREIGN KEY (`item_id`)  REFERENCES `visit_checklist_items` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE `visit_attachments`
  ADD COLUMN `checklist_item_id` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `visit_id`,
  ADD KEY `ix_va_checklist_item` (`checklist_item_id`),
  ADD CONSTRAINT `fk_va_checklist_item` FOREIGN KEY (`checklist_item_id`) REFERENCES `visit_checklist_items` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;
