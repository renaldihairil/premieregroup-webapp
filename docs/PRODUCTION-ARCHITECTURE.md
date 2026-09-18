# PREMIERE GROUP — PRODUCTION ARCHITECTURE (RECOMMENDATION)

**Status:** proposal for review. Nothing in the running app has been changed yet.
Pairs with `docs/DATABASE-AUDIT.md` and `database/db.sql`.

---

## 1. The safest stack for this target (brief §41–§43)

Target infrastructure stated by the client: **MySQL/MariaDB + phpMyAdmin + hosting**.
In practice that means a **cPanel-style shared/LAMP host**. That fact drives every choice below.

| Decision | Recommendation | Why |
|---|---|---|
| **Frontend** | **Keep as-is.** Vanilla-JS SPA (`index.html`, `admin.html`), no framework migration. | It works, it's tested, it already routes every data call through the `PG.store` / `PG.auth` seam. Rewriting it adds risk for zero production benefit. |
| **Backend language** | **PHP 8.1+** | The *only* language guaranteed on cPanel/phpMyAdmin shared hosting. Node.js is unreliable/absent on most shared plans (§41). |
| **Backend framework** | **None / micro.** Plain PHP with a tiny front controller + PDO. (Optionally Slim 4 if the host has Composer — but plain PHP has zero deploy friction.) | Shared hosting, no build step, easy to reason about, easy to hand off. Matches the "no over-engineering" instruction. |
| **DB access** | **PDO with prepared statements.** A ~120-line query helper, no ORM. | **Do NOT use Prisma (§42)** — it's Node/TS + a build/generate step, wrong ecosystem. PDO is built into PHP, parameterised by default (SQL-injection safe). |
| **Auth** | **PHP native sessions** (`session_start()`, files) + CSRF token. Password: `password_hash()` / `password_verify()` (bcrypt). | No JWT infra to run, no token table to maintain. Cookie is `HttpOnly; Secure; SameSite=Lax`. The frontend never sees a secret. |
| **File storage** | Filesystem folder (outside web root if allowed, else `+deny`), DB stores the **relative path**. Served through an authorising PHP endpoint. | base64-in-DB (current) bloats MySQL and has no access control (§17). |
| **Migrations** | Numbered `.sql` files applied via phpMyAdmin, tracked in `schema_migrations`. | No CLI on shared hosting (§27). |
| **Config** | `.env` file parsed by `config/env.php`, `.env` git-ignored. | §29, §40. |

### Resulting request flow

```
USER APP  (index.html)  ─┐
                         ├─►  /api/*  (PHP front controller)
ADMIN PANEL (admin.html) ─┘        │  auth (session) + authorization + validation
                                   ▼
                          PDO (prepared statements)
                                   ▼
                          MySQL / MariaDB  ──►  phpMyAdmin (management/backup)
                                   │
                          /storage/uploads/…  (selfie files; DB holds the path)
```

