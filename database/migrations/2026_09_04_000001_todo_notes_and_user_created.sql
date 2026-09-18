-- ============================================================
--  Migration 2026_09_04_000001_todo_notes_and_user_created
--  * todos.user_note      — optional work note the assignee writes
--  * todos.created_by_user_id — set when a KARYAWAN creates the todo
--                              themselves (shows up in the Admin panel)
--
--  Applied automatically by api/lib/Db.php on the next request. Only
--  import by hand if the DB user has no CREATE/ALTER privilege.
-- ============================================================

ALTER TABLE `todos` ADD COLUMN `user_note` TEXT NULL DEFAULT NULL AFTER `description`;

ALTER TABLE `todos` ADD COLUMN `created_by_user_id` BIGINT UNSIGNED NULL DEFAULT NULL AFTER `created_by_admin_id`;

ALTER TABLE `todos` ADD KEY `ix_todos_creator_user` (`created_by_user_id`);

ALTER TABLE `todos`
  ADD CONSTRAINT `fk_todos_creator_user` FOREIGN KEY (`created_by_user_id`)
  REFERENCES `users` (`id`) ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO `schema_migrations` (`version`) VALUES ('2026_09_04_000001_todo_notes_and_user_created')
  ON DUPLICATE KEY UPDATE `version` = `version`;
