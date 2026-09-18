<?php
declare(strict_types=1);

/**
 * Selfie storage. The DB stores a RELATIVE PATH; the file lives on disk
 * (outside the web root if UPLOAD_DIR points there). Photos are only ever
 * served through /api/photo, which checks ownership.
 */
final class Storage
{
    public static function baseDir(): string
    {
        $d = Env::get('UPLOAD_DIR', '');
        if ($d === null || $d === '') {
            $d = dirname(__DIR__, 2) . '/storage/uploads';
        }
        return rtrim(str_replace('\\', '/', $d), '/');
    }

    private static function maxBytes(): int
    {
        return max(65536, Env::int('UPLOAD_MAX_BYTES', 2097152));
    }

    /**
     * Validate + re-encode a data:image/... URL and save it under $bucket
     * ("attendance" | "overtime"). Returns the relative path to store in the DB.
     */
    public static function saveDataUrl(string $dataUrl, string $bucket): string
    {
        $bucket = in_array($bucket, ['attendance', 'overtime', 'izin'], true) ? $bucket : 'misc';

        if (!preg_match('#^data:image/(jpeg|jpg|png);base64,(.+)$#s', $dataUrl, $m)) {
            Http::fail('Format foto tidak dikenali.', 422);
        }
        $bin = base64_decode($m[2], true);
        if ($bin === false || $bin === '') {
            Http::fail('Data foto rusak.', 422);
        }
        if (strlen($bin) > self::maxBytes()) {
            Http::fail('Ukuran foto melebihi batas ' . round(self::maxBytes() / 1048576, 1) . ' MB.', 422);
        }

        // MIME sniff — getimagesizefromstring() is core PHP, does NOT need the GD ext.
        $info = @getimagesizefromstring($bin);
        if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
            Http::fail('Berkas bukan gambar JPEG/PNG yang sah.', 422);
        }

        $rel    = $bucket . '/' . date('Y') . '/' . date('m');
        $absDir = self::baseDir() . '/' . $rel;
        if (!is_dir($absDir) && !@mkdir($absDir, 0755, true) && !is_dir($absDir)) {
            Http::fail('Folder penyimpanan foto tidak dapat dibuat. Periksa izin folder storage.', 500);
        }
        $name = bin2hex(random_bytes(16)) . '.jpg';
        $abs  = $absDir . '/' . $name;

        // Preferred path: GD re-encode — strips any embedded payload/metadata and
        // downscales the long edge to 480px.
        if (function_exists('imagecreatefromstring')) {
            $src = @imagecreatefromstring($bin);
            if (!$src) {
                Http::fail('Gambar gagal diproses.', 422);
            }
            $w = imagesx($src);
            $h = imagesy($src);
            $scale = min(1.0, 480 / max($w, $h));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($nw, $nh);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $saved = imagejpeg($dst, $abs, 75);
            imagedestroy($src);
            imagedestroy($dst);
            if (!$saved) {
                Http::fail('Foto gagal disimpan.', 500);
            }
            return $rel . '/' . $name;
        }

