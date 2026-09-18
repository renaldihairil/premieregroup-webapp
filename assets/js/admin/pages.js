/* ============================================================
   PREMIERE GROUP — Admin Panel screens
   Factory pattern: fn(ctx) -> DOM node rendered into .pg-page.
   Phase 1: full structure + navigation + empty states. The two
   modules the brief marks as foundational — Manajemen Tim &
   Divisi (master data) and Manajemen Absensi (system config) —
   are wired to the store so the User App consumes real values.
   Everything else uses empty states / "next phase" notices.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg, store = PG.store;
  var pages = {};

  function nextPhase(feature) {
    ui.toast('"' + feature + '" akan diaktifkan pada tahap berikutnya.');
  }
  function pageHead(crumb, title, action) {
    return h("div", { class: "pg-page__head pg-section-head" },
      h("div", null,
        h("div", { class: "pg-page__crumb", text: crumb }),
        h("h1", { class: "pg-page__title", text: title })
      ),
      action || null
    );
  }
  function page(nodes) {
    return h("div", { class: "pg-page" }, nodes);
  }
  /* Avatar circle (initials + optional uploaded photo) for any {fullName,
     photoUrl}-shaped record — an employee, or an ad-hoc object built from a
     post/comment author. */
  function empAvatar(u, px) {
    px = px || 34;
    var el = h("div", { class: "pg-avatar",
      style: { width: px + "px", height: px + "px", fontSize: Math.round(px * 0.38) + "px" } },
      h("span", { class: "pg-avatar__i", text: ui.initials(u.fullName || "?") }));
    if (u.photoUrl) el.appendChild(ui.photoImg(u.photoUrl, { alt: u.fullName || "Foto profil" }));
    return el;
  }
  /* All of a user's division names (primary first), comma-joined. Used in
     report tables so a multi-division karyawan shows every division. */
  function pgDivLabel(u) {
    if (!u) return "—";
    var ids = store.userDivisionIds(u);
    if (!ids.length) return "—";
    return ids.map(function (id) { return store.divisionName(id); }).join(", ");
  }

  /* One person row for a drill-down modal: avatar + name + dotted meta line +
     an optional right-hand node (badge / photo thumb). `user` is a
     {fullName, photoUrl, ...} record; `opts.meta` is a string or an array of
     strings/nodes joined by " · ". */
  function pgPersonRow(user, opts) {
    opts = opts || {};
    var u = user || { fullName: "—" };
    var metaKids = [];
    var meta = opts.meta;
    if (meta != null) {
      (Array.isArray(meta) ? meta : [meta]).forEach(function (m) {
        if (m == null || m === "") return;
        if (metaKids.length) metaKids.push(document.createTextNode(" · "));
        metaKids.push(m.nodeType ? m : document.createTextNode(String(m)));
      });
    }
    return h("div", { class: "pg-people__row" },
      empAvatar(u, 40),
      h("div", { class: "pg-people__main" },
        h("div", { class: "pg-people__name", text: u.fullName || "—" }),
        metaKids.length ? h("div", { class: "pg-people__meta" }, metaKids) : null),
      opts.right ? h("div", { class: "pg-people__right" }, opts.right) : null);
  }

  /* A drill-down modal for a dashboard stat card. `sections` is
     [{ label?, emptyText?, rows: [node] }]; a single-list modal passes one
     section with no label. */
  function pgPeopleModal(cfg) {
    var body = [];
    if (cfg.subtitle) {
      body.push(h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "-4px 0 4px" }, text: cfg.subtitle }));
    }
    (cfg.sections || []).forEach(function (sec) {
      if (sec.label) body.push(h("div", { class: "pg-people__sec", text: sec.label }));
      if (sec.rows && sec.rows.length) {
        body.push(h("div", { class: "pg-people" }, sec.rows));
      } else {
        body.push(h("div", { class: "pg-muted", style: { fontSize: "13px", padding: "10px 2px" },
          text: sec.emptyText || "Tidak ada data." }));
      }
    });
    var m = ui.modal({ class: "pg-modal--form", title: cfg.title, body: body,
      footer: [ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } })] });
    return m;
  }
  /* Realtime clock + prayer-time reminder — sits in the dashboard page-head's
     right-hand space. Self-clearing 1s interval (stops when detached). */
  function dashClock() {
    function p2(n) { return String(n).padStart(2, "0"); }
    var timeEl = h("span", { class: "pg-dashclock__time" });
    var dateEl = h("span", { class: "pg-dashclock__date" });
    var pillText = h("span", { text: "Memuat waktu sholat…" });
    var pill = h("div", { class: "pg-prayer" }, svg("moon"), pillText);
    var wrap = h("div", { class: "pg-dashclock" },
      h("div", { class: "pg-dashclock__row" }, svg("clock"), timeEl, dateEl),
      pill);
    var st = { times: null, day: null, loc: null };
    ui.geoOnce(function (loc) { st.loc = loc; st.times = null; paint(); });
    function paint() {
      var now = new Date();
      timeEl.textContent = p2(now.getHours()) + ":" + p2(now.getMinutes()) + ":" + p2(now.getSeconds());
      dateEl.textContent = ui.todayLongID();
      var loc = st.loc || { lat: -8.65, lng: 116.42 };
      var dk = now.toDateString();
      if (!st.times || st.day !== dk) { st.times = ui.prayerTimes(now, loc.lat, loc.lng, -now.getTimezoneOffset()); st.day = dk; }
      var r = ui.prayerReminder(ui.nextPrayer(st.times, now));
      pill.className = "pg-prayer" + (r.soon ? " pg-prayer--soon" : "") + (r.blink ? " pg-prayer--blink" : "");
      pillText.textContent = r.text;
    }
    var iv = setInterval(function () {
      if (!document.body.contains(timeEl)) { clearInterval(iv); return; }
      paint();
    }, 1000);
    paint();
    return wrap;
  }
  function legendRow(color, label, val) {
    return h("div", { class: "pg-legend__row" },
      h("span", { class: "pg-legend__dot", style: { background: color } }),
      h("span", { text: label }),
      h("span", { class: "pg-legend__val", text: val })
    );
  }
  function selectOptions(coll, blankLabel) {
    var opts = [{ value: "", label: blankLabel || "— Pilih —" }];
    store.all(coll).forEach(function (r) { opts.push({ value: r.id, label: r.name }); });
    return opts;
  }

  /* ============================================================
     LOGIN
     ============================================================ */
  pages.login = function (ctx) {
    var idInput = h("input", { class: "pg-input", type: "text", autocomplete: "username",
      autocapitalize: "none", autocorrect: "off", spellcheck: false,
      placeholder: "Email atau username admin" });
    var input = h("input", { class: "pg-input", type: "password", autocomplete: "current-password",
      placeholder: "Masukkan password admin" });
    var err = h("div", { class: "pg-alogin__error", style: { display: "none" } });
    var btn = ui.button({ label: "MASUK", variant: "primary", block: true, type: "submit" });

    function submit(e) {
      e.preventDefault();
      err.style.display = "none";
      btn.disabled = true; btn.textContent = "Memeriksa…";
      PG.auth.adminLogin(idInput.value, input.value).then(function (res) {
        if (!res.ok) {
          btn.disabled = false; btn.textContent = "MASUK";
          err.textContent = res.error; err.style.display = "block";
          return;
        }
        PG.store.hydrate().then(function () {
          btn.disabled = false; btn.textContent = "MASUK";
          ctx.router.replace("/dashboard");
        });
      });
    }

    return h("div", { class: "pg-alogin" },
      h("form", { class: "pg-alogin__card", onsubmit: submit },
        h("div", { class: "pg-alogin__logo" }, svg("briefcase")),
        h("div", null,
          h("div", { class: "pg-alogin__name", text: "PREMIERE GROUP" }),
          h("div", { class: "pg-alogin__tag", text: "ADMIN PANEL" })
        ),
        h("div", { class: "pg-field", style: { textAlign: "left" } },
          h("label", { class: "pg-field__label", text: "Email / Username" }),
          idInput
        ),
        h("div", { class: "pg-field", style: { textAlign: "left" } },
          h("label", { class: "pg-field__label", text: "Password" }),
          input
        ),
        err,
        btn,
        h("div", { class: "pg-alogin__hint", text: "Akun & password diatur lewat api/setup.php." })
      )
    );
  };

  /* ============================================================
     DASHBOARD
     ============================================================ */
  pages.dashboard = function () {
    var dashGrid = h("div", { class: "pg-grid", style: { gap: "20px" } });
    var gen = 0;   // guards stale async writes across re-renders

    function shortDay(iso) {
      return ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"][new Date(iso + "T00:00:00").getDay()];
    }
    function statBox(icon, tone, label, value, hint, onClick) {
      return ui.statCard({ icon: icon, tone: tone || "", label: label, value: value, hint: hint || "", onClick: onClick });
    }

    // async-loaded lists that a couple of drill-down modals read (filled by the
    // enrichment block at the bottom of render()); null = not loaded yet.
    var vExtra = { visits: null, kpi: null };

    function render() {
      var myGen = ++gen;
      ui.clear(dashGrid);

      var today = store.serverToday();
      var users = store.all("users");
      var activeUsers = users.filter(function (u) { return u.status === "active"; });
      var divisions = store.all("divisions");
      var todos = store.all("todos");
      var activeTodos = todos.filter(function (t) { return t.status !== "done"; });
      var doneTodos = todos.filter(function (t) { return t.status === "done"; });
      var overdueTodos = todos.filter(function (t) { return t.deadline && t.status !== "done" && t.deadline < today; });
      var doneTodayTodos = todos.filter(function (t) { return t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) === today; });
      var prio = { high: 0, mid: 0, low: 0 };
      activeTodos.forEach(function (t) { if (prio[t.priority] != null) prio[t.priority]++; });

      var att = store.todayAttendanceSummary();
      var attPct = att.totalActive ? Math.round((att.present / att.totalActive) * 100) : null;
      var allAtt = store.allAttendance();

      var izinToday = store.allIzin().filter(function (r) { return r.date === today; });
      var otAll = store.allOvertime();
      var otToday = otAll.filter(function (r) { return r.date === today; });
      var otSum = store.summarizeOvertime(otToday);

      /* ---------- 1b. drill-down modals (click a stat card) ---------- */
      function hhmm(iso) {
        if (!iso) return "—";
        var d = new Date(iso);
        return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
      }
      function attToday() {
        return allAtt.filter(function (r) { return r.date === today; })
          .sort(function (a, b) { return (a.checkInAt || "") < (b.checkInAt || "") ? -1 : 1; });
      }
      function usr(id, fallbackName) {
        return store.find("users", id) || { fullName: fallbackName || "Karyawan" };
      }

      function openTotalKaryawan() {
        var mk = function (list) {
          return list.slice().sort(function (a, b) { return (a.fullName || "").localeCompare(b.fullName || ""); })
            .map(function (u) {
              return pgPersonRow(u, { meta: [pgDivLabel(u), store.positionName(u.positionId)],
                right: ui.statusBadge(u.status) });
            });
        };
        var nonaktif = users.filter(function (u) { return u.status !== "active"; });
        pgPeopleModal({ title: "Total Karyawan — " + users.length,
          sections: [
            { label: "Aktif (" + activeUsers.length + ")", rows: mk(activeUsers), emptyText: "Belum ada karyawan aktif." },
            { label: "Nonaktif (" + nonaktif.length + ")", rows: mk(nonaktif), emptyText: "Semua karyawan berstatus aktif." }
          ] });
      }

      function openHadir() {
        var rows = attToday().map(function (r) {
          var u = usr(r.userId);
          var late = r.checkInStatus === "terlambat";
          return pgPersonRow(u, {
            meta: [store.divisionName(u.divisionId), "Masuk " + hhmm(r.checkInAt),
              r.checkOutAt ? "Pulang " + hhmm(r.checkOutAt) : "Belum pulang"],
            right: late
              ? ui.badge("Terlambat" + (r.lateMinutes ? " " + r.lateMinutes + " mnt" : ""), "warning")
              : ui.badge("Tepat Waktu", "success")
          });
        });
        pgPeopleModal({ title: "Hadir Hari Ini — " + rows.length + " karyawan",
          subtitle: ui.fmtDateWeekdayID(today),
          sections: [{ rows: rows, emptyText: "Belum ada karyawan yang absen masuk hari ini." }] });
      }

      function openTerlambat() {
        var seen = {};
        var lateRows = attToday().filter(function (r) { return r.checkInStatus === "terlambat"; }).map(function (r) {
          seen[String(r.userId)] = 1;
          var u = usr(r.userId);
          return pgPersonRow(u, { meta: [store.divisionName(u.divisionId), "Masuk " + hhmm(r.checkInAt)],
            right: ui.badge(r.lateMinutes ? r.lateMinutes + " menit" : "terlambat", "warning") });
        });
        attToday().forEach(function (r) { seen[String(r.userId)] = 1; });
        var belumRows = activeUsers.filter(function (u) { return !seen[String(u.id)]; })
          .sort(function (a, b) { return (a.fullName || "").localeCompare(b.fullName || ""); })
          .map(function (u) {
            return pgPersonRow(u, { meta: [store.divisionName(u.divisionId), store.positionName(u.positionId)],
              right: ui.badge("Belum absen", "neutral") });
          });
        pgPeopleModal({ title: "Kehadiran Hari Ini", subtitle: ui.fmtDateWeekdayID(today),
          sections: [
            { label: "Terlambat (" + lateRows.length + ")", rows: lateRows, emptyText: "Tidak ada karyawan yang terlambat hari ini." },
            { label: "Belum absen (" + belumRows.length + ")", rows: belumRows, emptyText: "Semua karyawan aktif sudah absen masuk." }
          ] });
      }

      function openIzin() {
        var rows = izinToday.map(function (r) {
          var u = usr(r.userId);
          return pgPersonRow(u, {
            meta: [store.divisionName(u.divisionId), r.reason || "Tanpa keterangan"],
            right: r.photo ? ui.photoThumb(r.photo, null, { title: "Selfie izin — " + (u.fullName || "") }) : null
          });
        });
        pgPeopleModal({ title: "Izin Hari Ini — " + rows.length + " karyawan",
          subtitle: ui.fmtDateWeekdayID(today),
          sections: [{ rows: rows, emptyText: "Tidak ada karyawan yang mengajukan izin hari ini." }] });
      }

      function openLembur() {
        var OT = { menunggu: ["Menunggu", "warning"], disetujui: ["Disetujui", "success"],
          ditolak: ["Ditolak", "danger"], berjalan: ["Berjalan", "info"], kadaluarsa: ["Kadaluarsa", "neutral"] };
        var rows = otToday.map(function (r) {
          var u = usr(r.userId);
          var s = OT[r.status] || [r.status, "neutral"];
          return pgPersonRow(u, {
            meta: [store.divisionName(u.divisionId), r.description || "Lembur",
              r.durationMs ? ui.fmtDuration(r.durationMs) : null],
            right: ui.badge(s[0], s[1])
          });
        });
        pgPeopleModal({ title: "Lembur Hari Ini — " + rows.length + " pengajuan",
          subtitle: ui.fmtDateWeekdayID(today),
          sections: [{ rows: rows, emptyText: "Tidak ada pengajuan lembur hari ini." }] });
      }

      function openKunjungan() {
        if (vExtra.visits == null) { ui.toast("Memuat data kunjungan…", "info"); return; }
        var rows = vExtra.visits.filter(function (r) { return (r.createdAt || "").slice(0, 10) === today; })
          .map(function (r) {
            var u = usr(r.userId, r.userName);
            return pgPersonRow(u, {
              meta: [r.storeName || "Tanpa toko", r.agenda || ""],
              right: ui.badge(r.status === "reviewed" ? "Direview" : "Terkirim",
                r.status === "reviewed" ? "success" : "info")
            });
          });
        pgPeopleModal({ title: "Kunjungan Hari Ini — " + rows.length + " laporan",
          subtitle: ui.fmtDateWeekdayID(today),
          sections: [{ rows: rows, emptyText: "Belum ada laporan kunjungan hari ini." }] });
      }

      function openTodoAktif() {
        var PR = { high: ["Tinggi", "danger"], mid: ["Sedang", "warning"], low: ["Rendah", "neutral"] };
        var W = { high: 0, mid: 1, low: 2 };
        var rows = activeTodos.slice().sort(function (a, b) {
          var ao = a.deadline && a.deadline < today ? 0 : 1, bo = b.deadline && b.deadline < today ? 0 : 1;
          if (ao !== bo) return ao - bo;
          return (W[a.priority] != null ? W[a.priority] : 3) - (W[b.priority] != null ? W[b.priority] : 3);
        }).map(function (t) {
          var u = t.assigneeId ? store.find("users", t.assigneeId) : null;
          var overdue = t.deadline && t.deadline < today;
          var pr = PR[t.priority] || [t.priority || "—", "neutral"];
          return h("div", { class: "pg-people__row" },
            u ? empAvatar(u, 40)
              : h("div", { class: "pg-avatar", style: { width: "40px", height: "40px" } }, svg("user")),
            h("div", { class: "pg-people__main" },
              h("div", { class: "pg-people__name", text: t.title }),
              h("div", { class: "pg-people__meta", text:
                (u ? u.fullName : "Tanpa pelaksana") + " · "
                + (t.deadline ? "Deadline " + ui.fmtDateShortID(t.deadline) : "Tanpa deadline") })),
            h("div", { class: "pg-people__right" },
              overdue ? ui.badge("Terlambat", "danger") : ui.badge(pr[0], pr[1])));
        });
        pgPeopleModal({ title: "Todo Aktif — " + activeTodos.length,
          subtitle: overdueTodos.length ? (overdueTodos.length + " todo terlambat") : "Semua tugas dalam tenggat",
          sections: [{ rows: rows, emptyText: "Tidak ada todo aktif." }] });
      }

      function openKpi() {
        var d = vExtra.kpi;
        if (!d || !d.reports) { ui.toast("Memuat data KPI…", "info"); return; }
        var byUser = {};
        d.reports.forEach(function (r) {
          var k = String(r.userId);
          if (!byUser[k]) byUser[k] = { sum: 0, n: 0 };
          byUser[k].sum += (r.totalPct || 0); byUser[k].n++;
        });
        var rows = Object.keys(byUser).map(function (uid) {
          var avg = byUser[uid].n ? byUser[uid].sum / byUser[uid].n : 0;
          return { u: usr(uid), avg: avg, n: byUser[uid].n };
        }).sort(function (a, b) { return b.avg - a.avg; }).map(function (x) {
          return pgPersonRow(x.u, {
            meta: [store.divisionName(x.u.divisionId), x.n + " laporan"],
            right: ui.badge((Math.round(x.avg * 10) / 10) + "%",
              x.avg >= 100 ? "success" : x.avg >= 70 ? "warning" : "danger")
          });
        });
        pgPeopleModal({ title: "Rata-rata KPI per Staf",
          subtitle: (d.summary && d.summary.total ? d.summary.total : rows.length) + " laporan masuk"
            + (d.summary && d.summary.avgPct != null ? " · rata-rata " + (Math.round(d.summary.avgPct * 10) / 10) + "%" : ""),
          sections: [{ rows: rows, emptyText: "Belum ada laporan KPI." }] });
      }

      /* ---------- 1. summary indicators ---------- */
      var kunjValue = h("span", { text: "…" });
      var kpiAvgValue = h("span", { text: "…" });
      var stats = h("div", { class: "pg-grid pg-grid--4" },
        statBox("users", "", "Total Karyawan", users.length,
          activeUsers.length + " aktif" + (users.length - activeUsers.length ? " · " + (users.length - activeUsers.length) + " nonaktif" : ""),
          openTotalKaryawan),
        statBox("user", "green", "Hadir Hari Ini", att.present,
          att.totalActive ? (attPct + "% dari " + att.totalActive + " aktif") : "belum ada karyawan",
          openHadir),
        statBox("clock", "yellow", "Terlambat Hari Ini", att.terlambat,
          att.belum + " belum absen",
          openTerlambat),
        statBox("doc", "blue", "Izin Hari Ini", izinToday.length,
          izinToday.length ? "karyawan berhalangan hadir" : "tidak ada izin",
          openIzin),
        statBox("briefcase", "yellow", "Lembur Hari Ini", otToday.length,
          otSum.disetujui + " disetujui · " + otSum.menunggu + " menunggu",
          openLembur),
        statBox("building", "blue", "Kunjungan Hari Ini", kunjValue, "laporan kunjungan baru",
          openKunjungan),
        statBox("checklist", "yellow", "Todo Aktif", activeTodos.length,
          overdueTodos.length ? (overdueTodos.length + " terlambat") : "tugas berjalan",
          openTodoAktif),
        statBox("chart", "green", "Rata-rata KPI", kpiAvgValue, "seluruh laporan masuk",
          openKpi)
      );

      /* ---------- 2. charts ---------- */
      // 2a. attendance donut + legend
      var kehadiranCard = ui.card({ title: "Kehadiran Hari Ini", body: [
        h("div", { style: { display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" } },
          ui.donut(attPct, "Kehadiran"),
          h("div", { class: "pg-legend", style: { flex: "1", minWidth: "160px" } },
            legendRow("var(--pg-success)", "Hadir Tepat Waktu", String(att.hadir)),
            legendRow("var(--pg-yellow)", "Terlambat", String(att.terlambat)),
            legendRow("var(--pg-blue)", "Sudah Pulang", String(att.pulang)),
            legendRow("var(--pg-text-muted)", "Belum Absen", String(att.belum))
          )
        )
      ], action: ui.button({ label: "Laporan Absensi", variant: "ghost", size: "sm",
        onClick: function () { PG._router.go("/laporan-absensi"); } }) });

      // 2b. attendance rate per division — horizontal bar chart
      var divRows = divisions.map(function (d) {
        var members = users.filter(function (u) {
          return u.status === "active" && store.userDivisionIds(u).indexOf(String(d.id)) >= 0;
        });
        if (!members.length) return null;
        var present = members.filter(function (u) {
          return allAtt.some(function (r) { return String(r.userId) === String(u.id) && r.date === today; });
        }).length;
        return { name: d.name, value: Math.round((present / members.length) * 100), note: present + "/" + members.length };
      }).filter(Boolean).sort(function (a, b) { return b.value - a.value; });
      var perDivCard = ui.card({ title: "Kehadiran per Divisi · Hari Ini", body: [
        divRows.length
          ? ui.barChartH(divRows, { max: 100, suffix: "%", band: true })
          : ui.emptyState({ icon: "chart", title: "Belum ada divisi berisi karyawan aktif." })
      ]});

      // 2c. 7-day attendance trend — line chart
      var trendPts = [];
      for (var i = 6; i >= 0; i--) {
        var d0 = new Date(today + "T00:00:00"); d0.setDate(d0.getDate() - i);
        var key = store.dateKey(d0);
        var seen = {};
        allAtt.forEach(function (r) { if (r.date === key) seen[r.userId] = 1; });
        var cnt = Object.keys(seen).length;
        trendPts.push({ label: shortDay(key), value: activeUsers.length ? Math.round((cnt / activeUsers.length) * 100) : 0 });
      }
      var trendCard = ui.card({ title: "Tren Kehadiran 7 Hari", body: [
        ui.lineChart(trendPts, { max: 100, suffix: "%", height: 170,
          emptyMsg: "Tren muncul setelah beberapa hari data absensi." }),
        h("div", { class: "pg-stat__hint", style: { marginTop: "8px", textAlign: "center" },
          text: "Persentase karyawan aktif yang tercatat absen tiap hari" })
      ]});

      // 2d. todo priority donut + legend
      var prioTotal = activeTodos.length;
      var prioCard = ui.card({ title: "Todo Aktif Berdasarkan Prioritas", body: [
        h("div", { style: { display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" } },
          ui.donut(prioTotal ? Math.round((prio.high / prioTotal) * 100) : null, "Tinggi"),
          h("div", { class: "pg-legend", style: { flex: "1", minWidth: "160px" } },
            legendRow("var(--pg-danger)", "Tinggi", String(prio.high)),
            legendRow("var(--pg-yellow)", "Sedang", String(prio.mid)),
            legendRow("var(--pg-text-muted)", "Rendah", String(prio.low))
          )
        )
      ], action: ui.button({ label: "Todo List", variant: "ghost", size: "sm",
        onClick: function () { PG._router.go("/todo"); } }) });

      // 2e. lembur hari ini
      var lemburCard = ui.card({ title: "Lembur Hari Ini", body: [
        h("div", { style: { display: "flex", gap: "20px", alignItems: "center", flexWrap: "wrap" } },
          h("div", null,
            h("div", { class: "pg-stat__value", text: String(otToday.length) }),
            h("div", { class: "pg-stat__hint", text: "pengajuan lembur" })),
          h("div", { class: "pg-legend", style: { flex: "1", minWidth: "160px" } },
            legendRow("var(--pg-blue)", "Sedang Berjalan", String(otSum.berjalan || 0)),
            legendRow("var(--pg-yellow)", "Menunggu Persetujuan", String(otSum.menunggu || 0)),
            legendRow("var(--pg-success)", "Disetujui", String(otSum.disetujui || 0)),
            legendRow("var(--pg-danger)", "Ditolak", String(otSum.ditolak || 0)),
            legendRow("var(--pg-text-muted)", "Kadaluarsa", String(otSum.kadaluarsa || 0))
          )
        ),
        h("div", { class: "pg-stat__hint", style: { marginTop: "10px" },
          text: "Total durasi lembur dihitung hari ini: " + ui.fmtDuration(otSum.durationMs) })
      ], action: ui.button({ label: "Laporan Lembur", variant: "ghost", size: "sm",
        onClick: function () { PG._router.go("/laporan-lembur"); } }) });

      // 2f. todo done-today mini card
      var todoDoneCard = ui.card({ title: "Penyelesaian Todo", body: [
        h("div", { style: { display: "flex", gap: "24px", flexWrap: "wrap" } },
          h("div", null,
            h("div", { class: "pg-stat__value", text: String(doneTodayTodos.length) }),
            h("div", { class: "pg-stat__hint", text: "todo selesai hari ini" })),
          h("div", null,
            h("div", { class: "pg-stat__value", text: String(doneTodos.length) }),
            h("div", { class: "pg-stat__hint", text: "total todo selesai" })),
          h("div", null,
            h("div", { class: "pg-stat__value", text: String(overdueTodos.length) }),
            h("div", { class: "pg-stat__hint", text: "todo terlambat" }))
        ),
        ui.progressBar(todos.length ? Math.round((doneTodos.length / todos.length) * 100) : 0,
          { label: "Progres keseluruhan", showPct: true })
      ]});

      /* ---------- 3. activity feed (today only — clears at day rollover) ---------- */
      var feedHost = h("div");
      var feedCard = ui.card({ title: "Aktivitas Terbaru Hari Ini",
        body: [
          h("p", { class: "pg-muted", style: { fontSize: "12.5px", marginTop: "-4px" },
            text: ui.fmtDateWeekdayID(today) + " · daftar otomatis bersih saat pergantian hari." }),
          feedHost
        ]});
      renderFeed(feedHost, buildCacheEvents(today, users, allAtt, izinToday, otAll, doneTodayTodos), myGen, false);

      /* ---------- assemble ---------- */
      dashGrid.appendChild(stats);
      dashGrid.appendChild(h("div", { class: "pg-grid pg-grid--2" }, kehadiranCard, perDivCard));
      dashGrid.appendChild(h("div", { class: "pg-grid pg-grid--2" }, trendCard, prioCard));
      dashGrid.appendChild(h("div", { class: "pg-grid pg-grid--2" }, lemburCard, todoDoneCard));
      dashGrid.appendChild(feedCard);

      /* ---------- async enrichment ---------- */
      store.kpiReports({}).then(function (d) {
        if (myGen !== gen) return;
        vExtra.kpi = (d && d.ok !== false) ? d : null;
        if (!d || d.ok === false || !d.summary || !d.summary.total) {
          kpiAvgValue.textContent = "—"; return;
        }
        kpiAvgValue.textContent = (Math.round((d.summary.avgPct || 0) * 10) / 10) + "%";
        // merge today's KPI submissions into the feed
        var extra = (d.reports || []).filter(function (r) {
          var ts = r.submittedAt || r.createdAt || "";
          return ts.slice(0, 10) === today;
        }).map(function (r) {
          return { at: r.submittedAt || r.createdAt, uid: r.userId, kind: "kpi",
            icon: "chart", tone: "green", text: "mengirim laporan KPI" + (r.subject ? " (" + r.subject + ")" : "") };
        });
        mergeFeed(feedHost, extra, myGen);
      }).catch(function () { if (myGen === gen) kpiAvgValue.textContent = "—"; });

      store.visits({}).then(function (d) {
        if (myGen !== gen) return;
        var reports = (d && d.reports) || [];
        vExtra.visits = reports;
        var todayVisits = reports.filter(function (r) { return (r.createdAt || "").slice(0, 10) === today; });
        kunjValue.textContent = String(todayVisits.length);
        mergeFeed(feedHost, todayVisits.map(function (r) {
          return { at: r.createdAt, uid: r.userId, kind: "kunjungan", icon: "building", tone: "blue",
            text: "membuat laporan kunjungan" + (r.storeName ? " ke " + r.storeName : "") };
        }), myGen);
        // stale-visit housekeeping banner
        var s = d && d.summary;
        if (s && s.staleCount && dashGrid.isConnected && myGen === gen) {
          dashGrid.insertBefore(staleWarn(
            "Laporan kunjungan lama menunggu dibersihkan",
            s.staleCount + " laporan kunjungan sudah berumur 1 minggu atau lebih" +
              (s.stalePhotos ? " (" + s.stalePhotos + " foto)" : "") + ". Buka Laporan Kunjungan untuk menghapusnya.",
            "building", "Buka Laporan Kunjungan", "/laporan-kunjungan"), dashGrid.firstChild);
        }
      }).catch(function () { if (myGen === gen) kunjValue.textContent = "—"; });

      // stale-todo housekeeping banner
      (function () {
        var p = today.split("-");
        var cd = new Date(+p[0], +p[1] - 1, +p[2] - 7);
        var cutoff = store.dateKey(cd);
        var n = todos.filter(function (t) { return t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) < cutoff; }).length;
        if (n) dashGrid.insertBefore(staleWarn(
          "Todo selesai yang lama menunggu dibersihkan",
          n + " todo sudah selesai lebih dari 1 minggu lalu. Buka Todo List untuk menghapusnya.",
          "checklist", "Buka Todo List", "/todo"), dashGrid.firstChild);
      })();
    }

    function staleWarn(title, msg, icon, btnLabel, route) {
      return h("div", { class: "pg-card pg-stale-warn" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-stale-warn__row" },
          h("span", { class: "pg-stale-warn__ic" }, svg("clock")),
          h("div", { style: { flex: "1", minWidth: "220px" } },
            h("div", { class: "pg-strong", text: title }),
            h("div", { class: "pg-muted", style: { fontSize: "13px", marginTop: "2px" }, text: msg })),
          ui.button({ label: btnLabel, variant: "ghost", size: "sm", icon: icon,
            onClick: function () { PG._router.go(route); } }))));
    }

    /* ---- activity feed helpers ---- */
    function buildCacheEvents(today, users, allAtt, izinToday, otAll, doneTodayTodos) {
      var ev = [];
      allAtt.forEach(function (r) {
        if (r.date !== today) return;
        if (r.checkInAt) ev.push({ at: r.checkInAt, uid: r.userId, kind: "masuk", icon: "user",
          tone: r.checkInStatus === "terlambat" ? "yellow" : "green",
          text: "absen masuk" + (r.checkInStatus === "terlambat" ? " (terlambat" + (r.lateMinutes ? " " + r.lateMinutes + " mnt" : "") + ")" : "") });
        if (r.checkOutAt) ev.push({ at: r.checkOutAt, uid: r.userId, kind: "pulang", icon: "logout",
          tone: "blue", text: "absen pulang" });
      });
      izinToday.forEach(function (r) {
        ev.push({ at: r.createdAt, uid: r.userId, kind: "izin", icon: "doc", tone: "blue",
          text: "mengajukan izin" + (r.reason ? " — " + (r.reason.length > 40 ? r.reason.slice(0, 40) + "…" : r.reason) : "") });
      });
      otAll.forEach(function (r) {
        if ((r.startAt || "").slice(0, 10) === today)
          ev.push({ at: r.startAt, uid: r.userId, kind: "lembur-mulai", icon: "clock", tone: "yellow",
            text: "memulai lembur" + (r.description ? " — " + (r.description.length > 40 ? r.description.slice(0, 40) + "…" : r.description) : "") });
        if (r.endAt && (r.endAt || "").slice(0, 10) === today)
          ev.push({ at: r.endAt, uid: r.userId, kind: "lembur-selesai", icon: "checkCircle", tone: "green",
            text: "menyelesaikan lembur (" + ui.fmtDuration(store.overtimeDurationMs(r)) + ")" });
      });
      doneTodayTodos.forEach(function (t) {
        ev.push({ at: t.completedAt, uid: t.assigneeId, kind: "todo", icon: "checkCircle", tone: "green",
          text: "menyelesaikan todo — " + (String(t.title || "").length > 44 ? t.title.slice(0, 44) + "…" : t.title) });
      });
      return ev;
    }
    var _feedEvents = [];
    function renderFeed(host, events, myGen, isMerge) {
      if (myGen !== gen) return;
      _feedEvents = isMerge ? _feedEvents.concat(events) : events.slice();
      // de-dup by at+uid+kind, newest first
      var seen = {};
      var list = _feedEvents.filter(function (e) {
        if (!e.at) return false;
        var k = e.at + "|" + e.uid + "|" + e.kind;
        if (seen[k]) return false; seen[k] = 1; return true;
      }).sort(function (a, b) { return a.at < b.at ? 1 : a.at > b.at ? -1 : 0; });

      ui.clear(host);
      if (!list.length) {
        host.appendChild(ui.emptyState({ icon: "bell", title: "Belum ada aktivitas hari ini.",
          text: "Absensi, izin, lembur, dan penyelesaian todo karyawan akan muncul di sini." }));
        return;
      }
      var feed = h("div", { class: "pg-actfeed" });
      list.slice(0, 60).forEach(function (e) {
        var u = store.find("users", e.uid) || {};
        feed.appendChild(h("div", { class: "pg-actfeed__row" },
          h("div", { class: "pg-actfeed__ic pg-actfeed__ic--" + (e.tone || "") }, svg(e.icon || "info")),
          h("div", { class: "pg-actfeed__body" },
            h("div", { class: "pg-actfeed__t" },
              h("span", { class: "pg-strong", text: u.fullName || "Karyawan" }),
              h("span", { text: " " + e.text })),
            h("div", { class: "pg-actfeed__meta", text: "@" + (u.username || "—") +
              (u.positionId ? " · " + store.positionName(u.positionId) : "") })),
          h("div", { class: "pg-actfeed__time", text: ui.fmtTimeID(e.at) })
        ));
      });
      host.appendChild(feed);
      if (list.length > 60)
        host.appendChild(h("div", { class: "pg-muted", style: { fontSize: "12px", textAlign: "center", marginTop: "8px" },
          text: "dan " + (list.length - 60) + " aktivitas lainnya" }));
    }
    function mergeFeed(host, events, myGen) { renderFeed(host, events, myGen, true); }

    render();
    ui.live(render, dashGrid);

    return page([
      pageHead("Overview", "Dashboard", dashClock()),
      dashGrid
    ]);
  };

  /* ============================================================
     TODO LIST  (CRUD + assignment + progress + report attachments)
     ============================================================ */
  pages.todo = function () {
    if (!PG.auth.can("todo.manage")) {
      return page([pageHead("Work Management", "Todo List"),
        ui.notice("Anda tidak memiliki akses untuk mengelola Todo List.")]);
    }
    var PER_PAGE = 15;
    var state = { status: "", q: "", assignee: "", page: 1, staleOnly: false };   // status: "" | todo | in_progress | done | overdue
    var view = "list";                            // "list" | "archive"

    // A todo is "stale" (siap dibersihkan) when it was completed > 1 week ago.
    function staleCutoff() {
      var p = store.dateKey().split("-");
      var d = new Date(+p[0], +p[1] - 1, +p[2] - 7);
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
    function isStale(t) {
      return t.status === "done" && t.completedAt && t.completedAt.slice(0, 10) < staleCutoff();
    }
    function purgeStaleTodos(count) {
      var cutoff = staleCutoff();
      ui.confirm({
        title: "Hapus Todo Selesai yang Lama", tone: "danger", confirmLabel: "Hapus permanen",
        message: "Hapus " + count + " todo yang sudah selesai lebih dari 1 minggu lalu"
          + " (selesai sebelum " + ui.fmtDateShortID(cutoff) + ")?\n\n"
          + "Todo dan file lampirannya akan dihapus permanen. Todo yang belum selesai tidak akan tersentuh.",
        onConfirm: function () {
          store.todosPurgeStale(cutoff).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            var r = (res.data && res.data.ok !== undefined) ? res.data : res;
            ui.toast((r.removed || 0) + " todo dihapus"
              + (r.filesRemoved ? " · " + r.filesRemoved + " lampiran" : "") + ".", "success");
            state.staleOnly = false;
            render();
          });
        }
      });
    }
    var wrap = h("div");
    var listHost = h("div");
    var resultsHost = h("div", { class: "pg-grid", style: { gap: "16px" } });
    var archiveHost = h("div");
    var toolbarEl = null;

    function paint() {
      ui.clear(wrap);
      if (view === "list") { wrap.appendChild(listHost); render(); }
      else {
        wrap.appendChild(archiveHost);
        if (!arch.data && !arch.loading) loadArchive(); else renderArchive();
      }
    }

    var PRIO_OPTS = [{ value: "high", label: "Tinggi" }, { value: "mid", label: "Sedang" }, { value: "low", label: "Rendah" }];

    function todayKey() { return store.dateKey(); }
    function isOverdue(t) { return t.deadline && t.status !== "done" && t.deadline < todayKey(); }
    function kv(k, v) {
      return h("div", null, h("div", { class: "pg-field__hint", text: k }),
        (v && v.nodeType) ? v : h("div", { class: "pg-strong", text: v == null || v === "" ? "—" : v }));
    }
    // Active users + the currently-assigned one even if since deactivated.
    function assigneeOptions(currentId) {
      var seen = {}, opts = [{ value: "", label: "— Tanpa PIC (todo tim) —" }];
      store.all("users").filter(function (u) { return u.status === "active"; })
        .forEach(function (u) { seen[u.id] = 1; opts.push({ value: u.id, label: u.fullName + " (@" + u.username + ")" }); });
      if (currentId && !seen[currentId]) {
        var u = store.find("users", currentId);
        if (u) opts.push({ value: u.id, label: u.fullName + " (nonaktif)" });
      }
      return opts;
    }

    /* ---------- create / edit ----------
       Deliberately minimal: judul, deskripsi, penanggung jawab, deadline,
       prioritas. Divisi mengikuti karyawan (dari Manajemen Tim) —
       tidak diinput manual. Status & progress dikelola karyawan di aplikasinya. */
    function todoForm(existing) {
      var fJudul = ui.field({ label: "Nama Todo", placeholder: "cth. Upload konten mingguan",
        required: true, value: existing ? existing.title : "" });
      var fDesc = ui.field({ label: "Deskripsi", type: "textarea", placeholder: "Detail pekerjaan…",
        value: existing ? (existing.description || "") : "" });
      var fPic = ui.field({ label: "Ditugaskan untuk", type: "select",
        options: assigneeOptions(existing && existing.assigneeId),
        value: existing ? (existing.assigneeId || "") : "" });
      var divHint = h("div", { class: "pg-field__hint", style: { marginTop: "-2px" } });
      function syncDivHint() {
        var u = store.find("users", fPic._control.value);
        divHint.textContent = u
          ? "Divisi: " + (store.divisionName(u.divisionId) || "—") + " (otomatis dari data karyawan)"
          : "Tanpa penanggung jawab — menjadi todo tim.";
      }
      fPic._control.addEventListener("change", syncDivHint);
      syncDivHint();
      fPic.appendChild(divHint);

      var fDeadline = ui.field({ label: "Tanggal Deadline", type: "date", value: existing ? (existing.deadline || "") : "" });
      var fPrio = ui.field({ label: "Prioritas", type: "select", options: PRIO_OPTS,
        value: existing ? existing.priority : "mid" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      var m = ui.modal({
        title: existing ? "Edit Todo" : "Buat Todo",
        body: [
          fJudul, fDesc, fPic,
          h("div", { class: "pg-grid pg-grid--2" }, fDeadline, fPrio),
          errEl,
          ui.notice("Todo yang diberi penanggung jawab langsung muncul di aplikasi karyawan tersebut. Status & progress diperbarui oleh karyawan dari sana.", { muted: true })
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Buat", variant: "primary", onClick: function () {
            var title = fJudul._control.value.trim();
            if (!title) { errEl.textContent = "Nama todo wajib diisi."; errEl.style.display = "block"; return; }
            var payload = {
              title: title,
              description: fDesc._control.value.trim(),
              assigneeId: fPic._control.value || null,
              deadline: fDeadline._control.value || null,
              priority: fPrio._control.value || "mid"
            };
            var op = existing ? store.patch("todos", existing.id, payload) : store.insert("todos", payload);
            return op.then(function (res) {
              if (!res || res.ok === false) {
                errEl.textContent = (res && res.error) || "Gagal menyimpan todo.";
                errEl.style.display = "block";
                return;
              }
              ui.toast(existing ? "Todo diperbarui." : "Todo dibuat.", "success");
              m.close(); render();
            });
          } })
        ]
      });
    }

    /* ---------- detail (todo + work-report attachments) ---------- */
    function detail(t) {
      var pic = store.find("users", t.assigneeId);
      var attHost = h("div", { class: "pg-att-grid" });
      var attNote = h("div", { class: "pg-field__hint", text: "Memuat lampiran…" });

      ui.modal({
        title: t.title,
        body: [
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
            ui.priorityBadge(t.priority), ui.statusBadge(t.status),
            isOverdue(t) ? ui.badge("Terlambat", "danger") : null,
            t.createdBySource === "user" ? ui.badge("Dibuat karyawan", "info") : null),
          h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" }, text: t.description || "—" }),
          h("div", { style: { margin: "4px 0" } }, ui.progressBar(t.progress || 0, { label: "Progress", showPct: true })),
          h("div", { class: "pg-grid pg-grid--2" },
            kv("PIC", pic ? (pic.fullName + " · @" + pic.username) : "Tanpa PIC (todo tim)"),
            kv("Divisi", store.divisionName(t.divisionId)),
            kv("Deadline", t.deadline ? ui.fmtDateWeekdayID(t.deadline) : "—"),
            kv("Dibuat oleh", t.createdBySource === "user" ? ((t.createdByName || "Karyawan") + " · " + ui.fmtDateShortID(t.createdAt)) : ("Admin · " + ui.fmtDateShortID(t.createdAt)))
          ),
          t.userNote
            ? h("div", { style: { marginTop: "12px" } },
                h("div", { class: "pg-field__hint", text: "Catatan karyawan" }),
                h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "4px" } }, svg("edit"),
                  h("div", { text: t.userNote })))
            : null,
          h("div", { style: { marginTop: "14px" } },
            h("div", { class: "pg-strong", style: { fontSize: "14px", marginBottom: "8px" }, text: "Lampiran Laporan Kerja" }),
            attNote, attHost)
        ],
        footer: [
          ui.button({ label: "Hapus Todo", variant: "danger", icon: "trash", onClick: function () { del(t); } }),
          ui.button({ label: "Edit", variant: "primary", icon: "edit", onClick: function () { todoForm(t); } })
        ]
      });

      function loadAtt() {
        store.todoAttachments(t.id).then(function (items) {
          ui.clear(attHost);
          if (!items.length) {
            attNote.textContent = "Karyawan belum melampirkan file laporan untuk todo ini.";
            return;
          }
          attNote.textContent = items.length + " lampiran dari karyawan:";
          items.forEach(function (a) {
            attHost.appendChild(ui.attachmentTile(a, {
              onRemove: function () {
                ui.confirm({ title: "Hapus Lampiran", tone: "danger", confirmLabel: "Hapus",
                  message: "Hapus lampiran \"" + (a.label || a.name || a.url) + "\"? File dihapus permanen.",
                  onConfirm: function () {
                    store.removeTodoAttachment(a.id).then(function (r) {
                      if (!r || r.ok === false) { ui.toast((r && r.error) || "Gagal menghapus.", "danger"); return; }
                      ui.toast("Lampiran dihapus.", "success"); loadAtt(); render();
                    });
                  } });
              }
            }));
          });
        });
      }
      loadAtt();
    }
    function del(t) {
      ui.confirm({
        title: "Hapus Todo", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus todo \"" + t.title + "\" secara permanen? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.remove("todos", t.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus todo.", "danger"); return; }
            ui.toast("Todo dihapus.", "success");
            render();
          });
        }
      });
    }

    /* ---------- render : Daftar Todo ---------- */
    var STATUS_FILTER = [
      { value: "", label: "Semua Status" },
      { value: "todo", label: "Belum Selesai" },
      { value: "in_progress", label: "Berjalan" },
      { value: "done", label: "Selesai" },
      { value: "overdue", label: "Terlambat" }
    ];

    function buildToolbar() {
      var searchInput = h("input", { class: "pg-input", type: "search",
        placeholder: "Cari nama karyawan atau divisi / jabatan…", value: state.q,
        oninput: function (e) { state.q = e.target.value; state.page = 1; paintResults(); } });
      var employees = store.all("users").slice().sort(function (a, b) {
        return (a.fullName || "").localeCompare(b.fullName || "");
      });
      var assigneeSel = h("select", { class: "pg-select",
        onchange: function (e) { state.assignee = e.target.value; state.page = 1; paintResults(); } },
        [{ value: "", label: "Semua Karyawan" }].concat(employees.map(function (u) {
          return { value: u.id, label: u.fullName };
        })).map(function (o) {
          return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(state.assignee) });
        }));
      var statusSel = h("select", { class: "pg-select",
        onchange: function (e) { state.status = e.target.value; state.page = 1; paintResults(); } },
        STATUS_FILTER.map(function (o) {
          return h("option", { value: o.value, text: o.label, selected: o.value === state.status });
        }));
      toolbarEl = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          h("div", { class: "pg-toolbar__search pg-toolbar__search--compact" }, searchInput),
          assigneeSel,
          statusSel,
          ui.button({ label: "Arsip Lampiran", variant: "ghost", icon: "archive",
            onClick: function () { view = "archive"; paint(); } }),
          ui.button({ label: "Buat Todo", variant: "accent", icon: "plus",
            onClick: function () { todoForm(); } })
        )
      ));
    }

    function currentRows() {
      var q = state.q.trim().toLowerCase();
      return store.all("todos").filter(function (t) {
        if (state.staleOnly && !isStale(t)) return false;
        if (state.status === "overdue") { if (!isOverdue(t)) return false; }
        else if (state.status && t.status !== state.status) return false;
        if (state.assignee && String(t.assigneeId) !== String(state.assignee)) return false;
        if (q) {
          var pic = store.find("users", t.assigneeId);
          var div = store.divisionName(t.divisionId) || "";
          var hay = ((pic ? pic.fullName + " " + pic.username : "") + " " + div + " " + t.title).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      }).sort(function (a, b) {
        // overdue first, then by deadline asc (nulls last), then newest
        var ao = isOverdue(a) ? 0 : 1, bo = isOverdue(b) ? 0 : 1;
        if (ao !== bo) return ao - bo;
        var ad = a.deadline || "9999-12-31", bd = b.deadline || "9999-12-31";
        if (ad !== bd) return ad < bd ? -1 : 1;
        return (a.createdAt < b.createdAt) ? 1 : -1;
      });
    }

    function paintResults() {
      ui.clear(resultsHost);
      var all = store.all("todos");
      var rows = currentRows();
      var staleCount = all.filter(isStale).length;

      if (staleCount > 0) {
        resultsHost.appendChild(h("div", { class: "pg-card pg-stale-warn" }, h("div", { class: "pg-card__body" },
          h("div", { class: "pg-stale-warn__row" },
            h("span", { class: "pg-stale-warn__ic" }, svg("clock")),
            h("div", { style: { flex: "1", minWidth: "220px" } },
              h("div", { class: "pg-strong", text: "Pembersihan todo selesai yang lama" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px", marginTop: "2px", lineHeight: "1.6" },
                text: staleCount + " todo sudah selesai lebih dari 1 minggu lalu"
                  + " (selesai sebelum " + ui.fmtDateShortID(staleCutoff()) + ")."
                  + " Sebaiknya dihapus setiap minggu untuk menghemat penyimpanan. Todo yang belum selesai tidak akan tersentuh." })),
            h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
              ui.button({ label: state.staleOnly ? "Tampilkan semua" : "Lihat todo lama", variant: "ghost", size: "sm",
                onClick: function () { state.staleOnly = !state.staleOnly; state.page = 1; paintResults(); } }),
              ui.button({ label: "Hapus todo lama", variant: "danger", size: "sm", icon: "trash",
                onClick: function () { purgeStaleTodos(staleCount); } }))))));
      }

      var sum = { total: all.length, todo: 0, in_progress: 0, done: 0, overdue: 0 };
      all.forEach(function (t) {
        if (sum[t.status] != null) sum[t.status]++;
        if (isOverdue(t)) sum.overdue++;
      });
      resultsHost.appendChild(ui.statStrip([
        { icon: "checklist", label: "Todo", value: sum.total },
        { icon: "info", tone: "yellow", label: "Belum Selesai", value: sum.todo },
        { icon: "clock", tone: "blue", label: "Berjalan", value: sum.in_progress },
        { icon: "checkCircle", tone: "green", label: "Selesai", value: sum.done },
        { icon: "logout", tone: "danger", label: "Terlambat", value: sum.overdue }
      ]));

      if (!all.length) {
        resultsHost.appendChild(h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "checklist", title: "Belum ada todo.",
          text: "Klik 'Buat Todo' untuk menambahkan dan menugaskan pekerjaan.",
          action: ui.button({ label: "Buat Todo", variant: "accent", icon: "plus", onClick: function () { todoForm(); } })
        })));
        return;
      }
      if (!rows.length) {
        resultsHost.appendChild(h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "checklist", title: "Tidak ada todo untuk pencarian / filter ini.", text: "Ubah kata kunci atau status." })));
        return;
      }

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      var start = (state.page - 1) * PER_PAGE;
      var pageRows = rows.slice(start, start + PER_PAGE);

      var table = ui.table({
        columns: ["Judul Todo", "PIC / Tim", "Prioritas", "Deadline", "Progress", "Status", "Aksi"],
        rows: pageRows.map(function (row) {
          var pic = store.find("users", row.assigneeId);
          return {
            onClick: function () { detail(row); },
            cells: [
              h("div", null,
                h("span", { class: "pg-strong", text: row.title }),
                row.attachmentCount ? h("span", { class: "pg-muted", style: { marginLeft: "8px", fontSize: "12px", display: "inline-flex", alignItems: "center", gap: "3px", verticalAlign: "middle" } }, svg("paperclip"), String(row.attachmentCount)) : null,
                (row.programName || row.createdBySource === "user") ? h("div", { style: { marginTop: "3px", display: "flex", gap: "6px", flexWrap: "wrap" } },
                  row.programName ? ui.badge("Program: " + row.programName, "neutral") : null,
                  row.createdBySource === "user" ? ui.badge("Dibuat karyawan", "info") : null) : null),
              (pic ? pic.fullName : "Tanpa PIC") + " · " + store.divisionName(row.divisionId),
              ui.priorityBadge(row.priority),
              h("span", { style: isOverdue(row) ? { color: "var(--pg-danger)", fontWeight: "600" } : null },
                row.deadline ? ui.fmtDateShortID(row.deadline) : "—"),
              h("div", { style: { minWidth: "120px" } }, ui.progressBar(row.progress || 0, { showPct: true })),
              ui.statusBadge(row.status),
              h("div", { class: "pg-row-actions" },
                ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit todo", title: "Edit",
                  onClick: function () { todoForm(row); } }),
                ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus todo", title: "Hapus",
                  onClick: function () { del(row); } })
              )
            ]
          };
        })
      });
      var rangeHint = h("div", { class: "pg-muted", style: { fontSize: "13px" },
        text: "Menampilkan " + (start + 1) + "–" + (start + pageRows.length) + " dari " + rows.length + " todo · klik baris untuk detail." });
      var pagerEl = ui.pager({ page: state.page, pageCount: pageCount,
        info: "Halaman " + state.page + " dari " + pageCount, onPage: function (n) { state.page = n; paintResults(); } });
      resultsHost.appendChild(h("div", { class: "pg-grid", style: { gap: "12px" } }, rangeHint, table, pagerEl));
    }

    function render() {
      ui.clear(listHost);
      if (!toolbarEl) buildToolbar();
      listHost.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbarEl, resultsHost));
      paintResults();
    }

    /* ---------- render : Arsip Lampiran (semua karyawan) — grid ---------- */
    var arch = { kind: "", q: "", page: 1, loading: false, data: null };
    function loadArchive() {
      arch.loading = true;
      renderArchive();
      store.attachmentArchive({ kind: arch.kind, q: arch.q, page: arch.page })
        .then(function (d) { arch.data = d; arch.loading = false; renderArchive(); })
        .catch(function () { arch.data = { items: [], total: 0, page: 1, pageCount: 1 }; arch.loading = false; renderArchive(); });
    }
    function renderArchive() {
      ui.clear(archiveHost);
      var kindSel = h("select", { class: "pg-select",
        onchange: function (e) { arch.kind = e.target.value; arch.page = 1; loadArchive(); } },
        [{ value: "", label: "Semua Jenis" }, { value: "image", label: "Foto" },
         { value: "file", label: "Dokumen" }, { value: "link", label: "Link" }].map(function (o) {
          return h("option", { value: o.value, text: o.label, selected: o.value === arch.kind });
        }));
      var searchInput = h("input", { class: "pg-input", type: "search",
        placeholder: "Cari judul todo / nama file / karyawan…", value: arch.q,
        onchange: function (e) { arch.q = e.target.value; arch.page = 1; loadArchive(); } });
      var toolbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          ui.button({ label: "Kembali ke Daftar Todo", variant: "ghost", icon: "chevronLeft",
            onClick: function () { view = "list"; paint(); } }),
          h("div", { class: "pg-toolbar__search" }, searchInput),
          kindSel
        )
      ));

      var scoped = arch.kind || arch.q;
      var content;
      if (!arch.data) {
        content = h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "archive", title: "Memuat arsip lampiran…" }));
      } else if (!arch.data.items.length) {
        content = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "archive",
          title: scoped ? "Tidak ada lampiran untuk filter ini." : "Belum ada lampiran laporan.",
          text: scoped ? "Ubah kata kunci atau jenis." : "Lampiran yang diunggah karyawan pada setiap todo akan terkumpul di sini." }));
      } else {
        var d = arch.data;
        var grid = h("div", { class: "pg-att-archive-grid" });
        d.items.forEach(function (a) {
          grid.appendChild(h("div", { class: "pg-arch-card" },
            h("div", { class: "pg-arch-card__body" }, ui.attachmentCover(a)),
            h("div", { class: "pg-arch-card__foot" },
              h("div", { class: "pg-arch-card__todo", text: a.todoTitle || "Todo" }),
              h("div", { class: "pg-arch-card__date" }, (a.label ? a.label + " · " : "") + (a.uploaderName || "—") + " · " + ui.fmtDateShortID(a.createdAt))),
            h("div", { class: "pg-arch-card__act" },
              ui.button({ label: "Buka", icon: "external", variant: "ghost", size: "sm",
                onClick: function () { ui.openAttachment(a); } }),
              ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus lampiran", title: "Hapus",
                onClick: function () {
                  ui.confirm({ title: "Hapus Lampiran", tone: "danger", confirmLabel: "Hapus",
                    message: "Hapus lampiran ini dari arsip? File akan dihapus permanen.",
                    onConfirm: function () {
                      store.removeTodoAttachment(a.id).then(function (r) {
                        if (!r || r.ok === false) { ui.toast((r && r.error) || "Gagal menghapus.", "danger"); return; }
                        ui.toast("Lampiran dihapus.", "success"); loadArchive();
                      });
                    } });
                } }))
          ));
        });
        content = h("div", { class: "pg-grid", style: { gap: "12px" } },
          h("div", { class: "pg-muted", style: { fontSize: "13px" },
            text: "Menampilkan " + d.items.length + " dari " + d.total + " lampiran." }),
          grid,
          ui.pager({ page: d.page, pageCount: d.pageCount, info: "Halaman " + d.page + " dari " + d.pageCount,
            onPage: function (n) { arch.page = n; loadArchive(); } }));
      }
      archiveHost.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar, content));
    }

    paint();
    ui.live(paint, wrap);
    return page([
      pageHead("Work Management", "Todo List"),
      wrap
    ]);
  };

  /* ============================================================
     LAPORAN ABSENSI  (real data from store.allAttendance)
     ============================================================ */
  pages.laporanAbsensi = function () {
    if (!PG.auth.can("attendance.report.view")) {
      return page([pageHead("Attendance", "Laporan Absensi"),
        ui.notice("Anda tidak memiliki akses ke laporan absensi.")]);
    }
    var state = { from: "", to: "", div: "", user: "", status: "", photo: "", page: 1 };
    var PER_PAGE = 15;
    var wrap = h("div");
    function setFilter(fn) { fn(); state.page = 1; render(); }
    // A control only counts as "changed by the user" once they have actually
    // pointed/typed into it — this ignores the synthetic change events the
    // browser fires while restoring form fields on reload / history nav.
    function armFilter(el) {
      var mark = function () { el._touched = true; };
      el.addEventListener("pointerdown", mark);
      el.addEventListener("keydown", mark);
      return el;
    }

    // Lifecycle status shown in the row badge.
    function rowStatus(rec) {
      return rec.checkOutAt ? "pulang" : (rec.checkInStatus || "hadir");
    }
    // Whether a record matches a status filter (punctuality-aware).
    function matchesStatus(rec, f) {
      if (!f) return true;
      if (f === "pulang") return !!rec.checkOutAt;
      return (rec.checkInStatus || "hadir") === f;   // hadir | terlambat by check-in punctuality
    }
    function fmtDateTime(iso) {
      return iso ? (ui.fmtDateWeekdayID(iso) + " " + ui.fmtTimeID(iso)) : "—";
    }

    function deleteAttendance(r) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus data absensi",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus rekap absensi " + (u.fullName || "karyawan") + " tanggal " +
          ui.fmtDateWeekdayID(r.date) + " (termasuk foto selfie)? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.remove("attendanceRecords", r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus data absensi.", "danger"); return; }
            ui.toast("Data absensi dihapus.", "success");
            render();
          });
        }
      });
    }

    // Full detail of one attendance record — opened by clicking a table row
    // or its "Detail" button. Shows employee data + both selfie previews.
    function attendanceDetail(r) {
      var u = store.find("users", r.userId) || {};
      function kv(label, value) {
        return h("div", null,
          h("div", { class: "pg-field__hint", text: label }),
          value && value.nodeType ? value : h("div", { class: "pg-strong", text: value || "—" }));
      }
      function photoBlock(title, at, src) {
        var body = src
          ? h("div", { class: "pg-attdetail__photo-body" },
              ui.photoImg(src, { alt: title,
                onclick: function () { ui.photoViewer(src, title + " — " + (u.fullName || "")); } }))
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
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("div", { class: "pg-avatar", style: { width: "44px", height: "44px", fontSize: "15px" }, text: ui.initials(u.fullName || "?") }),
            h("div", null,
              h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: u.fullName || "Karyawan tidak ditemukan" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + (u.username || "—") + " · " + ui.fmtDateWeekdayID(r.date) })
            )
          ),
          h("div", { class: "pg-attdetail__kv" },
            kv("Divisi", pgDivLabel(u)),
            kv("Jabatan", store.positionName(u.positionId)),
            kv("Status", h("div", null, ui.statusBadge(rowStatus(r)))),
            kv("Keterlambatan", r.lateMinutes ? (r.lateMinutes + " menit") : "Tepat waktu")
          ),
          h("div", { class: "pg-attdetail__photos" },
            photoBlock("Selfie Absen Masuk", r.checkInAt, r.checkInPhoto),
            photoBlock("Selfie Absen Pulang", r.checkOutAt, r.checkOutPhoto)
          ),
          ui.notice("Waktu dicatat oleh server. ID rekap " + r.id + " · Dibuat " + fmtDateTime(r.createdAt) +
            (r.updatedAt && r.updatedAt !== r.createdAt ? " · Diperbarui " + fmtDateTime(r.updatedAt) : ""),
            { muted: true })
        ) ]
      });
    }

    function render() {
      ui.clear(wrap);
      var hasAllPhotos = function (r) {
        // "normal" selfie attendance has a check-in photo; a completed day also has a check-out photo.
        return !!r.checkInPhoto && (!r.checkOutAt || !!r.checkOutPhoto);
      };
      var rows = store.allAttendance().filter(function (r) {
        if (state.from && r.date < state.from) return false;
        if (state.to && r.date > state.to) return false;
        if (state.user && r.userId !== state.user) return false;
        var u = store.find("users", r.userId);
        if (state.div && (!u || store.userDivisionIds(u).indexOf(String(state.div)) < 0)) return false;
        if (!matchesStatus(r, state.status)) return false;
        if (state.photo === "with" && !hasAllPhotos(r)) return false;
        if (state.photo === "without" && hasAllPhotos(r)) return false;
        return true;
      });

      // Summary respects EVERY active filter — it aggregates the filtered set.
      var sum = store.summarizeAttendance(rows);
      var scopeHint = (state.from || state.to || state.div || state.user || state.status || state.photo)
        ? "sesuai filter" : "semua data";

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar pg-filterbar--fields" },
          dateField("Dari Tanggal", state.from, function (v) { setFilter(function () { state.from = v; }); }),
          dateField("Sampai Tanggal", state.to, function (v) { setFilter(function () { state.to = v; }); }),
          selPill("Divisi", state.div, "Semua Divisi", store.all("divisions").map(function (d) { return { value: d.id, label: d.name }; }),
            function (v) { setFilter(function () { state.div = v; }); }),
          selPill("Karyawan", state.user, "Semua Karyawan", store.all("users").map(function (u) { return { value: u.id, label: u.fullName }; }),
            function (v) { setFilter(function () { state.user = v; }); }),
          selPill("Status", state.status, "Semua Status",
            [{ value: "hadir", label: "Hadir" }, { value: "terlambat", label: "Terlambat" }, { value: "pulang", label: "Sudah Pulang" }],
            function (v) { setFilter(function () { state.status = v; }); }),
          selPill("Foto", state.photo, "Semua Foto",
            [{ value: "with", label: "Foto Lengkap" }, { value: "without", label: "Foto Kurang" }],
            function (v) { setFilter(function () { state.photo = v; }); }),
          (state.from || state.to || state.div || state.user || state.status || state.photo)
            ? h("div", { class: "pg-field", style: { gap: "2px" } }, h("label", { class: "pg-field__hint", html: "&nbsp;" }),
                ui.button({ label: "Reset", variant: "ghost", size: "sm", onClick: function () {
                  state = { from: "", to: "", div: "", user: "", status: "", photo: "", page: 1 }; render(); } }))
            : null
        )
      ));
      var rangeWarn = (state.from && state.to && state.from > state.to)
        ? ui.notice("Rentang tanggal tidak valid — \"Dari Tanggal\" melebihi \"Sampai Tanggal\".", { muted: true })
        : null;

      var summary = h("div", { class: "pg-grid pg-grid--3" },
        ui.statCard({ icon: "clock", label: "Rekap Total", value: sum.total, hint: scopeHint }),
        ui.statCard({ icon: "checkCircle", tone: "green", label: "Tepat Waktu", value: sum.hadir }),
        ui.statCard({ icon: "info", tone: "yellow", label: "Terlambat", value: sum.terlambat }),
        ui.statCard({ icon: "checkCircle", tone: "", label: "Sudah Pulang", value: sum.pulang }),
        ui.statCard({ icon: "logout", tone: "yellow", label: "Kabur", value: sum.kabur, hint: "pulang sebelum jam kerja" }),
        ui.statCard({ icon: "clock", tone: "green", label: "Total Jam Kerja", value: ui.fmtDuration(sum.workedMs), hint: "sesuai jam kerja (lembur terpisah)" })
      );

      // ---- pagination ----
      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var startIdx = (state.page - 1) * PER_PAGE;
      var pageRows = rows.slice(startIdx, startIdx + PER_PAGE);

      var body;
      if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "clock",
          title: store.allAttendance().length ? "Tidak ada data untuk filter ini." : "Belum ada data absensi.",
          text: store.allAttendance().length ? "Ubah atau reset filter." : "Data muncul setelah karyawan melakukan absensi di User App."
        }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Nama", "Username", "Divisi", "Jam Masuk", "Foto Masuk", "Jam Pulang", "Foto Pulang", "Keterlambatan", "Status", "Aksi"],
          rows: pageRows.map(function (r) {
            var u = store.find("users", r.userId) || {};
            var who = (u.fullName || "—") + " · " + ui.fmtDateWeekdayID(r.date);
            return {
              onClick: function () { attendanceDetail(r); },
              cells: [
                ui.fmtDateWeekdayID(r.date),
                h("span", { class: "pg-strong", text: u.fullName || "—" }),
                h("code", { text: u.username || "—" }),
                pgDivLabel(u),
                ui.fmtTimeID(r.checkInAt),
                ui.photoThumb(r.checkInPhoto, null, { title: "Foto masuk — " + who, alt: "Foto masuk" }),
                ui.fmtTimeID(r.checkOutAt),
                ui.photoThumb(r.checkOutPhoto, null, { title: "Foto pulang — " + who, alt: "Foto pulang" }),
                r.lateMinutes ? (r.lateMinutes + " menit") : "—",
                ui.statusBadge(rowStatus(r)),
                ui.button({ icon: "trash", variant: "danger", size: "sm",
                  ariaLabel: "Hapus data absensi", title: "Hapus",
                  onClick: function () { deleteAttendance(r); } })
              ]
            };
          })
        });
      }

      var rangeHint = rows.length
        ? h("div", { class: "pg-muted", style: { fontSize: "13px" },
            text: "Menampilkan " + (startIdx + 1) + "–" + (startIdx + pageRows.length) + " dari " +
              rows.length + " rekap · klik baris untuk detail & foto selfie." })
        : null;

      var pagerEl = ui.pager({
        page: state.page, pageCount: pageCount,
        info: "Halaman " + state.page + " dari " + pageCount,
        onPage: function (n) { state.page = n; render(); }
      });

      wrap.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar, rangeWarn, summary, rangeHint, body, pagerEl));
    }

    function selPill(label, value, blankLabel, options, onChange) {
      var sel = h("select", { class: "pg-select", autocomplete: "off",
        name: "flt_" + Math.random().toString(36).slice(2),   // fresh name → no browser restore
        onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(options).map(function (o) {
          return h("option", { value: o.value, text: o.label }); }));
      sel.value = value || "";          // authoritative from state, not from browser restore
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(sel));
    }
    // "Dari / Sampai" date input — armed against browser field restore like the selects.
    function dateField(label, value, onChange) {
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(h("input", { class: "pg-input", type: "date", value: value || "", autocomplete: "off",
          name: "flt_" + Math.random().toString(36).slice(2),
          onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } })));
    }

    render();
    ui.live(render, wrap);
    return page([pageHead("Attendance", "Laporan Absensi"), wrap]);
  };

  /* ============================================================
     LAPORAN IZIN  (permission / leave — selfie + reason, submit-only)
     ============================================================ */
  pages.laporanIzin = function () {
    if (!PG.auth.can("izin.report.view")) {
      return page([pageHead("Attendance", "Laporan Izin"),
        ui.notice("Anda tidak memiliki akses ke laporan izin.")]);
    }
    var PER_PAGE = 15;
    var state = { from: "", to: "", div: "", user: "", page: 1 };
    var wrap = h("div");

    function setFilter(fn) { fn(); state.page = 1; render(); }
    function armFilter(el) {
      var mark = function () { el._touched = true; };
      el.addEventListener("pointerdown", mark);
      el.addEventListener("keydown", mark);
      return el;
    }
    function selPill(label, value, blankLabel, options, onChange) {
      var sel = h("select", { class: "pg-select", autocomplete: "off",
        name: "flt_" + Math.random().toString(36).slice(2),
        onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(options).map(function (o) {
          return h("option", { value: o.value, text: o.label }); }));
      sel.value = value || "";
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(sel));
    }
    function dateField(label, value, onChange) {
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(h("input", { class: "pg-input", type: "date", value: value || "", autocomplete: "off",
          name: "flt_" + Math.random().toString(36).slice(2),
          onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } })));
    }
    function fmtDateTime(iso) { return iso ? (ui.fmtDateWeekdayID(iso) + " " + ui.fmtTimeID(iso)) : "—"; }

    function izinDetail(r) {
      var u = store.find("users", r.userId) || {};
      ui.modal({
        title: "Detail Izin",
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("div", { class: "pg-avatar", style: { width: "44px", height: "44px", fontSize: "15px" }, text: ui.initials(u.fullName || "?") }),
            h("div", null,
              h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: u.fullName || "Karyawan tidak ditemukan" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + (u.username || "—") + " · " + ui.fmtDateWeekdayID(r.date) }))
          ),
          h("div", { class: "pg-attdetail__kv" },
            h("div", null, h("div", { class: "pg-field__hint", text: "Divisi" }), h("div", { class: "pg-strong", text: pgDivLabel(u) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Jabatan" }), h("div", { class: "pg-strong", text: store.positionName(u.positionId) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Dikirim" }), h("div", { class: "pg-strong", text: fmtDateTime(r.createdAt) }))
          ),
          h("div", { class: "pg-attdetail__photos" },
            h("div", { class: "pg-attdetail__photo" },
              h("div", { class: "pg-attdetail__photo-head" },
                h("span", { text: "Selfie Izin" }),
                h("span", { class: "pg-muted", style: { fontWeight: "400" }, text: r.createdAt ? ui.fmtTimeID(r.createdAt) : "—" })),
              r.photo
                ? h("div", { class: "pg-attdetail__photo-body" },
                    ui.photoImg(r.photo, { alt: "Selfie izin", onclick: function () { ui.photoViewer(r.photo, "Selfie Izin — " + (u.fullName || "")); } }))
                : h("div", { class: "pg-attdetail__photo-body" },
                    h("div", { class: "pg-attdetail__photo-empty" }, svg("user"), h("span", { text: "Tanpa foto" }))))),
          h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
            svg("info"), h("div", { text: "Keterangan: " + r.reason })),
          ui.notice("ID izin " + r.id + " · Dikirim " + fmtDateTime(r.createdAt), { muted: true })
        ) ]
      });
    }

    function deleteIzin(r) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus data izin",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus izin " + (u.fullName || "karyawan") + " tanggal " + ui.fmtDateWeekdayID(r.date) +
          " (termasuk foto selfie)? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.deleteIzin(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus data izin.", "danger"); return; }
            ui.toast("Data izin dihapus.", "success");
            render();
          });
        }
      });
    }

    function render() {
      ui.clear(wrap);
      var hasFilter = !!(state.from || state.to || state.div || state.user);
      var rows = store.allIzin().filter(function (r) {
        if (state.from && r.date < state.from) return false;
        if (state.to && r.date > state.to) return false;
        if (state.user && r.userId !== state.user) return false;
        var u = store.find("users", r.userId);
        if (state.div && (!u || store.userDivisionIds(u).indexOf(String(state.div)) < 0)) return false;
        return true;
      });

      var monthKey = store.dateKey().slice(0, 7);
      var thisMonth = rows.filter(function (r) { return String(r.date).slice(0, 7) === monthKey; }).length;
      var uniqUsers = {};
      rows.forEach(function (r) { uniqUsers[r.userId] = 1; });

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar pg-filterbar--fields" },
          dateField("Dari Tanggal", state.from, function (v) { setFilter(function () { state.from = v; }); }),
          dateField("Sampai Tanggal", state.to, function (v) { setFilter(function () { state.to = v; }); }),
          selPill("Divisi", state.div, "Semua Divisi", store.all("divisions").map(function (d) { return { value: d.id, label: d.name }; }),
            function (v) { setFilter(function () { state.div = v; }); }),
          selPill("Karyawan", state.user, "Semua Karyawan", store.all("users").map(function (u) { return { value: u.id, label: u.fullName }; }),
            function (v) { setFilter(function () { state.user = v; }); }),
          hasFilter
            ? h("div", { class: "pg-field", style: { gap: "2px" } }, h("label", { class: "pg-field__hint", html: "&nbsp;" }),
                ui.button({ label: "Reset", variant: "ghost", size: "sm", onClick: function () {
                  state = { from: "", to: "", div: "", user: "", page: 1 }; render(); } }))
            : null
        )
      ));
      var rangeWarn = (state.from && state.to && state.from > state.to)
        ? ui.notice("Rentang tanggal tidak valid — \"Dari Tanggal\" melebihi \"Sampai Tanggal\".", { muted: true })
        : null;

      var summary = h("div", { class: "pg-grid pg-grid--3" },
        ui.statCard({ icon: "doc", label: "Total Izin", value: rows.length, hint: hasFilter ? "sesuai filter" : "semua data" }),
        ui.statCard({ icon: "calendar", tone: "blue", label: "Izin Bulan Ini", value: thisMonth }),
        ui.statCard({ icon: "users", tone: "yellow", label: "Karyawan Izin", value: Object.keys(uniqUsers).length })
      );

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var pageRows = rows.slice((state.page - 1) * PER_PAGE, (state.page - 1) * PER_PAGE + PER_PAGE);

      var body;
      if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "doc",
          title: store.allIzin().length ? "Tidak ada izin untuk filter ini." : "Belum ada data izin.",
          text: store.allIzin().length ? "Ubah atau reset filter." : "Data muncul setelah karyawan mengajukan izin di User App."
        }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Nama", "Username", "Divisi", "Keterangan", "Foto", "Aksi"],
          rows: pageRows.map(function (r) {
            var u = store.find("users", r.userId) || {};
            return {
              onClick: function () { izinDetail(r); },
              cells: [
                ui.fmtDateWeekdayID(r.date),
                h("span", { class: "pg-strong", text: u.fullName || "—" }),
                h("code", { text: u.username || "—" }),
                pgDivLabel(u),
                h("span", { title: r.reason }, r.reason.length > 48 ? r.reason.slice(0, 48) + "…" : r.reason),
                ui.photoThumb(r.photo, null, { title: "Selfie izin — " + (u.fullName || ""), alt: "Selfie izin" }),
                h("div", { class: "pg-rowactions" },
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus data izin",
                    onClick: function () { deleteIzin(r); } }))
              ]
            };
          })
        });
      }

      var pagerNode = rows.length > PER_PAGE
        ? h("div", { style: { marginTop: "12px" } }, ui.pager({
            page: state.page, pageCount: pageCount,
            info: "Menampilkan " + ((state.page - 1) * PER_PAGE + 1) + "–" +
              Math.min(state.page * PER_PAGE, rows.length) + " dari " + rows.length,
            onPage: function (n) { state.page = n; render(); }
          }))
        : null;

      wrap.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar, rangeWarn, summary,
        h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" }, body, pagerNode))));
    }

    render();
    ui.live(render, wrap);
    return page([pageHead("Attendance", "Laporan Izin"), wrap]);
  };

  /* ============================================================
     LAPORAN PENGELUARAN  (a plain expense LOGBOOK for staff, not a finance
     module — nama, nominal + foto lampiran, submit-only from the User App;
     tanggal diambil otomatis oleh server saat karyawan mencatatnya)
     ============================================================ */
  pages.laporanPengeluaran = function () {
    if (!PG.auth.can("expense.report.view")) {
      return page([pageHead("Work Management", "Laporan Pengeluaran"),
        ui.notice("Anda tidak memiliki akses ke laporan pengeluaran.")]);
    }
    var PER_PAGE = 15;
    var state = { from: "", to: "", div: "", user: "", page: 1 };
    var wrap = h("div");

    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }

    function setFilter(fn) { fn(); state.page = 1; render(); }
    function armFilter(el) {
      var mark = function () { el._touched = true; };
      el.addEventListener("pointerdown", mark);
      el.addEventListener("keydown", mark);
      return el;
    }
    function selPill(label, value, blankLabel, options, onChange) {
      var sel = h("select", { class: "pg-select", autocomplete: "off",
        name: "flt_" + Math.random().toString(36).slice(2),
        onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(options).map(function (o) {
          return h("option", { value: o.value, text: o.label }); }));
      sel.value = value || "";
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(sel));
    }
    function dateField(label, value, onChange) {
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(h("input", { class: "pg-input", type: "date", value: value || "", autocomplete: "off",
          name: "flt_" + Math.random().toString(36).slice(2),
          onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } })));
    }
    function fmtDateTime(iso) { return iso ? (ui.fmtDateWeekdayID(iso) + " " + ui.fmtTimeID(iso)) : "—"; }

    function expenseDetail(r) {
      var u = store.find("users", r.userId) || {};
      ui.modal({
        title: r.name,
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("div", { class: "pg-avatar", style: { width: "44px", height: "44px", fontSize: "15px" }, text: ui.initials(u.fullName || "?") }),
            h("div", null,
              h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: u.fullName || "Karyawan tidak ditemukan" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + (u.username || "—") + " · " + ui.fmtDateWeekdayID(r.date) }))
          ),
          h("div", { class: "pg-attdetail__kv" },
            h("div", null, h("div", { class: "pg-field__hint", text: "Divisi" }), h("div", { class: "pg-strong", text: pgDivLabel(u) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Nominal" }), h("div", { class: "pg-strong", text: moneyID(r.amount) })),
            h("div", null, h("div", { class: "pg-field__hint", text: "Dikirim" }), h("div", { class: "pg-strong", text: fmtDateTime(r.createdAt) }))
          ),
          h("div", { class: "pg-attdetail__photos" },
            h("div", { class: "pg-attdetail__photo" },
              h("div", { class: "pg-attdetail__photo-head" },
                h("span", { text: "Foto Lampiran" }),
                h("span", { class: "pg-muted", style: { fontWeight: "400" }, text: r.createdAt ? ui.fmtTimeID(r.createdAt) : "—" })),
              h("div", { class: "pg-attdetail__photo-body" },
                ui.photoImg(r.photoUrl, { alt: "Foto lampiran", onclick: function () { ui.photoViewer(r.photoUrl, r.name + " — " + (u.fullName || "")); } })))),
          r.note ? h("div", { class: "pg-notice pg-notice--muted", style: { marginTop: "10px" } },
            svg("info"), h("div", { text: "Catatan: " + r.note })) : null,
          ui.notice("ID pengeluaran " + r.id + " · Dikirim " + fmtDateTime(r.createdAt), { muted: true })
        ) ]
      });
    }

    function deleteExpense(r) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus data pengeluaran",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus pengeluaran \"" + r.name + "\" milik " + (u.fullName || "karyawan") + " tanggal " + ui.fmtDateWeekdayID(r.date) +
          " (termasuk foto lampiran)? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.deleteExpense(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus data pengeluaran.", "danger"); return; }
            ui.toast("Data pengeluaran dihapus.", "success");
            render();
          });
        }
      });
    }

    function render() {
      ui.clear(wrap);
      var hasFilter = !!(state.from || state.to || state.div || state.user);
      var rows = store.allExpenses().filter(function (r) {
        if (state.from && r.date < state.from) return false;
        if (state.to && r.date > state.to) return false;
        if (state.user && r.userId !== state.user) return false;
        var u = store.find("users", r.userId);
        if (state.div && (!u || store.userDivisionIds(u).indexOf(String(state.div)) < 0)) return false;
        return true;
      });

      var monthKey = store.dateKey().slice(0, 7);
      var monthRows = rows.filter(function (r) { return String(r.date).slice(0, 7) === monthKey; });
      var totalAmount = rows.reduce(function (s, r) { return s + (r.amount || 0); }, 0);
      var uniqUsers = {};
      rows.forEach(function (r) { uniqUsers[r.userId] = 1; });

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar pg-filterbar--fields" },
          dateField("Dari Tanggal", state.from, function (v) { setFilter(function () { state.from = v; }); }),
          dateField("Sampai Tanggal", state.to, function (v) { setFilter(function () { state.to = v; }); }),
          selPill("Divisi", state.div, "Semua Divisi", store.all("divisions").map(function (d) { return { value: d.id, label: d.name }; }),
            function (v) { setFilter(function () { state.div = v; }); }),
          selPill("Karyawan", state.user, "Semua Karyawan", store.all("users").map(function (u) { return { value: u.id, label: u.fullName }; }),
            function (v) { setFilter(function () { state.user = v; }); }),
          hasFilter
            ? h("div", { class: "pg-field", style: { gap: "2px" } }, h("label", { class: "pg-field__hint", html: "&nbsp;" }),
                ui.button({ label: "Reset", variant: "ghost", size: "sm", onClick: function () {
                  state = { from: "", to: "", div: "", user: "", page: 1 }; render(); } }))
            : null
        )
      ));
      var rangeWarn = (state.from && state.to && state.from > state.to)
        ? ui.notice("Rentang tanggal tidak valid — \"Dari Tanggal\" melebihi \"Sampai Tanggal\".", { muted: true })
        : null;

      var summary = h("div", { class: "pg-grid pg-grid--3" },
        ui.statCard({ icon: "wallet", label: "Total Nominal", value: moneyID(totalAmount), hint: hasFilter ? "sesuai filter" : "semua data" }),
        ui.statCard({ icon: "calendar", tone: "blue", label: "Nominal Bulan Ini", value: moneyID(monthRows.reduce(function (s, r) { return s + (r.amount || 0); }, 0)) }),
        ui.statCard({ icon: "users", tone: "yellow", label: "Karyawan Melapor", value: Object.keys(uniqUsers).length })
      );

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var pageRows = rows.slice((state.page - 1) * PER_PAGE, (state.page - 1) * PER_PAGE + PER_PAGE);

      var body;
      if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "wallet",
          title: store.allExpenses().length ? "Tidak ada pengeluaran untuk filter ini." : "Belum ada data pengeluaran.",
          text: store.allExpenses().length ? "Ubah atau reset filter." : "Data muncul setelah karyawan melapor pengeluaran di User App."
        }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Nama", "Username", "Divisi", "Pengeluaran", "Nominal", "Foto", "Aksi"],
          rows: pageRows.map(function (r) {
            var u = store.find("users", r.userId) || {};
            return {
              onClick: function () { expenseDetail(r); },
              cells: [
                ui.fmtDateWeekdayID(r.date),
                h("span", { class: "pg-strong", text: u.fullName || "—" }),
                h("code", { text: u.username || "—" }),
                pgDivLabel(u),
                h("span", { title: r.name }, r.name.length > 40 ? r.name.slice(0, 40) + "…" : r.name),
                h("span", { class: "pg-strong", text: moneyID(r.amount) }),
                ui.photoThumb(r.photoUrl, null, { title: r.name + " — " + (u.fullName || ""), alt: "Foto lampiran" }),
                h("div", { class: "pg-rowactions" },
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus data pengeluaran",
                    onClick: function () { deleteExpense(r); } }))
              ]
            };
          })
        });
      }

      var pagerNode = rows.length > PER_PAGE
        ? h("div", { style: { marginTop: "12px" } }, ui.pager({
            page: state.page, pageCount: pageCount,
            info: "Menampilkan " + ((state.page - 1) * PER_PAGE + 1) + "–" +
              Math.min(state.page * PER_PAGE, rows.length) + " dari " + rows.length,
            onPage: function (n) { state.page = n; render(); }
          }))
        : null;

      wrap.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar, rangeWarn, summary,
        h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" }, body, pagerNode))));
    }

    render();
    ui.live(render, wrap);
    return page([pageHead("Work Management", "Laporan Pengeluaran"), wrap]);
  };

  /* ============================================================
     LAPORAN RESI GUDANG  (warehouse receipts — catatan barang masuk gudang
     yang diisi karyawan di User App; 13 kolom. Admin: baca, filter, ekspor
     CSV, hapus. Sumber sama: bootstrap warehouseReceipts.)
     ============================================================ */
  pages.laporanResiGudang = function () {
    if (!PG.auth.can("warehouse.report.view")) {
      return page([pageHead("Work Management", "Laporan Resi Gudang"),
        ui.notice("Anda tidak memiliki akses ke laporan resi gudang.")]);
    }
    var PER_PAGE = 15;
    var state = { from: "", to: "", month: "", q: "", page: 1 };
    var wrap = h("div");

    var MO = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }
    function numID(n) { return (Math.round(n || 0)).toLocaleString("id-ID"); }
    function fmtDateTime(iso) { return iso ? (ui.fmtDateWeekdayID(iso) + " " + ui.fmtTimeID(iso)) : "—"; }
    function monthLabel(ym) {
      if (!ym || ym.indexOf("-") < 0) return ym || "";
      var p = ym.split("-");
      return (MO[(+p[1] || 1) - 1] || p[1]) + " " + p[0];
    }

    function setFilter(fn) { fn(); state.page = 1; render(); }
    function armFilter(el) {
      var mark = function () { el._touched = true; };
      el.addEventListener("pointerdown", mark);
      el.addEventListener("keydown", mark);
      return el;
    }
    function selPill(label, value, blankLabel, options, onChange) {
      var sel = h("select", { class: "pg-select", autocomplete: "off",
        name: "flt_" + Math.random().toString(36).slice(2),
        onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(options).map(function (o) {
          return h("option", { value: o.value, text: o.label }); }));
      sel.value = value || "";
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(sel));
    }
    function dateField(label, value, onChange) {
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(h("input", { class: "pg-input", type: "date", value: value || "", autocomplete: "off",
          name: "flt_" + Math.random().toString(36).slice(2),
          onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } })));
    }

    function receiptDetail(r) {
      var u = store.find("users", r.userId) || {};

      // One key -> value line in a bordered "receipt" list.
      function row(k, v, opts) {
        opts = opts || {};
        var valNode = (v && v.nodeType) ? v
          : h("span", null, (v == null || v === "") ? "—" : String(v));
        return h("div", { class: "pg-rgdetail__row" + (opts.total ? " pg-rgdetail__row--total" : "") },
          h("span", { class: "pg-rgdetail__row-k", text: k }),
          h("span", { class: "pg-rgdetail__row-v" }, valNode,
            opts.sub ? h("small", { class: "pg-rgdetail__row-sub", text: opts.sub }) : null)
        );
      }
      function section(label, iconName, rows) {
        return h("div", { class: "pg-rgdetail__sec" },
          h("div", { class: "pg-rgdetail__sec-head" }, svg(iconName), h("span", { text: label })),
          h("div", { class: "pg-rgdetail__rows" }, rows.filter(Boolean))
        );
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
        class: "pg-modal--kpidetail",
        body: [ h("div", { class: "pg-rgdetail" },

          // Who reported it
          h("div", { class: "pg-rgdetail__id" },
            empAvatar(u, 46),
            h("div", { style: { minWidth: "0" } },
              h("div", { class: "pg-rgdetail__id-name", text: u.fullName || "Karyawan tidak ditemukan" }),
              h("div", { class: "pg-rgdetail__id-meta", text: "@" + (u.username || "—") + " · " + pgDivLabel(u) }))
          ),

          // Headline: item + date + resi + overall status (lunas/klop/tempo)
          h("div", { class: "pg-rgdetail__hero" },
            h("div", { class: "pg-rgdetail__hero-title", text: r.itemName }),
            ui.badge(st2.label, st2.tone),
            h("div", { class: "pg-rgdetail__hero-sub" },
              h("span", null, ui.fmtDateWeekdayID(r.date)),
              " · No Resi ",
              h("code", { text: r.resiNo || "—" }))
          ),

          // Barang & supplier
          section("Barang & Supplier", "archive", [
            row("Nama Barang", r.itemName),
            row("Supplier", r.supplier),
            row("No Resi", h("code", { text: r.resiNo || "—" })),
            row("Tanggal Resi", ui.fmtDateWeekdayID(r.date))
          ]),

          // Money breakdown — reads like a receipt
          section("Rincian Nilai", "wallet", [
            row("Harga Satuan", moneyID(r.unitPrice)),
            row("Pcs", numID(r.qty)),
            row("Total Harga", moneyID(r.totalPrice), { sub: totalSub }),
            row("Ongkir", moneyID(r.shippingCost)),
            row("Total + Ongkir", moneyID(grandTotal), { total: true }),
            row("Jumlah Koli (Karung)", numID(r.koli) + " karung")
          ]),

          // Pembayaran
          section("Pembayaran", "wallet", [
            row("Status Pembayaran", r.paymentStatus === "lunas" ? "Lunas" : "Belum Lunas"),
            r.paymentStatus !== "lunas"
              ? row("Tanggal Jatuh Tempo", r.dueDate ? ui.fmtDateWeekdayID(r.dueDate) : "Belum diisi")
              : null,
            row("Metode Pembayaran", r.payment)
          ]),

          // Logistics
          section("Pengiriman & Penerimaan", "store", [
            row("Pengiriman", r.shipping),
            row("Tanggal Diterima", received
              ? ui.fmtDateWeekdayID(r.receivedDate)
              : h("span", { class: "pg-muted", text: "Belum diterima" })),
            row("Kondisi Barang", goodsLabel)
          ]),

          // Free-text note
          r.note
            ? h("div", { class: "pg-rgdetail__note" },
                h("div", { class: "pg-rgdetail__note-label", text: "Keterangan" }),
                h("div", { text: r.note }))
            : null,

          // Provenance
          h("div", { class: "pg-rgdetail__foot" },
            h("div", { text: "Dicatat oleh " + (u.fullName || "karyawan") + " · " + fmtDateTime(r.createdAt) }),
            (r.updatedAt && r.updatedAt !== r.createdAt)
              ? h("div", { text: "Terakhir diubah " + fmtDateTime(r.updatedAt) }) : null,
            h("div", { text: "ID resi gudang #" + r.id })
          )
        ) ]
      });
    }

    function deleteReceipt(r) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus data resi gudang",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus catatan \"" + r.itemName + "\" milik " + (u.fullName || "karyawan") + " tanggal " +
          ui.fmtDateWeekdayID(r.date) + "? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          return store.deleteWarehouseReceipt(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus data.", "danger"); return; }
            ui.toast("Data resi gudang dihapus.", "success");
            render();
          });
        }
      });
    }

    function exportCsv(rows) {
      var head = ["Tanggal", "Nama Barang", "Supplier", "No Resi", "Pcs", "Harga Satuan", "Total Harga",
        "Ongkir", "Keterangan", "Status Pembayaran", "Tanggal Jatuh Tempo", "Metode Pembayaran",
        "Tanggal Diterima", "Kondisi Barang", "Pengiriman", "Koli (Karung)",
        "Karyawan", "Username", "Divisi", "Dicatat"];
      function esc(v) {
        v = v == null ? "" : String(v);
        return /[",\n;]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
      }
      var lines = [head.join(",")];
      rows.forEach(function (r) {
        var u = store.find("users", r.userId) || {};
        var goodsLabel = r.goodsStatus === "klop" ? "Klop" : r.goodsStatus === "minus" ? "Minus" : "";
        lines.push([
          r.date, r.itemName, r.supplier, r.resiNo, r.qty, r.unitPrice, r.totalPrice,
          r.shippingCost, r.note || "",
          r.paymentStatus === "lunas" ? "Lunas" : "Belum Lunas", r.dueDate || "", r.payment || "",
          r.receivedDate || "", goodsLabel, r.shipping || "", r.koli,
          u.fullName || "", u.username || "", pgDivLabel(u), r.createdAt || ""
        ].map(esc).join(","));
      });
      var blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
      var url = URL.createObjectURL(blob);
      var a = h("a", { href: url, download: "laporan-resi-gudang-" + store.dateKey() + ".csv" });
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 100);
    }

    // ---- Stat-card drill-downs — same behavior as the User App's own Resi
    // Gudang page (listModal/nilaiModal/supplierGroupModal/tempoRow), just
    // cross-employee: every row also names the karyawan who recorded it, and
    // tapping a row opens the SAME rich receiptDetail() the table already
    // uses (so there's exactly one detail view, not a second one to keep in
    // sync). `m` is declared before the row renderers so a row's onclick
    // (built while the modal itself is still under construction) can close
    // whichever list modal ends up open by the time it's actually tapped.
    var m;
    function receiptRow(r, onNav) {
      var u = store.find("users", r.userId) || {};
      var st2 = store.warehouseReceiptStatus(r);
      var toneClass = st2.tone === "success" ? " pg-resi-row--success"
        : st2.tone === "warning" ? " pg-resi-row--warning"
        : st2.tone === "danger" ? " pg-resi-row--danger" : "";
      return h("button", { type: "button", class: "pg-resi-row" + toneClass,
        onclick: function () { if (onNav) onNav(); receiptDetail(r); } },
        h("div", { class: "pg-resi-row__main" },
          h("div", { class: "pg-resi-row__t", text: r.itemName }),
          h("div", { class: "pg-resi-row__d",
            text: ui.fmtDateShortID(r.date) + " · " + (u.fullName || "Karyawan tidak ditemukan") + " · " + r.supplier })),
        h("div", { class: "pg-resi-row__right" },
          h("div", { class: "pg-strong", text: moneyID(r.totalPrice) }),
          h("div", { style: { marginTop: "4px" } }, ui.badge(st2.label, st2.tone)))
      );
    }
    // Row renderer for the "Jatuh Tempo" drill-down: badges with the due-date
    // URGENCY tier (Segera Dibayar / Mendekati / Aman / Lewat) instead of the
    // usual Lunas/Belum Lunas status badge — mirrors the User App's tempoRow.
    function tempoRow(r, onNav) {
      var u = store.find("users", r.userId) || {};
      var urg = store.warehouseDueUrgency(r) || { label: "-", tone: "neutral" };
      var toneClass = urg.tone === "danger" ? " pg-resi-row--danger" : urg.tone === "warning" ? " pg-resi-row--warning" : "";
      return h("button", { type: "button", class: "pg-resi-row" + toneClass,
        onclick: function () { if (onNav) onNav(); receiptDetail(r); } },
        h("div", { class: "pg-resi-row__main" },
          h("div", { class: "pg-resi-row__t", text: r.itemName }),
          h("div", { class: "pg-resi-row__d",
            text: (u.fullName || "Karyawan tidak ditemukan") + " · " + r.supplier + " · Jatuh tempo " + ui.fmtDateWeekdayID(r.dueDate) })),
        h("div", { class: "pg-resi-row__right" },
          h("div", { class: "pg-strong", text: moneyID(r.totalPrice) }),
          h("div", { style: { marginTop: "4px" } }, ui.badge(urg.label, urg.tone)))
      );
    }
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
    // independent of paymentStatus (lunas but barang belum sampai, or
    // belum lunas but sudah diterima duluan, keduanya valid).
    function isReceived(r) { return !!r.receivedDate; }

    // "Total Lunas" card: two sections (Lunas / Belum Lunas), each with a
    // Sudah Diterima / Belum Diterima filter — mirrors the User App's own
    // nilaiModal. Rebuilds just the body in place so the filter toggle
    // doesn't reopen/flash the dialog.
    function nilaiModal(lunasList, belumList) {
      var filter = "semua"; // semua | diterima | belum
      function filtered(list) {
        if (filter === "diterima") return list.filter(isReceived);
        if (filter === "belum") return list.filter(function (r) { return !isReceived(r); });
        return list;
      }
      function emptyMsg(base) { return filter === "semua" ? base : "Tidak ada resi pada filter ini."; }
      function renderBody() {
        var fLunas = filtered(lunasList), fBelum = filtered(belumList);
        ui.clear(m.body);
        ui.append(m.body, [
          ui.pillTabs([
            { key: "semua", label: "Semua" },
            { key: "diterima", label: "Sudah Diterima" },
            { key: "belum", label: "Belum Diterima" }
          ], filter, function (k) { filter = k; renderBody(); }, true),
          h("div", { class: "pg-strong", style: { marginTop: "14px", marginBottom: "8px" },
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

    // "Total Keseluruhan" card: grouped by supplier (biggest spend first) so
    // an admin can see each supplier's running total across ALL employees at
    // a glance, with the underlying resi tucked away behind a tap. Mirrors
    // the User App's supplierGroupModal.
    function supplierGroupModal(title, list) {
      var groups = {}, order = [];
      list.forEach(function (r) {
        var key = (r.supplier || "").trim() || "Tanpa Supplier";
        if (!groups[key]) { groups[key] = []; order.push(key); }
        groups[key].push(r);
      });
      function supplierTotal(key) { return groups[key].reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0); }
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
      ui.clear(wrap);
      var all = store.allWarehouseReceipts();
      var q = state.q.trim().toLowerCase();
      var hasFilter = !!(state.from || state.to || state.month || q);
      var rows = all.filter(function (r) {
        if (state.from && r.date < state.from) return false;
        if (state.to && r.date > state.to) return false;
        if (state.month && String(r.date).slice(0, 7) !== state.month) return false;
        if (q) {
          var hay = (r.itemName + " " + r.supplier + " " + r.resiNo + " " + (r.payment || "") + " " + (r.shipping || "")).toLowerCase();
          if (hay.indexOf(q) < 0) return false;
        }
        return true;
      });

      // Same 6-metric breakdown as the User App's Resi Gudang cards (store.js
      // warehouseReceiptStatus / warehouseDueUrgency are the shared source of
      // truth for both), just laid out 3-up instead of 2-up. "Jatuh Tempo"
      // and "Non Tempo" together partition every belum-lunas row with no
      // overlap — one has a due date, the other doesn't have one at all yet.
      var totalValue = rows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var lunasRows = rows.filter(function (r) { return r.paymentStatus === "lunas"; });
      var belumLunasRows = rows.filter(function (r) { return r.paymentStatus !== "lunas"; });
      var klopRows = rows.filter(function (r) { return r.paymentStatus === "lunas" && r.goodsStatus === "klop"; });
      var minusRows = rows.filter(function (r) { return r.paymentStatus === "lunas" && r.goodsStatus === "minus"; });
      // Sorted most-urgent-first (overdue, then soonest due) — matches the
      // order the "Jatuh Tempo" drill-down modal lists them in.
      var tempoRows = rows
        .filter(function (r) { return store.warehouseDueUrgency(r) !== null; })
        .sort(function (a, b) { return store.warehouseDueUrgency(a).days - store.warehouseDueUrgency(b).days; });
      var nonTempoRows = rows.filter(function (r) { return r.paymentStatus !== "lunas" && !r.dueDate; });
      var totalLunasValue = lunasRows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var totalBelumLunasValue = belumLunasRows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var tempoValue = tempoRows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);
      var nonTempoValue = nonTempoRows.reduce(function (s, r) { return s + (r.totalPrice || 0); }, 0);

      var monthSet = {};
      all.forEach(function (r) { monthSet[String(r.date).slice(0, 7)] = 1; });
      var monthOpts = Object.keys(monthSet).sort().reverse().map(function (m) { return { value: m, label: monthLabel(m) }; });

      var searchEl = h("input", { class: "pg-input", type: "search", placeholder: "Cari barang / supplier / no resi…",
        value: state.q, autocomplete: "off", name: "flt_" + Math.random().toString(36).slice(2),
        onchange: function (e) { state.q = e.target.value; state.page = 1; render(); } });

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar pg-filterbar--fields" },
          dateField("Dari Tanggal", state.from, function (v) { setFilter(function () { state.from = v; }); }),
          dateField("Sampai Tanggal", state.to, function (v) { setFilter(function () { state.to = v; }); }),
          selPill("Bulan", state.month, "Semua Bulan", monthOpts,
            function (v) { setFilter(function () { state.month = v; }); }),
          h("div", { class: "pg-field", style: { gap: "2px", flex: "1 1 220px" } },
            h("label", { class: "pg-field__hint", text: "Cari" }), searchEl),
          hasFilter
            ? h("div", { class: "pg-field", style: { gap: "2px" } }, h("label", { class: "pg-field__hint", html: "&nbsp;" }),
                ui.button({ label: "Reset", variant: "ghost", size: "sm", onClick: function () {
                  state = { from: "", to: "", month: "", q: "", page: 1 }; render(); } }))
            : null
        )
      ));
      var rangeWarn = (state.from && state.to && state.from > state.to)
        ? ui.notice("Rentang tanggal tidak valid — \"Dari Tanggal\" melebihi \"Sampai Tanggal\".", { muted: true })
        : null;

      // 3-up, 2 baris (6 kartu) — sama seperti User App, hanya beda jumlah
      // kolom per baris. Grid ke-3 & ke-4 (Jatuh Tempo/Non Tempo) menampilkan
      // NILAI RUPIAH yang belum di-TF, bukan jumlah resi — jumlah resinya ada
      // di hint card ini + di judul modal drill-down ("... (N)") saat diklik.
      // Setiap kartu bisa diklik untuk membuka rinciannya, sama seperti di
      // User App (listModal/nilaiModal/supplierGroupModal di atas).
      var summary = h("div", { class: "pg-grid pg-grid--3" },
        ui.statCard({ icon: "wallet", label: "Total Keseluruhan", value: moneyID(totalValue),
          hint: numID(rows.length) + " resi" + (hasFilter ? " · sesuai filter" : ""),
          onClick: function () { supplierGroupModal("Total Keseluruhan", rows); } }),
        ui.statCard({ icon: "checkCircle", tone: "blue", label: "Total Lunas", value: moneyID(totalLunasValue),
          hint: h("span", { style: { color: "var(--pg-danger)", fontWeight: 700 }, text: "Belum Lunas " + moneyID(totalBelumLunasValue) }),
          onClick: function () { nilaiModal(lunasRows, belumLunasRows); } }),
        ui.statCard({ icon: "clock", tone: "danger", label: "Jatuh Tempo", value: moneyID(tempoValue),
          hint: numID(tempoRows.length) + " resi",
          onClick: function () { listModal("Jatuh Tempo", tempoRows, "Tidak ada resi dengan tanggal jatuh tempo.", tempoRow); } }),
        ui.statCard({ icon: "info", tone: "neutral", label: "Non Tempo", value: moneyID(nonTempoValue),
          hint: "(Belum Transfer) · " + numID(nonTempoRows.length) + " resi",
          onClick: function () { listModal("Non Tempo", nonTempoRows, "Tidak ada resi belum transfer tanpa tanggal jatuh tempo."); } }),
        ui.statCard({ icon: "checkCircle", tone: "green", label: "Lunas Klop", value: numID(klopRows.length),
          onClick: function () { listModal("Lunas Klop", klopRows, "Belum ada barang lunas & klop."); } }),
        ui.statCard({ icon: "info", tone: "yellow", label: "Lunas Minus", value: numID(minusRows.length),
          onClick: function () { listModal("Lunas Minus", minusRows, "Belum ada barang lunas & minus."); } })
      );

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var pageRows = rows.slice((state.page - 1) * PER_PAGE, (state.page - 1) * PER_PAGE + PER_PAGE);

      var body;
      if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "archive",
          title: all.length ? "Tidak ada catatan untuk filter ini." : "Belum ada data resi gudang.",
          text: all.length ? "Ubah atau reset filter." : "Data muncul setelah karyawan mencatat resi gudang di User App."
        }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Nama Barang", "Supplier", "No Resi", "Pcs", "Total Harga", "Ongkir",
            "Status", "Diterima", "Pembayaran", "Pengiriman", "Koli (Karung)", "Karyawan", "Aksi"],
          rows: pageRows.map(function (r) {
            var u = store.find("users", r.userId) || {};
            var st2 = store.warehouseReceiptStatus(r);
            function clip(s, n) { s = s || ""; return s.length > n ? s.slice(0, n) + "…" : s; }
            return {
              onClick: function () { receiptDetail(r); },
              cells: [
                ui.fmtDateShortID(r.date),
                h("span", { class: "pg-strong", title: r.itemName }, clip(r.itemName, 34)),
                h("span", { title: r.supplier }, clip(r.supplier, 24)),
                h("code", { text: r.resiNo || "—" }),
                numID(r.qty),
                h("span", { class: "pg-strong", text: moneyID(r.totalPrice) }),
                moneyID(r.shippingCost),
                ui.badge(st2.label, st2.tone),
                r.receivedDate ? ui.fmtDateShortID(r.receivedDate) : h("span", { class: "pg-muted", text: "—" }),
                clip(r.payment, 18) || h("span", { class: "pg-muted", text: "—" }),
                clip(r.shipping, 18) || h("span", { class: "pg-muted", text: "—" }),
                numID(r.koli),
                h("span", { title: "@" + (u.username || "—") }, u.fullName || "—"),
                h("div", { class: "pg-rowactions" },
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus data resi gudang",
                    onClick: function () { deleteReceipt(r); } }))
              ]
            };
          })
        });
      }

      var pagerNode = rows.length > PER_PAGE
        ? h("div", { style: { marginTop: "12px" } }, ui.pager({
            page: state.page, pageCount: pageCount,
            info: "Menampilkan " + ((state.page - 1) * PER_PAGE + 1) + "–" +
              Math.min(state.page * PER_PAGE, rows.length) + " dari " + rows.length,
            onPage: function (n) { state.page = n; render(); }
          }))
        : null;

      var tableCard = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-section-head", style: { marginBottom: "10px" } },
          h("div", { class: "pg-strong", text: "Daftar Resi Gudang" }),
          rows.length ? ui.button({ label: "Ekspor CSV", variant: "ghost", size: "sm", icon: "download",
            onClick: function () { exportCsv(rows); } }) : null),
        body, pagerNode));

      wrap.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar, rangeWarn, summary, tableCard));
    }

    render();
    ui.live(render, wrap);
    return page([pageHead("Work Management", "Laporan Resi Gudang"), wrap]);
  };

  /* ============================================================
     LAPORAN LEMBUR  (overtime — real data + approval, same source as User App)
     ============================================================ */
  pages.laporanLembur = function () {
    if (!PG.auth.can("overtime.report.view")) {
      return page([pageHead("Attendance", "Laporan Lembur"),
        ui.notice("Anda tidak memiliki akses ke laporan lembur.")]);
    }
    var PER_PAGE = 15;
    var state = { from: "", to: "", div: "", user: "", status: "", page: 1 };
    var wrap = h("div");
    var adminName = (PG.auth.currentAdmin() || {}).name || "Admin";

    function setFilter(fn) { fn(); state.page = 1; render(); }
    function armFilter(el) {
      var mark = function () { el._touched = true; };
      el.addEventListener("pointerdown", mark);
      el.addEventListener("keydown", mark);
      return el;
    }
    function selPill(label, value, blankLabel, options, onChange) {
      var sel = h("select", { class: "pg-select", autocomplete: "off",
        name: "flt_" + Math.random().toString(36).slice(2),
        onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(options).map(function (o) {
          return h("option", { value: o.value, text: o.label }); }));
      sel.value = value || "";
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(sel));
    }
    function dateField(label, value, onChange) {
      return h("div", { class: "pg-field", style: { gap: "2px" } },
        h("label", { class: "pg-field__hint", text: label }),
        armFilter(h("input", { class: "pg-input", type: "date", value: value || "", autocomplete: "off",
          name: "flt_" + Math.random().toString(36).slice(2),
          onchange: function (e) { if (e.currentTarget._touched) onChange(e.target.value); } })));
    }
    function fmtDateTime(iso) { return iso ? (ui.fmtDateWeekdayID(iso) + " " + ui.fmtTimeID(iso)) : "—"; }

    /* ---- detail + approval ---- */
    function otDetail(r) {
      var u = store.find("users", r.userId) || {};
      function photoBlock(title, at, src) {
        var b = src
          ? h("div", { class: "pg-attdetail__photo-body" },
              ui.photoImg(src, { alt: title, onclick: function () { ui.photoViewer(src, title + " — " + (u.fullName || "")); } }))
          : h("div", { class: "pg-attdetail__photo-body" },
              h("div", { class: "pg-attdetail__photo-empty" }, svg("user"),
                h("span", { text: at ? "Tanpa foto" : "Belum ada selfie" })));
        return h("div", { class: "pg-attdetail__photo" },
          h("div", { class: "pg-attdetail__photo-head" },
            h("span", { text: title }),
            h("span", { class: "pg-muted", style: { fontWeight: "400" }, text: at ? ui.fmtTimeID(at) : "—" })), b);
      }
      function kv(label, value) {
        return h("div", null, h("div", { class: "pg-field__hint", text: label }),
          value && value.nodeType ? value : h("div", { class: "pg-strong", text: value || "—" }));
      }

      var m = ui.modal({ title: "Detail Lembur", body: [], footer: [] });
      function paint(mode) {
        ui.clear(m.body);
        m.body.appendChild(h("div", { class: "pg-attdetail" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "12px" } },
            h("div", { class: "pg-avatar", style: { width: "44px", height: "44px", fontSize: "15px" }, text: ui.initials(u.fullName || "?") }),
            h("div", null,
              h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: u.fullName || "Karyawan tidak ditemukan" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + (u.username || "—") + " · " + ui.fmtDateWeekdayID(r.date) }))
          ),
          h("div", { class: "pg-attdetail__kv" },
            kv("Divisi", pgDivLabel(u)),
            kv("Status", h("div", null, ui.statusBadge(r.status))),
            kv("Durasi", !r.endAt
              ? (r.status === "kadaluarsa" ? "Kadaluarsa — tidak diselesaikan, tidak dihitung" : "Sedang berjalan")
              : ui.fmtDuration(store.overtimeDurationMs(r)) +
                (r.status === "disetujui" ? " · dihitung"
                  : r.status === "ditolak" ? " · ditolak, tidak dihitung"
                  : " · menunggu persetujuan")),
            kv(r.status === "ditolak" ? "Ditolak oleh" : "Persetujuan",
              r.approvedAt ? (r.approvedBy + " · " + fmtDateTime(r.approvedAt)) : "—")
          ),
          h("div", null, h("div", { class: "pg-field__hint", text: "Keterangan Lembur" }),
            h("div", { class: "pg-strong", text: r.description || "—" })),
          r.status === "ditolak" && r.rejectionReason
            ? ui.notice("Alasan penolakan: " + r.rejectionReason) : null,
          r.status === "kadaluarsa"
            ? ui.notice("Karyawan tidak menekan \"Selesai Lembur\" sebelum batas waktu (jam " +
                store.overtimeWindow().end + "). Lembur ini tidak dihitung.", { muted: true }) : null,
          r.status === "menunggu"
            ? ui.notice("Menunggu keputusan admin. Terima = lembur dihitung. Tolak = tetap tersimpan tapi tidak dihitung.", { muted: true })
            : null,
          h("div", { class: "pg-attdetail__photos" },
            photoBlock("Selfie Mulai Lembur", r.startAt, r.startPhoto),
            photoBlock("Selfie Selesai Lembur", r.endAt, r.endPhoto)
          ),
          ui.notice("Waktu & durasi dicatat oleh server. ID: " + r.id + " · Dibuat " + fmtDateTime(r.createdAt), { muted: true })
        ));

        var foot = m.el.querySelector(".pg-modal__footer");
        ui.clear(foot);
        if (r.status === "menunggu" && PG.auth.can("overtime.approve")) {
          foot.appendChild(ui.button({ label: "Tolak", variant: "danger", icon: "close",
            onClick: function () { confirmReject(r, function () { m.close(); }); } }));
          foot.appendChild(ui.button({ label: "Terima Lembur", variant: "primary", icon: "check", onClick: function () {
            store.approveOvertime(r.id, adminName).then(function (res) {
              if (!res.ok) { ui.toast(res.error, "danger"); return; }
              ui.toast("Lembur diterima dan dihitung.", "success"); m.close(); render();
            });
          } }));
        } else {
          foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
        }
      }
      paint("view");
    }

    /* ---- inline row actions (Terima / Tolak straight from the table) ---- */
    function inlineApprove(r) {
      ui.confirm({
        title: "Terima Lembur",
        message: "Terima lembur " + (store.find("users", r.userId) || {}).fullName + " tanggal " +
          ui.fmtDateWeekdayID(r.date) + " (" + ui.fmtDuration(store.overtimeDurationMs(r)) +
          ")? Sistem akan menginput lembur ini dan menghitung durasinya.",
        confirmLabel: "Terima", tone: "primary",
        onConfirm: function () {
          store.approveOvertime(r.id, adminName).then(function (res) {
            ui.toast(res.ok ? "Lembur diterima dan dihitung." : res.error, res.ok ? "success" : "danger");
            if (res.ok) render();
          });
        }
      });
    }
    // Reject a *pending* record -> status "ditolak" (kept, not counted). Optional reason.
    // `after` runs before the table re-renders.
    function confirmReject(r, after) {
      var u = store.find("users", r.userId) || {};
      var fReason = ui.field({ label: "Alasan penolakan (opsional)", type: "textarea",
        placeholder: "cth. Lembur tidak dikoordinasikan sebelumnya" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Tolak Lembur",
        body: [
          h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" },
            text: (u.fullName || "karyawan") + " · " + ui.fmtDateWeekdayID(r.date) + " (" +
              ui.fmtDuration(store.overtimeDurationMs(r)) + "). Data lembur tetap tersimpan " +
              "dengan status \"Ditolak\", namun jam kerjanya tidak dihitung." }),
          fReason, errEl
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Tolak Lembur", variant: "danger", onClick: function () {
            store.rejectOvertime(r.id, adminName, fReason._control.value).then(function (res) {
              if (!res.ok) { errEl.textContent = res.error; errEl.style.display = "block"; return; }
              ui.toast("Lembur ditolak. Jam lembur tidak dihitung.", "success");
              m.close();
              if (after) after();
              render();
            });
          } })
        ]
      });
    }
    // Housekeeping delete — removes ANY lembur record (any status), for the Aksi column.
    function deleteOvertime(r, after) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus Data Lembur", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus permanen data lembur " + (u.fullName || "karyawan") + " tanggal " +
          ui.fmtDateWeekdayID(r.date) + "? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.remove("overtimeRecords", r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus data lembur.", "danger"); return; }
            ui.toast("Data lembur dihapus.", "success");
            if (after) after();
            render();
          });
        }
      });
    }

    /* ---- render ---- */
    function render() {
      ui.clear(wrap);
      var rows = store.allOvertime().filter(function (r) {
        if (state.from && r.date < state.from) return false;
        if (state.to && r.date > state.to) return false;
        if (state.user && r.userId !== state.user) return false;
        var u = store.find("users", r.userId);
        if (state.div && (!u || store.userDivisionIds(u).indexOf(String(state.div)) < 0)) return false;
        if (state.status && r.status !== state.status) return false;
        return true;
      });
      var sum = store.summarizeOvertime(rows);
      var scopeHint = (state.from || state.to || state.div || state.user || state.status) ? "sesuai filter" : "semua data";

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar pg-filterbar--fields" },
          dateField("Dari Tanggal", state.from, function (v) { setFilter(function () { state.from = v; }); }),
          dateField("Sampai Tanggal", state.to, function (v) { setFilter(function () { state.to = v; }); }),
          selPill("Divisi", state.div, "Semua Divisi", store.all("divisions").map(function (d) { return { value: d.id, label: d.name }; }),
            function (v) { setFilter(function () { state.div = v; }); }),
          selPill("Karyawan", state.user, "Semua Karyawan", store.all("users").map(function (u) { return { value: u.id, label: u.fullName }; }),
            function (v) { setFilter(function () { state.user = v; }); }),
          selPill("Status", state.status, "Semua Status",
            [{ value: "berjalan", label: "Sedang Berjalan" }, { value: "menunggu", label: "Menunggu Persetujuan" },
             { value: "disetujui", label: "Disetujui (dihitung)" }, { value: "ditolak", label: "Ditolak" },
             { value: "kadaluarsa", label: "Kadaluarsa" }],
            function (v) { setFilter(function () { state.status = v; }); }),
          (state.from || state.to || state.div || state.user || state.status)
            ? h("div", { class: "pg-field", style: { gap: "2px" } }, h("label", { class: "pg-field__hint", html: "&nbsp;" }),
                ui.button({ label: "Reset", variant: "ghost", size: "sm", onClick: function () {
                  state = { from: "", to: "", div: "", user: "", status: "", page: 1 }; render(); } }))
            : null
        )
      ));
      var rangeWarn = (state.from && state.to && state.from > state.to)
        ? ui.notice("Rentang tanggal tidak valid — \"Dari Tanggal\" melebihi \"Sampai Tanggal\".", { muted: true })
        : null;

      var summary = h("div", { class: "pg-grid pg-grid--3" },
        ui.statCard({ icon: "briefcase", label: "Total Lembur", value: sum.total, hint: scopeHint }),
        ui.statCard({ icon: "clock", tone: "", label: "Sedang Berjalan", value: sum.berjalan }),
        ui.statCard({ icon: "info", tone: "yellow", label: "Menunggu Persetujuan", value: sum.menunggu }),
        ui.statCard({ icon: "checkCircle", tone: "green", label: "Disetujui", value: sum.disetujui }),
        ui.statCard({ icon: "close", tone: "", label: "Ditolak", value: sum.ditolak }),
        ui.statCard({ icon: "clock", tone: "", label: "Kadaluarsa", value: sum.kadaluarsa }),
        ui.statCard({ icon: "clock", tone: "green", label: "Total Durasi Dihitung", value: ui.fmtDuration(sum.durationMs), hint: "lembur disetujui" })
      );

      var pageCount = Math.max(1, Math.ceil(rows.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var startIdx = (state.page - 1) * PER_PAGE;
      var pageRows = rows.slice(startIdx, startIdx + PER_PAGE);

      var body;
      if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "briefcase",
          title: store.allOvertime().length ? "Tidak ada data untuk filter ini." : "Belum ada data lembur.",
          text: store.allOvertime().length ? "Ubah atau reset filter." : "Data muncul setelah karyawan mengajukan lembur di User App."
        }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Nama", "Username", "Divisi", "Jam Mulai", "Selfie Mulai", "Jam Selesai", "Selfie Selesai", "Durasi", "Status", "Aksi"],
          rows: pageRows.map(function (r) {
            var u = store.find("users", r.userId) || {};
            var who = (u.fullName || "—") + " · " + ui.fmtDateWeekdayID(r.date);
            return {
              onClick: function () { otDetail(r); },
              cells: [
                ui.fmtDateWeekdayID(r.date),
                h("span", { class: "pg-strong", text: u.fullName || "—" }),
                h("code", { text: u.username || "—" }),
                pgDivLabel(u),
                ui.fmtTimeID(r.startAt),
                ui.photoThumb(r.startPhoto, null, { title: "Selfie mulai — " + who, alt: "Selfie mulai" }),
                ui.fmtTimeID(r.endAt),
                ui.photoThumb(r.endPhoto, null, { title: "Selfie selesai — " + who, alt: "Selfie selesai" }),
                r.endAt ? ui.fmtDuration(store.overtimeDurationMs(r)) : "—",
                ui.statusBadge(r.status),
                h("div", { class: "pg-row-actions" }, [
                  (r.status === "menunggu" && PG.auth.can("overtime.approve"))
                    ? ui.button({ label: "Terima", icon: "check", variant: "primary", size: "sm",
                        onClick: function () { inlineApprove(r); } })
                    : null,
                  (r.status === "menunggu" && PG.auth.can("overtime.approve"))
                    ? ui.button({ label: "Tolak", icon: "close", variant: "danger", size: "sm",
                        onClick: function () { confirmReject(r); } })
                    : null,
                  (r.status !== "menunggu")
                    ? h("span", { class: "pg-muted", style: { fontSize: "12px", marginRight: "2px" },
                        text: r.status === "berjalan" ? "Sedang berjalan" :
                              r.status === "disetujui" ? "Dihitung" :
                              r.status === "ditolak" ? "Ditolak" :
                              r.status === "kadaluarsa" ? "Kadaluarsa" : "" })
                    : null,
                  ui.button({ icon: "trash", variant: "danger", size: "sm",
                    ariaLabel: "Hapus data lembur", title: "Hapus",
                    onClick: function () { deleteOvertime(r); } })
                ])
              ]
            };
          })
        });
      }

      var rangeHint = rows.length
        ? h("div", { class: "pg-muted", style: { fontSize: "13px" },
            text: "Menampilkan " + (startIdx + 1) + "–" + (startIdx + pageRows.length) + " dari " +
              rows.length + " rekap · klik baris untuk detail, foto & persetujuan." })
        : null;
      var pagerEl = ui.pager({ page: state.page, pageCount: pageCount,
        info: "Halaman " + state.page + " dari " + pageCount, onPage: function (n) { state.page = n; render(); } });

      wrap.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar, rangeWarn, summary, rangeHint, body, pagerEl));
    }

    render();
    ui.live(render, wrap);
    return page([pageHead("Attendance", "Laporan Lembur"), wrap]);
  };

  /* ============================================================
     MANAJEMEN ABSENSI  (system config — wired to store)
     ============================================================ */
  pages.manajemenAbsensi = function () {
    var state = { tab: "jam" };
    var TABS = [
      { key: "jam", label: "Jam Kerja" },
      { key: "lembur", label: "Jam Lembur" },
      { key: "hari", label: "Hari Kerja" },
      { key: "toleransi", label: "Toleransi & Pengaturan" },
      { key: "libur", label: "Hari Libur" }
    ];
    var DAYS = [
      { key: "mon", label: "Senin" }, { key: "tue", label: "Selasa" }, { key: "wed", label: "Rabu" },
      { key: "thu", label: "Kamis" }, { key: "fri", label: "Jumat" }, { key: "sat", label: "Sabtu" },
      { key: "sun", label: "Minggu" }
    ];
    var tabsHost = h("div", { class: "pg-underline-tabs" });
    var body = h("div", { style: { marginTop: "20px" } });

    function renderTabs() {
      ui.clear(tabsHost);
      TABS.forEach(function (t) {
        tabsHost.appendChild(h("button", {
          class: "pg-underline-tab" + (t.key === state.tab ? " is-active" : ""),
          text: t.label,
          onclick: function () { state.tab = t.key; renderTabs(); renderBody(); }
        }));
      });
    }

    function jamTab() {
      var s = store.getAttendanceSettings();
      var fIn = ui.field({ label: "Jam Masuk", type: "time", value: s.checkIn });
      var fOut = ui.field({ label: "Jam Pulang", type: "time", value: s.checkOut });
      return ui.card({ body: [
        h("h3", { text: "Pengaturan Jam Kerja", style: { fontSize: "16px", marginBottom: "4px" } }),
        h("div", { class: "pg-grid pg-grid--2", style: { alignItems: "start" } },
          h("div", { class: "pg-grid", style: { gap: "12px" } }, fIn, fOut),
          ui.notice("Pengaturan jam kerja berlaku untuk seluruh karyawan dan langsung dipakai oleh User App. \"Total Jam Kerja\" pada laporan dihitung HANYA dalam rentang ini — absen pulang di atas jam pulang tidak menambah jam kerja (dicatat lewat fitur Lembur).")
        ),
        h("div", { class: "pg-hours-preview", style: { border: "1px solid var(--pg-border)", borderRadius: "14px", marginTop: "8px" } },
          h("div", null, h("div", { class: "pg-hours-preview__cap", text: s.checkIn }),
            h("div", { class: "pg-hours-preview__sub", text: "Jam Masuk" })),
          h("span", { class: "pg-hours-preview__dot" }),
          h("div", { class: "pg-hours-preview__track" }),
          h("span", { class: "pg-hours-preview__dot" }),
          h("div", { style: { textAlign: "right" } }, h("div", { class: "pg-hours-preview__cap", text: s.checkOut }),
            h("div", { class: "pg-hours-preview__sub", text: "Jam Pulang" }))
        ),
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Simpan Perubahan", variant: "accent", onClick: function () {
            store.saveAttendanceSettings({
              checkIn: fIn._control.value || s.checkIn,
              checkOut: fOut._control.value || s.checkOut
            }).then(function (res) {
              if (res && res.ok === false) { ui.toast(res.error || "Gagal menyimpan jam kerja.", "danger"); return; }
              ui.toast("Jam kerja tersimpan.", "success");
              renderBody();
            });
          } })
        )
      ]});
    }

    function lemburTab() {
      var s = store.getAttendanceSettings();
      var fStart = ui.field({ label: "Lembur Mulai", type: "time", value: s.overtimeStart || "17:00" });
      var fEnd = ui.field({ label: "Lembur Selesai", type: "time", value: s.overtimeEnd || "23:59" });
      return ui.card({ body: [
        h("h3", { text: "Setting Jam Lembur", style: { fontSize: "16px", marginBottom: "4px" } }),
        h("div", { class: "pg-grid pg-grid--2", style: { alignItems: "start" } },
          h("div", { class: "pg-grid", style: { gap: "12px" } }, fStart, fEnd),
          ui.notice("Karyawan hanya dapat MULAI lembur di dalam rentang jam ini. Di luar jam tersebut tombol \"Ajukan Lembur\" di User App nonaktif. Karyawan tetap bisa memulai lembur tanpa menunggu persetujuan admin — namun lembur baru dihitung setelah admin menekan \"Setujui\".")
        ),
        h("div", { class: "pg-hours-preview", style: { border: "1px solid var(--pg-border)", borderRadius: "14px", marginTop: "8px" } },
          h("div", null, h("div", { class: "pg-hours-preview__cap", text: s.overtimeStart || "17:00" }),
            h("div", { class: "pg-hours-preview__sub", text: "Lembur Mulai" })),
          h("span", { class: "pg-hours-preview__dot" }),
          h("div", { class: "pg-hours-preview__track" }),
          h("span", { class: "pg-hours-preview__dot" }),
          h("div", { style: { textAlign: "right" } }, h("div", { class: "pg-hours-preview__cap", text: s.overtimeEnd || "23:59" }),
            h("div", { class: "pg-hours-preview__sub", text: "Lembur Selesai" }))
        ),
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Simpan Perubahan", variant: "accent", onClick: function () {
            var st = fStart._control.value || s.overtimeStart || "17:00";
            var en = fEnd._control.value || s.overtimeEnd || "23:59";
            if (st === en) { ui.toast("Jam mulai dan selesai lembur tidak boleh sama.", "danger"); return; }
            store.saveAttendanceSettings({ overtimeStart: st, overtimeEnd: en }).then(function (res) {
              if (res && res.ok === false) { ui.toast(res.error || "Gagal menyimpan jam lembur.", "danger"); return; }
              ui.toast("Jam lembur tersimpan.", "success");
              renderBody();
            });
          } })
        )
      ]});
    }

    function hariTab() {
      var s = store.getAttendanceSettings();
      var checks = DAYS.map(function (d) {
        var cb = h("input", { type: "checkbox", checked: s.workDays.indexOf(d.key) >= 0 });
        cb._day = d.key;
        return h("label", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 12px",
          border: "1px solid var(--pg-border)", borderRadius: "10px" } }, cb, d.label);
      });
      return ui.card({ body: [
        h("h3", { text: "Hari Kerja", style: { fontSize: "16px" } }),
        h("p", { class: "pg-muted", style: { fontSize: "13px" }, text: "Tentukan hari kerja aktif untuk perhitungan absensi." }),
        h("div", { class: "pg-grid pg-grid--4" }, checks),
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Simpan Perubahan", variant: "accent", onClick: function () {
            var picked = checks.map(function (l) { return l.querySelector("input"); })
              .filter(function (i) { return i.checked; }).map(function (i) { return i._day; });
            store.saveAttendanceSettings({ workDays: picked }).then(function (res) {
              if (res && res.ok === false) { ui.toast(res.error || "Gagal menyimpan hari kerja.", "danger"); return; }
              ui.toast("Hari kerja tersimpan.", "success");
              renderBody();
            });
          } })
        )
      ]});
    }

    function toleransiTab() {
      var s = store.getAttendanceSettings();
      var fTol = ui.field({ label: "Toleransi Keterlambatan (menit)", type: "number", value: s.lateToleranceMin });
      return ui.card({ body: [
        h("h3", { text: "Toleransi & Pengaturan", style: { fontSize: "16px" } }),
        h("div", { class: "pg-grid pg-grid--2" }, fTol,
          ui.field({ label: "Metode Absensi", type: "select", disabled: true,
            options: [{ value: "self", label: "Self check-in (mobile)" }] })),
        ui.notice("Nilai toleransi ini ditampilkan di halaman Absensi User App.", { muted: true }),
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Simpan Perubahan", variant: "accent", onClick: function () {
            var v = parseInt(fTol._control.value, 10);
            store.saveAttendanceSettings({ lateToleranceMin: isNaN(v) ? s.lateToleranceMin : v }).then(function (res) {
              if (res && res.ok === false) { ui.toast(res.error || "Gagal menyimpan toleransi.", "danger"); return; }
              ui.toast("Pengaturan toleransi tersimpan.", "success");
              renderBody();
            });
          } })
        )
      ]});
    }

    function holidayForm() {
      var fDate = ui.field({ label: "Tanggal", type: "date" });
      var fLabel = ui.field({ label: "Keterangan", placeholder: "cth. Hari Kemerdekaan RI" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Tambah Hari Libur",
        body: [fDate, fLabel, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Tambah", variant: "primary", onClick: function () {
            var d = fDate._control.value;
            if (!d) { errEl.textContent = "Tanggal wajib diisi."; errEl.style.display = "block"; return; }
            return store.addHoliday(d, fLabel._control.value).then(function (res) {
              if (res && res.ok === false) { errEl.textContent = res.error || "Gagal menambah hari libur."; errEl.style.display = "block"; return; }
              ui.toast("Hari libur ditambahkan.", "success");
              m.close(); renderBody();
            });
          } })
        ]
      });
    }

    function liburTab() {
      var holidays = store.listHolidays();
      var head = h("div", { class: "pg-section-head" },
        h("div", null,
          h("h3", { text: "Hari Libur", style: { fontSize: "16px" } }),
          h("p", { class: "pg-muted", style: { fontSize: "13px" },
            text: "Tanggal ini tidak dihitung sebagai hari kerja pada Laporan Absensi." })),
        ui.button({ label: "Tambah Hari Libur", variant: "accent", icon: "plus", onClick: holidayForm })
      );
      var content = !holidays.length
        ? h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "calendar",
            title: "Belum ada hari libur terdaftar.",
            text: "Tambahkan tanggal libur nasional atau cuti bersama.",
            action: ui.button({ label: "Tambah Hari Libur", variant: "accent", icon: "plus", onClick: holidayForm }) }))
        : ui.table({
            columns: ["Tanggal", "Keterangan", "Aksi"],
            rows: holidays.map(function (hd) {
              return [
                h("span", { class: "pg-strong", text: ui.fmtDateShortID(hd.date) }),
                hd.label || "—",
                ui.button({ label: "Hapus", icon: "trash", variant: "danger", size: "sm",
                  onClick: function () {
                    ui.confirm({
                      title: "Hapus hari libur", tone: "danger", confirmLabel: "Hapus",
                      message: "Hapus " + ui.fmtDateShortID(hd.date) + " (" + (hd.label || "Hari Libur") + ") dari daftar hari libur?",
                      onConfirm: function () { store.removeHoliday(hd.date).then(function (res) {
                        if (res && res.ok === false) { ui.toast(res.error || "Gagal menghapus hari libur.", "danger"); return; }
                        ui.toast("Hari libur dihapus.", "success"); renderBody();
                      }); }
                    });
                  } })
              ];
            })
          });
      return h("div", { class: "pg-grid", style: { gap: "16px" } }, head, content);
    }

    function renderBody() {
      var map = { jam: jamTab, lembur: lemburTab, hari: hariTab, toleransi: toleransiTab, libur: liburTab };
      ui.mount(body, (map[state.tab] || jamTab)());
    }

    renderTabs(); renderBody();
    return page([
      pageHead("Attendance", "Manajemen Absensi"),
      h("div", { class: "pg-card", style: { padding: "4px 20px" } }, tabsHost),
      body
    ]);
  };

  /* ============================================================
     LAPORAN KPI  (Phase 6 — laporan KPI yang dikirim karyawan)
     ============================================================ */
  pages.laporanKpi = function () {
    if (!PG.auth.can("kpi.report.view")) {
      return page([pageHead("Performance", "Laporan KPI"),
        ui.notice("Anda tidak memiliki akses untuk melihat Laporan KPI.")]);
    }
    var state = { divisionId: "", templateId: "", storeId: "", status: "", loading: false, data: null };
    var host = h("div");
    function pct(v) { return v == null ? "—" : (Math.round(v * 10) / 10) + "%"; }
    function statusBadge(s) {
      return s === "reviewed" ? ui.badge("Direview", "success")
        : s === "submitted" ? ui.badge("Terkirim", "info")
        : ui.badge("Draft", "neutral");
    }

    function load() {
      state.loading = true; render();
      store.kpiReports({ divisionId: state.divisionId, templateId: state.templateId, storeId: state.storeId, status: state.status })
        .then(function (d) { state.data = d && d.ok !== false ? d : null; state.loading = false; render(); })
        .catch(function () { state.data = null; state.loading = false; render(); });
    }

    function dateRange(r) {
      if (r.periodStart && r.periodEnd) return ui.fmtDateShortID(r.periodStart) + " – " + ui.fmtDateShortID(r.periodEnd);
      if (r.periodStart) return "mulai " + ui.fmtDateShortID(r.periodStart);
      return r.periodLabel || "—";
    }
    function moneyID(n) { return "Rp " + (Math.round(n || 0)).toLocaleString("id-ID"); }

    /* ---------- A4 print / PDF of a single report ---------- */
    function printReport(r, items) {
      var old = document.getElementById("pg-print-root");
      if (old) old.remove();

      function mcell(k, v, big) {
        return h("div", null, h("div", { class: "k", text: k }),
          h("div", { class: big ? "v v--big" : "v", text: v }));
      }
      var showWeight = r.scoreMethod !== "weighted_sum";
      function prow(it, isSub) {
        var money = it.isMoney;
        var tgt = it.computedTarget != null ? it.computedTarget : it.target;
        return h("tr", { class: isSub ? "is-sub" : "" },
          h("td", { text: (isSub ? "↳ " : "") + it.label + (it.isOptional ? " (opsional)" : "") }),
          h("td", { class: "num", text: money ? moneyID(it.actual || 0) : String(it.actual != null ? it.actual : 0) }),
          h("td", { class: "num", text: money ? moneyID(tgt || 0) : String(tgt || 0) }),
          h("td", { class: "num", text: it.pct == null ? "—" : pct(it.pct) }),
          showWeight ? h("td", { class: "num", text: it.weight != null ? pct(it.weight) : "—" }) : null);
      }
      var bodyRows = [];
      (items || []).forEach(function (it) {
        bodyRows.push(prow(it, false));
        (it.children || []).forEach(function (c) { bodyRows.push(prow(c, true)); });
      });
      bodyRows.push(h("tr", { class: "is-total" },
        h("td", { text: "TOTAL SKOR KPI" }), h("td", null, ""), h("td", null, ""),
        h("td", { class: "num", text: pct(r.totalPct) }),
        showWeight ? h("td", null, "") : null));

      var root = h("div", { id: "pg-print-root" },
        h("div", { class: "pg-print" },
          h("div", { class: "pg-print__head" },
            h("div", { class: "pg-print__brand" }, "PREMIERE", h("small", { text: "GROUP" })),
            h("div", { class: "pg-print__title" },
              h("b", { text: "Laporan KPI" }),
              h("span", { text: r.templateName || "" }),
              h("span", { text: "Dicetak " + ui.todayLongID() }))),
          h("div", { class: "pg-print__meta" },
            mcell("Nama Toko", r.subject || "—"),
            mcell("Pekan", r.weekNo ? ("Pekan " + r.weekNo) : "—"),
            mcell("Periode", dateRange(r)),
            mcell("Total Skor", pct(r.totalPct), true)),
          h("div", { style: { marginBottom: "10px", fontSize: "11px", color: "#555" },
            text: "Karyawan: " + (r.userName || "—") + "  ·  Divisi: " + (r.divisionName || "—") +
              "  ·  Status: " + (r.status === "reviewed" ? "Direview" : "Terkirim") +
              (r.submittedAt ? "  ·  Dikirim " + ui.fmtDateShortID(r.submittedAt) : "") }),
          h("table", null,
            h("thead", null, h("tr", null,
              h("th", { text: "Indikator" }), h("th", { class: "num", text: "Aktual" }),
              h("th", { class: "num", text: "Target" }), h("th", { class: "num", text: "%" }),
              showWeight ? h("th", { class: "num", text: "Bobot" }) : null)),
            h("tbody", null, bodyRows)),
          r.note ? h("div", { class: "pg-print__note" }, h("b", { text: "Catatan" }), h("div", { text: r.note })) : null,
          h("div", { class: "pg-print__foot" },
            h("span", { text: "premieregroup.my.id" }),
            h("span", { text: "Dokumen dihasilkan otomatis oleh sistem Premiere Group." }))));

      document.body.appendChild(root);
      function cleanup() { root.remove(); window.removeEventListener("afterprint", cleanup); }
      window.addEventListener("afterprint", cleanup);
      setTimeout(function () { window.print(); }, 60);
    }

    function reportDetail(id) {
      var m = ui.modal({ class: "pg-modal--kpidetail", title: "Memuat laporan…", body: [ui.emptyState({ icon: "chart", title: "Memuat…" })], footer: [] });
      store.kpiReport(id).then(function (d) {
        if (!d || d.ok === false) { m.close(); ui.toast((d && d.error) || "Gagal memuat.", "danger"); return; }
        var r = d.report;
        r.scoreMethod = d.scoreMethod;
        var showWeight = d.scoreMethod !== "weighted_sum";
        ui.clear(m.body); ui.clear(m.el.querySelector(".pg-modal__footer"));
        m.el.querySelector(".pg-modal__title").textContent = r.templateName;

        function itemLine(it, isSub) {
          var money = it.isMoney;
          return h("div", { class: "pg-kpi-read__row" + (isSub ? " is-sub" : "") },
            h("div", { class: "pg-kpi-read__label" }, isSub ? "↳ " : "", it.label,
              it.isOptional ? h("span", { class: "pg-badge pg-badge--neutral", style: { marginLeft: "6px" }, text: "Opsional" }) : null,
              showWeight && it.weight != null ? h("span", { class: "pg-badge pg-badge--neutral", style: { marginLeft: "6px" }, text: "Bobot " + pct(it.weight) }) : null),
            h("div", { class: "pg-kpi-read__nums" },
              money
                ? moneyID(it.actual) + " / " + moneyID(it.computedTarget != null ? it.computedTarget : it.target)
                : (it.actual != null ? it.actual : 0) + " / " + (it.computedTarget != null ? it.computedTarget : it.target)),
            h("span", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums" }, text: it.pct == null ? "—" : pct(it.pct) }),
            it.valueNote ? h("div", { class: "pg-kpi-read__note", text: it.valueNote }) : null
          );
        }
        var rows = [];
        (d.items || []).forEach(function (it) {
          rows.push(itemLine(it, false));
          (it.children || []).forEach(function (c) { rows.push(itemLine(c, true)); });
        });

        function hcell(label, value, big) {
          return h("div", { class: "pg-kpi-rhead__cell" },
            h("div", { class: "pg-kpi-rhead__k", text: label }),
            h("div", { class: big ? "pg-kpi-rhead__v pg-kpi-rhead__v--big" : "pg-kpi-rhead__v", text: value }));
        }

        ui.append(m.body, [
          h("div", { class: "pg-kpi-rhead" },
            hcell("Nama Toko", r.subject || "—"),
            hcell("Pekan", r.weekNo ? ("Pekan " + r.weekNo) : "—"),
            hcell("Periode", dateRange(r)),
            hcell("Total Skor KPI", pct(r.totalPct), true)),
          h("div", { style: { display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" } },
            statusBadge(r.status),
            h("span", { class: "pg-muted", style: { fontSize: "12.5px" },
              text: r.userName + " · " + (r.divisionName || "—") + (r.submittedAt ? " · dikirim " + ui.fmtDateShortID(r.submittedAt) : "") })),
          h("div", { class: "pg-kpi-read" }, rows),
          r.note ? h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"), h("div", { text: r.note })) : null
        ]);
        var foot = m.el.querySelector(".pg-modal__footer");
        foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
        foot.appendChild(ui.button({ label: "Cetak", variant: "ghost", icon: "printer",
          onClick: function () { printReport(r, d.items); } }));
        foot.appendChild(ui.button({ label: "Unduh PDF (A4)", variant: "ghost", icon: "download",
          onClick: function () {
            ui.toast("Pada dialog cetak, pilih tujuan \"Simpan sebagai PDF\".", "info");
            printReport(r, d.items);
          } }));
        foot.appendChild(ui.button({
          label: r.status === "reviewed" ? "Batalkan Review" : "Tandai Direview",
          variant: r.status === "reviewed" ? "ghost" : "primary", icon: "check",
          onClick: function () {
            store.kpiReportReview(id).then(function (res) {
              if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
              ui.toast("Status diperbarui.", "success"); m.close(); load();
            });
          }
        }));
      }).catch(function () { m.close(); ui.toast("Gagal memuat laporan.", "danger"); });
    }

    function deleteReport(r) {
      ui.confirm({
        title: "Hapus Laporan KPI",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus laporan KPI \"" + (r.subject || r.templateName) + "\" milik " + (r.userName || "karyawan") +
          "? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.kpiReportDelete(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus laporan.", "danger"); return; }
            ui.toast("Laporan KPI dihapus.", "success");
            load();
          });
        }
      });
    }

    function periodShort(ym) {
      if (!ym || ym.indexOf("-") < 0) return ym || "";
      var p = ym.split("-");
      var mo = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
      return (mo[(+p[1] || 1) - 1] || p[1]) + " " + p[0].slice(2);
    }
    function analyticsGrid(d) {
      var a = d && d.analytics;
      if (!a) return null;
      if (!((a.byStore && a.byStore.length) || (a.byDivision && a.byDivision.length) ||
            (a.byPeriod && a.byPeriod.length) || (a.byWeek && a.byWeek.length))) return null;

      function panel(title, node) {
        return h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
          h("div", { class: "pg-kpi-analytics__head", text: title }),
          h("div", { class: "pg-kpi-analytics__body" }, node)));
      }
      var storeChart = ui.barChartH((a.byStore || []).slice(0, 8).map(function (x) {
        return { name: x.name, value: x.avgPct, note: "· " + x.count + " lap." };
      }), { band: true, max: 100, emptyTitle: "Belum ada laporan toko" });
      var divChart = ui.barChartH((a.byDivision || []).map(function (x) {
        return { name: x.name, value: x.avgPct, note: "· " + x.count + " lap." };
      }), { band: true, max: 100, emptyTitle: "Belum ada laporan divisi" });
      var periodChart = ui.lineChart((a.byPeriod || []).map(function (x) {
        return { label: periodShort(x.period), value: x.avgPct };
      }), { max: 100, emptyMsg: "Tren muncul setelah ada laporan pada beberapa bulan." });
      var weekChart = ui.barChartV((a.byWeek || []).map(function (x) {
        return { name: "Pekan " + x.week, value: x.avgPct, note: x.count + " laporan" };
      }), { band: true, max: 100, emptyTitle: "Belum ada laporan dengan nomor pekan" });

      return h("div", { class: "pg-kpi-analytics" },
        panel("Perbandingan Antar Toko — rata-rata pencapaian", storeChart),
        panel("Perbandingan Antar Divisi — rata-rata pencapaian", divChart),
        panel("Tren Skor per Periode (bulan)", periodChart),
        panel("Perbandingan Antar Pekan — rata-rata pencapaian", weekChart));
    }

    function render() {
      ui.clear(host);
      var d = state.data;
      var templates = (d && d.templates) || [];

      var storeOpts = (d && d.stores) || store.all("stores");
      var tbBody = h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          h("select", { class: "pg-select", onchange: function (e) { state.storeId = e.target.value; load(); } },
            [{ value: "", label: "Semua Toko" }].concat(storeOpts.map(function (x) { return { value: x.id, label: x.name + (x.status === "inactive" ? " (nonaktif)" : "") }; }))
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(state.storeId) }); })),
          h("select", { class: "pg-select", onchange: function (e) { state.divisionId = e.target.value; load(); } },
            [{ value: "", label: "Semua Divisi" }].concat(store.all("divisions").map(function (x) { return { value: x.id, label: x.name }; }))
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(state.divisionId) }); })),
          h("select", { class: "pg-select", onchange: function (e) { state.templateId = e.target.value; load(); } },
            [{ value: "", label: "Semua Template" }].concat(templates.map(function (t) { return { value: t.id, label: t.name }; }))
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(state.templateId) }); })),
          h("select", { class: "pg-select", onchange: function (e) { state.status = e.target.value; load(); } },
            [{ value: "", label: "Semua Status" }, { value: "submitted", label: "Terkirim" }, { value: "reviewed", label: "Direview" }]
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: o.value === state.status }); }))
        )
      );
      if (d) {
        function statCell(icon, tone, label, value) {
          return h("div", { class: "pg-kpi-fstat" },
            h("div", { class: "pg-kpi-fstat__ic" + (tone ? " pg-kpi-fstat__ic--" + tone : "") }, svg(icon)),
            h("div", { style: { minWidth: 0 } },
              h("div", { class: "pg-kpi-fstat__v", text: value != null ? String(value) : "—" }),
              h("div", { class: "pg-kpi-fstat__l", text: label })));
        }
        tbBody.appendChild(h("div", { class: "pg-kpi-fstats" },
          statCell("chart", null, "Laporan masuk", d.summary.total),
          statCell("target", "blue", "Rata-rata pencapaian", pct(d.summary.avgPct)),
          statCell("checkCircle", "green", "Sudah direview", d.summary.reviewed)));
      }
      var toolbar = h("div", { class: "pg-card" }, tbBody);

      if (state.loading && !d) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "chart", title: "Memuat Laporan KPI…" }))));
        return;
      }
      if (!d) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "chart", title: "Gagal memuat.", text: "Coba muat ulang halaman." }))));
        return;
      }

      var body;
      if (!d.reports.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "chart", title: "Belum ada laporan KPI masuk.",
          text: templates.length
            ? "Laporan yang dikirim karyawan lewat menu Lapor KPI akan tampil di sini."
            : "Buat dulu template KPI di menu Setting KPI agar karyawan bisa melapor.",
          action: templates.length ? null : ui.button({ label: "Ke Setting KPI", variant: "accent", icon: "target",
            onClick: function () { PG._router.go("/setting-kpi"); } })
        }));
      } else {
        body = ui.table({
          columns: ["Nama Toko", "Karyawan", "Divisi", "Template", "Pekan", "Periode", "Total Skor", "Status", "Aksi"],
          rows: d.reports.map(function (r) {
            return {
              onClick: function () { reportDetail(r.id); },
              cells: [
                h("span", { class: "pg-strong", text: r.subject || "—" }),
                r.userName,
                r.divisionName || "—",
                r.templateName || "—",
                r.weekNo ? ("Pekan " + r.weekNo) : "—",
                dateRange(r),
                h("div", { style: { minWidth: "130px", display: "flex", alignItems: "center", gap: "10px" } },
                  h("span", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums", minWidth: "46px" }, text: pct(r.totalPct) }),
                  h("div", { style: { flex: "1" } }, ui.progressBar(Math.min(r.totalPct || 0, 100)))),
                statusBadge(r.status),
                h("div", { class: "pg-row-actions" },
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus laporan", title: "Hapus laporan",
                    onClick: function () { deleteReport(r); } }))
              ]
            };
          })
        });
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar,
        analyticsGrid(d),
        h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Klik baris untuk membuka rincian laporan." }),
        body));
    }

    load();
    ui.live(load, host);
    return page([pageHead("Performance", "Laporan KPI"), host]);
  };

  /* ============================================================
     SETTING KPI  (Phase 6 — indikator kinerja + sumber data)
     ============================================================ */
  pages.settingKpi = function () {
    if (!PG.auth.can("kpi.settings.edit")) {
      return page([pageHead("Performance", "Setting KPI"),
        ui.notice("Anda tidak memiliki akses untuk mengatur KPI.")]);
    }
    var host = h("div");
    var state = { view: "list", tpl: null };
    var listData = null;

    var PERIOD_OPTS = [{ value: "monthly", label: "Bulanan" }, { value: "weekly", label: "Mingguan" }];
    var METHOD_OPTS = [
      { value: "percent_avg", label: "Rata-rata persen indikator (tiap indikator utama bobot sama)" },
      { value: "weighted_sum", label: "Jumlah skor — Σ aktual ÷ Σ target (cocok untuk penilaian skor maks)" }
    ];
    var STATUS_OPTS = [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }];
    function fmtNum(n) { return (Math.round((n || 0) * 100) / 100).toLocaleString("id-ID"); }
    function fmtVal(n, it) { return (it && it.isMoney ? "Rp " : "") + fmtNum(n); }
    function checkRow(input, label) {
      return h("label", { style: { display: "flex", alignItems: "center", gap: "8px", fontSize: "13px" } },
        input, h("span", { text: label }));
    }

    /* ---------- template meta form ---------- */
    function templateForm(existing) {
      var fName = ui.field({ label: "Nama template KPI", placeholder: "cth. KPI Marketing Mingguan",
        required: true, value: existing ? existing.name : "" });
      var fDiv = ui.field({ label: "Divisi", type: "select", options: selectOptions("divisions", "— Semua divisi —"),
        value: existing ? (existing.divisionId || "") : "" });
      var fPeriod = ui.field({ label: "Periode laporan", type: "select", options: PERIOD_OPTS,
        value: existing ? existing.periodType : "monthly" });
      var fMethod = ui.field({ label: "Metode total skor", type: "select", options: METHOD_OPTS,
        value: existing ? existing.scoreMethod : "percent_avg" });
      var fDesc = ui.field({ label: "Deskripsi (opsional)", type: "textarea",
        value: existing ? (existing.description || "") : "" });
      var fStatus = ui.field({ label: "Status", type: "select", options: STATUS_OPTS,
        value: existing ? existing.status : "active" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      var m = ui.modal({
        title: existing ? "Edit Info Template" : "Buat Template KPI",
        body: [fName, h("div", { class: "pg-grid pg-grid--2" }, fDiv, fPeriod), fMethod, fDesc, fStatus, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Buat", variant: "primary", onClick: function () {
            var name = fName._control.value.trim();
            if (!name) { errEl.textContent = "Nama template wajib diisi."; errEl.style.display = "block"; return; }
            var payload = {
              name: name, divisionId: fDiv._control.value || null,
              periodType: fPeriod._control.value, scoreMethod: fMethod._control.value,
              description: fDesc._control.value.trim(), status: fStatus._control.value
            };
            var op = existing ? store.kpiTemplateUpdate(existing.id, payload) : store.kpiTemplateCreate(payload);
            return op.then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
              ui.toast(existing ? "Template diperbarui." : "Template dibuat.", "success");
              m.close();
              openBuilder(existing ? existing.id : res.record.id);
            });
          } })
        ]
      });
    }

    /* ---------- indicator item form ---------- */
    function itemForm(templateId, parentId, existing) {
      var fLabel = ui.field({ label: "Nama indikator", required: true,
        placeholder: parentId ? "cth. Story Facebook" : "cth. Total Post Konten",
        value: existing ? existing.label : "" });
      var fTarget = ui.field({ label: "Target", type: "number", placeholder: "cth. 30",
        value: existing ? existing.target : "" });
      var fType = ui.field({ label: "Format nilai", type: "select",
        options: [{ value: "number", label: "Angka biasa" }, { value: "money", label: "Nilai uang (Rp)" }],
        value: existing ? (existing.valueType || "number") : "number" });
      var grp = "kpireq-" + Math.random().toString(36).slice(2, 8);
      var rReq = h("input", { type: "radio", name: grp, checked: !(existing && existing.isOptional) });
      var rOpt = h("input", { type: "radio", name: grp, checked: !!(existing && existing.isOptional) });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      var m = ui.modal({
        title: (existing ? "Edit " : "Tambah ") + (parentId ? "Sub-indikator" : "Indikator"),
        body: [
          fLabel,
          h("div", { class: "pg-grid pg-grid--2" }, fTarget, fType),
          h("div", { class: "pg-field" },
            h("label", { class: "pg-field__label", text: "Jenis penilaian" }),
            h("div", { style: { display: "flex", gap: "18px" } },
              checkRow(rReq, "Wajib"),
              checkRow(rOpt, "Opsional (tidak masuk total skor)"))),
          errEl
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Tambah", variant: "primary", onClick: function () {
            var label = fLabel._control.value.trim();
            if (!label) { errEl.textContent = "Nama indikator wajib diisi."; errEl.style.display = "block"; return; }
            var payload = {
              label: label, target: parseFloat(fTarget._control.value) || 0,
              valueType: fType._control.value || "number",
              isOptional: rOpt.checked
            };
            if (!existing) payload.parentId = parentId || null;
            var op = existing ? store.kpiItemUpdate(existing.id, payload) : store.kpiItemCreate(templateId, payload);
            return op.then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
              m.close(); openBuilder(templateId);
            });
          } })
        ]
      });
    }

    function delItem(templateId, it) {
      ui.confirm({ title: "Hapus Indikator", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus \"" + it.label + "\"" + (it.children && it.children.length ? " beserta " + it.children.length + " sub-indikatornya" : "") + "?",
        onConfirm: function () {
          store.kpiItemDelete(it.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
            openBuilder(templateId);
          });
        }
      });
    }

    function move(templateId, siblings, idx, dir) {
      var j = idx + dir;
      if (j < 0 || j >= siblings.length) return;
      var ids = siblings.map(function (s) { return s.id; });
      var tmp = ids[idx]; ids[idx] = ids[j]; ids[j] = tmp;
      store.kpiItemsReorder(templateId, ids).then(function () { openBuilder(templateId); });
    }

    /* ---------- data loading ---------- */
    function loadList() {
      listData = null; render();
      store.kpiTemplates().then(function (d) { listData = d && d.ok !== false ? d : { templates: [] }; render(); })
        .catch(function () { listData = { templates: [] }; render(); });
    }
    function openBuilder(id) {
      state.view = "build"; state.tpl = null; render();
      store.kpiTemplate(id).then(function (d) {
        if (!d || d.ok === false) { ui.toast((d && d.error) || "Gagal memuat template.", "danger"); state.view = "list"; loadList(); return; }
        state.tpl = d; render();
      });
    }

    /* ---------- render : list ---------- */
    function renderList() {
      ui.clear(host);
      var head = h("div", { style: { display: "flex", justifyContent: "flex-end" } },
        ui.button({ label: "Buat Template KPI", variant: "accent", icon: "plus", onClick: function () { templateForm(); } }));
      if (!listData) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, head,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "target", title: "Memuat template KPI…" }))));
        return;
      }
      var tpls = listData.templates || [];
      if (!tpls.length) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, head,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({
            icon: "target", title: "Belum ada template KPI.",
            text: "Buat format KPI untuk sebuah divisi — tentukan indikator, sub-indikator, dan targetnya. Format itu menjadi form Lapor KPI karyawan divisi tersebut.",
            action: ui.button({ label: "Buat Template KPI", variant: "accent", icon: "plus", onClick: function () { templateForm(); } })
          }))));
        return;
      }
      var grid = h("div", { class: "pg-kpi-folders" }, tpls.map(function (t) {
        function delTpl(e) {
          e.stopPropagation();
          ui.confirm({ title: "Hapus Template", tone: "danger", confirmLabel: "Hapus",
            message: "Hapus template \"" + t.name + "\" beserta semua indikatornya?",
            onConfirm: function () {
              store.kpiTemplateDelete(t.id).then(function (res) {
                if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
                ui.toast("Template dihapus.", "success"); loadList();
              });
            } });
        }
        return h("div", { class: "pg-kpi-folder", role: "button", tabindex: "0",
          onclick: function () { openBuilder(t.id); },
          onkeydown: function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openBuilder(t.id); } } },
          h("div", { class: "pg-kpi-folder__top" },
            h("span", { class: "pg-kpi-folder__ic" }, svg("target")),
            ui.statusBadge(t.status)),
          h("div", { class: "pg-kpi-folder__name", text: t.name }),
          h("div", { class: "pg-kpi-folder__div", text: t.divisionName || "Semua divisi" }),
          h("div", { class: "pg-kpi-folder__meta",
            text: (t.periodType === "weekly" ? "Mingguan" : "Bulanan") + " · " +
              (t.scoreMethod === "weighted_sum" ? "Jumlah skor" : "Rata-rata %") }),
          h("div", { class: "pg-kpi-folder__foot" },
            h("span", null, (t.itemCount != null ? t.itemCount : 0) + " indikator"),
            h("span", null, (t.reportCount || 0) + " laporan")),
          h("div", { class: "pg-kpi-folder__act" },
            ui.button({ label: "Info", variant: "ghost", size: "sm", icon: "edit",
              onClick: function (e) { e.stopPropagation(); templateForm(t); } }),
            ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus template", title: "Hapus",
              onClick: delTpl })));
      }));
      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, head,
        h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Klik folder untuk membuka penyusun indikator." }),
        grid));
    }

    /* ---------- render : builder ---------- */
    function renderBuilder() {
      ui.clear(host);
      var back = ui.button({ label: "Kembali ke daftar template", variant: "ghost", icon: "chevronLeft",
        onClick: function () { state.view = "list"; loadList(); } });
      if (!state.tpl) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, back,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "target", title: "Memuat…" }))));
        return;
      }
      var t = state.tpl.template;
      var items = state.tpl.items || [];

      function itemTarget(it) {
        if (it.children && it.children.length) return it.children.reduce(function (n, c) { return n + itemTarget(c); }, 0);
        return it.target || 0;
      }
      var totalTarget = items.filter(function (it) { return !it.isOptional && itemTarget(it) > 0; })
        .reduce(function (n, it) { return n + itemTarget(it); }, 0);

      // Hierarchical bobot for "Rata-rata %" scoring: 100% split evenly
      // across the top-level indicators, then each indicator's own share
      // split evenly across ITS sub-indicators — mirrors pg_kpi_compute()'s
      // percent_avg weight cascade exactly (PG.store.kpiItemWeights), so
      // what an admin sees while building the template always matches what
      // an employee's report will score. weighted_sum instead weighs each
      // leaf by its own target size, so no bobot applies there.
      var showWeight = t.scoreMethod !== "weighted_sum";
      var itemWeights = store.kpiItemWeights(items);
      function weightPctOf(id) {
        var w = itemWeights[id];
        return w == null ? null : Math.round(w * 10) / 10;
      }
      var topCount = items.length;
      var topWeightPct = topCount > 0 ? Math.round((100 / topCount) * 10) / 10 : null;
      var scoringLeafCount = 0;
      (function countLeaves(list) {
        list.forEach(function (it) {
          if (it.children && it.children.length) { countLeaves(it.children); return; }
          if (!it.isOptional && it.target > 0) scoringLeafCount++;
        });
      })(items);

      var meta = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body",
        style: { display: "flex", flexWrap: "wrap", gap: "12px", alignItems: "center" } },
        h("div", { style: { flex: "1", minWidth: "200px" } },
          h("div", { class: "pg-strong", style: { fontSize: "15px" }, text: t.name }),
          h("div", { class: "pg-muted", style: { fontSize: "12.5px" },
            text: (t.divisionName || "Semua divisi") + " · " + (t.periodType === "weekly" ? "Mingguan" : "Bulanan") +
              " · " + store.kpiMethodLabel(t.scoreMethod) + " · " + (t.status === "active" ? "Aktif" : "Nonaktif") +
              (showWeight && topCount > 0 ? " · " + topCount + " indikator × " + topWeightPct + "%" : "") +
              (showWeight ? " · " + scoringLeafCount + " indikator/sub dinilai" : "") })),
        h("div", { class: "pg-strong", style: { fontVariantNumeric: "tabular-nums" }, text: "Total target: " + fmtNum(totalTarget) }),
        ui.button({ label: "Edit info", variant: "ghost", size: "sm", icon: "edit", onClick: function () { templateForm(t); } })
      ));

      var listWrap = h("div", { class: "pg-kpi-build" });
      function itemRow(it, siblings, idx, isSub) {
        var hasKids = it.children && it.children.length;
        var wPct = weightPctOf(it.id);
        var badges = h("span", { style: { display: "inline-flex", gap: "4px", marginLeft: "6px" } },
          it.isMoney ? ui.badge("Rp", "info") : null,
          it.isOptional ? ui.badge("Opsional", "neutral") : null,
          (showWeight && hasKids && wPct != null)
            ? ui.badge("Bobot " + wPct + "%", "neutral") : null,
          (showWeight && !hasKids && !it.isOptional && it.target > 0 && wPct != null)
            ? ui.badge("Bobot " + wPct + "%", "neutral") : null);
        var tgt = hasKids
          ? h("span", { class: "pg-muted", style: { fontVariantNumeric: "tabular-nums" }, text: "Σ " + fmtVal(itemTarget(it), it) })
          : h("span", { style: { fontVariantNumeric: "tabular-nums" }, text: fmtVal(it.target, it) });
        return h("div", { class: "pg-kpi-build__row" + (isSub ? " is-sub" : "") },
          h("div", { class: "pg-kpi-build__label" }, isSub ? h("span", { class: "pg-kpi-build__tick", text: "↳" }) : null,
            h("span", { class: isSub ? "" : "pg-strong", text: it.label }), badges),
          h("div", { class: "pg-kpi-build__target" }, tgt),
          h("div", { class: "pg-row-actions" },
            ui.button({ icon: "chevronUp", variant: "ghost", size: "sm", ariaLabel: "Naik", title: "Naik",
              disabled: idx === 0, onClick: function () { move(t.id, siblings, idx, -1); } }),
            ui.button({ icon: "chevronDown", variant: "ghost", size: "sm", ariaLabel: "Turun", title: "Turun",
              disabled: idx === siblings.length - 1, onClick: function () { move(t.id, siblings, idx, 1); } }),
            !isSub ? ui.button({ icon: "plus", variant: "ghost", size: "sm", ariaLabel: "Tambah sub-indikator", title: "Tambah sub-indikator",
              onClick: function () { itemForm(t.id, it.id); } }) : null,
            ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit",
              onClick: function () { itemForm(t.id, it.parentId || null, it); } }),
            ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
              onClick: function () { delItem(t.id, it); } }))
        );
      }
      if (!items.length) {
        listWrap.appendChild(ui.emptyState({ icon: "target", title: "Belum ada indikator.",
          text: "Tambahkan indikator KPI. Sebuah indikator boleh punya sub-indikator — targetnya otomatis dijumlahkan." }));
      } else {
        items.forEach(function (it, i) {
          listWrap.appendChild(itemRow(it, items, i, false));
          (it.children || []).forEach(function (c, j) { listWrap.appendChild(itemRow(c, it.children, j, true)); });
        });
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        back, meta, listWrap,
        h("div", null, ui.button({ label: "Tambah Indikator", variant: "accent", icon: "plus",
          onClick: function () { itemForm(t.id, null); } }))));
    }

    function render() { if (state.view === "build") renderBuilder(); else renderList(); }

    loadList();
    return page([pageHead("Performance", "Setting KPI"), host]);
  };

  /* ============================================================
     PROGRAM — program kerja (grid cards) terintegrasi Todo List.
     Admin memilih karyawan + menuliskan tugas masing-masing; tiap
     tugas otomatis jadi todo karyawan itu. Progress program =
     % todo program yang "done".
     ============================================================ */

  // shared date helpers for program cards / detail
  function pgDaysBetween(a, b) {
    var da = new Date(a + "T00:00:00"), db = new Date(b + "T00:00:00");
    return Math.round((db - da) / 86400000);
  }
  function pgDeadlineInfo(p, todayKey) {
    if (p.status === "archived") return { cls: "arch", dl: "done", text: "Arsip" };
    if (p.taskCount > 0 && p.progressPct >= 100) return { cls: "done", dl: "done", text: "Selesai" };
    var d = pgDaysBetween(todayKey, p.endDate);
    if (d < 0) return { cls: "over", dl: "over", text: "Terlambat " + (-d) + " hari" };
    if (d === 0) return { cls: "soon", dl: "soon", text: "Berakhir hari ini" };
    if (d <= 3) return { cls: "soon", dl: "soon", text: d + " hari lagi" };
    return { cls: "ok", dl: "ok", text: "Berakhir dalam " + d + " hari" };
  }
  function pgCoverBox(coverUrl, alt, extraCls) {
    var box = h("div", { class: "pg-progcard__cover" + (extraCls ? " " + extraCls : "") });
    var ph = h("span", { class: "pg-progcard__ph" }, svg("grid"));
    if (coverUrl) {
      var img = h("img", { alt: alt || "Cover program", loading: "lazy" });
      img.onerror = function () { if (img.parentNode) img.remove(); if (!box.querySelector(".pg-progcard__ph")) box.appendChild(ph); };
      store.fileObjectUrl(coverUrl).then(function (u) {
        img.onload = function () { try { URL.revokeObjectURL(u); } catch (e) {} };
        img.src = u;
      }).catch(img.onerror);
      box.appendChild(img);
    } else {
      box.appendChild(ph);
    }
    return box;
  }

  pages.programAdmin = function () {
    if (!PG.auth.can("todo.manage")) {
      return page([pageHead("Work Management", "Program"),
        ui.notice("Anda tidak memiliki akses untuk mengelola Program.")]);
    }
    var state = { q: "", view: "grid" };   // view: "grid" (aktif) | "archive"
    var host = h("div");

    function activeUsers() {
      return store.all("users").filter(function (u) { return u.status === "active"; })
        .slice().sort(function (a, b) { return String(a.fullName).localeCompare(String(b.fullName)); });
    }
    function dateRange(p) {
      return ui.fmtDateShortID(p.startDate) + " – " + ui.fmtDateShortID(p.endDate);
    }

    /* ---------- create / edit form ---------- */
    function programForm(full) {
      var existing = full ? full.program : null;
      var users = activeUsers();
      var userOpts = [{ value: "", label: "— Pilih karyawan —" }].concat(users.map(function (u) {
        return { value: String(u.id), label: u.fullName + " (@" + u.username + ")" };
      }));

      var fName = ui.field({ label: "Nama Program", required: true,
        placeholder: "cth. Kampanye Konten September", value: existing ? existing.name : "" });
      var fDesc = ui.field({ label: "Deskripsi Program", type: "textarea",
        placeholder: "Tujuan & ruang lingkup program…", value: existing ? (existing.description || "") : "" });
      fDesc._control.rows = 4;
      var fStart = ui.field({ label: "Tanggal Mulai", type: "date", required: true,
        value: existing ? existing.startDate : store.dateKey() });
      var fEnd = ui.field({ label: "Tanggal Berakhir", type: "date", required: true,
        value: existing ? existing.endDate : "" });

      // ---- cover picker (shows the true 1:1) ----
      var coverState = { file: null };
      var coverBox = h("div", { class: "pg-coverpick__box" });
      function paintCover(src) {
        ui.clear(coverBox);
        if (src) { coverBox.appendChild(h("img", { src: src, alt: "Cover" })); }
        else { coverBox.appendChild(svg("image")); }
      }
      paintCover(null);
      if (existing && existing.coverUrl) {
        store.fileObjectUrl(existing.coverUrl).then(function (u) { paintCover(u); }).catch(function () {});
      }
      var coverInput = h("input", { type: "file", accept: "image/*", style: { display: "none" },
        onchange: function (e) {
          var f = (e.target.files || [])[0]; e.target.value = "";
          if (!f) return;
          function apply(out) {
            coverState.file = out;
            try { paintCover(URL.createObjectURL(out)); } catch (x) {}
          }
          // Downscale/re-encode before upload — see assets/js/core/imgresize.js.
          if (PG.resizeImageFile) PG.resizeImageFile(f, { maxEdge: 1000, quality: 0.85 }).then(apply);
          else apply(f);
        } });
      var coverPick = h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Cover Program (rasio 1:1)" }),
        h("div", { class: "pg-coverpick" }, coverBox, coverInput,
          h("div", { style: { display: "flex", flexDirection: "column", gap: "6px" } },
            ui.button({ label: existing && existing.coverUrl ? "Ganti Cover" : "Pilih Cover", variant: "ghost", size: "sm", icon: "image",
              onClick: function () { coverInput.click(); } }),
            h("span", { class: "pg-field__hint", text: "JPG/PNG/WebP, disarankan persegi (mis. 800×800)." }))));

      // ---- per-employee task rows ----
      var tasksHost = h("div");
      var rows = [];
      function addRow(pre) {
        var sel = h("select", { class: "pg-select" }, userOpts.map(function (o) {
          return h("option", { value: o.value, text: o.label, selected: pre && String(pre.assigneeId) === o.value });
        }));
        var inp = h("input", { class: "pg-input", type: "text", placeholder: "Tugas untuk karyawan ini…",
          value: pre ? pre.title : "" });
        var rowObj = { id: pre ? pre.id : null };
        var del = ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus baris tugas", title: "Hapus baris",
          onClick: function () {
            if (rows.length <= 1) { ui.toast("Minimal satu baris tugas.", "danger"); return; }
            rows = rows.filter(function (r) { return r !== rowObj; });
            rowEl.remove();
          } });
        var rowEl = h("div", { class: "pg-taskrow" }, sel, inp, del);
        rowObj.el = rowEl; rowObj.sel = sel; rowObj.inp = inp;
        rows.push(rowObj);
        tasksHost.appendChild(rowEl);
      }
      if (full && full.tasks && full.tasks.length) full.tasks.forEach(addRow);
      else addRow(null);

      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      function bad(msg) { errEl.textContent = msg; errEl.style.display = "block"; }

      var m = ui.modal({
        title: existing ? "Edit Program" : "Tambah Program",
        class: "pg-modal--form",
        body: [
          fName, fDesc,
          h("div", { class: "pg-grid pg-grid--2" }, fStart, fEnd),
          coverPick,
          h("div", { class: "pg-field" },
            h("label", { class: "pg-field__label", text: "Tugas Karyawan dalam Program" }),
            h("span", { class: "pg-field__hint", text: "Tambahkan sebanyak yang diperlukan — setiap baris menjadi satu todo di Todo List karyawan tersebut. Satu karyawan boleh punya beberapa baris tugas." }),
            tasksHost,
            h("div", { style: { marginTop: "8px" } },
              ui.button({ label: "Tambah Baris Tugas", variant: "ghost", size: "sm", icon: "plus",
                onClick: function () { addRow(null); } }))),
          errEl
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Buat Program", variant: "primary", onClick: function () {
            errEl.style.display = "none";
            var name = fName._control.value.trim();
            var start = fStart._control.value, end = fEnd._control.value;
            if (!name) return bad("Nama program wajib diisi.");
            if (!start || !end) return bad("Tanggal mulai & berakhir wajib diisi.");
            if (end < start) return bad("Tanggal berakhir tidak boleh sebelum tanggal mulai.");
            var tasks = [];
            for (var i = 0; i < rows.length; i++) {
              var uid = rows[i].sel.value, title = rows[i].inp.value.trim();
              if (!uid && !title) continue;
              if (!uid) return bad("Pilih karyawan untuk setiap baris tugas.");
              if (!title) return bad("Isi tugas untuk setiap karyawan yang dipilih.");
              tasks.push({ id: rows[i].id || undefined, userId: uid, title: title });
            }
            if (!tasks.length) return bad("Tambahkan minimal satu karyawan beserta tugasnya.");

            var btn = this; btn.disabled = true;
            function fail(res) { btn.disabled = false; bad((res && res.error) || "Gagal menyimpan program."); }

            if (existing) {
              store.programUpdate(existing.id, {
                name: name, description: fDesc._control.value.trim(),
                startDate: start, endDate: end, tasks: tasks
              }).then(function (res) {
                if (!res || res.ok === false) return fail(res);
                var afterCover = coverState.file
                  ? store.programSetCover(existing.id, coverState.file)
                  : Promise.resolve({ ok: true });
                afterCover.then(function (r2) {
                  if (r2 && r2.ok === false) ui.toast(r2.error || "Cover gagal diunggah.", "danger");
                  ui.toast("Program diperbarui.", "success"); m.close(); render();
                });
              });
            } else {
              var fd = new FormData();
              fd.append("name", name);
              fd.append("description", fDesc._control.value.trim());
              fd.append("startDate", start);
              fd.append("endDate", end);
              fd.append("status", "active");
              if (coverState.file) fd.append("cover", coverState.file);
              fd.append("tasks", JSON.stringify(tasks.map(function (t) { return { userId: t.userId, title: t.title }; })));
              store.programCreate(fd).then(function (res) {
                if (!res || res.ok === false) return fail(res);
                ui.toast("Program dibuat. Todo terkirim ke " + tasks.length + " tugas karyawan.", "success");
                m.close(); render();
              });
            }
          } })
        ]
      });
    }

    /* ---------- detail ---------- */
    function detail(id) {
      var m = ui.modal({ class: "pg-modal--form", title: "Memuat program…",
        body: [ui.emptyState({ icon: "grid", title: "Memuat…" })], footer: [] });
      store.program(id).then(function (d) {
        if (!d || d.ok === false || !d.program) { m.close(); ui.toast((d && d.error) || "Gagal memuat program.", "danger"); return; }
        var p = d.program, tasks = d.tasks || [];
        ui.clear(m.body); ui.clear(m.el.querySelector(".pg-modal__footer"));
        m.el.querySelector(".pg-modal__title").textContent = p.name;
        var di = pgDeadlineInfo(p, store.dateKey());

        var taskList = tasks.length
          ? h("div", { class: "pg-grid", style: { gap: "6px" } }, tasks.map(function (t) {
              return h("div", { class: "pg-history-row", style: { alignItems: "center" } },
                h("div", { class: "pg-history-row__main" },
                  h("div", { class: "pg-history-row__d", text: t.title }),
                  h("div", { class: "pg-history-row__t",
                    text: (t.assigneeName || "—") + (t.divisionName ? " · " + t.divisionName : "") })),
                h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
                  h("span", { class: "pg-muted", style: { fontSize: "12px", fontVariantNumeric: "tabular-nums" }, text: (t.progress || 0) + "%" }),
                  ui.statusBadge(t.status)));
            }))
          : h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Belum ada tugas pada program ini." });

        ui.append(m.body, [
          pgCoverBox(p.coverUrl, p.name, "pg-progcard__cover--wide"),
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
            h("span", { class: "pg-dl pg-dl--" + di.dl, text: di.text }),
            p.status === "archived" ? ui.badge("Arsip", "neutral") : null,
            h("span", { class: "pg-muted", style: { fontSize: "12px" }, text: dateRange(p) })),
          p.description ? h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" }, text: p.description }) : null,
          h("div", null,
            ui.progressBar(p.progressPct || 0, { label: "Progress Program", showPct: true }),
            h("div", { class: "pg-muted", style: { fontSize: "12px", marginTop: "4px" },
              text: p.doneCount + " / " + p.taskCount + " tugas selesai · " + p.assigneeCount + " karyawan" })),
          h("div", { class: "pg-field__label", style: { margin: "4px 0 2px" }, text: "Tugas Karyawan" }),
          taskList
        ]);

        var foot = m.el.querySelector(".pg-modal__footer");
        foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
        foot.appendChild(ui.button({ label: "Hapus", variant: "danger", icon: "trash",
          onClick: function () {
            ui.confirm({ title: "Hapus Program", tone: "danger", confirmLabel: "Hapus permanen",
              message: "Hapus program \"" + p.name + "\"? Semua todo yang berasal dari program ini (" + p.taskCount + " tugas) beserta lampirannya ikut terhapus permanen.",
              onConfirm: function () {
                store.programDelete(p.id).then(function (res) {
                  if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
                  ui.toast("Program dihapus.", "success"); m.close(); render();
                });
              } });
          } }));
        foot.appendChild(ui.button({ label: p.status === "archived" ? "Aktifkan" : "Arsipkan",
          variant: "ghost", icon: "archive",
          onClick: function () {
            store.programUpdate(p.id, { status: p.status === "archived" ? "active" : "archived" }).then(function (res) {
              if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
              ui.toast(p.status === "archived" ? "Program diaktifkan." : "Program diarsipkan.", "success"); m.close(); render();
            });
          } }));
        foot.appendChild(ui.button({ label: "Edit", variant: "primary", icon: "edit",
          onClick: function () { m.close(); programForm(d); } }));
      }).catch(function () { m.close(); ui.toast("Gagal memuat program.", "danger"); });
    }

    /* ---------- one program grid card ---------- */
    function programCard(p, tk) {
      var di = pgDeadlineInfo(p, tk);
      var openCount = Math.max(0, (p.taskCount || 0) - (p.doneCount || 0));
      return h("div", { class: "pg-progcard", onclick: function () { detail(p.id); } },
        (function () {
          var box = pgCoverBox(p.coverUrl, p.name);
          box.appendChild(h("span", { class: "pg-progcard__pill pg-progcard__pill--" + di.cls, text: di.text }));
          if (openCount) box.appendChild(h("span", { class: "pg-progcard__count",
            title: openCount + " tugas belum selesai", text: openCount > 99 ? "99+" : String(openCount) }));
          return box;
        })(),
        h("div", { class: "pg-progcard__body" },
          h("div", { class: "pg-progcard__title", text: p.name }),
          h("div", { class: "pg-progcard__meta" },
            h("span", null, svg("calendar"), dateRange(p)),
            h("span", null, svg("users"), p.assigneeCount + " karyawan"),
            h("span", null, svg("checklist"), p.taskCount + " tugas")),
          h("div", { class: "pg-progcard__foot" },
            h("div", { class: "pg-progcard__foot-row" },
              h("span", { text: "Progress" }),
              h("b", { text: (p.progressPct || 0) + "% · " + p.doneCount + "/" + p.taskCount })),
            ui.progressBar(p.progressPct || 0))));
    }

    /* ---------- render : grid aktif  |  arsip ---------- */
    function render() {
      ui.clear(host);
      var tk = store.dateKey();
      var all = store.all("programs").slice();
      var archived = all.filter(function (p) { return p.status === "archived"; });
      var live = all.filter(function (p) { return p.status !== "archived"; });
      var q = state.q.trim().toLowerCase();
      function matchQ(p) { return !q || (p.name + " " + (p.description || "")).toLowerCase().indexOf(q) >= 0; }
      function searchBar(ph) {
        return h("div", { class: "pg-toolbar__search" },
          h("input", { class: "pg-input", type: "search", placeholder: ph, value: state.q,
            oninput: function (e) { state.q = e.target.value; render(); } }));
      }

      /* ===== ARSIP ===== */
      if (state.view === "archive") {
        var arows = archived.filter(matchQ);
        var head = h("div", { class: "pg-section-head" },
          h("div", null,
            h("div", { class: "pg-page__crumb", text: "PROGRAM" }),
            h("h2", { class: "pg-page__title", style: { fontSize: "18px" }, text: "Program Arsip" })),
          ui.button({ label: "Kembali ke Program Aktif", variant: "ghost", icon: "chevronLeft",
            onClick: function () { state.view = "grid"; state.q = ""; render(); } }));
        var atoolbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
          h("div", { class: "pg-toolbar" }, searchBar("Cari program arsip…"))));
        var abody = !archived.length
          ? h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "archive", title: "Belum ada program yang diarsipkan.",
              text: "Program yang sudah selesai bisa diarsipkan dari rincian program agar halaman utama tetap rapi." }))
          : (!arows.length
              ? h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "archive", title: "Tidak ada program arsip untuk pencarian ini." }))
              : h("div", { class: "pg-progrid" }, arows.map(function (p) { return programCard(p, tk); })));
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, head, atoolbar, abody));
        return;
      }

      /* ===== GRID AKTIF ===== */
      var running = live.filter(function (p) { return !(p.taskCount > 0 && p.progressPct >= 100); });
      var doneP   = live.filter(function (p) { return p.taskCount > 0 && p.progressPct >= 100; });
      var overdue = live.filter(function (p) { return p.endDate < tk && !(p.taskCount > 0 && p.progressPct >= 100); });

      var stats = h("div", { class: "pg-grid pg-grid--4" },
        ui.statCard({ icon: "grid", tone: "blue", label: "Program Aktif", value: live.length,
          hint: archived.length ? archived.length + " diarsipkan" : "Semua program berjalan" }),
        ui.statCard({ icon: "clock", tone: "yellow", label: "Berjalan", value: running.length, hint: "Belum 100%" }),
        ui.statCard({ icon: "checkCircle", tone: "green", label: "Selesai", value: doneP.length, hint: "Siap diarsipkan" }),
        ui.statCard({ icon: "info", tone: "danger", label: "Terlambat", value: overdue.length, hint: "Lewat tanggal berakhir" }));

      var toolbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          searchBar("Cari nama / deskripsi program…"),
          ui.button({ label: "Tambah Program", variant: "accent", icon: "plus", onClick: function () { programForm(null); } }),
          ui.button({ label: "Program Arsip" + (archived.length ? " (" + archived.length + ")" : ""), variant: "ghost", icon: "archive",
            onClick: function () { state.view = "archive"; state.q = ""; render(); } })
        )
      ));

      var lrows = live.filter(matchQ);
      var body;
      if (!live.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "grid", title: archived.length ? "Belum ada program aktif." : "Belum ada program.",
          text: "Buat program kerja, pilih karyawan yang bertugas, dan tuliskan tugas masing-masing — otomatis muncul di Todo List mereka.",
          action: ui.button({ label: "Tambah Program", variant: "accent", icon: "plus", onClick: function () { programForm(null); } })
        }));
      } else if (!lrows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "grid", title: "Tidak ada program untuk pencarian ini." }));
      } else {
        body = h("div", { class: "pg-progrid" }, lrows.map(function (p) { return programCard(p, tk); }));
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, stats, toolbar, body));
    }

    render();
    ui.live(render, host);
    return page([pageHead("Work Management", "Program"), host]);
  };

  /* ---- Job Desk : Admin menulis uraian tugas per divisi / jabatan;
         karyawan hanya melihat di menu Job Desk (User App). ---- */
  pages.jobDeskAdmin = function () {
    if (!PG.auth.can("org.manage")) {
      return page([pageHead("Organization", "Job Desk"),
        ui.notice("Anda tidak memiliki akses untuk mengelola Job Desk.")]);
    }
    var state = { q: "", scopeType: "", status: "" };
    var host = h("div");

    function byName(a, b) { return String(a.name).localeCompare(String(b.name)); }
    function scopeName(jd) {
      return jd.scopeType === "division"
        ? (jd.divisionName || store.divisionName(jd.divisionId))
        : (jd.positionName || store.positionName(jd.positionId));
    }
    function scopeBadge(jd) {
      return ui.badge((jd.scopeType === "division" ? "Divisi" : "Jabatan") + " · " + (scopeName(jd) || "—"),
        jd.scopeType === "division" ? "info" : "neutral");
    }
    function excerpt(txt, n) {
      txt = String(txt || "").replace(/\s+/g, " ").trim();
      return txt.length > (n || 90) ? txt.slice(0, n || 90) + "…" : (txt || "—");
    }

    function jobDeskForm(existing) {
      var divs = store.activeList("divisions").slice().sort(byName);
      var poss = store.activeList("positions").slice().sort(byName);

      var fScope = ui.field({ label: "Terapkan Untuk", type: "select",
        options: [{ value: "division", label: "Divisi" }, { value: "position", label: "Jabatan" }],
        value: existing ? existing.scopeType : "division" });
      var targetHost = h("div");
      var fTitle = ui.field({ label: "Judul Job Desk", required: true,
        placeholder: "cth. Tanggung Jawab Harian Staff Marketing", value: existing ? existing.title : "" });
      var fContent = ui.field({ label: "Uraian Tugas", type: "textarea", required: true,
        placeholder: "Tulis rincian tugas & tanggung jawab. Satu poin per baris.",
        value: existing ? existing.content : "" });
      fContent._control.rows = 8;
      var fStatus = ui.field({ label: "Status", type: "select",
        options: [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }],
        value: existing ? existing.status : "active" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      var fTarget;
      function renderTarget() {
        ui.clear(targetHost);
        var st = fScope._control.value;
        var label = st === "division" ? "Divisi" : "Jabatan";
        var list = st === "division" ? divs : poss;
        var cur = existing && existing.scopeType === st
          ? (st === "division" ? existing.divisionId : existing.positionId) : "";
        fTarget = ui.field({ label: label, type: "select",
          options: [{ value: "", label: "— Pilih " + label + " —" }].concat(
            list.map(function (r) { return { value: String(r.id), label: r.name }; })),
          value: cur ? String(cur) : "" });
        targetHost.appendChild(fTarget);
      }
      fScope._control.onchange = renderTarget;
      renderTarget();

      var m = ui.modal({
        title: existing ? "Edit Job Desk" : "Tambah Job Desk",
        class: "pg-modal--form",
        body: [h("div", { class: "pg-grid pg-grid--2" }, fScope, targetHost), fTitle, fContent, fStatus, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Tambah", variant: "primary", onClick: function () {
            var st = fScope._control.value;
            var targetId = fTarget._control.value;
            var title = fTitle._control.value.trim();
            var content = fContent._control.value.trim();
            function bad(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
            errEl.style.display = "none";
            if (!targetId) return bad("Pilih " + (st === "division" ? "divisi" : "jabatan") + " terlebih dahulu.");
            if (!title) return bad("Judul job desk wajib diisi.");
            if (!content) return bad("Uraian tugas wajib diisi.");
            var payload = { scopeType: st, title: title, content: content, status: fStatus._control.value };
            if (st === "division") payload.divisionId = targetId; else payload.positionId = targetId;
            var op = existing ? store.patch("jobDesks", existing.id, payload) : store.insert("jobDesks", payload);
            return op.then(function (res) {
              if (!res || res.ok === false) return bad((res && res.error) || "Gagal menyimpan job desk.");
              ui.toast(existing ? "Job desk diperbarui." : "Job desk ditambahkan.", "success");
              m.close(); render();
            });
          } })
        ]
      });
    }

    function detail(jd) {
      var m = ui.modal({
        title: jd.title, class: "pg-modal--form",
        body: [
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", marginBottom: "10px" } },
            scopeBadge(jd), ui.statusBadge(jd.status),
            h("span", { class: "pg-muted", style: { fontSize: "12px" },
              text: (jd.updatedByName ? "Oleh " + jd.updatedByName + " · " : "")
                + "Diperbarui " + (jd.updatedAt ? ui.fmtDateShortID(jd.updatedAt) : "—") })),
          h("div", { class: "pg-jobdesk__content", text: jd.content })
        ],
        footer: [
          ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Edit", variant: "primary", icon: "edit",
            onClick: function () { m.close(); jobDeskForm(jd); } })
        ]
      });
    }

    function toggle(jd) {
      var to = jd.status === "active" ? "inactive" : "active";
      store.patch("jobDesks", jd.id, { status: to }).then(function (res) {
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
        ui.toast(to === "active" ? "Job desk diaktifkan." : "Job desk dinonaktifkan.", "success"); render();
      });
    }
    function del(jd) {
      ui.confirm({ title: "Hapus Job Desk", tone: "danger", confirmLabel: "Hapus permanen",
        message: "Hapus job desk \"" + jd.title + "\" untuk " + (jd.scopeType === "division" ? "divisi " : "jabatan ")
          + (scopeName(jd) || "—") + "? Tindakan ini permanen.",
        onConfirm: function () {
          store.remove("jobDesks", jd.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            ui.toast("Job desk dihapus.", "success"); render();
          });
        } });
    }

    function render() {
      ui.clear(host);
      var all = store.all("jobDesks").slice().sort(function (a, b) {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        var an = (scopeName(a) || "") + a.title, bn = (scopeName(b) || "") + b.title;
        return an.localeCompare(bn);
      });
      var q = state.q.trim().toLowerCase();
      var rows = all.filter(function (jd) {
        if (state.scopeType && jd.scopeType !== state.scopeType) return false;
        if (state.status && jd.status !== state.status) return false;
        if (q && (jd.title + " " + (scopeName(jd) || "") + " " + jd.content).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });

      var strip = ui.statStrip([
        { icon: "doc", label: "Total Job Desk", value: all.length },
        { icon: "checkCircle", tone: "green", label: "Aktif", value: all.filter(function (j) { return j.status === "active"; }).length },
        { icon: "building", tone: "blue", label: "Untuk Divisi", value: all.filter(function (j) { return j.scopeType === "division"; }).length },
        { icon: "users", tone: "yellow", label: "Untuk Jabatan", value: all.filter(function (j) { return j.scopeType === "position"; }).length }
      ]);

      var toolbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          h("div", { class: "pg-toolbar__search" },
            h("input", { class: "pg-input", type: "search", placeholder: "Cari judul / isi / divisi / jabatan…", value: state.q,
              oninput: function (e) { state.q = e.target.value; render(); } })),
          h("select", { class: "pg-select", onchange: function (e) { state.scopeType = e.target.value; render(); } },
            [{ value: "", label: "Semua Penerapan" }, { value: "division", label: "Per Divisi" }, { value: "position", label: "Per Jabatan" }]
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: o.value === state.scopeType }); })),
          h("select", { class: "pg-select", onchange: function (e) { state.status = e.target.value; render(); } },
            [{ value: "", label: "Semua Status" }, { value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }]
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: o.value === state.status }); }))
        )
      ));

      var body;
      if (!all.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "doc", title: "Belum ada job desk.",
          text: "Tulis uraian tugas untuk sebuah divisi atau jabatan. Karyawan yang cocok akan melihatnya di menu Job Desk.",
          action: ui.button({ label: "Tambah Job Desk", variant: "accent", icon: "plus", onClick: function () { jobDeskForm(); } })
        }));
      } else if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "doc", title: "Tidak ada job desk untuk filter ini." }));
      } else {
        body = ui.table({
          columns: ["Judul", "Berlaku Untuk", "Ringkasan", "Status", "Diperbarui", "Aksi"],
          rows: rows.map(function (jd) {
            return {
              onClick: function () { detail(jd); },
              cells: [
                h("span", { class: "pg-strong", text: jd.title }),
                scopeBadge(jd),
                h("span", { class: "pg-muted", text: excerpt(jd.content, 90) }),
                ui.statusBadge(jd.status),
                h("span", { class: "pg-muted", text: jd.updatedAt ? ui.fmtDateShortID(jd.updatedAt) : "—" }),
                h("div", { class: "pg-row-actions" },
                  ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit",
                    onClick: function () { jobDeskForm(jd); } }),
                  ui.button({ label: jd.status === "active" ? "Nonaktifkan" : "Aktifkan", variant: "ghost", size: "sm",
                    onClick: function () { toggle(jd); } }),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
                    onClick: function () { del(jd); } }))
              ]
            };
          })
        });
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, strip, toolbar, body));
    }

    render();
    ui.live(render, host);
    return page([
      pageHead("Organization", "Job Desk",
        ui.button({ label: "Tambah Job Desk", variant: "accent", icon: "plus", onClick: function () { jobDeskForm(); } })),
      host
    ]);
  };

  /* ============================================================
     JADWAL PIKET  (weekly recurring duty roster keyed by day-of-week, not a
     date — assign employees per weekday + set the daily reminder clock-time)
     ============================================================ */
  pages.jadwalPiket = function () {
    if (!PG.auth.can("piket.settings.edit")) {
      return page([pageHead("Organization", "Jadwal Piket"),
        ui.notice("Anda tidak memiliki akses untuk mengelola Jadwal Piket.")]);
    }
    var host = h("div");

    function dayLabel(code) { return store.piketDayLabel(code); }

    function addToDay(dayCode) {
      var assignedIds = store.allPiketSchedules()
        .filter(function (r) { return r.dayOfWeek === dayCode; })
        .map(function (r) { return String(r.userId); });
      var options = store.activeList("users").slice()
        .sort(function (a, b) { return String(a.fullName).localeCompare(String(b.fullName)); })
        .filter(function (u) { return assignedIds.indexOf(String(u.id)) < 0; });

      if (!options.length) {
        ui.toast("Semua karyawan aktif sudah terjadwal di hari " + dayLabel(dayCode) + ".", "info");
        return;
      }
      var fUser = ui.field({ label: "Karyawan", type: "select",
        options: options.map(function (u) { return { value: u.id, label: u.fullName }; }) });
      var fNote = ui.field({ label: "Catatan (opsional)", placeholder: "cth. Bersihkan pantry & musala" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Tambah Piket · " + dayLabel(dayCode),
        body: [fUser, fNote, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Tambah", variant: "accent", icon: "plus", onClick: function () {
            return store.piketScheduleCreate(dayCode, fUser._control.value, fNote._control.value.trim()).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menambah."; errEl.style.display = "block"; return; }
              ui.toast("Jadwal piket ditambahkan.", "success"); m.close(); render();
            });
          } })
        ]
      });
    }

    function removeFromDay(r) {
      var u = store.find("users", r.userId) || {};
      ui.confirm({
        title: "Hapus Jadwal Piket", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus " + (u.fullName || "karyawan") + " dari jadwal piket hari " + dayLabel(r.dayOfWeek) + "?",
        onConfirm: function () {
          store.piketScheduleDelete(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            ui.toast("Jadwal piket dihapus.", "success"); render();
          });
        }
      });
    }

    function settingsCard() {
      var s = store.piketSettings();
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      // --- daily piket reminder (Mon–Thu, Sat, Sun) ---
      var fTime = ui.field({ label: "Jam Pengingat", type: "time", value: s.reminderTime || "07:00" });
      var cb = h("input", { type: "checkbox", checked: !!s.enabled });

      // --- "Jumat Berkah" reminder (Friday only, its own everything) ---
      var fFriTime = ui.field({ label: "Jam Pengingat", type: "time", value: s.fridayTime || "07:00" });
      var cbFri = h("input", { type: "checkbox", checked: !!s.fridayEnabled });
      var fFriMsg = ui.field({ label: "Pesan Notifikasi Jumat Berkah (opsional)", type: "textarea",
        placeholder: "cth. Jumat Berkah! Yuk bersih-bersih bersama, mulai dari meja & area masing-masing. Semoga berkah.",
        value: s.fridayMessage || "" });
      fFriMsg._control.rows = 2;

      var saveBtn = ui.button({ label: "Simpan Pengaturan", variant: "accent", icon: "check", onClick: function () {
        errEl.style.display = "none";
        saveBtn.disabled = true;
        store.savePiketSettings({
          reminderTime: fTime._control.value, enabled: cb.checked,
          fridayTime: fFriTime._control.value, fridayEnabled: cbFri.checked,
          fridayMessage: fFriMsg._control.value.trim() || null
        }).then(function (res) {
          saveBtn.disabled = false;
          if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
          ui.toast("Pengaturan pengingat piket disimpan.", "success"); render();
        });
      } });

      function toggleRow(node) {
        return h("label", { style: { display: "flex", alignItems: "center", gap: "8px", cursor: "pointer" } },
          node, h("span", { text: "Aktifkan pengingat" }));
      }

      return ui.card({ title: "Pengaturan Pengingat", body: [
        h("div", { class: "pg-strong", style: { fontSize: "13.5px" }, text: "Pengingat Piket Harian" }),
        h("div", { class: "pg-muted", style: { fontSize: "12.5px", marginTop: "-2px" },
          text: "Berlaku Senin–Kamis, Sabtu, Minggu. Karyawan yang piket diingatkan pada jam ini." }),
        h("div", { class: "pg-grid pg-grid--keep2", style: { alignItems: "end", marginTop: "8px" } },
          fTime, toggleRow(cb)),

        h("div", { style: { height: "1px", background: "var(--pg-border)", margin: "16px 0" } }),

        h("div", { class: "pg-strong", style: { fontSize: "13.5px", color: "var(--pg-success)" }, text: "Pengingat Jumat Berkah (Bersih-bersih)" }),
        h("div", { class: "pg-muted", style: { fontSize: "12.5px", marginTop: "-2px" },
          text: "Khusus hari Jumat — notifikasi terpisah dengan jam & pesan sendiri, dikirim ke karyawan yang piket hari Jumat." }),
        h("div", { class: "pg-grid pg-grid--keep2", style: { alignItems: "end", marginTop: "8px" } },
          fFriTime, toggleRow(cbFri)),
        h("div", { style: { marginTop: "10px" } }, fFriMsg),

        errEl,
        h("div", { style: { marginTop: "14px" } }, saveBtn)
      ]});
    }

    function dayCard(day) {
      var rows = store.allPiketSchedules().filter(function (r) { return r.dayOfWeek === day.value; });
      var isFriday = day.value === "fri";
      return ui.card({
        title: day.label,
        action: h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
          isFriday ? ui.badge("Jumat Berkah", "success") : null,
          ui.button({ label: "Tambah", icon: "plus", variant: "ghost", size: "sm", onClick: function () { addToDay(day.value); } })),
        body: [
          rows.length
            ? h("div", null, rows.map(function (r, i) {
                var u = store.find("users", r.userId) || {};
                return h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "9px 0",
                  borderBottom: i < rows.length - 1 ? "1px solid var(--pg-border)" : "none" } },
                  h("div", { class: "pg-avatar", style: { width: "30px", height: "30px", fontSize: "12px" }, text: ui.initials(u.fullName || "?") }),
                  h("div", { style: { flex: "1", minWidth: 0 } },
                    h("div", { style: { fontWeight: "600", fontSize: "13.5px" }, text: u.fullName || "Karyawan tidak ditemukan" }),
                    r.note ? h("div", { class: "pg-muted", style: { fontSize: "12px" }, text: r.note }) : null
                  ),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
                    onClick: function () { removeFromDay(r); } })
                );
              }))
            : h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Belum ada karyawan piket di hari ini." })
        ]
      });
    }

    function render() {
      ui.clear(host);
      var days = store.PIKET_DAYS.map(dayCard);
      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } },
        settingsCard(),
        ui.sectionHead("Jadwal per Hari"),
        h("div", { class: "pg-grid pg-grid--2" }, days)
      ));
    }

    render();
    ui.live(render, host);
    return page([pageHead("Organization", "Jadwal Piket"), host]);
  };

  /* ---- Laporan Kunjungan : visit reports + a "Foto Kunjungan" gallery grouped by store ---- */
  pages.laporanKunjungan = function () {
    var state = {
      view: "table",                                  // table | gallery | store | checklist
      divisionId: "", storeId: "", userId: "", status: "", from: "", to: "", staleOnly: false,
      loading: false, data: null,
      gallery: null, storeSel: "", storePhotos: null,
      checklistDivisionId: "", checklistItems: null    // "Atur Checklist" sub-page
    };
    var host = h("div");
    var headAction = h("div");

    function absUrl(u) { try { return new URL(u, document.baseURI).href; } catch (e) { return u || ""; } }
    function statusBadge(s) {
      return s === "reviewed" ? ui.badge("Direview", "success") : ui.badge("Terkirim", "info");
    }
    function dateID(d) { return d ? ui.fmtDateShortID(d) : "—"; }

    /* ---------- data ---------- */
    function load() {
      state.loading = true; render();
      store.visits({
        divisionId: state.divisionId, storeId: state.storeId, userId: state.userId,
        status: state.status, from: state.from, to: state.to,
        staleOnly: state.staleOnly ? 1 : ""
      }).then(function (d) { state.data = d && d.ok !== false ? d : null; state.loading = false; render(); })
        .catch(function () { state.data = null; state.loading = false; render(); });
    }

    function purgeStale(sum) {
      ui.confirm({
        title: "Hapus Laporan Kunjungan Lama", tone: "danger", confirmLabel: "Hapus permanen",
        message: "Hapus " + sum.staleCount + " laporan kunjungan berumur 1 minggu atau lebih"
          + (sum.stalePhotos ? " beserta " + sum.stalePhotos + " foto" : "")
          + " (kunjungan sebelum " + ui.fmtDateShortID(sum.staleBefore) + ")?\n\n"
          + "Seluruh data laporan dan file fotonya akan dihapus permanen dan tidak dapat dikembalikan.",
        onConfirm: function () {
          store.visitPurgeStale(sum.staleBefore).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            var r = (res.data && res.data.ok !== undefined) ? res.data : res;
            ui.toast((r.removed || 0) + " laporan & " + (r.photosRemoved || 0) + " foto dihapus.", "success");
            state.staleOnly = false;
            load();
          });
        }
      });
    }
    function loadGallery() {
      state.view = "gallery"; state.gallery = null; render();
      store.visitPhotos().then(function (d) { state.gallery = (d && d.ok !== false) ? d : { stores: [] }; render(); })
        .catch(function () { state.gallery = { stores: [] }; render(); });
    }
    function openStore(name) {
      state.view = "store"; state.storeSel = name; state.storePhotos = null; render();
      store.visitPhotos({ store: name }).then(function (d) {
        state.storePhotos = (d && d.ok !== false) ? d : { storeName: name, photos: [] }; render();
      }).catch(function () { state.storePhotos = { storeName: name, photos: [] }; render(); });
    }

    /* ---------- shared photo tile (square 1:1) ---------- */
    function photoTile(a, opts) {
      opts = opts || {};
      var box = h("span", { class: "pg-vatt__imgwrap" });
      var img = h("img", { src: absUrl(a.fileUrl), alt: a.name || "Foto", loading: "lazy",
        onerror: function () { box.classList.add("is-broken"); if (img.parentNode) img.remove(); box.appendChild(svg("image")); } });
      box.appendChild(img);
      var kids = [
        h("button", { class: "pg-vatt__media", type: "button", title: opts.title || a.name || "Foto",
          onclick: function () { ui.photoViewer(absUrl(a.fileUrl), opts.caption || a.name); } }, box)
      ];
      if (opts.cap) kids.push(h("div", { class: "pg-vatt__cap", text: opts.cap }));
      if (opts.sub) kids.push(h("div", { class: "pg-vatt__sub", text: opts.sub }));
      return h("div", { class: "pg-vatt pg-vatt--image" }, kids);
    }

    /* ---------- report detail modal ---------- */
    function detail(id) {
      var m = ui.modal({ class: "pg-modal--form", title: "Memuat laporan…",
        body: [ui.emptyState({ icon: "building", title: "Memuat…" })], footer: [] });
      store.visit(id).then(function (d) {
        if (!d || d.ok === false) { m.close(); ui.toast((d && d.error) || "Gagal memuat.", "danger"); return; }
        var r = d.visit, atts = d.attachments || [];
        ui.clear(m.body); ui.clear(m.el.querySelector(".pg-modal__footer"));
        m.el.querySelector(".pg-modal__title").textContent = r.agenda;

        function hcell(label, value) {
          return h("div", { class: "pg-kpi-rhead__cell" },
            h("div", { class: "pg-kpi-rhead__k", text: label }),
            h("div", { class: "pg-kpi-rhead__v", text: value }));
        }
        // Group by checklist item (each item's evidence stays together) —
        // photos taken before this feature existed have no tag, shown last
        // under "Foto Lainnya".
        function groupByChecklist(list) {
          var groups = {}, order = [];
          list.forEach(function (a) {
            var key = a.checklistItemLabel || "__other__";
            if (!groups[key]) { groups[key] = []; order.push(key); }
            groups[key].push(a);
          });
          return order.map(function (key) { return { label: key === "__other__" ? "Foto Lainnya" : key, items: groups[key] }; });
        }
        var gal = atts.length
          ? h("div", { class: "pg-grid", style: { gap: "12px" } }, groupByChecklist(atts).map(function (g) {
              return h("div", null,
                h("div", { class: "pg-muted", style: { fontSize: "12px", fontWeight: "700", marginBottom: "6px" },
                  text: g.label + " (" + g.items.length + ")" }),
                h("div", { class: "pg-vatt-grid" }, g.items.map(function (a) {
                  return photoTile(a, { caption: r.agenda + " · " + dateID(r.visitDate) + (g.label !== "Foto Lainnya" ? " · " + g.label : "") });
                })));
            }))
          : h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Tidak ada foto pada laporan ini." });

        ui.append(m.body, [
          h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" } },
            statusBadge(r.status),
            h("span", { class: "pg-muted", style: { fontSize: "12px" },
              text: "Dikirim " + (r.createdAt ? ui.fmtDateShortID(r.createdAt) : "—")
                + (r.reviewedBy ? " · direview oleh " + r.reviewedBy : "") })),
          h("div", { class: "pg-kpi-rhead" },
            hcell("Toko Dikunjungi", r.storeName || "—"),
            hcell("Tanggal Kunjungan", dateID(r.visitDate)),
            hcell("Karyawan", r.userName || "—"),
            hcell("Divisi", r.divisionNames || r.divisionName || "—")),
          r.note
            ? h("div", null,
                h("div", { class: "pg-field__label", style: { marginBottom: "4px" }, text: "Catatan Kunjungan" }),
                h("div", { class: "pg-notice pg-notice--muted" }, svg("edit"), h("div", { text: r.note })))
            : null,
          h("div", null,
            h("div", { class: "pg-field__label", style: { marginBottom: "6px" },
              text: "Foto Pendukung" + (atts.length ? " (" + atts.length + ")" : "") }),
            gal)
        ]);

        var foot = m.el.querySelector(".pg-modal__footer");
        foot.appendChild(ui.button({ label: "Tutup", variant: "ghost", onClick: function () { m.close(); } }));
        foot.appendChild(ui.button({ label: "Hapus Laporan", variant: "danger", icon: "trash",
          onClick: function () {
            ui.confirm({ title: "Hapus Laporan Kunjungan", tone: "danger", confirmLabel: "Hapus permanen",
              message: "Hapus laporan \"" + r.agenda + "\" milik " + (r.userName || "karyawan") + " beserta semua fotonya? Tindakan ini permanen.",
              onConfirm: function () {
                store.visitDelete(id).then(function (res) {
                  if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
                  ui.toast("Laporan dihapus.", "success"); m.close(); load();
                });
              } });
          } }));
        foot.appendChild(ui.button({
          label: r.status === "reviewed" ? "Batalkan Review" : "Tandai Direview",
          variant: r.status === "reviewed" ? "ghost" : "primary", icon: "check",
          onClick: function () {
            store.visitReview(id).then(function (res) {
              if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
              ui.toast("Status diperbarui.", "success"); m.close(); load();
            });
          } }));
      }).catch(function () { m.close(); ui.toast("Gagal memuat laporan.", "danger"); });
    }

    /* ---------- delete one report straight from the table ---------- */
    function delRow(r) {
      ui.confirm({
        title: "Hapus Laporan Kunjungan", tone: "danger", confirmLabel: "Hapus permanen",
        message: "Hapus laporan \"" + r.agenda + "\" milik " + (r.userName || "karyawan")
          + (r.storeName ? " (" + r.storeName + ")" : "")
          + " beserta semua fotonya? Tindakan ini permanen dan tidak dapat dikembalikan.",
        onConfirm: function () {
          store.visitDelete(r.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            ui.toast("Laporan kunjungan dihapus.", "success");
            load();
          });
        }
      });
    }

    /* ---------- header action (swaps per view) ---------- */
    function renderHeadAction() {
      ui.clear(headAction);
      if (state.view === "table") {
        headAction.appendChild(h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
          ui.button({ label: "Lihat Foto Kunjungan", variant: "ghost", icon: "image",
            onClick: loadGallery }),
          ui.button({ label: "Atur Checklist", variant: "ghost", icon: "checklist",
            onClick: function () { state.view = "checklist"; render(); loadChecklistItems(); } })));
      } else {
        headAction.appendChild(ui.button({
          label: state.view === "store" ? "Semua Toko" : "Kembali ke Laporan",
          variant: "ghost", icon: "chevronLeft",
          onClick: function () {
            if (state.view === "store") { state.view = "gallery"; render(); }
            else { state.view = "table"; render(); }
          } }));
      }
    }

    /* ---------- GALLERY : store cards ---------- */
    function renderGallery() {
      var g = state.gallery;
      if (!g) { host.appendChild(h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "image", title: "Memuat Foto Kunjungan…" }))); return; }
      var intro = h("div", { class: "pg-muted", style: { fontSize: "13px" },
        text: "Kumpulan seluruh foto dari laporan kunjungan yang dikirim karyawan, dikelompokkan per toko. Klik sebuah toko untuk melihat semua fotonya." });
      if (!g.stores.length) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, intro,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "image", title: "Belum ada foto kunjungan.",
            text: "Foto akan muncul di sini setelah karyawan melampirkannya pada laporan kunjungan." }))));
        return;
      }
      var grid = h("div", { class: "pg-photostores" }, g.stores.map(function (s) {
        return h("button", { class: "pg-photostore", type: "button", title: s.storeName,
          onclick: function () { openStore(s.storeName); } },
          h("div", { class: "pg-photostore__cover" }, svg("store")),
          h("div", { class: "pg-photostore__body" },
            h("div", { class: "pg-photostore__name", text: s.storeName }),
            h("div", { class: "pg-photostore__meta",
              text: s.photoCount + " foto · " + s.visitCount + " kunjungan" })));
      }));
      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, intro, grid));
    }

    /* ---------- STORE : all photos for one store ---------- */
    function renderStorePhotos() {
      var sp = state.storePhotos;
      var head = h("div", { class: "pg-section-head" },
        h("div", null,
          h("div", { class: "pg-page__crumb", text: "Foto Kunjungan" }),
          h("h2", { style: { fontSize: "18px", fontWeight: "700" }, text: state.storeSel })),
        sp ? h("span", { class: "pg-muted", style: { fontSize: "13px" }, text: (sp.photos || []).length + " foto" }) : null);

      if (!sp) { host.appendChild(h("div", { class: "pg-grid", style: { gap: "14px" } }, head,
        h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "image", title: "Memuat foto…" })))); return; }
      if (!sp.photos.length) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "14px" } }, head,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "image", title: "Belum ada foto untuk toko ini." }))));
        return;
      }
      var grid = h("div", { class: "pg-vatt-grid" }, sp.photos.map(function (p) {
        return photoTile(p, {
          cap: dateID(p.visitDate),
          title: p.agenda,
          caption: p.agenda + " · " + dateID(p.visitDate) + " · " + (p.userName || "—")
        });
      }));
      host.appendChild(h("div", { class: "pg-grid", style: { gap: "14px" } }, head, grid));
    }

    /* ---------- CHECKLIST : per-division checklist settings ---------- */
    function loadChecklistItems() {
      if (!state.checklistDivisionId) { state.checklistItems = []; render(); return; }
      state.checklistItems = null; render();
      store.visitChecklistItems(state.checklistDivisionId).then(function (d) {
        state.checklistItems = (d && d.items) || []; render();
      }).catch(function () { state.checklistItems = []; render(); });
    }
    function checklistAddItem() {
      var fLabel = ui.field({ label: "Nama Checklist", placeholder: "cth. Cek kebersihan rak & display" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Tambah Item Checklist", body: [fLabel, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Tambah", variant: "accent", icon: "plus", onClick: function () {
            var label = fLabel._control.value.trim();
            if (!label) { errEl.textContent = "Nama checklist wajib diisi."; errEl.style.display = "block"; return; }
            return store.visitChecklistItemCreate(state.checklistDivisionId, label).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menambah."; errEl.style.display = "block"; return; }
              ui.toast("Item checklist ditambahkan.", "success"); m.close(); loadChecklistItems();
            });
          } })
        ]
      });
    }
    function checklistEditItem(item) {
      var fLabel = ui.field({ label: "Nama Checklist", value: item.label });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      var m = ui.modal({
        title: "Edit Item Checklist", body: [fLabel, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: "Simpan", variant: "accent", icon: "check", onClick: function () {
            var label = fLabel._control.value.trim();
            if (!label) { errEl.textContent = "Nama checklist wajib diisi."; errEl.style.display = "block"; return; }
            return store.visitChecklistItemUpdate(item.id, label).then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
              ui.toast("Item checklist diperbarui.", "success"); m.close(); loadChecklistItems();
            });
          } })
        ]
      });
    }
    function checklistDeleteItem(item) {
      ui.confirm({
        title: "Hapus Item Checklist", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus item checklist \"" + item.label + "\"? Foto bukti yang sudah diunggah karyawan untuk item ini (di laporan mana pun) akan ikut terhapus permanen.",
        onConfirm: function () {
          store.visitChecklistItemDelete(item.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            ui.toast("Item checklist dihapus.", "success"); loadChecklistItems();
          });
        }
      });
    }
    function checklistMove(item, dir) {
      var items = state.checklistItems || [];
      var idx = items.indexOf(item);
      var swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= items.length) return;
      var reordered = items.slice();
      var tmp = reordered[idx]; reordered[idx] = reordered[swapIdx]; reordered[swapIdx] = tmp;
      state.checklistItems = reordered; render(); // optimistic
      store.visitChecklistReorder(state.checklistDivisionId, reordered.map(function (it) { return it.id; })).then(function (res) {
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengubah urutan.", "danger"); loadChecklistItems(); return; }
        state.checklistItems = res.items || reordered; render();
      });
    }
    function renderChecklistSettings() {
      var divisions = store.all("divisions");
      var divSel = h("select", { class: "pg-select",
        onchange: function (e) {
          state.checklistDivisionId = e.target.value; state.checklistItems = null; render();
          if (state.checklistDivisionId) loadChecklistItems();
        } },
        [{ value: "", label: "— Pilih Divisi —" }].concat(divisions.map(function (d) { return { value: d.id, label: d.name }; }))
          .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(state.checklistDivisionId) }); }));

      var intro = h("div", { class: "pg-muted", style: { fontSize: "13px" },
        text: "Atur daftar kegiatan (checklist) yang harus dilalui karyawan saat mengisi laporan kunjungan, per divisi. Setiap item otomatis mendapat kolom unggah foto sendiri di form karyawan." });

      var divisionField = h("div", { class: "pg-field", style: { maxWidth: "320px" } },
        h("label", { class: "pg-field__label", text: "Divisi" }), divSel);

      var listBlock;
      if (!state.checklistDivisionId) {
        listBlock = ui.notice("Pilih divisi terlebih dahulu untuk melihat/mengatur checklistnya.", { muted: true });
      } else if (state.checklistItems === null) {
        listBlock = h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "checklist", title: "Memuat checklist…" }));
      } else {
        var items = state.checklistItems;
        var rows = items.map(function (item, i) {
          return h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "10px 0",
            borderBottom: i < items.length - 1 ? "1px solid var(--pg-border)" : "none" } },
            h("div", { style: { flex: "1", minWidth: 0, fontWeight: "600", fontSize: "13.5px" }, text: item.label }),
            ui.button({ icon: "chevronUp", variant: "ghost", size: "sm", ariaLabel: "Naikkan", title: "Naikkan",
              disabled: i === 0, onClick: function () { checklistMove(item, -1); } }),
            ui.button({ icon: "chevronDown", variant: "ghost", size: "sm", ariaLabel: "Turunkan", title: "Turunkan",
              disabled: i === items.length - 1, onClick: function () { checklistMove(item, 1); } }),
            ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit",
              onClick: function () { checklistEditItem(item); } }),
            ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
              onClick: function () { checklistDeleteItem(item); } }));
        });
        listBlock = ui.card({ body: [
          items.length ? h("div", null, rows)
            : h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Belum ada item checklist untuk divisi ini." }),
          h("div", { style: { marginTop: items.length ? "14px" : "0" } },
            ui.button({ label: "Tambah Item Checklist", variant: "accent", icon: "plus", onClick: checklistAddItem }))
        ]});
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, intro, divisionField, listBlock));
    }

    /* ---------- TABLE : the report list ---------- */
    function renderTable() {
      var d = state.data;
      var storeOpts = (d && d.stores) || store.all("stores");
      var userOpts = (d && d.users) || store.all("users").map(function (u) { return { id: u.id, fullName: u.fullName }; });
      var divOpts = (d && d.divisions) || store.all("divisions");

      function sel(value, onchange, options) {
        return h("select", { class: "pg-select", onchange: function (e) { onchange(e.target.value); } },
          options.map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(value) }); }));
      }
      var tbBody = h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          h("input", { class: "pg-input", type: "date", value: state.from, "aria-label": "Dari tanggal",
            onchange: function (e) { state.from = e.target.value; load(); } }),
          h("input", { class: "pg-input", type: "date", value: state.to, "aria-label": "Sampai tanggal",
            onchange: function (e) { state.to = e.target.value; load(); } }),
          sel(state.storeId, function (v) { state.storeId = v; load(); },
            [{ value: "", label: "Semua Toko" }].concat(storeOpts.map(function (s) { return { value: s.id, label: s.name + (s.status === "inactive" ? " (nonaktif)" : "") }; }))),
          sel(state.divisionId, function (v) { state.divisionId = v; load(); },
            [{ value: "", label: "Semua Divisi" }].concat(divOpts.map(function (x) { return { value: x.id, label: x.name }; }))),
          sel(state.userId, function (v) { state.userId = v; load(); },
            [{ value: "", label: "Semua Karyawan" }].concat(userOpts.map(function (u) { return { value: u.id, label: u.fullName }; }))),
          sel(state.status, function (v) { state.status = v; load(); },
            [{ value: "", label: "Semua Status" }, { value: "submitted", label: "Terkirim" }, { value: "reviewed", label: "Direview" }])
        )
      );
      if (d) {
        function statCell(icon, tone, label, value) {
          return h("div", { class: "pg-kpi-fstat" },
            h("div", { class: "pg-kpi-fstat__ic" + (tone ? " pg-kpi-fstat__ic--" + tone : "") }, svg(icon)),
            h("div", { style: { minWidth: 0 } },
              h("div", { class: "pg-kpi-fstat__v", text: value != null ? String(value) : "—" }),
              h("div", { class: "pg-kpi-fstat__l", text: label })));
        }
        tbBody.appendChild(h("div", { class: "pg-kpi-fstats" },
          statCell("building", null, "Laporan masuk", d.summary.total),
          statCell("clock", "blue", "Menunggu ditinjau", d.summary.pending),
          statCell("checkCircle", "green", "Sudah direview", d.summary.reviewed),
          statCell("store", null, "Toko dikunjungi", d.summary.storesVisited)));
      }
      var toolbar = h("div", { class: "pg-card" }, tbBody);

      // ---- weekly cleanup warning: reports 1 week old or older ----
      var staleWarn = null;
      if (d && d.summary && d.summary.staleCount > 0) {
        var sum = d.summary;
        staleWarn = h("div", { class: "pg-card pg-stale-warn" }, h("div", { class: "pg-card__body" },
          h("div", { class: "pg-stale-warn__row" },
            h("span", { class: "pg-stale-warn__ic" }, svg("clock")),
            h("div", { style: { flex: "1", minWidth: "220px" } },
              h("div", { class: "pg-strong", text: "Pembersihan laporan kunjungan lama" }),
              h("div", { class: "pg-muted", style: { fontSize: "13px", marginTop: "2px", lineHeight: "1.6" },
                text: sum.staleCount + " laporan kunjungan sudah berumur 1 minggu atau lebih"
                  + " (kunjungan sebelum " + ui.fmtDateShortID(sum.staleBefore) + ")"
                  + (sum.stalePhotos ? " · " + sum.stalePhotos + " foto" : "")
                  + ". Sebaiknya dihapus setiap minggu untuk menghemat penyimpanan." })),
            h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } },
              ui.button({ label: state.staleOnly ? "Tampilkan semua" : "Lihat laporan lama",
                variant: "ghost", size: "sm",
                onClick: function () { state.staleOnly = !state.staleOnly; load(); } }),
              ui.button({ label: "Hapus laporan lama", variant: "danger", size: "sm", icon: "trash",
                onClick: function () { purgeStale(sum); } })))));
      }

      if (state.loading && !d) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "building", title: "Memuat Laporan Kunjungan…" }))));
        return;
      }
      if (!d) {
        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, toolbar,
          h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "building", title: "Gagal memuat.", text: "Coba muat ulang halaman." }))));
        return;
      }

      var body;
      if (!d.reports.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "building", title: "Belum ada laporan kunjungan.",
          text: "Laporan yang dikirim karyawan lewat menu Kunjungan di aplikasi akan tampil di sini." }));
      } else {
        body = ui.table({
          columns: ["Tanggal", "Karyawan", "Divisi", "Agenda Kunjungan", "Toko", "Foto", "Status", "Aksi"],
          rows: d.reports.map(function (r) {
            return {
              onClick: function () { detail(r.id); },
              cells: [
                dateID(r.visitDate),
                r.userName || "—",
                r.divisionNames || r.divisionName || "—",
                h("span", { class: "pg-strong", text: r.agenda }),
                r.storeName || "—",
                h("span", { text: r.attachmentCount ? (r.attachmentCount + " foto") : "—" }),
                statusBadge(r.status),
                h("div", { class: "pg-row-actions" },
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus laporan", title: "Hapus laporan",
                    onClick: function () { delRow(r); } }))
              ]
            };
          })
        });
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, staleWarn, toolbar,
        h("div", { class: "pg-muted", style: { fontSize: "13px" },
          text: state.staleOnly
            ? "Menampilkan hanya laporan berumur 1 minggu atau lebih. Klik baris untuk rincian, atau hapus semua sekaligus di peringatan di atas."
            : "Klik baris untuk membuka rincian & foto laporan." }),
        body));
    }

    function render() {
      ui.clear(host);
      renderHeadAction();
      if (state.view === "gallery") { renderGallery(); return; }
      if (state.view === "store") { renderStorePhotos(); return; }
      if (state.view === "checklist") { renderChecklistSettings(); return; }
      renderTable();
    }

    load();
    ui.live(load, host);
    return page([pageHead("Work Management", "Laporan Kunjungan", headAction), host]);
  };

  /* ============================================================
     MANAJEMEN TIM & DIVISI  —  MASTER DATA  (full CRUD)
     ------------------------------------------------------------
     Tabs: Karyawan · Divisi · Jabatan.
     All records use unique string IDs (never name as PK) and share
     the single store consumed by the User App (login, Profil, Tim).
     Deactivating a record never deletes historical data; the explicit
     "Hapus" action on a karyawan removes the record permanently.
     ============================================================ */
  pages.manajemenTim = function () {
    var state = { tab: "karyawan", q: "", div: "", status: "", page: 1 };
    var TABS = [
      { key: "karyawan", label: "Karyawan" },
      { key: "divisi", label: "Divisi" },
      { key: "jabatan", label: "Jabatan" }
    ];
    var STATUS_OPTS = [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }];

    var tabsHost = h("div", { class: "pg-underline-tabs" });
    var actionHost = h("div");
    var body = h("div", { style: { marginTop: "20px" } });

    /* ---------- small shared helpers ---------- */
    function normUsername(v) {
      return String(v || "").trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
    }
    function nameExists(coll, name, exceptId) {
      name = String(name || "").trim().toLowerCase();
      return store.all(coll).some(function (r) {
        return r.id !== exceptId && String(r.name).trim().toLowerCase() === name;
      });
    }
    // Options for a user-form select: active records + the currently-assigned
    // one even if it has since been deactivated (so edits don't lose data).
    function masterOptions(coll, currentId, blankLabel) {
      var seen = {};
      var opts = [{ value: "", label: blankLabel || "— Pilih —" }];
      store.activeList(coll).forEach(function (r) { seen[r.id] = 1; opts.push({ value: r.id, label: r.name }); });
      if (currentId && !seen[currentId]) {
        var r = store.find(coll, currentId);
        if (r) opts.push({ value: r.id, label: r.name + " (nonaktif)" });
      }
      return opts;
    }
    // Multi-select division picker. `preselected` = array of division ids.
    // Returns { node, selected() -> string[] }.
    function divisionChecklist(preselected) {
      var sel = (preselected || []).filter(Boolean).map(String);
      var opts = store.activeList("divisions").slice();
      sel.forEach(function (id) {
        if (!opts.some(function (o) { return String(o.id) === id; })) {
          var r = store.find("divisions", id);
          if (r) opts.push({ id: r.id, name: r.name, _inactive: true });
        }
      });
      opts.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
      var boxes = [];
      var wrap = h("div", { class: "pg-checklist" });
      if (!opts.length) {
        wrap.classList.add("pg-checklist--empty");
        wrap.appendChild(h("span", { text: "Belum ada divisi. Tambahkan di tab Divisi terlebih dahulu." }));
      } else {
        opts.forEach(function (o) {
          var cb = h("input", { type: "checkbox", value: String(o.id) });
          if (sel.indexOf(String(o.id)) >= 0) cb.checked = true;
          boxes.push(cb);
          wrap.appendChild(h("label", { class: "pg-checklist__row" }, cb,
            h("span", { text: o.name + (o._inactive ? " (nonaktif)" : "") })));
        });
      }
      return {
        node: wrap,
        selected: function () {
          return boxes.filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
        }
      };
    }
    function userDivIds(u) {
      return (u && u.divisionIds && u.divisionIds.length) ? u.divisionIds.map(String)
        : (u && u.divisionId ? [String(u.divisionId)] : []);
    }
    function fieldError(field) {
      var el = h("span", { class: "pg-field__hint", style: { color: "var(--pg-danger)", display: "none" } });
      field.appendChild(el);
      field._err = el;
      return field;
    }
    function showErr(field, msg) {
      if (!field._err) return;
      field._err.textContent = msg; field._err.style.display = msg ? "block" : "none";
      field._control && field._control.classList.toggle("pg-input--invalid", !!msg);
    }
    function clearErrs() {
      Array.prototype.slice.call(arguments).forEach(function (f) { showErr(f, ""); });
    }

    function renderTabs() {
      ui.clear(tabsHost);
      TABS.forEach(function (t) {
        tabsHost.appendChild(h("button", {
          class: "pg-underline-tab" + (t.key === state.tab ? " is-active" : ""),
          text: t.label,
          onclick: function () { state.tab = t.key; state.page = 1; renderTabs(); renderAction(); renderBody(); }
        }));
      });
    }

    function renderAction() {
      var map = {
        karyawan: { label: "Tambah Karyawan", fn: function () { employeeForm(); } },
        divisi:   { label: "Tambah Divisi",   fn: function () { masterForm("divisions", "Divisi", true); } },
        jabatan:  { label: "Tambah Jabatan",  fn: function () { masterForm("positions", "Jabatan", false); } }
      };
      var cfg = map[state.tab] || map.karyawan;
      ui.mount(actionHost, ui.button({ label: cfg.label, variant: "accent", icon: "plus", onClick: cfg.fn }));
    }

    /* ============ KARYAWAN ============ */
    function employeeForm(existing) {
      var fName = fieldError(ui.field({ label: "Nama Lengkap", value: existing ? existing.fullName : "", required: true }));
      var fUser = fieldError(ui.field({ label: "Username", required: true,
        hint: "Untuk login User App — huruf kecil, angka, titik/strip. Tanpa spasi.",
        value: existing ? existing.username : "" }));
      var fPos = fieldError(ui.field({ label: "Jabatan", type: "select",
        options: masterOptions("positions", existing && existing.positionId), value: existing ? existing.positionId : "" }));
      var fStatus = fieldError(ui.field({ label: "Status", type: "select", required: true,
        options: STATUS_OPTS, value: existing ? existing.status : "active" }));

      var divCL = divisionChecklist(existing ? userDivIds(existing) : []);
      var fDiv = fieldError(h("div", { class: "pg-field" },
        h("label", { class: "pg-field__label", text: "Divisi (bisa lebih dari satu)" }),
        h("span", { class: "pg-field__hint",
          text: "Centang setiap divisi karyawan ini. Divisi pertama yang dicentang menjadi divisi utama." }),
        divCL.node));

      var m = ui.modal({
        title: existing ? "Edit Karyawan" : "Tambah Karyawan",
        body: [
          fName, fUser, fPos, fDiv, fStatus,
          existing ? ui.notice("Mengubah username akan mengubah kredensial login karyawan ini di User App.", { muted: true }) : null
        ],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Tambah", variant: "primary", onClick: function () {
            clearErrs(fName, fUser, fPos, fDiv, fStatus);
            var name = fName._control.value.trim();
            var uname = normUsername(fUser._control.value);
            fUser._control.value = uname;
            var divIds = divCL.selected();
            // Keep the current primary division first when it is still checked.
            if (existing && existing.divisionId && divIds.indexOf(String(existing.divisionId)) >= 0) {
              divIds = [String(existing.divisionId)].concat(
                divIds.filter(function (v) { return v !== String(existing.divisionId); }));
            }
            var st = fStatus._control.value;
            var ok = true;
            if (!name) { showErr(fName, "Nama wajib diisi."); ok = false; }
            if (!uname) { showErr(fUser, "Username wajib diisi."); ok = false; }
            else if (uname.length < 3) { showErr(fUser, "Username minimal 3 karakter."); ok = false; }
            else if (store.usernameExists(uname, existing && existing.id)) { showErr(fUser, "Username sudah dipakai karyawan lain."); ok = false; }
            if (!divIds.length) { showErr(fDiv, "Pilih minimal satu divisi."); ok = false; }
            if (!st) { showErr(fStatus, "Status wajib dipilih."); ok = false; }
            if (!ok) return;

            var payload = {
              fullName: name, username: uname,
              positionId: fPos._control.value, divisionIds: divIds,
              status: st
            };
            var op = existing
              ? store.patch("users", existing.id, payload)
              : store.insert("users", Object.assign({ role: "staff" }, payload));
            return op.then(function (res) {
              if (!res || res.ok === false) {
                ui.toast((res && res.error) || "Gagal menyimpan data karyawan.", "danger");
                return;
              }
              ui.toast(existing
                ? ("Data " + name + " diperbarui.")
                : ("Karyawan ditambahkan. Username '" + uname + "' bisa langsung login ke User App."), "success");
              m.close(); renderBody();
            });
          } })
        ]
      });
    }

    function toggleUser(u) {
      if (u.status === "active") {
        ui.confirm({
          title: "Nonaktifkan karyawan",
          tone: "danger",
          confirmLabel: "Nonaktifkan",
          message: "Nonaktifkan " + u.fullName + "? Karyawan tidak akan bisa login ke User App. " +
                   "Seluruh data Todo, Absensi, dan KPI sebelumnya tetap tersimpan.",
          onConfirm: function () {
            store.patch("users", u.id, { status: "inactive" }).then(function (res) {
              if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menonaktifkan.", "danger"); return; }
              ui.toast(u.fullName + " dinonaktifkan.", "success");
              renderBody();
            });
          }
        });
      } else {
        store.patch("users", u.id, { status: "active" }).then(function (res) {
          if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengaktifkan.", "danger"); return; }
          ui.toast(u.fullName + " diaktifkan kembali.", "success");
          renderBody();
        });
      }
    }

    function deleteUser(u) {
      var todoCount = store.todosForUser(u.id).length;
      ui.confirm({
        title: "Hapus karyawan",
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: "Hapus " + u.fullName + " (@" + u.username + ") secara permanen? " +
          "Username ini tidak akan bisa login lagi dan data karyawan dihapus dari sistem." +
          (todoCount ? " " + todoCount + " todo yang pernah ditugaskan tetap tersimpan tanpa PIC." : "") +
          " Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          store.remove("users", u.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus karyawan.", "danger"); return; }
            ui.toast(u.fullName + " dihapus dari sistem.", "success");
            renderBody();
          });
        }
      });
    }


    /* Read-only detail of one employee — opened by clicking a Karyawan row. */
    function employeeDetail(u) {
      function kv(label, value) {
        return h("div", null,
          h("div", { class: "pg-field__hint", text: label }),
          value && value.nodeType ? value : h("div", { class: "pg-strong", text: (value == null || value === "") ? "—" : value }));
      }
      var ids = userDivIds(u);
      var divisiNode = ids.length
        ? h("span", { class: "pg-divs-cell" }, ids.map(function (id, i) {
            return ui.badge(store.divisionName(id), i === 0 ? "info" : "neutral");
          }))
        : h("div", { class: "pg-strong", text: store.divisionName(u.divisionId) });

      var myTodos = store.all("todos").filter(function (t) { return String(t.assigneeId) === String(u.id); });
      var myAtt   = store.allAttendance().filter(function (r) { return String(r.userId) === String(u.id); });
      var myOt    = store.allOvertime().filter(function (r) { return String(r.userId) === String(u.id); });

      var ROLE_LABEL = { super_admin: "Super Admin", admin: "Admin", manager: "Manajer", staff: "Staf" };
      var joined = u.createdAt ? ui.fmtDateWeekdayID(u.createdAt) : "—";

      var dm = ui.modal({
        title: "Detail Karyawan",
        body: [ h("div", { class: "pg-attdetail" },
          h("div", { style: { display: "flex", alignItems: "center", gap: "14px" } },
            empAvatar(u, 56),
            h("div", { style: { minWidth: "0" } },
              h("div", { class: "pg-strong", style: { fontSize: "16px" }, text: u.fullName }),
              h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "@" + u.username }),
              h("div", { style: { marginTop: "4px" } }, ui.statusBadge(u.status)))
          ),
          h("div", { class: "pg-attdetail__kv" },
            kv("Jabatan", store.positionName(u.positionId)),
            kv("Divisi", divisiNode),
            kv("Role", ROLE_LABEL[u.role] || u.role || "—"),
            kv("Bergabung", joined)
          ),
          h("div", { class: "pg-grid pg-grid--2", style: { marginTop: "4px" } },
            ui.statCard({ icon: "checklist", label: "Todo Aktif", value: myTodos.filter(function (t) { return t.status !== "done"; }).length }),
            ui.statCard({ icon: "checkCircle", tone: "green", label: "Todo Selesai", value: myTodos.filter(function (t) { return t.status === "done"; }).length }),
            ui.statCard({ icon: "clock", tone: "blue", label: "Hari Absensi", value: myAtt.length }),
            ui.statCard({ icon: "briefcase", tone: "yellow", label: "Pengajuan Lembur", value: myOt.length })
          ),
          h("div", { style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px" } },
            ui.button({ label: "Edit Data", variant: "ghost", icon: "edit", onClick: function () { dm.close(); employeeForm(u); } }))
        ) ]
      });
    }

    function karyawanTab() {
      var q = state.q.toLowerCase();
      var users = store.all("users").filter(function (u) {
        if (q && (u.fullName + " " + u.username).toLowerCase().indexOf(q) < 0) return false;
        if (state.div && userDivIds(u).indexOf(String(state.div)) < 0) return false;
        if (state.status && u.status !== state.status) return false;
        return true;
      });
      var total = store.all("users").length;

      var filterbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-filterbar" },
          h("div", { class: "pg-input-group pg-grow" },
            ui.svg("search"),
            h("input", { class: "pg-input", placeholder: "Cari nama atau username…", value: state.q,
              oninput: function (e) { state.q = e.target.value; state.page = 1; renderBody(); } })),
          selectFilter(state.div, "Semua Divisi", store.all("divisions"),
            function (v) { state.div = v; state.page = 1; renderBody(); }),
          h("select", { class: "pg-select", onchange: function (e) { state.status = e.target.value; state.page = 1; renderBody(); } },
            [{ value: "", label: "Semua Status" }].concat(STATUS_OPTS).map(function (o) {
              return h("option", { value: o.value, text: o.label, selected: o.value === state.status }); }))
        )
      ));

      var PER_PAGE = 7;
      var pageCount = Math.max(1, Math.ceil(users.length / PER_PAGE));
      if (state.page > pageCount) state.page = pageCount;
      if (state.page < 1) state.page = 1;
      var startIdx = (state.page - 1) * PER_PAGE;
      var pageUsers = users.slice(startIdx, startIdx + PER_PAGE);

      var content;
      if (!users.length) {
        content = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "users",
          title: total ? "Tidak ada karyawan yang cocok." : "Belum ada data karyawan.",
          text: total ? "Ubah kata kunci atau filter." : "Klik 'Tambah Karyawan' untuk menambahkan data.",
          action: total ? null : ui.button({ label: "Tambah Karyawan", variant: "accent", icon: "plus",
            onClick: function () { employeeForm(); } })
        }));
      } else {
        content = ui.table({
          columns: ["Nama", "Username", "Jabatan", "Divisi", "Status", "Aksi"],
          rows: pageUsers.map(function (u) {
            return {
              onClick: function () { employeeDetail(u); },
              cells: [
                h("div", { style: { display: "flex", alignItems: "center", gap: "10px", minWidth: "0" } },
                  empAvatar(u, 34),
                  h("span", { class: "pg-strong", text: u.fullName })),
                h("code", { text: u.username }),
                store.positionName(u.positionId),
                (function () {
                  var ids = userDivIds(u);
                  if (ids.length <= 1) return store.divisionName(u.divisionId);
                  return h("span", { class: "pg-divs-cell" }, ids.map(function (id, i) {
                    return ui.badge(store.divisionName(id), i === 0 ? "info" : "neutral");
                  }));
                })(),
                ui.statusBadge(u.status),
                h("div", { class: "pg-rowactions" },
                  ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit karyawan",
                    onClick: function () { employeeForm(u); } }),
                  ui.button({
                    icon: u.status === "active" ? "close" : "check",
                    variant: u.status === "active" ? "danger" : "ghost", size: "sm",
                    ariaLabel: u.status === "active" ? "Nonaktifkan" : "Aktifkan",
                    title: u.status === "active" ? "Nonaktifkan karyawan" : "Aktifkan karyawan",
                    onClick: function () { toggleUser(u); }
                  }),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus permanen",
                    onClick: function () { deleteUser(u); } })
                )
              ]
            };
          })
        });
      }
      var pagerEl = users.length ? ui.pager({
        page: state.page, pageCount: pageCount,
        info: "Halaman " + state.page + " dari " + pageCount,
        onPage: function (n) { state.page = n; renderBody(); }
      }) : null;

      return h("div", { class: "pg-grid", style: { gap: "16px" } },
        filterbar,
        h("div", { class: "pg-muted", style: { fontSize: "13px" },
          text: users.length
            ? "Menampilkan " + (startIdx + 1) + "–" + (startIdx + pageUsers.length) + " dari " + users.length + " karyawan"
              + (users.length !== total ? " (dari total " + total + ")" : "")
            : "Menampilkan 0 dari " + total + " karyawan" }),
        content,
        pagerEl);
    }

    function selectFilter(value, blankLabel, records, onChange) {
      return h("select", { class: "pg-select", onchange: function (e) { onChange(e.target.value); } },
        [{ value: "", label: blankLabel }].concat(records.map(function (r) { return { value: r.id, label: r.name }; }))
          .map(function (o) { return h("option", { value: o.value, text: o.label, selected: o.value === value }); }));
    }

    /* ============ DIVISI / CABANG / JABATAN (shared form) ============ */
    function masterForm(coll, singular, withDescription, existing) {
      var fName = fieldError(ui.field({ label: "Nama " + singular, required: true, value: existing ? existing.name : "" }));
      var fDesc = withDescription
        ? ui.field({ label: "Deskripsi", type: "textarea", value: existing ? (existing.description || "") : "" })
        : null;
      var fStatus = fieldError(ui.field({ label: "Status", type: "select", required: true,
        options: STATUS_OPTS, value: existing ? existing.status : "active" }));

      var m = ui.modal({
        title: (existing ? "Edit " : "Tambah ") + singular,
        body: [fName, fDesc, fStatus].filter(Boolean),
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Tambah", variant: "primary", onClick: function () {
            clearErrs(fName, fStatus);
            var name = fName._control.value.trim();
            var ok = true;
            if (!name) { showErr(fName, "Nama " + singular.toLowerCase() + " wajib diisi."); ok = false; }
            else if (nameExists(coll, name, existing && existing.id)) { showErr(fName, singular + " dengan nama ini sudah ada."); ok = false; }
            if (!fStatus._control.value) { showErr(fStatus, "Status wajib dipilih."); ok = false; }
            if (!ok) return;

            var payload = { name: name, status: fStatus._control.value };
            if (withDescription) payload.description = fDesc._control.value.trim();
            var op = existing ? store.patch(coll, existing.id, payload) : store.insert(coll, payload);
            return op.then(function (res) {
              if (!res || res.ok === false) {
                ui.toast((res && res.error) || ("Gagal menyimpan " + singular.toLowerCase() + "."), "danger");
                return;
              }
              ui.toast(singular + (existing ? " diperbarui." : " ditambahkan."), "success");
              m.close(); renderBody();
            });
          } })
        ]
      });
    }

    function deleteMaster(coll, singular, rec, memberCount) {
      var low = singular.toLowerCase();
      ui.confirm({
        title: "Hapus " + low,
        tone: "danger",
        confirmLabel: "Hapus permanen",
        message: memberCount
          ? "\"" + rec.name + "\" masih dipakai " + memberCount + " karyawan. Pindahkan karyawannya ke " +
            low + " lain terlebih dahulu sebelum menghapus."
          : "Hapus " + low + " \"" + rec.name + "\" secara permanen? Tindakan ini tidak dapat dibatalkan.",
        onConfirm: function () {
          if (memberCount) { ui.toast(singular + " tidak bisa dihapus selama masih ada karyawan di dalamnya.", "danger"); return; }
          store.remove(coll, rec.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || ("Gagal menghapus " + low + "."), "danger"); return; }
            ui.toast(singular + " \"" + rec.name + "\" dihapus.", "success");
            renderBody();
          });
        }
      });
    }

    function masterTab(coll, singular, withDescription, countFn) {
      var rows = store.all(coll);
      var head = h("div", { class: "pg-section-head" },
        h("div", null,
          h("h3", { text: singular, style: { fontSize: "16px" } }),
          h("p", { class: "pg-muted", style: { fontSize: "13px" },
            text: rows.length + " " + singular.toLowerCase() + " terdaftar · " +
              rows.filter(function (r) { return r.status === "active"; }).length + " aktif" }))
      );

      var cols = ["Nama " + singular];
      if (withDescription) cols.push("Deskripsi");
      cols.push("Karyawan", "Status", "Aksi");

      var content = !rows.length
        ? h("div", { class: "pg-table-wrap" }, ui.emptyState({
            icon: "grid", title: "Belum ada " + singular.toLowerCase() + ".",
            text: "Klik 'Tambah " + singular + "' untuk menambahkan.",
            action: ui.button({ label: "Tambah " + singular, variant: "accent", icon: "plus",
              onClick: function () { masterForm(coll, singular, withDescription); } })
          }))
        : ui.table({
            columns: cols,
            rows: rows.map(function (r) {
              var count = countFn(r.id);
              var cells = [h("span", { class: "pg-strong", text: r.name })];
              if (withDescription) cells.push(r.description || "—");
              cells.push(
                count + " orang",
                ui.statusBadge(r.status),
                h("div", { class: "pg-rowactions" },
                  ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit " + singular.toLowerCase(),
                    onClick: function () { masterForm(coll, singular, withDescription, r); } }),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus " + singular.toLowerCase(),
                    onClick: function () { deleteMaster(coll, singular, r, count); } })
                )
              );
              return cells;
            })
          });
      return h("div", { class: "pg-grid", style: { gap: "16px" } }, head, content);
    }

    function renderBody() {
      var node;
      if (state.tab === "karyawan") node = karyawanTab();
      else if (state.tab === "divisi") node = masterTab("divisions", "Divisi", true, function (id) { return store.usersInDivision(id).length; });
      else node = masterTab("positions", "Jabatan", false, function (id) { return store.usersInPosition(id).length; });
      ui.mount(body, node);
    }

    renderTabs(); renderAction(); renderBody();
    ui.live(function () { renderAction(); renderBody(); }, body);
    return page([
      pageHead("Organization", "Manajemen Tim", actionHost),
      h("div", { class: "pg-card", style: { padding: "4px 20px" } }, tabsHost),
      body
    ]);
  };

  /* ============================================================
     MANAJEMEN TOKO  (daftar toko yang dilaporkan di KPI)
     ============================================================ */
  pages.manajemenToko = function () {
    if (!PG.auth.can("org.manage")) {
      return page([pageHead("Organization", "Manajemen Toko"),
        ui.notice("Anda tidak memiliki akses untuk mengelola data toko.")]);
    }
    var state = { q: "", status: "" };
    var host = h("div");

    function nameTaken(name, exceptId) {
      name = String(name || "").trim().toLowerCase();
      return store.all("stores").some(function (s) {
        return String(s.id) !== String(exceptId) && String(s.name).trim().toLowerCase() === name;
      });
    }

    function storeForm(existing) {
      var fName = ui.field({ label: "Nama Toko", required: true, placeholder: "cth. Premiere Sayang Istri",
        value: existing ? existing.name : "" });
      var fDesc = ui.field({ label: "Alamat / Keterangan (opsional)", type: "textarea",
        placeholder: "Alamat toko atau catatan singkat…", value: existing ? (existing.description || "") : "" });
      var fStatus = ui.field({ label: "Status", type: "select",
        options: [{ value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }],
        value: existing ? existing.status : "active" });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });

      var m = ui.modal({
        title: existing ? "Edit Toko" : "Tambah Toko",
        body: [fName, fDesc, fStatus, errEl],
        footer: [
          ui.button({ label: "Batal", variant: "ghost", onClick: function () { m.close(); } }),
          ui.button({ label: existing ? "Simpan" : "Tambah", variant: "primary", onClick: function () {
            var name = fName._control.value.trim();
            if (!name) { errEl.textContent = "Nama toko wajib diisi."; errEl.style.display = "block"; return; }
            if (nameTaken(name, existing && existing.id)) { errEl.textContent = "Toko dengan nama ini sudah ada."; errEl.style.display = "block"; return; }
            var payload = { name: name, description: fDesc._control.value.trim(), status: fStatus._control.value };
            var op = existing ? store.patch("stores", existing.id, payload) : store.insert("stores", payload);
            return op.then(function (res) {
              if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan toko."; errEl.style.display = "block"; return; }
              ui.toast(existing ? "Toko diperbarui." : "Toko ditambahkan.", "success");
              m.close(); render();
            });
          } })
        ]
      });
    }

    function toggle(s) {
      var to = s.status === "active" ? "inactive" : "active";
      store.patch("stores", s.id, { status: to }).then(function (res) {
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal.", "danger"); return; }
        ui.toast(to === "active" ? "Toko diaktifkan." : "Toko dinonaktifkan.", "success"); render();
      });
    }
    function del(s) {
      ui.confirm({ title: "Hapus Toko", tone: "danger", confirmLabel: "Hapus",
        message: "Hapus toko \"" + s.name + "\"? Jika sudah dipakai di laporan KPI, nonaktifkan saja.",
        onConfirm: function () {
          store.remove("stores", s.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus.", "danger"); return; }
            ui.toast("Toko dihapus.", "success"); render();
          });
        } });
    }

    function render() {
      ui.clear(host);
      var all = store.all("stores").slice().sort(function (a, b) {
        if (a.status !== b.status) return a.status === "active" ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      });
      var q = state.q.trim().toLowerCase();
      var rows = all.filter(function (s) {
        if (state.status && s.status !== state.status) return false;
        if (q && (s.name + " " + (s.description || "")).toLowerCase().indexOf(q) < 0) return false;
        return true;
      });

      var strip = ui.statStrip([
        { icon: "store", label: "Total Toko", value: all.length },
        { icon: "checkCircle", tone: "green", label: "Aktif", value: all.filter(function (s) { return s.status === "active"; }).length },
        { icon: "info", tone: "yellow", label: "Nonaktif", value: all.filter(function (s) { return s.status === "inactive"; }).length }
      ]);

      var toolbar = h("div", { class: "pg-card" }, h("div", { class: "pg-card__body" },
        h("div", { class: "pg-toolbar" },
          h("div", { class: "pg-toolbar__search" },
            h("input", { class: "pg-input", type: "search", placeholder: "Cari nama toko / alamat…", value: state.q,
              oninput: function (e) { state.q = e.target.value; render(); } })),
          h("select", { class: "pg-select", onchange: function (e) { state.status = e.target.value; render(); } },
            [{ value: "", label: "Semua Status" }, { value: "active", label: "Aktif" }, { value: "inactive", label: "Nonaktif" }]
              .map(function (o) { return h("option", { value: o.value, text: o.label, selected: o.value === state.status }); })),
          ui.button({ label: "Tambah Toko", variant: "accent", icon: "plus", onClick: function () { storeForm(); } })
        )
      ));

      var body;
      if (!all.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({
          icon: "store", title: "Belum ada data toko.",
          text: "Tambahkan toko-toko yang dikelola perusahaan. Karyawan akan memilih toko ini saat membuat laporan KPI.",
          action: ui.button({ label: "Tambah Toko", variant: "accent", icon: "plus", onClick: function () { storeForm(); } })
        }));
      } else if (!rows.length) {
        body = h("div", { class: "pg-table-wrap" }, ui.emptyState({ icon: "store", title: "Tidak ada toko untuk pencarian ini." }));
      } else {
        body = ui.table({
          columns: ["Nama Toko", "Alamat / Keterangan", "Status", "Aksi"],
          rows: rows.map(function (s) {
            return {
              cells: [
                h("span", { class: "pg-strong", text: s.name }),
                h("span", { class: "pg-muted", text: s.description || "—" }),
                ui.statusBadge(s.status),
                h("div", { class: "pg-row-actions" },
                  ui.button({ icon: "edit", variant: "ghost", size: "sm", ariaLabel: "Edit", title: "Edit",
                    onClick: function () { storeForm(s); } }),
                  ui.button({ label: s.status === "active" ? "Nonaktifkan" : "Aktifkan", variant: "ghost", size: "sm",
                    onClick: function () { toggle(s); } }),
                  ui.button({ icon: "trash", variant: "danger", size: "sm", ariaLabel: "Hapus", title: "Hapus",
                    onClick: function () { del(s); } }))
              ]
            };
          })
        });
      }

      host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, strip, toolbar, body));
    }

    render();
    ui.live(render, host);
    return page([
      pageHead("Organization", "Manajemen Toko",
        ui.button({ label: "Tambah Toko", variant: "accent", icon: "plus", onClick: function () { storeForm(); } })),
      host
    ]);
  };

  /* ============================================================
     PENGATURAN
     ============================================================ */
  pages.pengaturan = function () {
    var state = { tab: "perusahaan" };
    var TABS = [
      { key: "perusahaan", label: "Profil Perusahaan", icon: "building" },
      { key: "fitur", label: "Akses Fitur", icon: "sliders" },
      { key: "update", label: "Info Update", icon: "megaphone" },
      { key: "notifikasi", label: "Notifikasi", icon: "bell" },
      { key: "akun", label: "Akun Admin", icon: "user" },
      { key: "keamanan", label: "Keamanan", icon: "shield" }
    ];
    var navHost = h("div", { class: "pg-settings-nav" });
    var panel = h("div");
    var adminData = null;      // cached { name, username, email, role, lastLoginAt }

    var ROLE_LABEL = { super_admin: "Super Admin", admin: "Admin", manager: "Manajer" };

    function renderNav() {
      ui.clear(navHost);
      TABS.forEach(function (t) {
        navHost.appendChild(h("button", {
          class: "pg-settings-nav__item" + (t.key === state.tab ? " is-active" : ""),
          onclick: function () { state.tab = t.key; renderNav(); renderPanel(); }
        }, svg(t.icon), h("span", { text: " " + t.label })));
      });
    }

    /* ---------- Profil Perusahaan ---------- */
    function perusahaanPanel() {
      var canEdit = PG.auth.can("system.settings.edit");
      var s = store.getSystemSettings();
      var fName = ui.field({ label: "Nama Perusahaan", value: s.companyName, disabled: !canEdit });
      var fTz = ui.field({ label: "Zona Waktu", type: "select", value: s.timezone, disabled: !canEdit, options: [
        { value: "Asia/Jakarta", label: "WIB — Asia/Jakarta" },
        { value: "Asia/Makassar", label: "WITA — Asia/Makassar" },
        { value: "Asia/Jayapura", label: "WIT — Asia/Jayapura" }
      ]});
      var fLocale = ui.field({ label: "Format Bahasa & Angka", type: "select", value: s.locale, disabled: !canEdit, options: [
        { value: "id-ID", label: "Indonesia (id-ID)" },
        { value: "en-US", label: "English (en-US)" }
      ]});
      var fWeek = ui.field({ label: "Awal Minggu", type: "select", value: s.weekStart, disabled: !canEdit, options: [
        { value: "mon", label: "Senin" },
        { value: "sun", label: "Minggu" }
      ]});
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      return ui.card({ body: [
        h("h3", { text: "Profil Perusahaan", style: { fontSize: "16px" } }),
        h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "-4px" },
          text: "Identitas perusahaan & preferensi tampilan yang dipakai di seluruh aplikasi." }),
        h("div", { class: "pg-grid pg-grid--2" }, fName, fTz, fLocale, fWeek),
        errEl,
        canEdit ? h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Simpan Perubahan", variant: "accent", icon: "check", onClick: function () {
            errEl.style.display = "none";
            var name = fName._control.value.trim();
            if (!name) { errEl.textContent = "Nama perusahaan wajib diisi."; errEl.style.display = "block"; return; }
            store.saveSystemSettings({
              companyName: name, timezone: fTz._control.value,
              locale: fLocale._control.value, weekStart: fWeek._control.value
            }).then(function (res) {
              if (res && res.ok === false) { ui.toast(res.error || "Gagal menyimpan pengaturan.", "danger"); return; }
              ui.toast("Pengaturan perusahaan tersimpan.", "success");
            });
          } }))
          : ui.notice("Hanya Super Admin yang dapat mengubah profil perusahaan.", { muted: true })
      ]});
    }

    /* ---------- Akses Fitur (per divisi + pengecualian per karyawan) ---------- */
    function fiturPanel() {
      var host = h("div");
      var st2 = { matrix: null, catalog: null, userId: "", userOverrides: null, userEffective: null };

      function loadMatrix() {
        store.divisionFeatures().then(function (d) {
          st2.matrix = (d && d.matrix) || [];
          st2.catalog = (d && d.catalog) || {};
          paint();
        });
      }
      function loadUserFeatures(userId) {
        if (!userId) { st2.userOverrides = null; st2.userEffective = null; paint(); return; }
        store.userFeatures(userId).then(function (d) {
          st2.userOverrides = (d && d.overrides) || {};
          st2.userEffective = (d && d.effective) || {};
          paint();
        });
      }
      function saveMatrix(btn) {
        var items = [];
        st2.matrix.forEach(function (row) {
          Object.keys(row.features).forEach(function (key) {
            items.push({ divisionId: row.divisionId, featureKey: key, enabled: row.features[key] });
          });
        });
        btn.disabled = true;
        store.saveDivisionFeatures(items).then(function (res) {
          btn.disabled = false;
          if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menyimpan.", "danger"); return; }
          ui.toast("Akses fitur per divisi tersimpan.", "success");
        });
      }

      function paint() {
        ui.clear(host);
        var keys = Object.keys(st2.catalog || {});

        var matrixCard;
        if (!st2.matrix) {
          matrixCard = ui.card({ body: [ui.emptyState({ icon: "sliders", title: "Memuat…" })] });
        } else if (!keys.length) {
          matrixCard = ui.card({ body: [
            h("h3", { text: "Akses Fitur per Divisi", style: { fontSize: "16px" } }),
            ui.notice("Belum ada fitur opsional yang bisa diatur.", { muted: true })
          ]});
        } else {
          var totalFeat = keys.length;

          var divCards = st2.matrix.map(function (row) {
            var ctrls = [];
            var countEl = h("span", { class: "pg-featacc__count" });
            function refreshCount() {
              var on = keys.filter(function (k) { return row.features[k]; }).length;
              countEl.textContent = on + "/" + totalFeat + " aktif";
              countEl.classList.toggle("is-full", on === totalFeat);
              countEl.classList.toggle("is-none", on === 0);
            }
            var bulkBtn = h("button", { type: "button", class: "pg-featacc__bulk",
              onclick: function () {
                var makeOn = ctrls.some(function (c) { return !row.features[c.k]; });
                ctrls.forEach(function (c) {
                  row.features[c.k] = makeOn;
                  c.input.checked = makeOn;
                  c.rEl.classList.toggle("is-on", makeOn);
                });
                bulkBtn.textContent = makeOn ? "Kosongkan" : "Pilih semua";
                refreshCount();
              } });
            var rowEls = keys.map(function (k) {
              var input = h("input", { type: "checkbox", checked: !!row.features[k] });
              var rEl = h("label", { class: "pg-featacc__row" + (row.features[k] ? " is-on" : "") },
                h("span", { class: "pg-featacc__lbl", text: st2.catalog[k].label }),
                h("span", { class: "pg-switch" }, input, h("span", { class: "pg-switch__track" })));
              input.addEventListener("change", function () {
                row.features[k] = input.checked;
                rEl.classList.toggle("is-on", input.checked);
                bulkBtn.textContent = keys.every(function (kk) { return row.features[kk]; }) ? "Kosongkan" : "Pilih semua";
                refreshCount();
              });
              ctrls.push({ k: k, input: input, rEl: rEl });
              return rEl;
            });
            bulkBtn.textContent = keys.every(function (k) { return row.features[k]; }) ? "Kosongkan" : "Pilih semua";
            refreshCount();
            return h("div", { class: "pg-featacc__card" },
              h("div", { class: "pg-featacc__cardhead" },
                h("span", { class: "pg-featacc__divname", text: row.divisionName }),
                countEl,
                bulkBtn),
              h("div", { class: "pg-featacc__rows" }, rowEls));
          });

          var saveBtn = ui.button({ label: "Simpan Akses Fitur", variant: "accent", icon: "check",
            onClick: function () { saveMatrix(this); } });
          matrixCard = ui.card({ body: [
            h("h3", { text: "Akses Fitur per Divisi", style: { fontSize: "16px" } }),
            h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "-4px" },
              text: "Atur fitur opsional yang muncul di menu User App tiap divisi. Fitur yang dimatikan hanya disembunyikan dari menu — Dashboard, Absensi, Momen, dan Profil selalu tampil untuk semua karyawan." }),
            h("div", { class: "pg-featacc__grid" }, divCards),
            h("div", { class: "pg-featacc__savebar" },
              h("span", { class: "pg-featacc__savehint", text: "Perubahan berlaku setelah Anda menekan Simpan." }),
              saveBtn)
          ]});
        }

        var userOpts = store.all("users").slice().sort(function (a, b) { return (a.fullName || "").localeCompare(b.fullName || ""); });
        var userSel = h("select", { class: "pg-select",
          onchange: function (e) { st2.userId = e.target.value; loadUserFeatures(e.target.value); } },
          [{ value: "", label: "— Pilih Karyawan —" }].concat(userOpts.map(function (u) { return { value: u.id, label: u.fullName }; }))
            .map(function (o) { return h("option", { value: o.value, text: o.label, selected: String(o.value) === String(st2.userId) }); }));

        var exceptionBody;
        if (!st2.userId) {
          exceptionBody = ui.notice("Pilih karyawan untuk mengatur pengecualian akses fitur khusus orang ini.", { muted: true });
        } else if (!st2.userEffective) {
          exceptionBody = h("div", { class: "pg-muted", style: { fontSize: "13px" }, text: "Memuat…" });
        } else {
          var rows2 = keys.map(function (k) {
            var hasOverride = Object.prototype.hasOwnProperty.call(st2.userOverrides, k);
            var curValue = hasOverride ? (st2.userOverrides[k] ? "on" : "off") : "default";
            var eff = !!(st2.userEffective && st2.userEffective[k]);
            var sel = h("select", { class: "pg-select" },
              [
                { value: "default", label: "Ikuti Divisi" },
                { value: "on", label: "Selalu tampilkan" },
                { value: "off", label: "Selalu sembunyikan" }
              ].map(function (o) {
                return h("option", { value: o.value, text: o.label, selected: o.value === curValue });
              }));
            sel.addEventListener("change", function () {
              var v = sel.value;
              var payload = v === "default" ? null : (v === "on");
              store.saveUserFeature(st2.userId, k, payload).then(function (res) {
                if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menyimpan.", "danger"); return; }
                ui.toast("Pengecualian fitur tersimpan.", "success");
                loadUserFeatures(st2.userId);
              });
            });
            return h("div", { class: "pg-featacc__exrow" },
              h("div", { class: "pg-featacc__exlbl" },
                h("span", { class: "pg-featacc__extitle", text: st2.catalog[k].label }),
                h("span", { class: "pg-featacc__exeff " + (eff ? "is-on" : "is-off"),
                  text: (hasOverride ? "Pengecualian aktif · " : "Ikut aturan divisi · ") + (eff ? "terlihat" : "tersembunyi") })),
              sel);
          });
          exceptionBody = h("div", { class: "pg-featacc__exlist" }, rows2);
        }

        var exceptionCard = ui.card({ body: [
          h("h3", { text: "Pengecualian Per Karyawan", style: { fontSize: "16px" } }),
          h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "-4px" },
            text: "Untuk kasus khusus di luar aturan divisi — mis. satu karyawan butuh akses tambahan, atau justru dikecualikan dari fitur yang aktif di divisinya." }),
          h("div", { class: "pg-field", style: { maxWidth: "320px" } },
            h("label", { class: "pg-field__label", text: "Karyawan" }), userSel),
          exceptionBody
        ]});

        host.appendChild(h("div", { class: "pg-grid", style: { gap: "16px" } }, matrixCard, exceptionCard));
      }

      loadMatrix();
      paint();
      return host;
    }

    /* ---------- Info Update (broadcast pembaruan aplikasi) ---------- */
    function updatePanel() {
      var fTitle = ui.field({ label: "Judul Pemberitahuan", placeholder: "Contoh: Pembaruan Fitur Momen Kerja" });
      var fDesc = ui.field({ label: "Deskripsi Pemberitahuan", type: "textarea",
        placeholder: "Contoh: Ada tampilan baru di fitur Momen Kerja. Yuk refresh aplikasinya!" });
      fDesc._control.rows = 4;
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      function bad(msg) { errEl.textContent = msg; errEl.style.display = "block"; }

      var sendBtn = ui.button({ label: "Kirim Pemberitahuan", variant: "accent", icon: "megaphone", onClick: function () {
        errEl.style.display = "none";
        var title = fTitle._control.value.trim();
        var desc = fDesc._control.value.trim();
        if (!title) return bad("Judul pemberitahuan wajib diisi.");
        if (!desc) return bad("Deskripsi pemberitahuan wajib diisi.");
        var btn = this;
        ui.confirm({
          title: "Kirim Info Update?",
          message: "Pemberitahuan ini akan langsung dikirim ke SEMUA karyawan dan admin lain (notifikasi + popup di aplikasi mereka, meminta refresh). Lanjutkan?",
          confirmLabel: "Ya, Kirim",
          onConfirm: function () {
            btn.disabled = true;
            store.appUpdateSend(title, desc).then(function (res) {
              btn.disabled = false;
              if (!res || res.ok === false) { bad((res && res.error) || "Gagal mengirim pemberitahuan."); return; }
              fTitle._control.value = ""; fDesc._control.value = "";
              ui.toast("Info update terkirim ke semua karyawan & admin.", "success");
            }, function () {
              btn.disabled = false;
              bad("Gagal mengirim pemberitahuan.");
            });
          }
        });
      } });

      return ui.card({ body: [
        h("h3", { text: "Info Update Aplikasi", style: { fontSize: "16px" } }),
        h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "-4px" },
          text: "Beri tahu semua karyawan & admin lain ada pembaruan fitur — muncul sebagai notifikasi yang membuka popup berisi pesan ini, lengkap tombol Refresh Aplikasi." }),
        fTitle,
        fDesc,
        errEl,
        h("div", { style: { display: "flex", justifyContent: "flex-end" } }, sendBtn)
      ]});
    }

    /* ---------- Notifikasi (on/off per jenis + pengingat deadline) ---------- */
    function switchInput(opts) {
      opts = opts || {};
      return h("label", { class: "pg-switch", title: opts.title || "" },
        h("input", { type: "checkbox", checked: !!opts.checked, disabled: !!opts.disabled,
          onchange: function (e) { opts.onChange && opts.onChange(e.target.checked); } }),
        h("span", { class: "pg-switch__track" }));
    }
    var OFFSET_UNIT_LABEL = { minute: "Menit", hour: "Jam", day: "Hari" };
    var CATEGORY_ICON = {
      "Todo": "checklist", "Program Kerja": "target", "Absensi & Lembur": "clock",
      "Izin": "doc", "KPI": "chart", "Kunjungan": "store", "Job Desk": "briefcase",
      "Waktu Sholat": "moon", "Momen Kerja": "image", "Info Aplikasi": "megaphone",
      "Pengeluaran": "wallet", "Resi Gudang": "archive", "Jadwal Piket": "calendar", "Chat": "message"
    };
    function notifikasiPanel() {
      var host = h("div");
      var items = null;   // working copy, mutated in place by the controls below

      function groupByCategory(list) {
        var order = [], byCat = {};
        list.forEach(function (it) {
          if (!byCat[it.category]) { byCat[it.category] = []; order.push(it.category); }
          byCat[it.category].push(it);
        });
        return order.map(function (cat) { return { category: cat, items: byCat[cat] }; });
      }

      function row(it) {
        var offsetEl = null;
        if (it.reminder) {
          var num = h("input", { type: "number", min: "1", max: "9999", value: String(it.offsetValue), disabled: !it.enabled,
            onchange: function (e) {
              var v = parseInt(e.target.value, 10);
              it.offsetValue = (isFinite(v) && v > 0) ? v : it.offsetValue;
              e.target.value = String(it.offsetValue);
            }
          });
          var sel = h("select", { disabled: !it.enabled, onchange: function (e) { it.offsetUnit = e.target.value; } },
            ["minute", "hour", "day"].map(function (u) {
              return h("option", { value: u, selected: u === it.offsetUnit, text: OFFSET_UNIT_LABEL[u] });
            }));
          offsetEl = h("div", { class: "pg-notifset__offset" },
            h("span", { text: "sebelum:" }), num, sel);
        }
        return h("div", { class: "pg-notifset__row" + (it.enabled ? " is-on" : "") },
          switchInput({ checked: it.enabled, title: it.enabled ? "Aktif — klik untuk nonaktifkan" : "Nonaktif — klik untuk aktifkan",
            onChange: function (v) { it.enabled = v; renderList(); updateSummary(); } }),
          h("div", { class: "pg-notifset__label" }, h("div", { text: it.label })),
          offsetEl);
      }

      var summaryEl = h("div", { class: "pg-notifset__summary" });
      var listHost = h("div", { class: "pg-notifset__grid" });
      var saveHint = h("div", { class: "pg-notifset__savehint" });
      var saveBtn = ui.button({ label: "Simpan Pengaturan", variant: "accent", icon: "check", onClick: function () {
        var btn = this; btn.disabled = true;
        PG.store.api("notification-settings", { method: "PUT", body: { items: items } }).then(function (res) {
          btn.disabled = false;
          if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menyimpan pengaturan.", "danger"); return; }
          items = res.items || items;
          renderList(); updateSummary();
          ui.toast("Pengaturan notifikasi tersimpan.", "success");
        }, function () {
          btn.disabled = false;
          ui.toast("Gagal menyimpan pengaturan.", "danger");
        });
      } });
      var saveBar = h("div", { class: "pg-notifset__savebar" }, saveHint, saveBtn);

      function updateSummary() {
        var total = items.length, on = items.filter(function (it) { return it.enabled; }).length;
        summaryEl.textContent = on + " dari " + total + " aktif";
        saveHint.textContent = "Perubahan berlaku setelah Anda menekan Simpan.";
      }

      function renderList() {
        ui.clear(listHost);
        groupByCategory(items).forEach(function (g) {
          var onCount = g.items.filter(function (it) { return it.enabled; }).length;
          listHost.appendChild(h("div", { class: "pg-notifset__cat" },
            h("div", { class: "pg-notifset__cathead" },
              h("span", { class: "pg-notifset__cathead-ic" }, svg(CATEGORY_ICON[g.category] || "bell")),
              h("span", { class: "pg-notifset__cathead-txt", text: g.category }),
              h("span", { class: "pg-notifset__cathead-count", text: onCount + "/" + g.items.length })),
            h("div", { class: "pg-notifset__rows" }, g.items.map(row))));
        });
      }

      function paintLoaded() {
        ui.clear(host);
        host.appendChild(ui.card({ body: [
          h("div", { class: "pg-notifset__head" },
            h("div", { class: "pg-notifset__headtxt" },
              h("h3", { text: "Pengaturan Notifikasi", style: { fontSize: "16px", margin: "0 0 4px" } }),
              h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "0" },
                text: "Aktifkan/nonaktifkan tiap jenis notifikasi. Untuk pengingat (deadline todo/program), atur berapa lama sebelum jatuh tempo notifikasi dikirim." })),
            summaryEl),
          listHost,
          saveBar
        ]}));
        renderList();
        updateSummary();
      }

      host.appendChild(ui.card({ body: [ui.emptyState({ icon: "bell", title: "Memuat pengaturan notifikasi…" })] }));
      PG.store.api("notification-settings").then(function (res) {
        items = (res && res.items) || [];
        if (state.tab === "notifikasi") paintLoaded();
      }, function () {
        if (state.tab === "notifikasi") {
          ui.clear(host);
          host.appendChild(ui.notice("Gagal memuat pengaturan notifikasi.", { muted: true }));
        }
      });
      return host;
    }

    /* ---------- Akun Admin ---------- */
    function readonlyRow(label, value) {
      return h("div", { class: "pg-kpi-rhead__cell" },
        h("div", { class: "pg-kpi-rhead__k", text: label }),
        h("div", { class: "pg-kpi-rhead__v", text: value || "—" }));
    }
    function akunPanel() {
      var host = h("div");
      function paint() {
        ui.clear(host);
        if (!adminData) {
          host.appendChild(ui.card({ body: [ui.emptyState({ icon: "user", title: "Memuat akun…" })] }));
          store.adminProfile().then(function (d) {
            adminData = (d && d.profile) || null;
            if (state.tab === "akun") paint();
          }).catch(function () { host.appendChild(ui.notice("Gagal memuat data akun.", { muted: true })); });
          return;
        }
        var a = adminData;
        var fName = ui.field({ label: "Nama", value: a.name, required: true });
        var fEmail = ui.field({ label: "Email", type: "email", value: a.email || "",
          hint: "Boleh dikosongkan. Dipakai sebagai alternatif login." });
        var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
        host.appendChild(ui.card({ body: [
          h("h3", { text: "Akun Admin", style: { fontSize: "16px" } }),
          h("div", { class: "pg-kpi-rhead", style: { marginBottom: "14px" } },
            readonlyRow("Username", "@" + a.username),
            readonlyRow("Role", ROLE_LABEL[a.role] || a.role),
            readonlyRow("Login Terakhir", a.lastLoginAt ? ui.fmtDateShortID(a.lastLoginAt) : "—")),
          h("div", { class: "pg-grid pg-grid--2" }, fName, fEmail),
          errEl,
          h("div", { style: { display: "flex", justifyContent: "flex-end" } },
            ui.button({ label: "Simpan", variant: "accent", icon: "check", onClick: function () {
              errEl.style.display = "none";
              var name = fName._control.value.trim();
              if (!name) { errEl.textContent = "Nama wajib diisi."; errEl.style.display = "block"; return; }
              return store.adminProfileSave({ name: name, email: fEmail._control.value.trim() }).then(function (res) {
                if (!res || res.ok === false) { errEl.textContent = (res && res.error) || "Gagal menyimpan."; errEl.style.display = "block"; return; }
                adminData = (res.data && res.data.profile) || adminData;
                if (adminData) { adminData.name = name; adminData.email = fEmail._control.value.trim() || null; }
                ui.toast("Akun admin diperbarui.", "success");
              });
            } }))
        ]}));
      }
      paint();
      return host;
    }

    /* ---------- Keamanan (ganti password) ---------- */
    function keamananPanel() {
      var fCur = ui.field({ label: "Password Lama", type: "password", required: true });
      var fNew = ui.field({ label: "Password Baru", type: "password", required: true, hint: "Minimal 8 karakter." });
      var fConf = ui.field({ label: "Ulangi Password Baru", type: "password", required: true });
      var errEl = h("div", { class: "pg-alogin__error", style: { display: "none" } });
      function bad(msg) { errEl.textContent = msg; errEl.style.display = "block"; }
      return ui.card({ body: [
        h("h3", { text: "Ubah Password", style: { fontSize: "16px" } }),
        h("p", { class: "pg-muted", style: { fontSize: "13px", marginTop: "-4px" },
          text: "Ganti password login Admin Panel Anda. Anda tetap login setelah mengubahnya." }),
        fCur,
        h("div", { class: "pg-grid pg-grid--2" }, fNew, fConf),
        errEl,
        h("div", { style: { display: "flex", justifyContent: "flex-end" } },
          ui.button({ label: "Perbarui Password", variant: "accent", icon: "shield", onClick: function () {
            errEl.style.display = "none";
            var cur = fCur._control.value, nw = fNew._control.value, cf = fConf._control.value;
            if (!cur) return bad("Masukkan password lama.");
            if (nw.length < 8) return bad("Password baru minimal 8 karakter.");
            if (nw !== cf) return bad("Konfirmasi password tidak cocok.");
            return store.adminChangePassword(cur, nw).then(function (res) {
              if (!res || res.ok === false) { bad((res && res.error) || "Gagal mengubah password."); return; }
              fCur._control.value = fNew._control.value = fConf._control.value = "";
              ui.toast("Password berhasil diperbarui.", "success");
            });
          } }))
      ]});
    }

    function renderPanel() {
      var map = { perusahaan: perusahaanPanel, fitur: fiturPanel, update: updatePanel, notifikasi: notifikasiPanel, akun: akunPanel, keamanan: keamananPanel };
      ui.mount(panel, (map[state.tab] || perusahaanPanel)());
    }

    renderNav(); renderPanel();
    return page([
      pageHead("System", "Pengaturan"),
      h("div", { class: "pg-settings-page" },
        ui.pushToggleCard(),
        h("div", { class: "pg-settings-layout" },
          h("div", { class: "pg-card pg-settings-navcard" }, navHost),
          panel))
    ]);
  };

  /* ============================================================
     MOMEN KERJA — shared photo feed, self-expiring 24h (like a story).
     Same feed as the User App; admin may additionally moderate (delete)
     ANY post or comment, not just their own.
     ============================================================ */
  pages.momen = function () {
    var admin = PG.auth.currentAdmin() || {};
    var adminIdentity = { fullName: admin.name || "Admin", photoUrl: null };
    var host = h("div", { class: "pg-grid", style: { gap: "16px" } });
    var state = { posts: null, loading: false, composerPhoto: null, composerVideo: null,
      composerVideoUrl: null, composerVideoWide: false, composerVideoNoPreview: false, composerText: "", comments: {}, feedSig: null };

    var VIDEO_MAX_SEC = 61;
    var VIDEO_MAX_BYTES = 58 * 1024 * 1024;

    function load() {
      if (!state.posts) { state.loading = true; render(); }
      store.posts().then(function (d) {
        var next = (d && d.ok !== false && d.posts) || [];
        state.loading = false;
        store.markMomenSeen(next.map(function (p) { return p.id; }));   // clears the "new posts" menu badge
        var sig = next.map(function (p) { return p.id + ":" + p.likeCount + ":" + p.commentCount; }).join(",");
        if (sig === state.feedSig && state.posts) return;   // skip rebuild — keeps a playing <video> alive
        state.feedSig = sig; state.posts = next; render();
      }).catch(function () { state.loading = false; state.posts = state.posts || []; render(); });
    }

    /* ---------- composer ---------- */
    // Four hidden inputs. The camera icon opens a chooser -> a DEDICATED
    // single-media capture input (mixing image+video in one `capture` input is
    // unreliable on Android). Gallery / video icons pick existing files.
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

    function openCameraChooser() {
      var cm = ui.modal({
        title: "Kamera",
        body: [
          h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "0 0 2px", lineHeight: "1.5" },
            text: "Ambil foto atau rekam video langsung dari kamera." }),
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
    // Accept ANY video format — only size and a measurable >60s duration are
    // hard stops. Unpreviewable files still upload (feed card has a download
    // fallback for whatever a device can't play inline).
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
        state.composerPhoto = null;
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
        accept((w && ht) ? (w / ht > 0.62) : false, false);
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
            clearComposerVideo();
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
          h("div", { class: "pg-momen-compose__who" }, empAvatar(adminIdentity, 36),
            h("span", { class: "pg-momen-compose__name", text: adminIdentity.fullName })),
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
          empAvatar(adminIdentity, 40),
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

    /* ---------- like / comment / moderation ---------- */
    function toggleLike(post) {
      post.likedByMe = !post.likedByMe;
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
        if (input) input.disabled = false;
        if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal mengirim komentar.", "danger"); return; }
        if (input) input.value = "";
        cs.replyTo = null;
        post.commentCount++;
        loadComments(post);
      }, function () {
        cs._sending = false;
        if (input) input.disabled = false;
        ui.toast("Gagal mengirim komentar.", "danger");
      });
    }

    function toggleCommentLike(post, comment) {
      comment.likedByMe = !comment.likedByMe;
      comment.likeCount = Math.max(0, (comment.likeCount || 0) + (comment.likedByMe ? 1 : -1));
      render();
      store.postCommentLike(comment.id).then(function (res) {
        if (!res || res.ok === false) { loadComments(post); }
      }, function () { loadComments(post); });
    }

    // Admin can moderate ANY comment, not just their own.
    function deleteComment(post, comment) {
      var cs = state.comments[post.id];
      var replyCount = (cs && cs.items) ? cs.items.filter(function (x) { return x.parentId === comment.id; }).length : 0;
      ui.confirm({
        title: "Hapus Komentar", tone: "danger", confirmLabel: "Hapus",
        message: (comment.isMine ? "Hapus komentar ini" : "Hapus komentar " + comment.authorName + " ini (moderasi admin)")
          + (replyCount ? " beserta " + replyCount + " balasannya?" : "?"),
        onConfirm: function () {
          store.postCommentDelete(comment.id).then(function (res) {
            if (!res || res.ok === false) { ui.toast((res && res.error) || "Gagal menghapus komentar.", "danger"); return; }
            if (cs && cs.items) {
              var gone = {}; gone[comment.id] = 1;
              var changed = true;
              while (changed) {
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

    // Admin can moderate ANY post, not just their own.
    function deletePost(post) {
      ui.confirm({
        title: "Hapus Momen", tone: "danger", confirmLabel: "Hapus permanen",
        message: (post.isMine ? "Hapus momen ini" : "Hapus momen " + post.authorName + " ini (moderasi admin)")
          + " beserta like dan komentarnya? Tindakan ini tidak dapat dibatalkan.",
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
        empAvatar({ fullName: c.authorName, photoUrl: c.authorPhotoUrl }, c.parentId ? 24 : 28),
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
            // any admin may remove any comment (moderation)
            h("button", { class: "pg-momen-comment__actbtn", type: "button",
              onclick: function () { deleteComment(post, c); } }, svg("trash"), h("span", { text: "Hapus" }))
          )
        )
      );
    }

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
          empAvatar({ fullName: post.authorName, photoUrl: post.authorPhotoUrl }, 40),
          h("div", { class: "pg-momen-card__who" },
            h("div", { class: "pg-momen-card__name", text: post.authorName + (post.ownerKind === "admin" ? " · Admin" : "") }),
            h("div", { class: "pg-momen-card__meta", text: ui.timeAgo(post.createdAt) + " · hilang dalam " + ui.fmtDuration(Math.max(0, expiresMs)) })),
          // any admin may remove any post (moderation)
          h("button", { class: "pg-momen-card__del", type: "button", "aria-label": "Hapus momen",
            title: post.isMine ? "Hapus momen" : "Hapus momen (moderasi)",
            onclick: function () { deletePost(post); } }, svg("trash"))
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
          text: "Momen yang dibagikan tim (dan admin) akan tampil di sini, dan hilang otomatis dalam 24 jam." })] }));
      } else {
        host.appendChild(h("div", { class: "pg-momen-feed" }, state.posts.map(postCard)));
      }
    }

    load();
    ui.live(load, host);
    if (PG.chat) {
      setTimeout(function () {
        var mm = (location.hash || "").match(/^#chat-(\d+)$/);
        if (mm) { history.replaceState(null, "", location.pathname + location.search); PG.chat.open(mm[1]); }
      }, 0);
    }
    var chatBtn = PG.chat ? PG.chat.mountButton({ dark: true }) : null;
    return page([pageHead("Overview", "Momen Kerja", chatBtn), h("div", { class: "pg-momen-page" }, host), camPhotoInput, camVideoInput, galInput, vidInput]);
  };

  PG.adminPages = pages;
})(window.PG = window.PG || {});
