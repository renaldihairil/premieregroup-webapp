/* ============================================================
   PG.resizeImageFile — downscale + re-encode ANY picked photo (camera or
   gallery) into a small JPEG BEFORE it's uploaded, full-frame (no crop).

   Why this exists: every plain <input type=file> photo picker in this app
   (Todo attachments, Kunjungan/checklist attachments, Profil foto, cover
   Program) was uploading the RAW file straight from the phone — often
   5-15MB — with zero client-side processing. That's why uploads felt slow
   and inconsistent on mobile data, and why a thumbnail sometimes came back
   broken: a small share of phones hand over a format the server's weak
   fallback accepts but a browser can't redisplay later (e.g. an iPhone
   HEIC photo saved with a ".jpg" name), or a huge raw upload gets
   corrupted mid-transfer on a slow connection.

   Momen Kerja posts and selfie absensi never hit either problem because
   they already run every photo through a <canvas> re-encode (PG.cropper /
   camera.js) before upload. This gives every OTHER photo picker in the
   app that same fix, without forcing a square crop — these are full-frame
   evidence photos, not avatars.
   ============================================================ */
(function (PG) {
  "use strict";

  /**
   * @param {File} file
   * @param {{maxEdge?: number, quality?: number}} [opts]
   * @returns {Promise<File>} a new File, always image/jpeg. Resolves with
   *          the ORIGINAL file untouched if it isn't an image, or if
   *          anything about the resize fails — this never blocks or
   *          breaks an upload, it only ever makes the common case better.
   */
  function resizeImageFile(file, opts) {
    opts = opts || {};
    var maxEdge = opts.maxEdge || 1600;
    var quality = opts.quality || 0.85;

    if (!file || !/^image\//i.test(file.type || "")) {
      return Promise.resolve(file);
    }

    return new Promise(function (resolve) {
      var url;
      try { url = URL.createObjectURL(file); } catch (e) { resolve(file); return; }

      var settled = false;
      function done(result) {
        if (settled) return;
        settled = true;
        try { URL.revokeObjectURL(url); } catch (e) {}
        resolve(result);
      }

      var img = new Image();
      img.onerror = function () { done(file); }; // e.g. HEIC the browser itself can't decode either
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight;
          if (!w || !h) { done(file); return; }
          var scale = Math.min(1, maxEdge / Math.max(w, h)); // never upscale
          var outW = Math.max(1, Math.round(w * scale));
          var outH = Math.max(1, Math.round(h * scale));
          var canvas = document.createElement("canvas");
          canvas.width = outW; canvas.height = outH;
          var ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, outW, outH);
          canvas.toBlob(function (blob) {
            if (!blob) { done(file); return; }
            var name = (file.name || "foto").replace(/\.[a-z0-9]+$/i, "") + ".jpg";
            var out;
            try { out = new File([blob], name, { type: "image/jpeg" }); }
            catch (e) { out = blob; } // File([...],name,opts) unsupported — Blob still works in FormData
            done(out);
          }, "image/jpeg", quality);
        } catch (e) { done(file); }
      };
      img.src = url;
    });
  }

  PG.resizeImageFile = resizeImageFile;
})(window.PG = window.PG || {});