        // Fallback (GD extension not enabled): store the validated original bytes.
        // Only JPEG — a PNG here would be served with the wrong Content-Type.
        // Enable `extension=gd` in php.ini for the full re-encode/downscale.
        error_log('[premiere][storage] GD ext missing — saving original bytes without re-encode.');
        if ($info[2] !== IMAGETYPE_JPEG) {
            Http::fail('Server belum mengaktifkan ekstensi GD. Aktifkan extension=gd di php.ini '
                . 'lalu restart, atau gunakan kamera yang menghasilkan JPEG.', 500);
        }
        if (@file_put_contents($abs, $bin) === false) {
            Http::fail('Foto gagal disimpan. Periksa izin folder storage.', 500);
        }
        return $rel . '/' . $name;
    }

    /**
     * Validate + re-encode a data:image/... URL for the "Momen Kerja" feed.
     * The client already crops to a 1080x1080 square before upload; this just
     * re-encodes (strips metadata) and caps the long edge at 1080 so an
     * oversized source can't slip through.
     */
    public static function savePostPhoto(string $dataUrl): string
    {
        if (!preg_match('#^data:image/(jpeg|jpg|png);base64,(.+)$#s', $dataUrl, $m)) {
            Http::fail('Format foto tidak dikenali.', 422);
        }
        $bin = base64_decode($m[2], true);
        if ($bin === false || $bin === '') {
            Http::fail('Data foto rusak.', 422);
        }
        if (strlen($bin) > self::maxBytes() * 4) { // posts allow a bigger source than a selfie
            Http::fail('Ukuran foto melebihi batas ' . round((self::maxBytes() * 4) / 1048576, 1) . ' MB.', 422);
        }

        $info = @getimagesizefromstring($bin);
        if ($info === false || !in_array($info[2], [IMAGETYPE_JPEG, IMAGETYPE_PNG], true)) {
            Http::fail('Berkas bukan gambar JPEG/PNG yang sah.', 422);
        }

        $rel    = 'posts/' . date('Y') . '/' . date('m');
        $absDir = self::baseDir() . '/' . $rel;
        if (!is_dir($absDir) && !@mkdir($absDir, 0755, true) && !is_dir($absDir)) {
            Http::fail('Folder penyimpanan foto tidak dapat dibuat. Periksa izin folder storage.', 500);
        }
        $name = bin2hex(random_bytes(16)) . '.jpg';
        $abs  = $absDir . '/' . $name;

        if (function_exists('imagecreatefromstring')) {
            $src = @imagecreatefromstring($bin);
            if (!$src) {
                Http::fail('Gambar gagal diproses.', 422);
            }
            $w = imagesx($src);
            $h = imagesy($src);
            $scale = min(1.0, 1080 / max($w, $h));
            $nw = max(1, (int) round($w * $scale));
            $nh = max(1, (int) round($h * $scale));
            $dst = imagecreatetruecolor($nw, $nh);
            imagecopyresampled($dst, $src, 0, 0, 0, 0, $nw, $nh, $w, $h);
            $saved = imagejpeg($dst, $abs, 82);
            imagedestroy($src);
            imagedestroy($dst);
            if (!$saved) {
                Http::fail('Foto gagal disimpan.', 500);
            }
            return $rel . '/' . $name;
        }

        error_log('[premiere][storage] GD ext missing — saving original bytes without re-encode.');
        if ($info[2] !== IMAGETYPE_JPEG) {
            Http::fail('Server belum mengaktifkan ekstensi GD. Aktifkan extension=gd di php.ini '
                . 'lalu restart, atau gunakan foto JPEG.', 500);
        }
        if (@file_put_contents($abs, $bin) === false) {
            Http::fail('Foto gagal disimpan. Periksa izin folder storage.', 500);
        }
        return $rel . '/' . $name;
    }

    /**
     * Save a "Momen Kerja" video upload (a $_FILES entry). We cannot inspect
     * duration / aspect ratio server-side (no ffmpeg on shared hosting) — the
     * client enforces ≤60s and the 9:16 frame is a display crop. Here we only
     * validate the real MIME (mp4 / quicktime / webm) and cap the size well
     * under post_max_size. Returns [path, mime, size].
     *
     * @return array{path:string,mime:string,size:int}
     */
    public static function savePostVideo(array $file): array
    {
        $cap = max(1048576, Env::int('POST_VIDEO_MAX_BYTES', 58 * 1024 * 1024)); // 58 MB default

        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $map = [
                UPLOAD_ERR_INI_SIZE  => 'Ukuran video melebihi batas server (php.ini upload_max_filesize).',
                UPLOAD_ERR_FORM_SIZE => 'Ukuran video terlalu besar.',
                UPLOAD_ERR_PARTIAL   => 'Upload video terputus. Coba lagi.',
                UPLOAD_ERR_NO_FILE   => 'Tidak ada video yang diunggah.',
                UPLOAD_ERR_NO_TMP_DIR => 'Folder sementara PHP tidak tersedia.',
                UPLOAD_ERR_CANT_WRITE => 'Server gagal menulis video.',
            ];
            Http::fail($map[$file['error']] ?? 'Upload video gagal.', 422);
        }
        $tmp = $file['tmp_name'] ?? '';
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            Http::fail('File video tidak valid.', 422);
        }
        $size = (int) ($file['size'] ?? filesize($tmp) ?: 0);
        if ($size <= 0) {
            Http::fail('File video kosong.', 422);
        }
        if ($size > $cap) {
            Http::fail('Ukuran video melebihi batas ' . round($cap / 1048576) . ' MB.', 422);
        }

        // Be permissive: accept ANY common video container/codec. What a given
        // viewer's browser can't play INLINE still gets a "Buka / Unduh Video"
        // fallback link on the feed card, so a hard reject here just makes
        // posting harder for no real gain. We only refuse a file finfo is sure
        // is NOT a video (an image / doc / text picked by mistake). The stored
        // `mime` is what /api/post-video streams with; the extension is cosmetic.
        $known = [ // ext -> [storedExt, storedMime]
            'mp4' => ['mp4', 'video/mp4'], 'm4v' => ['m4v', 'video/mp4'], 'f4v' => ['f4v', 'video/mp4'],
            'mov' => ['mov', 'video/quicktime'], 'qt' => ['mov', 'video/quicktime'],
            'webm' => ['webm', 'video/webm'], 'mkv' => ['mkv', 'video/x-matroska'],
            '3gp' => ['3gp', 'video/3gpp'], '3gpp' => ['3gp', 'video/3gpp'], '3g2' => ['3g2', 'video/3gpp2'],
            'avi' => ['avi', 'video/x-msvideo'], 'wmv' => ['wmv', 'video/x-ms-wmv'],
            'mpg' => ['mpg', 'video/mpeg'], 'mpeg' => ['mpg', 'video/mpeg'], 'mpe' => ['mpg', 'video/mpeg'],
            'ogv' => ['ogv', 'video/ogg'], 'ts' => ['ts', 'video/mp2t'], 'm2ts' => ['m2ts', 'video/mp2t'],
            'mts' => ['mts', 'video/mp2t'], 'flv' => ['flv', 'video/x-flv'],
        ];
        $sniffMap = [
            'video/mp4' => 'mp4', 'application/mp4' => 'mp4', 'video/x-m4v' => 'm4v',
            'video/quicktime' => 'mov', 'video/webm' => 'webm', 'video/x-matroska' => 'mkv',
            'video/3gpp' => '3gp', 'video/3gpp2' => '3g2', 'video/mpeg' => 'mpg',
            'video/x-msvideo' => 'avi', 'video/avi' => 'avi', 'video/msvideo' => 'avi',
            'video/x-ms-wmv' => 'wmv', 'video/ogg' => 'ogv', 'video/mp2t' => 'ts', 'video/x-flv' => 'flv',
        ];

        $sniff = '';
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            $sniff = (string) finfo_file($fi, $tmp);
            finfo_close($fi);
        }
        $ext0  = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
        $clientMime = strtolower((string) ($file['type'] ?? ''));

        if (isset($sniffMap[$sniff]) && isset($known[$sniffMap[$sniff]])) {
            [$ext, $mime] = $known[$sniffMap[$sniff]];
        } elseif (strncmp($sniff, 'video/', 6) === 0) {
            // some other real video container finfo recognised — trust it as-is
            $ext  = preg_match('/^[a-z0-9]{2,5}$/', $ext0) ? $ext0 : 'mp4';
            $mime = $sniff;
        } elseif (($sniff === '' || $sniff === 'application/octet-stream') && isset($known[$ext0])) {
            [$ext, $mime] = $known[$ext0];
        } elseif (($sniff === '' || $sniff === 'application/octet-stream') && strncmp($clientMime, 'video/', 6) === 0) {
            $ext  = preg_match('/^[a-z0-9]{2,5}$/', $ext0) ? $ext0 : 'mp4';
            $mime = $clientMime;
        } elseif ($sniff === '' || $sniff === 'application/octet-stream') {
            // finfo blind and no hint at all — last resort, store as generic mp4.
            $ext = 'mp4';
            $mime = 'video/mp4';
        } else {
            // finfo is certain this is NOT a video (image/*, text/*, pdf, …).
            Http::fail('Berkas yang dipilih bukan video.', 422);
        }

        $rel    = 'posts/' . date('Y') . '/' . date('m');
        $absDir = self::baseDir() . '/' . $rel;
        if (!is_dir($absDir) && !@mkdir($absDir, 0755, true) && !is_dir($absDir)) {
            Http::fail('Folder penyimpanan tidak dapat dibuat. Periksa izin folder storage.', 500);
        }
        $name = bin2hex(random_bytes(16)) . '.' . $ext;
        if (!@move_uploaded_file($tmp, $absDir . '/' . $name)) {
            Http::fail('Video gagal disimpan. Periksa izin folder storage.', 500);
        }

        return ['path' => $rel . '/' . $name, 'mime' => $mime, 'size' => $size];
    }

    /** Stream a stored photo. Caller must authorize BEFORE calling this. */
    public static function serve(?string $relPath): never
    {
        if ($relPath === null || $relPath === '') {
            Http::fail('Foto tidak tersedia.', 404);
        }
        $safe = str_replace(['..', "\0", '\\'], '', $relPath);
        $abs  = self::baseDir() . '/' . ltrim($safe, '/');
        if (!is_file($abs)) {
            Http::fail('Foto tidak ditemukan.', 404);
        }
        if (!headers_sent()) {
            header('Content-Type: image/jpeg');
            header('X-Content-Type-Options: nosniff');
            header('Cache-Control: private, max-age=86400');
            header('Content-Length: ' . (string) filesize($abs));
        }
        readfile($abs);
        exit;
    }

    /** Delete a stored file (best effort). Used only by admin hard-delete. */
    public static function remove(?string $relPath): void
    {
        if ($relPath === null || $relPath === '') {
            return;
        }
        $safe = str_replace(['..', "\0", '\\'], '', $relPath);
        $abs  = self::baseDir() . '/' . ltrim($safe, '/');
        if (is_file($abs)) {
            @unlink($abs);
        }
    }

    /* ========================================================
       Generic uploads (todo-report attachments: photos + docs)
       ======================================================== */

    /** MIME -> [extension, kind]. The whitelist. */
    private const UPLOAD_TYPES = [
        'image/jpeg' => ['jpg', 'image'],
        'image/png'  => ['png', 'image'],
        'image/webp' => ['webp', 'image'],
        'image/gif'  => ['gif', 'image'],
        'application/pdf' => ['pdf', 'file'],
        'application/msword' => ['doc', 'file'],
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => ['docx', 'file'],
        'application/vnd.ms-excel' => ['xls', 'file'],
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => ['xlsx', 'file'],
        'application/vnd.ms-powerpoint' => ['ppt', 'file'],
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' => ['pptx', 'file'],
        'text/plain' => ['txt', 'file'],
        'text/csv'   => ['csv', 'file'],
        'application/zip' => ['zip', 'file'],
    ];

    private static function uploadMaxBytes(): int
    {
        return max(65536, Env::int('ATTACH_MAX_BYTES', 10485760)); // 10 MB default
    }

    /**
     * Save one uploaded file (a $_FILES entry). Validates the real MIME with
     * finfo, caps the size, gives it a random name with an extension derived
     * from the MIME (never from the client filename).
     *
     * @param  int|null $maxBytes  overrides the default cap (e.g. a bigger limit
     *                             for short video clips on visit reports).
     * @return array{path:string,name:string,mime:string,size:int,kind:string}
     */
    public static function saveUpload(array $file, string $bucket = 'todo', ?int $maxBytes = null): array
    {
        $bucket = preg_replace('/[^a-z]/', '', strtolower($bucket)) ?: 'misc';
        $cap    = $maxBytes !== null ? max(65536, $maxBytes) : self::uploadMaxBytes();

        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            $map = [
                UPLOAD_ERR_INI_SIZE => 'Ukuran file melebihi batas server (php.ini upload_max_filesize).',
                UPLOAD_ERR_FORM_SIZE => 'Ukuran file terlalu besar.',
                UPLOAD_ERR_PARTIAL => 'Upload terputus. Coba lagi.',
                UPLOAD_ERR_NO_FILE => 'Tidak ada file yang diunggah.',
                UPLOAD_ERR_NO_TMP_DIR => 'Folder sementara PHP tidak tersedia.',
                UPLOAD_ERR_CANT_WRITE => 'Server gagal menulis file.',
            ];
            Http::fail($map[$file['error']] ?? 'Upload gagal.', 422);
        }
        $tmp = $file['tmp_name'] ?? '';
        if ($tmp === '' || !is_uploaded_file($tmp)) {
            Http::fail('File tidak valid.', 422);
        }
        $size = (int) ($file['size'] ?? filesize($tmp) ?: 0);
        if ($size <= 0) {
            Http::fail('File kosong.', 422);
        }
        if ($size > $cap) {
            Http::fail('Ukuran file melebihi batas ' . round($cap / 1048576, 1) . ' MB.', 422);
        }

        $mime = '';
        if (function_exists('finfo_open')) {
            $fi = finfo_open(FILEINFO_MIME_TYPE);
            $mime = (string) finfo_file($fi, $tmp);
            finfo_close($fi);
        }
        if ($mime === '' || $mime === 'application/octet-stream') {
            // Fallback when the fileinfo extension is unavailable, or the host
            // reports octet-stream for zip-container office files.
            $ext0 = strtolower(pathinfo((string) ($file['name'] ?? ''), PATHINFO_EXTENSION));
            $byExt = [
                'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg', 'png' => 'image/png',
                'webp' => 'image/webp', 'gif' => 'image/gif',
                'pdf' => 'application/pdf', 'csv' => 'text/csv', 'txt' => 'text/plain',
                'doc' => 'application/msword', 'xls' => 'application/vnd.ms-excel',
                'ppt' => 'application/vnd.ms-powerpoint',
                'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            ];
            // If fileinfo is present and returned a real image/* mime, trust it;
            // otherwise sniff images with core getimagesize() before the ext map.
            if ($mime === '' && function_exists('getimagesize')) {
                $gi = @getimagesize($tmp);
                if ($gi && !empty($gi['mime'])) {
                    $mime = (string) $gi['mime'];
                }
            }
            if ($mime === '' || $mime === 'application/octet-stream') {
                $mime = $byExt[$ext0] ?? $mime;
            }
        }
        if (!isset(self::UPLOAD_TYPES[$mime])) {
            Http::fail('Jenis file tidak didukung. Gunakan foto (JPG/PNG/WebP), PDF, Word, Excel, PowerPoint, teks, atau CSV.', 422);
        }
        [$ext, $kind] = self::UPLOAD_TYPES[$mime];

        if ($kind === 'image') {
            // finfo/the extension fallback above can both be fooled by a
            // mislabeled or truncated file (e.g. an iPhone HEIC photo saved
            // with a ".jpg" name, or a file corrupted mid-upload on a slow
            // connection) — the MIME sniff passes, but no browser can ever
            // actually decode the bytes, which is what later shows up as a
            // broken thumbnail. Catch it here with a clear rejection,
            // before the file is ever written to disk.
            $dims = function_exists('getimagesize') ? @getimagesize($tmp) : false;
            if (!$dims) {
                Http::fail('File foto tidak valid atau rusak. Coba ambil/pilih ulang fotonya.', 422);
            }
        }

        $rel    = $bucket . '/' . date('Y') . '/' . date('m');
        $absDir = self::baseDir() . '/' . $rel;
        if (!is_dir($absDir) && !@mkdir($absDir, 0755, true) && !is_dir($absDir)) {
            Http::fail('Folder penyimpanan tidak dapat dibuat. Periksa izin folder storage.', 500);
        }
        $name = bin2hex(random_bytes(16)) . '.' . $ext;
        if (!@move_uploaded_file($tmp, $absDir . '/' . $name)) {
            Http::fail('File gagal disimpan. Periksa izin folder storage.', 500);
        }

        $orig = trim((string) ($file['name'] ?? ('lampiran.' . $ext)));
        $orig = mb_substr(preg_replace('/[\x00-\x1F\x7F]/u', '', $orig) ?: ('lampiran.' . $ext), 0, 200);

        return ['path' => $rel . '/' . $name, 'name' => $orig, 'mime' => $mime, 'size' => $size, 'kind' => $kind];
    }

    /**
     * Stream any stored file with the right content type. Caller authorizes first.
     * Honours a single HTTP Range request (206) so <video> seeking / mobile
     * playback works without loading the whole clip.
     */
    public static function serveFile(?string $relPath, string $mime, string $downloadName, bool $forceDownload): never
    {
        if ($relPath === null || $relPath === '') {
            Http::fail('File tidak tersedia.', 404);
        }
        $safe = str_replace(['..', "\0", '\\'], '', $relPath);
        $abs  = self::baseDir() . '/' . ltrim($safe, '/');
        if (!is_file($abs)) {
            Http::fail('File tidak ditemukan.', 404);
        }

        // The body must reach the socket VERBATIM: an exact Content-Length and
        // precise byte ranges are what mobile <video> (iOS Safari especially)
        // requires, and shared-host web servers love to gzip or fully buffer a
        // PHP response — which corrupts both. Turn all of that off, and lift
        // the execution-time cap so a slow mobile transfer isn't killed midway.
        @ini_set('zlib.output_compression', '0');
        @ini_set('output_buffering', '0');
        @ini_set('implicit_flush', '1');
        while (ob_get_level() > 0) { @ob_end_clean(); }
        if (function_exists('apache_setenv')) { @apache_setenv('no-gzip', '1'); @apache_setenv('dont-vary', '1'); }
        @set_time_limit(0);
        if (headers_sent($hf, $hl)) {
            error_log('[premiere][storage] headers already sent before serveFile @ ' . $hf . ':' . $hl);
        }

        $mime = $mime !== '' ? $mime : 'application/octet-stream';
        $inline = !$forceDownload && (
            str_starts_with($mime, 'image/') || str_starts_with($mime, 'video/') ||
            str_starts_with($mime, 'text/') || $mime === 'application/pdf'
        );
        $dn   = preg_replace('/["\r\n]/', '', $downloadName !== '' ? $downloadName : basename($abs));
        $size = (int) filesize($abs);

        $start = 0;
        $end   = $size - 1;
        $isRange = false;
        $rangeHdr = $_SERVER['HTTP_RANGE'] ?? '';
        if (!$forceDownload && $size > 0 && preg_match('/^bytes=(\d*)-(\d*)$/', trim((string) $rangeHdr), $m)) {
            $isRange = true;
            if ($m[1] === '' && $m[2] !== '') {           // suffix range: last N bytes
                $start = max(0, $size - (int) $m[2]);
            } else {
                $start = (int) $m[1];
                if ($m[2] !== '') {
                    $end = min($end, (int) $m[2]);
                }
            }
            if ($start > $end || $start >= $size) {
                if (!headers_sent()) {
                    http_response_code(416);
                    header('Content-Range: bytes */' . $size);
                    header('Accept-Ranges: bytes');
                }
                exit;
            }
        }
        $length = $end - $start + 1;

        if (!headers_sent()) {
            http_response_code($isRange ? 206 : 200);
            header('Content-Type: ' . $mime);
            header('X-Content-Type-Options: nosniff');
            header('Accept-Ranges: bytes');
            header('Cache-Control: private, max-age=86400');
            header('Content-Length: ' . (string) $length);
            header('X-Accel-Buffering: no');         // nginx: stream, don't buffer
            if ($isRange) {
                header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
            }
            header('Content-Disposition: ' . ($inline ? 'inline' : 'attachment') . '; filename="' . $dn . '"');
        }

        // HEAD probe (some players send one first) — headers are enough.
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
            exit;
        }

        $fh = @fopen($abs, 'rb');
        if ($fh === false) {
            exit;
        }
        if ($start > 0) {
            fseek($fh, $start);
        }
        $remaining = $length;
        while ($remaining > 0 && !feof($fh) && !connection_aborted()) {
            $chunk = fread($fh, (int) min(262144, $remaining));   // 256 KB
            if ($chunk === false || $chunk === '') {
                break;
            }
            echo $chunk;
            $remaining -= strlen($chunk);
            flush();
        }
        fclose($fh);
        exit;
    }
}
