# PREMIERE GROUP — Internal Team Management System

- **Phase 1** — Design System · Authentication · Navigation · Page Structure ·
  Database Foundation · Role/Access Control · Responsive Layout.
- **Phase 2** — **Manajemen Tim & Divisi** as full master data: CRUD for
  Karyawan / Divisi / Jabatan (add · edit · activate/deactivate · **delete karyawan**),
  username uniqueness + validation, and the matching **User App** screens
  (Profil Saya, Tim Saya, account menu + logout) on the same data source.
- **Technical Stabilization** — real backend. `assets/js/core/store.js` and
  `auth.js` now call a **plain-PHP 8 + PDO + MySQL** API under `api/` instead of
  `localStorage`. Server-side sessions, bcrypt admin password, CSRF, selfie files
  on disk (served only via authorized `/api/photo`). One import file:
  `database/db.sql`. See **`docs/DEPLOYMENT.md`**, **`docs/HOSTING-REQUIREMENTS.md`**,
  **`docs/PRODUCTION-ARCHITECTURE.md`**. The frontend UI is unchanged.

Two integrated interfaces on one shared data layer:

| Interface | Entry file | Layout | Login |
|-----------|-----------|--------|-------|
| **User App** (karyawan) | `index.html` | Mobile only, fixed bottom navigation | Username only |
| **Admin Panel** | `admin.html` | Responsive: sidebar (desktop) → drawer (≤1024px) | Password only |

---

## Running it

The app now needs the **PHP backend + MySQL**. There is still no build step and no
package manager.

**On a host (production):** follow **`docs/DEPLOYMENT.md`** — upload to `public_html/`,
create a MySQL DB, import `database/db.sql` in phpMyAdmin, copy `.env.example` → `.env`
and fill the DB creds, open `api/setup.php` once to set the admin password.

**Locally (XAMPP / MAMP / Laragon):** point a vhost's docroot at the project folder,
create a local MySQL DB + import `database/db.sql`, copy `.env.example` → `.env`
(`DB_*` + `APP_KEY`, and `SESSION_COOKIE_SECURE=false` for plain `http://localhost`),
then open `http://localhost/admin.html` and `http://localhost/index.html`.
`api/setup.php` (or `database/seed_dev.sql`) gets you a login.

> `tools/serve.ps1` / `Jalankan Premiere Group.bat` only serve static files and have
> **no PHP** — they are not enough anymore. Use XAMPP/MAMP or a real host.

**Credentials & seed data**

- Admin: username `admin`, password set via `api/setup.php` (ships with an empty,
  unusable hash — nothing insecure is committed).
- **No demo karyawan.** Create employees in Admin → Manajemen Tim & Divisi; their
  username can log into the User App immediately. `database/seed_dev.sql` adds three
  test employees for **local dev only**.
- Seed master data: 6 divisi, 3 jabatan — all editable in the Admin Panel.

> Assets carry a `?v=` query — bump it (currently `v=22`) whenever JS/CSS changes so
> browsers don't serve a stale cached copy.

---

## Architecture (after stabilization)

The frontend is still a **zero-build vanilla-JS SPA**. The persistence layer behind
the `PG.store` / `PG.auth` seam is now a real backend — no framework migration was
needed because screens only ever call that seam.

| Concern | Implementation |
|---|---|
| Backend | plain **PHP 8 + PDO**, `api/index.php` front controller, `api/routes/*.php` — no Composer, no ORM |
| Database | **MySQL / MariaDB**, `database/db.sql` (one import), numbered `database/migrations/` |
| `store.js` | read-through in-memory cache hydrated from `GET /api/bootstrap`; sync reads unchanged, writes are `POST/PATCH/DELETE` + re-hydrate |
| `auth.js` | server-side PHP sessions (opaque `HttpOnly` cookie), **bcrypt** admin password, `X-CSRF-Token` on writes; cached principal keeps the guards synchronous |
| Selfies | files under `storage/uploads/…`; DB stores the path; served only through authorized `GET /api/photo` |
| `PG.auth.can(permission)` | same map, **also** enforced server-side in `api/lib/Guard.php` |
| Hash router / `core/ui.js` | unchanged |

