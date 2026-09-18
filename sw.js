/* ============================================================
   PREMIERE GROUP — Service Worker
   ------------------------------------------------------------
   Goal: make the app installable + give it a fast, offline-tolerant
   shell. It is deliberately conservative:
     - /api/*            -> network ONLY (never cached; auth + live data)
     - navigations       -> network first, fall back to a cached shell
     - static assets     -> cache first (they are versioned with ?v=NN,
                            so a new release = a new URL = fresh fetch)
   ============================================================ */
var VERSION = 'pg-v80';
var SHELL_CACHE = VERSION + '-shell';
var ASSET_CACHE = VERSION + '-assets';

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(SHELL_CACHE).then(function (c) {
      // Best-effort: cache the two shells + the icon. Never fail install.
      return c.addAll(['/', '/admin', '/assets/img/icon-192.png']).catch(function () {});
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k.indexOf(VERSION) !== 0) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // 1. API — always live, never cached.
  if (url.pathname === '/api' || url.pathname.indexOf('/api/') === 0) {
    return; // let the browser do its normal thing
  }

  // 2. Navigations — network first, cached shell as offline fallback.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(SHELL_CACHE).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        var shell = url.pathname.indexOf('/admin') === 0 ? '/admin' : '/';
        return caches.match(req).then(function (m) { return m || caches.match(shell); });
      })
    );
    return;
  }

  // 3. Static assets — cache first, then update in the background.
  if (/\.(?:css|js|png|jpg|jpeg|gif|svg|webp|ico|woff2?|webmanifest)$/i.test(url.pathname)) {
    e.respondWith(
      caches.match(req).then(function (hit) {
        var net = fetch(req).then(function (res) {
          if (res && res.status === 200) {
            var copy = res.clone();
            caches.open(ASSET_CACHE).then(function (c) { c.put(req, copy); });
          }
          return res;
        }).catch(function () { return hit; });
        return hit || net;
      })
    );
  }
});

/* ============================================================
   Web Push (Layer 2) — OS notification even when the app is closed.
   Payload from the server: { title, body, route, url, tag }
   ============================================================ */
self.addEventListener('push', function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) { d = { title: 'Premiere Group', body: (e.data && e.data.text && e.data.text()) || '' }; }

  var title = d.title || 'Premiere Group';
  var tag = d.tag || ('pg-' + Date.now());
  var isPrayer = /prayer/i.test(tag) || /prayer\.adzan/i.test(d.route || '') || /telah tiba/i.test(d.body || '');
  var opts = {
    body: d.body || '',
    icon: '/assets/img/icon-192.png',
    badge: '/assets/img/icon-192.png',
    tag: tag,
    renotify: true,
    // A longer, distinct pulse for the adzan reminder; a short one otherwise.
    vibrate: isPrayer ? [200, 100, 200, 100, 400] : [120, 60, 120],
    requireInteraction: !!isPrayer,
    // Adzan pushes get a "Lewati" action button, tappable straight from the
    // notification shade/lock screen without opening the app.
    actions: isPrayer ? [{ action: 'skip', title: 'Lewati' }] : [],
    data: { route: d.route || '/', url: d.url || d.route || '/', type: isPrayer ? 'prayer' : 'general' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function (e) {
  var data = e.notification.data || {};
  e.notification.close();

  // "Lewati" tapped on the notification itself: just silence any adzan audio
  // already playing in an open tab and dismiss — never opens/focuses the app.
  if (e.action === 'skip') {
    e.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
        wins.forEach(function (w) { try { w.postMessage({ type: 'pg:adzan-skip' }); } catch (err) {} });
      })
    );
    return;
  }

  var route = data.route || '/';
  var target = new URL(data.url || route, self.location.origin).href;

  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (wins) {
      for (var i = 0; i < wins.length; i++) {
        var w = wins[i];
        if (w.url.indexOf(self.location.origin) !== 0) continue;
        var sameApp = (target.indexOf('/admin') > -1) === (w.url.indexOf('/admin') > -1);
        if (!sameApp) continue;
        return w.focus().then(function () {
          try { w.postMessage({ type: 'pg:navigate', route: route }); } catch (err) {}
          if (w.navigate) { try { return w.navigate(target); } catch (err) {} }
        });
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
