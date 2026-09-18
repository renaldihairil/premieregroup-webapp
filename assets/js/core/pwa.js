/* ============================================================
   PREMIERE GROUP — PWA install helper
   ------------------------------------------------------------
   - registers the service worker
   - captures the browser's install prompt
   - PG.pwa.installButton()  -> a header button that shows only
     when the app can be installed (hidden once installed)
   - PG.pwa.maybeShowBanner() -> a one-off dismissible bottom
     banner inviting the user to install
   - iOS Safari has no prompt event -> shows a "Add to Home
     Screen" instruction instead
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui;
  var deferredPrompt = null;
  var DISMISS_KEY = "pg_pwa_dismissed_at";
  var DISMISS_DAYS = 14;

  function isStandalone() {
    return (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) ||
      window.navigator.standalone === true;
  }
  function isIOS() {
    return /iphone|ipad|ipod/i.test(navigator.userAgent || "") && !window.MSStream;
  }
  function isMobileSafari() {
    return isIOS() && /safari/i.test(navigator.userAgent) && !/crios|fxios|edgios/i.test(navigator.userAgent);
  }
  function dismissedRecently() {
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return t && (Date.now() - t) < DISMISS_DAYS * 86400000;
    } catch (e) { return false; }
  }
  function markDismissed() {
    try { localStorage.setItem(DISMISS_KEY, String(Date.now())); } catch (e) {}
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    document.dispatchEvent(new CustomEvent("pg:pwa-installable"));
  });
  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    markDismissed();
    document.dispatchEvent(new CustomEvent("pg:pwa-installed"));
    ui && ui.toast && ui.toast("Aplikasi terpasang. Buka dari layar utama Anda.", "success");
  });

  function canPrompt() { return !!deferredPrompt && !isStandalone(); }
  function eligible() { return canPrompt() || (isMobileSafari() && !isStandalone()); }

  function doPrompt() {
    if (!deferredPrompt) return Promise.resolve(false);
    var d = deferredPrompt;
    deferredPrompt = null;
    d.prompt();
    return d.userChoice.then(function (c) {
      document.dispatchEvent(new CustomEvent("pg:pwa-installable"));
      return c && c.outcome === "accepted";
    });
  }

  function iosInstructions() {
    ui.modal({
      title: "Pasang ke Layar Utama",
      body: [
        ui.h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.75" },
          text: "Di Safari (iPhone / iPad):" }),
        ui.h("ol", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.9", paddingLeft: "18px", margin: "0" } },
          ui.h("li", { text: "Ketuk ikon Bagikan (kotak dengan panah ke atas) di bilah bawah." }),
          ui.h("li", { text: "Gulir, lalu pilih “Tambah ke Layar Utama”." }),
          ui.h("li", { text: "Ketuk “Tambah”. Ikon Premiere Group muncul di layar utama." }))
      ]
    });
  }

  /* Header/topbar button — auto shows/hides with install eligibility. */
  function installButton(opts) {
    opts = opts || {};
    var btn = ui.h("button", {
      class: "pg-pwa-btn" + (opts.class ? " " + opts.class : ""),
      type: "button", "aria-label": "Instal aplikasi", title: "Instal aplikasi",
      onclick: function () { if (canPrompt()) doPrompt(); else iosInstructions(); }
    }, ui.svg("download"), ui.h("span", { text: opts.label || "Instal Aplikasi" }));
    function sync() { btn.hidden = !eligible(); }
    sync();
    document.addEventListener("pg:pwa-installable", sync);
    document.addEventListener("pg:pwa-installed", sync);
    return btn;
  }

  /* One-off dismissible bottom banner. */
  function maybeShowBanner() {
    if (isStandalone() || dismissedRecently()) return;

    function build() {
      if (document.querySelector(".pg-pwa-banner")) return;
      if (!eligible()) return;
      var banner = ui.h("div", { class: "pg-pwa-banner", role: "dialog", "aria-label": "Pasang aplikasi" },
        ui.h("img", { class: "pg-pwa-banner__ic", src: "assets/img/icon-192.png", alt: "" }),
        ui.h("div", { class: "pg-pwa-banner__txt" },
          ui.h("div", { class: "pg-pwa-banner__t", text: "Pasang Premiere Group" }),
          ui.h("div", { class: "pg-pwa-banner__s", text: "Buka lebih cepat, tampil seperti aplikasi biasa di perangkat Anda." })),
        ui.h("div", { class: "pg-pwa-banner__act" },
          ui.button({ label: "Nanti", variant: "ghost", size: "sm", onClick: function () { markDismissed(); banner.remove(); } }),
          ui.button({ label: "Pasang", variant: "accent", size: "sm", icon: "download", onClick: function () {
            if (canPrompt()) { doPrompt().then(function () { banner.remove(); }); }
            else { iosInstructions(); markDismissed(); banner.remove(); }
          } }))
      );
      document.body.appendChild(banner);
      requestAnimationFrame(function () { banner.classList.add("is-in"); });
    }

    if (canPrompt()) { build(); return; }
    document.addEventListener("pg:pwa-installable", build, { once: true });
    if (isMobileSafari()) setTimeout(build, 2500);
  }

  var _swReady = null;   // Promise<ServiceWorkerRegistration> | null
  function registerSW() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", function () {
      _swReady = navigator.serviceWorker.register("sw.js").then(function (reg) {
        return navigator.serviceWorker.ready.then(function () { return reg; });
      }).catch(function () { return null; });
    });
  }

  /* ============================================================
     PG.push — Web Push (Layer 2): OS notification on the phone even
     when the app is closed. All calls degrade to a no-op when the
     platform / permission / server VAPID key is missing.
     ============================================================ */
  function pushSupported() {
    return ("serviceWorker" in navigator) && ("PushManager" in window) && ("Notification" in window);
  }
  function b64uToU8(s) {
    s = (s + "=".repeat((4 - s.length % 4) % 4)).replace(/-/g, "+").replace(/_/g, "/");
    var raw = atob(s), a = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; i++) a[i] = raw.charCodeAt(i);
    return a;
  }
  function swReg() {
    if (_swReady) return _swReady;
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return navigator.serviceWorker.ready.catch(function () { return null; });
  }
  function serverConfig() {
    return PG.store.api("push/config").then(function (d) { return d || {}; }, function () { return {}; });
  }

  function pushStatus() {
    return serverConfig().then(function (cfg) {
      return {
        supported: pushSupported(),
        serverEnabled: !!cfg.enabled,
        permission: pushSupported() ? Notification.permission : "unsupported",
        subscribed: false,   // filled below
        _publicKey: cfg.publicKey || null
      };
    }).then(function (st) {
      if (!st.supported) return st;
      return swReg().then(function (reg) {
        if (!reg || !reg.pushManager) return st;
        return reg.pushManager.getSubscription().then(function (sub) {
          st.subscribed = !!sub;
          return st;
        });
      });
    });
  }

  // Ask permission (if needed) + subscribe + register with the server.
  function pushEnable() {
    if (!pushSupported()) return Promise.resolve({ ok: false, error: "Perangkat/peramban ini tidak mendukung notifikasi." });
    return serverConfig().then(function (cfg) {
      if (!cfg.enabled || !cfg.publicKey) return { ok: false, error: "Notifikasi HP belum diaktifkan di server." };
      var ask = (Notification.permission === "granted")
        ? Promise.resolve("granted")
        : Notification.requestPermission();
      return Promise.resolve(ask).then(function (perm) {
        if (perm !== "granted") return { ok: false, error: "Izin notifikasi ditolak. Aktifkan lewat pengaturan peramban bila ingin mengubahnya." };
        return swReg().then(function (reg) {
          if (!reg || !reg.pushManager) return { ok: false, error: "Service worker belum siap. Muat ulang halaman lalu coba lagi." };
          return reg.pushManager.getSubscription().then(function (existing) {
            if (existing) return existing;
            return reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: b64uToU8(cfg.publicKey)
            });
          }).then(function (sub) {
            var j = sub.toJSON();
            return PG.store.api("push/subscribe", {
              method: "POST",
              body: { endpoint: j.endpoint, keys: j.keys }
            }).then(function (r) {
              return (r && r.ok !== false) ? { ok: true } : { ok: false, error: (r && r.error) || "Gagal mendaftar ke server." };
            });
          });
        });
      });
    }).catch(function (e) {
      return { ok: false, error: "Gagal mengaktifkan notifikasi HP." };
    });
  }

  function pushDisable() {
    return swReg().then(function (reg) {
      if (!reg || !reg.pushManager) return { ok: true };
      return reg.pushManager.getSubscription().then(function (sub) {
        if (!sub) return { ok: true };
        var ep = sub.endpoint;
        return sub.unsubscribe().then(function () {
          return PG.store.api("push/unsubscribe", { method: "POST", body: { endpoint: ep } })
            .then(function () { return { ok: true }; }, function () { return { ok: true }; });
        });
      });
    }).catch(function () { return { ok: true }; });
  }

  // Called after every login: if the user already granted permission, silently
  // (re)subscribe so the server row stays current across key rotation / reinstall.
  function pushResubscribe() {
    if (!pushSupported() || Notification.permission !== "granted") return Promise.resolve();
    return pushEnable().then(function () {}, function () {});
  }

  function pushTest() {
    return PG.store.api("push/test", { method: "POST" }).then(function (r) { return r || {}; }, function () {
      return { ok: false, error: "Gagal mengirim uji notifikasi." };
    });
  }

  var PUSH_NUDGE_KEY = "pg_push_nudge_dismissed_at";
  var PUSH_NUDGE_DAYS = 10;
  function pushNudgeDismissed() {
    try {
      var t = parseInt(localStorage.getItem(PUSH_NUDGE_KEY) || "0", 10);
      return t && (Date.now() - t) < PUSH_NUDGE_DAYS * 86400000;
    } catch (e) { return false; }
  }
  // One-off dismissible banner inviting the user to turn on device notifications.
  function pushNudge() {
    if (!pushSupported() || pushNudgeDismissed()) return;
    if (Notification.permission !== "default") return;   // already granted or blocked
    pushStatus().then(function (st) {
      if (!st.serverEnabled || st.subscribed || Notification.permission !== "default") return;
      if (document.querySelector(".pg-pwa-banner")) return;   // don't stack with the install banner
      var banner = ui.h("div", { class: "pg-pwa-banner pg-pwa-banner--push", role: "dialog", "aria-label": "Aktifkan notifikasi" },
        ui.h("div", { class: "pg-pwa-banner__ic", style: { display: "grid", placeItems: "center" } }, ui.svg("bell")),
        ui.h("div", { class: "pg-pwa-banner__txt" },
          ui.h("div", { class: "pg-pwa-banner__t", text: "Aktifkan notifikasi HP" }),
          ui.h("div", { class: "pg-pwa-banner__s", text: "Dapat pemberitahuan di layar walau aplikasi ditutup — todo, izin, lembur, pengingat, dan waktu sholat." })),
        ui.h("div", { class: "pg-pwa-banner__act" },
          ui.button({ label: "Nanti", variant: "ghost", size: "sm", onClick: function () {
            try { localStorage.setItem(PUSH_NUDGE_KEY, String(Date.now())); } catch (e) {}
            banner.remove();
          } }),
          ui.button({ label: "Aktifkan", variant: "accent", size: "sm", icon: "bell", onClick: function () {
            pushEnable().then(function (r) {
              banner.remove();
              ui.toast(r && r.ok ? "Notifikasi HP aktif." : ((r && r.error) || "Gagal mengaktifkan."), r && r.ok ? "success" : "danger");
            });
          } }))
      );
      document.body.appendChild(banner);
      requestAnimationFrame(function () { banner.classList.add("is-in"); });
    }).catch(function () {});
  }

  /* ============================================================
     PG.prayer — waktu sholat.
     Computes today's 5 prayer times locally and posts them to the
     server once per calendar day, so the server sweep can fire a
     Web Push + in-app notification the moment each time arrives
     (works with the app closed).

     The in-app ADZAN AUDIO and its popup were removed on purpose —
     the audio kept replaying outside prayer times (e.g. when the app
     was opened long after the time had passed and the stale
     "prayer.adzan" notification surfaced). The push notification is
     the single, reliable reminder channel now — no sound file, no
     browser-autoplay unlock, no timers to drift.
     ============================================================ */
  var _prayerCols = { Subuh: "subuh", Dzuhur: "dzuhur", Ashar: "ashar", Maghrib: "maghrib", Isya: "isya" };

  function _ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Compute today's times and hand them to the server — once per calendar day.
  function prayerSync() {
    if (!ui || !ui.prayerTimes || !ui.geoOnce || !PG.store || !PG.store.api) return;
    var now = new Date();
    var syncKey = "pg_prayer_synced_" + _ymd(now);
    try { if (localStorage.getItem(syncKey) === "1") return; } catch (e) {}   // already sent today
    ui.geoOnce(function (loc) {
      var t;
      try { t = ui.prayerTimes(now, loc.lat, loc.lng, -now.getTimezoneOffset()); }
      catch (e) { return; }
      function hhmm(hf) {
        var h = Math.floor(hf), m = Math.round((hf - h) * 60);
        if (m === 60) { m = 0; h = (h + 1) % 24; }
        return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
      }
      var times = {};
      Object.keys(_prayerCols).forEach(function (nm) {
        if (typeof t[nm] === "number" && isFinite(t[nm])) times[_prayerCols[nm]] = hhmm(t[nm]);
      });
      if (!Object.keys(times).length) return;
      PG.store.api("prayer/schedule", { method: "POST", body: { times: times } })
        .then(function () { try { localStorage.setItem(syncKey, "1"); } catch (e) {} }, function () {});
    });
  }

  /* ============================================================
     PG.appUpdate — "Info Update" broadcast from Admin Pengaturan.
     Shown as a popup (title + description from the admin) with a
     Refresh Aplikasi button. Checked in two places so it surfaces no
     matter how the user got here:
       1. right after every boot (hydrate) — covers a tapped OS push
          notification cold-starting the app AND just opening it normally
       2. live, via pg:notif-new, the instant one arrives while already open
     Reads straight from the already-hydrated notification cache (no extra
     request) and marks it read on show, so it never repeats after that.
     ============================================================ */
  var _appUpdateOpen = false;
  function _newestUnreadAppUpdate() {
    var list = (PG.store && PG.store.notifications) ? PG.store.notifications() : [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].type === "app.update" && !list[i].read) return list[i];
    }
    return null;
  }
  function _showAppUpdatePopup(n) {
    if (_appUpdateOpen || !ui || !ui.modal) return;
    _appUpdateOpen = true;
    if (PG.store && PG.store.markNotifRead) PG.store.markNotifRead([n.id]);
    var m = ui.modal({
      title: n.title || "Pembaruan Aplikasi",
      class: "pg-modal--appupdate",
      body: [
        ui.h("div", { style: { fontSize: "40px", textAlign: "center", lineHeight: "1" } }, "🚀"),
        ui.h("p", { class: "pg-muted", style: { textAlign: "center", fontSize: "14px", margin: "10px 0 0", whiteSpace: "pre-wrap" },
          text: n.body || "" })
      ],
      footer: [
        ui.button({ label: "Nanti Saja", variant: "ghost", onClick: function () { m.close(); } }),
        ui.button({ label: "Refresh Aplikasi", variant: "accent", icon: "check", onClick: function () { location.reload(); } })
      ],
      onClose: function () { _appUpdateOpen = false; }
    });
  }
  function checkAppUpdate() {
    var n = _newestUnreadAppUpdate();
    if (n) _showAppUpdatePopup(n);
  }
  // pg:store-changed fires after EVERY hydrate (initial boot, the login
  // screen's own separate hydrate() call, every live poll) — a broader net
  // than pg:notif-new, which deliberately stays silent on first hydrate.
  // That's exactly what a cold-started app (tapped push notification, or
  // just opening it later) needs: an already-delivered-but-unread notice
  // must still surface, not only ones that arrive while already open.
  // checkAppUpdate() is idempotent (marks read on show), so firing on every
  // store-changed is harmless — it only ever acts once per unread notice.
  document.addEventListener("pg:store-changed", checkAppUpdate);

  PG.appUpdate = { check: checkAppUpdate };

  PG.pwa = {
    isStandalone: isStandalone,
    isIOS: isIOS,
    canInstall: eligible,
    promptInstall: function () { return canPrompt() ? doPrompt() : (iosInstructions(), Promise.resolve(false)); },
    installButton: installButton,
    maybeShowBanner: maybeShowBanner
  };

  PG.push = {
    supported: pushSupported,
    status: pushStatus,
    enable: pushEnable,
    disable: pushDisable,
    resubscribe: pushResubscribe,
    test: pushTest,
    nudge: pushNudge
  };

  PG.prayer = { sync: prayerSync };

  registerSW();
})(window.PG = window.PG || {});