Screens **never touch `localStorage`** (there is none) and **never touch the DB
directly** — only `PG.store` / `PG.auth`, which call `/api`.

---

## Project structure

```
Premiere-Group/
├─ Jalankan Premiere Group.bat  double-click: start server + open both apps
├─ index.html                  User App entry
├─ admin.html                  Admin Panel entry
├─ tools/serve.ps1             static server (no Node needed)
├─ docs/DATA-MODEL.md          entities, relations, Prisma mapping
└─ assets/
   ├─ css/
   │  ├─ tokens.css            design system: color, spacing, radius, type, shadow
   │  ├─ base.css              reset + base elements
   │  ├─ components.css        reusable UI: button, card, badge, table, modal, empty state…
   │  ├─ user-app.css          mobile frame, header, bottom nav, screen styles
   │  └─ admin.css             sidebar/drawer, topbar, page shell, login
   └─ js/
      ├─ core/
      │  ├─ icons.js           inline-SVG icon set  →  PG.icon(name)
      │  ├─ store.js           API client + read-through cache  →  PG.store / PG.net
      │  ├─ auth.js            server-session auth, login/logout, RBAC + CSRF  →  PG.auth
      │  ├─ ui.js              DOM helpers + component builders  →  PG.ui
      │  ├─ camera.js          selfie capture overlay  →  PG.selfie({onConfirm})
      │  └─ router.js          hash router with guards  →  PG.createRouter
      ├─ user/
      │  ├─ pages.js           login · dashboard · absensi (2 tabs) · todo · kpi · profil · lapor-kpi · program · job-desk · kunjungan · rekap-absensi  →  PG.userPages
      │  └─ app.js             frame + bottom nav + routing
      └─ admin/
         ├─ pages.js           13 screens  →  PG.adminPages
         └─ app.js             shell + sidebar + routing
```

---

## What is functional vs. placeholder

**Functional (wired to the shared store):**

- Admin login (server-side **bcrypt** verify — no hash ever reaches the browser) + PHP session + logout
- User login (server username lookup + active-status check) + PHP session + logout
- Route guards + interface separation (a user session cannot open Admin Panel and vice versa)
- **Manajemen Tim & Divisi — full master data CRUD (Phase 2):**
  - **Karyawan** — add / edit / activate / deactivate / **delete (permanent, with confirm)**;
    search + filter by divisi / status; validation (nama, username unique + format, divisi,
    status); deactivate keeps all historical Todo / Absensi / KPI data; confirmation dialog on
    deactivate and delete.
  - **Divisi / Jabatan** — add / edit / activate / deactivate, unique-name validation,
    live member counts. No hardcoded lists — admin adds their own.
  - A username created here logs into the User App immediately (it is a row in the
    shared MySQL `users` table). The client cache re-hydrates from `/api/bootstrap`
    after every write and on window focus, so a change in the Admin tab shows up in an
    open User App tab on its next focus. Deactivating or deleting (soft-delete) a user
    ends any live session on the next server-checked request.
- **User App ← same data (Phase 2):** *Profil Saya* (nama, username, jabatan, divisi, status),
  *Tim Saya* (colleagues in the same divisi), and an **account menu** on the dashboard header
  (avatar → Profil Saya / Keluar) — all read live from the store.
