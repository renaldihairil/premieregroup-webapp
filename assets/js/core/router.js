/* ============================================================
   PREMIERE GROUP — Client router (History API, clean URLs)
   ------------------------------------------------------------
   Real paths, no "#". Each app declares the base path it is
   mounted at: "" for the employee app (domain root) and "/admin"
   for the Admin Panel. The server rewrites any unknown path under
   that base back to the app's .html (see the root .htaccess), so
   deep links and refresh work.
   ============================================================ */
(function (PG) {
  "use strict";

  function createRouter(opts) {
    opts = opts || {};
    var routes = opts.routes || {};          // { "/path": renderFn }
    var outlet = opts.outlet;                // DOM node to render into
    var fallback = opts.fallback || "/";     // path when the URL is unknown
    var beforeEach = opts.beforeEach;        // (path) => redirectPath | false | true
    var onRendered = opts.onRendered;        // (path) => void
    var base = String(opts.base || "").replace(/\/+$/, ""); // "" or "/admin"
    var current = null;

    /* URL pathname -> in-app route ("/dashboard", …). */
    function parse() {
      var p = window.location.pathname || "/";
      if (base) {
        if (p === base) p = "/";
        else if (p.indexOf(base + "/") === 0) p = p.slice(base.length);
      }
      p = "/" + p.replace(/^\/+/, "").replace(/\/+$/, "");
      return (p === "/" || p === "") ? fallback : p;
    }

    /* in-app route -> full pathname to put in the address bar. */
    function toHref(path) {
      var clean = "/" + String(path == null ? "" : path).replace(/^\/+/, "").replace(/\/+$/, "");
      if (clean === "/") return base ? base + "/" : "/";
      return (base || "") + clean;
    }

    function go(path) {
      var target = toHref(path);
      if (target !== window.location.pathname) {
        window.history.pushState(null, "", target);
      }
      render();
    }
    function replace(path) {
      window.history.replaceState(null, "", toHref(path));
      render();
    }

    function render() {
      var path = parse();

      if (beforeEach) {
        var verdict = beforeEach(path);
        if (typeof verdict === "string" && verdict !== path) { replace(verdict); return; }
        if (verdict === false) { replace(fallback); return; }
      }

      var view = routes[path] || routes[fallback];
      if (!view) return;
      current = path;

      var node = view({ path: path, router: api });
      if (node) {
        while (outlet.firstChild) outlet.removeChild(outlet.firstChild);
        outlet.appendChild(node);
        outlet.scrollTop = 0;
      }
      onRendered && onRendered(path);
    }

    /* Intercept clicks on same-origin <a> so navigation stays in-app.
       Links that point outside this app's base (e.g. the employee app
       linking to /admin) are left alone for a full page load. */
    function onDocClick(e) {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (!a || (a.target && a.target !== "" && a.target !== "_self")) return;
      if (a.hasAttribute("download") || (a.getAttribute("rel") || "").indexOf("external") >= 0) return;
      var raw = a.getAttribute("href") || "";
      if (raw === "" || raw[0] === "#" || /^[a-z]+:/i.test(raw)) return;   // "#", mailto:, https:, tel:

      var url;
      try { url = new URL(a.href, document.baseURI); } catch (err) { return; }
      if (url.origin !== window.location.origin) return;

      var p = url.pathname;
      var inThisApp = base ? (p === base || p.indexOf(base + "/") === 0)
                           : !/^\/admin(\/|$)/.test(p);
      if (!inThisApp) return;   // let the browser navigate (cross-app link)

      e.preventDefault();
      var route = base && p.indexOf(base) === 0 ? (p.slice(base.length) || "/") : p;
      go(route);
    }

    /* Re-render the current route but keep the scroll position — for live
       data refreshes that must not snap a long page back to the top. */
    function softRefresh() {
      var y = outlet ? outlet.scrollTop : 0;
      render();
      if (outlet) outlet.scrollTop = y;
    }

    var api = {
      go: go,
      replace: replace,
      href: toHref,
      current: function () { return current; },
      start: function () {
        window.addEventListener("popstate", render);
        document.addEventListener("click", onDocClick);
        render();
      },
      refresh: render,
      softRefresh: softRefresh
    };
    PG._router = api;
    return api;
  }

  PG.createRouter = createRouter;
})(window.PG = window.PG || {});
