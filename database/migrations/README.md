# Database migrations — Premiere Group

Plain numbered `.sql` files, tracked in the `schema_migrations` table.

**They apply automatically.** On the first API request after new files are uploaded,
`api/lib/Db.php → runPendingMigrations()` runs every `*.sql` here whose `version`
is not yet in `schema_migrations` (statement by statement; "already exists" errors
are ignored; then it records the marker). Manual import via phpMyAdmin is only
needed if the DB user lacks `CREATE/ALTER` privileges.

## Naming

```
YYYY_MM_DD_NNNNNN_short_description.sql
```
Example: `2026_10_05_000001_add_notifications_table.sql`

## Rules for every migration file

1. It must be **idempotent-safe to skim**: use `CREATE TABLE IF NOT EXISTS`,
   `ADD COLUMN IF NOT EXISTS` (MariaDB) or a guarded `ALTER`, etc.
2. It must **not** contain secrets or environment-specific data.
3. Its **last statement** records itself:
   ```sql
   INSERT INTO `schema_migrations` (`version`) VALUES ('2026_10_05_000001_add_notifications_table')
     ON DUPLICATE KEY UPDATE `version` = `version`;
   ```
4. If it changes data, wrap multi-table changes in a transaction
   (`START TRANSACTION; ... COMMIT;`).

## Applying migrations

### Fresh install
Import **`database/db.sql`** once. It creates every current table and
registers migration `2026_09_01_000001_initial`.

### Existing install
1. In phpMyAdmin, run:
   ```sql
   SELECT * FROM schema_migrations ORDER BY version;
   ```
2. Import every file in `database/migrations/` whose `version` is **not** listed,
   in filename order.
3. Re-run the query to confirm.

## Rollback

There is no automatic rollback on shared hosting. For each risky migration, keep a
sibling `..._down.sql` with the reverse `ALTER`/`DROP`, to be applied manually only
if needed. Always take a full export (see `docs/DEPLOYMENT.md` → Backup) before
applying a migration in production.

## Current state

| version | file | notes |
|---|---|---|
| `2026_09_01_000001_initial` | `../db.sql` | full schema — 15 tables, 17 FKs (db.sql always carries the complete current schema) |
| `2026_09_02_000001_admins_email` | `2026_09_02_000001_admins_email.sql` | `admins.email` (login by email) |
| `2026_09_03_000001_todo_attachments` | `2026_09_03_000001_todo_attachments.sql` | `todo_attachments` (todo work-report files/links) |
| `2026_09_04_000001_todo_notes_and_user_created` | `2026_09_04_000001_todo_notes_and_user_created.sql` | `todos.user_note` (assignee's note) + `todos.created_by_user_id` (todo created by a karyawan) |

Future feature phases (job_desks, visits, programs, program_tasks, notifications,
todo_assignments) add their tables as new migration files — proposed DDL is in
`docs/PRODUCTION-ARCHITECTURE.md` → "Tabel fase berikutnya".