- **Absensi — SELFIE-based, end-to-end (Phase 3):**
  - **Admin → Manajemen Absensi** — tabs **Jam Kerja** (Jam Masuk / Jam Pulang, default
    `08:00` / `21:00`) · **Jam Lembur** (Setting Jam Lembur — *Lembur Mulai* / *Lembur Selesai*,
    default `17:00` / `23:59`; lembur may only be **started** inside this window) · **Hari Kerja**
    · **Toleransi & Pengaturan** · **Hari Libur** (add / list / delete, excluded from work days).
  - **User App → Absensi** is split into **two in-screen pages** via a segmented control under
    the header: **"Absensi"** (check-in/out + riwayat + rekap) and **"Lembur"** (overtime).
    Switching tabs and every selfie action re-render locally — the active tab is kept.
  - **User App → Absensi (page Absensi)** — "**Selfie untuk Absen Masuk / Pulang**": front camera
    (`facingMode:"user"`) → live preview with face guide → capture → **Ambil Ulang / Gunakan
    Foto** → save. Photo is compressed (≤480 px, JPEG q0.6, ~5–15 KB) and **required** before
    submit. Handles camera unsupported / permission-denied / no-camera / capture errors without
    crashing. Check-in / check-out for the *authenticated* user only (`ctx.user.id`, never from
    input); the **timestamp is taken by the store** (`checkIn`/`checkOut`), never sent by the
    page. One check-in + one check-out per day; check-out needs a prior check-in; status:
    **Belum Absen → Hadir | Terlambat → Sudah Pulang**. A failed save (storage/persist error)
    returns an error and leaves **no** record — retry is safe, no duplicates.
  - **User App → Riwayat Absensi** — the user's own records: date, jam masuk + **foto masuk**
    thumbnail, jam pulang + **foto pulang** thumbnail, status (rows leaving early are tagged
    "Pulang cepat"). **Paginated 10 / page.** **Every row is tappable** → a *Detail Absensi*
    preview (status, jam masuk/pulang, durasi kerja, both selfies large → viewer); thumbnails
    still open the photo viewer directly. Above it, a **"Rekap Kehadiran Saya"** card mirrors
    the Admin summary for the employee's own data: Tepat Waktu · Terlambat · Pulang Cepat ·
    Total Jam Kerja.
  - **User App → Kalender Absensi** — the calendar icon in the Absensi header opens a month
    grid of the employee's own attendance, colour-coded per day (Tepat Waktu / Terlambat /
    Pulang Cepat / Tidak Absen / Libur), with month navigation, a legend, today highlighted,
    and tap-a-day → that day's *Detail Absensi*.
  - **Admin → Laporan Absensi** — Tanggal · Nama · Username · Divisi · Jam Masuk · **Foto Masuk**
    · Jam Pulang · **Foto Pulang** · Keterlambatan · Status · Aksi. **Every row is clickable**
    → a **Detail Absensi** modal: employee data (nama, username, divisi, jabatan), status,
    keterlambatan, both selfies shown large (click a selfie → full-screen viewer), server
    timestamps + record id. Row thumbnails still open the photo viewer directly for a quick
    peek. Filters: **rentang tanggal (Dari–Sampai)** / divisi / karyawan / status / **foto** (lengkap / kurang).
    - **Summary grid follows the filters** — 6 cards computed from the *filtered* set:
      **Rekap Total · Tepat Waktu · Terlambat · Sudah Pulang · Kabur · Total Jam Kerja**.
      *Kabur* = check-out earlier than the configured jam pulang; *Total Jam Kerja* = sum of
      check-in→check-out durations (`Xj Ym`).
    - **Pagination — 15 records per page** (`‹ Sebelumnya · Halaman X / Y · Berikutnya ›`);
      changing any filter jumps back to page 1.
    - **Aksi column**: a single icon-only **delete** (🗑 trash) button that removes an
      attendance record permanently (confirmation dialog first). Detail opens by clicking
      the row.
  - **User Dashboard** "Status Absensi" + **Admin Dashboard** "Hadir Hari Ini" / "Kehadiran Hari
    Ini" donut read real attendance (no hardcoded values).
  - Integration verified: Admin sets schedule → User App reads it live (cross-tab `storage`
    event) → User selfies in/out → record + photos stored → appears in Riwayat and Laporan
    Absensi with the photos. User A can never see or alter User B's records or photos; photos
    are keyed to `attendance_id` (not name/date) so they never swap.
  - **Old data preserved**: schema migrate v3→v4 adds `checkInPhoto`/`checkOutPhoto` = `null`
    to pre-selfie records without touching their other fields.
