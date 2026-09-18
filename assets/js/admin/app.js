/* ============================================================
   PREMIERE GROUP — Admin Panel bootstrap
   Builds the responsive shell (sidebar / drawer + topbar) and
   wires the hash router with admin session guards + RBAC.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;

  var NAV_GROUPS = [
    { label: null, items: [
      { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
      { path: "/momen", label: "Momen Kerja", icon: "image" }
    ]},
    { label: "Work Management", items: [
      { path: "/todo", label: "Todo List", icon: "checklist" },
      { path: "/program", label: "Program", icon: "grid" },
      { path: "/laporan-kunjungan", label: "Laporan Kunjungan", icon: "building" },
      { path: "/laporan-pengeluaran", label: "Laporan Pengeluaran", icon: "wallet" },
      { path: "/laporan-resi-gudang", label: "Laporan Resi Gudang", icon: "archive" }
    ]},
    { label: "Attendance", items: [
      { path: "/laporan-absensi", label: "Laporan Absensi", icon: "clock" },
      { path: "/laporan-izin", label: "Laporan Izin", icon: "doc" },
      { path: "/manajemen-absensi", label: "Manajemen Absensi", icon: "calendar" },
      { path: "/laporan-lembur", label: "Laporan Lembur", icon: "briefcase" }
    ]},
    { label: "Performance", items: [
      { path: "/laporan-kpi", label: "Laporan KPI", icon: "chart" },
      { path: "/setting-kpi", label: "Setting KPI", icon: "target" }
    ]},
    { label: "Organization", items: [
      { path: "/manajemen-tim", label: "Manajemen Tim", icon: "users" },
      { path: "/manajemen-toko", label: "Manajemen Toko", icon: "store" },
      { path: "/job-desk", label: "Job Desk", icon: "doc" },
      { path: "/jadwal-piket", label: "Jadwal Piket", icon: "calendar" }
    ]},
    { label: "System", items: [
      { path: "/pengaturan", label: "Pengaturan", icon: "settings" }
    ]}
  ];

  var ROUTES = {
    "/dashboard": PG.adminPages.dashboard,
    "/momen": PG.adminPages.momen,
    "/todo": PG.adminPages.todo,
    "/program": PG.adminPages.programAdmin,
    "/laporan-kunjungan": PG.adminPages.laporanKunjungan,
    "/laporan-pengeluaran": PG.adminPages.laporanPengeluaran,
    "/laporan-resi-gudang": PG.adminPages.laporanResiGudang,
    "/laporan-absensi": PG.adminPages.laporanAbsensi,
    "/laporan-izin": PG.adminPages.laporanIzin,
    "/manajemen-absensi": PG.adminPages.manajemenAbsensi,
    "/laporan-lembur": PG.adminPages.laporanLembur,
    "/laporan-kpi": PG.adminPages.laporanKpi,
    "/setting-kpi": PG.adminPages.settingKpi,
    "/manajemen-tim": PG.adminPages.manajemenTim,
    "/manajemen-toko": PG.adminPages.manajemenToko,
    "/job-desk": PG.adminPages.jobDeskAdmin,
    "/jadwal-piket": PG.adminPages.jadwalPiket,
    "/pengaturan": PG.adminPages.pengaturan
  };

  // This app is mounted at  <site-root>/admin  (clean URLs, no #).
  var BASE = new URL(document.baseURI).pathname.replace(/\/+$/, "") + "/admin";

  function build() {
    var root = document.getElementById("pg-admin-root");
    if (!root) return;

    /* ---- Sidebar ---- */
    var navEl = h("nav", { class: "pg-sidebar__nav" });
    var momenNavBadge = h("span", { class: "pg-navlink__badge", hidden: true });
    NAV_GROUPS.forEach(function (g) {
      var group = h("div", { class: "pg-navgroup" });
      if (g.label) group.appendChild(h("div", { class: "pg-navgroup__label", text: g.label.toUpperCase() }));
      g.items.forEach(function (it) {
        group.appendChild(h("a", { class: "pg-navlink", dataset: { path: it.path },
          href: BASE + it.path, title: it.label, onclick: closeDrawer },
          svg(it.icon), h("span", { text: it.label }),
          it.path === "/momen" ? momenNavBadge : null));
      });
      navEl.appendChild(group);
    });
    function syncMomenNav() {
      var n = (PG.store.momenMenuBadge && PG.store.momenMenuBadge()) || 0;
      momenNavBadge.textContent = n > 99 ? "99+" : String(n);
      momenNavBadge.hidden = n === 0;
    }
    document.addEventListener("pg:store-changed", syncMomenNav);
    var logoutGroup = h("div", { class: "pg-navgroup" },
      h("a", { class: "pg-navlink", href: BASE + "/login", title: "Logout", onclick: function (e) {
        e.preventDefault(); PG.auth.logout(); router.replace("/login");
      } }, svg("logout"), h("span", { text: "Logout" }))
    );
    navEl.appendChild(logoutGroup);

    var railToggle = h("button", { class: "pg-sidebar__collapse", type: "button",
      title: "Perkecil menu", "aria-label": "Perkecil menu", onclick: toggleRail },
      svg("chevronLeft"), h("span", { text: "Perkecil menu" }));

    var sidebar = h("aside", { class: "pg-sidebar" },
      h("div", { class: "pg-sidebar__brand" },
        h("div", { class: "pg-sidebar__logo" }, ui.brandLogo({ size: 30 })),
        h("div", null, "PREMIERE", h("small", { text: "GROUP" }))
      ),
      navEl,
      railToggle
    );

    /* ---- Topbar ---- */
    var pageTitleEl = h("div", { style: { fontWeight: "600", fontSize: "15px" } });
    var notifBadge = h("span", { class: "pg-notifbadge", hidden: true });
    var bellBtn = h("button", { class: "pg-topbar__iconbtn pg-bell", "aria-label": "Notifikasi",
      onclick: function () { ui.notifCenter({ onNavigate: function (link) { router.go(link); } }); } },
      svg("bell"), notifBadge);
    function syncBell() {
      var n = (PG.store.unreadNotifCount && PG.store.unreadNotifCount()) || 0;
      notifBadge.textContent = n > 99 ? "99+" : String(n);
      notifBadge.hidden = n === 0;
      bellBtn.classList.toggle("has-unread", n > 0);
    }
    document.addEventListener("pg:store-changed", syncBell);
    var topbar = h("header", { class: "pg-topbar" },
      h("button", { class: "pg-topbar__hamburger", "aria-label": "Menu", onclick: toggleDrawer }, svg("menu")),
      pageTitleEl,
      h("div", { class: "pg-topbar__spacer" }),
      (PG.pwa ? PG.pwa.installButton({ class: "pg-pwa-btn--compact" }) : null),
      bellBtn,
      h("div", { class: "pg-topbar__user" },
        h("div", { class: "pg-avatar", text: "A" }),
        h("div", { class: "pg-topbar__user-meta" },
          h("div", { class: "pg-topbar__user-name", text: "Admin" }),
          h("div", { class: "pg-topbar__user-role", text: "Super Admin" })
        )
      )
    );

    var outlet = h("main", { class: "pg-adminmain__outlet", style: { flex: "1", display: "flex" } });
    var main = h("div", { class: "pg-adminmain" }, ui.fileProtocolBanner(), topbar, outlet);
    var scrim = h("div", { class: "pg-scrim", onclick: closeDrawer });

    var shell = h("div", { class: "pg-admin" }, sidebar, main, scrim);
    ui.mount(root, shell);

    function toggleDrawer() { shell.classList.toggle("is-drawer-open"); }
    function closeDrawer() { shell.classList.remove("is-drawer-open"); }

    /* ---- Sidebar collapse (rail) — desktop; choice persisted ---- */
    var RAIL_KEY = "pg.admin.sidebar";
    function applyRail(on) {
      shell.classList.toggle("is-rail", on);
      var label = on ? "Perbesar menu" : "Perkecil menu";
      railToggle.title = label;
      railToggle.setAttribute("aria-label", label);
      railToggle.querySelector("span").textContent = label;
      try { localStorage.setItem(RAIL_KEY, on ? "rail" : "full"); } catch (e) {}
    }
    function toggleRail() { applyRail(!shell.classList.contains("is-rail")); }
    try { if (localStorage.getItem(RAIL_KEY) === "rail") applyRail(true); } catch (e) {}

    function setChrome(path) {
      var isLogin = path === "/login";
      shell.classList.toggle("is-auth-screen", isLogin);
      sidebar.style.display = isLogin ? "none" : "";
      topbar.style.display = isLogin ? "none" : "";
      main.style.marginLeft = isLogin ? "0" : "";
      closeDrawer();

      var active = null;
      ui.qsa(".pg-navlink", navEl).forEach(function (el) {
        var on = el.dataset.path === path;
        el.classList.toggle("is-active", on);
        if (on) active = el;
      });
      pageTitleEl.textContent = active ? active.textContent.trim() : "";
    }

    var router = PG.createRouter({
      outlet: outlet,
      base: BASE,
      fallback: "/dashboard",
      routes: Object.assign({ "/login": PG.adminPages.login }, mapRoutes()),
      beforeEach: function (path) {
        var authed = !!PG.auth.requireAdmin();
        if (path === "/login") return authed ? "/dashboard" : path;
        return authed ? path : "/login";
      },
      onRendered: function (path) {
        setChrome(path);
        // Keep the panel live: poll for changes any other client makes so
        // submitted data lands here without a manual refresh.
        if (path !== "/login" && PG.auth.requireAdmin()) PG.store.startRealtime({ interval: 12000 });
        else PG.store.stopRealtime();
      }
    });

    function mapRoutes() {
      var out = {};
      Object.keys(ROUTES).forEach(function (p) {
        out[p] = function (ctx) {
          if (!PG.auth.requireAdmin()) { ctx.router.replace("/login"); return null; }
          return ROUTES[p](ctx);
        };
      });
      return out;
    }

    // Learn who we are + load the data cache from the API BEFORE the first
    // render, so every synchronous store.*/auth.* read the screens do is warm.
    // A transient bootstrap failure (cold start / flaky network) must not blank
    // the panel or bounce a valid admin session — retry a few times first.
    function hydrateStoreWithRetry(tries) {
      return PG.store.hydrate().then(function (r) {
        if (r && r.ok === false && r.status !== 401 && tries > 0) {
          return new Promise(function (res) { setTimeout(res, 1400); })
            .then(function () { return hydrateStoreWithRetry(tries - 1); });
        }
        return r;
      });
    }
    var booted = false;
    function boot() {
      if (booted) return;
      booted = true;
      PG.auth.hydrate()
        .then(function () { return hydrateStoreWithRetry(3); })
        .then(function () {
          router.start(); syncBell(); syncMomenNav();
          if (PG.push && PG.auth.requireAdmin()) {
            PG.push.resubscribe();
            setTimeout(function () { PG.push.nudge(); }, 3500);
          }
          if (PG.prayer && PG.auth.requireAdmin()) {
            PG.prayer.sync();
            setInterval(function () { if (PG.auth.requireAdmin()) PG.prayer.sync(); }, 3600000);
          }
        })
        .catch(function () { router.start(); });
    }
    boot();

    // A tapped OS push notification asks the focused window to navigate.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", function (e) {
        if (e.data && e.data.type === "pg:navigate" && e.data.route) {
          if (PG.auth.requireAdmin()) router.go(e.data.route);
        }
      });
    }

    // Toast when a new notification arrives (store fires this after a re-hydrate
    // that contained ids we hadn't shown yet).
    document.addEventListener("pg:notif-new", function (e) {
      var list = (e && e.detail) || [];
      if (!list.length) return;
      var n = list[0];
      ui.toast(list.length > 1 ? (list.length + " notifikasi baru") : (n.title + (n.body ? " — " + n.body : "")),
        "info");
    });

    // Invite install (once, dismissible) — only outside standalone mode.
    if (PG.pwa) PG.pwa.maybeShowBanner();

    // On window focus: re-check the session (so a logout / deactivation that
    // happened while away never leaves a panel screen visible) and quietly
    // refresh the in-memory cache so the NEXT navigation shows current data.
    // Deliberately does NOT re-render the current screen — switching windows
    // must never make the open page jump back to its default view.
    function guardSession(res) {
      // Only redirect when the SERVER explicitly reported "not logged in".
      // A transient /auth/me failure (res.transient) leaves the session intact.
      if (res && res.ok && res.authenticated === false
          && router.current() !== "/login") {
        router.replace("/login");
      }
    }
    window.addEventListener("focus", function () {
      if (!booted) return;
      PG.auth.hydrate()
        .then(function (res) { guardSession(res); return PG.store.refresh(); })
        .catch(function () {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})(window.PG = window.PG || {});