The frontend has **no** DB credentials and makes **no** DB calls. `store.js` becomes a thin
`fetch()` wrapper (same public method names → screens don't change).

---

## 2. Repository layout after the stabilization phase

```
Premiere-Group/
├─ index.html  admin.html            ← unchanged (served as static files)
├─ assets/                           ← unchanged, except core/store.js + core/auth.js
│  └─ js/core/store.js               ← refactored: PG.store.* → fetch('/api/...') (SAME method names)
│  └─ js/core/auth.js                ← refactored: login/logout/current → /api/auth/*  (no client hashing/token)
├─ api/                              ← NEW — PHP backend (the only server code)
│  ├─ index.php                      front controller / router  (rewrite: /api/* → api/index.php)
│  ├─ .htaccess                      rewrite rules + block direct file access
│  ├─ config/
│  │  ├─ env.php                     loads .env
│  │  └─ db.php                      PDO factory (SET time_zone='+08:00', utf8mb4)
│  ├─ core/
│  │  ├─ Request.php  Response.php  Router.php
│  │  ├─ Auth.php                    session, password_verify, current admin/user
│  │  ├─ Guard.php                   requireUser() / requireAdmin() / requireOwn($userId)
│  │  ├─ Validator.php               field rules, returns 422 with messages
│  │  └─ Db.php                      query helpers + transaction()
│  ├─ routes/
│  │  ├─ auth.php        users.php   divisions.php  positions.php
│  │  ├─ attendance.php  overtime.php  attendance_settings.php  holidays.php
│  │  ├─ todos.php       kpi.php       system_settings.php  dashboard.php
│  │  ├─ photo.php                    authorised selfie serving
│  │  └─ health.php                   GET /api/health
│  └─ helpers/
│     ├─ upload.php                   validate + store a selfie, return path
│     └─ time.php                     WITA-consistent now(), duration
├─ database/
│  ├─ db.sql                         ← DONE (this phase)
│  ├─ seed_dev.sql                   ← DONE
│  └─ migrations/README.md           ← DONE
├─ storage/                          ← NEW, git-ignored
│  ├─ uploads/attendance/YYYY/MM/…
│  ├─ uploads/overtime/YYYY/MM/…
│  └─ sessions/  cache/
├─ .env.example                      ← DONE     .env ← git-ignored
└─ docs/
   ├─ DATABASE-AUDIT.md              ← DONE
   ├─ PRODUCTION-ARCHITECTURE.md     ← this file
   ├─ DATABASE.md                    per-table reference (generated after build)
   └─ DEPLOYMENT.md                  ← DONE
```

---

## 3. Database — table-by-table spec

Full DDL: `database/db.sql`. Summary of the 13 active tables:

| Table | PK | Key columns | FKs (ON DELETE) | Unique / Index | Notes |
|---|---|---|---|---|---|
| `schema_migrations` | `version` | `applied_at` | — | — | migration tracking |
| `admins` | `id` | `username`, `password_hash` (bcrypt), `role`, `status` | — | UQ `username` | seed row's password set post-import |
| `divisions` | `id` | `name`, `description`, `status` | — | UQ `name` | seeded (6) |
| `positions` | `id` | `name`, `status` | — | UQ `name` | seeded (3) |
| `branches` | `id` | `name`, `status` | — | UQ `name` | legacy, unused in UI — kept |
| `users` | `id` | `username`, `full_name`, `role`, `status`, `deleted_at` | `division_id`→divisions **RESTRICT**, `position_id`→positions **SET NULL**, `branch_id`→branches **SET NULL** | UQ `username`; IX division/position/status | **soft delete** (API must not hard-delete — attendance/overtime FK) |
| `attendance_settings` | `id`=1 | `check_in`, `check_out`, `late_tolerance_min`, `overtime_start`, `overtime_end`, `work_days SET(...)` | — | singleton CHECK | was `attendanceSettings` blob |
| `holidays` | `id` | `holiday_date`, `label` | — | UQ `holiday_date` | was `attendanceSettings.holidays[]` |
| `attendances` | `id` | `attendance_date`, `check_in_at`, `check_in_photo`(path), `check_out_at`, `check_out_photo`(path), `check_in_status ENUM(hadir,terlambat)`, `late_minutes` | `user_id`→users **RESTRICT** | **UQ `(user_id, attendance_date)`** (real rule), IX `attendance_date` | 1/user/day |
| `overtimes` | `id` | `overtime_date`, `description`, `start_at`, `start_photo`(path), `end_at`, `end_photo`(path), `duration_ms`, `status ENUM(berjalan,menunggu,disetujui,ditolak,kadaluarsa)`, `rejection_reason`, `approved_at` | `user_id`→users **RESTRICT**, `attendance_id`→attendances **SET NULL**, `approved_by_admin_id`→admins **SET NULL** | **UQ `(user_id, overtime_date)`**, IX date/status/`(user_id,status)` | 1/user/day; `duration_ms` recomputed server-side |
| `todos` | `id` | `title`, `description`, `priority ENUM(high,mid,low)`, `status ENUM(todo,in_progress,done)`, `progress`, `deadline` | `division_id`→divisions **SET NULL**, `assignee_id`→users **SET NULL**, `created_by_admin_id`→admins **SET NULL** | IX assignee/division/status | single-assignee model (matches app) |
| `kpi_settings` | `id` | `name`, `target`, `weight`, `period ENUM(weekly,monthly)`, `status` | `division_id`→divisions **SET NULL**, `position_id`→positions **SET NULL** | IX division/position | empty until KPI phase |
| `kpi_reports` | `id` | `period`, `target`, `realisation`, `achievement_pct`, `note`, `status` | `user_id`→users **RESTRICT**, `kpi_setting_id`→kpi_settings **RESTRICT** | UQ `(user_id, kpi_setting_id, period)` | empty until KPI phase |
| `system_settings` | `id`=1 | `company_name`, `timezone`, `locale`, `week_start` | — | singleton CHECK | was `systemSettings` blob |

### FK on-delete rationale (brief §24 — no reckless CASCADE)

- **RESTRICT** on every FK that points at historical data (`attendances.user_id`,
  `overtimes.user_id`, `kpi_reports.*`). A user with history **cannot** be hard-deleted;
  the API deactivates (`status='inactive'`) or soft-deletes (`deleted_at`).
- **SET NULL** for soft relations: `todos.assignee_id` (matches current "todos kept, PIC
  orphaned"), `overtimes.attendance_id`, `overtimes.approved_by_admin_id`.
- **No CASCADE deletes anywhere.**

### Unique constraints (brief §26 — verified against business rules, not assumed)

| Constraint | Backed by code |
|---|---|
| `users.username` UNIQUE | `store.usernameExists`, `store.userByUsername` |
| `attendances (user_id, attendance_date)` UNIQUE | `store.attendanceToday` → "sudah absen masuk hari ini" |
| `overtimes (user_id, overtime_date)` UNIQUE | `store.overtimeToday` → "sudah memiliki lembur untuk hari ini" |
| `divisions.name`, `positions.name` UNIQUE | `store` `nameExists` check in Manajemen Tim |
| `holidays.holiday_date` UNIQUE | `addHoliday` dedup |
| `kpi_reports (user_id, kpi_setting_id, period)` UNIQUE | prevents double submission (§36) — new, safe |

### Indexes (brief §25 — from actual query patterns, not over-indexed)

`users.username` (login) · `attendances.attendance_date` + `(user_id, attendance_date)` (Laporan
Absensi date-range filter, user riwayat) · `overtimes.overtime_date` + `status` + `(user_id,
status)` (Laporan Lembur filters, `overtimeStatus`) · `todos.assignee_id` + `status` (User todo
list, Admin filter) · `kpi_reports.user_id` · division/position FKs auto-indexed.

---

## 4. Timezone (brief §15)

- App timezone: **Asia/Makassar (WITA, UTC+8)**, single-region — no per-user tz.
- PHP: `date_default_timezone_set('Asia/Makassar')` in the bootstrap.
- PDO: `SET time_zone = '+08:00'` on every connection (`config/db.php`).
- DB `DATETIME` columns store **WITA local time**, always written by the server
  (`helpers/time.php::now()`), never accepted from the client.
- Frontend displays the string as-is (it already does — `ui.fmtTimeID` just formats).
- Net effect: server records 14:00 → DB shows 14:00 → User App shows 14:00. Consistent.

> The current frontend uses `toISOString()` (UTC). During the `store.js` refactor, the
> frontend stops generating timestamps entirely — the API returns already-formatted
> WITA datetimes.

---

## 5. Selfie / file storage (brief §17, §50)

**Upload path:** `POST /api/attendance/check-in` (and check-out, overtime start/end) receives
the JPEG as a base64 data-URL in JSON (the camera component already produces this — minimal
frontend change) **or** multipart. `helpers/upload.php`:

1. Decode; reject if not a real image (`getimagesizefromstring`, not the client extension).
2. MIME ∈ `UPLOAD_ALLOWED_MIME`; bytes ≤ `UPLOAD_MAX_BYTES` (2 MB).
3. Re-encode through GD to strip any embedded payload; cap long edge at 480 px.
4. Filename = `bin2hex(random_bytes(16)) . '.jpg'` (unguessable).
5. Write to `UPLOAD_DIR/attendance/YYYY/MM/<name>.jpg`.
6. Store the relative path (`attendance/2026/09/ab12….jpg`) in the DB column.

**Serving:** `GET /api/photo?type=attendance&id=<attendanceId>&which=in`. The endpoint:
- resolves the record, checks `record.user_id === session.user_id` **OR** session is admin;
- streams the file with `Content-Type: image/jpeg`, `X-Content-Type-Options: nosniff`;
- **never** exposes the raw filesystem path or a directory listing.

`storage/` sits outside the web root if the host allows a path above `public_html`; otherwise
`storage/.htaccess` = `Require all denied` and files are only reachable through `/api/photo`.

---

## 6. API surface (maps 1:1 to today's `PG.store` / `PG.auth` methods)

`store.js` keeps the same method names, so **no screen code changes**. Each becomes a `fetch`.

| Frontend call today | Method + endpoint | Auth | Notes |
|---|---|---|---|
| `auth.adminLogin(pw)` | `POST /api/auth/admin/login` | public | `password_verify`; sets session cookie |
| `auth.userLogin(username)` | `POST /api/auth/user/login` | public | username lookup + `status='active'` |
| `auth.currentAdmin/currentUser` | `GET /api/auth/me` | session | returns principal or 401 |
| `auth.logout()` | `POST /api/auth/logout` | session | destroys session |
| `store.all('users')` etc | `GET /api/users` (+ `divisions`, `positions`) | admin | list/filter |
| `store.insert/patch/remove('users',…)` | `POST/PATCH/DELETE /api/users[/:id]` | admin | DELETE = soft delete |
| `store.getAttendanceSettings` | `GET /api/attendance-settings` | session | user needs it for the Absensi screen |
| `store.saveAttendanceSettings` | `PUT /api/attendance-settings` | admin (`attendance.settings.edit`) | |
| `store.listHolidays/addHoliday/removeHoliday` | `GET/POST/DELETE /api/holidays` | GET session, write admin | |
| `store.checkIn(userId, photo)` | `POST /api/attendance/check-in` `{photo}` | **user** | **user_id from session**, ignores any body user_id (§33); server time; dedup by UNIQUE |
| `store.checkOut(userId, photo)` | `POST /api/attendance/check-out` `{photo}` | user | |
| `store.attendanceForUser` | `GET /api/attendance/mine?from&to&page` | user | scoped to session user |
| `store.allAttendance` / summary | `GET /api/attendance?from&to&division_id&user_id&status&photo&page` | admin | |
| `store.remove('attendanceRecords', id)` | `DELETE /api/attendance/:id` | admin | consider soft delete (§37) |
| `store.startOvertime(userId, {description, photo})` | `POST /api/overtime/start` | user | window check server-side; dedup; **duration ignored from client (§16)** |
| `store.endOvertime(userId, {photo})` | `POST /api/overtime/end` | user | server recomputes `duration_ms = end-start` |
| `store.overtimeForUser` | `GET /api/overtime/mine` | user | |
| `store.allOvertime` / summary | `GET /api/overtime?…filters` | admin | `_syncOvertime` (auto-`kadaluarsa`) runs as a server-side sweep on read + optionally a cron |
| `store.approveOvertime(id, adminName)` | `POST /api/overtime/:id/approve` | admin (`overtime.approve`) | `approved_by_admin_id` from session, not body |
| `store.rejectOvertime(id, adminName, reason)` | `POST /api/overtime/:id/reject` `{reason?}` | admin | |
| `store.remove('overtimeRecords', id)` | `DELETE /api/overtime/:id` | admin | |
| `store.todosForUser` | `GET /api/todos/mine` | user | |
| `store.all('todos')` | `GET /api/todos?…` | admin | |
| (KPI, when built) | `GET/POST /api/kpi-settings`, `GET/POST /api/kpi-reports` | admin / user | user may only submit realisation for own reports |
| `store.getSystemSettings/save` | `GET /api/system-settings` (session), `PUT` (admin) | | |
| dashboards | `GET /api/dashboard/admin`, `GET /api/dashboard/user` | resp. | server aggregates |
| — | `GET /api/health` | public | `{app:"ok", db:"connected"}` — nothing sensitive |

**Every write endpoint:** authenticate → authorize (role or ownership) → validate → DB op
(in a transaction if multi-table) → safe JSON response. Errors return
`{error: "human message"}` + proper HTTP status; **never** a stack trace / SQL / password (§34).

---

## 7. Authorization model (brief §12–§13, §33, §49)

- **Ownership (users):** every "my data" endpoint derives `user_id` from the **session**, not
  the request body/query. `GET /api/attendance/mine` = `WHERE user_id = :session_user`.
  Passing another `user_id` is impossible to exploit — it's simply not read.
- **Record access:** `GET /api/photo`, `GET /api/overtime/:id` (user variant) check
  `row.user_id === session.user_id` before returning; otherwise `403`.
- **Admin endpoints:** `Guard::requireAdmin()` + the existing `PERMISSIONS` map from
  `auth.js` (ported to PHP `Guard`). A user session hitting `/api/users` → `403`.
- **Approval/rejection fields** (`status`, `duration_ms`, `approved_by`) are **only** settable
  by the dedicated admin endpoints — never via a generic PATCH.
- RBAC stays simple: `super_admin` is the only seeded admin role; the `PERMISSIONS` map is
  ready for `admin` / `manager` without code changes (brief §13 — don't over-build roles).

---

## 8. Concurrency & duplicate protection (brief §36)

Frontend button-disable is not trusted. Server guarantees:

| Action | DB-level guard |
|---|---|
| double check-in | `UNIQUE (user_id, attendance_date)` → 2nd insert throws → API returns "sudah absen masuk" |
| double check-out | `UPDATE … WHERE id=:id AND check_out_at IS NULL` → 0 rows affected → "sudah absen pulang" |
| double overtime start | `UNIQUE (user_id, overtime_date)` + `SELECT … status='berjalan' FOR UPDATE` inside a transaction |
| double overtime end | `UPDATE … WHERE id=:id AND status='berjalan' AND end_at IS NULL` → 0 rows → "sudah diselesaikan" |
| double KPI submit | `UNIQUE (user_id, kpi_setting_id, period)` |
| approve twice | `UPDATE … WHERE id=:id AND status='menunggu'` → 0 rows → "sudah diproses" |

Multi-table writes (future: Program → tasks → todos) run in `Db::transaction()` (§35).

---

## 9. Tabel fase berikutnya (DO NOT CREATE NOW — brief §8, §20–§23)

These features are **frame-only** in the app (no data, no store collection). Their tables are
added as migration files **when that feature's phase starts**. Proposed DDL, ready to drop in:

```sql
-- job_desks — uraian tugas per divisi ATAU per jabatan
CREATE TABLE `job_desks` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `scope` ENUM('division','position') NOT NULL,
  `division_id` BIGINT UNSIGNED NULL,
  `position_id` BIGINT UNSIGNED NULL,
  `title` VARCHAR(200) NOT NULL,
  `content` TEXT NOT NULL,
  `status` ENUM('active','inactive') NOT NULL DEFAULT 'active',
  `created_by_admin_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_jobdesk_division` (`division_id`), KEY `ix_jobdesk_position` (`position_id`),
  CONSTRAINT `fk_jobdesk_division` FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_jobdesk_position` FOREIGN KEY (`position_id`) REFERENCES `positions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- visits — Laporan Kunjungan
CREATE TABLE `visits` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `visit_date` DATE NOT NULL,
  `purpose` VARCHAR(255) NOT NULL,
  `location` VARCHAR(255) NOT NULL,
  `notes` TEXT NULL,
  `photo` VARCHAR(255) NULL,           -- storage path, not base64
  `checked_in_at` DATETIME NOT NULL,   -- server time
  `latitude` DECIMAL(10,7) NULL, `longitude` DECIMAL(10,7) NULL,
  `status` ENUM('submitted','reviewed') NOT NULL DEFAULT 'submitted',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`), KEY `ix_visits_user_date` (`user_id`,`visit_date`),
  CONSTRAINT `fk_visits_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- programs + link to todos (1 todo -> at most 1 program; use a junction table for many-to-many)
CREATE TABLE `programs` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(200) NOT NULL,
  `description` TEXT NULL,
  `division_id` BIGINT UNSIGNED NULL,
  `start_date` DATE NULL, `end_date` DATE NULL,
  `status` ENUM('draft','active','done','archived') NOT NULL DEFAULT 'draft',
  `created_by_admin_id` BIGINT UNSIGNED NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  CONSTRAINT `fk_programs_division` FOREIGN KEY (`division_id`) REFERENCES `divisions`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
-- then:  ALTER TABLE `todos` ADD COLUMN `program_id` BIGINT UNSIGNED NULL,
--        ADD CONSTRAINT `fk_todos_program` FOREIGN KEY (`program_id`) REFERENCES `programs`(`id`) ON DELETE SET NULL;
-- (do NOT build a second todo system — reuse `todos`, brief §22)

-- notifications
CREATE TABLE `notifications` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `type` VARCHAR(50) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `message` VARCHAR(500) NOT NULL,
  `reference_type` VARCHAR(40) NULL, `reference_id` BIGINT UNSIGNED NULL,
  `is_read` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `ix_notif_user_read` (`user_id`,`is_read`), KEY `ix_notif_user_created` (`user_id`,`created_at`),
  CONSTRAINT `fk_notif_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- todo_assignments — ONLY if Todo becomes multi-assignee (currently single)
CREATE TABLE `todo_assignments` (
  `todo_id` BIGINT UNSIGNED NOT NULL,
  `user_id` BIGINT UNSIGNED NOT NULL,
  `assigned_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`todo_id`,`user_id`),
  CONSTRAINT `fk_ta_todo` FOREIGN KEY (`todo_id`) REFERENCES `todos`(`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_ta_user` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

`audit_logs` (brief §38) — keep minimal, add only when needed:
`id, actor_type ENUM('admin','user','system'), actor_id, action VARCHAR(80), target_type,
target_id, meta JSON, created_at`. Written by admin approve/reject, jam-kerja changes,
employee-data changes. Not built now.

---

## 10. What still needs a real PHP + MySQL environment

This machine has **no PHP, no MySQL, no Node** (audit §2). Deliverable so far — audit, schema,
seed, migrations doc, `.env.example`, deployment doc — is complete and reviewable **without a
runtime**. The remaining stabilization work must be built and verified where PHP+MySQL run
(the hosting, or local XAMPP / Laragon / MAMP):

1. Write `api/**` (front controller, PDO layer, ~14 route files).
2. Refactor `assets/js/core/store.js` → `fetch` (same method names) and `auth.js` → `/api/auth/*`.
3. Move the selfie pipeline to file storage.
4. Run the brief's **§47 end-to-end**, **§48 database**, **§49 security**, **§50 upload**,
   **§51 performance** tests against the live DB.
5. Generate `docs/DATABASE.md` (per-table reference) from the built schema.

None of step 1–3 changes app behaviour — the frontend contract (`PG.store.*` names, screen
code) is preserved (brief §30, §46).
