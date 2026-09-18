/* ============================================================
   PREMIERE GROUP — Square image cropper
   ------------------------------------------------------------
   PG.cropper(dataUrl, { title?, onConfirm(croppedDataUrl), onCancel? })
   Full-screen overlay: shows the source image inside a square viewport.
   Drag to pan, slider (or mouse wheel) to zoom, "Gunakan Foto" exports an
   exact OUTPUT x OUTPUT square JPEG. Zero dependency, works with mouse,
   touch, and pen via Pointer Events.
   ============================================================ */
(function (PG) {
  "use strict";

  var ui = PG.ui, h = ui.h, svg = ui.svg;
  var OUTPUT = 1080;      // exported square size (px)
  var JPEG_QUALITY = 0.85;

  function cropper(dataUrl, opts) {
    opts = opts || {};
    var overlay = h("div", { class: "pg-crop" });
    var viewportSize = 320; // css px, recalculated once the overlay is laid out
    var scaleUser = 1;      // 1..MAX_ZOOM, from the slider
    var MAX_ZOOM = 3;
    var panX = 0, panY = 0; // css px, offset from centered
    var dragging = false, dragStartX = 0, dragStartY = 0, panStartX = 0, panStartY = 0;

    var viewport = h("div", { class: "pg-crop__viewport" });
    // imgEl is both the visible preview AND the drawImage() source for the
    // final crop — a second offscreen Image() was tried here before and
    // silently produced blank output because its .src was never assigned.
    var imgEl = h("img", { class: "pg-crop__img", alt: "Pratinjau foto", draggable: false });
    viewport.appendChild(imgEl);

    var zoomSlider = h("input", { class: "pg-crop__zoom", type: "range", min: "1", max: String(MAX_ZOOM), step: "0.01", value: "1" });

    overlay.appendChild(h("div", { class: "pg-crop__bar" },
      h("div", { class: "pg-crop__title", text: opts.title || "Sesuaikan Foto" }),
      h("button", { class: "pg-crop__x", "aria-label": "Batal", onclick: cancel }, svg("close"))
    ));
    overlay.appendChild(h("div", { class: "pg-crop__stage" }, viewport));
    overlay.appendChild(h("div", { class: "pg-crop__controls" },
      svg("image"), zoomSlider, svg("image")
    ));
    overlay.appendChild(h("div", { class: "pg-crop__footer" },
      ui.button({ label: "Batal", variant: "ghost", onClick: cancel }),
      ui.button({ label: "Gunakan Foto", variant: "accent", icon: "check", onClick: confirmCrop })
    ));
    document.body.appendChild(overlay);
    document.addEventListener("keydown", onKey);

    function onKey(e) { if (e.key === "Escape") cancel(); }
    function cancel() {
      document.removeEventListener("keydown", onKey);
      overlay.remove();
      opts.onCancel && opts.onCancel();
    }

    function baseScale() {
      if (!imgEl.naturalWidth || !imgEl.naturalHeight) return 1;
      return Math.max(viewportSize / imgEl.naturalWidth, viewportSize / imgEl.naturalHeight);
    }
    function clampPan() {
      var total = baseScale() * scaleUser;
      var dw = imgEl.naturalWidth * total, dh = imgEl.naturalHeight * total;
      var maxX = Math.max(0, (dw - viewportSize) / 2);
      var maxY = Math.max(0, (dh - viewportSize) / 2);
      panX = Math.max(-maxX, Math.min(maxX, panX));
      panY = Math.max(-maxY, Math.min(maxY, panY));
    }
    function render() {
      clampPan();
      var total = baseScale() * scaleUser;
      var dw = imgEl.naturalWidth * total, dh = imgEl.naturalHeight * total;
      var left = viewportSize / 2 - dw / 2 + panX;
      var top = viewportSize / 2 - dh / 2 + panY;
      imgEl.style.width = dw + "px";
      imgEl.style.height = dh + "px";
      imgEl.style.transform = "translate(" + left + "px," + top + "px)";
    }

    function onPointerDown(e) {
      dragging = true;
      dragStartX = e.clientX; dragStartY = e.clientY;
      panStartX = panX; panStartY = panY;
      viewport.setPointerCapture && viewport.setPointerCapture(e.pointerId);
    }
    function onPointerMove(e) {
      if (!dragging) return;
      panX = panStartX + (e.clientX - dragStartX);
      panY = panStartY + (e.clientY - dragStartY);
      render();
    }
    function onPointerUp() { dragging = false; }
    viewport.addEventListener("pointerdown", onPointerDown);
    viewport.addEventListener("pointermove", onPointerMove);
    viewport.addEventListener("pointerup", onPointerUp);
    viewport.addEventListener("pointercancel", onPointerUp);
    viewport.addEventListener("wheel", function (e) {
      e.preventDefault();
      var next = scaleUser - e.deltaY * 0.0015;
      scaleUser = Math.max(1, Math.min(MAX_ZOOM, next));
      zoomSlider.value = String(scaleUser);
      render();
    }, { passive: false });
    zoomSlider.addEventListener("input", function () {
      scaleUser = parseFloat(zoomSlider.value) || 1;
      render();
    });

    function confirmCrop() {
      var total = baseScale() * scaleUser;
      var k = OUTPUT / viewportSize;
      var dw = imgEl.naturalWidth * total * k, dh = imgEl.naturalHeight * total * k;
      var left = (viewportSize / 2 - (imgEl.naturalWidth * total) / 2 + panX) * k;
      var top = (viewportSize / 2 - (imgEl.naturalHeight * total) / 2 + panY) * k;

      var canvas = document.createElement("canvas");
      canvas.width = OUTPUT;
      canvas.height = OUTPUT;
      var cx = canvas.getContext("2d");
      cx.fillStyle = "#fff";
      cx.fillRect(0, 0, OUTPUT, OUTPUT);
      cx.drawImage(imgEl, left, top, dw, dh);

      var out;
      try { out = canvas.toDataURL("image/jpeg", JPEG_QUALITY); }
      catch (e) { ui.toast("Gagal memproses foto. Coba lagi.", "danger"); return; }

      document.removeEventListener("keydown", onKey);
      overlay.remove();
      opts.onConfirm && opts.onConfirm(out);
    }

    imgEl.onload = function () {
      // Measure the real viewport box once it is laid out (CSS controls its size).
      requestAnimationFrame(function () {
        var r = viewport.getBoundingClientRect();
        viewportSize = Math.round(r.width) || viewportSize;
        render();
      });
    };
    imgEl.onerror = function () {
      ui.toast("Gagal memuat foto.", "danger");
      cancel();
    };
    imgEl.src = dataUrl;

    return { close: cancel };
  }

  /** Read a <input type=file> File into a data: URL. */
  function fileToDataUrl(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(new Error("Gagal membaca file.")); };
      fr.readAsDataURL(file);
    });
  }

  PG.cropper = cropper;
  PG.fileToDataUrl = fileToDataUrl;
})(window.PG = window.PG || {});
