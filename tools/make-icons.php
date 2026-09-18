<?php
/**
 * Generate the PWA / favicon icon set from assets/img/logo.png.
 *
 *   php tools/make-icons.php
 *
 * Put your master logo at  assets/img/logo.png  (square, ideally >= 512x512,
 * PNG, transparent or white background). If it is missing this script writes a
 * simple placeholder logo so the app still works, and you can drop the real
 * file in later and re-run.
 *
 * Outputs (assets/img/):
 *   logo.png (placeholder only if missing)
 *   icon-192.png  icon-512.png  icon-maskable-512.png
 *   apple-touch-icon.png  favicon-32.png  favicon-16.png
 */

$imgDir = dirname(__DIR__) . '/assets/img';
$logo   = $imgDir . '/logo.png';

if (!extension_loaded('gd')) {
    fwrite(STDERR, "GD extension required.\n");
    exit(1);
}
@mkdir($imgDir, 0755, true);

/* ---- master logo ---- */
if (is_file($logo)) {
    $src = @imagecreatefrompng($logo);
    if (!$src) { $src = @imagecreatefromstring((string) file_get_contents($logo)); }
    if (!$src) { fwrite(STDERR, "Could not read $logo\n"); exit(1); }
    echo "Using logo: $logo (" . imagesx($src) . "x" . imagesy($src) . ")\n";
} else {
    echo "No logo.png — writing a placeholder. Replace assets/img/logo.png and re-run.\n";
    $src = placeholder_logo(512);
    imagepng($src, $logo);
}

$sw = imagesx($src);
$sh = imagesy($src);

/* ---- helper: scaled copy of the logo centred on a canvas ---- */
function render(int $size, float $inset, ?array $bg, $src, int $sw, int $sh): \GdImage
{
    $canvas = imagecreatetruecolor($size, $size);
    imagealphablending($canvas, false);
    imagesavealpha($canvas, true);
    if ($bg === null) {
        imagefill($canvas, 0, 0, imagecolorallocatealpha($canvas, 0, 0, 0, 127));
    } else {
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, $bg[0], $bg[1], $bg[2]));
    }
    imagealphablending($canvas, true);

    $box  = (int) round($size * (1 - 2 * $inset));
    $scale = min($box / $sw, $box / $sh);
    $dw = max(1, (int) round($sw * $scale));
    $dh = max(1, (int) round($sh * $scale));
    $dx = (int) round(($size - $dw) / 2);
    $dy = (int) round(($size - $dh) / 2);
    imagecopyresampled($canvas, $src, $dx, $dy, 0, 0, $dw, $dh, $sw, $sh);
    return $canvas;
}
function save(\GdImage $im, string $path): void
{
    imagesavealpha($im, true);
    imagepng($im, $path, 6);
    imagedestroy($im);
    echo "  wrote " . basename($path) . "\n";
}

/* any-purpose icons: transparent bg, minimal inset */
save(render(512, 0.02, null, $src, $sw, $sh), "$imgDir/icon-512.png");
save(render(192, 0.02, null, $src, $sw, $sh), "$imgDir/icon-192.png");

/* maskable: white bg + 18% safe-zone inset so the launcher mask never clips it */
save(render(512, 0.18, [255, 255, 255], $src, $sw, $sh), "$imgDir/icon-maskable-512.png");

/* apple touch icon: white bg (iOS ignores transparency), small inset */
save(render(180, 0.06, [255, 255, 255], $src, $sw, $sh), "$imgDir/apple-touch-icon.png");

/* favicons */
save(render(32, 0.0, null, $src, $sw, $sh), "$imgDir/favicon-32.png");
save(render(16, 0.0, null, $src, $sw, $sh), "$imgDir/favicon-16.png");

imagedestroy($src);
echo "Done.\n";

/* ---- placeholder logo: white square, teal R + yellow G ---- */
function placeholder_logo(int $s): \GdImage
{
    $im = imagecreatetruecolor($s, $s);
    imagesavealpha($im, true);
    imagefill($im, 0, 0, imagecolorallocatealpha($im, 0, 0, 0, 127));
    $teal   = imagecolorallocate($im, 0x21, 0x8D, 0xAE);
    $yellow = imagecolorallocate($im, 0xFF, 0xD7, 0x58);
    // rounded square backdrop
    $pad = (int) ($s * 0.06);
    imagefilledrectangle($im, $pad, $pad, $s - $pad, $s - $pad, imagecolorallocate($im, 255, 255, 255));
    $fs = 5; // built-in font, scaled by drawing big then it's fine for a placeholder
    // draw big letters using imagestring on a scaled scratch then copy
    $scratch = imagecreatetruecolor(20, 16);
    imagefill($scratch, 0, 0, imagecolorallocate($scratch, 255, 255, 255));
    imagestring($scratch, 5, 1, 1, 'R', imagecolorallocate($scratch, 0x21, 0x8D, 0xAE));
    imagestring($scratch, 5, 10, 1, 'G', imagecolorallocate($scratch, 0xF5, 0xA6, 0x23));
    imagecopyresampled($im, $scratch, $pad * 2, (int) ($s * 0.28), 0, 0, $s - $pad * 4, (int) ($s * 0.44), 20, 16);
    imagedestroy($scratch);
    return $im;
}
