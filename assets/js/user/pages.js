/* ============================================================
   PREMIERE GROUP — User App screens
   Each screen is a factory: fn(ctx) -> DOM node.
   Phase 1 = layout + components + navigation + placeholders.
   Business logic (real check-in, todo workflow, KPI math) is
   deliberately deferred and surfaced via "next phase" notices.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;
  var pages = {};

  function nextPhase(feature) {
    ui.toast('"' + feature + '" akan diaktifkan pada tahap berikutnya.');
  }

  /* Header bell + unread badge → opens the in-app notification center. */
  function notifBell(ctx) {
    var badge = h("span", { class: "pg-notifbadge", hidden: true });
    var btn = h("button", { class: "pg-uheader__iconbtn pg-bell", "aria-label": "Notifikasi",
      onclick: function () { ui.notifCenter({ onNavigate: function (link) { ctx.router.go(link); } }); } },
      svg("bell"), badge);
    function sync() {
      var n = (PG.store.unreadNotifCount && PG.store.unreadNotifCount()) || 0;
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n === 0;
      btn.classList.toggle("has-unread", n > 0);
    }
    sync();
    var onCh = function () { if (btn.isConnected) sync(); };
    document.addEventListener("pg:store-changed", onCh);
    return btn;
  }

  /* Paint the uploaded photo onto an avatar/clock element. Uses the store's
     authenticated photo cache (store.photoObjectUrl) — a bare <img src="api/…">
     is NOT reliable: some mobile / installed-PWA contexts don't send the session
     cookie on sub-resource loads, so it 401s and only ever shows initials. The
     cache fetches once (with credentials) and hands back the same object URL
     synchronously on every later render, so the photo shows instantly and stays.
     Initials sit underneath; if the fetch/decode fails they show through. */
  function paintAvatarPhoto(el, photoUrl, name) {
    if (!el || !photoUrl) return;
    var mkImg = function (src) {
      var img = h("img", { src: src, alt: name || "Foto profil", decoding: "async" });
      img.onerror = function () { img.remove(); };
      return img;
    };
    var ready = PG.store.photoObjectUrlReady(photoUrl);
    if (ready) {
      // sync cache hit — el is being built and will be mounted; attach now
      if (!el.querySelector("img")) el.appendChild(mkImg(ready));
      return;
    }
    PG.store.photoObjectUrl(photoUrl).then(function (src) {
      if (!src || !el.isConnected || el.querySelector("img")) return;
      el.appendChild(mkImg(src));
    }).catch(function () {});
  }

  /* Avatar for an employee (initials + uploaded photo, see paintAvatarPhoto). */
  function userAvatar(u, size, opts) {
    opts = opts || {};
    var px = (size || 40) + "px";
    var attrs = {
      class: "pg-avatar" + (opts.class ? " " + opts.class : ""),
      style: Object.assign({ width: px, height: px, fontSize: Math.round((size || 40) * 0.36) + "px" }, opts.style || {})
    };
    if (opts.onClick) { attrs.onclick = opts.onClick; attrs["aria-label"] = opts.label || "Akun Saya"; }
    var el = h(opts.onClick ? "button" : "div", attrs);
    el.appendChild(h("span", { class: "pg-avatar__i", text: ui.initials(u && u.fullName) }));
    if (u && u.photoUrl) paintAvatarPhoto(el, u.photoUrl, u.fullName);
    return el;
  }

  // Account sheet: reached from the dashboard header avatar. Holds Profil + Logout.
  function openAccountMenu(ctx) {
    var u = PG.auth.currentUser() || ctx.user;
    var m = ui.modal({
      title: "Akun Saya",
      body: [
        h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
          userAvatar(u, 46),
          h("div", null,
            h("div", { class: "pg-strong", text: u.fullName }),
            h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + u.username })
          )
        ),
        ui.button({ label: "Notifikasi", variant: "ghost", block: true, icon: "bell",
          onClick: function () { m.close(); ui.notifCenter({ onNavigate: function (link) { ctx.router.go(link); } }); } }),
        ui.button({ label: "Profil Saya", variant: "ghost", block: true, icon: "user",
          onClick: function () { m.close(); ctx.router.go("/profil"); } }),
        ui.button({ label: "Keluar dari aplikasi", variant: "danger", block: true, icon: "logout",
          onClick: function () {
            m.close();
            ui.confirm({
              title: "Keluar dari aplikasi", confirmLabel: "Keluar", tone: "danger",
              message: "Anda yakin ingin keluar? Anda perlu memasukkan username lagi untuk masuk.",
              onConfirm: function () { PG.auth.logout(); ctx.router.replace("/login"); }
            });
          } })
      ]
    });
  }

  /* ---------- shared: page shell with in-flow header ---------- */
  function screen(headerNode, bodyNodes, pull) {
    var pullCls = pull === true ? " pg-uscreen--pull"
      : (typeof pull === "string" && pull ? " " + pull : "");
    return h("div", { class: "pg-user__scroll" },
      headerNode,
      h("div", { class: "pg-uscreen" + pullCls }, bodyNodes)
    );
  }
  function titleHeader(title, actionIcon, onAction) {
    // actionIcon may be an icon-name string (wrapped in a button) or a ready
    // DOM node (rendered as-is) — or falsy for no action.
    var action = null;
    if (actionIcon && actionIcon.nodeType) action = actionIcon;
    else if (actionIcon) action = h("button", { class: "pg-uheader__iconbtn", onclick: onAction || function () {}, "aria-label": title }, svg(actionIcon));
    return h("header", { class: "pg-uheader pg-uheader--tight" },
      h("div", { class: "pg-uheader__top" },
        h("div", { class: "pg-uheader__title", text: title }),
        action
      )
    );
  }
  // Header with a back arrow (for sub-screens opened from the dashboard).
  // `action` (optional) is a ready DOM node rendered on the right — e.g. a
  // pill button — in place of the plain spacer every other caller still gets.
  function backHeader(ctx, title, backPath, action) {
    return h("header", { class: "pg-uheader pg-uheader--tight" },
      h("div", { class: "pg-uheader__top" },
        h("button", { class: "pg-uheader__iconbtn", "aria-label": "Kembali",
          onclick: function () { ctx.router.go(backPath || "/dashboard"); } }, svg("chevronLeft")),
        h("div", { class: "pg-uheader__title", style: { flex: "1" }, text: title }),
        action || h("span", { style: { width: "38px" } })
      )
    );
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  pages.login = function (ctx) {
    var input = h("input", { class: "pg-input", type: "text", placeholder: "Masukkan username Anda",
      autocapitalize: "none", autocorrect: "off", spellcheck: false });
    var err = h("div", { class: "pg-ulogin__error", style: { display: "none" } });

    function submit(e) {
      e && e.preventDefault();
      err.style.display = "none";
      var btn = e && e.target ? e.target.querySelector("button[type=submit]") : null;
      if (btn) { btn.disabled = true; }
      PG.auth.userLogin(input.value).then(function (res) {
        if (!res.ok) {
          if (btn) btn.disabled = false;
          err.textContent = res.error; err.style.display = "block";
          return;
        }
        PG.store.hydrate().then(function () { ctx.router.replace("/dashboard"); });
      });
    }

    return h("form", { class: "pg-ulogin", onsubmit: submit },
      h("div", { class: "pg-ulogin__brand" },
        h("div", { class: "pg-ulogin__logo" }, ui.brandLogo({ size: 46 })),
        h("div", { class: "pg-ulogin__name", text: "PREMIERE GROUP" }),
        h("div", { class: "pg-ulogin__tag", text: "TEAM MANAGEMENT" })
      ),
      h("div", { class: "pg-ulogin__card" },
        h("div", null,
          h("h2", { text: "Masuk Aplikasi", style: { fontSize: "18px" } }),
          h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "4px" },
            text: "Gunakan username yang diberikan oleh Admin." })
        ),
        h("div", { class: "pg-field" },
          h("label", { class: "pg-field__label", text: "Username" }),
          input
        ),
        err,
        ui.button({ label: "Masuk", variant: "accent", block: true, type: "submit" }),
        h("div", { class: "pg-field__hint", text: "Username dibuat oleh Admin di menu Manajemen Tim." })
      ),
      h("div", { class: "pg-ulogin__foot" },
        "Khusus karyawan Premiere Group · ",
        h("a", { href: "admin", text: "Admin Panel" })
      )
    );
  };

  /* ============================================================
     DASHBOARD
     ============================================================ */
  pages.dashboard = function (ctx) {
    var u = ctx.user;
    var myTodos = PG.store.todosForUser(u.id);
    var activeTodos = myTodos.filter(function (t) { return t.status !== "done"; }).length;
    var doneTodos = myTodos.filter(function (t) { return t.status === "done"; }).length;
    var overdueTodos = myTodos.filter(function (t) {
      return t.deadline && t.status !== "done" && t.deadline < PG.store.dateKey();
    }).length;

    var header = h("header", { class: "pg-uheader pg-uheader--home" },
      h("div", { class: "pg-uheader__top" },
        h("div", { class: "pg-uheader__brand" },
          ui.brandLogo({ size: 32, class: "pg-uheader__logo" }),
          h("span", { class: "pg-uheader__brandtext", text: "PREMIERE GROUP" })),
        h("div", { style: { display: "flex", alignItems: "center", gap: "10px" } },
          (PG.pwa ? PG.pwa.installButton({ class: "pg-pwa-btn--compact" }) : null),
          notifBell(ctx),
          h("button", { class: "pg-uheader__iconbtn pg-uheader__logout", type: "button",
            "aria-label": "Keluar dari aplikasi", title: "Keluar dari aplikasi",
            onclick: function () {
              ui.confirm({
                title: "Keluar dari aplikasi", confirmLabel: "Keluar", tone: "danger",
                message: "Anda yakin ingin keluar? Anda perlu memasukkan username lagi untuk masuk.",
                onConfirm: function () { PG.auth.logout(); ctx.router.replace("/login"); }
              });
            } }, svg("logout"))
        )
      ),
      h("div", { class: "pg-uheader__greeting" },
        h("div", { class: "pg-uheader__hello", text: ui.greetingID() + "," }),
        h("div", { class: "pg-uheader__name", text: u.fullName + " 👋" }),
        h("div", { class: "pg-uheader__sub", text: "Selamat bekerja dan tetap semangat hari ini!" })
      )
    );

    // ---- Realtime clock : foto profil + jam berjalan + Hari, Tanggal Bulan Tahun + reminder sholat ----
    function pad2(n) { return String(n).padStart(2, "0"); }
    function clockText() {
      var d = new Date();
      return pad2(d.getHours()) + ":" + pad2(d.getMinutes()) + ":" + pad2(d.getSeconds());
    }
    // Profil photo slot — square 1:1; tap to open Profil Saya. Loaded via the
    // store's authenticated photo cache (mobile-safe, instant on re-render); the
    // user icon shows underneath / on load error.
    var photoEl = h("button", { class: "pg-clock__photo", type: "button", "aria-label": "Profil Saya",
      onclick: function () { ctx.router.go("/profil"); } }, svg("user"));
    if (u.photoUrl) paintAvatarPhoto(photoEl, u.photoUrl, "Foto profil");

    var timeEl = h("div", { class: "pg-clock__time", text: clockText() });
    var dateEl = h("div", { class: "pg-clock__date", text: ui.todayLongID() });

    // Prayer-time reminder — shared engine in ui.js; geolocation with a Lombok fallback.
    var prayerTextEl = h("span", { text: "Memuat waktu sholat…" });
    var prayerEl = h("div", { class: "pg-prayer pg-prayer--block" }, svg("moon"), prayerTextEl);
    var prayerState = { times: null, day: null, loc: null };
    ui.geoOnce(function (loc) { prayerState.loc = loc; prayerState.times = null; refreshPrayer(); });
    function refreshPrayer() {
      if (!document.body.contains(prayerEl)) return;
      var loc = prayerState.loc || { lat: -8.65, lng: 116.42 };
      var now = new Date();
      var dayKey = now.toDateString();
      if (!prayerState.times || prayerState.day !== dayKey) {
        prayerState.times = ui.prayerTimes(now, loc.lat, loc.lng, -now.getTimezoneOffset());
        prayerState.day = dayKey;
      }
      var r = ui.prayerReminder(ui.nextPrayer(prayerState.times, now));
      prayerEl.classList.toggle("pg-prayer--soon", r.soon);
      prayerEl.classList.toggle("pg-prayer--blink", r.blink);
      prayerTextEl.textContent = r.text;
    }
    refreshPrayer();

    var clockIv = setInterval(function () {
      if (!document.body.contains(timeEl)) { clearInterval(clockIv); return; }
      timeEl.textContent = clockText();
      dateEl.textContent = ui.todayLongID();
      refreshPrayer();
    }, 1000);

    var clockCard = ui.card({ class: "pg-clock", body: [
      h("div", { class: "pg-clock__row" },
        h("div", { class: "pg-clock__info" },
          h("div", { class: "pg-clock__head" },
            h("span", { class: "pg-clock__ic" }, svg("clock")),
            timeEl),
          dateEl),
        photoEl),
      prayerEl
    ]});

    // ---- Todo Aktif / Todo Selesai (always 2-up, every screen width) ----
    var todoStats = h("div", { class: "pg-grid pg-grid--keep2" },
      h("div", { class: "pg-ministat" },
        h("div", { class: "pg-ministat__label" }, svg("checklist"), "Todo Aktif"),
        h("div", { class: "pg-ministat__value", text: String(activeTodos) }),
        h("div", { class: "pg-ministat__cap",
          style: overdueTodos ? { color: "var(--pg-danger)" } : null,
          text: overdueTodos ? (overdueTodos + " terlambat") : "Sedang berjalan" }),
        h("a", { class: "pg-ministat__link", onclick: function () { ctx.router.go("/todo"); } },
          "Lihat semua ", svg("arrowRight"))
      ),
      h("div", { class: "pg-ministat" },
        h("div", { class: "pg-ministat__label" }, svg("checkCircle"), "Todo Selesai"),
        h("div", { class: "pg-ministat__value", text: String(doneTodos) }),
        h("div", { class: "pg-ministat__cap", text: "Tugas rampung" }),
        h("a", { class: "pg-ministat__link", onclick: function () { ctx.router.go("/todo"); } },
          "Lihat semua ", svg("arrowRight"))
      )
    );

    // Todo List / Program / Job Desk are CORE — always on, never gated.
    // Lapor KPI / Kunjungan are optional per team. Rekapan Absensi always
    // follows the "absensi" switch (they show/hide together, never separately).
    var quickItems = [
      { icon: "checklist", label: "Todo List", go: "/todo", count: activeTodos },
      { icon: "target", label: "Lapor KPI", go: "/lapor-kpi", feature: "kpi" },
      { icon: "grid", label: "Program", go: "/program" },
      { icon: "briefcase", label: "Job Desk", go: "/job-desk" },
      { icon: "building", label: "Kunjungan", go: "/kunjungan", feature: "kunjungan" },
      { icon: "wallet", label: "Pengeluaran", go: "/pengeluaran", feature: "pengeluaran" },
      { icon: "archive", label: "Resi Gudang", go: "/resi-gudang", feature: "resi_gudang" },
      { icon: "doc", label: "Laporan Resi", go: "/laporan-resi", feature: "laporan_resi" },
      { icon: "calendar", label: "Jadwal Piket", go: "/jadwal-piket", feature: "piket" },
      { icon: "users", label: "Kerja Staf", go: "/kerja-staf", feature: "kerja_staf" },
      { icon: "building", label: "Hasil Kunjungan", go: "/hasil-kunjungan", feature: "hasil_kunjungan" },
      { icon: "target", label: "Hasil KPI", go: "/hasil-kpi", feature: "hasil_kpi" },
      { icon: "chart", label: "Rekapan Absensi", go: "/rekap-absensi", feature: "absensi" }
    ].filter(function (q) { return !q.feature || PG.store.featureEnabled(q.feature); });
    var quick = h("div", { class: "pg-quick" }, quickItems.map(function (q) {
      var ic = h("span", { class: "pg-quick__ic" }, svg(q.icon));
      if (q.count) {
        ic.appendChild(h("span", { class: "pg-countbadge",
          title: q.count + " todo belum selesai", text: q.count > 99 ? "99+" : String(q.count) }));
      }
      return h("button", { class: "pg-quick__item",
        onclick: function () { q.go ? ctx.router.go(q.go) : nextPhase(q.label); } },
        ic,
        h("span", { text: q.label })
      );
    }));

    ui.live(function () { PG._router.softRefresh(); }, header);

    return screen(header, [
      clockCard,
      todoStats,
      h("div", { class: "pg-usection-title", text: "Akses Cepat" }),
      quick
    ], "pg-uscreen--pull-lg");
  };

  /* ============================================================
     ABSENSI  (real check-in / check-out for the authenticated user)
     ============================================================ */
  pages.absensi = function (ctx) {
    var u = ctx.user;                                  // authenticated identity — never from input
    var tabState = { tab: "absensi" };                 // "absensi" | "lembur" — two in-screen pages
    var riwState = { page: 1 };
    var otRiwState = { page: 1 };

    var header = titleHeader("Absensi", "calendar", function () { openCalendar(); });
    var segHost = h("div", { class: "pg-seg" });
    var bodyHost = h("div", { class: "pg-grid", style: { gap: "16px" } });
    var root = h("div", { class: "pg-user__scroll" }, header,
      h("div", { class: "pg-uscreen" }, segHost, bodyHost));

    // Local re-render — keeps the active tab; used after every selfie / overtime action
    // (ctx.router.refresh() would rebuild the screen and snap back to the Absensi tab).
    function rerender() { renderSeg(); renderBody(); }
    function renderSeg() {
      ui.clear(segHost);
      [["absensi", "Absensi", "user"], ["izin", "Izin", "doc"], ["lembur", "Lembur", "clock"]].forEach(function (t) {
        segHost.appendChild(h("button", {
          class: "pg-seg__btn" + (tabState.tab === t[0] ? " is-active" : ""),
          type: "button",
          onclick: function () { if (tabState.tab !== t[0]) { tabState.tab = t[0]; rerender(); } }
        }, svg(t[2]), h("span", { text: t[1] })));
      });
    }
    function renderBody() {
      ui.clear(bodyHost);
      var build = tabState.tab === "lembur" ? buildLembur
        : tabState.tab === "izin" ? buildIzin
        : buildAbsensi;
      build().filter(Boolean).forEach(function (n) { bodyHost.appendChild(n); });
    }

    // Selfie flow. The camera component saves via store.checkIn/checkOut, which
    // stamps the server time and requires the photo — the frontend never passes a time.
    function startSelfie(kind) {
      PG.selfie({
        title: kind === "in" ? "Selfie — Absen Masuk" : "Selfie — Absen Pulang",
        guide: "Posisikan wajah di tengah kamera",
        onConfirm: function (dataUrl) {
          return kind === "in" ? PG.store.checkIn(u.id, dataUrl) : PG.store.checkOut(u.id, dataUrl);
        },
        onSuccess: function () {
          ui.toast(kind === "in" ? "Absen masuk berhasil dicatat." : "Absen pulang berhasil dicatat.", "success");
          rerender();
        }
      });
    }

    function miniStat(label, value, cap) {
      return h("div", { class: "pg-ministat" },
        h("div", { class: "pg-ministat__label", text: label }),
        h("div", { class: "pg-ministat__value", text: String(value) }),
        cap ? h("div", { class: "pg-ministat__cap", text: cap }) : null
      );
    }
    function dayLifecycle(r) { return r.checkOutAt ? "pulang" : (r.checkInStatus || "hadir"); }

    /* ============================================================
       PAGE 1 · ABSENSI  (check-in / check-out + riwayat + rekap)
       ============================================================ */
    function buildAbsensi() {
      var s = PG.store.getAttendanceSettings();
      var today = PG.store.attendanceToday(u.id);
      var status = PG.store.attendanceStatus(u.id);      // belum | hadir | terlambat | pulang
      var offDay = !PG.store.isWorkDay(new Date());

      var stateColor = { belum: "var(--pg-warning)", hadir: "var(--pg-success)",
        terlambat: "var(--pg-warning)", pulang: "var(--pg-blue)" }[status];

      var hint, action;
      if (status === "belum") {
        hint = offDay ? "Hari ini di luar hari kerja, namun Anda tetap dapat absen."
                      : "Kamu belum melakukan absensi hari ini.";
        action = ui.button({ label: "Selfie untuk Absen Masuk", variant: "accent", block: true, icon: "user",
          onClick: function () { startSelfie("in"); } });
      } else if (status === "hadir" || status === "terlambat") {
        hint = "Masuk " + ui.fmtTimeID(today.checkInAt) +
          (today.lateMinutes ? " · Terlambat " + today.lateMinutes + " menit" : "");
        action = ui.button({ label: "Selfie untuk Absen Pulang", variant: "accent", block: true, icon: "user",
          onClick: function () { startSelfie("out"); } });
      } else { // pulang
        hint = "Masuk " + ui.fmtTimeID(today.checkInAt) + " · Pulang " + ui.fmtTimeID(today.checkOutAt);
        action = h("div", { class: "pg-notice pg-notice--muted", style: { justifyContent: "center" } },
          svg("checkCircle"), h("div", { text: "Absensi hari ini sudah selesai." }));
      }

      var todayPhotos = (status !== "belum" && today)
        ? h("div", { class: "pg-riw-photos", style: { justifyContent: "center", marginTop: "10px" } },
            today.checkInPhoto ? h("div", null,
              h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Masuk" }),
              ui.photoThumb(today.checkInPhoto, null, { title: "Foto absen masuk", alt: "Foto masuk" })) : null,
            today.checkOutPhoto ? h("div", null,
              h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Pulang" }),
              ui.photoThumb(today.checkOutPhoto, null, { title: "Foto absen pulang", alt: "Foto pulang" })) : null
          )
        : null;

      var statusCard = ui.card({ body: [
        h("div", { class: "pg-strong", style: { marginBottom: "12px" }, text: "Status Hari Ini · " + ui.fmtDateWeekdayID(PG.store.dateKey()) }),
        h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
          h("div", { class: "pg-attn-card__ic" }, svg(status === "belum" ? "user" : "checkCircle")),
          h("div", { class: "pg-attn-card__state", style: { color: stateColor }, text: ui.STATUS_LABEL[status] }),
          h("div", { class: "pg-attn-card__hint", text: hint }),
          todayPhotos,
          h("div", { style: { marginTop: "14px" } }, action)
        )
      ]});

      var workHours = ui.card({ body: [
        h("div", { class: "pg-workhours" },
          h("span", { class: "pg-workhours__ic" }, svg("clock")),
          h("div", { class: "pg-workhours__col" },
            h("div", { class: "pg-workhours__t", text: s.checkIn }),
            h("div", { class: "pg-workhours__l", text: "Masuk" })
          ),
          h("div", { class: "pg-workhours__col" },
            h("div", { class: "pg-workhours__t", text: s.checkOut }),
            h("div", { class: "pg-workhours__l", text: "Pulang" })
          ),
          h("div", { class: "pg-workhours__note",
            text: "Toleransi keterlambatan " + s.lateToleranceMin + " menit" })
        )
      ]});

      var records = PG.store.attendanceForUser(u.id);
      var mine = PG.store.summarizeAttendance(records);
      // Riwayat shows only the last 7 calendar days (today + 6 back).
      var riwCutoff = (function () {
        var d = new Date(PG.store.serverToday() + "T00:00:00");
        d.setDate(d.getDate() - 6);
        return PG.store.dateKey(d);
      })();
      var riwRecords = records.filter(function (r) { return r.date >= riwCutoff; });
      var recap = ui.card({ title: "Rekap Kehadiran Saya", body: [
        h("div", { class: "pg-grid pg-grid--keep2" },
          miniStat("Tepat Waktu", mine.hadir, "hari"),
          miniStat("Terlambat", mine.terlambat, "hari"),
          miniStat("Pulang Cepat", mine.kabur, "sebelum jam pulang"),
          miniStat("Total Jam Kerja", ui.fmtDuration(mine.workedMs), "dalam jam kerja")
        )
      ]});

      // ---- Riwayat with pagination (10 / page), rows open the detail preview ----
      var riwHost = h("div");
      function riwRow(r) {
        return h("div", { class: "pg-history-row pg-history-row--tap",
          onclick: function (e) {
            if (e.target.closest(".pg-photo-thumb:not(.pg-photo-thumb--empty)")) return;
            attnDetail(r);
          } },
          h("div", { class: "pg-riw-photos" },
            ui.photoThumb(r.checkInPhoto, null, { title: "Foto masuk · " + ui.fmtDateWeekdayID(r.date), alt: "Foto masuk" }),
            ui.photoThumb(r.checkOutPhoto, null, { title: "Foto pulang · " + ui.fmtDateWeekdayID(r.date), alt: "Foto pulang" })
          ),
          h("div", { class: "pg-history-row__main" },
            h("div", { class: "pg-history-row__d", text: ui.fmtDateWeekdayID(r.date) }),
            h("div", { class: "pg-history-row__t",
              text: "Masuk " + ui.fmtTimeID(r.checkInAt) + " · Pulang " + ui.fmtTimeID(r.checkOutAt) +
                (PG.store.isEarlyLeave(r) ? " · Pulang cepat" : "") })
          ),
          h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
            ui.statusBadge(dayLifecycle(r)),
            svg("chevronRight")
          )
        );
      }
      function renderRiwayat() {
        var pc = Math.max(1, Math.ceil(riwRecords.length / 10));
        if (riwState.page > pc) riwState.page = pc;
        var start = (riwState.page - 1) * 10;
        var slice = riwRecords.slice(start, start + 10);
        ui.mount(riwHost, h("div", null,
          h("div", null, slice.map(riwRow)),
          riwRecords.length > 10
            ? h("div", { style: { marginTop: "12px" } },
                ui.pager({ page: riwState.page, pageCount: pc,
                  info: "Hal. " + riwState.page + "/" + pc + " · " + riwRecords.length + " data",
                  onPage: function (n) { riwState.page = n; renderRiwayat(); } }))
            : null
        ));
      }
      if (riwRecords.length) renderRiwayat();

      var riwayat = ui.card({ title: "Riwayat Absensi · 7 hari terakhir", body: [
        riwRecords.length ? riwHost
          : ui.emptyState({ icon: "clock", title: "Belum ada absensi dalam 7 hari terakhir.",
              text: records.length
                ? "Riwayat lengkap tersedia di menu Rekap Absensi."
                : "Riwayat kehadiran Anda akan tampil setelah absen pertama." })
      ]});

      return [statusCard, workHours, records.length ? recap : null, riwayat];
    }

    /* ============================================================
       PAGE 2 · IZIN  (selfie + keterangan — submit only)
       ============================================================ */
    function startIzinFlow() {
      var fReason = ui.field({ label: "Keterangan Izin", type: "textarea", required: true,
        placeholder: "cth. Izin sakit / keperluan keluarga / urusan mendadak" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Ajukan Izin",
        body: [fReason, errEl,
          ui.notice("Tuliskan alasan izin lalu ambil selfie sebagai bukti. Izin langsung tercatat dan tampil di panel Admin (Laporan Izin).", { muted: true })],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Lanjut ke Selfie", variant: "accent", icon: "user", onClick: function () {
            var reason = fReason._control.value.trim();
            if (!reason) { errEl.textContent = "Keterangan izin wajib diisi."; errEl.style.display = "block"; return; }
            m.close();
            PG.selfie({
              title: "Selfie — Izin",
              guide: "Selfie sebagai bukti pengajuan izin",
              onConfirm: function (dataUrl) { return PG.store.submitIzin(reason, dataUrl); },
              onSuccess: function () { ui.toast("Izin terkirim dan tercatat.", "success"); rerender(); }
            });
          } })
        ]
      });
    }

    function izinDetail(r) {
      ui.modal({
        title: "Detail Izin",
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: ui.fmtDateWeekdayID(r.date) }),
          h("div", { class: "pg-attdetail__photos" },
            h("div", { class: "pg-attdetail__photo" },
              h("div", { class: "pg-attdetail__photo-head" },
                h("span", { text: "Selfie Izin" }),
                h("span", { class: "pg-muted", style: { fontWeight: "400" },
                  text: r.createdAt ? ui.fmtTimeID(r.createdAt) : "—" })),
              h("div", { class: "pg-attdetail__photo-body" },
                ui.photoImg(r.photo, { alt: "Selfie izin", onclick: function () { ui.photoViewer(r.photo, "Selfie Izin"); } })))),
          h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
            svg("info"), h("div", { text: "Keterangan: " + r.reason }))
        ) ]
      });
    }

    function buildIzin() {
      var todayIzin = PG.store.izinToday(u.id);
      var records = PG.store.izinForUser(u.id);

      // ---- Status card ----
      var statusBody;
      if (todayIzin) {
        statusBody = [
          h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
            h("div", { class: "pg-attn-card__ic" }, svg("checkCircle")),
            h("div", { class: "pg-attn-card__state", style: { color: "var(--pg-success)" }, text: "Izin Terkirim" }),
            h("div", { class: "pg-attn-card__hint", text: "Anda sudah mengirim izin untuk hari ini." }),
            h("div", { class: "pg-riw-photos", style: { justifyContent: "center", marginTop: "10px" } },
              h("div", null,
                h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Selfie" }),
                ui.photoThumb(todayIzin.photo, null, { title: "Selfie izin", alt: "Selfie izin" }))),
            h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
              svg("info"), h("div", { text: "Keterangan: " + todayIzin.reason }))
          )
        ];
      } else {
        statusBody = [
          h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
            h("div", { class: "pg-attn-card__ic" }, svg("doc")),
            h("div", { class: "pg-attn-card__state", style: { color: "var(--pg-text-secondary)" }, text: "Belum Ada Izin Hari Ini" }),
            h("div", { class: "pg-attn-card__hint", text: "Ajukan izin bila Anda berhalangan hadir. Cukup keterangan singkat + selfie." }),
            h("div", { style: { marginTop: "14px" } },
              ui.button({ label: "Ajukan Izin", variant: "accent", block: true, icon: "user", onClick: startIzinFlow }))
          )
        ];
      }
      var statusCard = ui.card({ body: [
        h("div", { class: "pg-strong", style: { marginBottom: "12px" }, text: "Status Izin · " + ui.fmtDateWeekdayID(PG.store.dateKey()) })
      ].concat(statusBody) });

      // ---- Riwayat Izin (own, last 7 days) ----
      var izinCutoff = (function () {
        var d = new Date(PG.store.serverToday() + "T00:00:00");
        d.setDate(d.getDate() - 6);
        return PG.store.dateKey(d);
      })();
      var recent = records.filter(function (r) { return r.date >= izinCutoff; });
      var riwayat = ui.card({ title: "Riwayat Izin · 7 hari terakhir", body: [
        recent.length
          ? h("div", null, recent.map(function (r) {
              return h("div", { class: "pg-history-row pg-history-row--tap",
                onclick: function (e) {
                  if (e.target.closest(".pg-photo-thumb:not(.pg-photo-thumb--empty)")) return;
                  izinDetail(r);
                } },
                h("div", { class: "pg-riw-photos" },
                  ui.photoThumb(r.photo, null, { title: "Selfie izin · " + ui.fmtDateWeekdayID(r.date), alt: "Selfie izin" })),
                h("div", { class: "pg-history-row__main" },
                  h("div", { class: "pg-history-row__d", text: ui.fmtDateWeekdayID(r.date) }),
                  h("div", { class: "pg-history-row__t",
                    text: r.reason.length > 40 ? r.reason.slice(0, 40) + "…" : r.reason })),
                svg("chevronRight"));
            }))
          : ui.emptyState({ icon: "doc", title: "Belum ada izin dalam 7 hari terakhir.",
              text: records.length ? "Izin lama tetap tersimpan di panel Admin." : "Izin yang Anda ajukan akan tampil di sini." })
      ]});

      return [statusCard, riwayat];
    }

    // ---- Detail one attendance record (preview) ----
    function attnDetail(r) {
      function photoBlock(title, at, src) {
        var body = src
          ? h("div", { class: "pg-attdetail__photo-body" },
              ui.photoImg(src, { alt: title, onclick: function () { ui.photoViewer(src, title); } }))
          : h("div", { class: "pg-attdetail__photo-body" },
              h("div", { class: "pg-attdetail__photo-empty" }, svg("user"),
                h("span", { text: at ? "Tanpa foto" : "Belum " + (title.indexOf("Masuk") >= 0 ? "absen masuk" : "absen pulang") })));
        return h("div", { class: "pg-attdetail__photo" },
          h("div", { class: "pg-attdetail__photo-head" },
            h("span", { text: title }),
            h("span", { class: "pg-muted", style: { fontWeight: "400" }, text: at ? ui.fmtTimeID(at) : "—" })),
          body);
      }
      ui.modal({
        title: "Detail Absensi",
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: ui.fmtDateWeekdayID(r.date) }),
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            ui.statusBadge(dayLifecycle(r)),
            r.lateMinutes ? ui.badge("Terlambat " + r.lateMinutes + " menit", "warning") : null,
            PG.store.isEarlyLeave(r) ? ui.badge("Pulang cepat", "warning") : null
          ),
          h("div", { class: "pg-attdetail__kv" },
            h("div", null, h("div", { class: "pg-field__hint", text: "Jam Masuk" }),
              h("div", { class: "pg-strong", text: ui.fmtTimeID(r.checkInAt) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Jam Pulang" }),
              h("div", { class: "pg-strong", text: ui.fmtTimeID(r.checkOutAt) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Durasi Kerja" }),
              h("div", { class: "pg-strong", text: r.checkOutAt ? ui.fmtDuration(PG.store.attendanceWorkedMs(r)) : "—" }))
          ),
          h("div", { class: "pg-attdetail__photos" },
            photoBlock("Selfie Absen Masuk", r.checkInAt, r.checkInPhoto),
            photoBlock("Selfie Absen Pulang", r.checkOutAt, r.checkOutPhoto)
          ),
          ui.notice("Waktu dicatat oleh server. Data hanya dapat diubah oleh Admin.", { muted: true })
        ) ]
      });
    }

    // ---- Kalender Absensi (month grid of the user's own attendance) ----
    function openCalendar() {
      var recByDate = {};
      PG.store.attendanceForUser(u.id).forEach(function (r) { recByDate[r.date] = r; });
      var view = new Date(); view.setDate(1);
      var m = ui.modal({ title: "Kalender Absensi", body: [] });
      var body = m.body;
      var WD = ["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"];
      var MON = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus",
        "September", "Oktober", "November", "Desember"];

      function classify(dateObj) {
        var key = PG.store.dateKey(dateObj);
        var r = recByDate[key];
        if (r) return { cls: PG.store.isEarlyLeave(r) ? "kabur" : (r.checkInStatus || "hadir"), rec: r };
        var t = new Date(); t.setHours(0, 0, 0, 0);
        if (PG.store.isHoliday(key) || !PG.store.isWorkDay(dateObj)) return { cls: "libur" };
        if (dateObj < t) return { cls: "alpha" };
        return { cls: "future" };
      }

      function render() {
        ui.clear(body);
        var y = view.getFullYear(), mo = view.getMonth();
        var first = new Date(y, mo, 1);
        var startDow = (first.getDay() + 6) % 7;
        var dim = new Date(y, mo + 1, 0).getDate();
        var todayKey = PG.store.dateKey();

        var grid = h("div", { class: "pg-cal__grid" });
        for (var i = 0; i < startDow; i++) grid.appendChild(h("div"));
        for (var d = 1; d <= dim; d++) {
          (function (dateObj) {
            var info = classify(dateObj);
            var key = PG.store.dateKey(dateObj);
            var cell = h("button", {
              class: "pg-cal__cell is-" + info.cls + (key === todayKey ? " pg-cal__cell--today" : ""),
              type: "button",
              onclick: function () {
                if (info.rec) attnDetail(info.rec);
                else ui.toast(info.cls === "libur" ? "Hari libur / di luar hari kerja."
                  : info.cls === "future" ? "Belum ada absensi." : "Tidak ada absensi pada tanggal ini.");
              }
            }, h("span", { class: "pg-cal__d", text: String(dateObj.getDate()) }),
              info.rec ? h("span", { class: "pg-cal__dot" }) : null);
            grid.appendChild(cell);
          })(new Date(y, mo, d));
        }

        body.appendChild(h("div", { class: "pg-cal" },
          h("div", { class: "pg-cal__nav" },
            h("button", { class: "pg-uheader__iconbtn", style: { background: "var(--pg-surface-alt)", color: "var(--pg-text)" },
              "aria-label": "Bulan sebelumnya",
              onclick: function () { view.setMonth(view.getMonth() - 1); render(); } }, svg("chevronLeft")),
            h("div", { class: "pg-strong", text: MON[mo] + " " + y }),
            h("button", { class: "pg-uheader__iconbtn", style: { background: "var(--pg-surface-alt)", color: "var(--pg-text)" },
              "aria-label": "Bulan berikutnya",
              onclick: function () { view.setMonth(view.getMonth() + 1); render(); } }, svg("chevronRight"))
          ),
          h("div", { class: "pg-cal__weekhead" }, WD.map(function (w) { return h("div", { text: w }); })),
          grid,
          h("div", { class: "pg-cal__legend" },
            legendDot("hadir", "Tepat Waktu"), legendDot("terlambat", "Terlambat"),
            legendDot("kabur", "Pulang Cepat"), legendDot("alpha", "Tidak Absen"),
            legendDot("libur", "Libur")
          )
        ));
      }
      function legendDot(cls, label) {
        return h("div", { class: "pg-cal__legend-item" },
          h("span", { class: "pg-cal__legend-dot is-" + cls }), h("span", { text: label }));
      }
      render();
    }

    /* ============================================================
       PAGE 2 · LEMBUR / OVERTIME  (own overtime only — separate from attendance)

       Flow: user starts (inside the "Jam Lembur" window) AND finishes lembur
       freely, no approval needed — status berjalan -> menunggu. Admin then
       Terima -> "disetujui" (counted) or Tolak -> "ditolak" (record kept, hours
       NOT counted). If the user never finishes before the Jam Lembur deadline
       the store auto-sets "kadaluarsa" (kept, not counted). Only "disetujui"
       lembur is counted toward any total.
       ============================================================ */
    function liveTimer(startIso) {
      var span = h("span", { class: "pg-strong", text: ui.fmtDuration(Date.now() - new Date(startIso)) });
      var iv = setInterval(function () {
        if (!document.body.contains(span)) { clearInterval(iv); return; }
        span.textContent = ui.fmtDuration(Date.now() - new Date(startIso));
      }, 20000);
      return span;
    }

    function otDetail(r) {
      function photoBlock(title, at, src) {
        var b = src
          ? h("div", { class: "pg-attdetail__photo-body" },
              ui.photoImg(src, { alt: title, onclick: function () { ui.photoViewer(src, title); } }))
          : h("div", { class: "pg-attdetail__photo-body" },
              h("div", { class: "pg-attdetail__photo-empty" }, svg("user"),
                h("span", { text: at ? "Tanpa foto" : "Belum ada selfie" })));
        return h("div", { class: "pg-attdetail__photo" },
          h("div", { class: "pg-attdetail__photo-head" },
            h("span", { text: title }),
            h("span", { class: "pg-muted", style: { fontWeight: "400" }, text: at ? ui.fmtTimeID(at) : "—" })), b);
      }
      ui.modal({
        title: "Detail Lembur",
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: ui.fmtDateWeekdayID(r.date) }),
          h("div", null, ui.statusBadge(r.status)),
          h("div", null,
            h("div", { class: "pg-field__hint", text: "Keterangan" }),
            h("div", { class: "pg-strong", text: r.description || "—" })),
          r.status === "ditolak" && r.rejectionReason
            ? ui.notice("Alasan penolakan: " + r.rejectionReason) : null,
          h("div", { class: "pg-attdetail__kv" },
            h("div", null, h("div", { class: "pg-field__hint", text: "Jam Mulai" }),
              h("div", { class: "pg-strong", text: ui.fmtTimeID(r.startAt) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Jam Selesai" }),
              h("div", { class: "pg-strong", text: r.endAt ? ui.fmtTimeID(r.endAt) : "—" })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Durasi" }),
              h("div", { class: "pg-strong", text: !r.endAt
                ? (r.status === "kadaluarsa" ? "Tidak dihitung (kadaluarsa)" : "berjalan")
                : ui.fmtDuration(PG.store.overtimeDurationMs(r)) +
                  (r.status === "disetujui" ? " · dihitung"
                    : r.status === "ditolak" ? " · tidak dihitung"
                    : " · menunggu") }))
          ),
          h("div", { class: "pg-attdetail__photos" },
            photoBlock("Selfie Mulai Lembur", r.startAt, r.startPhoto),
            photoBlock("Selfie Selesai Lembur", r.endAt, r.endPhoto)
          ),
          ui.notice("Waktu & durasi dihitung oleh server. Status persetujuan diatur oleh Admin.", { muted: true })
        ) ]
      });
    }

    function startLemburFlow() {
      var win = PG.store.overtimeWindow();
      if (!PG.store.isWithinOvertimeWindow()) {
        ui.toast("Lembur hanya dapat dimulai pada jam " + win.start + " – " + win.end + ".", "danger");
        return;
      }
      var fDesc = ui.field({ label: "Keterangan Lembur", type: "textarea", required: true,
        placeholder: "cth. Penyelesaian laporan penjualan" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Ajukan / Mulai Lembur",
        body: [fDesc, errEl,
          ui.notice("Anda bisa memulai dan menyelesaikan lembur tanpa menunggu persetujuan. Selesaikan sebelum jam " +
            win.end + " atau lembur menjadi kadaluarsa. Setelah selesai, admin menerima (dihitung) atau menolak (tetap tercatat, tidak dihitung).", { muted: true })],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Lanjut ke Selfie", variant: "accent", icon: "user", onClick: function () {
            var desc = fDesc._control.value.trim();
            if (!desc) { errEl.textContent = "Keterangan lembur wajib diisi."; errEl.style.display = "block"; return; }
            m.close();
            PG.selfie({
              title: "Selfie — Mulai Lembur",
              guide: "Selfie sebagai bukti mulai lembur",
              onConfirm: function (dataUrl) { return PG.store.startOvertime(u.id, { description: desc, photo: dataUrl }); },
              onSuccess: function () { ui.toast("Lembur dimulai. Selamat bekerja!", "success"); rerender(); }
            });
          } })
        ]
      });
    }
    function endLemburFlow() {
      PG.selfie({
        title: "Selfie — Selesai Lembur",
        guide: "Selfie sebagai bukti selesai lembur",
        onConfirm: function (dataUrl) { return PG.store.endOvertime(u.id, { photo: dataUrl }); },
        onSuccess: function () { ui.toast("Lembur selesai. Menunggu persetujuan admin.", "success"); rerender(); }
      });
    }

    function buildLembur() {
      var otStatus = PG.store.overtimeStatus(u.id);   // belum | berjalan | menunggu | disetujui | ditolak | kadaluarsa
      var otOpen = PG.store.openOvertime(u.id);        // running lembur, even if started before today
      var otToday = otOpen || PG.store.overtimeToday(u.id);
      var otRecords = PG.store.overtimeForUser(u.id);
      var win = PG.store.overtimeWindow();
      var inWindow = PG.store.isWithinOvertimeWindow();

      // Window info strip — always visible on the Lembur page.
      var windowCard = ui.card({ body: [
        h("div", { class: "pg-workhours" },
          h("span", { class: "pg-workhours__ic" }, svg("clock")),
          h("div", { class: "pg-workhours__col" },
            h("div", { class: "pg-workhours__t", text: win.start }),
            h("div", { class: "pg-workhours__l", text: "Mulai" })),
          h("div", { class: "pg-workhours__col" },
            h("div", { class: "pg-workhours__t", text: win.end }),
            h("div", { class: "pg-workhours__l", text: "Selesai" })),
          h("div", { class: "pg-workhours__note",
            text: inWindow ? "Sekarang di dalam jam lembur" : "Sekarang di luar jam lembur" })
        )
      ]});

      var lemburBody;
      if (otStatus === "belum") {
        lemburBody = [
          h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
            h("div", { class: "pg-attn-card__ic" }, svg("briefcase")),
            h("div", { class: "pg-attn-card__state", style: { color: "var(--pg-text-secondary)" }, text: "Belum Ada Lembur" }),
            h("div", { class: "pg-attn-card__hint",
              text: inWindow ? "Mulai lembur bila Anda bekerja di luar jam kerja normal."
                             : "Tombol aktif pada jam lembur " + win.start + " – " + win.end + "." }),
            h("div", { style: { marginTop: "14px" } },
              ui.button({ label: inWindow ? "Ajukan / Mulai Lembur" : "Di Luar Jam Lembur",
                variant: "accent", block: true, icon: "clock", disabled: !inWindow,
                onClick: startLemburFlow }))
          )
        ];
      } else if (otStatus === "berjalan") {   // still running — "Selesai Lembur" always available, no approval
        var startedEarlier = otToday.date !== PG.store.dateKey();
        var deadline = PG.store.overtimeDeadline(otToday);
        var dlSameDay = PG.store.dateKey(deadline) === otToday.date;
        var dlText = (dlSameDay ? "" : ui.fmtDateWeekdayID(deadline.toISOString()) + " ") + ui.fmtTimeID(deadline.toISOString());
        lemburBody = [
          h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
            h("div", { class: "pg-attn-card__ic" }, svg("clock")),
            h("div", { class: "pg-attn-card__state", style: { color: "var(--pg-blue)" }, text: "Sedang Lembur" }),
            h("div", { class: "pg-attn-card__hint" },
              "Mulai " + (startedEarlier ? ui.fmtDateWeekdayID(otToday.date) + " " : "") + ui.fmtTimeID(otToday.startAt) +
                " · Durasi berjalan ", liveTimer(otToday.startAt)),
            h("div", { class: "pg-riw-photos", style: { justifyContent: "center", marginTop: "10px" } },
              h("div", null, h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Mulai" }),
                ui.photoThumb(otToday.startPhoto, null, { title: "Foto mulai lembur", alt: "Foto mulai lembur" }))),
            h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
              svg("info"), h("div", { text: "Keterangan: " + otToday.description })),
            h("div", { style: { marginTop: "14px" } },
              ui.button({ label: "Selesai Lembur", variant: "accent", block: true, icon: "user",
                onClick: endLemburFlow })),
            h("div", { class: "pg-notice", style: { marginTop: "10px" } }, svg("info"),
              h("div", { text: "Tekan \"Selesai Lembur\" sebelum " + dlText +
                ". Lewat dari batas itu lembur menjadi kadaluarsa dan tidak dihitung." })),
            h("div", { class: "pg-attn-card__hint", style: { marginTop: "8px", fontSize: "12px" },
              text: "Tombol aktif kapan saja — tidak perlu menunggu admin. Setelah selesai, lembur menunggu persetujuan admin agar dihitung." })
          )
        ];
      } else { // menunggu | disetujui | ditolak | kadaluarsa — terminal-ish
        var isApproved = otStatus === "disetujui";
        var isRejected = otStatus === "ditolak";
        var isExpired = otStatus === "kadaluarsa";
        var heading = isApproved ? "Lembur Disetujui"
          : isRejected ? "Lembur Ditolak"
          : isExpired ? "Lembur Kadaluarsa"
          : "Lembur Selesai";
        var headColor = isApproved ? "var(--pg-success)"
          : (isRejected || isExpired) ? "var(--pg-danger)"
          : "var(--pg-warning)";
        var note = isApproved
            ? "Lembur Anda disetujui admin dan sudah dihitung."
          : isRejected
            ? (otToday.rejectionReason ? "Alasan penolakan: " + otToday.rejectionReason + ". " : "") +
              "Lembur ini ditolak admin — jam lembur tidak dihitung."
          : isExpired
            ? "Anda tidak menekan \"Selesai Lembur\" sebelum batas waktu (jam " + win.end +
              "). Lembur ini tidak dihitung."
            : "Menunggu persetujuan admin agar lembur dihitung.";
        var timeLine = otToday.endAt
          ? "Mulai " + ui.fmtTimeID(otToday.startAt) + " · Selesai " + ui.fmtTimeID(otToday.endAt) +
            " · Durasi " + ui.fmtDuration(PG.store.overtimeDurationMs(otToday))
          : "Mulai " + ui.fmtTimeID(otToday.startAt) + " · tidak diselesaikan";
        lemburBody = [
          h("div", { class: "pg-attn-card", style: { textAlign: "center" } },
            h("div", { class: "pg-attn-card__ic" }, svg(isRejected || isExpired ? "close" : "checkCircle")),
            h("div", { class: "pg-attn-card__state", style: { color: headColor }, text: heading }),
            h("div", { class: "pg-attn-card__hint", text: timeLine }),
            h("div", { style: { marginTop: "8px" } }, ui.statusBadge(otStatus)),
            h("div", { class: (isRejected || isExpired) ? "pg-notice" : "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
              svg("info"), h("div", { text: note })),
            h("div", { class: "pg-riw-photos", style: { justifyContent: "center", marginTop: "10px" } },
              h("div", null, h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Mulai" }),
                ui.photoThumb(otToday.startPhoto, null, { title: "Foto mulai lembur", alt: "Foto mulai" })),
              otToday.endPhoto
                ? h("div", null, h("div", { class: "pg-field__hint", style: { textAlign: "center", marginBottom: "3px" }, text: "Selesai" }),
                    ui.photoThumb(otToday.endPhoto, null, { title: "Foto selesai lembur", alt: "Foto selesai" }))
                : null),
            h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
              svg("info"), h("div", { text: "Keterangan: " + otToday.description }))
          )
        ];
      }
      var lemburCard = ui.card({ title: "Lembur Hari Ini", body: lemburBody });

      // ---- Riwayat Lembur (own, paginated 10/page) ----
      var otRiwHost = h("div");
      function otRiwRow(r) {
        return h("div", { class: "pg-history-row pg-history-row--tap",
          onclick: function (e) {
            if (e.target.closest(".pg-photo-thumb:not(.pg-photo-thumb--empty)")) return;
            otDetail(r);
          } },
          h("div", { class: "pg-riw-photos" },
            ui.photoThumb(r.startPhoto, null, { title: "Selfie mulai · " + ui.fmtDateWeekdayID(r.date), alt: "Selfie mulai" }),
            ui.photoThumb(r.endPhoto, null, { title: "Selfie selesai · " + ui.fmtDateWeekdayID(r.date), alt: "Selfie selesai" })
          ),
          h("div", { class: "pg-history-row__main" },
            h("div", { class: "pg-history-row__d", text: ui.fmtDateWeekdayID(r.date) }),
            h("div", { class: "pg-history-row__t",
              text: ui.fmtTimeID(r.startAt) + " – " + (r.endAt ? ui.fmtTimeID(r.endAt) : "—") +
                (r.endAt ? " · " + ui.fmtDuration(PG.store.overtimeDurationMs(r)) +
                    (r.status === "ditolak" ? " (tidak dihitung)" : "")
                  : r.status === "kadaluarsa" ? " · kadaluarsa, tidak dihitung" : " · berjalan") +
                " · " + (r.description.length > 24 ? r.description.slice(0, 24) + "…" : r.description) })
          ),
          h("div", { style: { display: "flex", alignItems: "center", gap: "6px" } },
            ui.statusBadge(r.status), svg("chevronRight"))
        );
      }
      function renderOtRiwayat() {
        var pc = Math.max(1, Math.ceil(otRecords.length / 10));
        if (otRiwState.page > pc) otRiwState.page = pc;
        var st = (otRiwState.page - 1) * 10;
        ui.mount(otRiwHost, h("div", null,
          h("div", null, otRecords.slice(st, st + 10).map(otRiwRow)),
          otRecords.length > 10
            ? h("div", { style: { marginTop: "12px" } },
                ui.pager({ page: otRiwState.page, pageCount: pc,
                  info: "Hal. " + otRiwState.page + "/" + pc + " · " + otRecords.length + " data",
                  onPage: function (n) { otRiwState.page = n; renderOtRiwayat(); } }))
            : null
        ));
      }
      if (otRecords.length) renderOtRiwayat();
      var lemburRiwayat = ui.card({ title: "Riwayat Lembur", body: [
        otRecords.length ? otRiwHost
          : ui.emptyState({ icon: "briefcase", title: "Belum ada riwayat lembur.",
              text: "Riwayat lembur Anda akan tampil setelah lembur pertama." })
      ]});

      return [windowCard, lemburCard, lemburRiwayat];
    }

    renderSeg();
    renderBody();
    // Live: reflect admin approvals (lembur) / edits without a manual refresh.
    // renderBody re-reads the store cache; the focus/typing guard in ui.live
    // keeps it from interrupting an in-progress selfie or form.
    ui.live(function () { renderSeg(); renderBody(); }, root);
    return root;
  };

  /* ============================================================
     TODO LIST  (own tasks — progress + work-report attachments)
     ============================================================ */
  pages.todo = function (ctx) {
    var view = "tugas";                        // "tugas" | "arsip"
    var PER_PAGE = 10;
    var state = { filter: "all", page: 1 };
    var TABS = [{ key: "all", label: "Semua" }, { key: "active", label: "Aktif" }, { key: "done", label: "Selesai" }];
    var FILE_ACCEPT = ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv";

    var headerHost = h("div");
    var bodyHost = h("div");
    var tabsHost = h("div", { style: { marginBottom: "12px" } });
    var list = h("div", { class: "pg-grid", style: { gap: "8px" } });
    var archHost = h("div");
    var fab = h("button", { class: "pg-fab", type: "button", "aria-label": "Buat Todo Sendiri",
      title: "Buat Todo Sendiri", onclick: function () { createTodoFlow(); } }, svg("plus"));

    /* ---------- create own todo ---------- */
    function createTodoFlow() {
      var fTitle = ui.field({ label: "Judul Todo", placeholder: "cth. Follow up klien A", required: true });
      var fDesc = ui.field({ label: "Deskripsi (opsional)", type: "textarea", placeholder: "Detail pekerjaan…" });
      var fPrio = ui.field({ label: "Prioritas", type: "select", value: "mid", options: [
        { value: "high", label: "Tinggi" }, { value: "mid", label: "Sedang" }, { value: "low", label: "Rendah" }] });
      var fDeadline = ui.field({ label: "Deadline (opsional)", type: "date" });
      var fNote = ui.field({ label: "Catatan (opsional)", type: "textarea", placeholder: "Catatan awal…" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Buat Todo Sendiri",
        body: [fTitle, fDesc, h("div", { class: "pg-grid pg-grid--2" }, fPrio, fDeadline), fNote, errEl,
          ui.notice("Todo yang Anda buat juga muncul di panel Admin, ditandai sebagai dibuat oleh Anda.", { muted: true })],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Buat", variant: "accent", icon: "plus", onClick: function () {
            var title = fTitle._control.value.trim();
            if (!title) { errEl.textContent = "Judul todo wajib diisi."; errEl.style.display = "block"; return; }
            errEl.style.display = "none";
            return PG.store.createMyTodo({
              title: title,
              description: fDesc._control.value.trim(),
              userNote: fNote._control.value.trim(),
              priority: fPrio._control.value || "mid",
              deadline: fDeadline._control.value || null
            }).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal membuat todo."; errEl.style.display = "block"; return; }
              ui.toast("Todo dibuat.", "success"); m.close(); render();
            });
          } })
        ]
      });
    }

    /* ---------- edit / delete own todo ---------- */
    // Only ever offered for t.createdBySource === "user" — the API itself
    // also rejects it for an admin-assigned todo, this is just the UI gate.
    function editTodoFlow(t, onSaved) {
      var fTitle = ui.field({ label: "Judul Todo", value: t.title, required: true });
      var fDesc = ui.field({ label: "Deskripsi (opsional)", type: "textarea", value: t.description || "" });
      var fPrio = ui.field({ label: "Prioritas", type: "select", value: t.priority, options: [
        { value: "high", label: "Tinggi" }, { value: "mid", label: "Sedang" }, { value: "low", label: "Rendah" }] });
      var fDeadline = ui.field({ label: "Deadline (opsional)", type: "date", value: t.deadline || "" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Edit Todo",
        body: [fTitle, fDesc, h("div", { class: "pg-grid pg-grid--2" }, fPrio, fDeadline), errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "accent", icon: "check", onClick: function () {
            var title = fTitle._control.value.trim();
            if (!title) { errEl.textContent = "Judul todo wajib diisi."; errEl.style.display = "block"; return; }
            errEl.style.display = "none";
            return PG.store.updateMyTodo(t.id, {
              title: title,
              description: fDesc._control.value.trim(),
              priority: fPrio._control.value || "mid",
              deadline: fDeadline._control.value || null
            }).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan perubahan."; errEl.style.display = "block"; return; }
              ui.toast("Todo diperbarui.", "success"); m.close(); render(); onSaved && onSaved();
            });
          } })
        ]
      });
    }
    function deleteTodoFlow(t, onDeleted) {
      ui.confirm({
        title: "Hapus Todo", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus todo \"" + t.title + "\" beserta lampirannya? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          PG.store.deleteMyTodo(t.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus todo.", "danger"); return; }
            ui.toast("Todo dihapus.", "success"); render(); onDeleted && onDeleted();
          });
        }
      });
    }

    function isOverdue(t) { return t.deadline && t.status !== "done" && t.deadline < PG.store.dateKey(); }
    function infoBit(label, value) {
      return h("div", null,
        h("div", { class: "pg-field__hint", text: label }),
        h("div", { class: "pg-strong", text: value }));
    }
    // A todo the CURRENT user created for themselves (editable/deletable). A todo
    // a colleague assigned via "Kerja Staf" also has createdBySource === "user"
    // but a different createdByUserId — that one is NOT theirs to edit.
    function isMine(t) {
      return t.createdBySource === "user" && String(t.createdByUserId || "") === String(ctx.user.id);
    }
    function assignedByLabel(t) {
      if (isMine(t)) return "Anda sendiri";
      if (t.createdBySource === "user") {
        return (t.createdByName || "Rekan kerja") + (t.createdByDivision ? " · " + t.createdByDivision : "");
      }
      return "Admin";
    }

    /* ---------- shared: add link / upload files ---------- */
    function addLinkFlow(todoId, after) {
      var fUrl = ui.field({ label: "URL", placeholder: "https://…", required: true });
      var fLabel = ui.field({ label: "Judul link (opsional)", placeholder: "cth. Folder Google Drive" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Tambah Link", body: [fUrl, fLabel, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "primary", onClick: function () {
            var url = fUrl._control.value.trim();
            if (!/^https?:\/\/.+/i.test(url)) { errEl.textContent = "Masukkan URL http(s) yang valid."; errEl.style.display = "block"; return; }
            errEl.style.display = "none";
            return PG.store.addTodoLink(todoId, url, fLabel._control.value.trim()).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan link."; errEl.style.display = "block"; return; }
              ui.toast("Link ditambahkan.", "success"); m.close(); after && after();
            });
          } })
        ]
      });
    }
    function uploadFiles(todoId, fileList, after) {
      var files = Array.prototype.slice.call(fileList || []);
      if (!files.length) return;
      var i = 0, okCount = 0;
      ui.toast("Mengunggah " + files.length + " file…");
      (function next() {
        if (i >= files.length) {
          ui.toast(okCount + " dari " + files.length + " file diunggah.", okCount ? "success" : "danger");
          after && after();
          return;
        }
        var f = files[i++];
        // Downscale/re-encode photos before upload — non-images pass through
        // untouched (see assets/js/core/imgresize.js for why this matters).
        (PG.resizeImageFile ? PG.resizeImageFile(f) : Promise.resolve(f)).then(function (out) {
          return PG.store.uploadTodoAttachment(todoId, out);
        }).then(function (res) {
          if (res && res.ok !== false) okCount++;
          else ui.toast((res && res.error) || ("Gagal mengunggah " + f.name), "danger");
          next();
        });
      })();
    }

    /* ---------- todo detail (status/progress + attachments) ---------- */
    function todoDetail(t0) {
      var m = ui.modal({ title: t0.title, body: [], footer: [] });
      var attItems = null;                     // null while loading

      function reloadAtt() { PG.store.todoAttachments(t0.id).then(function (it) { attItems = it; paint(); }); }
      function apply(changes, okMsg) {
        PG.store.updateTodoProgress(t0.id, changes).then(function (res) {
          if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal memperbarui todo.", "danger"); return; }
          ui.toast(okMsg || "Todo diperbarui.", "success");
          render(); paint();
        });
      }
      function removeAtt(a) {
        ui.confirm({ title: "Hapus Lampiran", tone: "danger", confirmLabel: "Hapus",
          message: "Hapus lampiran \"" + (a.label || a.name || a.url) + "\"?",
          onConfirm: function () {
            PG.store.removeTodoAttachment(a.id).then(function (r) {
              if (!r || r.ok === false) { ui.toast((r && r.error) || "Gagal menghapus.", "danger"); return; }
              ui.toast("Lampiran dihapus.", "success"); reloadAtt(); render();
            });
          } });
      }

      function attachSection() {
        var box = h("div", { style: { marginTop: "16px" } },
          h("div", { class: "pg-strong", style: { fontSize: "14px", marginBottom: "8px" } }, "Lampiran Laporan Kerja"));
        if (attItems === null) {
          box.appendChild(h("div", { class: "pg-field__hint", text: "Memuat lampiran…" }));
          return box;
        }
        if (attItems.length) {
          var grid = h("div", { class: "pg-att-grid", style: { marginBottom: "10px" } });
          attItems.forEach(function (a) { grid.appendChild(ui.attachmentTile(a, { onRemove: removeAtt })); });
          box.appendChild(grid);
        } else {
          box.appendChild(h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "0 0 10px" },
            text: "Belum ada lampiran. Tambahkan foto, dokumen, atau link sebagai bukti laporan kerja Anda." }));
        }
        // Snapshot the FileList into a real array BEFORE clearing the input —
        // resetting input.value empties input.files and would drop the selection.
        function onPick(e) {
          var arr = Array.prototype.slice.call(e.target.files || []);
          e.target.value = "";
          uploadFiles(t0.id, arr, function () { reloadAtt(); render(); });
        }
        var camIn = h("input", { type: "file", accept: "image/*", capture: "environment", onchange: onPick });
        var fotoIn = h("input", { type: "file", accept: "image/*", multiple: true, onchange: onPick });
        var fileIn = h("input", { type: "file", accept: FILE_ACCEPT, multiple: true, onchange: onPick });
        box.appendChild(h("div", { class: "pg-att-add" },
          camIn, fotoIn, fileIn,
          ui.button({ label: "Kamera", icon: "camera", variant: "ghost", size: "sm", onClick: function () { camIn.click(); } }),
          ui.button({ label: "Tambah Foto", icon: "image", variant: "ghost", size: "sm", onClick: function () { fotoIn.click(); } }),
          ui.button({ label: "Tambah File", icon: "file", variant: "ghost", size: "sm", onClick: function () { fileIn.click(); } }),
          ui.button({ label: "Tambah Link", icon: "link", variant: "ghost", size: "sm",
            onClick: function () { addLinkFlow(t0.id, function () { reloadAtt(); render(); }); } })
        ));
        return box;
      }

      function noteSection(t) {
        var ta = h("textarea", { class: "pg-textarea", rows: 3,
          placeholder: "Catatan pengerjaan (opsional) — kendala, ringkasan hasil, dll.",
          value: t.userNote || "" });
        var btn = ui.button({ label: "Simpan Catatan", variant: "ghost", size: "sm",
          onClick: function () { apply({ note: ta.value.trim() }, "Catatan disimpan."); } });
        return h("div", { style: { marginTop: "16px" } },
          h("div", { class: "pg-strong", style: { fontSize: "14px", marginBottom: "8px" } }, "Catatan"),
          ta,
          h("div", { style: { marginTop: "8px" } }, btn));
      }

      function paint() {
        var t = PG.store.find("todos", t0.id) || t0;
        // Editing changes t.title, but the modal header was set once at
        // creation (ui.modal({title: t0.title, ...})) — keep it in sync.
        var titleEl = m.el.querySelector(".pg-modal__title");
        if (titleEl) titleEl.textContent = t.title;
        ui.clear(m.body);
        m.body.appendChild(h("div", null,
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" } },
            ui.priorityBadge(t.priority), ui.statusBadge(t.status),
            isOverdue(t) ? ui.badge("Terlambat", "danger") : null,
            isMine(t) ? ui.badge("Todo Anda", "info")
              : (t.createdBySource === "user" ? ui.badge("Dari rekan kerja", "neutral") : null)),
          isMine(t)
            ? h("div", { style: { display: "flex", gap: "8px", marginBottom: "10px" } },
                ui.button({ label: "Edit Todo", icon: "edit", variant: "ghost", size: "sm",
                  onClick: function () { editTodoFlow(t, function () { paint(); }); } }),
                ui.button({ label: "Hapus Todo", icon: "trash", variant: "ghost", size: "sm",
                  onClick: function () { deleteTodoFlow(t, function () { m.close(); }); } }))
            : null,
          h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" }, text: t.description || "—" }),
          h("div", { style: { margin: "12px 0" } }, ui.progressBar(t.progress || 0, { label: "Progress", showPct: true })),
          h("div", { class: "pg-grid pg-grid--2" },
            infoBit("Deadline", t.deadline ? ui.fmtDateWeekdayID(t.deadline) : "—"),
            infoBit("Divisi", PG.store.divisionName(t.divisionId)),
            infoBit("Prioritas", ui.PRIO_LABEL[t.priority] || t.priority),
            infoBit("Dibuat", ui.fmtDateShortID(t.createdAt)),
            infoBit("Ditugaskan oleh", assignedByLabel(t))
          ),
          t.status !== "done"
            ? h("div", { style: { marginTop: "14px" } },
                h("div", { class: "pg-field__hint", style: { marginBottom: "6px" }, text: "Perbarui progress" }),
                h("div", { class: "pg-progress-steps" }, [25, 50, 75].map(function (p) {
                  return ui.button({ label: p + "%", variant: (t.progress || 0) >= p ? "primary" : "ghost", size: "sm",
                    onClick: function () { apply({ progress: p }, "Progress diperbarui."); } });
                })))
            : null,
          noteSection(t),
          attachSection()
        ));
        var foot = m.el.querySelector(".pg-modal__footer");
        ui.clear(foot);
        if (t.status === "todo") {
          foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
          foot.appendChild(ui.button({ label: "Mulai Kerjakan", variant: "primary", icon: "clock",
            onClick: function () { apply({ status: "in_progress" }, "Todo dimulai."); } }));
        } else if (t.status === "in_progress") {
          foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
          foot.appendChild(ui.button({ label: "Tandai Selesai", variant: "primary", icon: "check",
            onClick: function () { apply({ status: "done" }, "Todo selesai. Kerja bagus!"); } }));
        } else {
          foot.appendChild(ui.button({ label: "Buka Lagi", variant: "ghost", icon: "clock",
            onClick: function () { apply({ status: "in_progress", progress: 50 }, "Todo dibuka kembali."); } }));
          foot.appendChild(ui.button({ label: "Tutup", variant: "primary", onClick: function () { m.close(); } }));
        }
      }
      reloadAtt();
      paint();
    }

    /* ---------- Daftar Tugas ---------- */
    function render() {
      ui.clear(list);
      var all = PG.store.todosForUser(ctx.user.id);
      // Angka pada tab: jumlah todo aktif (belum selesai) & selesai.
      var nActive = all.filter(function (t) { return t.status !== "done"; }).length;
      TABS[0].label = "Semua" + (all.length ? " · " + all.length : "");
      TABS[1].label = "Aktif" + (nActive ? " · " + nActive : "");
      TABS[2].label = "Selesai" + ((all.length - nActive) ? " · " + (all.length - nActive) : "");
      renderTabs();
      var rows = all.filter(function (t) {
        if (state.filter === "active") return t.status !== "done";
        if (state.filter === "done") return t.status === "done";
        return true;
      }).sort(function (a, b) {
        // Belum selesai selalu tampil duluan (di tab "Semua"); di antara todo
        // yang SUDAH selesai, yang paling baru diselesaikan tampil paling
        // atas — sebelumnya diurutkan naik berdasarkan deadline lama, jadi
        // todo yang baru saja rampung terkubur di halaman-halaman belakang.
        var aDone = a.status === "done", bDone = b.status === "done";
        if (aDone !== bDone) return aDone ? 1 : -1;
        if (aDone) {
          var ac = a.completedAt || a.deadline || "", bc = b.completedAt || b.deadline || "";
          return ac > bc ? -1 : ac < bc ? 1 : 0;
        }
        var ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        var ad = a.deadline || "9999-12-31", bd = b.deadline || "9999-12-31";
        return ad < bd ? -1 : ad > bd ? 1 : 0;
      });

      if (!all.length) {
        list.appendChild(ui.emptyState({ icon: "checklist", title: "Belum ada todo.",
          text: "Todo yang ditugaskan oleh Admin akan muncul di sini." }));
        return;
      }
      if (!rows.length) {
        list.appendChild(ui.emptyState({ icon: "checklist", title: "Tidak ada todo di kategori ini.",
          text: "Pilih kategori lain." }));
        return;
      }

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var start = (state.page - 1) * PER_PAGE;
      var pageRows = rows.slice(start, start + PER_PAGE);

      pageRows.forEach(function (t) {
        var cls = "pg-todo-item pg-todo-item--" + (t.priority || "low");
        list.appendChild(
          h("button", { class: cls, style: { textAlign: "left" }, onclick: function () { todoDetail(t); } },
            h("div", { class: "pg-todo-item__head" },
              h("div", { class: "pg-todo-item__title" }, svg("checklist"), h("span", { text: t.title })),
              t.programName ? h("span", { class: "pg-badge pg-badge--neutral", style: { flex: "none" },
                title: "Program: " + t.programName, text: "Program" }) : null,
              isMine(t) ? h("span", { class: "pg-badge pg-badge--info", style: { flex: "none" }, text: "Anda" }) : null,
              svg("chevronRight")
            ),
            (!isMine(t) && t.createdBySource === "user")
              ? h("div", { class: "pg-todo-item__note" }, svg("user"),
                  h("span", { text: "Ditugaskan oleh " + assignedByLabel(t) }))
              : null,
            t.userNote
              ? h("div", { class: "pg-todo-item__note" }, svg("edit"),
                  h("span", { text: t.userNote.length > 50 ? t.userNote.slice(0, 50) + "…" : t.userNote }))
              : null,
            ui.progressBar(t.progress || 0),
            h("div", { class: "pg-todo-item__foot" },
              h("span", { style: isOverdue(t) ? { color: "var(--pg-danger)", fontWeight: "600" } : null },
                t.deadline ? ui.fmtDateShortID(t.deadline) : "Tanpa deadline",
                isOverdue(t) ? " · Terlambat" : ""),
              ui.statusBadge(t.status),
              h("span", { text: (t.progress || 0) + "%" }),
              t.attachmentCount
                ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: "3px" } },
                    svg("paperclip"), String(t.attachmentCount))
                : null
            )
          )
        );
      });

      if (pageCount > 1) {
        list.appendChild(ui.pager({
          page: state.page, pageCount: pageCount,
          info: "Hal. " + state.page + "/" + pageCount + " · " + rows.length + " todo",
          onPage: function (n) { state.page = n; render(); }
        }));
      }
    }

    function renderTabs() {
      ui.mount(tabsHost, ui.pillTabs(TABS, state.filter,
        function (k) { state.filter = k; state.page = 1; renderTabs(); render(); }, true));
    }

    /* ---------- Arsip Lampiran (this user's uploads) — grid ---------- */
    var arch = { kind: "", q: "", page: 1, data: null };
    function loadArch() {
      renderArch();
      PG.store.myAttachmentArchive({ kind: arch.kind, q: arch.q, page: arch.page })
        .then(function (d) { arch.data = d; renderArch(); })
        .catch(function () { arch.data = { items: [], total: 0, page: 1, pageCount: 1 }; renderArch(); });
    }
    function renderArch() {
      ui.clear(archHost);
      var KIND_TABS = [{ key: "", label: "Semua" }, { key: "image", label: "Foto" }, { key: "file", label: "Dokumen" }, { key: "link", label: "Link" }];
      archHost.appendChild(ui.pillTabs(KIND_TABS, arch.kind, function (k) { arch.kind = k; arch.page = 1; loadArch(); }, true));
      archHost.appendChild(h("div", { style: { margin: "10px 0" } },
        h("input", { class: "pg-input", type: "search", placeholder: "Cari judul todo / nama file…", value: arch.q,
          onchange: function (e) { arch.q = e.target.value; arch.page = 1; loadArch(); } })));

      if (!arch.data) {
        archHost.appendChild(ui.emptyState({ icon: "archive", title: "Memuat arsip…" }));
        return;
      }
      var d = arch.data;
      var scoped = arch.kind || arch.q;
      if (!d.items.length) {
        archHost.appendChild(ui.emptyState({ icon: "archive",
          title: scoped ? "Tidak ada lampiran untuk filter ini." : "Belum ada lampiran laporan.",
          text: scoped ? "Ubah filter." : "File & link yang Anda lampirkan pada todo akan terkumpul di sini." }));
        return;
      }
      archHost.appendChild(h("div", { class: "pg-muted", style: { fontSize: "12px", marginBottom: "8px" },
        text: "Menampilkan " + d.items.length + " dari " + d.total + " lampiran." }));
      var grid = h("div", { class: "pg-att-archive-grid pg-att-archive-grid--2col" });
      d.items.forEach(function (a) {
        grid.appendChild(h("div", { class: "pg-arch-card" },
          h("div", { class: "pg-arch-card__body" }, ui.attachmentCover(a)),
          h("div", { class: "pg-arch-card__foot" },
            h("div", { class: "pg-arch-card__todo", text: a.todoTitle || "Todo" }),
            h("div", { class: "pg-arch-card__date", text: (a.label ? a.label + " · " : "") + ui.fmtDateShortID(a.createdAt) })),
          h("div", { class: "pg-arch-card__act" },
            ui.button({ label: "Buka", icon: "external",
              variant: "ghost", size: "sm", onClick: function () { ui.openAttachment(a); } }),
            ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus lampiran", title: "Hapus",
              onClick: function () {
                ui.confirm({ title: "Hapus Lampiran", tone: "danger", confirmLabel: "Hapus",
                  message: "Hapus lampiran ini dari todo & arsip?",
                  onConfirm: function () {
                    PG.store.removeTodoAttachment(a.id).then(function (r) {
                      if (!r || r.ok === false) { ui.toast((r && r.error) || "Gagal menghapus.", "danger"); return; }
                      ui.toast("Lampiran dihapus.", "success"); loadArch(); render();
                    });
                  } });
              } }))
        ));
      });
      archHost.appendChild(grid);
      if (d.pageCount > 1) {
        archHost.appendChild(ui.pager({ page: d.page, pageCount: d.pageCount,
          info: "Hal. " + d.page + "/" + d.pageCount + " · " + d.total + " lampiran",
          onPage: function (n) { arch.page = n; loadArch(); } }));
      }
    }

    /* ---------- header: title + arsip toggle ---------- */
    function buildHeader() {
      var top;
      if (view === "tugas") {
        top = h("div", { class: "pg-uheader__top" },
          h("div", { class: "pg-uheader__title", style: { flex: "1" }, text: "Todo List" }),
          h("button", { class: "pg-uheader__iconbtn", type: "button", "aria-label": "Buka Arsip Lampiran",
            title: "Arsip Lampiran", onclick: function () { view = "arsip"; paintView(); } }, svg("archive")));
      } else {
        top = h("div", { class: "pg-uheader__top" },
          h("button", { class: "pg-uheader__iconbtn", type: "button", "aria-label": "Kembali ke Daftar Tugas",
            onclick: function () { view = "tugas"; paintView(); } }, svg("chevronLeft")),
          h("div", { class: "pg-uheader__title", style: { flex: "1" }, text: "Arsip Lampiran" }),
          h("span", { style: { width: "38px", flex: "none" } }));
      }
      ui.mount(headerHost, h("header", { class: "pg-uheader pg-uheader--tight" }, top));
    }

    /* ---------- view switch ---------- */
    function paintView() {
      buildHeader();
      fab.hidden = view !== "tugas";
      ui.clear(bodyHost);
      if (view === "tugas") {
        bodyHost.appendChild(tabsHost);
        bodyHost.appendChild(list);
        renderTabs(); render();
      } else {
        bodyHost.appendChild(archHost);
        if (!arch.data) loadArch(); else renderArch();
      }
    }

    paintView();
    ui.live(function () {
      // only the live task list needs a store-driven redraw; the archive view
      // manages its own fetched data.
      if (view === "tugas") { renderTabs(); render(); }
    }, bodyHost);
    return screen(headerHost, [bodyHost, fab]);
  };

  /* ============================================================
     PROFIL SAYA  (Phase 2 — real master data from the shared store)
     ============================================================ */
  pages.profil = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Profil Saya");
    var host = h("div", { style: { display: "flex", flexDirection: "column", gap: "var(--pg-s-4)" } });
    var busy = false;

    function row(label, value, node) {
      return h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: label }),
          node || h("div", { class: "pg-history-row__d", text: value || "—" })
        )
      );
    }

    /* hidden picker — reused for every "Ubah Foto" tap */
    var fileInput = h("input", {
      type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", style: { display: "none" },
      onchange: function () {
        var f = this.files && this.files[0];
        this.value = "";
        if (!f || busy) return;
        if (!/^image\/(png|jpe?g|webp|gif)$/i.test(f.type)) { ui.toast("Foto harus berformat JPG, PNG, WebP, atau GIF.", "danger"); return; }
        if (f.size > 20 * 1024 * 1024) { ui.toast("Ukuran foto maksimal 20 MB.", "danger"); return; }
        busy = true; ui.toast("Mengunggah foto…");
        // Downscale to a sensible avatar size before upload — see
        // assets/js/core/imgresize.js. A raw phone photo has no business
        // being uploaded full-size just to display as a small round avatar.
        (PG.resizeImageFile ? PG.resizeImageFile(f, { maxEdge: 720, quality: 0.85 }) : Promise.resolve(f)).then(function (out) {
          return store.setMyProfilePhoto(out);
        }).then(function (res) {
          busy = false;
          if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengunggah foto.", "danger"); return; }
          // Warm the authenticated photo cache with the new (content-versioned)
          // url before we paint, so the avatar swaps straight in and then stays.
          var fresh = PG.auth.currentUser();
          var url = fresh && fresh.photoUrl;
          var settled = false;
          var finish = function () {
            if (settled) return; settled = true;
            ui.toast("Foto profil diperbarui.", "success");
            render();
          };
          if (url) {
            store.photoObjectUrl(url).then(finish, finish);
            setTimeout(finish, 4000);   // never hang on a slow network
          } else { finish(); }
        });
      }
    });

    function removePhoto() {
      if (busy) return;
      ui.confirm({
        title: "Hapus foto profil", confirmLabel: "Hapus", tone: "danger",
        message: "Foto profil Anda akan dihapus dan diganti inisial nama. Lanjutkan?",
        onConfirm: function () {
          busy = true;
          store.removeMyProfilePhoto().then(function (res) {
            busy = false;
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus foto.", "danger"); return; }
            ui.toast("Foto profil dihapus.", "success");
            render();
          });
        }
      });
    }

    function openEdit(u) {
      var fName = ui.field({ label: "Nama Lengkap", value: u.fullName, required: true });
      var fUser = ui.field({ label: "Username", value: u.username, required: true,
        hint: "3–60 karakter: huruf kecil, angka, titik, garis bawah, atau strip. Dipakai untuk login." });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      function bad(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
      var m = ui.modal({
        title: "Edit Profil", class: "pg-modal--form",
        body: [fName, fUser, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "accent", onClick: function () {
            errEl.style.display = "none";
            var name = fName._control.value.trim();
            var uname = fUser._control.value.trim().toLowerCase();
            if (!name) return bad("Nama lengkap wajib diisi.");
            if (name.length > 150) return bad("Nama lengkap maksimal 150 karakter.");
            if (!/^[a-z0-9._-]{3,60}$/.test(uname)) return bad("Format username tidak valid (3–60 karakter, huruf kecil/angka/titik/garis bawah/strip).");
            var payload = {};
            if (name !== u.fullName) payload.fullName = name;
            if (uname !== u.username) payload.username = uname;
            if (!payload.fullName && !payload.username) { m.close(); return; }
            return store.updateMyProfile(payload).then(function (res) {
              if (!res || res.ok === false) { bad((res && res.error) || "Gagal menyimpan perubahan."); return; }
              m.close();
              ui.toast("Profil diperbarui.", "success");
              render();
            });
          } })
        ]
      });
    }

    function render() {
      var u = PG.auth.currentUser() || ctx.user;

      var identity = ui.card({ body: [
        h("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
          userAvatar(u, 64),
          h("div", { style: { minWidth: "0" } },
            h("div", { class: "pg-strong", style: { fontSize: "16px" }, text: u.fullName }),
            h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + u.username })
          )
        ),
        h("div", { style: { display: "flex", gap: "10px", marginTop: "14px", flexWrap: "wrap" } },
          ui.button({ label: "Ubah Foto", variant: "ghost", icon: "camera",
            onClick: function () { if (!busy) fileInput.click(); } }),
          u.photoUrl
            ? ui.button({ label: "Hapus Foto", variant: "ghost", icon: "trash", onClick: removePhoto })
            : null
        )
      ]});

      var editCard = ui.card({ title: "Akun", body: [
        row("Nama Lengkap", u.fullName),
        row("Username", "@" + u.username),
        h("div", { style: { marginTop: "12px" } },
          ui.button({ label: "Edit Nama & Username", variant: "accent", icon: "edit", block: true,
            onClick: function () { openEdit(u); } }))
      ]});

      var detail = ui.card({ title: "Data Karyawan", body: [
        row("Jabatan", u.positionLabel),
        row("Divisi", (u.divisionLabels && u.divisionLabels.length) ? u.divisionLabels.join(", ") : u.divisionLabel),
        row("Status", null, h("div", null, ui.statusBadge(u.status)))
      ]});

      var note = ui.notice("Anda dapat mengubah nama, username, dan foto profil di sini. Jabatan, divisi, dan status dikelola oleh Admin melalui Manajemen Tim.", { muted: true });

      var logout = ui.button({ label: "Keluar", variant: "ghost", block: true, icon: "logout",
        onClick: function () {
          ui.confirm({
            title: "Keluar dari aplikasi", confirmLabel: "Keluar", tone: "danger",
            message: "Anda yakin ingin keluar? Anda perlu memasukkan username lagi untuk masuk.",
            onConfirm: function () { PG.auth.logout(); ctx.router.replace("/login"); }
          });
        } });

      ui.clear(host);
      ui.append(host, [fileInput, identity, editCard, detail, ui.pushToggleCard(), note, logout]);
    }

    render();
    return screen(header, [host]);
  };

  /* ============================================================
     COMPANY QUICK-ACCESS FEATURES  (frames only — wired in later phases)
     Lapor KPI · Program · Job Desk · Kunjungan · Rekapan Absensi.
     Each screen shows the intended structure + a "next phase" notice;
     no store writes and no schema changes yet (menunggu arahan fase).
     ============================================================ */
  function frameIntro(icon, title, text) {
    return ui.card({ body: [
      h("div", { class: "pg-ministat__label" }, svg(icon), title),
      h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6", marginTop: "6px" }, text: text })
    ]});
  }
  function frameNote(text) { return ui.notice(text, { muted: true }); }

  /* ---- Lapor KPI : employee fills their division's KPI form for a period ---- */
  pages.laporKpi = function (ctx) {
    var headerHost = h("div");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var st = { templates: null, tid: "", form: null, loading: false, history: null, editingId: null, view: "form",
      histFilter: { store: "", month: "" }, histPage: 1 };

    function renderHeader() {
      ui.clear(headerHost);
      var onBack = function () {
        if (st.view === "history") { st.view = "form"; render(); }
        else ctx.router.go("/dashboard");
      };
      var right = st.view === "form"
        ? h("button", { class: "pg-uheader__textbtn", type: "button",
            onclick: function () { st.view = "history"; render(); loadHistory(); } },
            svg("clock"), h("span", { text: "Riwayat" }))
        : h("button", { class: "pg-uheader__textbtn", type: "button",
            onclick: function () { st.view = "form"; newReport(); } },
            svg("plus"), h("span", { text: "Laporan Baru" }));
      headerHost.appendChild(h("header", { class: "pg-uheader pg-uheader--tight" },
        h("div", { class: "pg-uheader__top" },
          h("button", { class: "pg-uheader__iconbtn", type: "button", "aria-label": "Kembali", onclick: onBack }, svg("chevronLeft")),
          h("div", { class: "pg-uheader__title", style: { flex: "1" },
            text: st.view === "form" ? "Lapor KPI" : "Riwayat Laporan KPI" }),
          right)));
    }

    function num(v) { var n = parseFloat(v); return isNaN(n) ? 0 : n; }
    function fmtNum(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("id-ID"); }
    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }
    function pctText(v) { return v == null ? "—" : (Math.round(v * 10) / 10) + "%"; }
    function itemVal(n, it) { return it && it.isMoney ? moneyID(n) : fmtNum(n); }
    function scoreTone(pct) {
      var b = PG.store.kpiBand(pct);
      return b === "tercapai" ? "success" : b === "progres" ? "warning" : b === "kurang" ? "danger" : "neutral";
    }
    function statusBadge(s) {
      return ui.badge(s === "reviewed" ? "Direview" : s === "submitted" ? "Terkirim" : "Draft",
        s === "reviewed" ? "success" : s === "submitted" ? "info" : "neutral");
    }
    // "Toko" for a report: the store picked from the managed list, falling
    // back to the free-typed name (older reports / no active store list at
    // the time) and finally the template name so a row is never blank.
    function reportStoreLabel(r) { return r.storeName || r.subject || r.templateName || "Tanpa Nama"; }
    function reportMonthKey(r) { var d = r.periodStart || r.periodEnd; return d ? String(d).slice(0, 7) : ""; }
    var HIST_MO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    function monthLabel(ym) {
      if (!ym || ym.indexOf("-") < 0) return ym || "";
      var p = ym.split("-");
      return (HIST_MO[(+p[1] || 1) - 1] || p[1]) + " " + p[0];
    }

    /* client-side score — mirrors kpi.php pg_kpi_compute() */
    function compute(items, actuals, method) {
      var rows = {};
      function resolve(node) {
        var a, t;
        if (node.children && node.children.length) {
          a = 0; t = 0;
          node.children.forEach(function (c) { var r = resolve(c); a += r.a; t += r.t; });
        } else {
          a = num(actuals[node.id]); t = node.target || 0;
        }
        // Cap at 100% here (the single source both the live preview and the
        // total below read) — an overachieved indicator must never show more
        // than 100%, and must never offset another indicator's shortfall
        // once it is averaged/summed into totalPct.
        rows[node.id] = { a: a, t: t, pct: t > 0 ? Math.min(100, Math.round(a / t * 1000) / 10) : null };
        return { a: a, t: t };
      }
      items.forEach(resolve);

      // Hierarchical bobot (weight) per item — see PG.store.kpiItemWeights()
      // for the algorithm (shared with the Setting KPI builder preview).
      var weights = PG.store.kpiItemWeights(items);
      Object.keys(weights).forEach(function (id) { if (rows[id]) rows[id].weight = weights[id]; });

      // Every scoring LEAF — never a grouping parent (it exists purely to
      // roll up its children's actual/target into its own informational
      // badge, and is never itself one of the scored indicators).
      var leaves = [];
      (function collect(list) {
        list.forEach(function (node) {
          if (node.children && node.children.length) { collect(node.children); return; }
          leaves.push(node);
        });
      })(items);

      var totalPct = 0;
      if (method === "weighted_sum") {
        // Sum every leaf, each capped at ITS OWN target before summing — a
        // bigger indicator counts for more, proportional to its size, but one
        // leaf overachieving can never make up for another's shortfall.
        var sa = 0, stt = 0;
        leaves.forEach(function (node) {
          var r = rows[node.id];
          if (node.isOptional || r.t <= 0) return;
          stt += r.t; sa += Math.min(r.a, r.t);
        });
        totalPct = stt > 0 ? Math.round(sa / stt * 10000) / 100 : 0;
      } else {
        // percent_avg: each scoring leaf counts in proportion to its
        // HIERARCHICAL weight (bobot) — 5 top-level indicators with no
        // sub-indicators -> each worth 100/5 = 20%; if one of those has 4
        // sub-indicators instead, that 20% share splits evenly across its 4
        // subs -> 5% each. Excluded leaves (Opsional / no target) drop out of
        // both sides of the ratio, so the remaining leaves' weights still sum
        // to a clean 100% among themselves. Each leaf's pct is already capped
        // at 100 in resolve() above, so a weighted average of them can never
        // let one leaf's overachievement offset another's shortfall.
        var weightSum = 0, weightedPct = 0;
        leaves.forEach(function (node) {
          var r = rows[node.id];
          if (node.isOptional || r.t <= 0) return;
          var w = r.weight || 0;
          weightSum += w; weightedPct += w * (r.pct == null ? 0 : r.pct);
        });
        totalPct = weightSum > 0 ? Math.round(weightedPct / weightSum * 100) / 100 : 0;
      }
      // How many leaves actually count toward the score (excludes Opsional /
      // untargeted rows) — handed back so the UI can show a leaf count.
      var scoringLeafCount = leaves.filter(function (node) {
        var r = rows[node.id];
        return !node.isOptional && r.t > 0;
      }).length;
      return { rows: rows, totalPct: totalPct, scoringLeafCount: scoringLeafCount };
    }

    function loadTemplates() {
      PG.store.kpiMyTemplates().then(function (d) {
        st.templates = (d && d.templates) || [];
        if (!st.tid && st.templates.length === 1) st.tid = st.templates[0].id;
        if (st.tid) loadForm(); else render();
      }).catch(function () { st.templates = []; render(); });
    }
    function loadHistory() {
      PG.store.kpiMyReports().then(function (d) { st.history = (d && d.reports) || []; render(); }).catch(function () { st.history = []; render(); });
    }
    function loadForm() {
      st.loading = true; render();
      var params = { templateId: st.tid };
      if (st.editingId) params.reportId = st.editingId;
      PG.store.kpiMyReport(params).then(function (d) {
        st.loading = false;
        st.form = (d && d.ok !== false) ? d : null;
        render();
      }).catch(function () { st.loading = false; st.form = null; render(); });
    }
    function newReport() { st.view = "form"; st.editingId = null; st.form = null; loadForm(); }

    function render() {
      renderHeader();
      ui.clear(host);

      if (st.view === "history") { renderHistory(); return; }

      host.appendChild(frameIntro("target", "Lapor KPI Saya",
        "Buat laporan KPI per toko — isi nama toko, pekan, periode, dan capaian aktual tiap indikator, lalu kirim ke Admin. Laporan yang sudah dibuat ada di menu Riwayat."));

      if (st.templates === null) { host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Memuat…" })] })); return; }
      if (!st.templates.length) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Belum ada form KPI untuk Anda.",
          text: "Admin belum membuat template KPI untuk divisi Anda." })] }));
        return;
      }
      if (st.templates.length > 1) {
        var sel = h("select", { class: "pg-select",
          onchange: function (e) { st.tid = e.target.value; st.editingId = null; st.form = null; if (st.tid) loadForm(); else render(); } },
          [{ value: "", label: "— Pilih form KPI —" }].concat(st.templates.map(function (t) { return { value: t.id, label: t.name }; }))
            .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(st.tid) }); }));
        host.appendChild(ui.card({ body: [h("div", { class: "pg-field" },
          h("label", { class: "pg-field__label", text: "Form KPI" }), sel)] }));
      }

      if (!st.tid) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Pilih form KPI di atas untuk mulai melapor." })] }));
        return;
      }
      if (st.loading && !st.form) { host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Memuat form…" })] })); return; }
      if (!st.form) { host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Gagal memuat form." })] })); return; }

      renderForm();
    }

    var WEEK_OPTS = [{ value: "", label: "— Pilih pekan —" }, { value: "1", label: "Pekan 1" },
      { value: "2", label: "Pekan 2" }, { value: "3", label: "Pekan 3" }, { value: "4", label: "Pekan 4" }];

    function renderForm() {
      var f = st.form, t = f.template, items = f.items || [];
      var rep = f.report;
      var locked = !!f.locked;

      var inputs = {}, actuals = {};
      (function seed(list) {
        list.forEach(function (node) {
          if (node.children && node.children.length) { seed(node.children); return; }
          actuals[node.id] = f.values[node.id] ? f.values[node.id].actual : 0;
        });
      })(items);

      // Hierarchical bobot (percent_avg only): 100% split evenly across the
      // top-level indicators, then each indicator's own share split evenly
      // across ITS sub-indicators — e.g. 5 indicators with no subs -> each
      // 20%; one of those with 4 subs instead -> that 20% splits into 5%
      // per sub. Structural (sibling COUNT), so it never changes as actuals
      // are typed. weighted_sum instead weighs each leaf by its own target
      // size, so no bobot applies there. See PG.store.kpiItemWeights().
      var showWeight = t.scoreMethod !== "weighted_sum";
      var itemWeights = PG.store.kpiItemWeights(items);
      function weightPctOf(id) {
        var w = itemWeights[id];
        return w == null ? null : Math.round(w * 10) / 10;
      }
      var topCount = items.length;
      var topWeightPct = topCount > 0 ? Math.round((100 / topCount) * 10) / 10 : null;
      var scoringLeafCount = 0;
      (function countLeaves(list) {
        list.forEach(function (node) {
          if (node.children && node.children.length) { countLeaves(node.children); return; }
          if (!node.isOptional && node.target > 0) scoringLeafCount++;
        });
      })(items);

      var totalEl = h("div", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums", fontSize: "18px" } });
      var scoreEls = {};
      function recalc() {
        Object.keys(inputs).forEach(function (id) { actuals[id] = num(inputs[id].value); });
        var c = compute(items, actuals, t.scoreMethod);
        Object.keys(scoreEls).forEach(function (id) {
          var r = c.rows[id];
          scoreEls[id].textContent = (r && r.pct != null) ? pctText(r.pct) : "—";
        });
        totalEl.textContent = "Total: " + pctText(c.totalPct);
      }

      function itemRow(node, isSub) {
        var hasKids = node.children && node.children.length;
        var scoreEl = h("span", { class: "pg-kpi-fill__pct" });
        scoreEls[node.id] = scoreEl;

        var control;
        if (hasKids) {
          control = h("div", { class: "pg-kpi-fill__auto", text: "Otomatis dijumlahkan dari sub-indikator" });
        } else {
          var inp = h("input", { class: "pg-input pg-kpi-fill__input", type: "number", inputmode: "decimal", disabled: locked,
            placeholder: "Masukkan capaian aktual", value: actuals[node.id] || "", oninput: recalc });
          inputs[node.id] = inp;
          control = inp;
        }

        var wPct = weightPctOf(node.id);
        return h("div", { class: "pg-kpi-fill__row" + (isSub ? " is-sub" : "") },
          h("div", { class: "pg-kpi-fill__top" },
            h("span", { class: "pg-kpi-fill__name" }, (isSub ? "↳ " : "") + node.label,
              node.isMoney ? h("span", { class: "pg-badge pg-badge--info", style: { marginLeft: "6px" }, text: "Rp" }) : null,
              node.isOptional ? h("span", { class: "pg-badge pg-badge--neutral", style: { marginLeft: "6px" }, text: "Opsional" }) : null),
            scoreEl),
          h("div", { class: "pg-kpi-fill__hint",
            text: hasKids
              ? (showWeight && wPct != null ? "Bobot " + wPct + "% (dibagi rata ke " + node.children.length + " sub-indikator)" : "")
              : (node.target > 0
                ? "Target: " + itemVal(node.target, node) +
                  (showWeight && !node.isOptional && wPct != null ? " · Bobot " + wPct + "%" : "")
                : "Tanpa target — informasi saja") }),
          control);
      }

      var rows = [];
      items.forEach(function (it) { rows.push(itemRow(it, false)); (it.children || []).forEach(function (c) { rows.push(itemRow(c, true)); }); });

      // Toko is chosen from the managed list (Manajemen Toko). Keep a
      // now-inactive store visible when editing an older report.
      var activeStores = PG.store.all("stores").filter(function (s) { return s.status === "active"; });
      if (rep && rep.storeId && !activeStores.some(function (s) { return String(s.id) === String(rep.storeId); })) {
        var cur = PG.store.find("stores", rep.storeId);
        if (cur) activeStores = activeStores.concat([Object.assign({}, cur, { name: cur.name + " (nonaktif)" })]);
      }
      var usingStoreSelect = activeStores.length > 0;
      var fStore;
      if (usingStoreSelect) {
        fStore = h("select", { class: "pg-select", disabled: locked },
          [{ value: "", label: "— Pilih toko —" }].concat(activeStores.map(function (s) { return { value: s.id, label: s.name }; }))
            .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String((rep && rep.storeId) || "") }); }));
      } else {
        fStore = h("input", { class: "pg-input", type: "text", disabled: locked,
          placeholder: "cth. Premiere Sayang Istri", value: (rep && rep.subject) || "" });
      }
      var fWeek = h("select", { class: "pg-select", disabled: locked },
        WEEK_OPTS.map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String((rep && rep.weekNo) || "") }); }));
      var fStart = h("input", { class: "pg-input", type: "date", disabled: locked, value: (rep && rep.periodStart) || "" });
      var fEnd = h("input", { class: "pg-input", type: "date", disabled: locked, value: (rep && rep.periodEnd) || "" });
      var fNote = h("textarea", { class: "pg-textarea", rows: 3, disabled: locked,
        placeholder: "Catatan untuk laporan ini (opsional) — kendala, ringkasan, penjelasan capaian…",
        value: (rep && rep.note) || "" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });

      function save(status) {
        errEl.style.display = "none";
        if (fStart.value && fEnd.value && fEnd.value < fStart.value) {
          errEl.textContent = "Tanggal selesai tidak boleh sebelum tanggal mulai."; errEl.style.display = "block"; return;
        }
        if (usingStoreSelect && status === "submitted" && !fStore.value) {
          errEl.textContent = "Pilih toko yang dilaporkan."; errEl.style.display = "block"; return;
        }
        /* returns the write promise so the submit button auto-guards against
           a slow-server double-submit (see ui.button). */
        var payload = {
          templateId: st.tid, status: status,
          storeId: usingStoreSelect ? (fStore.value || null) : null,
          subject: usingStoreSelect ? "" : fStore.value.trim(),
          weekNo: fWeek.value || null,
          periodStart: fStart.value || null,
          periodEnd: fEnd.value || null,
          note: fNote.value.trim(),
          values: Object.keys(inputs).map(function (id) {
            return { itemId: id, actual: num(inputs[id].value) };
          })
        };
        if (st.editingId) payload.reportId = st.editingId;
        return PG.store.kpiMyReportSave(payload).then(function (res) {
          if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
          var saved = res.data && res.data.report;
          if (status === "submitted") {
            ui.toast("Laporan KPI terkirim.", "success");
            newReport();
          } else {
            ui.toast("Draft disimpan.", "success");
            st.editingId = saved ? saved.id : st.editingId;
            st.form = null; loadForm();
          }
          loadHistory();
        });
      }

      var fieldGrid = h("div", { class: "pg-grid pg-grid--2" },
        h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Toko" }), fStore),
        h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Pekan" }), fWeek),
        h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Tanggal Mulai" }), fStart),
        h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Tanggal Selesai" }), fEnd));

      host.appendChild(ui.card({
        title: t.name + (st.editingId ? " — Edit Laporan" : " — Laporan Baru"),
        action: st.editingId ? ui.button({ label: "Laporan Baru", variant: "ghost", size: "sm", icon: "plus", onClick: newReport }) : null,
        body: [
          usingStoreSelect ? null : ui.notice("Belum ada data toko. Minta Admin menambahkan di menu Manajemen Toko, atau ketik nama toko manual di atas.", { muted: true }),
          fieldGrid,
          locked ? ui.notice("Laporan ini sudah direview admin dan terkunci.", { muted: true }) : null,
          h("div", { class: "pg-kpi-fill__title" }, "Indikator KPI"),
          h("div", { class: "pg-kpi-fill" }, rows),
          h("div", { class: "pg-field", style: { marginTop: "4px" } },
            h("label", { class: "pg-field__label", text: "Catatan Laporan (opsional)" }), fNote),
          h("div", { class: "pg-kpi-fill__total" },
            h("span", { class: "pg-muted", style: { fontSize: "12px" },
              text: PG.store.kpiMethodLabel(t.scoreMethod) +
                (showWeight && topCount > 0 ? " · " + topCount + " indikator × " + topWeightPct + "%" : "") +
                (showWeight ? " · " + scoringLeafCount + " indikator/sub dinilai" : "") }),
            totalEl),
          errEl,
          locked ? null : h("div", { style: { display: "flex", gap: "8px" } },
            ui.button({ label: "Simpan Draft", variant: "ghost", block: true, onClick: function () { return save("draft"); } }),
            ui.button({ label: st.editingId ? "Simpan & Kirim" : "Kirim", variant: "accent", block: true, icon: "check", onClick: function () { return save("submitted"); } }))
        ]
      }));
      recalc();
    }

    function periodLine(r) {
      if (r.periodStart && r.periodEnd) return ui.fmtDateShortID(r.periodStart) + " – " + ui.fmtDateShortID(r.periodEnd);
      return r.periodLabel || (r.weekNo ? "Pekan " + r.weekNo : "—");
    }

    var HIST_PER_PAGE = 10;
    function renderHistory() {
      host.appendChild(frameIntro("clock", "Riwayat Laporan KPI",
        "Semua laporan KPI yang pernah Anda buat. Saring dengan Toko/Bulan, bandingkan pencapaian antar pekan pada diagram, lalu buka baris tabel untuk rincian atau ubah/hapus laporan yang belum direview Admin."));

      if (st.history === null) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Memuat riwayat…" })] }));
        return;
      }
      var all = st.history || [];
      if (!all.length) {
        host.appendChild(ui.card({ body: [
          ui.emptyState({ icon: "target", title: "Belum ada laporan.", text: "Laporan KPI yang Anda buat akan tercatat di sini.",
            action: ui.button({ label: "Tulis Laporan KPI", variant: "accent", icon: "plus",
              onClick: function () { st.view = "form"; newReport(); } }) })] }));
        return;
      }

      // ---- Filter bar: Toko + Bulan (built from the full unfiltered history,
      // so switching one filter never hides options for the other). ----
      var storeOpts = [], seenStores = {};
      all.forEach(function (r) {
        var label = reportStoreLabel(r);
        if (!seenStores[label]) { seenStores[label] = true; storeOpts.push(label); }
      });
      storeOpts.sort(function (a, b) { return a.localeCompare(b, "id"); });

      var monthOpts = [], seenMonths = {};
      all.forEach(function (r) {
        var mk = reportMonthKey(r);
        if (mk && !seenMonths[mk]) { seenMonths[mk] = true; monthOpts.push(mk); }
      });
      monthOpts.sort().reverse();

      function setHistFilter(fn) { fn(); st.histPage = 1; render(); }
      var fStore = h("select", { class: "pg-select",
          onchange: function (e) { setHistFilter(function () { st.histFilter.store = e.target.value; }); } },
        [h("option", { value: "", text: "Semua Toko" })].concat(
          storeOpts.map(function (s) { return h("option", { value: s, text: s, selected: st.histFilter.store === s }); })));
      var fMonth = h("select", { class: "pg-select",
          onchange: function (e) { setHistFilter(function () { st.histFilter.month = e.target.value; }); } },
        [h("option", { value: "", text: "Semua Bulan" })].concat(
          monthOpts.map(function (m) { return h("option", { value: m, text: monthLabel(m), selected: st.histFilter.month === m }); })));
      var hasHistFilter = !!(st.histFilter.store || st.histFilter.month);

      host.appendChild(ui.card({ body: [
        h("div", { class: "pg-grid pg-grid--2" },
          h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Toko" }), fStore),
          h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Bulan" }), fMonth)),
        hasHistFilter ? h("div", { style: { marginTop: "10px" } },
          ui.button({ label: "Reset Filter", variant: "ghost", size: "sm",
            onClick: function () { setHistFilter(function () { st.histFilter = { store: "", month: "" }; }); } })) : null
      ]}));

      var recs = all.filter(function (r) {
        if (st.histFilter.store && reportStoreLabel(r) !== st.histFilter.store) return false;
        if (st.histFilter.month && reportMonthKey(r) !== st.histFilter.month) return false;
        return true;
      });

      // ---- Diagram batang: rata-rata pencapaian per Pekan (1-4), dari data
      // yang SUDAH disaring Toko/Bulan di atas — jadi diagramnya selalu
      // mengikuti filter yang aktif. ----
      var byWeek = {};
      recs.forEach(function (r) {
        if (!r.weekNo) return;
        var k = String(r.weekNo);
        if (!byWeek[k]) byWeek[k] = { sum: 0, count: 0 };
        byWeek[k].sum += (r.totalPct || 0); byWeek[k].count++;
      });
      var weekRows = Object.keys(byWeek).sort(function (a, b) { return +a - +b; }).map(function (k) {
        return { name: "Pekan " + k, value: byWeek[k].sum / byWeek[k].count, note: "· " + byWeek[k].count + " laporan" };
      });
      host.appendChild(ui.card({ title: "Perbandingan Antar Pekan", body: [
        ui.barChartV(weekRows, { band: true, max: 100,
          emptyTitle: hasHistFilter ? "Tidak ada laporan berpekan pada filter ini." : "Belum ada laporan dengan nomor pekan." })
      ]}));

      if (!recs.length) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Tidak ada laporan pada filter ini.",
          text: "Ubah atau reset filter Toko/Bulan di atas." })] }));
        return;
      }

      // ---- Tabel riwayat (menggantikan tampilan grid/kartu sebelumnya) ----
      var pageCount = Math.max(1, Math.ceil(recs.length / HIST_PER_PAGE));
      if (st.histPage > pageCount) st.histPage = pageCount;
      if (st.histPage < 1) st.histPage = 1;
      var pageRecs = recs.slice((st.histPage - 1) * HIST_PER_PAGE, (st.histPage - 1) * HIST_PER_PAGE + HIST_PER_PAGE);

      var tableCard = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        ui.table({
          columns: ["Toko", "Pekan", "Periode", "Status", "Skor", "Aksi"],
          rows: pageRecs.map(function (r) {
            var st2 = r.status;
            return {
              onClick: function () { historyDetail(r.id); },
              cells: [
                h("span", { class: "pg-strong", text: reportStoreLabel(r) }),
                r.weekNo ? "Pekan " + r.weekNo : "—",
                periodLine(r),
                statusBadge(st2),
                ui.badge(pctText(r.totalPct), scoreTone(r.totalPct)),
                h("div", { class: "pg-row-actions" },
                  st2 === "reviewed" ? null : ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit",
                    onClick: function () { st.view = "form"; st.editingId = r.id; st.form = null; loadForm(); window.scrollTo && window.scrollTo(0, 0); } }),
                  st2 === "reviewed" ? null : ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
                    onClick: function () {
                      ui.confirm({ title: "Hapus Laporan", tone: "danger", confirmLabel: "Hapus",
                        message: "Hapus laporan KPI \"" + reportStoreLabel(r) + "\"?",
                        onConfirm: function () {
                          PG.store.kpiMyReportDelete(r.id).then(function (res) {
                            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
                            ui.toast("Laporan dihapus.", "success");
                            if (st.editingId === r.id) newReport(); else loadHistory();
                          });
                        } });
                    } }))
              ]
            };
          })
        }),
        recs.length > HIST_PER_PAGE ? ui.pager({
          page: st.histPage, pageCount: pageCount,
          info: "Menampilkan " + ((st.histPage - 1) * HIST_PER_PAGE + 1) + "–" +
            Math.min(st.histPage * HIST_PER_PAGE, recs.length) + " dari " + recs.length,
          onPage: function (n) { st.histPage = n; render(); }
        }) : null
      ));
      host.appendChild(tableCard);
    }

    function historyDetail(id) {
      var m = ui.modal({ title: "Memuat…", body: [ui.emptyState({ icon: "target", title: "Memuat…" })] });
      PG.store.kpiReport(id).then(function (d) {
        if (!d || d.ok === false) { m.close(); ui.toast("Gagal memuat.", "danger"); return; }
        var r = d.report, rows = [];
        var showWeight = d.scoreMethod !== "weighted_sum";
        ui.clear(m.body);
        m.el.querySelector(".pg-modal__title").textContent = r.subject || r.templateName;
        function line(it, isSub) {
          rows.push(h("div", { class: "pg-kpi-read__row" + (isSub ? " is-sub" : "") },
            h("div", { class: "pg-kpi-read__label" }, (isSub ? "↳ " : "") + it.label,
              showWeight && it.weight != null
                ? h("span", { class: "pg-badge pg-badge--neutral", style: { marginLeft: "6px" }, text: "Bobot " + pctText(it.weight) })
                : null),
            h("div", { class: "pg-kpi-read__nums",
              text: itemVal(it.actual != null ? it.actual : 0, it) + " / " + itemVal(it.computedTarget != null ? it.computedTarget : it.target, it) }),
            h("div", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums" }, text: it.pct == null ? "—" : pctText(it.pct) }),
            it.valueNote ? h("div", { class: "pg-kpi-read__note", text: it.valueNote }) : null));
        }
        (d.items || []).forEach(function (it) { line(it, false); (it.children || []).forEach(function (c) { line(c, true); }); });
        ui.append(m.body, [
          h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
            h("span", { class: "pg-strong", style: { fontSize: "20px" }, text: pctText(r.totalPct) }),
            h("span", { class: "pg-muted", style: { fontSize: "13px" },
              text: (r.weekNo ? "Pekan " + r.weekNo + " · " : "") + periodLine(r) })),
          h("div", { class: "pg-kpi-read" }, rows)
        ]);
      }).catch(function () { m.close(); });
    }

    renderHeader();
    loadTemplates();
    loadHistory();
    return screen(headerHost, [host]);
  };

  /* ---- Program : program kerja dari Admin. Tugas dalam program otomatis
         menjadi todo Anda di Todo List. Read-only di sini — pengerjaan tugas
         (status/progress/lampiran) tetap lewat menu Todo List. ---- */
  pages.program = function (ctx) {
    var store = PG.store;
    var u = ctx.user;
    var header = backHeader(ctx, "Program");

    function daysBetween(a, b) {
      return Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
    }
    function deadlineChip(p) {
      var mine = p.myTaskCount || 0, mineDone = p.myDoneCount || 0;
      if (p.status === "archived") return { cls: "done", text: "Arsip" };
      if (mine > 0 && mineDone >= mine) return { cls: "done", text: "Tugas Anda selesai" };
      var d = daysBetween(store.dateKey(), p.endDate);
      if (d < 0) return { cls: "over", text: "Terlambat " + (-d) + " hari" };
      if (d === 0) return { cls: "soon", text: "Berakhir hari ini" };
      if (d <= 3) return { cls: "soon", text: d + " hari lagi" };
      return { cls: "ok", text: "Berakhir dalam " + d + " hari" };
    }
    function coverBox(p, extraCls) {
      var box = h("div", { class: "pg-progcard__cover" + (extraCls ? " " + extraCls : "") });
      var ph = h("span", { class: "pg-progcard__ph" }, svg("grid"));
      if (p.coverUrl) {
        var img = h("img", { alt: p.name, loading: "lazy" });
        img.onerror = function () { if (img.parentNode) img.remove(); if (!box.querySelector(".pg-progcard__ph")) box.appendChild(ph); };
        store.fileObjectUrl(p.coverUrl).then(function (src) {
          img.onload = function () { try { URL.revokeObjectURL(src); } catch (e) {} };
          img.src = src;
        }).catch(img.onerror);
        box.appendChild(img);
      } else { box.appendChild(ph); }
      return box;
    }
    function myPct(p) {
      var mine = p.myTaskCount || 0;
      return mine > 0 ? Math.round((p.myDoneCount || 0) * 100 / mine) : 0;
    }
    function dateRange(p) { return ui.fmtDateShortID(p.startDate) + " – " + ui.fmtDateShortID(p.endDate); }

    function detail(id) {
      var m = ui.modal({ title: "Memuat…", class: "pg-modal--form", body: [ui.emptyState({ icon: "grid", title: "Memuat…" })] });
      store.program(id).then(function (d) {
        if (!d || d.ok === false || !d.program) { m.close(); ui.toast("Gagal memuat program.", "danger"); return; }
        var p = d.program;
        var mineTasks = (d.tasks || []).filter(function (t) { return String(t.assigneeId) === String(u.id); });
        var chip = deadlineChip(p);
        ui.clear(m.body);
        m.el.querySelector(".pg-modal__title").textContent = p.name;
        ui.append(m.body, [
          coverBox(p, "pg-progcard__cover--wide"),
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
            h("span", { class: "pg-dl pg-dl--" + chip.cls, text: chip.text }),
            h("span", { class: "pg-muted", style: { fontSize: "12px" }, text: dateRange(p) })),
          p.description ? h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" }, text: p.description }) : null,
          h("div", null,
            ui.progressBar(myPct(p), { label: "Progress Tugas Anda", showPct: true }),
            h("div", { class: "pg-muted", style: { fontSize: "12px", marginTop: "4px" },
              text: (p.myDoneCount || 0) + " / " + (p.myTaskCount || 0) + " tugas Anda selesai · progres program " + (p.progressPct || 0) + "%" })),
          h("div", { class: "pg-field__label", style: { margin: "4px 0 2px" }, text: "Tugas Anda dalam Program Ini" }),
          mineTasks.length
            ? h("div", { class: "pg-grid", style: { gap: "6px" } }, mineTasks.map(function (t) {
                return h("button", { class: "pg-history-row pg-history-row--tap", style: { width: "100%", textAlign: "left" },
                  onclick: function () { m.close(); ctx.router.go("/todo"); } },
                  h("div", { class: "pg-history-row__main" },
                    h("div", { class: "pg-history-row__d", text: t.title }),
                    h("div", { class: "pg-history-row__t", text: "Ketuk untuk mengerjakan di Todo List" })),
                  h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                    h("span", { class: "pg-muted", style: { fontSize: "12px" }, text: (t.progress || 0) + "%" }),
                    statusBadgeTodo(t.status)));
              }))
            : h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Tidak ada tugas untuk Anda di program ini." }),
          ui.button({ label: "Buka Todo List", variant: "accent", block: true, icon: "checklist",
            onClick: function () { m.close(); ctx.router.go("/todo"); } })
        ]);
      }).catch(function () { m.close(); ui.toast("Gagal memuat program.", "danger"); });
    }
    function statusBadgeTodo(s) {
      return s === "done" ? ui.badge("Selesai", "success")
        : s === "in_progress" ? ui.badge("Berjalan", "info")
        : ui.badge("Belum", "neutral");
    }

    var programs = store.all("programs").slice();
    var body;
    if (!programs.length) {
      body = [frameIntro("grid", "Program Kerja",
        "Program kerja dari Admin. Tugas dalam program otomatis muncul di Todo List Anda."),
        ui.card({ body: [ui.emptyState({ icon: "grid", title: "Belum ada program.",
          text: "Ketika Admin menugaskan Anda ke sebuah program, program itu tampil di sini." })] })];
    } else {
      body = [h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6", margin: "0 0 4px" },
        text: "Tugas dalam program otomatis menjadi todo Anda. Ketuk program untuk melihat rincian." }),
        h("div", { class: "pg-progrid" }, programs.map(function (p) {
          var chip = deadlineChip(p);
          var openCount = Math.max(0, (p.myTaskCount || 0) - (p.myDoneCount || 0));
          return h("div", { class: "pg-progcard", onclick: function () { detail(p.id); } },
            (function () {
              var box = coverBox(p);
              box.appendChild(h("span", { class: "pg-progcard__pill pg-progcard__pill--"
                + (chip.cls === "done" ? "done" : chip.cls === "over" ? "over" : chip.cls === "soon" ? "soon" : ""), text: chip.text }));
              if (openCount) box.appendChild(h("span", { class: "pg-progcard__count",
                title: openCount + " tugas Anda belum selesai", text: openCount > 99 ? "99+" : String(openCount) }));
              return box;
            })(),
            h("div", { class: "pg-progcard__body" },
              h("div", { class: "pg-progcard__title", text: p.name }),
              h("div", { class: "pg-progcard__meta" },
                h("span", null, svg("calendar"), dateRange(p)),
                h("span", null, svg("checklist"), (p.myTaskCount || 0) + " tugas Anda")),
              h("div", { class: "pg-progcard__foot" },
                h("div", { class: "pg-progcard__foot-row" },
                  h("span", { text: "Tugas Anda" }),
                  h("b", { text: myPct(p) + "% · " + (p.myDoneCount || 0) + "/" + (p.myTaskCount || 0) })),
                ui.progressBar(myPct(p)))));
        }))];
    }
    return screen(header, body);
  };

  /* ---- Job Desk : uraian tugas yang ditulis Admin per divisi / jabatan.
         Read-only — karyawan hanya melihat. Data sudah difilter di server
         (bootstrap) ke job desk AKTIF yang cocok dengan divisi / jabatannya. ---- */
  pages.jobDesk = function (ctx) {
    var u = ctx.user;
    var header = backHeader(ctx, "Job Desk");

    var ctxCard = ui.card({ body: [
      h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: "Divisi" }),
          h("div", { class: "pg-history-row__d",
            text: (u.divisionLabels && u.divisionLabels.length) ? u.divisionLabels.join(", ") : (u.divisionLabel || "—") }))),
      h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: "Jabatan" }),
          h("div", { class: "pg-history-row__d", text: u.positionLabel || "—" })))
    ]});

    var list = PG.store.all("jobDesks").slice().sort(function (a, b) {
      if (a.scopeType !== b.scopeType) return a.scopeType === "division" ? -1 : 1;
      return String(a.title).localeCompare(String(b.title));
    });

    var body;
    if (!list.length) {
      body = [ui.card({ title: "Uraian Tugas", body: [
        ui.emptyState({ icon: "doc", title: "Job desk belum tersedia.",
          text: "Admin belum menuliskan uraian tugas untuk divisi " + (u.divisionLabel || "Anda")
            + (u.positionLabel ? " / jabatan " + u.positionLabel : "") + ". Silakan cek kembali nanti." })
      ]})];
    } else {
      body = list.map(function (jd) {
        var scopeLabel = jd.scopeType === "division"
          ? "Berlaku untuk Divisi " + (jd.divisionName || u.divisionLabel || "Anda")
          : "Berlaku untuk Jabatan " + (jd.positionName || u.positionLabel || "Anda");
        return ui.card({ body: [
          h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: jd.title }),
          h("div", { class: "pg-jobdesk-card__meta" },
            ui.badge(jd.scopeType === "division" ? "Divisi" : "Jabatan",
              jd.scopeType === "division" ? "info" : "neutral"),
            h("span", { text: scopeLabel })),
          h("div", { class: "pg-jobdesk-card__content", text: jd.content }),
          jd.updatedAt
            ? h("div", { class: "pg-muted", style: { fontSize: "11.5px", marginTop: "10px" },
                text: "Diperbarui " + ui.fmtDateShortID(jd.updatedAt) })
            : null
        ]});
      });
    }

    return screen(header, [ctxCard].concat(body));
  };

  /* ---- Kunjungan : employee files a field-visit report (agenda, toko, tanggal,
         catatan, lampiran FOTO). Admin reviews it in Laporan Kunjungan.
         Robust flow: the visit row is created first, then each photo uploads
         immediately to it — nothing is "staged", so a background reload
         (mobile file-picker refocus) never loses work. The in-progress
         visit id is kept in sessionStorage so a router.refresh() resumes it. ---- */
  pages.kunjungan = function (ctx) {
    var store = PG.store;
    var EDIT_KEY = "pg.kunjungan.editId";
    var headerHost = h("div");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var st = { view: "form", list: null, editId: null, form: null, usingSelect: false, els: null, busy: false,
      uploading: [], textSnap: null, checklist: null };

    // reusable status / progress elements (survive re-renders of the form card)
    var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
    var progEl = h("div", { class: "pg-muted", style: { fontSize: "12.5px", display: "none", marginTop: "6px" } });
    // Which checklist item's picker is currently open — set right before
    // .click(), read once in onPicked, then cleared. null = a legacy/generic
    // pick not tied to any checklist item (kept only for pre-existing photos).
    var pendingItemId = null;
    function onPicked(e) {
      // copy the File refs out BEFORE clearing value() — input.files is a
      // live FileList and value="" empties it (and the saved reference too).
      var picked = Array.prototype.slice.call(e.target.files || []);
      e.target.value = "";
      var itemId = pendingItemId; pendingItemId = null;
      if (!picked.length) return;
      if (st.busy) return;
      function startUpload() {
        // instant local previews (object URLs) while the uploads run — a
        // fresh full-replace is safe here since st.busy already prevents two
        // upload batches (even for different items) from overlapping.
        st.uploading = picked.map(function (f) {
          var u = null;
          try { u = URL.createObjectURL(f); } catch (x) { u = null; }
          return { name: f.name, size: f.size, url: u, status: "uploading", itemId: itemId };
        });
        render();
        uploadEach(picked, itemId);
      }
      if (!st.editId) {
        // not saved yet — save the fields (incl. checked checklist boxes) first
        snapText();
        saveText(function () { render(); startUpload(); });
        return;
      }
      snapText();
      startUpload();
    }
    var camInput = h("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onchange: onPicked });
    var galInput = h("input", { type: "file", accept: "image/*", multiple: true, style: { display: "none" }, onchange: onPicked });
    function openCamera(itemId) { if (st.busy) return; pendingItemId = itemId; camInput.click(); }
    function openGallery(itemId) { if (st.busy) return; pendingItemId = itemId; galInput.click(); }
    function absUrl(u) { try { return new URL(u, document.baseURI).href; } catch (e) { return u || ""; } }
    function snapText() { if (st.els) st.textSnap = readFields(); }

    function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
    function clearErr() { errEl.style.display = "none"; }
    function persistEdit() { try { if (st.editId) sessionStorage.setItem(EDIT_KEY, String(st.editId)); } catch (e) {} }
    function forgetEdit() { try { sessionStorage.removeItem(EDIT_KEY); } catch (e) {} }

    function fmtBytes(n) {
      if (!n) return "";
      if (n < 1024) return n + " B";
      if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
      return (n / 1048576).toFixed(1) + " MB";
    }
    function dateID(d) { return d ? ui.fmtDateShortID(d) : "—"; }
    function statusBadge(s) {
      if (s === "reviewed") return ui.badge("Direview", "success");
      if (s === "draft") return ui.badge("Draf", "neutral");
      return ui.badge("Terkirim", "info");
    }

    /* ---------- header ---------- */
    function renderHeader() {
      ui.clear(headerHost);
      var onBack = function () {
        if (st.view === "history") { st.view = "form"; render(); }
        else ctx.router.go("/dashboard");
      };
      var right = st.view === "form"
        ? h("button", { class: "pg-uheader__textbtn", type: "button",
            onclick: function () { st.view = "history"; render(); loadList(); } },
            svg("clock"), h("span", { text: "Riwayat" }))
        : h("button", { class: "pg-uheader__textbtn", type: "button", onclick: function () { newReport(); } },
            svg("plus"), h("span", { text: "Laporan Baru" }));
      headerHost.appendChild(h("header", { class: "pg-uheader pg-uheader--tight" },
        h("div", { class: "pg-uheader__top" },
          h("button", { class: "pg-uheader__iconbtn", type: "button", "aria-label": "Kembali", onclick: onBack }, svg("chevronLeft")),
          h("div", { class: "pg-uheader__title", style: { flex: "1" },
            text: st.view === "form" ? "Kunjungan" : "Riwayat Kunjungan" }),
          right)));
    }

    /* ---------- data ---------- */
    function loadList() {
      store.myVisits().then(function (d) { st.list = (d && d.reports) || []; render(); })
        .catch(function () { st.list = []; render(); });
    }
    // Checklist items depend on the employee's division, not on any one
    // report — loaded once, independent of st.editId/st.form.
    function loadChecklist() {
      store.myVisitChecklist().then(function (d) { st.checklist = (d && d.items) || []; render(); })
        .catch(function () { st.checklist = st.checklist || []; render(); });
    }
    function newReport() {
      forgetEdit();
      st.view = "form"; st.editId = null; st.form = null; st.uploading = []; st.textSnap = null; clearErr();
      render();
    }
    function editReport(id) {
      st.view = "form"; st.editId = id; st.form = null; st.uploading = []; st.textSnap = null; clearErr();
      persistEdit(); render();
      loadForm();
    }
    function loadForm() {
      if (!st.editId) { render(); return; }
      store.visit(st.editId).then(function (d) {
        if (!d || d.ok === false || !d.visit) {
          // stale id (deleted elsewhere) — fall back to a fresh form
          forgetEdit(); st.editId = null; st.form = null; render();
          return;
        }
        st.form = d; render();
      }).catch(function () { forgetEdit(); st.editId = null; st.form = null; render(); });
    }
    function reloadForm() {
      if (!st.editId) { render(); return; }
      store.visit(st.editId).then(function (d) {
        if (d && d.ok !== false && d.visit) st.form = d;
        render();
      }).catch(function () { render(); });
    }

    /* ---------- read + save the text fields ---------- */
    function readFields() {
      var e = st.els || {};
      var checkedIds = [];
      if (e.checklistBoxes) {
        Object.keys(e.checklistBoxes).forEach(function (id) {
          if (e.checklistBoxes[id].checked) checkedIds.push(id);
        });
      }
      return {
        agenda: e.fAgenda ? e.fAgenda.value.trim() : "",
        storeId: st.usingSelect ? (e.fStore ? e.fStore.value : "") : "",
        storeName: st.usingSelect ? "" : (e.fStore ? e.fStore.value.trim() : ""),
        visitDate: e.fDate ? e.fDate.value : "",
        note: e.fNote ? e.fNote.value.trim() : "",
        checkedIds: checkedIds
      };
    }
    // Persist the text fields (+ checked checklist boxes). cb() runs on
    // success. Returns false if invalid.
    function saveText(cb) {
      clearErr();
      var f = readFields();
      if (!f.agenda) { showErr("Agenda kunjungan wajib diisi."); return false; }
      var storeVal = st.usingSelect ? f.storeId : f.storeName;
      if (!storeVal) { showErr("Pilih atau isi toko yang dikunjungi."); return false; }
      if (!f.visitDate) { showErr("Tanggal kunjungan wajib diisi."); return false; }
      if (st.busy) return false;
      st.busy = true;

      var payload = {
        agenda: f.agenda, visitDate: f.visitDate, note: f.note,
        storeId: st.usingSelect ? (f.storeId || null) : null,
        storeName: st.usingSelect ? "" : f.storeName,
        checklist: f.checkedIds
      };
      if (st.editId) payload.visitId = st.editId;

      store.myVisitSave(payload).then(function (res) {
        st.busy = false;
        if (!res || res.ok === false) { showErr((res && res.error) || "Gagal menyimpan laporan."); return; }
        st.editId = (res.record && res.record.id) || st.editId;
        st.textSnap = null;
        persistEdit();
        if (res.data && res.data.visit) st.form = res.data;
        else if (res.record) st.form = { visit: res.record, attachments: (st.form && st.form.attachments) || [], checklistAnswers: f.checkedIds };
        if (cb) cb(); else render();
      }).catch(function () {
        st.busy = false;
        showErr("Terjadi kesalahan jaringan. Coba lagi.");
      });
      return true;
    }

    /* ---------- upload photos one by one to the current visit ---------- */
    function uploadEach(files, itemId) {
      var arr = Array.prototype.slice.call(files || []);
      if (!arr.length || !st.editId) return;
      st.busy = true;
      var i = 0, fail = 0;
      function done() {
        st.busy = false;
        (st.uploading || []).forEach(function (u) { if (u.url) { try { URL.revokeObjectURL(u.url); } catch (e) {} } });
        st.uploading = [];
        if (fail) ui.toast(fail + " foto gagal diunggah.", "danger");
        else ui.toast(arr.length > 1 ? (arr.length + " foto ditambahkan.") : "Foto ditambahkan.", "success");
        reloadForm();
      }
      function step() {
        if (i >= arr.length) { done(); return; }
        // Downscale/re-encode before upload — same fix as Todo attachments,
        // see assets/js/core/imgresize.js.
        (PG.resizeImageFile ? PG.resizeImageFile(arr[i]) : Promise.resolve(arr[i])).then(function (f) {
          return store.visitUploadAttachment(st.editId, f, itemId);
        }).then(function (r) {
          var u = st.uploading && st.uploading[i];
          if (!r || r.ok === false) { fail++; if (u) u.status = "error"; if (r && r.error) ui.toast(r.error, "danger"); }
          else if (u) u.status = "done";
          i++; render(); step();
        }).catch(function () {
          var u = st.uploading && st.uploading[i]; if (u) u.status = "error";
          fail++; i++; render(); step();
        });
      }
      step();
    }

    /* ---------- photo tiles ---------- */
    function thumbImg(src, alt) {
      var box = h("span", { class: "pg-vatt__imgwrap" });
      var img = h("img", { alt: alt || "Foto", loading: "lazy" });
      function broken() {
        box.classList.add("is-broken");
        if (img.parentNode) img.remove();
        if (!box.querySelector("svg")) box.appendChild(svg("image"));
      }
      img.onerror = broken;
      // Load through the authenticated fetch channel (see store.fileObjectUrl) —
      // a bare <img src> fails on some mobile / installed-PWA contexts.
      store.fileObjectUrl(src).then(function (u) {
        img.onload = function () { try { URL.revokeObjectURL(u); } catch (e) {} };
        img.src = u;
      }).catch(broken);
      box.appendChild(img);
      return box;
    }
    function openPhoto(att) {
      store.fileObjectUrl(att.fileUrl).then(function (u) {
        ui.photoViewer(u, att.name, function () { try { URL.revokeObjectURL(u); } catch (e) {} });
      }).catch(function () { ui.toast("Gagal memuat foto.", "danger"); });
    }
    function uploadingTile(u) {
      return h("div", { class: "pg-vatt pg-vatt--image pg-vatt--" + u.status },
        h("div", { class: "pg-vatt__media" },
          u.url ? h("img", { src: u.url, alt: u.name }) : h("span", { class: "pg-att__ic" }, svg("image")),
          h("span", { class: "pg-vatt__badge pg-vatt__badge--" + u.status },
            svg(u.status === "error" ? "close" : u.status === "done" ? "check" : "clock"))),
        h("div", { class: "pg-vatt__sub",
          text: u.status === "error" ? "Gagal" : u.status === "done" ? "Selesai" : "Mengunggah…" }));
    }
    function photoTile(att, locked) {
      var kids = [
        h("button", { class: "pg-vatt__media", type: "button", title: att.name || "Foto",
          onclick: function () { openPhoto(att); } },
          thumbImg(att.fileUrl, att.name))
      ];
      if (!locked) {
        kids.push(h("button", { class: "pg-att__x", type: "button", title: "Hapus foto", "aria-label": "Hapus",
          onclick: function () {
            ui.confirm({ title: "Hapus Foto", tone: "danger", confirmLabel: "Hapus",
              message: "Hapus foto ini dari laporan?",
              onConfirm: function () {
                if (st.busy) return;
                snapText();
                store.visitRemoveAttachment(att.id).then(function (r) {
                  if (!r || r.ok === false) { ui.toast((r && r.error) || "Gagal.", "danger"); return; }
                  ui.toast("Foto dihapus.", "success"); reloadForm();
                });
              } });
          } }, svg("trash")));
      }
      return h("div", { class: "pg-vatt pg-vatt--image" }, kids);
    }

    /* ---------- FORM view ---------- */
    function renderForm() {
      var rep = st.form ? st.form.visit : null;
      var editing = !!st.editId;
      var locked = rep && rep.status === "reviewed";
      var atts = (st.form && st.form.attachments) || [];

      var storesActive = store.all("stores").filter(function (s) { return s.status === "active"; });
      st.usingSelect = storesActive.length > 0;

      // a one-shot snapshot (taken before an attachment op re-render) wins over
      // the server copy, so nothing typed is lost.
      var snp = st.textSnap; st.textSnap = null;
      var vAgenda = snp ? snp.agenda : (rep ? rep.agenda : "");
      var vStore = snp ? snp.storeId : (rep ? (rep.storeId || "") : "");
      var vStoreName = snp ? snp.storeName : (rep ? (rep.storeName || "") : "");
      var vDate = snp ? snp.visitDate : (rep ? rep.visitDate : (store.dateKey ? store.dateKey() : ""));
      var vNote = snp ? snp.note : (rep ? (rep.note || "") : "");
      var vChecked = snp ? snp.checkedIds : ((st.form && st.form.checklistAnswers) || []);
      var checkedSet = {};
      vChecked.forEach(function (id) { checkedSet[String(id)] = true; });

      var storeOpts = storesActive.slice();
      if (rep && rep.storeId && !storeOpts.some(function (s) { return String(s.id) === String(rep.storeId); })) {
        storeOpts.push({ id: rep.storeId, name: (rep.storeName || "Toko") + " (nonaktif)" });
      }

      var fAgenda = h("input", { class: "pg-input", type: "text", disabled: locked,
        placeholder: "cth. Kunjungan rutin & cek stok", value: vAgenda });
      var fStore = st.usingSelect
        ? h("select", { class: "pg-select", disabled: locked },
            [{ value: "", label: "— Pilih toko —" }].concat(storeOpts.map(function (s) { return { value: s.id, label: s.name }; }))
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(vStore) === String(o.value) }); }))
        : h("input", { class: "pg-input", type: "text", disabled: locked,
            placeholder: "Nama toko yang dikunjungi", value: vStoreName });
      var fDate = h("input", { class: "pg-input", type: "date", disabled: locked, value: vDate || "" });
      var fNote = h("textarea", { class: "pg-textarea", rows: 4, disabled: locked,
        placeholder: "Ringkasan kunjungan, temuan, tindak lanjut…", value: vNote });
      st.els = { fAgenda: fAgenda, fStore: fStore, fDate: fDate, fNote: fNote, checklistBoxes: {} };

      clearErr(); progEl.style.display = "none";

      // ---- Checklist Kegiatan Kunjungan : per-item checkbox + its own photo(s) ----
      // Ensures picking a photo for THIS item saves the fields (incl. every
      // checked box) first if the report isn't saved yet — same "save then
      // open picker" shortcut the old generic "Tambah Foto" button used.
      function pickForItem(itemId, opener) {
        if (st.busy) return;
        if (st.editId) { opener(itemId); return; }
        snapText();
        saveText(function () { render(); setTimeout(function () { opener(itemId); }, 30); });
      }
      function checklistItemRow(item) {
        var itemAtts = atts.filter(function (a) { return String(a.checklistItemId || "") === String(item.id); });
        var itemUploading = (st.uploading || []).filter(function (u) { return String(u.itemId || "") === String(item.id); });
        var tiles = itemAtts.map(function (a) { return photoTile(a, locked); })
          .concat(itemUploading.map(uploadingTile));
        var cb = h("input", { type: "checkbox", checked: !!checkedSet[String(item.id)], disabled: locked });
        st.els.checklistBoxes[item.id] = cb;
        return h("div", { class: "pg-vchecklist__item" },
          h("label", { class: "pg-vchecklist__check" }, cb, h("span", { text: item.label })),
          tiles.length ? h("div", { class: "pg-vatt-grid pg-vatt-grid--sm" }, tiles) : null,
          locked ? null : h("div", { class: "pg-vchecklist__tools" },
            ui.button({ label: "Kamera", icon: "camera", variant: "ghost", size: "sm",
              onClick: function () { pickForItem(item.id, openCamera); } }),
            ui.button({ label: "Galeri", icon: "image", variant: "ghost", size: "sm",
              onClick: function () { pickForItem(item.id, openGallery); } })));
      }
      var checklistBody;
      if (st.checklist === null) {
        checklistBody = h("div", { class: "pg-muted", style: { fontSize: "12.5px" }, text: "Memuat checklist…" });
      } else if (!st.checklist.length) {
        checklistBody = h("div", { class: "pg-muted", style: { fontSize: "12.5px" },
          text: "Admin belum mengatur checklist kegiatan untuk divisi Anda." });
      } else {
        checklistBody = h("div", { class: "pg-vchecklist" }, st.checklist.map(checklistItemRow));
      }
      // Photos from before this feature existed (no checklist item tag) —
      // shown read-only-ish (still removable) so nothing old goes missing.
      var otherAtts = atts.filter(function (a) { return !a.checklistItemId; });
      var otherBlock = otherAtts.length
        ? h("div", { class: "pg-field" },
            h("label", { class: "pg-field__label", text: "Foto Lainnya" }),
            h("div", { class: "pg-vatt-grid" }, otherAtts.map(function (a) { return photoTile(a, locked); })))
        : null;

      // ---- bottom actions ----
      // "Batal" = laporan TIDAK dikirim (draf dihapus).  "Kirim" = laporan
      // terkirim ke admin panel.
      var curStatus = rep ? rep.status : "";
      function goHistory() {
        forgetEdit(); st.editId = null; st.form = null; st.textSnap = null;
        st.view = "history"; loadList();
      }
      function onCancel() {
        if (st.busy) return;
        if (st.editId && curStatus === "draft") {
          ui.confirm({ title: "Batalkan Laporan", tone: "danger", confirmLabel: "Ya, batalkan",
            message: "Laporan ini belum dikirim ke admin. Batalkan dan hapus draf beserta fotonya?",
            onConfirm: function () {
              store.myVisitDelete(st.editId).then(function (res) {
                if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal membatalkan.", "danger"); return; }
                ui.toast("Laporan dibatalkan.", "info"); goHistory();
              });
            } });
          return;
        }
        // never-saved, or editing a report that is already sent — just leave.
        goHistory();
      }
      function onSend() {
        saveText(function () {
          var alreadySent = st.form && st.form.visit && st.form.visit.status === "submitted";
          if (alreadySent) {
            ui.toast("Perubahan laporan tersimpan.", "success"); goHistory(); return;
          }
          store.myVisitSubmit(st.editId).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengirim laporan.", "danger"); return; }
            ui.toast("Laporan kunjungan terkirim.", "success"); goHistory();
          });
        });
      }
      var actions;
      if (locked) {
        actions = ui.button({ label: "Kembali ke Riwayat", variant: "ghost", block: true, onClick: goHistory });
      } else {
        actions = h("div", { style: { display: "flex", gap: "8px" } },
          ui.button({ label: "Batal", variant: "ghost", block: true, onClick: onCancel }),
          ui.button({ label: "Kirim", variant: "accent", block: true, icon: "check", onClick: onSend }));
      }

      host.appendChild(ui.card({
        title: (editing && curStatus && curStatus !== "draft") ? "Laporan Kunjungan" : "Buat Laporan Kunjungan",
        action: editing ? ui.button({ label: "Laporan Baru", variant: "ghost", size: "sm", icon: "plus", onClick: newReport }) : null,
        body: [
          !st.usingSelect ? ui.notice("Belum ada data toko. Minta Admin menambahkannya di Manajemen Toko, atau ketik nama toko manual.", { muted: true }) : null,
          locked ? ui.notice("Laporan ini sudah direview admin dan terkunci.", { muted: true }) : null,
          h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Agenda Kunjungan" }), fAgenda),
          h("div", { class: "pg-grid pg-grid--2" },
            h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Tanggal Kunjungan" }), fDate),
            h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Toko yang Dikunjungi" }), fStore)),
          h("div", { class: "pg-field" }, h("label", { class: "pg-field__label", text: "Catatan Kunjungan (opsional)" }), fNote),
          h("div", { class: "pg-field" },
            h("label", { class: "pg-field__label", text: "Checklist Kegiatan Kunjungan" }),
            checklistBody),
          otherBlock,
          camInput, galInput, errEl, progEl,
          h("div", { style: { marginTop: "4px" } }, actions)
        ]
      }));
    }

    /* ---------- HISTORY view ---------- */
    function cancelDraft(id) {
      ui.confirm({ title: "Batalkan Laporan", tone: "danger", confirmLabel: "Ya, batalkan",
        message: "Draf ini belum dikirim ke admin. Hapus draf beserta fotonya?",
        onConfirm: function () {
          store.myVisitDelete(id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal membatalkan.", "danger"); return; }
            ui.toast("Draf laporan dihapus.", "info"); loadList();
          });
        } });
    }
    function renderHistory() {
      host.appendChild(frameIntro("building", "Riwayat Kunjungan",
        "Laporan kunjungan Anda. Draf belum terkirim ke admin — buka lalu tekan “Kirim” untuk mengirimnya. Laporan yang belum direview masih bisa diubah."));

      if (st.list === null) { host.appendChild(ui.card({ body: [ui.emptyState({ icon: "building", title: "Memuat riwayat…" })] })); return; }
      if (!st.list.length) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "building", title: "Belum ada laporan kunjungan.",
          text: "Laporan kunjungan yang Anda buat akan tercatat di sini.",
          action: ui.button({ label: "Buat Laporan Kunjungan", variant: "accent", icon: "plus", onClick: newReport }) })] }));
        return;
      }
      st.list.forEach(function (r) {
        var isDraft = r.status === "draft";
        var acts = isDraft
          ? [
              ui.button({ label: "Lanjutkan", variant: "accent", size: "sm", icon: "edit",
                onClick: function () { editReport(r.id); window.scrollTo && window.scrollTo(0, 0); } }),
              ui.button({ label: "Batalkan", variant: "ghost", size: "sm", icon: "trash",
                onClick: function () { cancelDraft(r.id); } })
            ]
          : [
              ui.button({ label: "Lihat", variant: "ghost", size: "sm", onClick: function () { detail(r.id); } }),
              r.status === "reviewed" ? null : ui.button({ label: "Edit", variant: "ghost", size: "sm", icon: "edit",
                onClick: function () { editReport(r.id); window.scrollTo && window.scrollTo(0, 0); } })
            ];
        host.appendChild(ui.card({ body: [
          h("div", { style: { display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" } },
            h("div", { style: { minWidth: 0 } },
              h("div", { class: "pg-strong", text: r.agenda }),
              h("div", { class: "pg-muted", style: { fontSize: "12px", lineHeight: "1.6" },
                text: (r.storeName || "—") + " · " + dateID(r.visitDate)
                  + (r.attachmentCount ? " · " + r.attachmentCount + " foto" : "") })),
            statusBadge(r.status)),
          h("div", { style: { display: "flex", gap: "6px", marginTop: "10px", flexWrap: "wrap" } }, acts)
        ]}));
      });
    }

    function detail(id) {
      var m = ui.modal({ title: "Memuat…", body: [ui.emptyState({ icon: "building", title: "Memuat…" })] });
      store.visit(id).then(function (d) {
        if (!d || d.ok === false) { m.close(); ui.toast("Gagal memuat.", "danger"); return; }
        var r = d.visit, atts = d.attachments || [], checked = d.checklistAnswers || [];
        var checkedSet = {}; checked.forEach(function (cid) { checkedSet[String(cid)] = true; });
        ui.clear(m.body);
        m.el.querySelector(".pg-modal__title").textContent = r.agenda;
        function kv(label, value) {
          return h("div", { class: "pg-kpi-rhead__cell" },
            h("div", { class: "pg-kpi-rhead__k", text: label }),
            h("div", { class: "pg-kpi-rhead__v", text: value }));
        }
        var checklistItems = st.checklist || [];
        var checklistBlock = checklistItems.length
          ? h("div", { class: "pg-vchecklist" }, checklistItems.map(function (item) {
              var isChecked = !!checkedSet[String(item.id)];
              var itemAtts = atts.filter(function (a) { return String(a.checklistItemId || "") === String(item.id); });
              return h("div", { class: "pg-vchecklist__item" },
                h("div", { class: "pg-vchecklist__check" + (isChecked ? " is-checked" : "") },
                  isChecked ? svg("checkCircle") : h("span", { class: "pg-vchecklist__dot" }),
                  h("span", { text: item.label })),
                itemAtts.length ? h("div", { class: "pg-vatt-grid pg-vatt-grid--sm" }, itemAtts.map(function (a) { return photoTile(a, true); })) : null);
            }))
          : null;
        var otherAtts = atts.filter(function (a) { return !a.checklistItemId; });
        var otherBlock = otherAtts.length
          ? h("div", null,
              h("div", { class: "pg-field__label", style: { marginTop: "10px" }, text: "Foto Lainnya" }),
              h("div", { class: "pg-vatt-grid" }, otherAtts.map(function (a) { return photoTile(a, true); })))
          : null;
        ui.append(m.body, [
          h("div", { class: "pg-kpi-rhead" },
            kv("Toko", r.storeName || "—"),
            kv("Tanggal Kunjungan", dateID(r.visitDate)),
            kv("Status", r.status === "reviewed" ? "Direview" : "Terkirim"),
            kv("Dikirim", r.createdAt ? ui.fmtDateShortID(r.createdAt) : "—")),
          r.note ? h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"), h("div", { text: r.note })) : null,
          checklistItems.length
            ? h("div", null, h("div", { class: "pg-field__label", style: { marginTop: "4px" }, text: "Checklist Kegiatan Kunjungan" }), checklistBlock)
            : null,
          otherBlock,
          (!checklistItems.length && !atts.length)
            ? h("div", { class: "pg-muted", style: { fontSize: "12.5px" }, text: "Tidak ada foto." })
            : null
        ]);
      }).catch(function () { m.close(); ui.toast("Gagal memuat.", "danger"); });
    }

    /* ---------- render ---------- */
    function render() {
      renderHeader();
      ui.clear(host);
      if (st.view === "history") { renderHistory(); return; }
      if (st.editId && !st.form) { host.appendChild(ui.card({ body: [ui.emptyState({ icon: "building", title: "Memuat laporan…" })] })); return; }
      renderForm();
    }

    // Resume an in-progress report after a background reload (mobile file picker).
    try {
      var resumeId = sessionStorage.getItem(EDIT_KEY);
      if (resumeId) { st.editId = resumeId; }
    } catch (e) {}

    render();
    if (st.editId) loadForm();
    loadList();
    loadChecklist();
    return screen(headerHost, [host]);
  };

  /* ---- Pengeluaran : a plain LOGBOOK for staff expenses, not a finance
         module — nama pengeluaran, nominal, catatan opsional + foto lampiran
         wajib (kamera atau upload). Tanggal diambil otomatis oleh server saat
         submit (tidak diinput manual). Submit-only, same spirit as Izin — no
         draft/approval lifecycle. "Riwayat Pengeluaran" below reads the same
         rows via bootstrap's expenseRecords, so it updates live once Admin's
         panel sees it too. ---- */
  pages.pengeluaran = function (ctx) {
    var u = ctx.user;
    var store = PG.store;
    var header = backHeader(ctx, "Pengeluaran");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var PER_PAGE = 10;
    var page = 1;

    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }

    function detail(r) {
      ui.modal({
        title: r.name,
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { class: "pg-attdetail__kv" },
            h("div", null, h("div", { class: "pg-field__hint", text: "Tanggal" }), h("div", { class: "pg-strong", text: ui.fmtDateWeekdayID(r.date) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Nominal" }), h("div", { class: "pg-strong", text: moneyID(r.amount) }))
          ),
          h("div", { class: "pg-attdetail__photos" },
            h("div", { class: "pg-attdetail__photo" },
              h("div", { class: "pg-attdetail__photo-head" }, h("span", { text: "Foto Lampiran" })),
              h("div", { class: "pg-attdetail__photo-body" },
                ui.photoImg(r.photoUrl, { alt: "Foto lampiran", onclick: function () { ui.photoViewer(r.photoUrl, r.name); } })))),
          r.note ? h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
            svg("info"), h("div", { text: "Catatan: " + r.note })) : null,
          ui.notice("Dikirim " + ui.fmtDateWeekdayID(r.createdAt) + " " + ui.fmtTimeID(r.createdAt), { muted: true })
        ) ]
      });
    }

    function openForm() {
      var photoFile = null, photoObjUrl = null;

      var fName = ui.field({ label: "Nama Pengeluaran", placeholder: "cth. Bensin motor operasional", required: true });
      var fAmount = ui.field({ label: "Nominal (Rp)", type: "text", placeholder: "0", required: true });
      var fNote = ui.field({ label: "Catatan (opsional)", type: "textarea", placeholder: "Keterangan tambahan (opsional)…" });

      var amountEl = fAmount._control;
      amountEl.setAttribute("inputmode", "numeric");
      amountEl.addEventListener("input", function () {
        var digits = amountEl.value.replace(/\D/g, "").slice(0, 12);
        amountEl.value = digits ? Number(digits).toLocaleString("id-ID") : "";
      });
      function amountValue() { return Number(amountEl.value.replace(/\D/g, "") || "0"); }

      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }

      function revokePreview() {
        if (photoObjUrl) { try { URL.revokeObjectURL(photoObjUrl); } catch (x) {} }
        photoObjUrl = null;
      }
      function onPicked(e) {
        var f = e.target.files && e.target.files[0];
        e.target.value = "";
        if (!f) return;
        photoFile = f;
        revokePreview();
        try { photoObjUrl = URL.createObjectURL(f); } catch (x) { photoObjUrl = null; }
        paintPhoto();
      }
      var camIn = h("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" }, onchange: onPicked });
      var galIn = h("input", { type: "file", accept: "image/*", style: { display: "none" }, onchange: onPicked });

      var photoHost = h("div");
      function paintPhoto() {
        ui.clear(photoHost);
        if (photoObjUrl) {
          photoHost.appendChild(h("div", { class: "pg-momen-composer__preview" },
            h("img", { class: "pg-momen-composer__img", src: photoObjUrl, alt: "Pratinjau lampiran" }),
            h("button", { class: "pg-momen-composer__remove", type: "button", "aria-label": "Hapus foto",
              onclick: function () { photoFile = null; revokePreview(); paintPhoto(); } }, svg("close"))
          ));
        }
        photoHost.appendChild(h("div", { class: "pg-att-add" },
          ui.button({ label: photoObjUrl ? "Ganti (Kamera)" : "Kamera", icon: "camera", variant: "ghost", size: "sm", onClick: function () { camIn.click(); } }),
          ui.button({ label: photoObjUrl ? "Ganti (Galeri)" : "Galeri", icon: "image", variant: "ghost", size: "sm", onClick: function () { galIn.click(); } })
        ));
      }
      paintPhoto();

      var m = ui.modal({
        title: "Catat Pengeluaran",
        onClose: revokePreview,
        body: [
          errEl, fName, fAmount, fNote,
          h("label", { class: "pg-field__label", style: { display: "block", marginTop: "4px" }, text: "Foto Lampiran" }),
          camIn, galIn, photoHost
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "accent", icon: "check", onClick: function () { submit(this); } })
        ]
      });

      function submit(btn) {
        errEl.style.display = "none";
        var name = fName._control.value.trim();
        var amount = amountValue();
        var note = fNote._control.value.trim();
        if (!name) { showErr("Nama pengeluaran wajib diisi."); return; }
        if (!amount || amount <= 0) { showErr("Nominal pengeluaran wajib diisi."); return; }
        if (!photoFile) { showErr("Foto lampiran wajib disertakan."); return; }
        btn.disabled = true;
        (PG.resizeImageFile ? PG.resizeImageFile(photoFile) : Promise.resolve(photoFile)).then(function (out) {
          return store.submitExpense({ name: name, amount: amount, note: note }, out);
        }).then(function (res) {
          btn.disabled = false;
          if (!res || res.ok === false) { showErr((res && res.error) || "Gagal menyimpan pengeluaran."); return; }
          ui.toast("Pengeluaran tercatat.", "success");
          m.close();
          page = 1; // newest record sorts first — jump back to page 1 so it's visible
          render();
        });
      }
    }

    function render() {
      ui.clear(host);
      var records = store.expensesForUser(u.id);
      var monthKey = store.dateKey().slice(0, 7);
      var monthRecords = records.filter(function (r) { return String(r.date).slice(0, 7) === monthKey; });
      var monthTotal = monthRecords.reduce(function (s, r) { return s + (r.amount || 0); }, 0);

      var addCard = ui.card({ body: [
        h("div", { class: "pg-attn-card__state", text: "Catat Pengeluaran" }),
        h("div", { class: "pg-attn-card__hint", text: "Catat pengeluaran Anda lengkap dengan foto lampiran, agar Admin mengetahuinya." }),
        h("div", { style: { marginTop: "10px" } },
          ui.button({ label: "Catat Pengeluaran", variant: "accent", block: true, icon: "wallet", onClick: openForm }))
      ]});

      var summary = h("div", { class: "pg-grid pg-grid--keep2" },
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("wallet"), "Bulan Ini"),
          h("div", { class: "pg-ministat__value", style: { fontSize: "17px" }, text: moneyID(monthTotal) }),
          h("div", { class: "pg-ministat__cap", text: monthRecords.length + " catatan" })
        ),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("doc"), "Total Riwayat"),
          h("div", { class: "pg-ministat__value", style: { fontSize: "17px" }, text: String(records.length) }),
          h("div", { class: "pg-ministat__cap", text: "seluruh catatan" })
        )
      );

      var pageCount = Math.max(1, Math.ceil(records.length / PER_PAGE));
      if (page > pageCount) page = pageCount;
      if (page < 1) page = 1;
      var pageRecords = records.slice((page - 1) * PER_PAGE, (page - 1) * PER_PAGE + PER_PAGE);

      var pagerNode = records.length > PER_PAGE
        ? ui.pager({
            page: page, pageCount: pageCount,
            info: "Menampilkan " + ((page - 1) * PER_PAGE + 1) + "–" +
              Math.min(page * PER_PAGE, records.length) + " dari " + records.length,
            onPage: function (n) { page = n; render(); }
          })
        : null;

      var riwayat = ui.card({ title: "Riwayat Pengeluaran", body: [
        records.length
          ? h("div", { class: "pg-grid", style: { gap: "10px" } }, pageRecords.map(function (r) {
              return h("div", { class: "pg-history-row" },
                ui.photoThumb(r.photoUrl, null, { title: r.name, alt: "Foto lampiran" }),
                h("button", { type: "button", class: "pg-history-row__main",
                  style: { textAlign: "left", background: "none", border: "none", padding: "0", cursor: "pointer", flex: "1" },
                  onclick: function () { detail(r); } },
                  h("div", { class: "pg-history-row__t", text: r.name }),
                  h("div", { class: "pg-history-row__d", text: ui.fmtDateWeekdayID(r.date) })
                ),
                h("div", { class: "pg-strong", text: moneyID(r.amount) })
              );
            }))
          : ui.emptyState({ icon: "wallet", title: "Belum ada pengeluaran.",
              text: "Pengeluaran yang Anda catat akan tampil di sini." }),
        pagerNode
      ]});

      host.appendChild(addCard);
      host.appendChild(summary);
      host.appendChild(riwayat);
    }

    render();
    ui.live(render, host);
    return screen(header, [host]);
  };

  /* ---- Resi Gudang : catatan barang masuk gudang yang diisi karyawan
         (13 kolom laporan). Karyawan bisa membuat, mengubah, dan menghapus
         catatannya sendiri — tanpa alur approval. Admin menerimanya di
         "Laporan Resi Gudang". Data mengalir lewat bootstrap warehouseReceipts
         sehingga daftar di bawah ikut ter-update begitu Admin melihatnya. ---- */
  pages.resiGudang = function (ctx) {
    var u = ctx.user;
    var store = PG.store;
    var header = backHeader(ctx, "Resi Gudang", "/dashboard",
      h("button", { class: "pg-uheader__textbtn", type: "button",
        onclick: function () { ctx.router.go("/data-supplier"); } },
        svg("store"), h("span", { text: "Input Supplier" })));
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var PER_PAGE = 10;
    var page = 1;
    var showDraftOnly = false; // "Draft" toggle in the Riwayat Resi header — filters the list to drafts only

    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }
    function numID(n) { return (Math.round(n || 0)).toLocaleString("id-ID"); }

    function kv(label, value) {
      return h("div", null,
        h("div", { class: "pg-field__hint", text: label }),
        h("div", { class: "pg-strong", text: (value == null || value === "") ? "—" : String(value) }));
    }

    function goodsStatusLabel(r) {
      if (r.goodsStatus === "klop") return "Klop (sesuai)";
      if (r.goodsStatus === "minus") return "Minus (kurang)";
      return r.receivedDate ? "Belum ditandai" : "Belum diterima";
    }

    function detail(r) {
      var st2 = store.warehouseReceiptStatus(r);
      var urgency = store.warehouseDueUrgency(r);
      var m = ui.modal({
        title: r.itemName,
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
            ui.badge(st2.label, st2.tone),
            urgency ? ui.badge(urgency.label, urgency.tone) : null),
          h("div", { class: "pg-attdetail__kv" },
            kv("Tanggal", ui.fmtDateWeekdayID(r.date)),
            kv("Supplier", r.supplier),
            kv("No Resi", r.resiNo),
            kv("Pcs", numID(r.qty)),
            kv("Harga Satuan", moneyID(r.unitPrice)),
            kv("Total Harga", moneyID(r.totalPrice)),
            kv("Ongkir", moneyID(r.shippingCost)),
            kv("Koli (Karung)", numID(r.koli)),
            kv("Status Pembayaran", r.paymentStatus === "lunas" ? "Lunas" : "Belum Lunas"),
            r.paymentStatus !== "lunas" ? kv("Tanggal Jatuh Tempo", r.dueDate ? ui.fmtDateWeekdayID(r.dueDate) : "Belum diisi") : null,
            kv("Metode Pembayaran", r.payment),
            kv("Pengiriman", r.shipping),
            kv("Tanggal Diterima", r.receivedDate ? ui.fmtDateWeekdayID(r.receivedDate) : "Belum diterima"),
            kv("Kondisi Barang", goodsStatusLabel(r))
          ),
          r.note ? h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
            svg("info"), h("div", { text: "Keterangan: " + r.note })) : null,
          ui.notice("Dicatat " + ui.fmtDateWeekdayID(r.createdAt) + " " + ui.fmtTimeID(r.createdAt) +
            (r.updatedAt && r.updatedAt !== r.createdAt ? " · diperbarui " + ui.fmtDateShortID(r.updatedAt) : ""), { muted: true })
        ) ],
        footer: [
          ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Hapus", variant: "danger", icon: "trash", onClick: function () { m.close(); askDelete(r); } }),
          ui.button({ label: "Ubah", variant: "accent", icon: "edit", onClick: function () { m.close(); openForm(r); } })
        ]
      });
    }

    function askDelete(r) {
      ui.confirm({
        title: "Hapus catatan resi gudang",
        tone: "danger",
        confirmLabel: "Hapus",
        message: "Hapus catatan \"" + r.itemName + "\" (" + ui.fmtDateWeekdayID(r.date) + ")? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          return store.deleteWarehouseReceipt(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus catatan.", "danger"); return; }
            ui.toast("Catatan dihapus.", "success");
            render();
          });
        }
      });
    }

    function openForm(existing) {
      var editing = !!existing;

      var fDate = ui.field({ label: "Tanggal", type: "date", required: true,
        value: editing ? existing.date : store.dateKey() });
      var fItem = ui.field({ label: "Nama Barang", placeholder: "cth. Kertas HVS A4 80gsm", required: true,
        value: editing ? existing.itemName : "" });
      // Supplier: dropdown from the shared master list (Data Supplier), with
      // a "+ Tambah Supplier Baru" option that reveals a free-text input —
      // whatever name ends up there gets auto-registered into that master
      // list server-side (pg_whs_ensure), so it's available for next time.
      var NEW_SUPPLIER = "__new__";
      var existingSupplier = editing ? (existing.supplier || "") : "";
      var supplierNames = store.allWarehouseSuppliers().map(function (s) { return s.name; });
      if (existingSupplier && supplierNames.indexOf(existingSupplier) < 0) {
        supplierNames = [existingSupplier].concat(supplierNames);
      }
      var fSupplierSel = h("select", { class: "pg-select" },
        [h("option", { value: "", text: "— Pilih Supplier —" })]
          .concat(supplierNames.map(function (n) { return h("option", { value: n, text: n, selected: n === existingSupplier }); }))
          .concat([h("option", { value: NEW_SUPPLIER, text: "+ Tambah Supplier Baru" })]));
      var fSupplierNew = h("input", { class: "pg-input", type: "text", placeholder: "Nama supplier baru",
        style: { marginTop: "8px", display: "none" } });
      function syncSupplierNew() {
        fSupplierNew.style.display = fSupplierSel.value === NEW_SUPPLIER ? "" : "none";
      }
      fSupplierSel.addEventListener("change", syncSupplierNew);
      syncSupplierNew();
      var fSupplier = h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Supplier" }),
        fSupplierSel, fSupplierNew);
      fSupplier._get = function () {
        return fSupplierSel.value === NEW_SUPPLIER ? fSupplierNew.value.trim() : fSupplierSel.value;
      };
      var fResi = ui.field({ label: "No Resi", placeholder: "cth. JX1234567890", required: true,
        value: editing ? existing.resiNo : "" });
      var fQty = ui.field({ label: "Pcs", type: "text", placeholder: "0", required: true,
        value: editing ? String(existing.qty || "") : "" });
      var fTotal = ui.field({ label: "Total Harga Barang (Rp)", type: "text", placeholder: "0",
        value: editing && existing.totalPrice ? numID(existing.totalPrice) : "" });
      var fHarga = ui.field({ label: "Harga Satuan (Rp)", type: "text", placeholder: "0",
        hint: "Otomatis Total Harga ÷ Pcs — boleh diubah manual.",
        value: editing && existing.unitPrice ? numID(existing.unitPrice) : "" });
      var fOngkir = ui.field({ label: "Ongkir (Rp)", type: "text", placeholder: "0",
        value: editing && existing.shippingCost ? numID(existing.shippingCost) : "" });
      var fKoli = ui.field({ label: "Koli (Karung)", type: "text", placeholder: "0",
        value: editing ? String(existing.koli || "") : "" });
      var fPengiriman = ui.field({ label: "Pengiriman", placeholder: "cth. JNE / J&T / Kargo / Ambil sendiri",
        value: editing ? existing.shipping : "" });
      var fPembayaran = ui.field({ label: "Metode Pembayaran (opsional)", placeholder: "cth. Transfer BCA / Tunai / Tempo 30 hari",
        value: editing ? existing.payment : "" });
      var fDiterima = ui.field({ label: "Tanggal Diterima (opsional)", type: "date",
        value: editing && existing.receivedDate ? existing.receivedDate : "" });
      var fKeterangan = ui.field({ label: "Keterangan (opsional)", type: "textarea",
        placeholder: "Catatan tambahan…", value: editing ? (existing.note || "") : "" });

      // ---- Status Pembayaran (Lunas / Belum Lunas) + Tanggal Jatuh Tempo,
      // shown only while belum lunas — the whole point of "jatuh tempo".
      // OPTIONAL: a belum-lunas resi with no due date yet is a valid, expected
      // state — it lands in the "Non Tempo" stat card instead of "Jatuh
      // Tempo" (see warehouseDueUrgency/nonTempoRecords in render()), it's
      // not an incomplete form. ----
      var paymentStatus = editing && existing.paymentStatus === "lunas" ? "lunas" : "belum_lunas";
      var fDueDate = ui.field({ label: "Tanggal Jatuh Tempo (opsional)", type: "date",
        hint: "Kosongkan jika belum ada tanggal jatuh tempo — resi akan masuk ke grid \"Non Tempo\".",
        value: editing && existing.dueDate ? existing.dueDate : "" });
      var payBelumBtn = h("button", { type: "button", class: "pg-seg__btn", text: "Belum Lunas",
        onclick: function () { setPaymentStatus("belum_lunas"); } });
      var payLunasBtn = h("button", { type: "button", class: "pg-seg__btn", text: "Lunas",
        onclick: function () { setPaymentStatus("lunas"); } });
      var paymentWrap = h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Status Pembayaran" }),
        h("div", { class: "pg-seg" }, payBelumBtn, payLunasBtn));
      function setPaymentStatus(v) {
        paymentStatus = v;
        payBelumBtn.classList.toggle("is-active", v === "belum_lunas");
        payLunasBtn.classList.toggle("is-active", v === "lunas");
        fDueDate.style.display = v === "belum_lunas" ? "" : "none";
        if (v === "lunas") fDueDate._control.value = "";
      }
      setPaymentStatus(paymentStatus);

      // ---- Kondisi Barang (Klop / Minus) — only relevant once Tanggal
      // Diterima has a value (the goods actually arrived). ----
      var goodsStatus = editing ? (existing.goodsStatus || "") : "";
      var goodsKlopBtn = h("button", { type: "button", class: "pg-seg__btn", text: "Klop (sesuai)",
        onclick: function () { setGoodsStatus("klop"); } });
      var goodsMinusBtn = h("button", { type: "button", class: "pg-seg__btn", text: "Minus (kurang)",
        onclick: function () { setGoodsStatus("minus"); } });
      var goodsWrap = h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Kondisi Barang" }),
        h("div", { class: "pg-seg" }, goodsKlopBtn, goodsMinusBtn),
        h("span", { class: "pg-field__hint", text: "Barang datang sesuai (klop) atau kurang dari resi (minus)?" }));
      function setGoodsStatus(v) {
        goodsStatus = v;
        goodsKlopBtn.classList.toggle("is-active", v === "klop");
        goodsMinusBtn.classList.toggle("is-active", v === "minus");
      }
      function syncGoodsVisibility() {
        var hasReceived = !!fDiterima._control.value;
        goodsWrap.style.display = hasReceived ? "" : "none";
        if (!hasReceived) setGoodsStatus("");
      }
      setGoodsStatus(goodsStatus);
      fDiterima._control.addEventListener("change", syncGoodsVisibility);
      fDiterima._control.addEventListener("input", syncGoodsVisibility);
      syncGoodsVisibility();

      // Digit-only + thousands separator for the money/count inputs. Harga
      // Satuan is DERIVED from Total Harga ÷ Pcs (the item's total price is
      // what's known from the resi, not the per-unit price) — it recomputes
      // whenever Pcs or Total Harga changes, unless the user typed into Harga
      // Satuan directly, which then wins until Pcs/Total change again.
      function digitize(wrap, maxLen) {
        var el = wrap._control;
        el.setAttribute("inputmode", "numeric");
        el.addEventListener("input", function () {
          var d = el.value.replace(/\D/g, "").slice(0, maxLen || 12);
          el.value = d ? Number(d).toLocaleString("id-ID") : "";
          if (wrap === fHarga) hargaTouched = true;
          if (wrap === fQty || wrap === fTotal) syncHarga();
        });
      }
      function val(wrap) { return Number(String(wrap._control.value).replace(/\D/g, "") || "0"); }
      var hargaTouched = editing && !!existing.unitPrice;
      function syncHarga() {
        if (hargaTouched) return;
        var qty = val(fQty), total = val(fTotal);
        var u = qty > 0 ? Math.round(total / qty) : 0;
        fHarga._control.value = u ? Number(u).toLocaleString("id-ID") : "";
      }
      [fQty, fTotal, fHarga, fOngkir, fKoli].forEach(function (w) { digitize(w, w === fQty || w === fKoli ? 7 : 12); });

      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }

      // A brand-new entry or an existing DRAFT still gets "Simpan Draft" +
      // "Kirim"; once something is actually submitted, editing it only offers
      // "Simpan Perubahan" — there is no "un-submitting" a real report.
      var isEditingSubmitted = editing && existing.status !== "draft";

      var m = ui.modal({
        title: !editing ? "Catat Resi Gudang" : (existing.status === "draft" ? "Lanjutkan Draft" : "Ubah Resi Gudang"),
        class: "pg-modal--form",
        body: [
          errEl,
          h("div", { class: "pg-grid pg-grid--keep2" }, fDate, fResi),
          fItem, fSupplier,
          h("div", { class: "pg-grid pg-grid--keep2" }, fQty, fKoli),
          h("div", { class: "pg-grid pg-grid--keep2" }, fTotal, fHarga),
          h("div", { class: "pg-grid pg-grid--keep2" }, fOngkir, fPengiriman),
          paymentWrap, fDueDate, fPembayaran,
          fDiterima, goodsWrap,
          fKeterangan
        ],
        footer: isEditingSubmitted
          ? [
              ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
              ui.button({ label: "Simpan Perubahan", variant: "accent", icon: "check",
                onClick: function () { return submit("submitted"); } })
            ]
          : [
              ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
              ui.button({ label: "Simpan Draft", variant: "ghost", icon: "doc",
                onClick: function () { return submit("draft"); } }),
              ui.button({ label: "Kirim", variant: "accent", icon: "check",
                onClick: function () { return submit("submitted"); } })
            ]
      });

      function submit(statusToSave) {
        errEl.style.display = "none";
        var isDraft = statusToSave === "draft";
        var fields = {
          date: fDate._control.value,
          itemName: fItem._control.value.trim(),
          supplier: fSupplier._get(),
          resiNo: fResi._control.value.trim(),
          qty: val(fQty),
          totalPrice: val(fTotal),
          unitPrice: val(fHarga) || (val(fQty) > 0 ? Math.round(val(fTotal) / val(fQty)) : 0),
          shippingCost: val(fOngkir),
          koli: val(fKoli),
          payment: fPembayaran._control.value.trim(),
          paymentStatus: paymentStatus,
          dueDate: paymentStatus === "belum_lunas" ? fDueDate._control.value : "",
          shipping: fPengiriman._control.value.trim(),
          receivedDate: fDiterima._control.value,
          goodsStatus: fDiterima._control.value ? goodsStatus : "",
          note: fKeterangan._control.value.trim(),
          status: statusToSave
        };
        if (!fields.itemName) { showErr("Nama barang wajib diisi."); return; }
        // A draft may stay incomplete on purpose — every other requirement
        // below only applies once actually "Kirim".
        if (!isDraft) {
          if (!fields.date) { showErr("Tanggal wajib diisi."); return; }
          if (!fields.supplier) { showErr("Supplier wajib diisi."); return; }
          if (!fields.resiNo) { showErr("No resi wajib diisi."); return; }
          if (!(fields.qty > 0)) { showErr("Pcs wajib diisi."); return; }
          if (fields.receivedDate && fields.receivedDate < fields.date) {
            showErr("Tanggal diterima tidak boleh sebelum tanggal resi."); return;
          }
          // Tanggal jatuh tempo sengaja OPSIONAL selama belum lunas — resi
          // tanpa tanggal jatuh tempo tetap valid, masuk ke grid "Non Tempo".
          if (fields.dueDate && fields.dueDate < fields.date) {
            showErr("Tanggal jatuh tempo tidak boleh sebelum tanggal resi."); return;
          }
        }
        var op = editing
          ? store.updateWarehouseReceipt(existing.id, fields)
          : store.submitWarehouseReceipt(fields);
        return op.then(function (res) {
          if (!res || res.ok === false) { showErr((res && res.error) || "Gagal menyimpan catatan."); return; }
          var msg = isDraft ? "Draft disimpan."
            : isEditingSubmitted ? "Catatan diperbarui."
            : "Resi gudang terkirim.";
          ui.toast(msg, "success");
          m.close();
          if (!editing) page = 1;
          render();
        });
      }
    }

    // One "Riwayat Resi" row, tinted by status — reused both in the main list
    // and inside the stat-card drill-down modals below, so every entry point
    // reads the exact same way. `onNav` (optional) runs before opening detail
    // — used to close a parent list-modal first.
    function receiptRow(r, onNav) {
      var st2 = store.warehouseReceiptStatus(r);
      var toneClass = st2.tone === "success" ? " pg-resi-row--success"
        : st2.tone === "warning" ? " pg-resi-row--warning"
        : st2.tone === "danger" ? " pg-resi-row--danger" : "";
      return h("button", { type: "button", class: "pg-resi-row" + toneClass,
        onclick: function () { if (onNav) onNav(); detail(r); } },
        h("div", { class: "pg-resi-row__main" },
          h("div", { class: "pg-resi-row__t", text: r.itemName }),
          h("div", { class: "pg-resi-row__d", text: ui.fmtDateWeekdayID(r.date) + " · " + r.supplier + " · " + numID(r.qty) + " pcs" })
        ),
        h("div", { class: "pg-resi-row__right" },
          h("div", { class: "pg-strong", text: moneyID(r.totalPrice) }),
          h("div", { style: { marginTop: "4px" } }, ui.badge(st2.label, st2.tone))
        )
      );
    }

    // Row renderer for the "Jatuh Tempo" drill-down: badges with the due-date
    // URGENCY tier (Segera Dibayar / Mendekati / Aman / Lewat) instead of the
    // usual Lunas/Belum Lunas status badge, since that's the whole point of
    // this list — how pressing each due date is, not the payment/goods state.
    function tempoRow(r, onNav) {
      var urg = store.warehouseDueUrgency(r) || { label: "-", tone: "neutral" };
      var toneClass = urg.tone === "danger" ? " pg-resi-row--danger" : urg.tone === "warning" ? " pg-resi-row--warning" : "";
      return h("button", { type: "button", class: "pg-resi-row" + toneClass,
        onclick: function () { if (onNav) onNav(); detail(r); } },
        h("div", { class: "pg-resi-row__main" },
          h("div", { class: "pg-resi-row__t", text: r.itemName }),
          h("div", { class: "pg-resi-row__d", text: r.supplier + " · Jatuh tempo " + ui.fmtDateWeekdayID(r.dueDate) })
        ),
        h("div", { class: "pg-resi-row__right" },
          h("div", { class: "pg-strong", text: moneyID(r.totalPrice) }),
          h("div", { style: { marginTop: "4px" } }, ui.badge(urg.label, urg.tone))
        )
      );
    }

    // Generic "tap a stat card -> see the matching receipts" drill-down modal.
    // `m` is declared before rowList() so a row's onclick (built while the
    // modal itself is still being constructed) can close whichever list
    // modal ends up open by the time the user actually taps it.
    var m;
    function rowList(list, emptyText, rowFn) {
      rowFn = rowFn || receiptRow;
      return list.length
        ? h("div", { class: "pg-grid", style: { gap: "8px" } }, list.map(function (r) { return rowFn(r, function () { m.close(); }); }))
        : h("div", { class: "pg-muted", style: { fontSize: "13px", padding: "6px 2px" }, text: emptyText || "Tidak ada catatan." });
    }
    function listModal(title, list, emptyText, rowFn) {
      m = ui.modal({
        title: title + " (" + list.length + ")",
        class: "pg-modal--form",
        body: [ rowList(list, emptyText, rowFn) ],
        footer: [ ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }) ]
      });
    }

    // A resi counts as "sudah diterima" once someone recorded a receivedDate —
    // independent of paymentStatus, since barang can be lunas but not yet tiba
    // (or belum lunas but sudah diterima, kalau tokonya kasih tempo).
    function isReceived(r) { return !!r.receivedDate; }

    // "Total Nilai Barang" card: two sections (Lunas / Belum Lunas), each with
    // a Sudah Diterima / Belum Diterima filter — a resi can be lunas but the
    // barang belum sampai, so payment status alone doesn't tell the full story.
    // The body is rebuilt in place (not a fresh modal) so the filter toggle
    // doesn't reopen/flash the dialog.
    function nilaiModal(lunasList, belumList) {
      var filter = "semua"; // semua | diterima | belum
      function filtered(list) {
        if (filter === "diterima") return list.filter(isReceived);
        if (filter === "belum") return list.filter(function (r) { return !isReceived(r); });
        return list;
      }
      function emptyMsg(base) { return filter === "semua" ? base : "Tidak ada resi pada filter ini."; }
      function seg() {
        function segBtn(key, label) {
          return h("button", { type: "button", class: "pg-seg__btn" + (filter === key ? " is-active" : ""),
            onclick: function () { filter = key; renderBody(); } }, label);
        }
        return h("div", { class: "pg-seg", style: { marginBottom: "14px" } },
          segBtn("semua", "Semua"), segBtn("diterima", "Sudah Diterima"), segBtn("belum", "Belum Diterima"));
      }
      function renderBody() {
        var fLunas = filtered(lunasList), fBelum = filtered(belumList);
        ui.clear(m.body);
        ui.append(m.body, [
          seg(),
          h("div", { class: "pg-strong", style: { marginBottom: "8px" },
            text: "Lunas (" + fLunas.length + ") — " + moneyID(fLunas.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0)) }),
          h("div", { style: { marginBottom: "16px" } }, rowList(fLunas, emptyMsg("Belum ada barang lunas."))),
          h("div", { class: "pg-strong", style: { marginBottom: "8px", color: "var(--pg-danger)" },
            text: "Belum Lunas (" + fBelum.length + ") — " + moneyID(fBelum.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0)) }),
          rowList(fBelum, emptyMsg("Tidak ada tunggakan."))
        ]);
      }
      m = ui.modal({
        title: "Total Nilai Barang",
        class: "pg-modal--form",
        body: [],
        footer: [ ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }) ]
      });
      renderBody();
    }

    // "Total Keseluruhan" card: grouped by supplier so a user can see each
    // supplier's running total at a glance, with the underlying resi tucked
    // away behind a tap (open/close) instead of one long flat list.
    function supplierGroupModal(title, list) {
      var groups = {}, order = [];
      list.forEach(function (r) {
        var key = (r.supplier || "").trim() || "Tanpa Supplier";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(r);
      });
      function supplierTotal(key) { return groups[key].reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0); }
      // Biggest spend first — that's the ordering a user checking "sudah berapa
      // total ke supplier ini" actually wants, not alphabetical.
      order.sort(function (a, b) { return supplierTotal(b) - supplierTotal(a); });

      var body = order.length ? order.map(function (supplierName) {
        var recs = groups[supplierName];
        var listWrap = h("div", { class: "pg-supplier-group__list", hidden: true },
          recs.map(function (r) { return receiptRow(r, function () { m.close(); }); }));
        var chev = svg("chevronDown", "pg-supplier-group__chevron");
        var head = h("button", { type: "button", class: "pg-supplier-group__head",
          onclick: function () {
            listWrap.hidden = !listWrap.hidden;
            head.classList.toggle("is-open", !listWrap.hidden);
          } },
          h("div", { class: "pg-supplier-group__name" }, svg("store"), h("span", { text: supplierName })),
          h("div", { class: "pg-supplier-group__right" },
            h("span", { class: "pg-strong", text: moneyID(supplierTotal(supplierName)) }),
            h("span", { class: "pg-muted", style: { fontSize: "11px" }, text: recs.length + " resi" }),
            chev
          )
        );
        return h("div", { class: "pg-supplier-group" }, head, listWrap);
      }) : [ h("div", { class: "pg-muted", style: { fontSize: "13px", padding: "6px 2px" }, text: "Belum ada catatan resi gudang." }) ];

      m = ui.modal({
        title: title + " (" + list.length + ")",
        class: "pg-modal--form",
        body: body,
        footer: [ ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }) ]
      });
    }

    function render() {
      ui.clear(host);
      var allRecords = store.warehouseReceiptsForUser(u.id);
      // A draft's payment/goods data is provisional — it never counts toward
      // these totals, only "Riwayat Resi" below shows it (with a Draft badge).
      var records = allRecords.filter(function (r) { return r.status !== "draft"; });

      var lunasRecords = records.filter(function (r) { return r.paymentStatus === "lunas"; });
      var belumLunasRecords = records.filter(function (r) { return r.paymentStatus !== "lunas"; });
      var klopRecords = records.filter(function (r) { return r.paymentStatus === "lunas" && r.goodsStatus === "klop"; });
      var minusRecords = records.filter(function (r) { return r.paymentStatus === "lunas" && r.goodsStatus === "minus"; });
      // "Jatuh Tempo" here means "belum lunas & sudah punya tanggal jatuh tempo"
      // — it does NOT wait for the date to actually pass (that's what the red
      // row badge elsewhere is for). This card is meant as an early-warning
      // list, so it's sorted most-urgent-first (overdue, then soonest due).
      var tempoRecords = records
        .filter(function (r) { return store.warehouseDueUrgency(r) !== null; })
        .sort(function (a, b) { return store.warehouseDueUrgency(a).days - store.warehouseDueUrgency(b).days; });
      // "Non Tempo": belum TF juga, tapi belum punya tanggal jatuh tempo sama
      // sekali — pasangan dari Jatuh Tempo di atas (yang KHUSUS belum TF +
      // SUDAH punya tanggal). Bersama-sama keduanya mencakup seluruh
      // belumLunasRecords tanpa tumpang tindih.
      var nonTempoRecords = records.filter(function (r) { return r.paymentStatus !== "lunas" && !r.dueDate; });

      var totalHarga = records.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var totalLunasValue = lunasRecords.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var totalBelumLunasValue = belumLunasRecords.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var tempoValue = tempoRecords.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var nonTempoValue = nonTempoRecords.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      function moneyStat(n) { return h("div", { style: { fontSize: "15px", fontWeight: 700, lineHeight: "1.25" } }, moneyID(n)); }

      // Rupiah strings ("Rp 1.630.000") run wider than the counts elsewhere in
      // this component, so these two cards get their own smaller, explicit
      // value size on top of the compact .pg-resi-stats sizing — the default
      // .pg-stat__value (28px) still overflows a 2-up mobile card otherwise.
      // Labels are deliberately short (one line) so the card stays tidy.
      var cardsTop = h("div", { class: "pg-grid pg-grid--keep2 pg-resi-stats" },
        ui.statCard({ icon: "wallet", label: "Total Keseluruhan",
          value: moneyStat(totalHarga),
          hint: records.length + " catatan",
          onClick: function () { supplierGroupModal("Total Keseluruhan", records); } }),
        ui.statCard({ icon: "checkCircle", tone: "blue", label: "Total Lunas",
          value: moneyStat(totalLunasValue),
          hint: h("span", { style: { color: "var(--pg-danger)", fontWeight: 700 }, text: "Belum Lunas " + moneyID(totalBelumLunasValue) }),
          onClick: function () { nilaiModal(lunasRecords, belumLunasRecords); } })
      );

      // Jatuh Tempo & Non Tempo together cover every belum-TF resi: the first
      // already has a due date (early-warning list, see warehouseDueUrgency),
      // the second doesn't have one at all yet. Both show the RUPIAH total
      // still outstanding — not the record count, which is available inside
      // each one's own drill-down modal (title already reads "... (N)").
      var cardsTempo = h("div", { class: "pg-grid pg-grid--keep2 pg-resi-stats" },
        ui.statCard({ icon: "clock", tone: "danger", label: "Jatuh Tempo",
          value: moneyStat(tempoValue),
          onClick: function () { listModal("Jatuh Tempo", tempoRecords, "Tidak ada resi dengan tanggal jatuh tempo.", tempoRow); } }),
        ui.statCard({ icon: "info", tone: "neutral", label: "Non Tempo",
          value: moneyStat(nonTempoValue),
          hint: "(Belum Transfer)",
          onClick: function () { listModal("Non Tempo", nonTempoRecords, "Tidak ada resi belum transfer tanpa tanggal jatuh tempo."); } })
      );

      var cardsKlopMinus = h("div", { class: "pg-grid pg-grid--keep2 pg-resi-stats" },
        ui.statCard({ icon: "checkCircle", tone: "green", label: "Lunas Klop", value: numID(klopRecords.length),
          onClick: function () { listModal("Lunas Klop", klopRecords, "Belum ada barang lunas & klop."); } }),
        ui.statCard({ icon: "info", tone: "yellow", label: "Lunas Minus", value: numID(minusRecords.length),
          onClick: function () { listModal("Lunas Minus", minusRecords, "Belum ada barang lunas & minus."); } })
      );

      // Riwayat shows EVERYTHING including drafts by default (so one can be
      // found and resumed) — only the stat cards above are submitted-only.
      // The "Draft" toggle in the header narrows this list to drafts only;
      // tapping it again (or once no drafts remain) goes back to everything.
      var draftRecords = allRecords.filter(function (r) { return r.status === "draft"; });
      if (showDraftOnly && !draftRecords.length) showDraftOnly = false;
      var riwayatList = showDraftOnly ? draftRecords : allRecords;

      var draftToggleBtn = ui.button({
        label: "Draft" + (draftRecords.length ? " (" + draftRecords.length + ")" : ""),
        icon: "doc", size: "sm", variant: showDraftOnly ? "accent" : "ghost",
        onClick: function () { showDraftOnly = !showDraftOnly; page = 1; render(); }
      });

      var pageCount = Math.max(1, Math.ceil(riwayatList.length / PER_PAGE));
      if (page > pageCount) page = pageCount;
      if (page < 1) page = 1;
      var pageRecords = riwayatList.slice((page - 1) * PER_PAGE, (page - 1) * PER_PAGE + PER_PAGE);

      var pagerNode = riwayatList.length > PER_PAGE
        ? ui.pager({
            page: page, pageCount: pageCount,
            info: "Menampilkan " + ((page - 1) * PER_PAGE + 1) + "–" +
              Math.min(page * PER_PAGE, riwayatList.length) + " dari " + riwayatList.length,
            onPage: function (n) { page = n; render(); }
          })
        : null;

      var riwayat = ui.card({ title: "Riwayat Resi", action: draftToggleBtn, body: [
        riwayatList.length
          ? h("div", { class: "pg-grid", style: { gap: "10px" } }, pageRecords.map(function (r) { return receiptRow(r); }))
          : ui.emptyState({ icon: "archive",
              title: showDraftOnly ? "Tidak ada draft." : "Belum ada catatan resi gudang.",
              text: showDraftOnly ? "Draft yang Anda simpan akan tampil di sini."
                : "Catatan barang masuk gudang yang Anda isi akan tampil di sini." }),
        pagerNode
      ]});

      host.appendChild(cardsTop);
      host.appendChild(cardsTempo);
      host.appendChild(cardsKlopMinus);
      host.appendChild(riwayat);
    }

    var fab = h("button", { class: "pg-fab", type: "button", "aria-label": "Catat Resi Gudang",
      title: "Catat Resi Gudang", onclick: function () { openForm(null); } }, svg("plus"));

    render();
    ui.live(render, host);
    return screen(header, [host, fab]);
  };

  /* ---- Data Supplier : a SHARED master list of supplier names (not
         per-employee), reached from the Resi Gudang page header ("Input
         Supplier"). Any signed-in employee may add/edit/delete — it's shared
         company data, same spirit as Manajemen Toko but user-facing since the
         Resi Gudang form's dropdown is exactly what feeds off it. Every
         supplier name used in a resi auto-registers here (pg_whs_ensure on
         the server) the moment it's typed via "+ Tambah Supplier Baru", so
         this page mostly needs occasional manual cleanup (fix a typo, merge
         a duplicate, remove a supplier no longer used). ---- */
  pages.dataSupplier = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Data Supplier", "/resi-gudang");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var q = "";

    function openForm(existing) {
      var fName = ui.field({ label: "Nama Supplier", placeholder: "cth. PT Sumber Makmur", required: true,
        value: existing ? existing.name : "" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });
      function showErr(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
      var m = ui.modal({
        title: existing ? "Ubah Supplier" : "Tambah Supplier",
        body: [ errEl, fName ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "accent", icon: "check", onClick: function () {
            errEl.style.display = "none";
            var name = fName._control.value.trim();
            if (!name) { showErr("Nama supplier wajib diisi."); return; }
            var op = existing
              ? store.warehouseSupplierUpdate(existing.id, name)
              : store.warehouseSupplierCreate(name);
            return op.then(function (res) {
              if (!res || res.ok === false) { showErr((res && res.error) || "Gagal menyimpan supplier."); return; }
              ui.toast(existing ? "Supplier diperbarui." : "Supplier ditambahkan.", "success");
              m.close();
              render();
            });
          } })
        ]
      });
    }

    function askDelete(s) {
      ui.confirm({
        title: "Hapus supplier",
        tone: "danger",
        confirmLabel: "Hapus",
        message: "Hapus supplier \"" + s.name + "\" dari daftar? Resi gudang yang sudah memakai nama ini tidak ikut berubah — ini hanya menghapusnya dari pilihan dropdown ke depannya.",
        onConfirm: function () {
          return store.warehouseSupplierDelete(s.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus supplier.", "danger"); return; }
            ui.toast("Supplier dihapus.", "success");
            render();
          });
        }
      });
    }

    function render() {
      ui.clear(host);
      var all = store.allWarehouseSuppliers();
      var ql = q.trim().toLowerCase();
      var list = ql ? all.filter(function (s) { return s.name.toLowerCase().indexOf(ql) >= 0; }) : all;

      var searchEl = h("input", { class: "pg-input", type: "search", placeholder: "Cari supplier…",
        value: q, autocomplete: "off", onchange: function (e) { q = e.target.value; render(); } });

      var searchCard = ui.card({ body: [ h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Cari" }), searchEl) ] });

      var listCard = ui.card({ title: "Daftar Supplier (" + list.length + ")", body: [
        list.length
          ? h("div", { class: "pg-people" }, list.map(function (s) {
              return h("div", { class: "pg-people__row" },
                h("div", { class: "pg-people__main" }, h("div", { class: "pg-people__name", text: s.name })),
                h("div", { class: "pg-people__right" },
                  ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Ubah supplier", title: "Ubah",
                    onClick: function () { openForm(s); } }),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus supplier", title: "Hapus",
                    onClick: function () { askDelete(s); } }))
              );
            }))
          : ui.emptyState({ icon: "store",
              title: all.length ? "Tidak ada supplier yang cocok." : "Belum ada data supplier.",
              text: all.length ? "Ubah kata pencarian." :
                "Supplier otomatis tercatat begitu dipakai di form Catat Resi Gudang, atau tambahkan manual di sini." })
      ]});

      host.appendChild(searchCard);
      host.appendChild(listCard);
    }

    var fab = h("button", { class: "pg-fab", type: "button", "aria-label": "Tambah Supplier",
      title: "Tambah Supplier", onclick: function () { openForm(null); } }, svg("plus"));

    render();
    ui.live(render, host);
    return screen(header, [host, fab]);
  };

  /* ---- Laporan Resi : read-only cross-staff view of EVERY employee's resi
         gudang — the User-App mirror of the Admin "Laporan Resi Gudang".
         Sibling of Hasil Kunjungan / Hasil KPI: fetched on demand via
         GET /api/warehouse-receipts-all (NOT bootstrap, which only carries the
         viewer's own rows), filtered client-side (divisi / bulan / karyawan /
         cari). Shown only where Admin enables the `laporan_resi` feature. ---- */
  pages.laporanResi = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Laporan Resi");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var PER_PAGE = 12;
    var st = { loading: true, items: null, divisions: [], summary: {},
               div: "", month: "", staff: "", q: "", page: 1 };

    var MO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }
    function numID(n) { return (Math.round(n || 0)).toLocaleString("id-ID"); }
    function monthLabel(ym) {
      if (!ym || ym.indexOf("-") < 0) return ym || "";
      var p = ym.split("-");
      return (MO[(+p[1] || 1) - 1] || p[1]) + " " + p[0];
    }

    function load() {
      st.loading = true; render();
      store.warehouseReceiptsAll().then(function (d) {
        st.loading = false;
        if (d && d.ok !== false) {
          st.items = d.items || [];
          st.divisions = d.divisions || [];
          st.summary = d.summary || {};
        } else {
          st.items = []; st.divisions = []; st.summary = {};
        }
        render();
      }).catch(function () {
        st.loading = false; st.items = []; render();
      });
    }

    function filtered() {
      var q = st.q.trim().toLowerCase();
      return (st.items || []).filter(function (r) {
        if (st.div) {
          // Prefer the cached user's full division set (primary + extra) so a
          // multi-division reporter matches any of their divisions; fall back
          // to whatever the endpoint joined.
          var u = store.find("users", r.userId);
          var ids = (u ? store.userDivisionIds(u) : (r.divisionIds || [])).map(String);
          if (ids.indexOf(String(st.div)) < 0) return false;
        }
        if (st.month && String(r.date).slice(0, 7) !== st.month) return false;
        if (st.staff && String(r.userId) !== String(st.staff)) return false;
        if (q) {
          var hay = (r.itemName + " " + r.supplier + " " + r.resiNo + " " +
            (r.payment || "") + " " + (r.shipping || "") + " " + (r.userName || "")).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });
    }

    /* ---- detail modal (read-only), same sectioned layout as the Admin panel ---- */
    function receiptDetail(r) {
      var u = store.find("users", r.userId) || {};
      function row(k, v, opts) {
        opts = opts || {};
        var valNode = (v && v.nodeType) ? v : h("span", null, (v == null || v === "") ? "—" : String(v));
        return h("div", { class: "pg-rgdetail__row" + (opts.total ? " pg-rgdetail__row--total" : "") },
          h("span", { class: "pg-rgdetail__row-k", text: k }),
          h("span", { class: "pg-rgdetail__row-v" }, valNode,
            opts.sub ? h("small", { class: "pg-rgdetail__row-sub", text: opts.sub }) : null));
      }
      function section(label, iconName, rows) {
        return h("div", { class: "pg-rgdetail__sec" },
          h("div", { class: "pg-rgdetail__sec-head" }, svg(iconName), h("span", { text: label })),
          h("div", { class: "pg-rgdetail__rows" }, rows.filter(Boolean)));
      }
      var received = !!r.receivedDate;
      var grandTotal = (r.totalPrice || 0) + (r.shippingCost || 0);
      var computed = (r.qty || 0) * (r.unitPrice || 0);
      var totalSub = (r.unitPrice && computed !== r.totalPrice)
        ? "Manual — beda dari Harga × Pcs (" + moneyID(computed) + ")" : null;
      var st2 = store.warehouseReceiptStatus(r);
      var goodsLabel = r.goodsStatus === "klop" ? "Klop (sesuai)"
        : r.goodsStatus === "minus" ? "Minus (kurang)"
        : received ? "Belum ditandai" : "Belum diterima";

      ui.modal({
        title: "Detail Resi Gudang",
        class: "pg-modal--form",
        body: [ h("div", { class: "pg-rgdetail" },
          h("div", { class: "pg-rgdetail__id" },
            userAvatar({ fullName: r.userName || u.fullName, photoUrl: u.photoUrl }, 46),
            h("div", { style: { minWidth: "0" } },
              h("div", { class: "pg-rgdetail__id-name", text: r.userName || u.fullName || "Karyawan" }),
              h("div", { class: "pg-rgdetail__id-meta",
                text: (u.username ? "@" + u.username + " · " : "") + (r.divisionNames || "—") }))
          ),
          h("div", { class: "pg-rgdetail__hero" },
            h("div", { class: "pg-rgdetail__hero-title", text: r.itemName }),
            ui.badge(st2.label, st2.tone),
            h("div", { class: "pg-rgdetail__hero-sub" },
              h("span", null, ui.fmtDateWeekdayID(r.date)),
              " · No Resi ", h("code", { text: r.resiNo || "—" }))
          ),
          section("Barang & Supplier", "archive", [
            row("Nama Barang", r.itemName),
            row("Supplier", r.supplier),
            row("No Resi", h("code", { text: r.resiNo || "—" })),
            row("Tanggal Resi", ui.fmtDateWeekdayID(r.date))
          ]),
          section("Rincian Nilai", "wallet", [
            row("Harga Satuan", moneyID(r.unitPrice)),
            row("Pcs", numID(r.qty)),
            row("Total Harga", moneyID(r.totalPrice), { sub: totalSub }),
            row("Ongkir", moneyID(r.shippingCost)),
            row("Total + Ongkir", moneyID(grandTotal), { total: true }),
            row("Jumlah Koli (Karung)", numID(r.koli) + " karung")
          ]),
          section("Pembayaran", "wallet", [
            row("Status Pembayaran", r.paymentStatus === "lunas" ? "Lunas" : "Belum Lunas"),
            r.paymentStatus !== "lunas"
              ? row("Tanggal Jatuh Tempo", r.dueDate ? ui.fmtDateWeekdayID(r.dueDate) : "Belum diisi")
              : null,
            row("Metode Pembayaran", r.payment)
          ]),
          section("Pengiriman & Penerimaan", "store", [
            row("Pengiriman", r.shipping),
            row("Tanggal Diterima", received
              ? ui.fmtDateWeekdayID(r.receivedDate)
              : h("span", { class: "pg-muted", text: "Belum diterima" })),
            row("Kondisi Barang", goodsLabel)
          ]),
          r.note
            ? h("div", { class: "pg-rgdetail__note" },
                h("div", { class: "pg-rgdetail__note-label", text: "Keterangan" }),
                h("div", { text: r.note }))
            : null,
          h("div", { class: "pg-rgdetail__foot" },
            h("div", { text: "Dicatat oleh " + (r.userName || u.fullName || "karyawan") + " · " +
              (r.createdAt ? ui.fmtDateWeekdayID(r.createdAt) + " " + ui.fmtTimeID(r.createdAt) : "—") }),
            (r.updatedAt && r.updatedAt !== r.createdAt)
              ? h("div", { text: "Terakhir diubah " + ui.fmtDateShortID(r.updatedAt) }) : null,
            h("div", { text: "ID resi gudang #" + r.id })
          )
        ) ]
      });
    }

    function selField(label, value, blankLabel, options, onChange) {
      var f = ui.field({ label: label, type: "select", value: value,
        options: [{ value: "", label: blankLabel }].concat(options) });
      f._control.addEventListener("change", function (e) { onChange(e.target.value); });
      return f;
    }

    function rcard(r) {
      var u = store.find("users", r.userId) || {};
      var st2 = store.warehouseReceiptStatus(r);
      return h("button", { type: "button", class: "pg-lapresi-row",
        onclick: function () { receiptDetail(r); } },
        userAvatar({ fullName: r.userName || u.fullName, photoUrl: u.photoUrl }, 34),
        h("div", { class: "pg-lapresi-row__main" },
          h("div", { class: "pg-lapresi-row__t", text: r.itemName }),
          h("div", { class: "pg-lapresi-row__m",
            text: (r.userName || u.fullName || "Karyawan") + " · " + ui.fmtDateShortID(r.date) + " · " + r.supplier }),
          h("div", { class: "pg-lapresi-row__m", text: numID(r.qty) + " pcs · " + numID(r.koli) + " karung · " + (r.shipping || "—") })
        ),
        h("div", { class: "pg-lapresi-row__right" },
          h("div", { class: "pg-strong", text: moneyID((r.totalPrice || 0) + (r.shippingCost || 0)) }),
          ui.badge(st2.label, st2.tone)
        )
      );
    }

    function render() {
      ui.clear(host);
      if (st.loading && !st.items) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "doc", title: "Memuat laporan resi…" })] }));
        return;
      }
      var all = st.items || [];
      var rows = filtered();
      var hasFilter = !!(st.div || st.month || st.staff || st.q.trim());

      // filter options from the full set
      var monthSet = {}, staffSet = {};
      all.forEach(function (r) {
        monthSet[String(r.date).slice(0, 7)] = 1;
        if (r.userId) staffSet[r.userId] = r.userName || (store.find("users", r.userId) || {}).fullName || ("#" + r.userId);
      });
      var monthOpts = Object.keys(monthSet).sort().reverse().map(function (m) { return { value: m, label: monthLabel(m) }; });
      var staffOpts = Object.keys(staffSet).sort(function (a, b) {
        return String(staffSet[a]).localeCompare(String(staffSet[b]));
      }).map(function (id) { return { value: id, label: staffSet[id] }; });
      var divOpts = (st.divisions || []).map(function (d) { return { value: d.id, label: d.name }; });

      var searchEl = h("input", { class: "pg-input", type: "search", placeholder: "Cari barang / supplier / no resi / staf…",
        value: st.q, autocomplete: "off",
        oninput: function (e) { st.q = e.target.value; st.page = 1; repaintList(); } });

      var filterCard = ui.card({ body: [
        h("div", { class: "pg-grid pg-grid--keep2", style: { gap: "10px" } },
          selField("Divisi", st.div, "Semua Divisi", divOpts, function (v) { st.div = v; st.page = 1; render(); }),
          selField("Bulan", st.month, "Semua Bulan", monthOpts, function (v) { st.month = v; st.page = 1; render(); }),
          selField("Karyawan", st.staff, "Semua Karyawan", staffOpts, function (v) { st.staff = v; st.page = 1; render(); })
        ),
        h("div", { class: "pg-field", style: { marginTop: "10px" } },
          h("label", { class: "pg-field__label", text: "Cari" }), searchEl),
        hasFilter
          ? h("div", { style: { marginTop: "10px" } }, ui.button({ label: "Reset filter", variant: "ghost", size: "sm",
              onClick: function () { st.div = ""; st.month = ""; st.staff = ""; st.q = ""; st.page = 1; render(); } }))
          : null
      ]});

      var totalValue = rows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var totalShip = rows.reduce(function (s, r) { return s + (r.shippingCost || 0); }, 0);
      var totalQty = rows.reduce(function (s, r) { return s + (r.qty || 0); }, 0);
      var totalKoli = rows.reduce(function (s, r) { return s + (r.koli || 0); }, 0);
      var belumLunas = rows.filter(function (r) { return r.paymentStatus !== "lunas"; }).length;
      var tempo = rows.filter(function (r) { return store.warehouseReceiptStatus(r).key === "jatuh_tempo"; }).length;
      var staffN = Object.keys(rows.reduce(function (m, r) { m[r.userId] = 1; return m; }, {})).length;

      var summary = h("div", { class: "pg-grid pg-grid--keep2" },
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("doc"), "Catatan"),
          h("div", { class: "pg-ministat__value", text: numID(rows.length) }),
          h("div", { class: "pg-ministat__cap", text: staffN + " staf · " + (hasFilter ? "sesuai filter" : "semua") })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("wallet"), "Nilai Barang"),
          h("div", { class: "pg-ministat__value", style: { fontSize: "16px" }, text: moneyID(totalValue) }),
          h("div", { class: "pg-ministat__cap", text: "ongkir " + moneyID(totalShip) })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("grid"), "Pcs / Karung"),
          h("div", { class: "pg-ministat__value", style: { fontSize: "16px" }, text: numID(totalQty) + " / " + numID(totalKoli) }),
          h("div", { class: "pg-ministat__cap", text: "total unit" })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("clock"), "Jatuh Tempo"),
          h("div", { class: "pg-ministat__value", style: { fontSize: "16px" }, text: numID(tempo) }),
          h("div", { class: "pg-ministat__cap", text: belumLunas + " belum lunas" }))
      );

      var listCard = ui.card({ title: "Daftar Resi Gudang", body: [ h("div", { class: "pg-lapresi-list" }) ] });

      host.appendChild(filterCard);
      host.appendChild(summary);
      host.appendChild(listCard);
      repaintList();

      function repaintList() {
        var listEl = host.querySelector(".pg-lapresi-list");
        if (!listEl) return;
        var rr = filtered();
        ui.clear(listEl);
        if (!rr.length) {
          listEl.appendChild(ui.emptyState({ icon: "doc",
            title: all.length ? "Tidak ada catatan untuk filter ini." : "Belum ada laporan resi gudang.",
            text: all.length ? "Ubah atau reset filter." : "Resi gudang yang dicatat staf akan tampil di sini." }));
          return;
        }
        var pageCount = Math.max(1, Math.ceil(rr.length / PER_PAGE));
        if (st.page > pageCount) st.page = pageCount;
        if (st.page < 1) st.page = 1;
        rr.slice((st.page - 1) * PER_PAGE, st.page * PER_PAGE).forEach(function (r) { listEl.appendChild(rcard(r)); });
        if (rr.length > PER_PAGE) {
          listEl.appendChild(ui.pager({
            page: st.page, pageCount: pageCount,
            info: "Menampilkan " + ((st.page - 1) * PER_PAGE + 1) + "–" +
              Math.min(st.page * PER_PAGE, rr.length) + " dari " + rr.length,
            onPage: function (n) { st.page = n; repaintList(); }
          }));
        }
      }
    }

    load();
    ui.live(load, host);
    return screen(header, [host]);
  };

  /* ---- Jadwal Piket : a WEEKLY RECURRING duty roster keyed by day-of-week
         (not a date) — Admin assigns it, read-only here. "Piket Anda" surfaces
         just this employee's own days up top; "Jadwal Piket Tim" shows the
         full week so everyone can see who else is on duty. Both come straight
         from bootstrap's shared piketSchedules/piketSettings (no fetch). ---- */
  pages.jadwalPiket = function (ctx) {
    var u = ctx.user;
    var store = PG.store;
    var header = backHeader(ctx, "Jadwal Piket");

    var todayCode = store.piketTodayCode();
    var s = store.piketSettings();
    function userName(id) { var x = store.find("users", id); return x ? x.fullName : "Karyawan"; }
    function dayShort(label) { return label.slice(0, 3).toUpperCase(); }

    var byDay = {};
    store.allPiketSchedules().forEach(function (r) { (byDay[r.dayOfWeek] = byDay[r.dayOfWeek] || []).push(r); });

    // One styled day row — reused by "Piket Anda" and "Jadwal Piket Tim".
    function dayRow(d, rows, noteText) {
      var isToday = d.value === todayCode;
      var isFriday = d.value === "fri";
      var cls = "pg-piket-day" + (isToday ? " pg-piket-day--today" : (isFriday ? " pg-piket-day--friday" : ""));

      var head = [h("span", { text: d.label })];
      if (isToday) head.push(h("span", { class: "pg-piket-tag pg-piket-tag--today", text: "Hari ini" }));
      if (isFriday) head.push(h("span", { class: "pg-piket-tag pg-piket-tag--berkah", text: "Jumat Berkah" }));

      var people = rows.length
        ? h("div", { class: "pg-piket-people" }, rows.map(function (r) {
            var mine = String(r.userId) === String(u.id);
            var nm = userName(r.userId);
            return h("span", { class: "pg-piket-chip" + (mine ? " pg-piket-chip--me" : "") },
              h("span", { class: "pg-piket-chip__ini", text: ui.initials(nm) }),
              h("span", { text: nm + (mine ? " (Anda)" : "") }));
          }))
        : h("div", { class: "pg-piket-empty", text: "Belum ada yang piket." });

      return h("div", { class: cls },
        h("div", { class: "pg-piket-badge", text: dayShort(d.label) }),
        h("div", { class: "pg-piket-body" },
          h("div", { class: "pg-piket-dayhead" }, head),
          people,
          noteText ? h("div", { class: "pg-piket-empty", style: { marginTop: "6px", color: "var(--pg-text-secondary)" }, text: noteText }) : null
        )
      );
    }

    /* ---- Piket Anda ---- */
    var myDays = store.PIKET_DAYS.filter(function (d) {
      return (byDay[d.value] || []).some(function (r) { return String(r.userId) === String(u.id); });
    });
    var hasFriday = myDays.some(function (d) { return d.value === "fri"; });

    var myBody = [];
    var reminders = [];
    if (s.enabled) reminders.push("piket harian pukul " + s.reminderTime);
    if (hasFriday && s.fridayEnabled) reminders.push("Jumat Berkah pukul " + s.fridayTime);
    if (reminders.length) {
      myBody.push(h("div", { class: "pg-piket-note" + (hasFriday && s.fridayEnabled ? " pg-piket-note--berkah" : "") },
        svg("bell"),
        h("div", { text: "Anda akan diingatkan: " + reminders.join(" · ") + "." })));
    }
    if (myDays.length) {
      myBody.push(h("div", { class: "pg-piket-list" }, myDays.map(function (d) {
        var mineRows = (byDay[d.value] || []).filter(function (r) { return String(r.userId) === String(u.id); });
        return dayRow(d, mineRows, mineRows[0] && mineRows[0].note);
      })));
    } else {
      myBody.push(ui.emptyState({ icon: "calendar", title: "Anda tidak terjadwal piket.",
        text: "Admin belum menjadwalkan piket untuk Anda." }));
    }
    var myCard = ui.card({ title: "Piket Anda", body: myBody });

    /* ---- Jadwal Piket Tim ---- */
    var teamCard = ui.card({ title: "Jadwal Piket Tim", body: [
      h("div", { class: "pg-piket-list" }, store.PIKET_DAYS.map(function (d) { return dayRow(d, byDay[d.value] || []); }))
    ]});

    return screen(header, [myCard, teamCard]);
  };

  /* ---- Kerja Staf : read-only view of EVERY active staff's todos that matter
         today (created / due / touched today), grouped per person. Data comes
         from GET /api/staff-work (not bootstrap). Shown only where Admin
         enables the `kerja_staf` feature. ---- */
  pages.kerjaStaf = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Kerja Staf");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var st = { loading: true, data: null };

    var PRIO = { high: { label: "Tinggi", tone: "danger" }, mid: { label: "Sedang", tone: "warning" }, low: { label: "Rendah", tone: "neutral" } };
    var STAT = { todo: { label: "Belum Selesai", tone: "warning" }, in_progress: { label: "Berjalan", tone: "info" }, done: { label: "Selesai", tone: "success" } };

    function load() {
      store.staffWork().then(function (d) {
        st.loading = false;
        st.data = (d && d.ok !== false) ? d : { staff: [], date: store.dateKey() };
        render();
      }).catch(function () { st.loading = false; st.data = { staff: [], date: store.dateKey() }; render(); });
    }

    /* Who added this task, shown as "Nama (Divisi)". */
    function assignedByText(t) {
      if (t.createdBySource !== "user") return "Admin";
      if (String(t.createdByUserId || "") === String(t.assigneeId || "")) return "Dibuat sendiri";
      return (t.createdByName || "Rekan kerja") + (t.createdByDivision ? " · " + t.createdByDivision : "");
    }

    /* ---------- assign a task to any staff ---------- */
    var fab = h("button", { class: "pg-fab", type: "button", "aria-label": "Tambah Tugas Staf",
      title: "Tambah tugas untuk staf", onclick: function () { addTaskFlow(); } }, svg("plus"));

    function addTaskFlow(presetAssigneeId) {
      var people = store.all("users")
        .filter(function (x) { return x.status === "active"; })
        .sort(function (a, b) { return (a.fullName || "").localeCompare(b.fullName || ""); });
      if (!people.length) { ui.toast("Belum ada karyawan aktif.", "danger"); return; }

      var fWho = ui.field({ label: "Untuk Karyawan", type: "select", required: true,
        value: presetAssigneeId ? String(presetAssigneeId) : "",
        options: [{ value: "", label: "— Pilih karyawan —" }].concat(people.map(function (x) {
          var dv = (x.divisionLabels && x.divisionLabels.length) ? x.divisionLabels[0]
            : (x.divisionLabel || store.divisionName(x.divisionId));
          return { value: String(x.id), label: x.fullName + (dv ? " · " + dv : "") };
        })) });
      var fTitle = ui.field({ label: "Judul Tugas", placeholder: "cth. Siapkan laporan stok", required: true });
      var fPrio = ui.field({ label: "Prioritas", type: "select", value: "mid", options: [
        { value: "high", label: "Tinggi" }, { value: "mid", label: "Sedang" }, { value: "low", label: "Rendah" }] });
      var fDeadline = ui.field({ label: "Deadline (opsional)", type: "date" });
      var fDesc = ui.field({ label: "Deskripsi (opsional)", type: "textarea", placeholder: "Detail pekerjaan…" });
      var errEl = h("div", { class: "pg-ulogin__error", style: { display: "none" } });

      var m = ui.modal({
        title: "Tambah Tugas untuk Staf",
        body: [fWho, fTitle, h("div", { class: "pg-grid pg-grid--2" }, fPrio, fDeadline), fDesc, errEl,
          ui.notice("Tugas akan tercatat sebagai ditambahkan oleh Anda (nama & divisi Anda), dan karyawan yang dipilih akan diberi notifikasi.", { muted: true })],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Tambahkan", variant: "accent", icon: "plus", onClick: function () {
            var assigneeId = fWho._control.value;
            var title = fTitle._control.value.trim();
            if (!assigneeId) { errEl.textContent = "Pilih karyawan yang akan diberi tugas."; errEl.style.display = "block"; return; }
            if (!title) { errEl.textContent = "Judul tugas wajib diisi."; errEl.style.display = "block"; return; }
            errEl.style.display = "none";
            return store.staffWorkAddTodo({
              assigneeId: assigneeId,
              title: title,
              description: fDesc._control.value.trim(),
              priority: fPrio._control.value || "mid",
              deadline: fDeadline._control.value || null
            }).then(function (res) {
              if (!res || res.ok === false) {
                errEl.textContent = (res && res.error) || "Gagal menambahkan tugas.";
                errEl.style.display = "block";
                return;
              }
              ui.toast("Tugas ditambahkan untuk staf.", "success");
              m.close();
              load();
            });
          } })
        ]
      });
    }

    function attTiles(atts) {
      if (!atts || !atts.length) return null;
      var grid = h("div", { class: "pg-att-grid", style: { marginTop: "10px" } });
      atts.forEach(function (a) { grid.appendChild(ui.attachmentTile(a)); });   // no onRemove = read-only
      return grid;
    }

    function detailRow(label, value) {
      return h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: label }),
          h("div", { class: "pg-history-row__d", text: value })));
    }

    function todoDetail(staffName, t) {
      ui.modal({
        title: t.title,
        body: [ h("div", { class: "pg-grid", style: { gap: "10px" } },
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            ui.badge(STAT[t.status] ? STAT[t.status].label : t.status, STAT[t.status] ? STAT[t.status].tone : "neutral"),
            ui.badge("Prioritas " + (PRIO[t.priority] ? PRIO[t.priority].label : t.priority), PRIO[t.priority] ? PRIO[t.priority].tone : "neutral"),
            t.programName ? ui.badge("Program: " + t.programName, "neutral") : null),
          ui.progressBar(t.progress || 0, { showPct: true, label: "Progres" }),
          detailRow("Pelaksana", staffName),
          detailRow("Deadline", t.deadline ? ui.fmtDateWeekdayID(t.deadline) : "Tanpa deadline"),
          detailRow("Ditugaskan oleh", assignedByText(t)),
          t.description ? h("div", { class: "pg-notice pg-notice--muted" }, svg("info"),
            h("div", { text: t.description })) : null,
          t.userNote ? h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"),
            h("div", { text: "Catatan pengerjaan: " + t.userNote })) : null,
          attTiles(t.attachments),
          ui.notice("Diperbarui " + (t.updatedAt ? ui.timeAgo(t.updatedAt) : "—"), { muted: true })
        ) ]
      });
    }

    function todoItem(staffName, t) {
      var byPeer = t.createdBySource === "user"
        && String(t.createdByUserId || "") !== String(t.assigneeId || "");
      return h("button", { class: "pg-todo-item pg-todo-item--" + (t.priority || "low"),
        style: { textAlign: "left" }, onclick: function () { todoDetail(staffName, t); } },
        h("div", { class: "pg-todo-item__head" },
          h("div", { class: "pg-todo-item__title" }, svg("checklist"), h("span", { text: t.title })),
          t.programName ? h("span", { class: "pg-badge pg-badge--neutral", style: { flex: "none" }, text: "Program" }) : null,
          svg("chevronRight")),
        byPeer ? h("div", { class: "pg-todo-item__note" }, svg("user"),
          h("span", { text: "Ditugaskan oleh " + assignedByText(t) })) : null,
        t.userNote ? h("div", { class: "pg-todo-item__note" }, svg("edit"),
          h("span", { text: t.userNote.length > 60 ? t.userNote.slice(0, 60) + "…" : t.userNote })) : null,
        ui.progressBar(t.progress || 0),
        h("div", { class: "pg-todo-item__foot" },
          h("span", { text: t.deadline ? ui.fmtDateShortID(t.deadline) : "Tanpa deadline" }),
          ui.statusBadge(t.status),
          h("span", { text: (t.progress || 0) + "%" }),
          t.attachmentCount ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: "3px" } },
            svg("paperclip"), String(t.attachmentCount)) : null)
      );
    }

    function staffCard(g) {
      var u = store.find("users", g.userId) || {};
      var divLabel = (u.divisionLabels && u.divisionLabels.length) ? u.divisionLabels.join(", ") : (u.divisionLabel || null);
      return ui.card({ body: [
        h("div", { class: "pg-kstaf-head" },
          userAvatar({ fullName: g.name, photoUrl: u.photoUrl }, 40),
          h("div", { style: { flex: "1", minWidth: "0" } },
            h("div", { class: "pg-strong", text: g.name }),
            h("div", { class: "pg-muted", style: { fontSize: "12px" },
              text: (divLabel ? divLabel + " · " : "") + g.todos.length + " pekerjaan" })),
          h("div", { class: "pg-kstaf-counts" },
            g.counts.in_progress ? ui.badge(g.counts.in_progress + " berjalan", "info") : null,
            g.counts.todo ? ui.badge(g.counts.todo + " antre", "warning") : null,
            g.counts.done ? ui.badge(g.counts.done + " selesai", "success") : null)),
        h("div", { class: "pg-grid", style: { gap: "8px", marginTop: "10px" } },
          g.todos.map(function (t) { return todoItem(g.name, t); })),
        h("button", { class: "pg-kstaf-add", type: "button",
          onclick: function () { addTaskFlow(g.userId); } },
          svg("plus"), h("span", { text: "Tambah tugas untuk " + g.name.split(" ")[0] }))
      ]});
    }

    function render() {
      ui.clear(host);
      if (st.loading) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "checklist", title: "Memuat kerja staf…" })] }));
        return;
      }
      var data = st.data || { staff: [] };
      var staff = data.staff || [];
      var totalTodos = 0, totalDone = 0;
      staff.forEach(function (g) { totalTodos += g.todos.length; totalDone += g.counts.done; });

      host.appendChild(ui.card({ body: [
        h("div", { class: "pg-strong", text: "Pekerjaan Staf Hari Ini" }),
        h("div", { class: "pg-muted", style: { fontSize: "12.5px", marginTop: "2px" },
          text: ui.fmtDateWeekdayID(data.date || store.dateKey()) })
      ]}));

      if (!staff.length) {
        host.appendChild(ui.card({ body: [ ui.emptyState({ icon: "checklist",
          title: "Belum ada pekerjaan staf hari ini.",
          text: "Todo yang dibuat, jatuh tempo, atau dikerjakan hari ini akan tampil di sini." }) ] }));
        return;
      }
      host.appendChild(h("div", { class: "pg-grid pg-grid--keep2" },
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("users"), "Staf Aktif"),
          h("div", { class: "pg-ministat__value", text: String(staff.length) }),
          h("div", { class: "pg-ministat__cap", text: "punya pekerjaan hari ini" })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("checklist"), "Total Pekerjaan"),
          h("div", { class: "pg-ministat__value", text: String(totalTodos) }),
          h("div", { class: "pg-ministat__cap", text: totalDone + " selesai" }))
      ));
      staff.forEach(function (g) { host.appendChild(staffCard(g)); });
    }

    load();
    ui.live(load, host);
    return screen(header, [host, fab]);
  };

  /* ---- Hasil Kunjungan : read-only view of EVERY staff's visit reports for a
         single day, grouped per person. Two in-screen pages — "Hari Ini" and
         "Kemarin" — via a segmented control. Data comes from
         GET /api/visit-results (not bootstrap); photos stream through
         GET /api/visit-results-file so any employee can view a colleague's
         evidence. Shown only where Admin enables the `hasil_kunjungan`
         feature. ---- */
  pages.hasilKunjungan = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Hasil Kunjungan");
    var segHost = h("div", { class: "pg-seg" });
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var st = { day: "today", loading: true, data: null };

    function apiDay() { return st.day === "kemarin" ? "yesterday" : "today"; }
    function statusInfo(s) {
      return s === "reviewed" ? { label: "Direview", tone: "success" } : { label: "Terkirim", tone: "info" };
    }

    function load() {
      st.loading = true; render();
      store.visitResults(apiDay()).then(function (d) {
        st.loading = false;
        st.data = (d && d.ok !== false) ? d : { staff: [], date: store.dateKey(), summary: {} };
        render();
      }).catch(function () {
        st.loading = false; st.data = { staff: [], date: store.dateKey(), summary: {} }; render();
      });
    }

    function detailRow(label, value) {
      return h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: label }),
          h("div", { class: "pg-history-row__d", text: value })));
    }

    /* photos grouped by the checklist item they were taken for (untagged last) */
    function groupByChecklist(list) {
      var groups = {}, order = [];
      (list || []).forEach(function (a) {
        var key = a.checklistItemLabel || "__other__";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(a);
      });
      return order.map(function (key) {
        return { label: key === "__other__" ? "Foto Lainnya" : key, items: groups[key] };
      });
    }

    function photoBlock(atts) {
      if (!atts || !atts.length) return ui.notice("Tidak ada foto pada laporan ini.", { muted: true });
      return h("div", { class: "pg-grid", style: { gap: "10px" } }, groupByChecklist(atts).map(function (g) {
        return h("div", null,
          h("div", { class: "pg-muted", style: { fontSize: "12px", fontWeight: "700", marginBottom: "6px" },
            text: g.label + " (" + g.items.length + ")" }),
          h("div", { class: "pg-att-grid" }, g.items.map(function (a) {
            return ui.attachmentTile({ kind: "image", fileUrl: a.fileUrl, name: a.name,
              label: g.label !== "Foto Lainnya" ? g.label : (a.name || "Foto") });   // no onRemove = read-only
          })));
      }));
    }

    function visitDetail(staffName, v) {
      var si = statusInfo(v.status);
      ui.modal({
        title: v.agenda,
        body: [ h("div", { class: "pg-grid", style: { gap: "10px" } },
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
            ui.badge(si.label, si.tone),
            v.reviewedBy ? ui.badge("Ditinjau: " + v.reviewedBy, "neutral") : null),
          detailRow("Toko Dikunjungi", v.storeName || "—"),
          detailRow("Tanggal Kunjungan", v.visitDate ? ui.fmtDateWeekdayID(v.visitDate) : "—"),
          detailRow("Pelaksana", staffName),
          detailRow("Divisi", v.divisionNames || v.divisionName || "—"),
          v.note ? h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"),
            h("div", { text: "Catatan: " + v.note })) : null,
          photoBlock(v.attachments),
          ui.notice("Dikirim " + (v.createdAt ? ui.timeAgo(v.createdAt) : "—"), { muted: true })
        ) ]
      });
    }

    function visitItem(staffName, v) {
      var si = statusInfo(v.status);
      return h("button", { class: "pg-todo-item", style: { textAlign: "left" },
        onclick: function () { visitDetail(staffName, v); } },
        h("div", { class: "pg-todo-item__head" },
          h("div", { class: "pg-todo-item__title" }, svg("building"), h("span", { text: v.agenda })),
          ui.badge(si.label, si.tone),
          svg("chevronRight")),
        h("div", { class: "pg-todo-item__foot" },
          h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
            svg("store"), h("span", { text: v.storeName || "Tanpa toko" })),
          h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
            svg("image"), h("span", { text: (v.attachmentCount || 0) + " foto" })))
      );
    }

    function staffCard(g) {
      var u = store.find("users", g.userId) || {};
      var divLabel = (u.divisionLabels && u.divisionLabels.length) ? u.divisionLabels.join(", ")
        : (u.divisionLabel || g.divisionName || null);
      return ui.card({ body: [
        h("div", { class: "pg-kstaf-head" },
          userAvatar({ fullName: g.name, photoUrl: u.photoUrl }, 40),
          h("div", { style: { flex: "1", minWidth: "0" } },
            h("div", { class: "pg-strong", text: g.name }),
            h("div", { class: "pg-muted", style: { fontSize: "12px" },
              text: (divLabel ? divLabel + " · " : "") + g.visits.length + " kunjungan" })),
          h("div", { class: "pg-kstaf-counts" },
            g.counts.submitted ? ui.badge(g.counts.submitted + " terkirim", "info") : null,
            g.counts.reviewed ? ui.badge(g.counts.reviewed + " direview", "success") : null)),
        h("div", { class: "pg-grid", style: { gap: "8px", marginTop: "10px" } },
          g.visits.map(function (v) { return visitItem(g.name, v); }))
      ]});
    }

    function renderSeg() {
      ui.clear(segHost);
      [["today", "Hari Ini"], ["kemarin", "Kemarin"]].forEach(function (t) {
        segHost.appendChild(h("button", {
          class: "pg-seg__btn" + (st.day === t[0] ? " is-active" : ""), type: "button",
          onclick: function () {
            if (st.day === t[0]) return;
            st.day = t[0]; st.data = null; renderSeg(); load();
          }
        }, h("span", { text: t[1] })));
      });
    }

    function render() {
      ui.clear(host);
      if (st.loading && !st.data) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "building", title: "Memuat hasil kunjungan…" })] }));
        return;
      }
      var data = st.data || { staff: [], summary: {} };
      var staff = data.staff || [];
      var sum = data.summary || {};

      host.appendChild(ui.card({ body: [
        h("div", { class: "pg-strong", text: st.day === "kemarin" ? "Kunjungan Kemarin" : "Kunjungan Hari Ini" }),
        h("div", { class: "pg-muted", style: { fontSize: "12.5px", marginTop: "2px" },
          text: ui.fmtDateWeekdayID(data.date || store.dateKey()) })
      ]}));

      if (!staff.length) {
        host.appendChild(ui.card({ body: [ ui.emptyState({ icon: "building",
          title: st.day === "kemarin" ? "Tidak ada laporan kunjungan kemarin." : "Belum ada laporan kunjungan hari ini.",
          text: "Laporan kunjungan yang dikirim staf akan tampil di sini." }) ] }));
        return;
      }

      host.appendChild(h("div", { class: "pg-grid pg-grid--keep2" },
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("users"), "Staf Berkunjung"),
          h("div", { class: "pg-ministat__value", text: String(sum.staffCount != null ? sum.staffCount : staff.length) }),
          h("div", { class: "pg-ministat__cap", text: (sum.storesVisited || 0) + " toko dikunjungi" })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("building"), "Total Kunjungan"),
          h("div", { class: "pg-ministat__value", text: String(sum.visitCount != null ? sum.visitCount : 0) }),
          h("div", { class: "pg-ministat__cap", text: (sum.reviewed || 0) + " direview" }))
      ));
      staff.forEach(function (g) { host.appendChild(staffCard(g)); });
    }

    renderSeg();
    load();
    ui.live(load, host);
    return h("div", { class: "pg-user__scroll" }, header,
      h("div", { class: "pg-uscreen" }, segHost, host));
  };

  /* ---- Hasil KPI : read-only view of EVERY staff's KPI reports, grouped per
         person, with three filters — Periode (template period type), Divisi,
         Bulan. Data from GET /api/kpi-results; a colleague's report detail
         streams via GET /api/kpi-results/{id} (the generic /kpi/reports/{id}
         refuses a non-author non-admin). Shown only where Admin enables the
         `hasil_kpi` feature. ---- */
  pages.hasilKpi = function (ctx) {
    var store = PG.store;
    var header = backHeader(ctx, "Hasil KPI");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var st = { loading: true, data: null, period: "", divisionId: "", month: "" };

    var MO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    var PERIOD_OPTS = [
      { value: "", label: "Semua Periode" },
      { value: "monthly", label: "Bulanan" },
      { value: "weekly", label: "Mingguan" }
    ];

    function pctText(v) { return v == null ? "—" : (Math.round(v * 10) / 10) + "%"; }
    function fmtNum(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("id-ID"); }
    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }
    function itemVal(n, it) { return it && it.isMoney ? moneyID(n) : fmtNum(n); }
    function monthLabel(ym) {
      if (!ym || ym.indexOf("-") < 0) return ym || "";
      var p = ym.split("-");
      return (MO[(+p[1] || 1) - 1] || p[1]) + " " + p[0];
    }
    function periodLine(r) {
      if (r.periodStart && r.periodEnd) return ui.fmtDateShortID(r.periodStart) + " – " + ui.fmtDateShortID(r.periodEnd);
      return r.periodLabel || (r.weekNo ? "Pekan " + r.weekNo : "—");
    }
    function scoreTone(pct) {
      var b = store.kpiBand(pct);
      return b === "tercapai" ? "success" : b === "progres" ? "warning" : b === "kurang" ? "danger" : "neutral";
    }
    function statusInfo(s) {
      return s === "reviewed" ? { label: "Direview", tone: "success" } : { label: "Terkirim", tone: "info" };
    }

    function load() {
      st.loading = true; render();
      store.kpiResults({ period: st.period, divisionId: st.divisionId, month: st.month }).then(function (d) {
        st.loading = false;
        st.data = (d && d.ok !== false) ? d : { staff: [], summary: {}, divisions: [], months: [] };
        render();
      }).catch(function () {
        st.loading = false; st.data = { staff: [], summary: {}, divisions: [], months: [] }; render();
      });
    }

    function detailRow(label, value) {
      return h("div", { class: "pg-history-row", style: { alignItems: "flex-start" } },
        h("div", { class: "pg-history-row__main" },
          h("div", { class: "pg-history-row__t", text: label }),
          h("div", { class: "pg-history-row__d", text: value })));
    }

    function reportDetail(staffName, r) {
      var m = ui.modal({ title: r.templateName || r.subject || "Laporan KPI",
        body: [ui.emptyState({ icon: "target", title: "Memuat…" })] });
      store.kpiResult(r.id).then(function (d) {
        if (!d || d.ok === false) { m.close(); ui.toast((d && d.error) || "Gagal memuat.", "danger"); return; }
        var rep = d.report, rows = [];
        var showWeight = d.scoreMethod !== "weighted_sum";
        ui.clear(m.body);
        function line(it, isSub) {
          rows.push(h("div", { class: "pg-kpi-read__row" + (isSub ? " is-sub" : "") },
            h("div", { class: "pg-kpi-read__label" }, (isSub ? "↳ " : "") + it.label,
              showWeight && it.weight != null
                ? h("span", { class: "pg-badge pg-badge--neutral", style: { marginLeft: "6px" }, text: "Bobot " + pctText(it.weight) })
                : null),
            h("div", { class: "pg-kpi-read__nums",
              text: itemVal(it.actual != null ? it.actual : 0, it) + " / "
                + itemVal(it.computedTarget != null ? it.computedTarget : it.target, it) }),
            h("div", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums" },
              text: it.pct == null ? "—" : pctText(it.pct) }),
            it.valueNote ? h("div", { class: "pg-kpi-read__note", text: it.valueNote }) : null));
        }
        (d.items || []).forEach(function (it) { line(it, false); (it.children || []).forEach(function (c) { line(c, true); }); });
        ui.append(m.body, [
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", alignItems: "center" } },
            ui.badge(statusInfo(rep.status).label, statusInfo(rep.status).tone),
            ui.badge(pctText(rep.totalPct), scoreTone(rep.totalPct)),
            rep.periodType ? ui.badge(rep.periodType === "weekly" ? "Mingguan" : "Bulanan", "neutral") : null),
          detailRow("Pelaksana", staffName),
          detailRow("Divisi", rep.divisionName || "—"),
          rep.subject ? detailRow("Nama Toko", rep.subject) : null,
          rep.weekNo ? detailRow("Pekan", "Pekan " + rep.weekNo) : null,
          detailRow("Periode", periodLine(rep)),
          h("div", { class: "pg-kpi-read" }, rows),
          rep.note ? h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"),
            h("div", { text: "Catatan: " + rep.note })) : null,
          ui.notice("Dikirim " + (rep.submittedAt ? ui.timeAgo(rep.submittedAt) : "—"), { muted: true })
        ]);
      }).catch(function () { m.close(); ui.toast("Gagal memuat laporan.", "danger"); });
    }

    function reportItem(staffName, r) {
      return h("button", { class: "pg-todo-item", style: { textAlign: "left" },
        onclick: function () { reportDetail(staffName, r); } },
        h("div", { class: "pg-todo-item__head" },
          h("div", { class: "pg-todo-item__title" }, svg("target"), h("span", { text: r.templateName || "KPI" })),
          ui.badge(pctText(r.totalPct), scoreTone(r.totalPct)),
          svg("chevronRight")),
        ui.progressBar(Math.min(r.totalPct || 0, 100)),
        h("div", { class: "pg-todo-item__foot" },
          h("span", { text: periodLine(r) }),
          ui.badge(statusInfo(r.status).label, statusInfo(r.status).tone),
          r.subject ? h("span", { style: { display: "inline-flex", alignItems: "center", gap: "4px" } },
            svg("store"), h("span", { text: r.subject })) : null)
      );
    }

    function staffCard(g) {
      var u = store.find("users", g.userId) || {};
      var divLabel = (u.divisionLabels && u.divisionLabels.length) ? u.divisionLabels.join(", ")
        : (u.divisionLabel || g.divisionName || null);
      return ui.card({ body: [
        h("div", { class: "pg-kstaf-head" },
          userAvatar({ fullName: g.name, photoUrl: u.photoUrl }, 40),
          h("div", { style: { flex: "1", minWidth: "0" } },
            h("div", { class: "pg-strong", text: g.name }),
            h("div", { class: "pg-muted", style: { fontSize: "12px" },
              text: (divLabel ? divLabel + " · " : "") + g.reports.length + " laporan"
                + (g.avgPct != null ? " · rata-rata " + pctText(g.avgPct) : "") })),
          h("div", { class: "pg-kstaf-counts" },
            g.counts.submitted ? ui.badge(g.counts.submitted + " terkirim", "info") : null,
            g.counts.reviewed ? ui.badge(g.counts.reviewed + " direview", "success") : null)),
        h("div", { class: "pg-grid", style: { gap: "8px", marginTop: "10px" } },
          g.reports.map(function (r) { return reportItem(g.name, r); }))
      ]});
    }

    function filterCard() {
      var d = st.data || {};
      var divisions = (d.divisions && d.divisions.length) ? d.divisions : store.all("divisions");
      var months = d.months || [];

      function sel(value, opts, onChange) {
        return h("select", { class: "pg-select",
          onchange: function (e) { onChange(e.target.value); } },
          opts.map(function (o) {
            return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(value) });
          }));
      }
      var periodSel = sel(st.period, PERIOD_OPTS, function (v) { st.period = v; load(); });
      var divSel = sel(st.divisionId,
        [{ value: "", label: "Semua Divisi" }].concat(divisions.map(function (x) { return { value: x.id, label: x.name }; })),
        function (v) { st.divisionId = v; load(); });
      var monthSel = sel(st.month,
        [{ value: "", label: "Semua Bulan" }].concat(months.map(function (m) { return { value: m, label: monthLabel(m) }; })),
        function (v) { st.month = v; load(); });

      return ui.card({ body: [
        h("div", { class: "pg-grid pg-grid--2" },
          h("div", { class: "pg-field", style: { gap: "4px" } },
            h("label", { class: "pg-field__hint", text: "Periode" }), periodSel),
          h("div", { class: "pg-field", style: { gap: "4px" } },
            h("label", { class: "pg-field__hint", text: "Bulan" }), monthSel)),
        h("div", { class: "pg-field", style: { gap: "4px", marginTop: "10px" } },
          h("label", { class: "pg-field__hint", text: "Divisi" }), divSel)
      ]});
    }

    function render() {
      ui.clear(host);
      host.appendChild(filterCard());

      if (st.loading && !st.data) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target", title: "Memuat hasil KPI…" })] }));
        return;
      }
      var data = st.data || { staff: [], summary: {} };
      var staff = data.staff || [];
      var sum = data.summary || {};

      if (!staff.length) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "target",
          title: "Belum ada laporan KPI.",
          text: "Laporan KPI yang dikirim staf akan tampil di sini. Coba ubah atau kosongkan filter." })] }));
        return;
      }

      host.appendChild(h("div", { class: "pg-grid pg-grid--keep2" },
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("users"), "Staf Melapor"),
          h("div", { class: "pg-ministat__value", text: String(sum.staffCount != null ? sum.staffCount : staff.length) }),
          h("div", { class: "pg-ministat__cap", text: (sum.reviewed || 0) + " laporan direview" })),
        h("div", { class: "pg-ministat" },
          h("div", { class: "pg-ministat__label" }, svg("target"), "Rata-rata KPI"),
          h("div", { class: "pg-ministat__value", text: pctText(sum.avgPct) }),
          h("div", { class: "pg-ministat__cap", text: (sum.reportCount || 0) + " laporan" }))
      ));
      staff.forEach(function (g) { host.appendChild(staffCard(g)); });
    }

    load();
    ui.live(load, host);
    return screen(header, [host]);
  };

  /* ---- Rekapan Absensi : recap of MY attendance + overtime over a date range.
         Filter = Dari Tanggal / Sampai Tanggal only. Data is the user's own
         records from the store cache (attendanceForUser / overtimeForUser). ---- */
  pages.rekapAbsensi = function (ctx) {
    var u = ctx.user;
    var store = PG.store;
    var header = backHeader(ctx, "Rekapan Absensi");
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });

    var today = store.serverToday ? store.serverToday() : store.dateKey();
    function firstOfMonth() { return today.slice(0, 8) + "01"; }
    var st = { from: firstOfMonth(), to: today };

    var allAtt = store.attendanceForUser(u.id);
    var allOt  = store.overtimeForUser(u.id);

    function rmini(label, value, cap) {
      return h("div", { class: "pg-ministat" },
        h("div", { class: "pg-ministat__label", text: label }),
        h("div", { class: "pg-ministat__value", text: String(value) }),
        cap ? h("div", { class: "pg-ministat__cap", text: cap }) : null);
    }
    function legendRow(color, label, val) {
      return h("div", { class: "pg-legend__row" },
        h("span", { class: "pg-legend__dot", style: { background: color } }),
        h("span", { text: label }),
        h("span", { class: "pg-legend__val", text: String(val) }));
    }
    function eachDate(from, to, cb) {
      var d = new Date(from + "T00:00:00"), end = new Date(to + "T00:00:00");
      var guard = 0;
      while (d <= end && guard++ < 3660) { cb(new Date(d)); d.setDate(d.getDate() + 1); }
    }

    function render() {
      ui.clear(host);
      var from = st.from, to = st.to;
      var valid = !!(from && to && from <= to);

      var fFrom = h("input", { class: "pg-input", type: "date", value: from,
        onchange: function (e) { st.from = e.target.value; render(); } });
      var fTo = h("input", { class: "pg-input", type: "date", value: to,
        onchange: function (e) { st.to = e.target.value; render(); } });
      host.appendChild(ui.card({ body: [
        h("div", { class: "pg-grid pg-grid--2" },
          h("div", { class: "pg-field", style: { gap: "4px" } },
            h("label", { class: "pg-field__hint", text: "Dari Tanggal" }), fFrom),
          h("div", { class: "pg-field", style: { gap: "4px" } },
            h("label", { class: "pg-field__hint", text: "Sampai Tanggal" }), fTo)),
        valid
          ? h("div", { class: "pg-muted", style: { fontSize: "12px", marginTop: "6px" },
              text: "Rentang: " + ui.fmtDateShortID(from) + " – " + ui.fmtDateShortID(to) })
          : ui.notice("Rentang tanggal tidak valid — 'Dari Tanggal' harus sebelum 'Sampai Tanggal'.", { muted: true })
      ]}));
      if (!valid) { return; }

      /* ---------- Kehadiran ---------- */
      var att = allAtt.filter(function (r) { return r.date >= from && r.date <= to; });
      var sum = store.summarizeAttendance(att);
      var seen = {};
      att.forEach(function (r) { seen[r.date] = 1; });
      var workdays = 0, alpha = 0;
      eachDate(from, to, function (d) {
        var key = store.dateKey(d);
        if (key > today || !store.isWorkDay(d)) return;
        workdays++;
        if (!seen[key]) alpha++;
      });
      var present = sum.hadir + sum.terlambat;
      var pct = workdays ? Math.round(present / workdays * 100) : (present ? 100 : null);

      host.appendChild(ui.card({ title: "Rekap Kehadiran", body: [
        h("div", { style: { display: "flex", gap: "18px", alignItems: "center", flexWrap: "wrap" } },
          ui.donut(pct, "Kehadiran"),
          h("div", { class: "pg-legend", style: { flex: "1", minWidth: "170px" } },
            legendRow("var(--pg-success)", "Tepat Waktu", sum.hadir + " hari"),
            legendRow("var(--pg-yellow)", "Terlambat", sum.terlambat + " hari"),
            legendRow("var(--pg-blue)", "Pulang Cepat", sum.kabur + " hari"),
            legendRow("var(--pg-text-muted)", "Tidak Absen", alpha + " hari"))),
        h("div", { class: "pg-grid pg-grid--keep2", style: { marginTop: "12px" } },
          rmini("Hari Hadir", present, workdays ? ("dari " + workdays + " hari kerja") : "hari"),
          rmini("Total Jam Kerja", ui.fmtDuration(sum.workedMs), "hanya dalam jam kerja"))
      ]}));

      /* ---------- Lembur ---------- */
      var ot = allOt.filter(function (r) { return r.date >= from && r.date <= to; });
      var os = store.summarizeOvertime(ot);
      host.appendChild(ui.card({ title: "Rekap Lembur", body: [
        h("div", { class: "pg-grid pg-grid--keep2" },
          rmini("Total Pengajuan", os.total, "kali"),
          rmini("Disetujui", os.disetujui, "kali"),
          rmini("Menunggu Persetujuan", os.menunggu, "kali"),
          rmini("Total Durasi Dihitung", ui.fmtDuration(os.durationMs), "lembur disetujui"))
      ]}));

      /* ---------- Rincian harian ---------- */
      if (att.length) {
        var rows = att.slice().sort(function (a, b) { return a.date < b.date ? 1 : -1; }).map(function (r) {
          var stKey = r.checkOutAt ? "pulang" : (r.checkInStatus || "hadir");
          return h("div", { class: "pg-history-row" },
            h("div", { class: "pg-history-row__main" },
              h("div", { class: "pg-history-row__d", text: ui.fmtDateWeekdayID(r.date) }),
              h("div", { class: "pg-history-row__t",
                text: (r.checkInAt ? "Masuk " + ui.fmtTimeID(r.checkInAt) : "Belum masuk")
                  + (r.checkOutAt ? " · Pulang " + ui.fmtTimeID(r.checkOutAt) + " · " + ui.fmtDuration(store.attendanceWorkedMs(r)) : "")
                  + (store.isEarlyLeave(r) ? " · pulang cepat" : "") })),
            ui.statusBadge(stKey));
        });
        host.appendChild(ui.card({ title: "Rincian Harian (" + att.length + " hari)",
          body: [h("div", { class: "pg-grid", style: { gap: "0" } }, rows)] }));
      } else {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "calendar",
          title: "Tidak ada data absensi pada rentang ini.",
          text: "Ubah rentang tanggal, atau lakukan absensi lebih dulu di menu Absensi." })] }));
      }
    }

    render();
    ui.live(render, host);
    return screen(header, [host]);
  };

  /* ============================================================
     MOMEN KERJA — shared photo feed, self-expiring 24h (like a story).
     Everyone logged in (any employee + any admin) sees the same feed.
     ============================================================ */
  pages.momen = function (ctx) {
    var u = ctx.user;
    var store = PG.store;
    var host = h("div", { class: "pg-grid", style: { gap: "14px" } });
    var state = { posts: null, loading: false, composerPhoto: null, composerVideo: null,
      composerVideoUrl: null, composerVideoWide: false, composerVideoNoPreview: false, composerText: "", comments: {}, feedSig: null };

    var VIDEO_MAX_SEC = 61;                       // 60s + 1s rounding tolerance
    var VIDEO_MAX_BYTES = 58 * 1024 * 1024;       // keep well under post_max_size (64M)

    function load() {
      if (!state.posts) { state.loading = true; render(); }
      store.posts().then(function (d) {
        var next = (d && d.ok !== false && d.posts) || [];
        state.loading = false;
        // Viewing the feed clears the "new Momen posts" part of the menu badge.
        store.markMomenSeen(next.map(function (p) { return p.id; }));
        var sig = next.map(function (p) { return p.id + ":" + p.likeCount + ":" + p.commentCount; }).join(",");
        // Skip the DOM rebuild when nothing visible changed — a full re-render
        // would tear down and restart any <video> the user is watching.
        if (sig === state.feedSig && state.posts) return;
        state.feedSig = sig; state.posts = next; render();
      }).catch(function () { state.loading = false; state.posts = state.posts || []; render(); });
    }

    /* ---------- composer ---------- */
    // Four hidden inputs. The camera icon opens a small chooser -> a DEDICATED
    // single-media capture input (mixing image+video in one `capture` input is
    // unreliable on Android). The gallery / video icons pick existing files.
    //   camPhotoInput  : LIVE photo    (accept=image/*  + capture)
    //   camVideoInput  : LIVE video    (accept=video/*  + capture)
    //   galInput       : upload photo  (accept=image/*)
    //   vidInput       : upload video  (accept=video/*)
    var camPhotoInput = h("input", { type: "file", accept: "image/*", capture: "environment", style: { display: "none" },
      onchange: function (e) { onPick(e); } });
    var camVideoInput = h("input", { type: "file", accept: "video/*", capture: "environment", style: { display: "none" },
      onchange: function (e) { onPick(e); } });
    var galInput = h("input", { type: "file", accept: "image/*", style: { display: "none" },
      onchange: function (e) { onPick(e); } });
    var vidInput = h("input", { type: "file", accept: "video/*", style: { display: "none" },
      onchange: function (e) { onPick(e); } });

    function onPick(e) {
      var file = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!file) return;
      if (file.type && file.type.indexOf("video/") === 0) { processVideoFile(file); }
      else { processPhotoFile(file); }
    }

    // Camera icon -> pick "take a photo" or "record a video" (each fires its
    // own dedicated live-capture input, the combination Android handles well).
    function openCameraChooser() {
      var cm = ui.modal({
        title: "Kamera",
        body: [
          h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "0 0 2px", lineHeight: "1.5" },
            text: "Ambil foto atau rekam video langsung dari kamera HP." }),
          ui.button({ label: "Ambil Foto", variant: "accent", block: true, icon: "camera",
            onClick: function () { cm.close(); camPhotoInput.click(); } }),
          ui.button({ label: "Rekam Video (maks 60 dtk)", variant: "ghost", block: true, icon: "video",
            onClick: function () { cm.close(); camVideoInput.click(); } })
        ]
      });
    }

    function clearComposerVideo() {
      state.composerVideo = null; state.composerVideoWide = false; state.composerVideoNoPreview = false;
      if (state.composerVideoUrl) { try { URL.revokeObjectURL(state.composerVideoUrl); } catch (x) {} state.composerVideoUrl = null; }
    }
    // Accept ANY video format. The only hard stops are size (a real server
    // limit) and a measurable duration over 60s. If the browser can't read the
    // metadata / preview it, we still allow the upload with a heads-up — the
    // feed card has a "Buka / Unduh Video" fallback for whatever won't play
    // inline on a given device.
    function processVideoFile(file) {
      if (file.size > VIDEO_MAX_BYTES) {
        ui.toast("Ukuran video maksimal " + Math.round(VIDEO_MAX_BYTES / 1048576) + " MB. Rekam lebih pendek atau turunkan kualitas kamera.", "danger");
        return;
      }
      var url = null;
      try { url = URL.createObjectURL(file); } catch (x) {}
      if (!url) { ui.toast("Berkas video tidak bisa dibaca.", "danger"); return; }

      var settled = false;
      function accept(wide, noPreview) {
        if (settled) return; settled = true;
        clearComposerVideo();
        state.composerVideo = file;
        state.composerVideoUrl = url;
        state.composerVideoWide = !!wide;
        state.composerVideoNoPreview = !!noPreview;
        state.composerPhoto = null;                    // a post is photo OR video, never both
        if (activeCompose) { activeCompose.paintMedia(); } else { openComposer(); }
      }
      function reject(msg) {
        if (settled) return; settled = true;
        try { URL.revokeObjectURL(url); } catch (x) {}
        ui.toast(msg, "danger");
      }

      var probe = document.createElement("video");
      probe.preload = "metadata"; probe.muted = true;
      var to = setTimeout(function () {
        ui.toast("Durasi video tidak terbaca — pastikan tidak lebih dari 60 detik.", "info");
        accept(false, false);
      }, 6000);
      probe.onloadedmetadata = function () {
        clearTimeout(to);
        var dur = probe.duration, w = probe.videoWidth, ht = probe.videoHeight;
        if (isFinite(dur) && dur > 0 && dur > VIDEO_MAX_SEC) {
          reject("Video maksimal 60 detik (video ini " + Math.round(dur) + " detik)."); return;
        }
        if (!isFinite(dur) || dur <= 0) {
          ui.toast("Durasi video tidak terbaca — pastikan tidak lebih dari 60 detik.", "info");
        }
        accept((w && ht) ? (w / ht > 0.62) : false, false);   // 9:16 = 0.5625
      };
      probe.onerror = function () {
        clearTimeout(to);
        ui.toast("Pratinjau video tidak tersedia di perangkat ini, tapi video tetap bisa diunggah.", "info");
        accept(false, true);
      };
      probe.src = url;
    }
    // Siblings of `host` (not children — render() clears host on every repaint,
    // and not document.body — that would leak a pair of hidden inputs on every
    // visit to this page since nothing would ever remove them).

    // The actual writing happens in a popup (openComposer) whose DOM lives in
    // document.body via ui.modal — completely outside `host`, so the page's
    // live-poll render() rebuilding the feed behind it can never touch (or
    // defocus) the textarea. `activeCompose` is set while that popup is open,
    // so a photo picked from the feed-bar icons lands straight in it instead
    // of opening a second popup.
    var activeCompose = null;

    function processPhotoFile(file) {
      PG.fileToDataUrl(file).then(function (raw) {
        PG.cropper(raw, {
          title: "Sesuaikan Foto",
          onConfirm: function (cropped) {
            state.composerPhoto = cropped;
            clearComposerVideo();                     // photo XOR video
            if (activeCompose) { activeCompose.paintMedia(); } else { openComposer(); }
          }
        });
      }).catch(function () { ui.toast("Gagal membaca foto.", "danger"); });
    }

    function submitPost(textVal, btn, onSuccess) {
      var text = (textVal || "").trim();
      if (!state.composerPhoto && !state.composerVideo && !text) { ui.toast("Tulis sesuatu atau tambahkan foto/video dulu.", "danger"); return; }
      if (btn) btn.disabled = true;
      var done = function (res) {
        if (btn) btn.disabled = false;
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal membagikan momen.", "danger"); return; }
        ui.toast("Momen berhasil dibagikan.", "success");
        if (onSuccess) onSuccess();
        load();
      };
      if (state.composerVideo) {
        ui.toast("Mengunggah video… mohon tunggu.", "info");
        store.postCreateVideo(state.composerVideo, text || null).then(done);
      } else {
        store.postCreate({ photo: state.composerPhoto, caption: text || null }).then(done);
      }
    }

    // Popup composer — a real <textarea> (comfortable for long text, unlike a
    // single-line field) with the photo preview placed ABOVE it so the
    // caption always reads BELOW the photo, same order as a posted card.
    function openComposer() {
      var textarea = h("textarea", { class: "pg-momen-compose__textarea", rows: "3", maxlength: "500",
        placeholder: "Bagikan momen kerjamu hari ini…" });
      textarea.value = state.composerText || "";

      var mediaHost = h("div");
      function paintMedia() {
        ui.clear(mediaHost);
        if (state.composerVideo && state.composerVideoUrl) {
          if (state.composerVideoNoPreview) {
            mediaHost.appendChild(h("div", { class: "pg-momen-composer__vchip" },
              svg("video"),
              h("span", { text: "Video siap diunggah — pratinjau tidak tersedia di perangkat ini." }),
              h("button", { class: "pg-momen-composer__remove pg-momen-composer__remove--inline", type: "button",
                "aria-label": "Hapus video", onclick: function () { clearComposerVideo(); paintMedia(); } }, svg("close"))
            ));
          } else {
            mediaHost.appendChild(h("div", { class: "pg-momen-composer__preview pg-momen-composer__preview--video" },
              h("video", { src: state.composerVideoUrl, controls: true, playsinline: true, muted: true, preload: "metadata" }),
              h("button", { class: "pg-momen-composer__remove", type: "button", "aria-label": "Hapus video",
                onclick: function () { clearComposerVideo(); paintMedia(); } }, svg("close"))
            ));
          }
          if (state.composerVideoWide) {
            mediaHost.appendChild(h("div", { class: "pg-momen-composer__hint" }, svg("info"),
              h("span", { text: "Video ini bukan 9:16 — akan dipotong ke bingkai vertikal seperti Reels/TikTok." })));
          }
          return;
        }
        if (state.composerPhoto) {
          mediaHost.appendChild(h("div", { class: "pg-momen-composer__preview" },
            h("img", { class: "pg-momen-composer__img", src: state.composerPhoto, alt: "Pratinjau momen" }),
            h("button", { class: "pg-momen-composer__remove", type: "button", "aria-label": "Hapus foto",
              onclick: function () { state.composerPhoto = null; paintMedia(); } }, svg("close"))
          ));
        }
      }
      paintMedia();

      function autogrow() {
        textarea.style.height = "auto";
        textarea.style.height = Math.min(textarea.scrollHeight, 260) + "px";
      }
      textarea.addEventListener("input", function () { state.composerText = textarea.value; autogrow(); });

      var m = ui.modal({
        title: "Bagikan Momen",
        onClose: function () {
          activeCompose = null;
          state.composerText = ""; state.composerPhoto = null;
          clearComposerVideo();
          render();
        },
        body: [
          h("div", { class: "pg-momen-compose__who" }, userAvatar(u, 36),
            h("span", { class: "pg-momen-compose__name", text: u.fullName })),
          mediaHost,
          textarea,
          h("div", { class: "pg-momen-compose__tools" },
            h("button", { class: "pg-momen-compose__tool", type: "button", title: "Ambil foto atau rekam video langsung dari kamera",
              onclick: function () { openCameraChooser(); } }, svg("camera"), h("span", { text: "Kamera" })),
            h("button", { class: "pg-momen-compose__tool", type: "button", title: "Pilih foto dari galeri",
              onclick: function () { galInput.click(); } }, svg("image"), h("span", { text: "Galeri" })),
            h("button", { class: "pg-momen-compose__tool", type: "button", title: "Pilih video dari galeri (maks 60 dtk)",
              onclick: function () { vidInput.click(); } }, svg("video"), h("span", { text: "Video" }))
          )
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Posting", variant: "accent", icon: "check",
            onClick: function () { submitPost(textarea.value, this, function () { m.close(); }); } })
        ]
      });

      activeCompose = { paintMedia: paintMedia };
      textarea.focus();
      autogrow();
    }

    // The bar shown inline in the feed — just a trigger, tapping any part of
    // it (or the camera/gallery icons) opens the real popup composer above.
    function composerTrigger() {
      return ui.card({ body: [
        h("div", { class: "pg-momen-composer__row" },
          userAvatar(u, 40),
          h("button", { class: "pg-momen-composer__fake", type: "button", onclick: function () { openComposer(); } },
            h("span", { text: "Bagikan momen kerjamu hari ini…" })),
          h("button", { class: "pg-momen-composer__ic", type: "button", "aria-label": "Kamera", title: "Ambil foto atau rekam video langsung dari kamera",
            onclick: function () { openCameraChooser(); } }, svg("camera")),
          h("button", { class: "pg-momen-composer__ic", type: "button", "aria-label": "Pilih Foto dari Galeri", title: "Pilih foto dari galeri",
            onclick: function () { galInput.click(); } }, svg("image")),
          h("button", { class: "pg-momen-composer__ic", type: "button", "aria-label": "Pilih Video dari Galeri", title: "Pilih video dari galeri (maks 60 dtk)",
            onclick: function () { vidInput.click(); } }, svg("video"))
        )
      ]});
    }

    /* ---------- like / comment ---------- */
    function toggleLike(post) {
      post.likedByMe = !post.likedByMe;                      // optimistic
      post.likeCount += post.likedByMe ? 1 : -1;
      render();
      // store.postLike() goes through write(), which wraps the server reply as
      // {ok, record, data} — it does NOT surface {liked, likeCount} at the top
      // level. Rather than reach into res.data, just trust the optimistic
      // update on success and reconcile with a fresh load() on failure/error.
      store.postLike(post.id).then(function (res) {
        if (!res || res.ok === false) { load(); }
      }, function () { load(); });
    }

    function loadComments(post) {
      var c = state.comments[post.id];
      if (!c) return;
      c.loading = true; render();
      store.postComments(post.id).then(function (d) {
        c.items = (d && d.comments) || []; c.loading = false; render();
      }).catch(function () { c.items = c.items || []; c.loading = false; render(); });
    }

    function openComments(post) {
      var c = state.comments[post.id] || (state.comments[post.id] = { open: false, loading: false, items: null, text: "", replyTo: null });
      c.open = !c.open;
      if (c.open && c.items === null) { loadComments(post); return; }
      render();
    }

    function startReply(post, comment) {
      var cs = state.comments[post.id];
      if (!cs) return;
      cs.replyTo = { id: comment.id, authorName: comment.authorName };
      cs._focusInput = true;
      render();
    }

    function sendComment(post, text, input) {
      text = (text || "").trim();
      if (!text) return;
      var cs = state.comments[post.id] || (state.comments[post.id] = {});
      if (cs._sending) return;                 // ignore rapid re-taps while a slow send is in flight
      cs._sending = true;
      if (input) input.disabled = true;
      var parentId = cs.replyTo ? cs.replyTo.id : null;
      store.postCommentAdd(post.id, text, parentId).then(function (res) {
        cs._sending = false;
        if (input) { input.disabled = false; }
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengirim komentar.", "danger"); return; }
        if (input) input.value = "";
        cs.replyTo = null;
        post.commentCount++;
        // Same write() wrapping issue as toggleLike — re-fetch this post's
        // comment list instead of trying to read the new comment off `res`.
        loadComments(post);
      }, function () {
        cs._sending = false;
        if (input) input.disabled = false;
        ui.toast("Gagal mengirim komentar.", "danger");
      });
    }

    function toggleCommentLike(post, comment) {
      comment.likedByMe = !comment.likedByMe;                      // optimistic
      comment.likeCount = Math.max(0, (comment.likeCount || 0) + (comment.likedByMe ? 1 : -1));
      render();
      store.postCommentLike(comment.id).then(function (res) {
        if (!res || res.ok === false) { loadComments(post); }
      }, function () { loadComments(post); });
    }

    function deleteComment(post, comment) {
      var cs = state.comments[post.id];
      var replyCount = (cs && cs.items) ? cs.items.filter(function (x) { return x.parentId === comment.id; }).length : 0;
      ui.confirm({
        title: "Hapus Komentar", tone: "danger", confirmLabel: "Hapus",
        message: replyCount ? ("Hapus komentar ini beserta " + replyCount + " balasannya?") : "Hapus komentar ini?",
        onConfirm: function () {
          store.postCommentDelete(comment.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus komentar.", "danger"); return; }
            if (cs && cs.items) {
              var gone = {}; gone[comment.id] = 1;
              var changed = true;
              while (changed) {                                    // sweep out the whole reply subtree
                changed = false;
                cs.items.forEach(function (x) { if (x.parentId && gone[x.parentId] && !gone[x.id]) { gone[x.id] = 1; changed = true; } });
              }
              cs.items = cs.items.filter(function (x) { return !gone[x.id]; });
              post.commentCount = Math.max(0, post.commentCount - Object.keys(gone).length);
            }
            render();
          });
        }
      });
    }

    function deletePost(post) {
      ui.confirm({
        title: "Hapus Momen", tone: "danger", confirmLabel: "Hapus permanen",
        message: "Hapus momen ini beserta like dan komentarnya? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.postDelete(post.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus momen.", "danger"); return; }
            ui.toast("Momen dihapus.", "success");
            load();
          });
        }
      });
    }

    /* ---------- render ---------- */
    function commentRow(post, c, byId) {
      var parent = (c.parentId && byId) ? byId[c.parentId] : null;
      return h("div", { class: "pg-momen-comment" + (c.parentId ? " pg-momen-comment--reply" : "") },
        userAvatar({ fullName: c.authorName, photoUrl: c.authorPhotoUrl }, c.parentId ? 24 : 28),
        h("div", { class: "pg-momen-comment__main" },
          parent ? h("div", { class: "pg-momen-comment__replyctx" }, svg("arrowRight"),
            h("span", { text: "Membalas " + parent.authorName })) : null,
          h("div", { class: "pg-momen-comment__bubble" },
            h("span", { class: "pg-momen-comment__name", text: c.authorName }),
            h("span", { class: "pg-momen-comment__text", text: c.text })),
          h("div", { class: "pg-momen-comment__actions" },
            h("button", { class: "pg-momen-comment__actbtn" + (c.likedByMe ? " is-liked" : ""), type: "button",
              onclick: function () { toggleCommentLike(post, c); } },
              svg("heart"), h("span", { text: c.likeCount ? String(c.likeCount) + " suka" : "Suka" })),
            h("button", { class: "pg-momen-comment__actbtn", type: "button",
              onclick: function () { startReply(post, c); } }, svg("message"), h("span", { text: "Balas" })),
            c.isMine ? h("button", { class: "pg-momen-comment__actbtn", type: "button",
              onclick: function () { deleteComment(post, c); } }, svg("trash"), h("span", { text: "Hapus" })) : null
          )
        )
      );
    }

    // Flat list -> top-level comments each followed by its whole reply subtree
    // (chronological). Anything not reachable from a top-level root is appended.
    function commentNodes(post, items) {
      var byId = {}; items.forEach(function (x) { byId[x.id] = x; });
      function rootId(x) { var cur = x, g = 0; while (cur.parentId && byId[cur.parentId] && g++ < 40) cur = byId[cur.parentId]; return cur.id; }
      var kids = {};
      items.forEach(function (x) { if (x.parentId) { (kids[rootId(x)] = kids[rootId(x)] || []).push(x); } });
      var out = [], done = {};
      items.filter(function (x) { return !x.parentId; }).forEach(function (t) {
        out.push(commentRow(post, t, byId)); done[t.id] = 1;
        (kids[t.id] || []).forEach(function (k) { out.push(commentRow(post, k, byId)); done[k.id] = 1; });
      });
      items.forEach(function (x) { if (!done[x.id]) { out.push(commentRow(post, x, byId)); } });
      return out;
    }

    function momenVideo(post) {
      var box = h("div", { class: "pg-momen-card__video" });
      var v = h("video", { src: post.videoUrl, controls: true, playsinline: true, preload: "metadata" });
      v.setAttribute("webkit-playsinline", "true");
      var handled = false;
      v.onerror = function () {
        if (handled) return; handled = true;
        var abs = post.videoUrl;
        try { abs = new URL(post.videoUrl, document.baseURI).href; } catch (e) {}
        ui.clear(box);
        box.className = "pg-momen-card__video-fallback";
        box.appendChild(svg("video"));
        box.appendChild(h("div", { text: "Video tidak dapat diputar langsung di sini." }));
        box.appendChild(h("a", { class: "pg-btn pg-btn--ghost pg-btn--sm", href: abs,
          target: "_blank", rel: "noopener", text: "Buka / Unduh Video" }));
      };
      box.appendChild(v);
      return box;
    }

    function postCard(post) {
      var c = state.comments[post.id];
      var expiresMs = new Date(post.expiresAt).getTime() - Date.now();
      var commentsBlock = null;
      if (c && c.open) {
        var replyTo = c.replyTo;
        var input = h("input", { class: "pg-input", type: "text", maxlength: "500",
          placeholder: replyTo ? ("Balas " + replyTo.authorName + "…") : "Tulis komentar…" });
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") { sendComment(post, input.value, input); }
        });
        if (c._focusInput) { c._focusInput = false; setTimeout(function () { try { input.focus(); } catch (e) {} }, 0); }
        commentsBlock = h("div", { class: "pg-momen-card__comments" },
          c.loading ? h("div", { class: "pg-muted", style: { fontSize: "12.5px", padding: "6px 0" }, text: "Memuat komentar…" })
            : (c.items && c.items.length ? commentNodes(post, c.items)
              : h("div", { class: "pg-muted", style: { fontSize: "12.5px", padding: "6px 0" }, text: "Belum ada komentar." })),
          replyTo ? h("div", { class: "pg-momen-card__replychip" },
            h("span", null, "Membalas ", h("strong", { text: replyTo.authorName })),
            h("button", { type: "button", "aria-label": "Batal balas",
              onclick: function () { c.replyTo = null; render(); } }, svg("close"))) : null,
          h("div", { class: "pg-momen-card__commentbox" },
            input,
            h("button", { class: "pg-momen-card__send", type: "button", "aria-label": "Kirim",
              onclick: function () { sendComment(post, input.value, input); } }, svg("arrowRight")))
        );
      }
      return h("div", { class: "pg-card pg-momen-card" },
        h("div", { class: "pg-momen-card__head" },
          userAvatar({ fullName: post.authorName, photoUrl: post.authorPhotoUrl }, 40),
          h("div", { class: "pg-momen-card__who" },
            h("div", { class: "pg-momen-card__name", text: post.authorName + (post.ownerKind === "admin" ? " · Admin" : "") }),
            h("div", { class: "pg-momen-card__meta", text: ui.timeAgo(post.createdAt) + " · hilang dalam " + ui.fmtDuration(Math.max(0, expiresMs)) })),
          post.isMine ? h("button", { class: "pg-momen-card__del", type: "button", "aria-label": "Hapus momen",
            onclick: function () { deletePost(post); } }, svg("trash")) : null
        ),
        post.videoUrl ? momenVideo(post) : (post.photoUrl ? h("div", { class: "pg-momen-card__photo" }, ui.photoImg(post.photoUrl, { alt: "Momen kerja" })) : null),
        post.caption ? h("div", { class: "pg-momen-card__caption" + ((post.photoUrl || post.videoUrl) ? "" : " pg-momen-card__caption--text-only"), text: post.caption }) : null,
        h("div", { class: "pg-momen-card__actions" },
          h("button", { class: "pg-momen-card__act" + (post.likedByMe ? " is-active" : ""), type: "button",
            onclick: function () { toggleLike(post); } },
            svg("heart"), h("span", { text: String(post.likeCount) })),
          h("button", { class: "pg-momen-card__act", type: "button",
            onclick: function () { openComments(post); } },
            svg("message"), h("span", { text: String(post.commentCount) }))
        ),
        commentsBlock
      );
    }

    function render() {
      ui.clear(host);
      host.appendChild(composerTrigger());
      if (state.loading && !state.posts) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "image", title: "Memuat momen…" })] }));
      } else if (!state.posts || !state.posts.length) {
        host.appendChild(ui.card({ body: [ui.emptyState({ icon: "image",
          title: "Belum ada momen hari ini.",
          text: "Jadilah yang pertama membagikan momen kerjamu — akan hilang otomatis dalam 24 jam." })] }));
      } else {
        host.appendChild(h("div", { class: "pg-momen-feed" }, state.posts.map(postCard)));
      }
    }

    load();
    ui.live(load, host);
    // Deep-link from a chat notification: /momen#chat-<threadId> opens that thread.
    if (PG.chat) {
      setTimeout(function () {
        var mm = (location.hash || "").match(/^#chat-(\d+)$/);
        if (mm) { history.replaceState(null, "", location.pathname + location.search); PG.chat.open(mm[1]); }
      }, 0);
    }
    // Chat now lives in the bottom nav — no header bubble needed on the User App.
    return screen(titleHeader("Momen Kerja"), [host, camPhotoInput, camVideoInput, galInput, vidInput]);
  };

  PG.userPages = pages;
})(window.PG = window.PG || {});
