/* ============================================================
   PREMIERE GROUP — Data store (API-backed, read-through cache)
   ------------------------------------------------------------
   The app talks to the PHP + MySQL backend under /api. This module
   is the seam every screen already uses (PG.store.*):

     - READS are synchronous and hit an in-memory cache (_db) that is
       hydrated once at boot from GET /api/bootstrap and refreshed after
       every write / on window focus. The ~15 page render() functions and
       the router are unchanged.
     - WRITES are asynchronous: they POST/PATCH/DELETE to /api, then
       re-hydrate the cache, then resolve to the SAME { ok, record } shape
       the old synchronous methods returned. Call sites add `.then(...)`.

   No localStorage. No mock data. The browser only holds the opaque
   session cookie; identity + authorization live on the server.
   ============================================================ */
(function (PG) {
  "use strict";

  /* API base — resolved against the document base (<base href> in the HTML),
     so it is correct on any clean-URL route (/admin/dashboard, /absensi, …)
     and also when the app lives in a sub-folder. */
  var API_BASE = (function () {
    try { return new URL("api/", document.baseURI).href; }
    catch (e) { return "/api/"; }
  })();

  var DB_KEY = "pg_db_v2";          // kept only so old references don't throw
  var SCHEMA_VERSION = 9;

  /* Which interface is this? admin.html has #pg-admin-root, index.html has
     #pg-user-root. The server uses this to keep the Admin and employee sessions
     on SEPARATE cookies, so both can be logged in in the same browser. */
  var REALM = (typeof document !== "undefined" && document.getElementById &&
    document.getElementById("pg-admin-root")) ? "admin" : "user";

  /* ---------- in-memory cache ---------- */
  function emptyDb() {
    return {
      branches: [], stores: [], positions: [], divisions: [], users: [],
      attendanceSettings: {
        checkIn: "08:00", checkOut: "21:00", lateToleranceMin: 15,
        overtimeStart: "17:00", overtimeEnd: "23:59",
        workDays: ["mon", "tue", "wed", "thu", "fri", "sat"], holidays: []
      },
      attendanceRecords: [], overtimeRecords: [], izinRecords: [], expenseRecords: [], warehouseReceipts: [], warehouseSuppliers: [], notifications: [], todos: [], jobDesks: [], programs: [],
      kpiSettings: [], kpiRecords: [],
      systemSettings: { companyName: "Premiere Group", timezone: "Asia/Makassar", locale: "id-ID", weekStart: "mon" },
      featureAccess: {},  // key -> bool; a MISSING key means "enabled" (see featureEnabled())
      piketSchedules: [], piketSettings: { reminderTime: "07:00", enabled: true, fridayTime: "07:00", fridayEnabled: true, fridayMessage: null },
      chatThreads: [], chatUnread: 0, momenPostIds: []
    };
  }
  var _db = emptyDb();
  var _serverDate = null;           // "YYYY-MM-DD" from the server (fallback: browser)
  var _hydratedOnce = false;
  var _inflight = null;

  function read() { return _db; }

  /* ---------- id / date helpers (kept for API compatibility) ---------- */
  function uid(prefix) { return (prefix || "id") + "_" + Math.random().toString(36).slice(2, 9); }
  function nowISO() { return new Date().toISOString(); }

  /* ============================================================
     NETWORK
     ============================================================ */
  function api(path, opts) {
    opts = opts || {};
    var headers = { "Accept": "application/json", "X-PG-Realm": REALM };
    var body;
    var isForm = (typeof FormData !== "undefined") && opts.body instanceof FormData;
    if (isForm) {
      body = opts.body;                       // browser sets multipart Content-Type + boundary
    } else if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }
    var method = opts.method || "GET";
    if (method !== "GET" && method !== "HEAD") {
      headers["X-CSRF-Token"] = (PG.auth && PG.auth.csrfToken && PG.auth.csrfToken()) || "";
    }
    return fetch(API_BASE + path, {
      method: method, headers: headers, body: body,
      credentials: "same-origin", cache: "no-store"
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = null;
        try { data = txt ? JSON.parse(txt) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && (data.error || data.message)) ||
            ("Gangguan jaringan (" + res.status + "). Coba lagi."));
          err.status = res.status;
          err.payload = data;
          throw err;
        }
        return data || {};
      });
    });
  }
  PG.net = api;

  /* A write: resolves to { ok, record?, error? }; never rejects for an
     expected error. Re-hydrates the cache on success so the next render()
     sees fresh data. A 401 asks auth to drop the principal. */
  function write(path, opts) {
    return api(path, opts).then(function (data) {
      if (data && data.ok === false) return data;              // business rejection
      return refresh().then(function () {
        return { ok: true, record: (data && data.record) || null, data: data };
      });
    }, function (err) {
      if (err.status === 401 && PG.auth && PG.auth._invalidate) PG.auth._invalidate();
      return { ok: false, error: err.message || "Terjadi kesalahan. Coba lagi." };
    });
  }

  /* ============================================================
     HYDRATION
     ============================================================ */
  function absorb(payload) {
    var e = emptyDb();
    _db = {
      branches: payload.branches || e.branches,
      stores: payload.stores || e.stores,
      positions: payload.positions || e.positions,
      divisions: payload.divisions || e.divisions,
      users: payload.users || e.users,
      attendanceSettings: payload.attendanceSettings || e.attendanceSettings,
      attendanceRecords: payload.attendanceRecords || e.attendanceRecords,
      overtimeRecords: payload.overtimeRecords || e.overtimeRecords,
      izinRecords: payload.izinRecords || e.izinRecords,
      expenseRecords: payload.expenseRecords || e.expenseRecords,
      warehouseReceipts: payload.warehouseReceipts || e.warehouseReceipts,
      warehouseSuppliers: payload.warehouseSuppliers || e.warehouseSuppliers,
      piketSchedules: payload.piketSchedules || e.piketSchedules,
      piketSettings: payload.piketSettings || e.piketSettings,
      chatThreads: payload.chatThreads || e.chatThreads,
      chatUnread: payload.chatUnread || e.chatUnread,
      momenPostIds: payload.momenPostIds || e.momenPostIds,
      notifications: payload.notifications || e.notifications,
      todos: payload.todos || e.todos,
      jobDesks: payload.jobDesks || e.jobDesks,
      programs: payload.programs || e.programs,
      kpiSettings: payload.kpiSettings || e.kpiSettings,
      kpiRecords: payload.kpiRecords || e.kpiRecords,
      systemSettings: payload.systemSettings || e.systemSettings,
      featureAccess: payload.featureAccess || e.featureAccess
    };
    _serverDate = payload.serverDate || null;
    if (payload.csrf && PG.auth && PG.auth._absorbCsrf) PG.auth._absorbCsrf(payload.csrf);
    if (payload.principal && PG.auth && PG.auth._absorbPrincipal) PG.auth._absorbPrincipal(payload.principal);
    _warmMyPhoto(payload);
    _detectNewNotifs(_db.notifications);
    // On the very first hydrate ever, mark the current Momen feed as "seen" so a
    // returning employee isn't greeted by a badge for posts that already exist.
    try {
      if (localStorage.getItem(MOMEN_SEEN_KEY) === null) {
        localStorage.setItem(MOMEN_SEEN_KEY, String(_momenMaxId()));
      }
    } catch (e) {}
    // Let interested chrome (e.g. the User App bottom-nav todo badge) react to
    // every cache change — first hydrate, post-write refresh, focus refresh.
    try { document.dispatchEvent(new CustomEvent("pg:store-changed")); } catch (e) {}
  }

  /* Notifications the client has already surfaced (so a re-hydrate doesn't
     re-toast). First hydrate primes the set silently; later ones announce
     only ids we've not seen. */
  var _notifSeen = null;   // null until first hydrate
  function _detectNewNotifs(list) {
    list = list || [];
    if (_notifSeen === null) {
      _notifSeen = {};
      list.forEach(function (n) { _notifSeen[n.id] = 1; });
      return;
    }
    var fresh = list.filter(function (n) { return !_notifSeen[n.id]; });
    fresh.forEach(function (n) { _notifSeen[n.id] = 1; });
    if (fresh.length) {
      try { document.dispatchEvent(new CustomEvent("pg:notif-new", { detail: fresh })); } catch (e) {}
    }
  }

  /* First hydrate (called by the app bootstraps before router.start()). */
  function hydrate() {
    _inflight = api("bootstrap").then(function (payload) {
      absorb(payload || {});
      _hydratedOnce = true;
      return { ok: true };
    }, function (err) {
      var st = (err && err.status) || 0;
      if (st === 401) {
        // Genuinely not logged in — clear the cache and let the router show /login.
        _db = emptyDb();
        _hydratedOnce = true;
      }
      // Otherwise this is a transient failure (offline, 5xx, cold start,
      // request timed out). Do NOT wipe the cache and do NOT mark hydrated —
      // the boot flow retries, and until then a server-verified principal keeps
      // the user on their screen instead of being bounced to /login.
      return { ok: false, status: st };
    });
    return _inflight;
  }

  /* Re-pull the whole cache (after a write, or on focus). Best-effort. */
  function refresh() {
    return api("bootstrap").then(function (payload) {
      absorb(payload || {});
      _rtResync();                       // keep the realtime baseline in step
      return { ok: true };
    }, function () { return { ok: false }; });
  }

  function ready() { return _inflight || hydrate(); }
  function isHydrated() { return _hydratedOnce; }

  /* ============================================================
     REALTIME  — poll a tiny digest; re-hydrate only when it changes,
     so data submitted by one client shows up on the others (esp. the
     Admin Panel) within one interval, with no manual refresh.
     ============================================================ */
  var _rt = { rev: null, timer: null, interval: 12000, running: false, inflight: false };

  function _rtResync() {
    // After any full refresh, adopt the current digest so the very next poll
    // does not see a phantom "change" and re-hydrate a second time.
    api("pulse").then(function (res) { if (res && res.rev) _rt.rev = res.rev; }, function () {});
  }

  function _rtTick() {
    if (_rt.inflight || !_rt.running) return;
    if (!_hydratedOnce) return;   // nothing to compare against yet
    // Browsers already throttle setInterval to ~1/min for backgrounded tabs, and
    // the /pulse response is tiny, so we poll regardless of visibility rather
    // than risk a webview that mis-reports document.hidden while in the foreground.
    _rt.inflight = true;
    api("pulse").then(function (res) {
      _rt.inflight = false;
      var rev = res && res.rev;
      if (!rev) return;                       // not logged in / error — try again next tick
      if (_rt.rev === null) { _rt.rev = rev; return; }   // first sample = baseline, no render
      if (rev !== _rt.rev) { _rt.rev = rev; refresh(); } // changed → re-hydrate → pg:store-changed
    }, function () { _rt.inflight = false; });
  }

  var _rtWired = false;
  function startRealtime(opts) {
    opts = opts || {};
    if (opts.interval) _rt.interval = Math.max(4000, opts.interval);
    if (_rt.running) return;
    _rt.running = true;
    if (_rt.timer) clearInterval(_rt.timer);
    _rt.timer = setInterval(_rtTick, _rt.interval);
    if (!_rtWired) {
      _rtWired = true;
      if (typeof document !== "undefined") {
        document.addEventListener("visibilitychange", function () { if (!document.hidden) _rtTick(); });
      }
      if (typeof window !== "undefined") window.addEventListener("focus", _rtTick);
    }
    _rtTick();   // prime the baseline right away
  }
  function stopRealtime() {
    _rt.running = false;
    if (_rt.timer) { clearInterval(_rt.timer); _rt.timer = null; }
    _rt.rev = null;
  }

  /* ============================================================
     GENERIC COLLECTION READS (cache)
     ============================================================ */
  function all(coll) { return (read()[coll] || []).slice(); }
  function find(coll, id) {
    if (id == null) return null;
    var list = read()[coll] || [];
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  /* Collection name -> REST endpoint for the generic writers. */
  var ENDPOINT = {
    divisions: "master/divisions",
    positions: "master/positions",
    branches: "master/branches",
    stores: "master/stores",
    users: "users",
    todos: "todos",
    jobDesks: "job-desks",
    attendanceRecords: "attendance",
    overtimeRecords: "overtime"
  };
  function endpointFor(coll) {
    var ep = ENDPOINT[coll];
    if (!ep) throw new Error("Koleksi '" + coll + "' tidak dapat ditulis dari klien.");
    return ep;
  }

  function insert(coll, record) { return write(endpointFor(coll), { method: "POST", body: record || {} }); }
  function patch(coll, id, changes) { return write(endpointFor(coll) + "/" + encodeURIComponent(id), { method: "PATCH", body: changes || {} }); }
  function remove(coll, id) { return write(endpointFor(coll) + "/" + encodeURIComponent(id), { method: "DELETE" }); }

  /* Employee-side: move one's OWN assigned todo along (status + progress + note). */
  function updateTodoProgress(todoId, changes) {
    return write("todos/" + encodeURIComponent(todoId) + "/status", { method: "PATCH", body: changes || {} });
  }
  /* Employee-side: create a todo for oneself (appears in the Admin Todo List too). */
  function createMyTodo(payload) {
    return write("my-todos", { method: "POST", body: payload || {} });
  }
  /* Employee-side: edit/delete ONLY a todo they created for themselves —
     the API rejects it if the todo was assigned by an admin instead. */
  function updateMyTodo(todoId, changes) {
    return write("my-todos/" + encodeURIComponent(todoId), { method: "PATCH", body: changes || {} });
  }
  function deleteMyTodo(todoId) {
    return write("my-todos/" + encodeURIComponent(todoId), { method: "DELETE" });
  }

  /* ---------- Self-service profile ---------- */
  // Admin (Pengaturan)
  function adminProfile() { return api("admin-profile"); }
  function adminProfileSave(payload) { return write("admin-profile", { method: "PATCH", body: payload || {} }); }
  function adminChangePassword(currentPassword, newPassword) {
    return write("admin-profile/password", { method: "POST", body: { currentPassword: currentPassword, newPassword: newPassword } });
  }
  // Employee (Profil Saya)
  function updateMyProfile(payload) { return write("my-profile", { method: "PATCH", body: payload || {} }); }
  function setMyProfilePhoto(file) {
    var fd = new FormData();
    fd.append("photo", file);
    return write("my-profile/photo", { method: "POST", body: fd });
  }
  function removeMyProfilePhoto() { return write("my-profile/photo", { method: "DELETE" }); }

  /* ---------- Program (Program Kerja, terintegrasi Todo List) ---------- */
  function programList() { return api("programs"); }
  function program(id) { return api("programs/" + encodeURIComponent(id)); }
  // create: FormData { name, description, startDate, endDate, status?, cover?(File), tasks (JSON string) }
  function programCreate(formData) { return write("programs", { method: "POST", body: formData }); }
  // update: JSON { name?, description?, startDate?, endDate?, status?, tasks? }
  function programUpdate(id, payload) { return write("programs/" + encodeURIComponent(id), { method: "PATCH", body: payload || {} }); }
  function programSetCover(id, file) {
    var fd = new FormData();
    fd.append("cover", file);
    return write("programs/" + encodeURIComponent(id) + "/cover", { method: "POST", body: fd });
  }
  function programDelete(id) { return write("programs/" + encodeURIComponent(id), { method: "DELETE" }); }
  /* Admin: bulk-delete todos completed more than a week ago (+ their files). */
  function todosPurgeStale(before) {
    return write("todos/purge-stale", { method: "POST", body: { before: before || "" } });
  }

  /* ---------- Todo attachments (work-report files / links) ---------- */
  function todoAttachments(todoId) {
    return api("todos/" + encodeURIComponent(todoId) + "/attachments").then(function (d) {
      return (d && d.items) || [];
    });
  }
  function uploadTodoAttachment(todoId, file, label) {
    var fd = new FormData();
    fd.append("file", file);
    if (label) fd.append("label", label);
    return write("todos/" + encodeURIComponent(todoId) + "/attachments", { method: "POST", body: fd });
  }
  function addTodoLink(todoId, url, label) {
    return write("todos/" + encodeURIComponent(todoId) + "/attachments",
      { method: "POST", body: { kind: "link", url: url, label: label || "" } });
  }
  function removeTodoAttachment(attId) {
    return write("todo-attachments/" + encodeURIComponent(attId), { method: "DELETE" });
  }
  function attachmentArchive(params) {
    return api("todo-attachments?" + _qs(params));
  }
  function myAttachmentArchive(params) {
    return api("todo-attachments/mine?" + _qs(params));
  }

  /* ---------- KPI — admin templates, employee reports ---------- */
  // Admin — template management (Setting KPI)
  function kpiTemplates() { return api("kpi/templates"); }
  function kpiTemplate(id) { return api("kpi/templates/" + encodeURIComponent(id)); }
  function kpiTemplateCreate(p) { return write("kpi/templates", { method: "POST", body: p || {} }); }
  function kpiTemplateUpdate(id, p) { return write("kpi/templates/" + encodeURIComponent(id), { method: "PATCH", body: p || {} }); }
  function kpiTemplateDelete(id) { return write("kpi/templates/" + encodeURIComponent(id), { method: "DELETE" }); }
  function kpiItemCreate(templateId, p) { return write("kpi/templates/" + encodeURIComponent(templateId) + "/items", { method: "POST", body: p || {} }); }
  function kpiItemUpdate(id, p) { return write("kpi/items/" + encodeURIComponent(id), { method: "PATCH", body: p || {} }); }
  function kpiItemDelete(id) { return write("kpi/items/" + encodeURIComponent(id), { method: "DELETE" }); }
  function kpiItemsReorder(templateId, ids) { return write("kpi/templates/" + encodeURIComponent(templateId) + "/reorder", { method: "POST", body: { ids: ids } }); }
  // Admin — submitted reports (Laporan KPI)
  function kpiReports(params) { return api("kpi/reports?" + _qs(params)); }
  function kpiReport(id) { return api("kpi/reports/" + encodeURIComponent(id)); }
  function kpiReportReview(id) { return write("kpi/reports/" + encodeURIComponent(id) + "/review", { method: "POST" }); }
  function kpiReportDelete(id) { return write("kpi/reports/" + encodeURIComponent(id), { method: "DELETE" }); }
  // Employee (Lapor KPI / Laporan KPI)
  function kpiMyTemplates() { return api("kpi/my-templates"); }
  function kpiMyReport(params) { return api("kpi/my-report?" + _qs(params)); }
  function kpiMyReportSave(payload) { return write("kpi/my-report", { method: "POST", body: payload || {} }); }
  function kpiMyReportDelete(id) { return write("kpi/my-report/" + encodeURIComponent(id), { method: "DELETE" }); }
  function kpiMyReports() { return api("kpi/my-reports"); }

  /* ---------- Momen Kerja (shared photo feed, self-expiring 24h) ---------- */
  function posts() { return api("posts"); }
  function postCreate(payload) { return write("posts", { method: "POST", body: payload || {} }); }
  // Momen video post — multipart (a data-URL for a 50MB video is not viable).
  function postCreateVideo(file, caption) {
    var fd = new FormData();
    fd.append("video", file);
    if (caption) fd.append("caption", caption);
    return write("posts", { method: "POST", body: fd });
  }
  function postDelete(id) { return write("posts/" + encodeURIComponent(id), { method: "DELETE" }); }
  function postLike(id) { return write("posts/" + encodeURIComponent(id) + "/like", { method: "POST" }); }
  function postComments(id) { return api("posts/" + encodeURIComponent(id) + "/comments"); }
  function postCommentAdd(id, text, parentCommentId) {
    var body = { text: text };
    if (parentCommentId) body.parentCommentId = parentCommentId;
    return write("posts/" + encodeURIComponent(id) + "/comments", { method: "POST", body: body });
  }
  function postCommentLike(commentId) { return write("post-comments/" + encodeURIComponent(commentId) + "/like", { method: "POST" }); }
  function postCommentDelete(id) { return write("post-comments/" + encodeURIComponent(id), { method: "DELETE" }); }

  /* ---------- Kunjungan (Laporan Kunjungan) ---------- */
  // Admin
  function visits(params) { return api("visits?" + _qs(params)); }
  function visitReview(id) { return write("visits/" + encodeURIComponent(id) + "/review", { method: "POST" }); }
  function visitDelete(id) { return write("visits/" + encodeURIComponent(id), { method: "DELETE" }); }
  function visitPurgeStale(before) { return write("visits/purge-stale", { method: "POST", body: { before: before || "" } }); }
  // Shared
  function visit(id) { return api("visits/" + encodeURIComponent(id)); }
  function visitPhotos(params) { return api("visit-photos?" + _qs(params || {})); }
  function visitRemoveAttachment(attId) { return write("visit-attachments/" + encodeURIComponent(attId), { method: "DELETE" }); }
  // Employee
  function myVisits() { return api("my-visits"); }
  function myVisitSave(payload) { return write("my-visits", { method: "POST", body: payload || {} }); }
  function myVisitSubmit(id) { return write("my-visits/" + encodeURIComponent(id) + "/submit", { method: "POST" }); }
  function myVisitDelete(id) { return write("my-visits/" + encodeURIComponent(id), { method: "DELETE" }); }
  function visitUploadAttachment(visitId, file, checklistItemId) {
    var fd = new FormData();
    fd.append("file", file);
    if (checklistItemId) fd.append("checklistItemId", checklistItemId);
    return write("my-visits/" + encodeURIComponent(visitId) + "/attachments", { method: "POST", body: fd });
  }
  /* Employee: checklist items for MY division(s), to render on the visit form. */
  function myVisitChecklist() { return api("my-visit-checklist"); }
  /* Admin: manage the per-division checklist template. */
  function visitChecklistItems(divisionId) { return api("visit-checklist-items?" + _qs({ divisionId: divisionId })); }
  function visitChecklistItemCreate(divisionId, label) {
    return write("visit-checklist-items", { method: "POST", body: { divisionId: divisionId, label: label } });
  }
  function visitChecklistItemUpdate(id, label) {
    return write("visit-checklist-items/" + encodeURIComponent(id), { method: "PATCH", body: { label: label } });
  }
  function visitChecklistItemDelete(id) {
    return write("visit-checklist-items/" + encodeURIComponent(id), { method: "DELETE" });
  }
  function visitChecklistReorder(divisionId, orderedIds) {
    return write("visit-checklist-items/reorder", { method: "POST", body: { divisionId: divisionId, orderedIds: orderedIds } });
  }

  /* Load a protected file (visit photo, attachment, …) through the SAME
     authenticated fetch channel every other API call uses, and hand back an
     object URL. A bare <img src="api/…"> can silently fail on some mobile /
     installed-PWA contexts that do not attach the session cookie to
     sub-resource loads; fetch() with credentials always does. Caller must
     URL.revokeObjectURL() when done. */
  function fileObjectUrl(relPath) {
    var url;
    try { url = new URL(relPath, document.baseURI).href; } catch (e) { url = relPath; }
    return fetch(url, {
      method: "GET",
      headers: { "X-PG-Realm": REALM },
      credentials: "same-origin",
      cache: "no-store"
    }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.blob();
    }).then(function (blob) { return URL.createObjectURL(blob); });
  }

  /* ---------- Profile-photo cache ----------
     Avatars appear on nearly every screen and are re-created on every render.
     A bare <img src="api/…"> can't be relied on: some mobile / installed-PWA
     contexts don't attach the session cookie to sub-resource loads, so the
     request 401s and the photo never shows (desktop "works" only because a
     stray admin cookie gets adopted). So fetch it ONCE through the authenticated
     channel, keep the object URL in a session-lived map keyed by the
     content-versioned path (…?id=N&v=<token>), and return it synchronously on
     every later render — instant, no flicker, no re-fetch, survives navigation.
     A new upload changes the v= token => new key => fresh fetch + old one is
     revoked. */
  var _photoUrlCache = {};   // path -> object URL (string) once ready
  var _photoUrlWait  = {};   // path -> Promise<string> while in flight

  function _photoBaseKey(p) { return String(p).split(/[?&]v=/)[0]; }

  /* Synchronous: the ready object URL for this exact path, or null. */
  function photoObjectUrlReady(relPath) {
    return (relPath && typeof _photoUrlCache[relPath] === "string") ? _photoUrlCache[relPath] : null;
  }

  /* Async: resolve to a cached/loaded object URL (or null). Safe to call on
     every render — it de-dupes in-flight requests and reuses the cache. */
  function photoObjectUrl(relPath) {
    if (!relPath) return Promise.resolve(null);
    if (typeof _photoUrlCache[relPath] === "string") return Promise.resolve(_photoUrlCache[relPath]);
    if (_photoUrlWait[relPath]) return _photoUrlWait[relPath];

    var abs;
    try { abs = new URL(relPath, document.baseURI).href; } catch (e) { abs = relPath; }
    var p = fetch(abs, { method: "GET", headers: { "X-PG-Realm": REALM }, credentials: "same-origin" })
      .then(function (res) { if (!res.ok) throw new Error("HTTP " + res.status); return res.blob(); })
      .then(function (blob) {
        var obj = URL.createObjectURL(blob);
        // drop any older version of the same photo (different v= token)
        var base = _photoBaseKey(relPath);
        Object.keys(_photoUrlCache).forEach(function (k) {
          if (_photoBaseKey(k) === base) {
            try { URL.revokeObjectURL(_photoUrlCache[k]); } catch (e) {}
            delete _photoUrlCache[k];
          }
        });
        _photoUrlCache[relPath] = obj;
        delete _photoUrlWait[relPath];
        return obj;
      }, function (err) {
        delete _photoUrlWait[relPath];
        throw err;
      });
    _photoUrlWait[relPath] = p;
    return p;
  }

  /* Warm the signed-in user's avatar right after hydration so the very first
     paint already has it (no initials flash on app open). Best-effort. */
  function _warmMyPhoto(payload) {
    try {
      var pid = payload && payload.principal && payload.principal.id;
      if (!pid) return;
      var me = (payload.users || []).filter(function (x) { return String(x.id) === String(pid); })[0];
      if (me && me.photoUrl) photoObjectUrl(me.photoUrl).catch(function () {});
    } catch (e) {}
  }

  function kpiBand(pct) {
    if (pct == null) return "none";
    if (pct >= 100) return "tercapai";
    if (pct >= 70) return "progres";
    return "kurang";
  }
  var KPI_METHOD_LABEL = { percent_avg: "Rata-rata persen indikator", weighted_sum: "Jumlah skor (Σ aktual ÷ Σ target)" };
  function kpiMethodLabel(m) { return KPI_METHOD_LABEL[m] || m || "—"; }
  /* Hierarchical "bobot" (weight) for every indikator/sub-indikator in a KPI
     item tree — shared by the admin builder preview (Setting KPI) and the
     User App's Lapor KPI live preview, so the two never disagree. 100% is
     split evenly across the top-level indicators; if an indicator has its
     own sub-indicators, ITS share is in turn split evenly across them (5
     indikator -> 20% each; one of those with 4 sub -> 5% each sub). Purely
     structural (sibling COUNT), independent of target size or actuals —
     mirrors the server's pg_kpi_compute() in api/routes/kpi.php exactly, so
     changing one requires changing the other. Returns { itemId: pct }. */
  function kpiItemWeights(items) {
    var weights = {};
    function assign(list, share) {
      var n = (list || []).length;
      if (!n) return;
      var each = share / n;
      list.forEach(function (it) {
        weights[it.id] = each;
        if (it.children && it.children.length) assign(it.children, each);
      });
    }
    assign(items, 100);
    return weights;
  }
  function _qs(o) {
    o = o || {};
    return Object.keys(o).filter(function (k) { return o[k] != null && o[k] !== ""; })
      .map(function (k) { return encodeURIComponent(k) + "=" + encodeURIComponent(o[k]); }).join("&");
  }

  /* ---------- domain-friendly reads (joins over the cache) ---------- */
  /* A missing key in featureAccess means "enabled" — see FeatureAccess.php's
     catalog-in-code / DB-holds-only-overrides convention. UI-only gate: this
     just declutters the menu, it's not an access-control boundary. */
  function featureEnabled(key) { return (read().featureAccess || {})[key] !== false; }
  /* Kerja Staf — every staff's todos for today. Read-only view + the ability
     for a lead (whoever has the feature) to assign a todo to any staff. */
  function staffWork() { return api("staff-work"); }
  function staffWorkAddTodo(payload) { return write("staff-work/todo", { method: "POST", body: payload || {} }); }
  /* Hasil Kunjungan — read-only view of every staff's visit reports for one day. */
  function visitResults(day) { return api("visit-results?day=" + encodeURIComponent(day || "today")); }
  /* Hasil KPI — read-only view of every staff's KPI reports (filter: period / division / month). */
  function kpiResults(params) { return api("kpi-results?" + _qs(params || {})); }
  function kpiResult(id) { return api("kpi-results/" + encodeURIComponent(id)); }
  function divisionFeatures() { return api("division-features"); }
  function saveDivisionFeatures(items) { return write("division-features", { method: "POST", body: { items: items || [] } }); }
  function userFeatures(userId) { return api("user-features?" + _qs({ userId: userId })); }
  function saveUserFeature(userId, featureKey, enabled) {
    return write("user-features", { method: "POST", body: { userId: userId, featureKey: featureKey, enabled: enabled } });
  }
  function divisionName(id) { var d = find("divisions", id); return d ? d.name : "—"; }
  function branchName(id) { var b = find("branches", id); return b ? b.name : "—"; }
  function storeName(id) { var s = find("stores", id); return s ? s.name : "—"; }
  function positionName(id) { var p = find("positions", id); return p ? p.name : "—"; }
  function userByUsername(uname) {
    uname = String(uname || "").trim().toLowerCase();
    var list = read().users || [];
    for (var i = 0; i < list.length; i++)
      if (String(list[i].username).toLowerCase() === uname) return list[i];
    return null;
  }
  function userDivisionIds(u) {
    if (!u) return [];
    if (u.divisionIds && u.divisionIds.length) return u.divisionIds.map(String);
    return u.divisionId ? [String(u.divisionId)] : [];
  }
  function expandUser(u) {
    if (!u) return null;
    var ids = userDivisionIds(u);
    return Object.assign({}, u, {
      divisionLabel: divisionName(u.divisionId),
      divisionLabels: ids.map(divisionName),
      branchLabel: branchName(u.branchId),
      positionLabel: positionName(u.positionId)
    });
  }
  function todosForUser(userId) {
    return (read().todos || []).filter(function (t) { return String(t.assigneeId) === String(userId); });
  }

  /* ---------- master-data helpers ---------- */
  function activeList(coll) {
    return (read()[coll] || []).filter(function (r) { return r.status === "active"; });
  }
  function usernameExists(uname, exceptId) {
    uname = String(uname || "").trim().toLowerCase();
    if (!uname) return false;
    return (read().users || []).some(function (u) {
      return String(u.id) !== String(exceptId) && String(u.username).toLowerCase() === uname;
    });
  }
  function usersInDivision(divisionId) {
    var did = String(divisionId);
    return (read().users || []).filter(function (u) { return userDivisionIds(u).indexOf(did) >= 0; });
  }
  function usersInBranch(branchId) {
    return (read().users || []).filter(function (u) { return String(u.branchId) === String(branchId); });
  }
  function usersInPosition(positionId) {
    return (read().users || []).filter(function (u) { return String(u.positionId) === String(positionId); });
  }
  function divisionColleagues(userId) {
    var me = find("users", userId);
    if (!me) return [];
    var mine = userDivisionIds(me);
    return (read().users || []).filter(function (u) {
      return userDivisionIds(u).some(function (d) { return mine.indexOf(d) >= 0; });
    });
  }

  /* ============================================================
     SETTINGS
     ============================================================ */
  function getAttendanceSettings() { return Object.assign({}, read().attendanceSettings); }
  function saveAttendanceSettings(changes) {
    // Accepts a partial of { checkIn, checkOut, lateToleranceMin, overtimeStart, overtimeEnd, workDays }
    return write("attendance-settings", { method: "PUT", body: changes || {} })
      .then(function (res) {
        if (res.record) _db.attendanceSettings = res.record;
        return res.ok ? getAttendanceSettings() : res;
      });
  }
  function getSystemSettings() { return Object.assign({}, read().systemSettings); }
  function saveSystemSettings(changes) {
    return write("system-settings", { method: "PUT", body: changes || {} })
      .then(function (res) {
        if (res.record) _db.systemSettings = res.record;
        return res.ok ? getSystemSettings() : res;
      });
  }

  /* ---------- holidays ---------- */
  function _holDate(h) { return typeof h === "string" ? h : h.date; }
  function listHolidays() {
    return (read().attendanceSettings.holidays || []).map(function (h) {
      return typeof h === "string" ? { date: h, label: "Hari Libur" } : h;
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }
  function addHoliday(date, label) {
    if (!date) return Promise.resolve(listHolidays());
    return write("holidays", { method: "POST", body: { date: date, label: (label || "").trim() } })
      .then(function (res) { return (res && res.ok === false) ? res : listHolidays(); });
  }
  function removeHoliday(date) {
    return write("holidays/" + encodeURIComponent(date), { method: "DELETE" })
      .then(function (res) { return (res && res.ok === false) ? res : listHolidays(); });
  }
  function isHoliday(key) {
    key = key || dateKey();
    return (read().attendanceSettings.holidays || []).some(function (h) { return _holDate(h) === key; });
  }

  /* ============================================================
     ATTENDANCE  (pure read/aggregate helpers over the cache)
     ============================================================ */
  var DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function dateKey(d) {
    d = d || new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }
  function serverToday() { return _serverDate || dateKey(); }
  function _hmToMin(hm) {
    var p = String(hm || "0:0").split(":");
    return (parseInt(p[0], 10) || 0) * 60 + (parseInt(p[1], 10) || 0);
  }
  function isWorkDay(d) {
    d = d || new Date();
    var s = read().attendanceSettings;
    return (s.workDays || []).indexOf(DOW[d.getDay()]) >= 0 && !isHoliday(dateKey(d));
  }
  function attendanceToday(userId, key) {
    key = key || dateKey();
    var list = read().attendanceRecords || [];
    for (var i = 0; i < list.length; i++)
      if (String(list[i].userId) === String(userId) && list[i].date === key) return list[i];
    return null;
  }
  function attendanceForUser(userId) {
    return (read().attendanceRecords || [])
      .filter(function (r) { return String(r.userId) === String(userId); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function allAttendance() {
    return (read().attendanceRecords || []).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function attendanceStatus(userId) {
    var r = attendanceToday(userId);
    if (!r) return "belum";
    if (r.checkOutAt) return "pulang";
    return r.checkInStatus || "hadir";
  }
  function _timeOfDayMin(iso) { var d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); }
  function isEarlyLeave(rec) {
    if (!rec || !rec.checkOutAt) return false;
    return _timeOfDayMin(rec.checkOutAt) < _hmToMin(read().attendanceSettings.checkOut);
  }
  /* Regular working time for one attendance record: the OVERLAP of the actual
     check-in → check-out span with that day's scheduled work window
     (attendanceSettings.checkIn .. checkOut). Time on site BEFORE the start
     or AFTER the end is deliberately NOT counted — arriving early or clocking
     out very late (e.g. 20:00 on an 08:00–17:00 schedule) never inflates the
     figure past the scheduled window (~8–9 h/day). Work outside those hours
     belongs to the separate Lembur (overtime) feature. */
  function attendanceWorkedMs(rec) {
    if (!rec || !rec.checkInAt || !rec.checkOutAt) return 0;
    var inMs  = new Date(rec.checkInAt).getTime();
    var outMs = new Date(rec.checkOutAt).getTime();
    if (!(outMs > inMs)) return 0;

    var s = read().attendanceSettings || {};
    var startMin = _hmToMin(s.checkIn || "08:00");
    var endMin   = _hmToMin(s.checkOut || "17:00");
    if (!(endMin > startMin)) return outMs - inMs;   // misconfigured / overnight window — leave raw

    var midnight = new Date(rec.checkInAt); midnight.setHours(0, 0, 0, 0);
    var winStart = midnight.getTime() + startMin * 60000;
    var winEnd   = midnight.getTime() + endMin   * 60000;

    var from = Math.max(inMs, winStart);
    var to   = Math.min(outMs, winEnd);
    return to > from ? to - from : 0;
  }
  function summarizeAttendance(records) {
    records = records || [];
    var s = { total: records.length, hadir: 0, terlambat: 0, pulang: 0, kabur: 0, workedMs: 0 };
    records.forEach(function (r) {
      if (r.checkInStatus === "terlambat") s.terlambat++; else s.hadir++;
      if (r.checkOutAt) s.pulang++;
      if (isEarlyLeave(r)) s.kabur++;
      s.workedMs += attendanceWorkedMs(r);
    });
    return s;
  }
  function todayAttendanceSummary() {
    var key = dateKey();
    var recs = (read().attendanceRecords || []).filter(function (r) { return r.date === key; });
    var activeUsers = (read().users || []).filter(function (u) { return u.status === "active"; });
    var seen = {}, hadir = 0, terlambat = 0, pulang = 0;
    recs.forEach(function (r) {
      seen[r.userId] = 1;
      if (r.checkInStatus === "terlambat") terlambat++; else hadir++;
      if (r.checkOutAt) pulang++;
    });
    var belum = activeUsers.filter(function (u) { return !seen[u.id]; }).length;
    return { totalActive: activeUsers.length, present: recs.length,
      hadir: hadir, terlambat: terlambat, pulang: pulang, belum: belum };
  }

  /* ---------- attendance WRITES ---------- */
  function checkIn(userId, photo) {
    if (!photo || String(photo).indexOf("data:image") !== 0)
      return Promise.resolve({ ok: false, error: "Foto selfie wajib sebelum menyimpan absensi." });
    return write("attendance/check-in", { method: "POST", body: { photo: photo } });
  }
  function checkOut(userId, photo) {
    if (!photo || String(photo).indexOf("data:image") !== 0)
      return Promise.resolve({ ok: false, error: "Foto selfie wajib sebelum menyimpan absensi." });
    return write("attendance/check-out", { method: "POST", body: { photo: photo } });
  }

  /* ---------- izin / permission (selfie + reason, submit-only) ---------- */
  function izinForUser(userId) {
    return (read().izinRecords || [])
      .filter(function (r) { return String(r.userId) === String(userId); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function allIzin() {
    return (read().izinRecords || []).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function izinToday(userId, key) {
    key = key || dateKey();
    var list = read().izinRecords || [];
    for (var i = 0; i < list.length; i++)
      if (String(list[i].userId) === String(userId) && list[i].date === key) return list[i];
    return null;
  }
  function submitIzin(reason, photo) {
    if (!photo || String(photo).indexOf("data:image") !== 0)
      return Promise.resolve({ ok: false, error: "Foto selfie wajib sebelum mengirim izin." });
    if (!String(reason || "").trim())
      return Promise.resolve({ ok: false, error: "Keterangan izin wajib diisi." });
    return write("izin", { method: "POST", body: { reason: String(reason).trim(), photo: photo } });
  }
  function deleteIzin(id) { return write("izin/" + encodeURIComponent(id), { method: "DELETE" }); }

  /* ---------- pengeluaran (a plain expense LOGBOOK for staff — nama, nominal,
     catatan opsional + foto lampiran; tanggal diambil otomatis oleh server) ---------- */
  function expensesForUser(userId) {
    return (read().expenseRecords || [])
      .filter(function (r) { return String(r.userId) === String(userId); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function allExpenses() {
    return (read().expenseRecords || []).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function submitExpense(fields, photoFile) {
    fields = fields || {};
    if (!String(fields.name || "").trim())
      return Promise.resolve({ ok: false, error: "Nama pengeluaran wajib diisi." });
    if (!(Number(fields.amount) > 0))
      return Promise.resolve({ ok: false, error: "Nominal pengeluaran wajib diisi." });
    if (!photoFile)
      return Promise.resolve({ ok: false, error: "Foto lampiran wajib disertakan." });
    var fd = new FormData();
    fd.append("name", String(fields.name).trim());
    fd.append("amount", String(Math.round(Number(fields.amount))));
    if (fields.note) fd.append("note", fields.note);
    fd.append("photo", photoFile);
    return write("expenses", { method: "POST", body: fd });
  }
  function deleteExpense(id) { return write("expenses/" + encodeURIComponent(id), { method: "DELETE" }); }

  /* ---------- resi gudang (catatan barang masuk gudang — 13 kolom laporan;
     karyawan boleh buat/ubah/hapus catatannya sendiri, Admin baca semua di
     "Laporan Resi Gudang"). Bootstrap mengirim warehouseReceipts. ---------- */
  function warehouseReceiptsForUser(userId) {
    return (read().warehouseReceipts || [])
      .filter(function (r) { return String(r.userId) === String(userId); })
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  function allWarehouseReceipts() {
    return (read().warehouseReceipts || []).slice()
      .sort(function (a, b) { return a.date < b.date ? 1 : a.date > b.date ? -1 : 0; });
  }
  /* Draft only needs a name to identify it in "Riwayat Resi" later — every
     other field/business-rule check is for "Kirim" (submitted) only. */
  function _whrValidate(f, isDraft) {
    f = f || {};
    if (isDraft) {
      if (!String(f.itemName || "").trim()) return "Nama barang wajib diisi (minimal, untuk simpan draft).";
      return null;
    }
    if (!String(f.date || "").trim()) return "Tanggal wajib diisi.";
    if (!String(f.itemName || "").trim()) return "Nama barang wajib diisi.";
    if (!String(f.supplier || "").trim()) return "Supplier wajib diisi.";
    if (!String(f.resiNo || "").trim()) return "No resi wajib diisi.";
    if (!(Number(f.qty) > 0)) return "Pcs wajib diisi.";
    return null;
  }
  function _whrBody(f) {
    return {
      date: String(f.date || "").trim(),
      itemName: String(f.itemName).trim(),
      supplier: f.supplier ? String(f.supplier).trim() : "",
      resiNo: f.resiNo ? String(f.resiNo).trim() : "",
      qty: Math.round(Number(f.qty) || 0),
      unitPrice: Math.round(Number(f.unitPrice) || 0),
      totalPrice: Math.round(Number(f.totalPrice) || 0),
      shippingCost: Math.round(Number(f.shippingCost) || 0),
      note: f.note ? String(f.note).trim() : "",
      receivedDate: f.receivedDate ? String(f.receivedDate).trim() : "",
      goodsStatus: (f.goodsStatus === "klop" || f.goodsStatus === "minus") ? f.goodsStatus : "",
      payment: f.payment ? String(f.payment).trim() : "",
      paymentStatus: f.paymentStatus === "lunas" ? "lunas" : "belum_lunas",
      dueDate: f.dueDate ? String(f.dueDate).trim() : "",
      shipping: f.shipping ? String(f.shipping).trim() : "",
      koli: Math.round(Number(f.koli) || 0),
      status: f.status === "draft" ? "draft" : "submitted"
    };
  }
  function submitWarehouseReceipt(fields) {
    fields = fields || {};
    var err = _whrValidate(fields, fields.status === "draft");
    if (err) return Promise.resolve({ ok: false, error: err });
    return write("warehouse-receipts", { method: "POST", body: _whrBody(fields) });
  }
  function updateWarehouseReceipt(id, fields) {
    fields = fields || {};
    var err = _whrValidate(fields, fields.status === "draft");
    if (err) return Promise.resolve({ ok: false, error: err });
    return write("warehouse-receipts/" + encodeURIComponent(id), { method: "PATCH", body: _whrBody(fields) });
  }
  function deleteWarehouseReceipt(id) {
    return write("warehouse-receipts/" + encodeURIComponent(id), { method: "DELETE" });
  }
  /* Laporan Resi — read-only view of EVERY staff's resi gudang (cross-staff,
     gated per division via feature `laporan_resi`). Not in bootstrap; fetched
     on demand like visitResults / kpiResults. */
  function warehouseReceiptsAll() { return api("warehouse-receipts-all"); }

  /* ---------- Data Supplier (shared master list — Resi Gudang dropdown) ---------- */
  function allWarehouseSuppliers() {
    return (read().warehouseSuppliers || []).slice()
      .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  }
  function warehouseSupplierCreate(name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve({ ok: false, error: "Nama supplier wajib diisi." });
    return write("warehouse-suppliers", { method: "POST", body: { name: name } });
  }
  function warehouseSupplierUpdate(id, name) {
    name = String(name || "").trim();
    if (!name) return Promise.resolve({ ok: false, error: "Nama supplier wajib diisi." });
    return write("warehouse-suppliers/" + encodeURIComponent(id), { method: "PATCH", body: { name: name } });
  }
  function warehouseSupplierDelete(id) {
    return write("warehouse-suppliers/" + encodeURIComponent(id), { method: "DELETE" });
  }

  /* Single source of truth for a resi's status badge/color — shared by the
     "Resi Gudang" input page, "Laporan Resi" (cross-staff), and the Admin
     "Laporan Resi Gudang" page, so the three screens never disagree.
     A draft always wins first (its payment/goods data is still provisional);
     otherwise an unpaid resi past its due date is ALWAYS "Jatuh Tempo"
     (danger) regardless of goods_status; paid+klop is green, paid+minus is
     yellow, plain "Lunas"/"Belum Lunas" (goods not yet received, or paid but
     not yet due) fall back to a neutral/info tone. */
  function warehouseReceiptStatus(r) {
    r = r || {};
    if (r.status === "draft") {
      return { key: "draft", tone: "neutral", label: "Draft" };
    }
    var today = dateKey();
    if (r.paymentStatus !== "lunas" && r.dueDate && r.dueDate < today) {
      return { key: "jatuh_tempo", tone: "danger", label: "Resi Jatuh Tempo" };
    }
    if (r.paymentStatus === "lunas" && r.goodsStatus === "klop") {
      return { key: "lunas_klop", tone: "success", label: "Lunas · Klop" };
    }
    if (r.paymentStatus === "lunas" && r.goodsStatus === "minus") {
      return { key: "lunas_minus", tone: "warning", label: "Lunas · Minus" };
    }
    if (r.paymentStatus === "lunas") {
      return { key: "lunas", tone: "info", label: "Lunas" };
    }
    return { key: "belum_lunas", tone: "neutral", label: "Belum Lunas" };
  }

  /* Urgency tiering for an unpaid resi's due date. Unlike warehouseReceiptStatus()
     above — whose red "Jatuh Tempo" badge only lights up once a resi is ACTUALLY
     overdue — this looks at every unpaid resi that has a due date at all, so the
     Resi Gudang "Jatuh Tempo" stat card can work as an early-warning list instead
     of only surfacing a bill once it's already late. Returns null when the resi
     isn't a due-date candidate (already lunas, or no due date set). */
  function warehouseDueUrgency(r) {
    r = r || {};
    if (r.paymentStatus === "lunas" || !r.dueDate) return null;
    var today = serverToday();
    var diffDays = Math.round((new Date(r.dueDate + "T00:00:00") - new Date(today + "T00:00:00")) / 86400000);
    if (diffDays < 0) {
      return { key: "lewat", tone: "danger", days: diffDays, label: "Lewat " + Math.abs(diffDays) + " Hari" };
    }
    if (diffDays <= 3) {
      return { key: "segera", tone: "danger", days: diffDays,
        label: diffDays === 0 ? "Segera Dibayar · Hari Ini" : "Segera Dibayar · " + diffDays + " Hari Lagi" };
    }
    if (diffDays <= 7) {
      return { key: "mendekati", tone: "warning", days: diffDays, label: "Mendekati · " + diffDays + " Hari Lagi" };
    }
    return { key: "aman", tone: "success", days: diffDays, label: "Aman · " + diffDays + " Hari Lagi" };
  }

  /* ---------- jadwal piket (weekly recurring duty roster, keyed by day-of-week) ---------- */
  var PIKET_DAYS = [
    { value: "mon", label: "Senin" }, { value: "tue", label: "Selasa" }, { value: "wed", label: "Rabu" },
    { value: "thu", label: "Kamis" }, { value: "fri", label: "Jumat" }, { value: "sat", label: "Sabtu" },
    { value: "sun", label: "Minggu" }
  ];
  function piketDayLabel(code) {
    var d = PIKET_DAYS.filter(function (x) { return x.value === code; })[0];
    return d ? d.label : code;
  }
  function piketTodayCode() {
    // JS getDay(): 0=Sun..6=Sat -> map to our mon..sun codes.
    var map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    return map[new Date().getDay()];
  }
  function allPiketSchedules() { return (read().piketSchedules || []).slice(); }
  function piketForUser(userId) {
    return (read().piketSchedules || []).filter(function (r) { return String(r.userId) === String(userId); });
  }
  function piketSettings() { return read().piketSettings || { reminderTime: "07:00", enabled: true }; }
  // Admin — manage the roster
  function piketScheduleCreate(dayOfWeek, userId, note) {
    return write("piket-schedules", { method: "POST", body: { dayOfWeek: dayOfWeek, userId: userId, note: note || "" } });
  }
  function piketScheduleDelete(id) { return write("piket-schedules/" + encodeURIComponent(id), { method: "DELETE" }); }
  // payload: { reminderTime, enabled, fridayTime, fridayEnabled, fridayMessage }
  function savePiketSettings(payload) {
    return write("piket-settings", { method: "POST", body: payload || {} });
  }

  /* ---------- notifications (in-app feed) ---------- */
  function notifications() {
    return (read().notifications || []).slice()
      .sort(function (a, b) { return (+b.id) - (+a.id); });
  }
  function unreadNotifCount() {
    return (read().notifications || []).filter(function (n) { return !n.read; }).length;
  }
  function markNotifRead(ids) {
    var body = ids === "all" ? { all: true } : { ids: [].concat(ids || []) };
    return write("notifications/read", { method: "POST", body: body });
  }
  function deleteNotif(id) { return write("notifications/" + encodeURIComponent(id), { method: "DELETE" }); }
  function clearReadNotifs() { return write("notifications/clear", { method: "POST" }); }

  /* ---------- Momen feed "unseen posts" badge ---------- */
  var MOMEN_SEEN_KEY = "pg.momen.seenMaxId";
  function _momenMaxId() {
    var m = 0;
    (read().momenPostIds || []).forEach(function (id) { var n = +id; if (n > m) m = n; });
    return m;
  }
  function _momenSeenId() {
    try { return +(localStorage.getItem(MOMEN_SEEN_KEY) || 0) || 0; } catch (e) { return 0; }
  }
  /* How many live posts arrived since this device last opened the feed. */
  function momenUnseenCount() {
    var seen = _momenSeenId();
    return (read().momenPostIds || []).filter(function (id) { return +id > seen; }).length;
  }
  /* Call when the feed is on screen — clears the "new posts" part of the badge.
     Pass the live feed's ids (from store.posts()) so even a just-arrived post
     that the last bootstrap didn't carry yet still counts as seen. */
  function markMomenSeen(feedIds) {
    var max = _momenMaxId();
    (feedIds || []).forEach(function (id) { var n = +id; if (n > max) max = n; });
    if (max <= _momenSeenId()) return;            // nothing newer — avoid an event loop
    try { localStorage.setItem(MOMEN_SEEN_KEY, String(max)); } catch (e) {}
    try { document.dispatchEvent(new CustomEvent("pg:store-changed")); } catch (e) {}
  }
  /* One number for the "Momen" menu item: unseen posts + unread private chats. */
  function momenMenuBadge() { return momenUnseenCount() + chatUnreadCount(); }

  /* ---------- private chat (Momen header) ---------- */
  function chatThreadsCache() { return (read().chatThreads || []).slice(); }
  function chatUnreadCount() { return (read().chatUnread || 0); }
  function chatContacts() { return api("chat/contacts"); }
  function chatThreads() { return api("chat/threads"); }
  function chatOpenThread(withKind, withId) {
    return write("chat/threads", { method: "POST", body: { withKind: withKind, withId: withId } });
  }
  function chatMessages(threadId, opts) {
    return api("chat/threads/" + encodeURIComponent(threadId) + "/messages?" + _qs(opts || {}));
  }
  function chatSend(threadId, body) {
    return api("chat/threads/" + encodeURIComponent(threadId) + "/messages",
      { method: "POST", body: { body: body } });
  }
  function chatMarkRead(threadId) {
    return api("chat/threads/" + encodeURIComponent(threadId) + "/read", { method: "POST" });
  }
  // Admin-only broadcast: "Info Update" popup + push to everyone else.
  function appUpdateSend(title, description) {
    return api("app-update/notify", { method: "POST", body: { title: title, description: description } });
  }

  /* ============================================================
     OVERTIME / LEMBUR  (v9 lifecycle — pure helpers + writes)
     ============================================================ */
  var _OT_IMG = "data:image";

  function overtimeWindow() {
    var s = getAttendanceSettings();
    return { start: s.overtimeStart || "17:00", end: s.overtimeEnd || "23:59" };
  }
  function isWithinOvertimeWindow(d) {
    d = d || new Date();
    var w = overtimeWindow();
    var cur = d.getHours() * 60 + d.getMinutes();
    var a = _hmToMin(w.start), b = _hmToMin(w.end);
    if (a <= b) return cur >= a && cur <= b;
    return cur >= a || cur <= b;
  }
  function overtimeDeadline(rec) {
    var endMin = _hmToMin(overtimeWindow().end);
    var start = new Date(rec.startAt);
    var d = new Date(start);
    d.setHours(Math.floor(endMin / 60), endMin % 60, 59, 999);
    if (d <= start) d.setDate(d.getDate() + 1);
    return d;
  }
  /* Client-side display sync: flip a running lembur that has blown past its
     deadline to "kadaluarsa" in the cache only. The server does the durable
     sweep on every overtime GET; this just keeps the UI honest between pulls. */
  function _syncOvertime() {
    var list = read().overtimeRecords || [];
    var now = Date.now();
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.status === "menunggu" && !r.endAt) r.status = "berjalan";
      if (r.status === "berjalan" && !r.endAt && now > overtimeDeadline(r).getTime()) {
        r.status = "kadaluarsa";
      }
    }
    return list;
  }
  function overtimeToday(userId, key) {
    key = key || dateKey();
    var list = _syncOvertime();
    for (var i = 0; i < list.length; i++)
      if (String(list[i].userId) === String(userId) && list[i].date === key) return list[i];
    return null;
  }
  function openOvertime(userId) {
    var list = _syncOvertime();
    for (var i = list.length - 1; i >= 0; i--)
      if (String(list[i].userId) === String(userId) && list[i].status === "berjalan" && !list[i].endAt) return list[i];
    return null;
  }
  function overtimeForUser(userId) {
    return _syncOvertime()
      .filter(function (r) { return String(r.userId) === String(userId); })
      .sort(function (a, b) { return (a.startAt < b.startAt) ? 1 : (a.startAt > b.startAt) ? -1 : 0; });
  }
  function allOvertime() {
    return _syncOvertime().slice()
      .sort(function (a, b) { return (a.startAt < b.startAt) ? 1 : (a.startAt > b.startAt) ? -1 : 0; });
  }
  function overtimeStatus(userId) {
    var open = openOvertime(userId);
    if (open) return "berjalan";
    var r = overtimeToday(userId);
    return r ? r.status : "belum";
  }
  function overtimeDurationMs(rec) {
    if (!rec || !rec.startAt || !rec.endAt) return 0;
    var ms = new Date(rec.endAt) - new Date(rec.startAt);
    return ms > 0 ? ms : 0;
  }
  function summarizeOvertime(records) {
    records = records || [];
    var s = { total: records.length, berjalan: 0, menunggu: 0, disetujui: 0, ditolak: 0, kadaluarsa: 0, durationMs: 0 };
    records.forEach(function (r) {
      if (s[r.status] != null) s[r.status]++;
      if (r.status === "disetujui") s.durationMs += overtimeDurationMs(r);
    });
    return s;
  }

  /* ---------- overtime WRITES ---------- */
  function startOvertime(userId, opts) {
    opts = opts || {};
    var desc = String(opts.description || "").trim();
    if (!desc) return Promise.resolve({ ok: false, error: "Keterangan lembur wajib diisi." });
    if (!opts.photo || String(opts.photo).indexOf(_OT_IMG) !== 0)
      return Promise.resolve({ ok: false, error: "Foto selfie wajib sebelum memulai lembur." });
    return write("overtime/start", { method: "POST", body: { description: desc, photo: opts.photo } });
  }
  function endOvertime(userId, opts) {
    opts = opts || {};
    if (!opts.photo || String(opts.photo).indexOf(_OT_IMG) !== 0)
      return Promise.resolve({ ok: false, error: "Foto selfie wajib sebelum menyelesaikan lembur." });
    return write("overtime/end", { method: "POST", body: { photo: opts.photo } });
  }
  function approveOvertime(overtimeId, adminName) {
    return write("overtime/" + encodeURIComponent(overtimeId) + "/approve", { method: "POST", body: {} });
  }
  function rejectOvertime(overtimeId, adminName, reason) {
    return write("overtime/" + encodeURIComponent(overtimeId) + "/reject",
      { method: "POST", body: { reason: String(reason || "").trim() } });
  }

  /* ============================================================
     PUBLIC API
     ============================================================ */
  PG.store = {
    DB_KEY: DB_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    uid: uid,
    nowISO: nowISO,
    api: api,
    _raw: read,

    hydrate: hydrate,
    refresh: refresh,
    ready: ready,
    isHydrated: isHydrated,
    serverToday: serverToday,
    startRealtime: startRealtime,
    stopRealtime: stopRealtime,

    all: all,
    find: find,
    insert: insert,
    patch: patch,
    remove: remove,
    updateTodoProgress: updateTodoProgress,
    createMyTodo: createMyTodo,
    updateMyTodo: updateMyTodo,
    deleteMyTodo: deleteMyTodo,
    todosPurgeStale: todosPurgeStale,
    adminProfile: adminProfile,
    adminProfileSave: adminProfileSave,
    adminChangePassword: adminChangePassword,
    updateMyProfile: updateMyProfile,
    setMyProfilePhoto: setMyProfilePhoto,
    removeMyProfilePhoto: removeMyProfilePhoto,
    programList: programList,
    program: program,
    programCreate: programCreate,
    programUpdate: programUpdate,
    programSetCover: programSetCover,
    programDelete: programDelete,
    todoAttachments: todoAttachments,
    uploadTodoAttachment: uploadTodoAttachment,
    addTodoLink: addTodoLink,
    removeTodoAttachment: removeTodoAttachment,
    attachmentArchive: attachmentArchive,
    myAttachmentArchive: myAttachmentArchive,

    kpiTemplates: kpiTemplates,
    kpiTemplate: kpiTemplate,
    kpiTemplateCreate: kpiTemplateCreate,
    kpiTemplateUpdate: kpiTemplateUpdate,
    kpiTemplateDelete: kpiTemplateDelete,
    kpiItemCreate: kpiItemCreate,
    kpiItemUpdate: kpiItemUpdate,
    kpiItemDelete: kpiItemDelete,
    kpiItemsReorder: kpiItemsReorder,
    kpiReports: kpiReports,
    kpiReport: kpiReport,
    kpiResults: kpiResults,
    kpiResult: kpiResult,
    kpiReportReview: kpiReportReview,
    kpiReportDelete: kpiReportDelete,
    kpiMyTemplates: kpiMyTemplates,
    kpiMyReport: kpiMyReport,
    kpiMyReportSave: kpiMyReportSave,
    kpiMyReportDelete: kpiMyReportDelete,
    kpiMyReports: kpiMyReports,
    posts: posts,
    postCreate: postCreate,
    postCreateVideo: postCreateVideo,
    postDelete: postDelete,
    postLike: postLike,
    postComments: postComments,
    postCommentAdd: postCommentAdd,
    postCommentLike: postCommentLike,
    postCommentDelete: postCommentDelete,
    kpiBand: kpiBand,
    kpiMethodLabel: kpiMethodLabel,
    kpiItemWeights: kpiItemWeights,

    visits: visits,
    visitResults: visitResults,
    visit: visit,
    visitPhotos: visitPhotos,
    visitReview: visitReview,
    visitDelete: visitDelete,
    visitPurgeStale: visitPurgeStale,
    visitRemoveAttachment: visitRemoveAttachment,
    myVisits: myVisits,
    myVisitSave: myVisitSave,
    myVisitSubmit: myVisitSubmit,
    myVisitDelete: myVisitDelete,
    visitUploadAttachment: visitUploadAttachment,
    myVisitChecklist: myVisitChecklist,
    visitChecklistItems: visitChecklistItems,
    visitChecklistItemCreate: visitChecklistItemCreate,
    visitChecklistItemUpdate: visitChecklistItemUpdate,
    visitChecklistItemDelete: visitChecklistItemDelete,
    visitChecklistReorder: visitChecklistReorder,
    featureEnabled: featureEnabled,
    staffWork: staffWork,
    staffWorkAddTodo: staffWorkAddTodo,
    divisionFeatures: divisionFeatures,
    saveDivisionFeatures: saveDivisionFeatures,
    userFeatures: userFeatures,
    saveUserFeature: saveUserFeature,
    fileObjectUrl: fileObjectUrl,
    photoObjectUrl: photoObjectUrl,
    photoObjectUrlReady: photoObjectUrlReady,

    divisionName: divisionName,
    userDivisionIds: userDivisionIds,
    branchName: branchName,
    storeName: storeName,
    positionName: positionName,
    userByUsername: userByUsername,
    expandUser: expandUser,
    todosForUser: todosForUser,

    activeList: activeList,
    usernameExists: usernameExists,
    usersInDivision: usersInDivision,
    usersInBranch: usersInBranch,
    usersInPosition: usersInPosition,
    divisionColleagues: divisionColleagues,

    getAttendanceSettings: getAttendanceSettings,
    saveAttendanceSettings: saveAttendanceSettings,
    getSystemSettings: getSystemSettings,
    saveSystemSettings: saveSystemSettings,

    listHolidays: listHolidays,
    addHoliday: addHoliday,
    removeHoliday: removeHoliday,
    isHoliday: isHoliday,
    isWorkDay: isWorkDay,
    dateKey: dateKey,
    attendanceToday: attendanceToday,
    attendanceForUser: attendanceForUser,
    allAttendance: allAttendance,
    attendanceStatus: attendanceStatus,
    todayAttendanceSummary: todayAttendanceSummary,
    summarizeAttendance: summarizeAttendance,
    isEarlyLeave: isEarlyLeave,
    attendanceWorkedMs: attendanceWorkedMs,
    checkIn: checkIn,
    checkOut: checkOut,

    izinForUser: izinForUser,
    allIzin: allIzin,
    izinToday: izinToday,
    submitIzin: submitIzin,
    deleteIzin: deleteIzin,

    expensesForUser: expensesForUser,
    allExpenses: allExpenses,
    submitExpense: submitExpense,
    deleteExpense: deleteExpense,

    warehouseReceiptsForUser: warehouseReceiptsForUser,
    allWarehouseReceipts: allWarehouseReceipts,
    warehouseReceiptsAll: warehouseReceiptsAll,
    warehouseReceiptStatus: warehouseReceiptStatus,
    warehouseDueUrgency: warehouseDueUrgency,
    allWarehouseSuppliers: allWarehouseSuppliers,
    warehouseSupplierCreate: warehouseSupplierCreate,
    warehouseSupplierUpdate: warehouseSupplierUpdate,
    warehouseSupplierDelete: warehouseSupplierDelete,
    submitWarehouseReceipt: submitWarehouseReceipt,
    updateWarehouseReceipt: updateWarehouseReceipt,
    deleteWarehouseReceipt: deleteWarehouseReceipt,

    PIKET_DAYS: PIKET_DAYS,
    piketDayLabel: piketDayLabel,
    piketTodayCode: piketTodayCode,
    allPiketSchedules: allPiketSchedules,
    piketForUser: piketForUser,
    piketSettings: piketSettings,
    piketScheduleCreate: piketScheduleCreate,
    piketScheduleDelete: piketScheduleDelete,
    savePiketSettings: savePiketSettings,

    notifications: notifications,
    unreadNotifCount: unreadNotifCount,
    markNotifRead: markNotifRead,
    deleteNotif: deleteNotif,
    clearReadNotifs: clearReadNotifs,
    appUpdateSend: appUpdateSend,

    momenUnseenCount: momenUnseenCount,
    markMomenSeen: markMomenSeen,
    momenMenuBadge: momenMenuBadge,
    chatThreadsCache: chatThreadsCache,
    chatUnreadCount: chatUnreadCount,
    chatContacts: chatContacts,
    chatThreads: chatThreads,
    chatOpenThread: chatOpenThread,
    chatMessages: chatMessages,
    chatSend: chatSend,
    chatMarkRead: chatMarkRead,

    overtimeToday: overtimeToday,
    openOvertime: openOvertime,
    overtimeForUser: overtimeForUser,
    allOvertime: allOvertime,
    overtimeStatus: overtimeStatus,
    overtimeDurationMs: overtimeDurationMs,
    overtimeWindow: overtimeWindow,
    overtimeDeadline: overtimeDeadline,
    isWithinOvertimeWindow: isWithinOvertimeWindow,
    summarizeOvertime: summarizeOvertime,
    startOvertime: startOvertime,
    endOvertime: endOvertime,
    approveOvertime: approveOvertime,
    rejectOvertime: rejectOvertime
  };
})(window.PG = window.PG || {});
