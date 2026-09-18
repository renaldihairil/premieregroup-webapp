/* ============================================================
   PREMIERE GROUP — Selfie capture component
   ------------------------------------------------------------
   PG.selfie({ title, guide, onConfirm(dataUrl) -> {ok,error}|Promise })
   Opens a full-screen overlay: request camera -> live front-camera
   preview -> capture -> confirm/retake -> caller saves -> success.
   Handles unsupported / permission-denied / no-camera / other errors
   without crashing. The photo is compressed before it leaves the page.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;
  var MAX_EDGE = 480;       // px — cap the long side before JPEG encode
  var JPEG_QUALITY = 0.6;

  function selfie(opts) {
    opts = opts || {};
    var guideText = opts.guide || "Posisikan wajah di tengah kamera";
    var stream = null;
    var lastDataUrl = null;

    var overlay = h("div", { class: "pg-cam" });
    var stage = h("div", { class: "pg-cam__stage" });
    var footer = h("div", { class: "pg-cam__footer" });
    var video = h("video", { class: "pg-cam__video", autoplay: true, playsinline: true, muted: true });
    var canvas = h("canvas", { style: { display: "none" } });

    overlay.appendChild(h("div", { class: "pg-cam__bar" },
      h("div", { class: "pg-cam__title", text: opts.title || "Selfie Absensi" }),
      h("button", { class: "pg-cam__x", "aria-label": "Tutup", onclick: close }, svg("close"))
    ));
    overlay.appendChild(stage);
    overlay.appendChild(footer);
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey);

    function onKey(e) { if (e.key === "Escape") close(); }

    function stopStream() {
      if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    }
    function close() {
      document.removeEventListener("keydown", onKey);
      stopStream();
      overlay.remove();
      opts.onClose && opts.onClose();
    }

    function setStage(node) { ui.mount(stage, node); }
    function setFooter() {
      ui.clear(footer);
      Array.prototype.slice.call(arguments).forEach(function (n) { if (n) footer.appendChild(n); });
    }

    /* ---------- states ---------- */
    function showLoading() {
      setStage(h("div", { class: "pg-cam__msg" },
        h("div", { class: "pg-spinner" }),
        h("div", { text: "Meminta izin kamera…" })
      ));
      setFooter();
    }

    function showError(kind, detail) {
      var map = {
        unsupported: "Perangkat atau browser ini tidak mendukung kamera. Buka aplikasi melalui http://localhost:8777 pada browser yang memiliki kamera.",
        denied: "Kamera diperlukan untuk melakukan absensi selfie. Silakan izinkan akses kamera pada browser/perangkat Anda, lalu coba lagi.",
        nocam: "Kamera tidak ditemukan pada perangkat ini.",
        other: "Kamera gagal dibuka." + (detail ? " (" + detail + ")" : "")
      };
      setStage(h("div", { class: "pg-cam__msg pg-cam__msg--error" },
        h("div", { class: "pg-cam__erricon" }, svg("info")),
        h("div", { class: "pg-cam__errtext", text: map[kind] || map.other })
      ));
      setFooter(
        ui.button({ label: "Tutup", variant: "ghost", onClick: close }),
        kind === "unsupported" ? null
          : ui.button({ label: "Coba Lagi", variant: "primary", icon: "clock", onClick: start })
      );
    }

    function showLive() {
      var wrap = h("div", { class: "pg-cam__live" }, video,
        h("div", { class: "pg-cam__guide-oval" }),
        h("div", { class: "pg-cam__guide-text", text: guideText })
      );
      setStage(wrap);
      setFooter(h("button", { class: "pg-cam__shutter", "aria-label": "Ambil Foto", onclick: capture },
        h("span", { class: "pg-cam__shutter-dot" })));
    }

    function showCaptured(dataUrl) {
      setStage(h("div", { class: "pg-cam__live" },
        h("img", { class: "pg-cam__shot", src: dataUrl, alt: "Hasil selfie" })
      ));
      setFooter(
        ui.button({ label: "Ambil Ulang", variant: "ghost", icon: "clock", onClick: showLive }),
        ui.button({ label: "Gunakan Foto", variant: "accent", icon: "check", onClick: function () { confirm(dataUrl); } })
      );
    }

    function showSaving() {
      setStage(h("div", { class: "pg-cam__msg" },
        h("div", { class: "pg-spinner" }),
        h("div", { text: "Menyimpan absensi…" })
      ));
      setFooter();
    }

    function showSuccess() {
      setStage(h("div", { class: "pg-cam__msg pg-cam__msg--ok" },
        h("div", { class: "pg-cam__okicon" }, svg("checkCircle")),
        h("div", { text: "Absensi berhasil dicatat." })
      ));
      setFooter();
      setTimeout(function () {
        var url = lastDataUrl;
        close();
        opts.onSuccess && opts.onSuccess(url);
      }, 1100);
    }

    /* ---------- camera ---------- */
    function start() {
      showLoading();
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showError("unsupported"); return;
      }
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 640 } },
        audio: false
      }).then(function (s) {
        stream = s;
        video.srcObject = s;
        video.onloadedmetadata = function () { video.play().catch(function () {}); };
        showLive();
      }).catch(function (err) {
        var n = err && err.name;
        if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError") showError("denied");
        else if (n === "NotFoundError" || n === "DevicesNotFoundError" || n === "OverconstrainedError") showError("nocam");
        else showError("other", n || (err && err.message));
      });
    }

    function capture() {
      var vw = video.videoWidth || 640, vh = video.videoHeight || 640;
      var scale = Math.min(1, MAX_EDGE / Math.max(vw, vh));
      canvas.width = Math.round(vw * scale);
      canvas.height = Math.round(vh * scale);
      var cx = canvas.getContext("2d");
      cx.drawImage(video, 0, 0, canvas.width, canvas.height);
      var dataUrl;
      try { dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY); }
      catch (e) { ui.toast("Gagal mengambil foto. Coba lagi.", "danger"); return; }
      lastDataUrl = dataUrl;
      showCaptured(dataUrl);
    }

    function confirm(dataUrl) {
      lastDataUrl = dataUrl;
      showSaving();
      var res;
      try { res = opts.onConfirm ? opts.onConfirm(dataUrl) : { ok: true }; }
      catch (e) { res = { ok: false, error: e.message }; }
      Promise.resolve(res).then(function (r) {
        r = r || { ok: false, error: "Tidak ada respon." };
        if (r.ok) { showSuccess(); }
        else { ui.toast(r.error || "Absensi gagal disimpan.", "danger"); showCaptured(dataUrl); }
      });
    }

    start();
    return { close: close };
  }

  PG.selfie = selfie;
})(window.PG = window.PG || {});
