# PREMIERE GROUP — HOSTING REQUIREMENTS

What the server must provide to run the app. Target: **cPanel-style shared
hosting** with **Apache/LiteSpeed + MySQL/MariaDB + phpMyAdmin**. No Node, no
Composer, no build step.

Items marked **[VERIFY]** depend on your specific plan — check them in cPanel
(*Server Information*, *MultiPHP INI Editor*, *Select PHP Version*) or ask the host.

---

## 1. PHP

| Requirement | Value |
|---|---|
| Version | **8.1 or newer** (`declare(strict_types=1)`, `match`, `never`, `str_starts_with` are used) |
| SAPI | Apache module, LiteSpeed, or PHP-FPM — all fine |
| `display_errors` | off in production (the app forces it off anyway) |
| `session.save_path` | must be writable; the app points it at `storage/sessions/` when possible |

### Required PHP extensions

| Extension | Used for | If missing |
|---|---|---|
| `pdo_mysql` | all database access | app cannot start (`/api/health` → `database: down`) |
| `gd` | validate + re-encode + downscale selfie photos | selfie upload returns a clear 500 ("Server tidak memiliki ekstensi GD") |
| `mbstring` | `mb_strlen` length checks in validation | fatal on write endpoints |
| `json` | request/response encoding | fatal (bundled with PHP 8 by default) |
| `fileinfo` / `getimagesizefromstring` | MIME sniffing of uploaded images | selfie upload rejects everything |
| `openssl` / `random_bytes` | CSRF tokens, session id, upload filenames | fatal (CSPRNG is core in PHP 7+) |

`imagick` is **not** required (GD is enough). **[VERIFY]** that `gd` is enabled for the
PHP version you select — on cPanel: *Select PHP Version* → Extensions → tick `gd`.

---

## 2. Database

| Requirement | Value |
|---|---|
| Engine | **MySQL 5.7+** or **MariaDB 10.3+** |
| Storage engine | InnoDB (foreign keys) — the default |
| Charset / collation | `utf8mb4` / `utf8mb4_unicode_ci` (set by `db.sql`) |
| Privileges for the app user | `SELECT, INSERT, UPDATE, DELETE` — **plus** `CREATE, ALTER, INDEX, REFERENCES` if you want the app to auto-apply new migrations on update (recommended for a small internal app) |
| Privileges for the import (once) | the same `CREATE, ALTER, INDEX, REFERENCES` are needed to import `db.sql`; keep them if you want auto-migration, or revoke and apply future `database/migrations/*.sql` by hand |
| `sql_mode` | app tolerates strict mode; `db.sql` sets `NO_AUTO_VALUE_ON_ZERO` for the import |
| Time zone | app runs `SET time_zone = '+08:00'` per connection — **no** need for named-zone tables |

**[VERIFY]** max connections / `max_user_connections` — the app uses one connection
per request, so the default is fine for a small team.

---

## 3. Web server

| Requirement | Value |
|---|---|
| Apache `mod_rewrite` **or** LiteSpeed rewrite | needed for `api/.htaccess` (routes `/api/*` → `index.php`) |
| `AllowOverride` | must permit `.htaccess` (standard on cPanel) |
| `mod_headers` | optional — enables the security/cache headers in the root `.htaccess` |
| Nginx | not typical on cPanel; if used, translate `api/.htaccess` to a `location /api/ { try_files ... /api/index.php; }` block |

---

## 4. HTTPS / SSL

| Requirement | Why |
|---|---|
| **Valid TLS certificate** (AutoSSL / Let's Encrypt) | the selfie camera (`getUserMedia`) only works in a secure context; the session cookie is sent with `Secure` |
| HTTP → HTTPS redirect | recommended — a commented rule is in the root `.htaccess` |

For **local** testing over `http://localhost`, set `SESSION_COOKIE_SECURE=false` in `.env`
(never on the live site).

---

## 5. Filesystem

| Path | Permission | Notes |
|---|---|---|
| `storage/` and everything under it | **writable by PHP** | `755` if PHP runs as your user (typical suPHP/FPM); `775`/`777` only if the host runs PHP as `nobody` — **[VERIFY]** with the host |
| `storage/uploads/attendance/`, `storage/uploads/overtime/` | writable | created automatically (`YYYY/MM/` subfolders) |
| `storage/sessions/`, `storage/cache/` | writable | PHP session files + future cache |
| `.env` | `600` if possible | also denied by `.htaccess`; never web-readable |
| everything else | read-only for PHP | app never writes outside `storage/` |

`storage/` may live **above** `public_html/` — set `UPLOAD_DIR` in `.env` to that absolute
path. The shipped `storage/.htaccess` (`Require all denied`) makes the in-`public_html`
layout safe too.

---

## 6. Upload limits (PHP INI)

| Setting | Minimum | App-side cap |
|---|---|---|
| `upload_max_filesize` | 4M | photos are re-encoded and hard-capped at **2 MB** (`UPLOAD_MAX_BYTES`) |
| `post_max_size` | 8M | selfies are sent as a base64 JSON body, ~1.3× the raw bytes |
| `memory_limit` | 128M | GD decode of a ≤2 MB image + 480px re-encode fits easily |
| `max_execution_time` | 30 | one upload + DB write is well under this |

**[VERIFY]** in *MultiPHP INI Editor*. If a host sets `post_max_size` very low (e.g. 2M),
raise it or selfies will fail silently with an empty `$_POST`.

---

## 7. Environment variables (`.env`)

Copy `.env.example` → `.env`. Keys that must be set for production:

| Key | Set to |
|---|---|
| `APP_ENV` | `production` |
| `APP_DEBUG` | `false` |
| `APP_URL` | `https://your-domain` |
| `APP_TIMEZONE` | `Asia/Makassar` |
| `APP_KEY` | 32 random bytes hex — `php -r "echo bin2hex(random_bytes(32));"` |
| `DB_HOST` | usually `localhost` |
| `DB_DATABASE` / `DB_USERNAME` / `DB_PASSWORD` | the cPanel DB you created (names are prefixed, e.g. `acct_premiere`) |
| `SESSION_LIFETIME_MIN` | `10080` (7 days) or your policy |
| `SESSION_COOKIE_SECURE` | `true` (production) / `false` (local http only) |
| `SESSION_COOKIE_SAMESITE` | `Lax` |
| `UPLOAD_DIR` | absolute path to a writable folder, or leave blank to use `storage/uploads` |
| `UPLOAD_MAX_BYTES` | `2097152` |
| `CORS_ALLOWED_ORIGINS` | blank (app + API are same-origin). Only set if you serve the frontend from a different host. |

---

## 8. Optional: cron

The "overtime past its deadline → `kadaluarsa`" sweep runs **lazily** on every overtime
read and on `/api/bootstrap`, so a cron is not required. If you want it to happen even
with no traffic, add one hourly hit:

```
0 * * * *  curl -s "https://your-domain/api/bootstrap" -o /dev/null
```
(or call a dedicated sweep script if you add one later).

---

## 9. Not required

Node.js, npm, Yarn · Composer / PHP package manager · a build/CI step ·
Redis / Memcached · a message queue · `imagick` · shell/SSH access
(File Manager + phpMyAdmin are enough).
