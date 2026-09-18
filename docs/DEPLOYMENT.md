# PREMIERE GROUP — DEPLOYMENT

Practical guide for putting Premiere Group on a **cPanel shared host** with
**MySQL/MariaDB + phpMyAdmin**. **You do the upload** — this doc is your checklist.

## Your workflow (the short version)

1. **Upload the web app** — copy the project files into cPanel → File Manager →
   `public_html/` (so `public_html/index.html`, `public_html/admin.html`,
   `public_html/assets/…`, `public_html/api/…`).
2. **Create the database** — cPanel → MySQL Databases → new database + new DB user,
   attach the user to the database.
3. **Import `database/db.sql`** — cPanel → phpMyAdmin → select the database →
   **Import** → choose `db.sql` → Go. *(That one file = all tables + starter data.)*
4. **Point the app at your database** — edit `.env` (copied from `.env.example`) with
   the cPanel DB **name / user / password** you just created.
5. **Set the admin password** — see step 5 below.

Only `db.sql` is imported. Only what is under `public_html/` needs to be uploaded —
`docs/`, `database/seed_dev.sql`, and `database/migrations/` are for you, not the server
(harmless if uploaded, just unnecessary).

> **State of play (2026-09-01):** the full stack is in the repo and wired end to end —
> `database/db.sql`, the PHP backend under `api/`, the API-backed frontend
> (`assets/js/core/store.js` + `auth.js` now talk to `/api`, no localStorage), `.env.example`,
> the root + `storage/` `.htaccess`, and these docs. All 5 steps below are live.
> The PHP backend could not be executed on the build machine (no PHP/MySQL there) — run
> the brief §47–§49 test list on your host or a local XAMPP/MAMP once uploaded.

---

## 1. Hosting requirements

| Item | Minimum | Notes |
|---|---|---|
| PHP | **8.1+** | `pdo_mysql`, `gd` (or `imagick`), `mbstring`, `json`, `fileinfo`, `openssl` extensions |
| MySQL / MariaDB | MySQL **5.7+** or MariaDB **10.3+** | InnoDB default, `utf8mb4` |
| phpMyAdmin | any recent | for import / backup / restore |
| Web server | Apache (`.htaccess` / `mod_rewrite`) or LiteSpeed | Nginx: translate the rewrite rules |
| HTTPS | required | selfie camera needs a secure context; session cookie is `Secure` |
| Disk | ~200 MB + selfie growth | ~15–40 KB per selfie photo |
| `max_upload_filesize` / `post_max_size` | ≥ 4 MB | photos are capped at 2 MB by the app |
| Writable path | one folder for `storage/` | ideally above `public_html` |
| Cron (optional) | 1×/hour | overtime auto-`kadaluarsa` sweep (also runs lazily on read) |

**Not required:** Node.js, npm, Composer (plain-PHP build). If Composer is available and you
opt for Slim, add `composer install` before upload.

---

## 2. Create the database (phpMyAdmin)

1. cPanel → **MySQL® Databases** → create database `USER_premiere` (cPanel prefixes it).
2. Create a DB user, e.g. `USER_premapp`, with a strong password.
3. **Add the user to the database** with privileges:
   `SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX, REFERENCES`
   (grant `DROP` only while migrating; revoke after). Do **not** grant `ALL`/`SUPER`.

## 3. Import `db.sql`

1. phpMyAdmin → select your database → **Import** tab.
2. Choose **`database/db.sql`** → **Go**. Creates all 15 tables + starter master data
   (6 divisions, 3 jabatan, singleton settings) + the admin row (empty password) +
   registers migration `2026_09_01_000001_initial`.
3. Safe to re-run — every statement uses `IF NOT EXISTS` / `ON DUPLICATE KEY UPDATE`.
4. **Do NOT import `database/seed_dev.sql` on the live site** — that is local test data.

Verify:
```sql
SHOW TABLES;                              -- 15 rows
SELECT * FROM schema_migrations;          -- 2026_09_01_000001_initial
SELECT id, name FROM divisions;           -- 6 rows
SELECT id, username, password_hash FROM admins;   -- 1 row, password_hash empty
```

## 4. Point the app at your database (`.env`)

1. In File Manager, copy **`.env.example`** → **`.env`** (keep it next to `api/`).
2. Fill in the 5 that matter:
   - `APP_ENV=production` · `APP_DEBUG=false` · `APP_URL=https://your-domain`
   - `DB_HOST=localhost` · `DB_DATABASE=` · `DB_USERNAME=` · `DB_PASSWORD=`
     → the **cPanel** database name / user / password from step 2 (cPanel prefixes them,
     e.g. `myacct_premiere` / `myacct_premapp`).
   - `APP_KEY=` → 32 random hex chars (`php -r "echo bin2hex(random_bytes(32));"`, or any
     64-char hex string).
3. `.env` must not be downloadable over the web. The `api/.htaccess` shipped with the
   backend denies it; on File-Manager-only hosting, also `chmod 600 .env`.

## 5. Set the admin password (brief §10, §45)

`db.sql` created the admin as `username = admin` with an **empty** `password_hash` —
login stays disabled (an empty string never matches bcrypt), so nothing insecure ships.
Set a real password one of two ways:

- **Setup page (recommended):** open **`https://your-domain/api/setup.php`** once. It sets
  the bcrypt password, refuses to run again once any admin has a password, and writes
  `storage/.setup-lock`. Delete `api/setup.php` afterwards if you like.
- **One SQL line:** generate a bcrypt hash —
  `php -r "echo password_hash('YOUR_STRONG_PASSWORD', PASSWORD_BCRYPT), PHP_EOL;"` —
  then in phpMyAdmin:
  ```sql
  UPDATE `admins` SET `password_hash` = '$2y$10$....PASTE....' WHERE `username` = 'admin';
  ```

