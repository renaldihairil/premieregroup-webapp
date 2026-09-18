/* ============================================================
   PREMIERE GROUP — UI kit (DOM helpers + reusable components)
   Every screen composes its markup from these builders so the
   design system stays consistent across User App and Admin Panel.
   ============================================================ */
(function (PG) {
  "use strict";

  var icon = PG.icon;

  /* ---------- hyperscript ---------- */
  function h(tag, props) {
    var el = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === "class" || k === "className") el.className = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "text") el.textContent = v;
      else if (k === "dataset") Object.keys(v).forEach(function (d) { el.dataset[d] = v[d]; });
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k.slice(0, 2) === "on" && typeof v === "function") {
        el.addEventListener(k.slice(2).toLowerCase(), v);
      } else if (k in el && k !== "list") {
        try { el[k] = v; } catch (e) { el.setAttribute(k, v); }
      } else {
        el.setAttribute(k, v);
      }
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    append(el, kids);
    return el;
  }
  function append(el, kids) {
    kids.forEach(function (c) {
      if (c == null || c === false) return;
      if (Array.isArray(c)) return append(el, c);
      el.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
    });
  }
  function frag() {
    var f = document.createDocumentFragment();
    append(f, Array.prototype.slice.call(arguments));
    return f;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
  function mount(node, child) { clear(node); node.appendChild(child); return node; }
  function svg(name, cls) {
    var span = document.createElement("span");
    span.style.display = "inline-flex";
    span.innerHTML = icon(name, cls);
    return span.firstChild;
  }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ---------- Live re-render registry ----------
     A screen calls  ui.live(renderFn, anchorNode)  once. renderFn is then
     re-invoked whenever the shared store changes (store.refresh / realtime
     poll fires "pg:store-changed"), so the Admin Panel and employee screens
     reflect data other clients submit without a manual refresh.

     Guards so it never yanks the UI mid-interaction:
       - skipped while the tab is hidden
       - deferred while a form control (input/select/textarea) is focused,
         then run once on the next blur
       - an entry auto-unregisters when its anchor leaves the DOM (navigation) */
  var _liveFns = [];
  var _liveTimer = null;
  var _liveDeferred = false;

  function live(fn, anchor) {
    if (typeof fn === "function") _liveFns.push({ fn: fn, anchor: anchor || null });
    return fn;
  }

  function _liveRun() {
    _liveTimer = null;
    // Note: we deliberately do NOT bail on document.hidden here. This only runs
    // after the store actually changed (pg:store-changed), so re-rendering a
    // background tab is cheap and means it is already current when refocused.

    var ae = document.activeElement;
    if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName || "")) {
      if (!_liveDeferred) {
        _liveDeferred = true;
        document.addEventListener("focusout", function once() {
          document.removeEventListener("focusout", once);
          _liveDeferred = false;
          _liveSchedule();
        });
      }
      return;
    }

    var pending = _liveFns;
    _liveFns = [];
    pending.forEach(function (e) {
      if (e.anchor && !document.body.contains(e.anchor)) return;   // screen gone -> drop
      _liveFns.push(e);                                            // keep registered
      try { e.fn(); } catch (err) { /* one bad screen must not stall the rest */ }
    });
  }

  function _liveSchedule() {
    if (_liveTimer) return;
    _liveTimer = setTimeout(_liveRun, 140);   // coalesce bursts
  }

  if (typeof document !== "undefined") {
    document.addEventListener("pg:store-changed", _liveSchedule);
  }

  /* ---------- Button ---------- */
  function button(opts) {
    opts = opts || {};
    var variant = opts.variant || "primary";
    var cls = ["pg-btn", "pg-btn--" + variant];
    if (opts.size) cls.push("pg-btn--" + opts.size);
    if (opts.block) cls.push("pg-btn--block");
    if (opts.icon && !opts.label) cls.push("pg-btn--icon");
    var b = h("button", {
      class: cls.join(" "),
      type: opts.type || "button",
      disabled: !!opts.disabled,
      title: opts.title || opts.ariaLabel || null,
      "aria-label": opts.ariaLabel || opts.title || null
    });
    if (opts.icon) b.appendChild(svg(opts.icon));
    if (opts.label) b.appendChild(document.createTextNode(opts.label));
    // Auto-guard against slow-response double-submits: while an onClick that
    // returns a Promise is still pending, the button is disabled and further
    // taps are ignored. Sync handlers (navigation, tab switches, …) behave
    // exactly as before. Callers opt in simply by `return`-ing their
    // store.*(…).then(…) chain from the handler.
    if (typeof opts.onClick === "function") {
      b.onclick = function (e) {
        if (b._pgBusy) return;
        var ret;
        try {
          ret = opts.onClick.call(b, e);
        } catch (err) {
          throw err;
        }
        if (ret && typeof ret.then === "function") {
          b._pgBusy = true;                   // JS-level re-entry guard
          b.classList.add("is-loading");      // dim + spinner + pointer-events:none
          var release = function () {
            b._pgBusy = false;
            b.classList.remove("is-loading");
          };
          ret.then(release, release);
        }
      };
    }
    return b;
  }

  /* ---------- Card ---------- */
  function card(opts) {
    opts = opts || {};
    var c = h("section", { class: "pg-card" + (opts.class ? " " + opts.class : "") });
    if (opts.title || opts.action) {
      c.appendChild(h("header", { class: "pg-card__header" },
        h("h3", { class: "pg-card__title", text: opts.title || "" }),
        opts.action || null
      ));
    }
    var body = h("div", { class: opts.flush ? "" : "pg-card__body" });
    append(body, [].concat(opts.body || opts.children || []));
    c.appendChild(body);
    c._body = body;
    return c;
  }

  /* ---------- Badge ---------- */
  function badge(label, tone) {
    return h("span", { class: "pg-badge pg-badge--" + (tone || "neutral"), text: label });
  }
  var STATUS_TONE = {
    active: "success", inactive: "neutral",
    todo: "warning", in_progress: "info", done: "success",
    hadir: "success", sakit: "neutral", izin: "warning", alpha: "danger",
    belum: "warning", terlambat: "warning", pulang: "info",
    berjalan: "info", menunggu: "warning", disetujui: "success", selesai: "success", ditolak: "danger", kadaluarsa: "neutral",
    sedang: "info", pending: "warning", approved: "success", rejected: "danger"
  };
  var STATUS_LABEL = {
    active: "Aktif", inactive: "Nonaktif",
    todo: "Belum Selesai", in_progress: "Berjalan", done: "Selesai",
    hadir: "Hadir", terlambat: "Terlambat", pulang: "Sudah Pulang", belum: "Belum Absen",
    berjalan: "Sedang Lembur", menunggu: "Menunggu Persetujuan", disetujui: "Disetujui", selesai: "Selesai Lembur", ditolak: "Ditolak", kadaluarsa: "Kadaluarsa",
    sedang: "Sedang Lembur", pending: "Menunggu Persetujuan", approved: "Disetujui", rejected: "Ditolak"
  };
  function statusBadge(key) {
    return badge(STATUS_LABEL[key] || key, STATUS_TONE[key] || "neutral");
  }
  var PRIO_LABEL = { high: "Prioritas Tinggi", mid: "Prioritas Sedang", low: "Prioritas Rendah" };
  function priorityBadge(key) {
    return h("span", { class: "pg-badge pg-badge--" + (key || "low"), text: PRIO_LABEL[key] || key });
  }

  /* ---------- Field ---------- */
  function field(opts) {
    opts = opts || {};
    var id = opts.id || ("f_" + Math.random().toString(36).slice(2, 7));
    var control;
    if (opts.type === "select") {
      control = h("select", { id: id, class: "pg-select", disabled: !!opts.disabled, name: opts.name || id });
      (opts.options || []).forEach(function (o) {
        control.appendChild(h("option", { value: o.value, text: o.label, selected: o.value === opts.value }));
      });
    } else if (opts.type === "textarea") {
      control = h("textarea", { id: id, class: "pg-textarea", placeholder: opts.placeholder || "", disabled: !!opts.disabled, name: opts.name || id, value: opts.value || "" });
    } else {
      control = h("input", {
        id: id, class: "pg-input", type: opts.type || "text",
        placeholder: opts.placeholder || "", disabled: !!opts.disabled,
        name: opts.name || id, value: opts.value != null ? opts.value : ""
      });
    }
    if (opts.required) control.required = true;
    var wrap = h("div", { class: "pg-field" });
    if (opts.label) wrap.appendChild(h("label", { class: "pg-field__label", htmlFor: id, text: opts.label }));
    wrap.appendChild(control);
    if (opts.hint) wrap.appendChild(h("span", { class: "pg-field__hint", text: opts.hint }));
    wrap._control = control;
    return wrap;
  }

  /* ---------- Brand logo (app icon) ---------- */
  function brandLogo(opts) {
    opts = opts || {};
    var s = opts.size || 32;
    return h("img", {
      class: "pg-brand-logo" + (opts.class ? " " + opts.class : ""),
      src: "assets/img/logo.png", alt: "Premiere Group",
      width: s, height: s, decoding: "async"
    });
  }

  /* ---------- Progress bar ---------- */
  function progressBar(pct, opts) {
    opts = opts || {};
    pct = Math.max(0, Math.min(100, Math.round(pct || 0)));
    var tone = opts.tone || (pct >= 100 ? "success" : pct > 0 ? "info" : "muted");
    var bar = h("div", { class: "pg-progress", role: "progressbar",
      "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" },
      h("div", { class: "pg-progress__fill pg-progress__fill--" + tone, style: { width: pct + "%" } }));
    if (!opts.label && !opts.showPct) return bar;
    return h("div", { class: "pg-progress-wrap" },
      h("div", { class: "pg-progress-wrap__row" },
        h("span", { class: "pg-field__hint", text: opts.label || "Progress" }),
        h("span", { class: "pg-progress-wrap__pct", text: pct + "%" })),
      bar);
  }

  /* ---------- Compact stat strip (one row of small cards) ---------- */
  function statStrip(items) {
    return h("div", { class: "pg-statstrip" }, (items || []).map(function (it) {
      return h("div", { class: "pg-statstrip__item" + (it.tone ? " pg-statstrip__item--" + it.tone : "") },
        h("div", { class: "pg-statstrip__ic" }, svg(it.icon || "info")),
        h("div", { class: "pg-statstrip__body" },
          h("div", { class: "pg-statstrip__value", text: it.value != null ? String(it.value) : "—" }),
          h("div", { class: "pg-statstrip__label", text: it.label || "" })
        )
      );
    }));
  }

  function fmtBytes(n) {
    n = +n || 0;
    if (n < 1024) return n + " B";
    if (n < 1048576) return (n / 1024).toFixed(0) + " KB";
    return (n / 1048576).toFixed(1) + " MB";
  }

  /* ---------- Attachment type helpers ---------- */
  function attExtLabel(att) {
    if (att.kind === "link") {
      try { return new URL(att.url).hostname.replace(/^www\./, "").toUpperCase(); }
      catch (e) { return "LINK"; }
    }
    var m = String(att.name || "").match(/\.([a-z0-9]{1,6})$/i);
    if (m) return m[1].toUpperCase();
    var byMime = { "application/pdf": "PDF", "text/plain": "TXT", "text/csv": "CSV" };
    return byMime[att.mime] || "FILE";
  }
  function attTypeClass(att) {
    if (att.kind === "image") return "img";
    if (att.kind === "link") return "link";
    var e = (String(att.name || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
    if (e === "pdf") return "pdf";
    if (e === "doc" || e === "docx") return "word";
    if (e === "xls" || e === "xlsx" || e === "csv") return "excel";
    if (e === "ppt" || e === "pptx") return "ppt";
    return "file";
  }
  function attAbs(u) {
    try { return new URL(u, document.baseURI).href; } catch (e) { return u || ""; }
  }
  // The inline (non-forced-download) URL for a file, or the target URL for a link.
  function attachmentExternalUrl(att) {
    if (!att) return "";
    if (att.kind === "link") return att.url || "";
    return att.fileUrl || att.downloadUrl || "";
  }
  // Open the attachment in a real browser tab (breaks out of a standalone PWA
  // instead of leaving a blank window). Never forces a download.
  function openAttachmentExternal(att) {
    var u = attAbs(attachmentExternalUrl(att));
    if (!u) { toast("Berkas tidak tersedia.", "danger"); return; }
    window.open(u, "_blank", "noopener");
  }
  // In-app preview: images and PDFs/text/links render inside a modal; office
  // documents (no browser renderer) show an info card + open/download actions.
  function attachmentPreview(att) {
    if (!att) return null;
    if (att.kind === "image") return photoViewer(att.fileUrl, att.label || att.name);

    var isLink = att.kind === "link";
    var ext = (String(att.name || "").match(/\.([a-z0-9]+)$/i) || [, ""])[1].toLowerCase();
    var mime = String(att.mime || "");
    var canFrame = isLink ||
      mime === "application/pdf" || ext === "pdf" ||
      mime.indexOf("text/") === 0 || ext === "txt" || ext === "csv";
    var src = isLink ? attAbs(att.url) : attAbs(att.fileUrl);
    var title = att.label || att.name || (isLink ? att.url : "Lampiran");

    var body;
    if (canFrame && src) {
      body = h("div", { class: "pg-att-preview" },
        h("iframe", { class: "pg-att-preview__frame", src: src, title: title,
          referrerpolicy: "no-referrer", loading: "lazy" }),
        isLink
          ? h("div", { class: "pg-att-preview__hint" }, svg("info"),
              h("span", { text: "Sebagian situs tidak mengizinkan tampil di dalam aplikasi. Jika area di atas kosong, gunakan “Buka di Tab Baru”." }))
          : null
      );
    } else {
      body = h("div", { class: "pg-att-preview pg-att-preview--none" },
        h("div", { class: "pg-att-preview__icon pg-att-cover--" + attTypeClass(att) }, svg(isLink ? "link" : "file")),
        h("div", { class: "pg-strong", text: title }),
        h("p", { class: "pg-muted", style: { fontSize: "13px", textAlign: "center", margin: "0", lineHeight: "1.6" },
          text: "Pratinjau berkas " + attExtLabel(att) + " belum didukung di dalam aplikasi. Buka di tab baru atau unduh berkasnya." })
      );
    }

    var footer = [
      button({ label: "Buka di Tab Baru", variant: "ghost", icon: "external",
        onClick: function () { openAttachmentExternal(att); } })
    ];
    if (!isLink && att.downloadUrl) {
      footer.push(button({ label: "Unduh", variant: "primary", icon: "download",
        onClick: function () { window.open(attAbs(att.downloadUrl), "_blank", "noopener"); } }));
    }
    return modal({ title: title, class: "pg-modal--preview", body: [body], footer: footer });
  }
  // Default click action for an attachment anywhere in the app.
  function openAttachment(att) { return attachmentPreview(att); }

  /* ---------- Attachment cover (archive grid card) ----------
     Image -> real thumbnail. PDF/doc/link (no preview possible) -> a tinted
     cover with a big icon + a type label (PDF, DOCX, the link's hostname…). */
  function attachmentCover(att) {
    var inner = att.kind === "image"
      ? photoImg(att.fileUrl, { alt: att.label || att.name || "Foto", loading: "lazy" })
      : h("div", { class: "pg-att-cover__badge" },
          h("span", { class: "pg-att-cover__ic" }, svg(att.kind === "link" ? "link" : "file")),
          h("span", { class: "pg-att-cover__label", text: attExtLabel(att) }));
    return h("button", {
      type: "button",
      class: "pg-att-cover pg-att-cover--" + attTypeClass(att),
      title: att.label || att.name || att.url || "Buka lampiran",
      onclick: function () { openAttachment(att); }
    }, inner);
  }

  /* ---------- Attachment tile (todo work-report file / link) ---------- */
  function attachmentTile(att, opts) {
    opts = opts || {};
    var removeBtn = opts.onRemove
      ? h("button", { class: "pg-att__x", type: "button", "aria-label": "Hapus lampiran", title: "Hapus",
          onclick: function (e) { e.stopPropagation(); opts.onRemove(att); } }, svg("trash"))
      : null;

    if (att.kind === "image") {
      var thumb = h("button", { class: "pg-att__thumb", type: "button",
        onclick: function () { photoViewer(att.fileUrl, att.label || att.name); } });
      thumb.appendChild(photoImg(att.fileUrl, { alt: att.label || att.name || "Foto", loading: "lazy",
        onError: function () {
          thumb.classList.add("pg-att__thumb--broken");
          while (thumb.firstChild) thumb.removeChild(thumb.firstChild);
          thumb.appendChild(svg("image"));
        } }));
      return h("div", { class: "pg-att pg-att--img" },
        thumb,
        h("div", { class: "pg-att__cap", text: att.label || att.name || "Foto" }),
        removeBtn
      );
    }
    if (att.kind === "link") {
      return h("div", { class: "pg-att pg-att--link" },
        h("button", { class: "pg-att__main", type: "button",
          onclick: function () { openAttachment(att); } },
          h("span", { class: "pg-att__ic" }, svg("link")),
          h("div", { class: "pg-att__meta" },
            h("div", { class: "pg-att__name", text: att.label || att.url }),
            h("div", { class: "pg-att__sub", text: att.url })
          )
        ),
        removeBtn
      );
    }
    return h("div", { class: "pg-att pg-att--file" },
      h("button", { class: "pg-att__main", type: "button",
        onclick: function () { openAttachment(att); } },
        h("span", { class: "pg-att__ic" }, svg("file")),
        h("div", { class: "pg-att__meta" },
          h("div", { class: "pg-att__name", text: att.name || "Dokumen" }),
          h("div", { class: "pg-att__sub", text: (att.label ? att.label + " · " : "") +
            (att.sizeBytes ? fmtBytes(att.sizeBytes) : "") })
        )
      ),
      removeBtn
    );
  }

  /* ---------- Section head ---------- */
  function sectionHead(title, subtitle, action) {
    return h("div", { class: "pg-section-head" },
      h("div", null,
        h("h3", { text: title, style: { fontSize: "16px", fontWeight: "600" } }),
        subtitle ? h("p", { text: subtitle }) : null
      ),
      action || null
    );
  }

  /* ---------- Stat card ---------- */
  function statCard(opts) {
    var valEl = h("div", { class: "pg-stat__value" });
    if (opts.value != null && opts.value.nodeType) valEl.appendChild(opts.value);
    else valEl.textContent = opts.value != null ? String(opts.value) : "—";
    var hintEl = null;
    if (opts.hint != null) {
      hintEl = h("div", { class: "pg-stat__hint" });
      if (opts.hint.nodeType) hintEl.appendChild(opts.hint); else hintEl.textContent = String(opts.hint);
    }
    var inner = h("div", { class: "pg-stat" },
      h("div", { class: "pg-stat__icon" + (opts.tone ? " pg-stat__icon--" + opts.tone : "") }, svg(opts.icon || "info")),
      h("div", null,
        h("div", { class: "pg-stat__label", text: opts.label || "" }),
        valEl,
        hintEl
      )
    );
    if (typeof opts.onClick === "function") {
      inner.appendChild(h("span", { class: "pg-stat__go", "aria-hidden": "true" }, svg("chevronRight")));
      return h("button", { class: "pg-card pg-stat-card pg-stat-card--clickable", type: "button",
        title: opts.clickHint || ("Lihat detail " + (opts.label || "")),
        onclick: function (e) { e.preventDefault(); opts.onClick(e); } }, inner);
    }
    return h("div", { class: "pg-card" }, inner);
  }

  /* ---------- Table ---------- */
  function table(opts) {
    opts = opts || {};
    var wrap = h("div", { class: "pg-table-wrap" });
    var scroller = h("div", { class: "pg-scroll-x" });
    var t = h("table", { class: "pg-table" });
    var thead = h("thead");
    var trh = h("tr");
    (opts.columns || []).forEach(function (c) {
      trh.appendChild(h("th", { text: typeof c === "string" ? c : c.label }));
    });
    thead.appendChild(trh);
    t.appendChild(thead);
    var tbody = h("tbody");
    (opts.rows || []).forEach(function (row) {
      // row is either a cell array, or { cells, onClick }
      var cells = Array.isArray(row) ? row : (row.cells || []);
      var onClick = Array.isArray(row) ? null : row.onClick;
      var tr = h("tr", onClick ? { class: "pg-row--clickable", onclick: function (e) {
        // let interactive controls inside a cell handle their own clicks
        if (e.target.closest('button, a, input, select, .pg-photo-thumb:not(.pg-photo-thumb--empty)')) return;
        onClick(e);
      } } : null);
      cells.forEach(function (cell) {
        var td = h("td");
        if (cell != null) td.appendChild(cell.nodeType ? cell : document.createTextNode(String(cell)));
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    t.appendChild(tbody);
    scroller.appendChild(t);
    wrap.appendChild(scroller);
    wrap._tbody = tbody;
    return wrap;
  }

  /* ---------- Pager ---------- */
  function pager(opts) {
    opts = opts || {};
    var page = opts.page || 1, pc = opts.pageCount || 1;
    var host = h("div", { class: "pg-pager" });
    if (pc <= 1) return host;
    function nav(label, target, disabled) {
      return h("button", {
        class: "pg-btn pg-btn--ghost pg-btn--sm" + (disabled ? " is-disabled" : ""),
        disabled: !!disabled,
        onclick: function () { if (!disabled && opts.onPage) opts.onPage(target); }
      }, label);
    }
    // The info line sits on its own row above; "Sebelumnya"/"Berikutnya" are
    // a separate full-width row with space-between, so they land at the
    // opposite edges every time — a 3-way space-between across one row wraps
    // unpredictably on a narrow card (the trailing button can drop to a new
    // line and land back on the LEFT instead of the right).
    host.appendChild(h("div", { class: "pg-pager__info",
      text: (opts.info || "Halaman " + page + " dari " + pc) }));
    host.appendChild(h("div", { class: "pg-pager__nav" },
      nav("‹ Sebelumnya", page - 1, page <= 1),
      nav("Berikutnya ›", page + 1, page >= pc)
    ));
    return host;
  }

  /* ---------- Empty state ---------- */
  function emptyState(opts) {
    opts = opts || {};
    return h("div", { class: "pg-empty" },
      h("div", { class: "pg-empty__icon" }, svg(opts.icon || "grid")),
      h("div", { class: "pg-empty__title", text: opts.title || "Belum ada data." }),
      opts.text ? h("div", { class: "pg-empty__text", text: opts.text }) : null,
      opts.action || null
    );
  }

  /* ---------- file:// warning ----------
     Opened by double-clicking the .html file, admin.html and index.html get
     separate localStorage, so karyawan added in the Admin Panel are invisible
     to the User App. Tell the user to run it through the local server. */
  function fileProtocolBanner() {
    if (location.protocol !== "file:") return null;
    return h("div", { class: "pg-filewarn" },
      svg("info"),
      h("div", null,
        h("strong", { text: "Jalankan lewat server, bukan dari file. " }),
        "Dibuka seperti ini, data Admin Panel dan User App tidak tersambung. ",
        "Klik dua kali ", h("code", { text: "Jalankan Premiere Group.bat" }),
        " (atau jalankan ", h("code", { text: "tools/serve.ps1" }),
        ") lalu buka ", h("code", { text: "http://localhost:8777" }), "."
      )
    );
  }

  /* ---------- Notice ---------- */
  function notice(text, opts) {
    opts = opts || {};
    return h("div", { class: "pg-notice" + (opts.muted ? " pg-notice--muted" : "") },
      svg(opts.icon || "info"),
      h("div", null, text)
    );
  }

  /* ---------- Tabs (pill) ---------- */
  function pillTabs(items, activeKey, onChange, block) {
    var host = h("div", { class: "pg-tabs" + (block ? " pg-tabs--block" : "") });
    items.forEach(function (it) {
      host.appendChild(h("button", {
        class: "pg-tab" + (it.key === activeKey ? " is-active" : ""),
        text: it.label,
        onclick: function () { onChange && onChange(it.key); }
      }));
    });
    return host;
  }

  /* ---------- Donut placeholder ---------- */
  function donut(percent, caption) {
    var d = h("div", { class: "pg-donut" },
      h("div", { class: "pg-donut__hole" },
        h("div", null,
          h("div", { class: "pg-donut__value", text: (percent != null ? percent + "%" : "—") }),
          caption ? h("div", { class: "pg-donut__cap", text: caption }) : null
        )
      )
    );
    d.style.setProperty("--p", percent || 0);
    return d;
  }

  /* ---------- Horizontal bar chart (zero-dependency) ----------
     rows: [{ name, value, note? }]   opts: { max?, suffix?, band? } */
  function barChartH(rows, opts) {
    opts = opts || {};
    rows = rows || [];
    if (!rows.length) return emptyState({ icon: "chart", title: opts.emptyTitle || "Belum ada data" });
    var max = opts.max || Math.max.apply(null, rows.map(function (r) { return +r.value || 0; }).concat([1]));
    var suffix = opts.suffix != null ? opts.suffix : "%";
    function tone(v) {
      if (!opts.band) return "";
      if (v >= 100) return " is-good";
      if (v >= 70) return " is-mid";
      return " is-low";
    }
    var host = h("div", { class: "pg-bchart" });
    rows.forEach(function (r) {
      var v = +r.value || 0;
      var w = Math.max(2, Math.min(100, (v / max) * 100));
      host.appendChild(h("div", { class: "pg-bchart__row" },
        h("div", { class: "pg-bchart__name", title: r.name, text: r.name },
          r.note ? h("span", { class: "pg-bchart__note", text: " " + r.note }) : null),
        h("div", { class: "pg-bchart__track" },
          h("div", { class: "pg-bchart__fill" + tone(v), style: { width: w + "%" } })),
        h("div", { class: "pg-bchart__val", text: (Math.round(v * 10) / 10) + suffix })
      ));
    });
    return host;
  }

  /* ---------- Line/trend chart (inline SVG) ----------
     points: [{ label, value }]   opts: { max?, suffix?, height? } */
  function lineChart(points, opts) {
    opts = opts || {};
    points = points || [];
    if (points.length < 2) {
      return emptyState({ icon: "chart", title: opts.emptyTitle || "Butuh minimal 2 periode",
        message: opts.emptyMsg || "Tren muncul setelah ada laporan di beberapa periode." });
    }
    var W = 520, H = opts.height || 180, PADX = 34, PADY = 18;
    var max = opts.max || Math.max.apply(null, points.map(function (p) { return +p.value || 0; }).concat([1]));
    max = Math.ceil(max / 20) * 20 || 20;
    var innerW = W - PADX - 10, innerH = H - PADY * 2;
    var stepX = innerW / (points.length - 1);
    function x(i) { return PADX + i * stepX; }
    function y(v) { return PADY + innerH - (Math.max(0, v) / max) * innerH; }
    var pts = points.map(function (p, i) { return x(i) + "," + y(+p.value || 0); });
    var gy = [0, 0.5, 1].map(function (f) {
      var yy = PADY + innerH - f * innerH, val = Math.round(f * max);
      return '<line x1="' + PADX + '" y1="' + yy + '" x2="' + (W - 10) + '" y2="' + yy + '" class="pg-lc__grid"/>' +
             '<text x="' + (PADX - 6) + '" y="' + (yy + 3) + '" class="pg-lc__ytick">' + val + '</text>';
    }).join("");
    var dots = points.map(function (p, i) {
      return '<circle cx="' + x(i) + '" cy="' + y(+p.value || 0) + '" r="3.5" class="pg-lc__dot"/>';
    }).join("");
    var xlabels = points.map(function (p, i) {
      if (points.length > 8 && i % 2) return "";
      return '<text x="' + x(i) + '" y="' + (H - 4) + '" class="pg-lc__xtick">' + esc(p.label) + '</text>';
    }).join("");
    var box = h("div", { class: "pg-lc" });
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img">' +
      gy +
      '<polyline points="' + pts.join(" ") + '" class="pg-lc__line"/>' +
      dots + xlabels +
      '</svg>';
    return box;
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  /* ---------- Vertical bar (column) chart (inline SVG) ----------
     rows: [{ name, value, note? }]   opts: { max?, suffix?, band?, height?, emptyTitle? }
     A dashed "target" guide is drawn at the 100 mark when max is 100 (the
     default for percentage-based KPI comparisons). */
  function barChartV(rows, opts) {
    opts = opts || {};
    rows = rows || [];
    if (!rows.length) return emptyState({ icon: "chart", title: opts.emptyTitle || "Belum ada data" });

    var suffix = opts.suffix != null ? opts.suffix : "%";
    var max = Math.max(opts.max || Math.max.apply(null, rows.map(function (r) { return +r.value || 0; }).concat([1])), 1);
    function tone(v) {
      if (!opts.band) return "";
      if (v >= 100) return " is-good";
      if (v >= 70) return " is-mid";
      return " is-low";
    }

    var H = opts.height || 220, PADT = 30, PADB = 30, PADX = 26;
    var SLOT = 92;
    var W = Math.max(300, rows.length * SLOT);
    var innerH = H - PADT - PADB;
    var step = (W - PADX * 2) / rows.length;
    var barW = Math.min(48, step * 0.5);
    var baseY = PADT + innerH;
    function barTopY(v) { return PADT + innerH - (Math.max(0, v) / max) * innerH; }

    var target = (max === 100)
      ? '<line x1="' + PADX + '" y1="' + barTopY(100) + '" x2="' + (W - PADX) + '" y2="' + barTopY(100) + '" class="pg-vbar__target"/>'
      : "";

    var bars = rows.map(function (r, i) {
      var v = +r.value || 0;
      var cx = PADX + step * (i + 0.5);
      var y = barTopY(v), bh = Math.max(2, baseY - y);
      var label = (Math.round(v * 10) / 10) + suffix;
      var tip = esc(r.name + (r.note ? " " + r.note : "") + ": " + label);
      return '<g>' +
        '<rect x="' + (cx - barW / 2) + '" y="' + y + '" width="' + barW + '" height="' + bh +
          '" rx="6" class="pg-vbar__bar' + tone(v) + '"><title>' + tip + '</title></rect>' +
        '<text x="' + cx + '" y="' + (y - 8) + '" class="pg-vbar__val">' + esc(label) + '</text>' +
        '<text x="' + cx + '" y="' + (baseY + 18) + '" class="pg-vbar__xtick">' + esc(r.name) + '</text>' +
        '</g>';
    }).join("");

    var baseline = '<line x1="' + PADX + '" y1="' + baseY + '" x2="' + (W - PADX) + '" y2="' + baseY + '" class="pg-vbar__grid"/>';

    var box = h("div", { class: "pg-vbar" });
    box.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" role="img">' +
      target + baseline + bars + '</svg>';
    return box;
  }

  /* ---------- Modal ---------- */
  function modal(opts) {
    opts = opts || {};
    var overlay = h("div", { class: "pg-modal-overlay" });
    var box = h("div", { class: "pg-modal" + (opts.class ? " " + opts.class : "") });
    box.appendChild(h("div", { class: "pg-modal__header" },
      h("div", { class: "pg-modal__title", text: opts.title || "" }),
      h("button", { class: "pg-modal__close", "aria-label": "Tutup", onclick: close }, svg("close"))
    ));
    var body = h("div", { class: "pg-modal__body" });
    append(body, [].concat(opts.body || []));
    box.appendChild(body);
    if (opts.footer) {
      var foot = h("div", { class: "pg-modal__footer" });
      append(foot, [].concat(opts.footer));
      box.appendChild(foot);
    }
    overlay.appendChild(box);
    overlay.addEventListener("mousedown", function (e) { if (e.target === overlay) close(); });
    function onKey(e) { if (e.key === "Escape") close(); }
    function close() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      opts.onClose && opts.onClose();
    }
    document.addEventListener("keydown", onKey);
    document.body.appendChild(overlay);
    return { el: overlay, body: body, close: close };
  }

  /* ---------- Confirmation dialog ---------- */
  function confirm(opts) {
    opts = opts || {};
    var tone = opts.tone || "primary"; // primary | danger
    var m = modal({
      title: opts.title || "Konfirmasi",
      body: [
        h("p", { class: "pg-muted", style: { fontSize: "13px", lineHeight: "1.6" },
          text: opts.message || "Anda yakin ingin melanjutkan?" })
      ],
      footer: [
        button({ label: opts.cancelLabel || "Batal", variant: "ghost",
          onClick: function () { m.close(); opts.onCancel && opts.onCancel(); } }),
        button({ label: opts.confirmLabel || "Lanjutkan", variant: tone,
          onClick: function () { m.close(); opts.onConfirm && opts.onConfirm(); } })
      ]
    });
    return m;
  }

  /* ---------- Photo thumbnail + viewer (selfie attendance) ----------
     A bare <img src="api/…"> to a protected endpoint (selfies, avatars) fails
     on mobile / installed-PWA — the session cookie is not attached to
     sub-resource loads, so it 401s and shows a broken image. So any same-origin
     `api/…` src is loaded through the authenticated, session-cached fetch
     channel (PG.store.photoObjectUrl); data:, blob: and http(s) URLs load as-is. */
  function _isApiPhoto(src) {
    if (typeof src !== "string" || !src) return false;
    if (/^api\//.test(src)) return true;                       // relative "api/…"
    try {
      var u = new URL(src, document.baseURI);
      return u.origin === location.origin && /^\/api\//.test(u.pathname);
    } catch (e) { return false; }                              // data:, blob:, etc.
  }
  function _loadPhoto(imgEl, src, onFail) {
    if (onFail) imgEl.onerror = onFail;
    if (!src) return;
    if (!_isApiPhoto(src) || !(PG.store && PG.store.photoObjectUrl)) { imgEl.src = src; return; }
    var ready = PG.store.photoObjectUrlReady && PG.store.photoObjectUrlReady(src);
    if (ready) { imgEl.src = ready; return; }
    PG.store.photoObjectUrl(src).then(function (u) {
      if (u) imgEl.src = u; else if (onFail) onFail();
    }).catch(function () { if (onFail) onFail(); });
  }
  /* <img> for a photo src (see _loadPhoto). Returned immediately; the real
     pixels stream in once the authenticated fetch resolves. */
  function photoImg(src, attrs) {
    attrs = attrs || {};
    var onErr = attrs.onError; delete attrs.onError;
    var img = h("img", attrs);
    _loadPhoto(img, src, typeof onErr === "function" ? onErr : null);
    return img;
  }
  function photoThumb(src, onClick, opts) {
    opts = opts || {};
    if (!src) {
      return h("span", { class: "pg-photo-thumb pg-photo-thumb--empty", title: "Tanpa foto" },
        svg("user"));
    }
    var img = h("img", { alt: opts.alt || "Foto selfie", loading: "lazy" });
    var btn = h("button", { class: "pg-photo-thumb", type: "button", title: opts.title || "Lihat foto",
      onclick: function () { onClick ? onClick() : photoViewer(src, opts.title); } }, img);
    _loadPhoto(img, src, function () {
      // fetch/decode failed -> show the empty-thumb glyph instead of a broken img
      btn.classList.add("pg-photo-thumb--empty");
      while (btn.firstChild) btn.removeChild(btn.firstChild);
      btn.appendChild(svg("user"));
    });
    return btn;
  }
  function photoViewer(src, caption, onClose) {
    if (!src) { toast("Foto tidak tersedia.", "danger"); return; }
    var img = h("img", { alt: caption || "Foto selfie" });
    var m = modal({
      title: caption || "Foto Selfie Absensi",
      body: [h("div", { class: "pg-photo-view" }, img)],
      onClose: typeof onClose === "function" ? onClose : null
    });
    _loadPhoto(img, src, function () {
      if (img.parentNode) img.parentNode.replaceChild(
        h("div", { class: "pg-muted", style: { padding: "28px", textAlign: "center" }, text: "Foto gagal dimuat." }), img);
    });
    return m;
  }

  /* ---------- Notification center (in-app feed) ----------
     Opens a modal listing PG.store.notifications(). opts.onNavigate(link) is
     called when a notification with a link is tapped. */
  var _NOTIF_ICON = {
    izin: "doc", attendance: "user", overtime: "clock", visit: "building",
    kpi: "chart", todo: "checklist", program: "grid"
  };
  function notifCenter(opts) {
    opts = opts || {};
    var store = PG.store;
    var body = h("div");
    var footHost = h("div", { class: "pg-modal__footer" });
    var onStoreChange = function () { paint(); };
    var m = modal({ title: "Notifikasi", class: "pg-modal--notif", body: [body],
      onClose: function () { document.removeEventListener("pg:store-changed", onStoreChange); } });
    m.el.querySelector(".pg-modal").appendChild(footHost);

    function paint() {
      var list = store.notifications();
      var unread = list.filter(function (n) { return !n.read; });
      clear(body); clear(footHost);

      if (!list.length) {
        body.appendChild(emptyState({ icon: "bell", title: "Belum ada notifikasi.",
          text: "Pemberitahuan aktivitas & persetujuan akan muncul di sini." }));
        return;
      }
      var wrap = h("div", { class: "pg-notiflist" });
      list.forEach(function (n) {
        var row = h("button", { class: "pg-notifrow" + (n.read ? "" : " is-unread"), type: "button",
          onclick: function () {
            if (!n.read) store.markNotifRead(n.id);
            if (n.link && opts.onNavigate) { m.close(); opts.onNavigate(n.link); }
            else if (!n.read) { n.read = true; paint(); }
          } },
          h("span", { class: "pg-notifrow__ic" }, svg(_NOTIF_ICON[(n.type || "").split(".")[0]] || "bell")),
          h("span", { class: "pg-notifrow__body" },
            h("span", { class: "pg-notifrow__title", text: n.title }),
            n.body ? h("span", { class: "pg-notifrow__text", text: n.body }) : null,
            h("span", { class: "pg-notifrow__meta", text: timeAgo(n.createdAt) })),
          h("span", { class: "pg-notifrow__x", "aria-label": "Hapus", title: "Hapus",
            onclick: function (e) { e.stopPropagation(); store.deleteNotif(n.id); n._gone = true; row.remove();
              if (!body.querySelector(".pg-notifrow")) paint(); } }, svg("close"))
        );
        wrap.appendChild(row);
      });
      body.appendChild(wrap);

      if (unread.length) {
        footHost.appendChild(button({ label: "Tandai semua dibaca", variant: "ghost", size: "sm",
          onClick: function () { store.markNotifRead("all"); list.forEach(function (n) { n.read = true; }); paint(); } }));
      }
      if (list.length - unread.length > 0) {
        footHost.appendChild(button({ label: "Hapus yang sudah dibaca", variant: "ghost", size: "sm",
          onClick: function () { store.clearReadNotifs().then(paint); } }));
      }
    }
    paint();
    document.addEventListener("pg:store-changed", onStoreChange);
    return m;
  }

  /* ---------- Device push toggle (Web Push / Layer 2) ----------
     A self-contained card for Profil (user) / Pengaturan (admin). No-ops
     gracefully when the platform or server VAPID key is unavailable. */
  function pushToggleCard() {
    var host = h("div");
    var pill = badge("Memeriksa…", "neutral");
    var wrap = card({ title: "Notifikasi Perangkat", class: "pg-pushcard", action: pill, body: [host] });

    function setPill(label, tone) { pill.textContent = label; pill.className = "pg-badge pg-badge--" + tone; }
    function line(txt) {
      return h("p", { class: "pg-muted", style: { fontSize: "13px", margin: "0" }, text: txt });
    }
    function busyBtn(b, on) { if (b) { b.disabled = on; } }

    function render() {
      clear(host);
      if (!PG.push || !PG.push.supported()) {
        setPill("Tidak Didukung", "neutral");
        host.appendChild(line("Perangkat atau peramban ini tidak mendukung notifikasi ke layar. Notifikasi dalam aplikasi tetap berjalan."));
        return;
      }
      setPill("Memeriksa…", "neutral");
      host.appendChild(line("Memeriksa status…"));
      PG.push.status().then(function (st) {
        clear(host);
        if (!st.serverEnabled) {
          setPill("Belum Aktif di Server", "neutral");
          host.appendChild(line("Notifikasi ke layar HP belum diaktifkan di server."));
          return;
        }
        if (st.permission === "denied") {
          setPill("Diblokir", "danger");
          host.appendChild(line("Izin notifikasi diblokir di peramban. Buka pengaturan situs → Notifikasi → Izinkan, lalu muat ulang."));
          return;
        }

        setPill(st.subscribed ? "Aktif" : "Nonaktif", st.subscribed ? "success" : "warning");
        host.appendChild(line(st.subscribed
          ? "Perangkat ini menerima pemberitahuan meski aplikasi ditutup."
          : "Aktifkan agar pemberitahuan muncul di layar HP walau aplikasi ditutup."));

        var row = h("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "12px" } });
        if (st.subscribed) {
          var offBtn = button({ label: "Nonaktifkan", variant: "ghost", icon: "close", onClick: function () {
            busyBtn(offBtn, true);
            PG.push.disable().then(function () { toast("Notifikasi HP dinonaktifkan.", "success"); render(); });
          } });
          var testBtn = button({ label: "Kirim Uji", variant: "ghost", icon: "bell", onClick: function () {
            busyBtn(testBtn, true);
            PG.push.test().then(function (r) {
              busyBtn(testBtn, false);
              toast(r && r.ok !== false ? "Uji notifikasi dikirim ke perangkat Anda." : ((r && r.error) || "Gagal mengirim uji."),
                r && r.ok !== false ? "success" : "danger");
            });
          } });
          row.appendChild(offBtn); row.appendChild(testBtn);
        } else {
          var onBtn = button({ label: "Aktifkan Notifikasi HP", variant: "accent", icon: "bell", onClick: function () {
            busyBtn(onBtn, true);
            PG.push.enable().then(function (r) {
              busyBtn(onBtn, false);
              if (r && r.ok) { toast("Notifikasi HP aktif untuk perangkat ini.", "success"); render(); }
              else toast((r && r.error) || "Gagal mengaktifkan.", "danger");
            });
          } });
          row.appendChild(onBtn);
        }
        host.appendChild(row);
      }).catch(function () {
        clear(host);
        setPill("Gagal Diperiksa", "danger");
        host.appendChild(line("Gagal memeriksa status notifikasi."));
      });
    }
    render();
    return wrap;
  }

  /* ---------- Toast ---------- */
  function toast(message, tone) {
    var host = qs(".pg-toast-host");
    if (!host) { host = h("div", { class: "pg-toast-host" }); document.body.appendChild(host); }
    var t = h("div", { class: "pg-toast" + (tone ? " pg-toast--" + tone : "") },
      svg(tone === "danger" ? "info" : "check"),
      h("span", { text: message })
    );
    host.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .2s ease";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 220);
    }, 2600);
  }

  /* ---------- Misc formatting ---------- */
  function initials(name) {
    return String(name || "?").trim().split(/\s+/).slice(0, 2)
      .map(function (w) { return w[0]; }).join("").toUpperCase();
  }
  function fmtDateID(iso) {
    if (!iso) return "—";
    var d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
  }
  function fmtDateShortID(iso) {
    if (!iso) return "—";
    var d = new Date(iso.length <= 10 ? iso + "T00:00:00" : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
  }
  function todayLongID() {
    return new Date().toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  }
  function fmtTimeID(iso) {
    if (!iso) return "—";
    var d = new Date(iso);
    if (isNaN(d)) return "—";
    return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }
  function fmtDateWeekdayID(key) {
    if (!key) return "—";
    var d = new Date(key.length <= 10 ? key + "T00:00:00" : key);
    if (isNaN(d)) return key;
    return d.toLocaleDateString("id-ID", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  }
  function timeAgo(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    if (isNaN(d)) return "";
    var s = Math.round((Date.now() - d.getTime()) / 1000);
    if (s < 45) return "baru saja";
    if (s < 3600) return Math.round(s / 60) + " mnt lalu";
    if (s < 86400) return Math.round(s / 3600) + " jam lalu";
    if (s < 172800) return "kemarin";
    if (s < 604800) return Math.round(s / 86400) + " hari lalu";
    return fmtDateWeekdayID(iso);
  }
  function fmtDuration(ms) {
    if (!ms || ms < 0) return "0j 0m";
    var totalMin = Math.round(ms / 60000);
    var hrs = Math.floor(totalMin / 60), mins = totalMin % 60;
    return hrs + "j " + mins + "m";
  }
  function greetingID() {
    var hp = new Date().getHours();
    if (hp < 11) return "Selamat pagi";
    if (hp < 15) return "Selamat siang";
    if (hp < 19) return "Selamat sore";
    return "Selamat malam";
  }

  /* ---------- Prayer times (astronomical calc — no dependency, no network) ----------
     PrayTimes.org method, Kemenag-ish params (Subuh 20°, Isya 18°, Ashar Syafi'i,
     Dzuhur +2 min). Returns each time as a float hour in local time. */
  function prayerTimes(date, lat, lng, tzMin) {
    var D2R = Math.PI / 180, R2D = 180 / Math.PI;
    function sin(x) { return Math.sin(x * D2R); }
    function cos(x) { return Math.cos(x * D2R); }
    function tan(x) { return Math.tan(x * D2R); }
    function asin(x) { return R2D * Math.asin(x); }
    function acos(x) { return R2D * Math.acos(x); }
    function acot(x) { return R2D * Math.atan(1 / x); }
    function atan2(y, x) { return R2D * Math.atan2(y, x); }
    function fixAngle(a) { a = a % 360; return a < 0 ? a + 360 : a; }
    function fixHour(a) { a = a % 24; return a < 0 ? a + 24 : a; }

    var y = date.getFullYear(), m = date.getMonth() + 1, d = date.getDate();
    if (m <= 2) { y -= 1; m += 12; }
    var A = Math.floor(y / 100), B = 2 - A + Math.floor(A / 4);
    var JD = Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5 - lng / 360;

    function sunPos(jd) {
      var D = jd - 2451545.0;
      var g = fixAngle(357.529 + 0.98560028 * D);
      var q = fixAngle(280.459 + 0.98564736 * D);
      var L = fixAngle(q + 1.915 * sin(g) + 0.020 * sin(2 * g));
      var e = 23.439 - 0.00000036 * D;
      var RA = fixHour(atan2(cos(e) * sin(L), cos(L)) / 15);
      return { decl: asin(sin(e) * sin(L)), eqt: q / 15 - RA };
    }
    function midDay(t) { return fixHour(12 - sunPos(JD + t).eqt); }
    function sunAngle(angle, t, ccw) {
      var decl = sunPos(JD + t).decl;
      var v = (-sin(angle) - sin(decl) * sin(lat)) / (cos(decl) * cos(lat));
      v = v > 1 ? 1 : (v < -1 ? -1 : v);
      return midDay(t) + (ccw ? -1 : 1) * acos(v) / 15;
    }
    function asrTime(t) {
      var decl = sunPos(JD + t).decl;
      return sunAngle(-acot(1 + tan(Math.abs(lat - decl))), t);
    }
    var tzH = tzMin / 60;
    function loc(t) { return fixHour(t + tzH - lng / 15); }
    return {
      Subuh:   loc(sunAngle(20, 5 / 24, true)),
      Terbit:  loc(sunAngle(0.833, 6 / 24, true)),
      Dzuhur:  loc(midDay(0.5) + 2 / 60),
      Ashar:   loc(asrTime(13 / 24)),
      Maghrib: loc(sunAngle(0.833, 18 / 24) + 1 / 60),
      Isya:    loc(sunAngle(18, 18 / 24))
    };
  }
  /* Next prayer, with a 15-minute "telah tiba" hold window after each adhan. */
  function nextPrayer(times, now) {
    var order = ["Subuh", "Dzuhur", "Ashar", "Maghrib", "Isya"];
    var nowH = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
    var HOLD = 0.25; // 15 minutes
    for (var i = 0; i < order.length; i++) {
      var t = times[order[i]];
      if (nowH < t) return { name: order[i], at: t, mins: Math.round((t - nowH) * 60), phase: "before" };
      if (nowH < t + HOLD) return { name: order[i], at: t, mins: Math.max(0, Math.round((nowH - t) * 60)), phase: "now" };
    }
    return { name: "Subuh", at: times.Subuh, mins: Math.round((24 - nowH + times.Subuh) * 60), phase: "before", tomorrow: true };
  }
  function prayerReminder(np) {
    function hhmm(hf) {
      var h = Math.floor(hf), m = Math.round((hf - h) * 60);
      if (m === 60) { m = 0; h = (h + 1) % 24; }
      return String(h).padStart(2, "0") + "." + String(m).padStart(2, "0");
    }
    if (np.phase === "now")  return { text: "Waktu sholat " + np.name + " telah tiba", soon: true, blink: true };
    if (np.tomorrow)         return { text: "Waktu sholat Subuh besok pukul " + hhmm(np.at), soon: false, blink: false };
    if (np.mins <= 60)       return { text: "Waktu sholat " + np.name + " " + np.mins + " menit lagi", soon: np.mins <= 20, blink: false };
    return { text: "Waktu sholat " + np.name + " pukul " + hhmm(np.at), soon: false, blink: false };
  }
  /* Resolve device location once per page load (cached), with a Lombok fallback. */
  var _geo = null, _geoWaiters = [];
  var GEO_FALLBACK = { lat: -8.65, lng: 116.42 };
  function geoOnce(cb) {
    if (_geo) { cb(_geo); return; }
    _geoWaiters.push(cb);
    if (_geoWaiters.length > 1) return;
    function done(loc) { _geo = loc; _geoWaiters.forEach(function (f) { f(_geo); }); _geoWaiters = []; }
    if (!navigator.geolocation) { done(GEO_FALLBACK); return; }
    navigator.geolocation.getCurrentPosition(
      function (p) { done({ lat: p.coords.latitude, lng: p.coords.longitude }); },
      function () { done(GEO_FALLBACK); },
      { timeout: 8000, maximumAge: 3600000 }
    );
  }

  PG.ui = {
    h: h, frag: frag, append: append, clear: clear, mount: mount, svg: svg, qs: qs, qsa: qsa, live: live,
    button: button, card: card, badge: badge, statusBadge: statusBadge, priorityBadge: priorityBadge,
    brandLogo: brandLogo,
    progressBar: progressBar, statStrip: statStrip, fmtBytes: fmtBytes,
    attachmentTile: attachmentTile, attachmentCover: attachmentCover,
    attExtLabel: attExtLabel, openAttachment: openAttachment,
    attachmentPreview: attachmentPreview, openAttachmentExternal: openAttachmentExternal,
    field: field, sectionHead: sectionHead, statCard: statCard, table: table,
    emptyState: emptyState, notice: notice, pillTabs: pillTabs, donut: donut, pager: pager,
    barChartH: barChartH, barChartV: barChartV, lineChart: lineChart,
    fmtDuration: fmtDuration,
    modal: modal, confirm: confirm, toast: toast, fileProtocolBanner: fileProtocolBanner,
    photoThumb: photoThumb, photoViewer: photoViewer, photoImg: photoImg,
    notifCenter: notifCenter, timeAgo: timeAgo, pushToggleCard: pushToggleCard,
    initials: initials, fmtDateID: fmtDateID, fmtDateShortID: fmtDateShortID,
    fmtTimeID: fmtTimeID, fmtDateWeekdayID: fmtDateWeekdayID,
    todayLongID: todayLongID, greetingID: greetingID,
    prayerTimes: prayerTimes, nextPrayer: nextPrayer, prayerReminder: prayerReminder, geoOnce: geoOnce,
    STATUS_LABEL: STATUS_LABEL, PRIO_LABEL: PRIO_LABEL
  };
})(window.PG = window.PG || {});