- **Lembur / Overtime — SELFIE-based, end-to-end (separate from attendance):**
  - **Status model** (`overtimeRecords.status`) — **only `disetujui` is counted; everything else
    is kept but not counted**:
    - **berjalan** — started, timer running. *Selesai Lembur* is available at any time (no admin
      approval, no time-window check on finishing).
    - **menunggu** — employee finished it (`endAt` + `durationMs` recorded); awaiting the admin.
    - **disetujui** — admin pressed **Terima** → accepted, its duration is counted.
    - **ditolak** — admin pressed **Tolak** → the record **stays** in both panels (still listed,
      still openable) but its hours are **not counted**; carries an optional `rejectionReason`.
    - **kadaluarsa** — the employee never pressed *Selesai Lembur* before the **Jam Lembur
      deadline** (`overtimeEnd`). The store auto-flips `berjalan → kadaluarsa` on the next read
      (`_syncOvertime`); the record **stays** but is **not counted** and can no longer be finished.
  - **User App → Absensi (page Lembur)** — a window strip (Lembur Mulai / Selesai + "di dalam /
    di luar jam lembur"), then **Lembur Hari Ini**: *Belum Ada Lembur* → **Ajukan / Mulai
    Lembur** (disabled + hint outside the configured Jam Lembur window) → keterangan (required)
    → front-camera selfie → **Sedang Lembur** with a live timer and an **always-active Selesai
    Lembur button** (finishable any time, never gated by admin; a lembur past midnight is still
    finishable via `store.openOvertime`), plus a **deadline hint** ("Tekan *Selesai Lembur*
    sebelum HH:MM …"). Second selfie → **menunggu** → later *Lembur Disetujui* (green) /
    *Lembur Ditolak* (red, with alasan) / *Lembur Kadaluarsa* (grey). One running overtime per
    user at a time; `startAt`/`endAt` are server timestamps; **duration computed by the store**.
    HTML `<head>` carries `no-cache/no-store` meta tags (dev server already sends
    `Cache-Control: no-store`) so a hard-refresh always pulls the current build.
  - **User App → "Riwayat Lembur"** — the user's own overtime, paginated 10/page, **rejected and
    expired records stay listed** with their badge (`Ditolak` / `Kadaluarsa`) and a
    "tidak dihitung" note; rows tappable → *Detail Lembur* (keterangan, jam, durasi +
    `· dihitung / · menunggu / · tidak dihitung / kadaluarsa`, alasan penolakan, both selfies).
    User Dashboard shows "Sedang Lembur sejak HH:MM" / "…menunggu persetujuan admin" / "Lembur
    hari ini ditolak / kadaluarsa — tidak dihitung" / "Lembur dihitung bulan ini: `Xj Ym`".
  - **Admin → sidebar → Attendance → "Laporan Lembur"** — filters (**rentang tanggal Dari–
    Sampai** / divisi / karyawan / status: berjalan / menunggu / disetujui / **ditolak** /
    **kadaluarsa**); 7 summary cards from the *filtered* set (**Total · Sedang Berjalan ·
    Menunggu Persetujuan · Disetujui · Ditolak · Kadaluarsa · Total Durasi Dihitung** — durasi
    counts *disetujui* only); table (… Durasi · Status · **Aksi**); **pagination 15 rows/page**;
    thumbnails → photo viewer.
  - **Approval + delete** — the **Aksi** column has **inline Terima / Tolak** on every *menunggu*
    row plus a **🗑 delete icon on every row** (any status); the whole row also opens *Detail
    Lembur*. **Terima** = `store.approveOvertime` → `disetujui`. **Tolak** opens a modal with an
    **optional alasan** → `store.rejectOvertime(id, admin, reason)` → status `ditolak` (record
    kept, `approvedBy`/`approvedAt` + `rejectionReason` stored, acts only on `menunggu`). **🗑** =
    `store.remove("overtimeRecords", id)` — permanent housekeeping delete of *any* row.
  - **Admin Dashboard** — the **"Lembur Hari Ini"** panel shows Sedang Berjalan / Menunggu /
    Disetujui / Ditolak / Kadaluarsa counts + total durasi *dihitung* today + link to the report.
  - **Security**: overtime `userId` is always the authenticated id; `overtimeForUser` returns
    own records only; the User App has no overtime-admin UI and the `/laporan-lembur` route is
    admin-only. No store API can edit a saved overtime's photos/time/duration/status — only
    `approveOvertime` / `rejectOvertime` / `remove` (admin) and the automatic `berjalan →
    kadaluarsa` expiry. `startOvertime` re-validates the Jam Lembur window server-side and
    refuses a second start while one is still running.
  - **Non-destructive**: migrate **v5→v6** adds `overtimeStart`/`overtimeEnd`; **v6→v7** remaps
    the status model; **v7→v8** (historical) dropped `ditolak` rows; **v8→v9** re-introduces the
    `rejectionReason` field + `ditolak`/`kadaluarsa` states and heals any `menunggu`-without-`endAt`.
    `attendanceRecords` untouched. Attendance flows verified intact.
- **Pengaturan → Profil Perusahaan** — company name / timezone persist.
- Admin Dashboard stat cards + "Todo by priority" computed from live store data.

**Structure + empty state / "next phase" notice (by design — brief defers this logic):**

- Todo workflow (create/assign/track), KPI calculation, Laporan KPI, Setting KPI, and the
  non-profile Pengaturan sections.
- **Company quick-access modules (User App Dashboard "Akses Cepat" — frames only, no store
  writes / schema changes yet; wired per future phase directives):**
  - **Profil Saya** — unchanged (real data, Phase 2).
  - **Lapor KPI** (`/lapor-kpi`) — user submits a KPI report to Admin; the form is to follow
    Admin's *Setting KPI*. Frame: disabled form skeleton + empty riwayat + notice.
  - **Program** (`/program`) — programs defined by Admin, to be linked into the Todo List.
    Frame here + new Admin page **Program** (Work Management group, `/program`).
  - **Job Desk** (`/job-desk`) — task descriptions per divisi / jabatan, managed by Admin.
    Frame here (shows the user's divisi/jabatan) + new Admin page **Job Desk** (Organization
    group, `/job-desk`).
  - **Kunjungan** (`/kunjungan`) — user files field-visit reports. Frame here + new Admin page
    **Laporan Kunjungan** (Work Management group, `/laporan-kunjungan`).
  - **Rekapan Absensi** (`/rekap-absensi`) — chart recap of attendance + overtime, filterable
    by period. Frame: period tabs + placeholder donut/legend + notice. User-App only.
  - *Tim Saya* (Phase 2) is retired from the grid; `pages.tim` stays in the file, unrouted.

---

## Design system

| Token | Value | Use |
|---|---|---|
| Primary Blue | `#218DAE` | sidebar, primary buttons, table headers, links, active nav |
| Secondary Yellow | `#FFD758` | primary CTAs (User App), key action buttons, active accents |
| White | `#FFFFFF` | surfaces |
| Neutrals | greys | background, borders, secondary text, dividers, disabled — support only |

All spacing, radius, typography and shadow come from CSS custom properties in
`assets/css/tokens.css`. Both interfaces consume the same tokens and the same component
CSS, so Admin Panel and User App read as one product.

---

## Roles / access control

`PG.auth.ROLES` = `super_admin · admin · manager · kepala_divisi · supervisor · staff`.
Phase 1 exercises `super_admin` (Admin Panel) and `staff` (User App). Every screen checks
access through `PG.auth.can(permission)` against the `PERMISSIONS` map in `core/auth.js`,
so adding the intermediate roles is a data change, not a code change.
