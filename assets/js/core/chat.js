/* ============================================================
   PREMIERE GROUP — Private chat (PG.chat)
   A shared, page-independent overlay opened from the Momen
   header. Thread list <-> conversation, with a 4s poll while a
   conversation is open and a redraw on every store hydrate.
   Works in both the User App and the Admin Panel.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;

  var state = {
    open: false,
    view: "list",              // "list" | "new" | "conv"
    threadId: null,
    other: null,
    messages: [],
    hasMore: false,
    sending: false,
    sig: null,
    convPoll: null
  };

  var overlay = null, panelBody = null, msgScroll = null, composerInput = null;

  /* ---------- small helpers ---------- */
  function pad2(n) { return String(n).padStart(2, "0"); }
  function hhmm(iso) { if (!iso) return ""; var d = new Date(iso); return pad2(d.getHours()) + ":" + pad2(d.getMinutes()); }
  function isoDay(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function dayLabel(day) {
    var t = new Date(), y = new Date(); y.setDate(y.getDate() - 1);
    if (day === isoDay(t)) return "Hari ini";
    if (day === isoDay(y)) return "Kemarin";
    return ui.fmtDateShortID ? ui.fmtDateShortID(day) : day;
  }
  function msgSig(list) { return list.length + ":" + (list.length ? list[list.length - 1].id : "0"); }

  function avatar(p, px) {
    px = px || 40;
    var el = h("div", { class: "pg-avatar",
      style: { width: px + "px", height: px + "px", fontSize: Math.round(px * 0.38) + "px" } },
      h("span", { class: "pg-avatar__i", text: ui.initials((p && p.name) || "?") }));
    if (p && p.photoUrl) el.appendChild(ui.photoImg(p.photoUrl, { alt: (p && p.name) || "Foto" }));
    return el;
  }

  /* ---------- public surface ---------- */
  function unreadCount() { return (PG.store.chatUnreadCount && PG.store.chatUnreadCount()) || 0; }

  function mountButton(opts) {
    opts = opts || {};
    var badge = h("span", { class: "pg-chatbtn__badge", hidden: true });
    var btn = h("button", { class: "pg-chatbtn" + (opts.dark ? " pg-chatbtn--dark" : ""), type: "button",
      "aria-label": "Chat pribadi", title: "Chat pribadi",
      onclick: function () { openPanel(); } }, svg("message"), badge);
    function sync() {
      if (!btn.isConnected) { document.removeEventListener("pg:store-changed", sync); return; }
      var n = unreadCount();
      badge.textContent = n > 99 ? "99+" : String(n);
      badge.hidden = n === 0;
      btn.classList.toggle("has-unread", n > 0);
    }
    document.addEventListener("pg:store-changed", sync);
    setTimeout(sync, 0);
    return btn;
  }

  function open(threadId) {
    openPanel();
    if (threadId) openConversationById(threadId);
  }

  /* ---------- overlay lifecycle ---------- */
  function openPanel() {
    if (overlay) { overlay.hidden = false; state.open = true; if (state.view === "list") renderList(); return; }
    panelBody = h("div", { class: "pg-chat__body" });
    overlay = h("div", { class: "pg-chat",
      onclick: function (e) { if (e.target === overlay) closePanel(); } },
      h("div", { class: "pg-chat__panel" }, panelBody));
    document.body.appendChild(overlay);
    state.open = true;
    document.addEventListener("pg:store-changed", onStoreChanged);
    document.addEventListener("keydown", onKey);
    renderList();
  }
  function closePanel() {
    stopConvPoll();
    if (overlay) { overlay.remove(); overlay = null; }
    state.open = false; state.view = "list"; state.threadId = null; state.other = null; state.messages = [];
    document.removeEventListener("pg:store-changed", onStoreChanged);
    document.removeEventListener("keydown", onKey);
  }
  function onKey(e) {
    if (e.key !== "Escape") return;
    if (state.view !== "list") backToList(); else closePanel();
  }
  function onStoreChanged() {
    if (!state.open) return;
    if (state.view === "list") renderList();
    else if (state.view === "conv" && state.threadId) refreshConversation();
  }

  /* ---------- chrome ---------- */
  function head(titleNode, opts) {
    opts = opts || {};
    return h("div", { class: "pg-chat__head" },
      opts.back
        ? h("button", { class: "pg-chat__hbtn", type: "button", "aria-label": "Kembali", onclick: opts.back }, svg("chevronLeft"))
        : h("span", { class: "pg-chat__hbtn pg-chat__hbtn--ghost" }),
      h("div", { class: "pg-chat__htitle" }, titleNode),
      h("button", { class: "pg-chat__hbtn", type: "button", "aria-label": "Tutup", onclick: closePanel }, svg("close")));
  }

  /* ---------- thread list ---------- */
  function renderList() {
    state.view = "list"; state.threadId = null; state.other = null;
    stopConvPoll();
    ui.clear(panelBody);
    panelBody.appendChild(head(h("span", { text: "Chat" }), {}));
    panelBody.appendChild(h("button", { class: "pg-chat__newbtn", type: "button", onclick: openContacts },
      svg("plus"), h("span", { text: "Mulai chat baru" })));
    var listHost = h("div", { class: "pg-chat__list" });
    panelBody.appendChild(listHost);
    paintThreads(listHost, PG.store.chatThreadsCache());
    PG.store.chatThreads().then(function (d) {
      if (state.view !== "list") return;
      paintThreads(listHost, (d && d.threads) || []);
    }).catch(function () {});
  }
  function paintThreads(host, threads) {
    ui.clear(host);
    if (!threads.length) {
      host.appendChild(h("div", { class: "pg-chat__empty" }, svg("message"),
        h("p", { text: "Belum ada percakapan. Mulai chat baru dengan rekan kerja." })));
      return;
    }
    threads.forEach(function (t) {
      var lm = t.lastMessage;
      host.appendChild(h("button", { class: "pg-chat__row" + (t.unread ? " is-unread" : ""), type: "button",
        onclick: function () { openConversation(t); } },
        avatar(t.other, 44),
        h("div", { class: "pg-chat__rowmain" },
          h("div", { class: "pg-chat__rowtop" },
            h("span", { class: "pg-chat__rowname", text: t.other.name + (t.other.kind === "admin" ? " · Admin" : "") }),
            h("span", { class: "pg-chat__rowtime", text: lm ? ui.timeAgo(lm.at) : "" })),
          h("div", { class: "pg-chat__rowprev", text: lm ? ((lm.mine ? "Anda: " : "") + lm.preview) : "Belum ada pesan" })),
        t.unread ? h("span", { class: "pg-chat__rowbadge", text: t.unread > 9 ? "9+" : String(t.unread) }) : null));
    });
  }

  /* ---------- new chat (contact picker) ---------- */
  function openContacts() {
    state.view = "new";
    stopConvPoll();
    ui.clear(panelBody);
    panelBody.appendChild(head(h("span", { text: "Mulai chat baru" }), { back: renderList }));
    var searchInput = h("input", { class: "pg-input pg-chat__search", type: "text", placeholder: "Cari nama rekan…" });
    panelBody.appendChild(h("div", { class: "pg-chat__searchwrap" }, searchInput));
    var listHost = h("div", { class: "pg-chat__list" });
    panelBody.appendChild(listHost);
    listHost.appendChild(h("div", { class: "pg-chat__empty" }, h("p", { text: "Memuat kontak…" })));
    PG.store.chatContacts().then(function (d) {
      var contacts = (d && d.contacts) || [];
      function paint() {
        var q = (searchInput.value || "").trim().toLowerCase();
        var rows = contacts.filter(function (c) { return !q || (c.name || "").toLowerCase().indexOf(q) >= 0; });
        ui.clear(listHost);
        if (!rows.length) {
          listHost.appendChild(h("div", { class: "pg-chat__empty" }, h("p", { text: "Tidak ada kontak yang cocok." })));
          return;
        }
        rows.forEach(function (c) {
          listHost.appendChild(h("button", { class: "pg-chat__row", type: "button",
            onclick: function () { startChat(c); } },
            avatar(c, 44),
            h("div", { class: "pg-chat__rowmain" },
              h("div", { class: "pg-chat__rowname", text: c.name + (c.kind === "admin" ? " · Admin" : "") }),
              h("div", { class: "pg-chat__rowprev", text: c.divisionName || "" }))));
        });
      }
      searchInput.addEventListener("input", paint);
      paint();
    }).catch(function () {
      ui.clear(listHost);
      listHost.appendChild(h("div", { class: "pg-chat__empty" }, h("p", { text: "Gagal memuat kontak." })));
    });
  }
  function startChat(contact) {
    PG.store.chatOpenThread(contact.kind, contact.id).then(function (res) {
      var t = res && res.data && res.data.thread;
      if (!res || res.ok === false || !t) { ui.toast((res && res.error) || "Gagal memulai chat.", "danger"); return; }
      openConversation(t);
    }).catch(function () { ui.toast("Gagal memulai chat.", "danger"); });
  }

  /* ---------- conversation ---------- */
  function openConversation(thread) {
    state.threadId = thread.id;
    state.other = thread.other || null;
    state.messages = []; state.hasMore = false; state.sig = null;
    renderConversation();
    loadMessages();
  }
  function openConversationById(id) {
    state.threadId = String(id);
    state.other = null;
    state.messages = []; state.hasMore = false; state.sig = null;
    renderConversation();
    loadMessages();
  }
  function backToList() { stopConvPoll(); renderList(); }

  function renderConversation() {
    state.view = "conv";
    ui.clear(panelBody);
    panelBody.appendChild(head(peerNode(), { back: backToList }));
    msgScroll = h("div", { class: "pg-chat__msgs" });
    panelBody.appendChild(msgScroll);
    composerInput = h("textarea", { class: "pg-chat__input", rows: "1", placeholder: "Tulis pesan…",
      onkeydown: function (e) { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSend(); } },
      oninput: autoGrow });
    panelBody.appendChild(h("div", { class: "pg-chat__composer" },
      composerInput,
      h("button", { class: "pg-chat__send", type: "button", "aria-label": "Kirim", onclick: doSend }, svg("arrowRight"))));
    paintMessages();
    startConvPoll();
  }
  function peerNode() {
    return h("div", { class: "pg-chat__peer" },
      avatar(state.other || { name: "…" }, 30),
      h("span", { class: "pg-chat__peername", text: (state.other && state.other.name) || "Memuat…" }));
  }
  function refreshPeerHeader() {
    if (state.view !== "conv" || !panelBody) return;
    var old = panelBody.querySelector(".pg-chat__peer");
    if (old && old.parentNode) old.parentNode.replaceChild(peerNode(), old);
  }
  function autoGrow() {
    if (!composerInput) return;
    composerInput.style.height = "auto";
    composerInput.style.height = Math.min(120, composerInput.scrollHeight) + "px";
  }

  function loadMessages(beforeId) {
    if (!state.threadId) return;
    var opts = beforeId ? { beforeId: beforeId, limit: 40 } : { limit: 40 };
    PG.store.chatMessages(state.threadId, opts).then(function (d) {
      if (!d || d.ok === false) return;
      if (state.view !== "conv" || String(d.threadId) !== String(state.threadId)) return;
      if (d.other && !state.other) { state.other = d.other; refreshPeerHeader(); }
      else if (d.other) { state.other = d.other; }
      if (beforeId) {
        state.messages = (d.messages || []).concat(state.messages);
        state.hasMore = !!d.hasMore;
        paintMessages(true);
      } else {
        state.messages = d.messages || [];
        state.hasMore = !!d.hasMore;
        state.sig = msgSig(state.messages);
        paintMessages();
        if (PG.store.refresh) PG.store.refresh();   // opening marked the thread read
      }
    }).catch(function () {});
  }
  function refreshConversation() {
    if (!state.threadId) return;
    PG.store.chatMessages(state.threadId, { limit: 40 }).then(function (d) {
      if (!d || d.ok === false) return;
      if (state.view !== "conv" || String(d.threadId) !== String(state.threadId)) return;
      var sig = msgSig(d.messages || []);
      if (sig === state.sig) return;
      state.messages = d.messages || [];
      state.hasMore = !!d.hasMore;
      state.sig = sig;
      paintMessages();
      if (PG.store.refresh) PG.store.refresh();
    }).catch(function () {});
  }

  function paintMessages(prepending) {
    if (!msgScroll) return;
    var atBottom = msgScroll.scrollHeight - msgScroll.scrollTop - msgScroll.clientHeight < 80;
    var prevH = msgScroll.scrollHeight;
    ui.clear(msgScroll);
    if (state.hasMore) {
      msgScroll.appendChild(h("button", { class: "pg-chat__more", type: "button",
        onclick: function () { if (state.messages.length) loadMessages(state.messages[0].id); } },
        h("span", { text: "Muat pesan sebelumnya" })));
    }
    if (!state.messages.length) {
      msgScroll.appendChild(h("div", { class: "pg-chat__empty pg-chat__empty--conv" }, svg("message"),
        h("p", { text: "Belum ada pesan. Sapa " + ((state.other && state.other.name) || "rekan Anda") + "!" })));
    }
    var lastDay = null;
    state.messages.forEach(function (m) {
      var day = (m.createdAt || "").slice(0, 10);
      if (day && day !== lastDay) {
        lastDay = day;
        msgScroll.appendChild(h("div", { class: "pg-chat__daysep" }, h("span", { text: dayLabel(day) })));
      }
      msgScroll.appendChild(h("div", { class: "pg-chat__msg" + (m.mine ? " is-mine" : "") + (m._pending ? " is-pending" : "") },
        h("div", { class: "pg-chat__bubble", text: m.body }),
        h("div", { class: "pg-chat__msgtime", text: hhmm(m.createdAt) })));
    });
    if (prepending) msgScroll.scrollTop = Math.max(0, msgScroll.scrollHeight - prevH);
    else if (atBottom) msgScroll.scrollTop = msgScroll.scrollHeight;
  }

  function doSend() {
    if (!composerInput || !state.threadId) return;
    var body = (composerInput.value || "").trim();
    if (!body || state.sending) return;
    state.sending = true;
    composerInput.value = ""; autoGrow();
    var temp = { id: "tmp-" + Date.now(), mine: true, body: body, createdAt: new Date().toISOString(), _pending: true };
    state.messages.push(temp);
    paintMessages();
    PG.store.chatSend(state.threadId, body).then(function (d) {
      state.sending = false;
      if (!d || d.ok === false) {
        state.messages = state.messages.filter(function (m) { return m !== temp; });
        composerInput.value = body; autoGrow(); paintMessages();
        ui.toast((d && d.error) || "Gagal mengirim pesan.", "danger");
        return;
      }
      var idx = state.messages.indexOf(temp);
      if (idx >= 0) state.messages[idx] = d.message; else state.messages.push(d.message);
      state.sig = msgSig(state.messages);
      paintMessages();
      if (PG.store.refresh) PG.store.refresh();
    }).catch(function () {
      state.sending = false;
      state.messages = state.messages.filter(function (m) { return m !== temp; });
      composerInput.value = body; autoGrow(); paintMessages();
      ui.toast("Gagal mengirim pesan.", "danger");
    });
  }

  function startConvPoll() {
    stopConvPoll();
    state.convPoll = setInterval(function () {
      if (!state.open || state.view !== "conv") { stopConvPoll(); return; }
      refreshConversation();
    }, 4000);
  }
  function stopConvPoll() { if (state.convPoll) { clearInterval(state.convPoll); state.convPoll = null; } }

  PG.chat = { open: open, close: closePanel, mountButton: mountButton, unreadCount: unreadCount };
})(window.PG = window.PG || {});
