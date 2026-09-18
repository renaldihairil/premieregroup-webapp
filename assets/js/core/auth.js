/* ============================================================
   PREMIERE GROUP — Authentication & access control
   ------------------------------------------------------------
   Server-side sessions (PHP). The browser only holds the opaque
   HttpOnly PREMIERE_SESS cookie. This module keeps a small cached
   copy of the principal + CSRF token so the guards the screens
   already call (currentUser / currentAdmin / can / requireAdmin)
   stay SYNCHRONOUS. Login / logout are async.

     - Admin logs in with a PASSWORD  -> POST /api/auth/login/admin
       (verified server-side with bcrypt; no hash ever reaches the client).
     - Employee logs in with a USERNAME -> POST /api/auth/login/user
       (must be status "active" and not deleted).
     - Identity is re-checked by the server on every guarded request.
   ============================================================ */
(function (PG) {
  "use strict";

  var SESSION_KEY = "pg_session_v2"; // legacy reference guard only

  var ROLES = {
    SUPER_ADMIN: "super_admin",
    ADMIN: "admin",
    MANAGER: "manager",
    KEPALA_DIVISI: "kepala_divisi",
    SUPERVISOR: "supervisor",
    STAFF: "staff"
  };
  var ADMIN_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER];
  var USER_ROLES = [ROLES.KEPALA_DIVISI, ROLES.SUPERVISOR, ROLES.STAFF];

  var PERMISSIONS = {
    "admin.access":            [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "todo.manage":             [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "attendance.report.view":  [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "attendance.settings.edit":[ROLES.SUPER_ADMIN, ROLES.ADMIN],
    "overtime.report.view":    [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "overtime.approve":        [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "izin.report.view":        [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "expense.report.view":     [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "warehouse.report.view":   [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "piket.settings.edit":     [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    "kpi.report.view":         [ROLES.SUPER_ADMIN, ROLES.ADMIN, ROLES.MANAGER],
    "kpi.settings.edit":       [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    "org.manage":              [ROLES.SUPER_ADMIN, ROLES.ADMIN],
    "system.settings.edit":    [ROLES.SUPER_ADMIN],
    "user.app.access":         [ROLES.KEPALA_DIVISI, ROLES.SUPERVISOR, ROLES.STAFF]
  };

  /* ---------- cached principal + CSRF ---------- */
  var _principal = null;   // { kind, id, role, name, username } | null
  var _csrf = "";
  var _inflight = null;

  function _absorbPrincipal(p) {
    _principal = p ? {
      kind: p.kind,
      id: String(p.id),
      role: p.role,
      name: p.name,
      username: p.username || null
    } : null;
  }
  function _absorbCsrf(t) { if (t) _csrf = t; }
  function _invalidate() { _principal = null; }
  function csrfToken() { return _csrf; }

  /* Boot-time: learn who we are (if anyone) + get a CSRF token for writes. */
  function hydrate() {
    _inflight = PG.net("auth/me").then(function (data) {
      _absorbCsrf(data && data.csrf);
      // Only an explicit answer from the server changes login state.
      _absorbPrincipal(data && data.authenticated ? data.principal : null);
      return { ok: true, authenticated: !!(data && data.authenticated) };
    }, function () {
      // Network / 5xx while checking the session: DON'T drop a principal we
      // already know — a flaky connection must not look like a logout. Report
      // the transient failure and keep whatever we had.
      return { ok: false, transient: true, authenticated: !!_principal };
    });
    return _inflight;
  }
  function ready() { return _inflight || hydrate(); }

  /* ---------- login / logout ---------- */
  // adminLogin(password)  or  adminLogin(identifier, password)
  // identifier = admin username OR email; may be blank (single-admin shortcut).
  function adminLogin(identifier, password) {
    if (arguments.length < 2) { password = identifier; identifier = ""; }
    return PG.net("auth/login/admin", {
      method: "POST",
      body: { identifier: String(identifier || "").trim(), password: String(password || "") }
    })
      .then(function (data) {
        if (data && data.ok) {
          _absorbCsrf(data.csrf);
          _absorbPrincipal(data.principal);
          return { ok: true, session: _principal };
        }
        return { ok: false, error: (data && data.error) || "Login gagal.", code: data && data.code };
      }, function (err) {
        return { ok: false, error: err.message || "Tidak dapat menghubungi server." };
      });
  }

  function userLogin(username) {
    var uname = String(username || "").trim();
    if (!uname) return Promise.resolve({ ok: false, error: "Masukkan username Anda." });
    return PG.net("auth/login/user", { method: "POST", body: { username: uname } })
      .then(function (data) {
        if (data && data.ok) {
          _absorbCsrf(data.csrf);
          _absorbPrincipal(data.principal);
          return { ok: true, session: _principal };
        }
        return { ok: false, error: (data && data.error) || "Login gagal." };
      }, function (err) {
        return { ok: false, error: err.message || "Tidak dapat menghubungi server." };
      });
  }

  function logout() {
    _invalidate();
    try {
      PG.net("auth/logout", { method: "POST", body: {} }).catch(function () {});
    } catch (e) { /* ignore */ }
  }

  /* ---------- current principal (sync, from cache) ---------- */
  function current() {
    if (!_principal) return null;
    return {
      kind: _principal.kind,
      subjectId: _principal.id,
      name: _principal.name,
      role: _principal.role,
      username: _principal.username
    };
  }
  function currentAdmin() {
    return _principal && _principal.kind === "admin" ? current() : null;
  }
  function currentUser() {
    if (!_principal || _principal.kind !== "user") return null;
    var u = PG.store.find("users", _principal.id);
    if (u) {
      if (u.status !== "active") { _invalidate(); return null; }   // truly deactivated
      return PG.store.expandUser(u);
    }
    // Not in the store cache. If the store IS hydrated, the account genuinely
    // isn't in the payload (deleted/deactivated) -> log out. If it is NOT
    // hydrated yet (boot race, or a transient bootstrap failure the app is
    // retrying), the server already vouched for this session via /auth/me —
    // keep the user on their screen with a lightweight identity until the
    // next store refresh upgrades it to the full record.
    if (PG.store.isHydrated && PG.store.isHydrated()) { _invalidate(); return null; }
    return {
      id: _principal.id, kind: "user", role: _principal.role,
      fullName: _principal.name, username: _principal.username,
      status: "active", divisionId: null, divisionIds: []
    };
  }

  /* ---------- RBAC helpers ---------- */
  function roleOf() { return _principal ? _principal.role : null; }
  function hasRole() {
    var r = roleOf(), args = Array.prototype.slice.call(arguments);
    return args.indexOf(r) >= 0;
  }
  function can(permission) {
    var allowed = PERMISSIONS[permission];
    if (!allowed) return false;
    return allowed.indexOf(roleOf()) >= 0;
  }

  /* ---------- route guards ---------- */
  function requireAdmin() {
    var s = currentAdmin();
    return s && can("admin.access") ? s : null;
  }
  function requireUser() { return currentUser(); }

  PG.auth = {
    ROLES: ROLES,
    ADMIN_ROLES: ADMIN_ROLES,
    USER_ROLES: USER_ROLES,
    PERMISSIONS: PERMISSIONS,
    SESSION_KEY: SESSION_KEY,

    hydrate: hydrate,
    ready: ready,
    csrfToken: csrfToken,
    _absorbCsrf: _absorbCsrf,
    _absorbPrincipal: _absorbPrincipal,
    _invalidate: _invalidate,

    adminLogin: adminLogin,
    userLogin: userLogin,
    logout: logout,

    current: current,
    currentAdmin: currentAdmin,
    currentUser: currentUser,

    roleOf: roleOf,
    hasRole: hasRole,
    can: can,

    requireAdmin: requireAdmin,
    requireUser: requireUser
  };
})(window.PG = window.PG || {});