## 6. Files & folders on the server

```
public_html/
├─ index.html   admin.html
├─ assets/ …                     ← unchanged frontend
├─ api/                          ← PHP backend (plain PHP 8 + PDO, no Composer)
│  ├─ index.php                  front controller — every /api/* route
│  ├─ setup.php                  one-time admin-password page (delete after use)
│  ├─ lib/  routes/              internals (blocked by api/.htaccess)
│  └─ .htaccess                  routes virtual /api/* → index.php; blocks lib/ routes/ *.env *.sql
├─ .htaccess                     ← root hardening (hides database/ docs/ tools/ *.sql *.md)
├─ .env                          ← you create this (step 4). NOT .env.example.
└─ storage/                      ← selfie files + PHP sessions (dirs shipped, contents git-ignored)
   ├─ uploads/attendance/YYYY/MM/…
   ├─ uploads/overtime/YYYY/MM/…
   ├─ sessions/   cache/
   └─ .htaccess                  Require all denied  (photos only via /api/photo)
```

- `storage/` needs to be **writable** by PHP (`chmod 755`, or `775`/`777` if the host runs
  PHP as a different user — check with your host). It can also live **above** `public_html`
  if your plan allows it (set `UPLOAD_DIR` to that absolute path in `.env`) — slightly safer,
  but the `.htaccess` deny rule makes the in-`public_html` layout fine too.
- **Do not upload:** `docs/`, `database/seed_dev.sql`, `database/migrations/` — not needed to
  run. `database/db.sql` is only used once, in phpMyAdmin (not served).

## 7. Configure & smoke-test

| Test | How | Expect |
|---|---|---|
| DB connection | open `https://your-domain/api/health` | `{"ok":true,"database":"up",...}` |
| Set admin pw | open `https://your-domain/api/setup.php` | "Password admin berhasil dibuat" |
| Admin login | open `admin.html`, log in | Dashboard loads |
| Create employee | Admin → Manajemen Tim & Divisi → add | row in `users` (phpMyAdmin) |
| User login | `index.html`, that username | Dashboard loads |
| Absensi | User → Absensi → Selfie masuk | row in `attendances`, file in `storage/uploads/attendance/…`, path in `check_in_photo` |
| Selfie pulang | User → Selfie pulang | `check_out_at` / `check_out_photo` filled |
| Laporan Absensi | Admin → Laporan Absensi | the row + thumbnail visible |
| Lembur | User start → selfie → end → selfie | row in `overtimes`, 2 files, `status='menunggu'` |
| Approve | Admin → Laporan Lembur → Terima | `status='disetujui'`, `approved_by_admin_id`, `approved_at` set |
| Isolation | log in as User B, hit `/api/photo?...&id=<User A record>` | `403` |

Run the full brief §47–§49 test list here (it needs the live DB).

## 8. Backup (brief §39)

**Manual (phpMyAdmin):** select the database → **Export** → *Custom* → format **SQL**,
tick *Add DROP TABLE*, *IF NOT EXISTS*, structure **and** data → **Go** → save the `.sql`.
Also copy the `storage/uploads/` folder (the DB only holds paths).

**Scheduled:** cPanel → *Backup* / *Backup Wizard* for full account backups, or a cron:
```
0 3 * * *  mysqldump -u USER_premapp -p'PASS' USER_premiere | gzip > ~/backups/premiere_$(date +\%F).sql.gz
```

## 9. Restore

1. phpMyAdmin → (optionally drop existing tables) → **Import** the backup `.sql`.
2. Restore `storage/uploads/` from its copy.
3. Verify `SELECT * FROM schema_migrations;` matches the app's migration list.

## 10. Applying future migrations

**Automatic.** On its first request after you upload new files, the API applies any
`database/migrations/*.sql` that is not yet recorded in `schema_migrations` (each
statement is idempotent, "already exists" errors are ignored, and the marker is
recorded). So the update flow is just: **upload the new files → done.**

For this to work the DB user needs `CREATE, ALTER, INDEX, REFERENCES` in addition to
`SELECT/INSERT/UPDATE/DELETE` (see step 2). If you prefer to keep the DB user on
CRUD-only, revoke those and instead import each new `database/migrations/*.sql` by
hand in phpMyAdmin after an update — the app logs which one it could not apply.
Back up before any schema change either way.

## 11. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `/api/health` → `db: error` | wrong `.env` DB creds / user not attached to DB | re-check cPanel MySQL user privileges |
| 500 on every `/api` call, blank page | `APP_DEBUG=false` hiding the error | check `error_log` in cPanel; set `APP_DEBUG=true` **temporarily** on a staging copy |
| Selfie upload fails | `UPLOAD_DIR` not writable / `gd` missing / `post_max_size` too small | `chmod 750`, enable `gd` in *MultiPHP INI Editor*, raise limits |
| Camera never opens | site not on HTTPS | enable SSL (AutoSSL / Let's Encrypt) |
| Login works then drops immediately | session dir not writable / cookie `Secure` on plain HTTP | ensure HTTPS in production; for **local http** testing set `SESSION_COOKIE_SECURE=false` in `.env` |
| `419` on every save / "Sesi tidak valid" | CSRF token not picked up | hard-reload the page (the token is fetched at boot via `GET /api/auth/me`) |
| Times off by 8 hours | PHP tz not set / `SET time_zone` missing | `date_default_timezone_set('Asia/Makassar')` + `SET time_zone='+08:00'` per connection |
| "karyawan baru tak bisa login" | opening files via `file://` instead of the domain | always use `https://your-domain`, never open the `.html` directly |
| Import fails on `CHECK` constraint | MySQL < 8.0.16 (CHECK is parsed but ignored) | harmless — the singleton is also enforced by the app |
