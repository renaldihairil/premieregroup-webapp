/* ============================================================
   PREMIERE GROUP — User App bootstrap
   Builds the mobile frame, fixed bottom navigation, and wires
   the hash router with session guards.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;

  // The employee app is mounted at the site root (clean URLs, no #).
  var BASE = new URL(document.baseURI).pathname.replace(/\/+$/, "");

  var NAV = [
    { path: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { path: "/momen", label: "Momen", icon: "image", badge: "momen" },
    { path: "/absensi", label: "Absensi", icon: "camera", center: true },
    { action: "chat", label: "Chat", icon: "message", badge: "chat" },
    { path: "/profil", label: "Profil", icon: "user" }
  ];

  function build() {
    var root = document.getElementById("pg-user-root");
    if (!root) return;

    var outlet = h("div", { class: "pg-user__outlet",
      style: { flex: "1", display: "flex", flexDirection: "column", minHeight: "0" } });

    var navBadges = {};   // badge-key -> badge <span> (momen | chat)
    var bottomNav = h("nav", { class: "pg-bottomnav", "aria-label": "Navigasi utama" },
      NAV.map(function (item) {
        var iconWrap = h("span", { class: "pg-bottomnav__icon" }, svg(item.icon));
        if (item.badge) {
          var badge = h("span", { class: "pg-bottomnav__badge", hidden: true });
          navBadges[item.badge] = badge;
          iconWrap.appendChild(badge);
        }
        var cls = "pg-bottomnav__item" + (item.center ? " pg-bottomnav__item--center" : "");
        var onClick = item.action === "chat"
          ? function () { if (PG.chat) PG.chat.open(); }
          : function () { PG._router.go(item.path); };
        return h("button", { class: cls,
          dataset: item.path ? { path: item.path } : { action: item.action },
          onclick: onClick },
          iconWrap,
          h("span", { text: item.label })
        );
      })
    );

    var frame = h("div", { class: "pg-user__frame" }, ui.fileProtocolBanner(), outlet, bottomNav);
    ui.mount(root, h("div", { class: "pg-user" }, frame));

    // Bottom-nav badges: "momen" = new Momen posts not yet seen, "chat" =
    // unread private chats. (They used to be one combined count on Momen;
    // Chat now has its own tab, so each carries its own.)
    function setBadge(key, n) {
      var badge = navBadges[key];
      if (!badge) return;
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n === 0;
    }
    function refreshNavBadges() {
      var hydrated = PG.auth.currentUser() && PG.store.isHydrated && PG.store.isHydrated();
      setBadge("momen", hydrated && PG.store.momenUnseenCount ? PG.store.momenUnseenCount() : 0);
      setBadge("chat", hydrated && PG.store.chatUnreadCount ? PG.store.chatUnreadCount() : 0);
    }
    document.addEventListener("pg:store-changed", refreshNavBadges);

    // "Absensi" bottom-nav tab follows Admin's "absensi" feature switch (it's
    // wajib by default, but excludable per division/employee — e.g. senior
    // positions that don't clock in). Uses style.display, not the `hidden`
    // attribute — .pg-bottomnav__item already sets its own `display: flex`
    // with equal specificity, which would otherwise beat the UA `[hidden]` rule.
    function refreshNavVisibility() {
      var absensiBtn = bottomNav.querySelector('[data-path="/absensi"]');
      if (absensiBtn) absensiBtn.style.display = PG.store.featureEnabled("absensi") ? "" : "none";
    }
    document.addEventListener("pg:store-changed", refreshNavVisibility);

    // Toast when a new notification arrives (any screen).
    document.addEventListener("pg:notif-new", function (e) {
      var list = (e && e.detail) || [];
      if (!list.length) return;
      var n = list[0];
      ui.toast(list.length > 1 ? (list.length + " notifikasi baru") : (n.title + (n.body ? " — " + n.body : "")), "info");
    });

    function setChrome(path) {
      var authed = !!PG.auth.currentUser();
      var showNav = authed && path !== "/login";
      bottomNav.style.display = showNav ? "flex" : "none";
      ui.qsa(".pg-bottomnav__item", bottomNav).forEach(function (el) {
        el.classList.toggle("is-active", el.dataset.path === path);
      });
      refreshNavBadges();
      refreshNavVisibility();
    }

    function view(fn, needsUser) {
      return function (ctx) {
        if (needsUser) {
          var user = PG.auth.currentUser();
          if (!user) { ctx.router.replace("/login"); return null; }
          ctx.user = user;
        }
        return fn(ctx);
      };
    }

    var router = PG.createRouter({
      outlet: outlet,
      base: BASE,
      fallback: "/dashboard",
      routes: {
        "/login": view(PG.userPages.login, false),
        "/dashboard": view(PG.userPages.dashboard, true),
        "/absensi": view(PG.userPages.absensi, true),
        "/todo": view(PG.userPages.todo, true),
        "/profil": view(PG.userPages.profil, true),
        "/lapor-kpi": view(PG.userPages.laporKpi, true),
        "/program": view(PG.userPages.program, true),
        "/job-desk": view(PG.userPages.jobDesk, true),
        "/kunjungan": view(PG.userPages.kunjungan, true),
        "/pengeluaran": view(PG.userPages.pengeluaran, true),
        "/resi-gudang": view(PG.userPages.resiGudang, true),
        "/data-supplier": view(PG.userPages.dataSupplier, true),
        "/laporan-resi": view(PG.userPages.laporanResi, true),
        "/jadwal-piket": view(PG.userPages.jadwalPiket, true),
        "/kerja-staf": view(PG.userPages.kerjaStaf, true),
        "/hasil-kunjungan": view(PG.userPages.hasilKunjungan, true),
        "/hasil-kpi": view(PG.userPages.hasilKpi, true),
        "/rekap-absensi": view(PG.userPages.rekapAbsensi, true),
        "/momen": view(PG.userPages.momen, true)
      },
      beforeEach: function (path) {
        var authed = !!PG.auth.currentUser();
        if (path === "/login") return authed ? "/dashboard" : path;
        return authed ? path : "/login";
      },
      onRendered: function (path) {
        setChrome(path);
        // Live updates: pick up admin approvals / edits without a manual refresh.
        if (path !== "/login" && PG.auth.currentUser()) PG.store.startRealtime({ interval: 15000 });
        else PG.store.stopRealtime();
      }
    });

    // Learn who we are + warm the API-backed cache BEFORE the first render.
    // A transient bootstrap failure (cold start, flaky mobile network) must not
    // dump a logged-in user at /login — retry a couple of times first.
    function hydrateStoreWithRetry(tries) {
      return PG.store.hydrate().then(function (r) {
        var st = r && r.status;
        if (r && r.ok === false && st !== 401 && tries > 0) {
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
          router.start();
          if (PG.push && PG.auth.currentUser()) {
            PG.push.resubscribe();
            setTimeout(function () { PG.push.nudge(); }, 3500);
          }
          if (PG.prayer && PG.auth.currentUser()) {
            PG.prayer.sync();
            setInterval(function () { if (PG.auth.currentUser()) PG.prayer.sync(); }, 3600000);
          }
        })
        .catch(function () { router.start(); });
    }
    boot();

    // A tapped OS push notification asks the focused window to navigate.
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.addEventListener("message", function (e) {
        if (e.data && e.data.type === "pg:navigate" && e.data.route) {
          if (PG.auth.currentUser()) router.go(e.data.route);
        }
      });
    }

    // Invite the user to install the app (once, dismissible for 14 days).
    if (PG.pwa) PG.pwa.maybeShowBanner();

    // On focus: re-check the session (so a logout / deactivation while away never
    // leaves an authenticated screen visible) and quietly refresh the in-memory
    // cache so the NEXT navigation shows current data. It deliberately does NOT
    // re-render the current screen — switching windows must never make the open
    // page jump back to its default view or lose in-progress form work.
    window.addEventListener("focus", function () {
      if (!booted) return;
      PG.auth.hydrate()
        .then(function (res) {
          // Only bounce to /login when the SERVER explicitly said "not logged
          // in" — never on a transient /auth/me failure (res.transient).
          if (res && res.ok && res.authenticated === false
              && PG._router.current() !== "/login") {
            PG._router.replace("/login");
            return null;
          }
          return PG.store.refresh();
        })
        .catch(function () {});
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", build);
  } else {
    build();
  }
})(window.PG = window.PG || {});
