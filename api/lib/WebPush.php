<?php
declare(strict_types=1);

/**
 * Web Push (VAPID + RFC 8291 "aes128gcm") in plain PHP 8 + OpenSSL. No Composer.
 *
 * - VAPID keypair (P-256 ECDSA) is generated once and cached in
 *   storage/keys/vapid.json (that folder is HTTP-denied, like storage/sessions).
 * - Every send is best-effort: any missing capability / transport error is
 *   swallowed so the in-app notification (Layer 1) always still lands.
 * - A push service reply of 404 or 410 means the subscription is dead -> the
 *   row (all rows with that endpoint) is deleted.
 *
 * Public entry points:
 *   WebPush::available()            -> bool  (crypto + curl present)
 *   WebPush::publicKeyB64u()       -> string (VAPID public key for the client)
 *   WebPush::sendToOwner($kind,$id,$payload)   fan-out to that principal's devices
 */
final class WebPush
{
    private const RECORD_SIZE = 4096;
    private const TTL         = 86400;   // 1 day queued at the push service
    private const MAX_PER_REQUEST = 40; // hard cap on push sends within one API request

    private static int $sentThisRequest = 0;

    public static function available(): bool
    {
        return function_exists('openssl_pkey_new')
            && function_exists('openssl_pkey_derive')
            && function_exists('hash_hkdf')
            && function_exists('curl_init')
            && in_array('aes-128-gcm', openssl_get_cipher_methods(), true);
    }

    /* ---------------- OpenSSL config (Windows/XAMPP needs an explicit path) --------- */

    private static ?string $conf = null;
    private static bool $confResolved = false;

    private static function opensslOpts(): array
    {
        if (!self::$confResolved) {
            self::$confResolved = true;
            $base = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
            if (@openssl_pkey_new($base) !== false) {
                self::$conf = null;                       // default config works (Linux)
            } else {
                $candidates = array_filter([
                    getenv('OPENSSL_CONF') ?: null,
                    dirname(PHP_BINARY) . '/extras/openssl/openssl.cnf',
                    dirname(PHP_BINARY) . '/extras/ssl/openssl.cnf',
                    'C:/xampp/apache/conf/openssl.cnf',
                    '/etc/ssl/openssl.cnf', '/etc/pki/tls/openssl.cnf', '/usr/lib/ssl/openssl.cnf',
                ]);
                foreach ($candidates as $c) {
                    if (is_file($c) && @openssl_pkey_new($base + ['config' => $c]) !== false) {
                        self::$conf = $c;
                        break;
                    }
                }
            }
        }
        $o = ['curve_name' => 'prime256v1', 'private_key_type' => OPENSSL_KEYTYPE_EC];
        if (self::$conf !== null) { $o['config'] = self::$conf; }
        return $o;
    }

    private static function newEcKey()
    {
        return @openssl_pkey_new(self::opensslOpts());
    }

    private static function exportPem($key): ?string
    {
        $pem = null;
        $args = self::$conf !== null ? ['config' => self::$conf] : null;
        if (@openssl_pkey_export($key, $pem, null, $args)) {
            return $pem;
        }
        return null;
    }

    /* ---------------- VAPID keys ---------------- */

    private static ?array $vapid = null;

    private static function keyPath(): string
    {
        return dirname(__DIR__, 2) . '/storage/keys/vapid.json';
    }

    private static function vapid(): ?array
    {
        if (self::$vapid !== null) {
            return self::$vapid ?: null;
        }
        $path = self::keyPath();
        if (is_file($path)) {
            $j = json_decode((string) @file_get_contents($path), true);
            if (is_array($j) && !empty($j['privatePem']) && !empty($j['publicB64u'])) {
                return self::$vapid = $j;
            }
        }
        // generate
        if (!self::available()) { self::$vapid = []; return null; }
        $res = self::newEcKey();
        if ($res === false) { self::$vapid = []; return null; }
        $pem = self::exportPem($res);
        if ($pem === null) { self::$vapid = []; return null; }
        $d = openssl_pkey_get_details($res);
        $pub = "\x04" . self::pad32($d['ec']['x']) . self::pad32($d['ec']['y']);
        $out = ['privatePem' => $pem, 'publicB64u' => self::b64u($pub)];

        $dir = dirname($path);
        if (!is_dir($dir)) { @mkdir($dir, 0700, true); }
        if (is_dir($dir)) {
            @file_put_contents($path, json_encode($out), LOCK_EX);
            @chmod($path, 0600);
            // belt & braces: deny HTTP even if the parent rule is missing
            if (!is_file($dir . '/.htaccess')) {
                @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
            }
        }
        return self::$vapid = $out;
    }

    public static function publicKeyB64u(): ?string
    {
        $v = self::vapid();
        return $v['publicB64u'] ?? null;
    }

    private static function contact(): string
    {
        $c = (string) Env::get('VAPID_CONTACT', 'mailto:admin@premieregroup.my.id');
        return str_starts_with($c, 'mailto:') || str_starts_with($c, 'https:') ? $c : 'mailto:' . $c;
    }

    /* ---------------- fan-out ---------------- */

    /**
     * @param array{title:string,body?:string,route?:string,url?:string,tag?:string} $payload
     */
    public static function sendToOwner(string $kind, int $ownerId, array $payload): void
    {
        if ($ownerId <= 0 || !self::available()) {
            return;
        }
        try {
            $subs = Db::all(
                "SELECT id, endpoint, p256dh, auth FROM push_subscriptions
                  WHERE owner_kind = ? AND owner_id = ? LIMIT 25",
                [$kind === 'admin' ? 'admin' : 'user', $ownerId]
            );
        } catch (\Throwable $e) {
            return; // table not migrated yet
        }
        if (!$subs) {
            return;
        }
        $body = json_encode([
            'title' => (string) $payload['title'],
            'body'  => (string) ($payload['body'] ?? ''),
            'route' => $payload['route'] ?? '/',
            'url'   => $payload['url'] ?? ($payload['route'] ?? '/'),
            'tag'   => $payload['tag'] ?? ('pg-' . substr(md5(($payload['title'] ?? '') . microtime()), 0, 10)),
        ], JSON_UNESCAPED_UNICODE);

        foreach ($subs as $s) {
            if (self::$sentThisRequest >= self::MAX_PER_REQUEST) {
                return;
            }
            self::$sentThisRequest++;
            try {
                $code = self::sendOne($s['endpoint'], $s['p256dh'], $s['auth'], $body);
            } catch (\Throwable $e) {
                error_log('[premiere][webpush] ' . $e->getMessage());
                continue;
            }
            if ($code === 404 || $code === 410) {
                try { Db::run("DELETE FROM push_subscriptions WHERE endpoint = ?", [$s['endpoint']]); } catch (\Throwable $e) {}
            } elseif ($code >= 200 && $code < 300) {
                try { Db::run("UPDATE push_subscriptions SET last_ok_at = NOW() WHERE id = ?", [(int) $s['id']]); } catch (\Throwable $e) {}
            }
        }
    }

    /** Send one encrypted push. Returns the push-service HTTP status (0 on transport error). */
    public static function sendOne(string $endpoint, string $p256dhB64u, string $authB64u, string $payloadJson): int
    {
        $v = self::vapid();
        if (!$v) {
            return 0;
        }

        $uaPublic   = self::b64ud($p256dhB64u);   // 65 bytes, uncompressed point
        $authSecret = self::b64ud($authB64u);     // 16 bytes
        if (strlen($uaPublic) !== 65 || strlen($authSecret) < 16) {
            return 0;
        }

        // --- server ephemeral keypair ---
        $eph = self::newEcKey();
        if ($eph === false) {
            return 0;
        }
        $ed = openssl_pkey_get_details($eph);
        $asPublic = "\x04" . self::pad32($ed['ec']['x']) . self::pad32($ed['ec']['y']);

        // --- ECDH ---
        $peer = openssl_pkey_get_public(self::rawPointToPem($uaPublic));
        if ($peer === false) {
            return 0;
        }
        $ecdh = openssl_pkey_derive($peer, $eph, 32);
        if ($ecdh === false || strlen($ecdh) !== 32) {
            return 0;
        }

        // --- RFC 8291 key derivation ---
        $salt    = random_bytes(16);
        $keyInfo = "WebPush: info\x00" . $uaPublic . $asPublic;
        $ikm     = hash_hkdf('sha256', $ecdh, 32, $keyInfo, $authSecret);
        $cek     = hash_hkdf('sha256', $ikm, 16, "Content-Encoding: aes128gcm\x00", $salt);
        $nonce   = hash_hkdf('sha256', $ikm, 12, "Content-Encoding: nonce\x00", $salt);

        // --- encrypt (single record: data || 0x02 delimiter, no extra padding) ---
        $plaintext = $payloadJson . "\x02";
        $tag = '';
        $ct = openssl_encrypt($plaintext, 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($ct === false) {
            return 0;
        }
        $ciphertext = $ct . $tag;

        // --- aes128gcm framing:  salt(16) | rs(4) | idlen(1) | keyid(65) | ciphertext ---
        $header = $salt . pack('N', self::RECORD_SIZE) . chr(strlen($asPublic)) . $asPublic;
        $bodyBin = $header . $ciphertext;

        // --- VAPID JWT (ES256) ---
        $aud = self::origin($endpoint);
        $jwtHeader = self::b64u('{"typ":"JWT","alg":"ES256"}');
        $jwtClaims = self::b64u(json_encode([
            'aud' => $aud, 'exp' => time() + 43200, 'sub' => self::contact(),
        ]));
        $signingInput = $jwtHeader . '.' . $jwtClaims;
        $der = '';
        if (!openssl_sign($signingInput, $der, $v['privatePem'], OPENSSL_ALGO_SHA256)) {
            return 0;
        }
        $jwt = $signingInput . '.' . self::b64u(self::derSigToRaw($der));

        // --- POST ---
        $ch = curl_init($endpoint);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $bodyBin,
            CURLOPT_HTTPHEADER     => [
                'Authorization: vapid t=' . $jwt . ', k=' . $v['publicB64u'],
                'Content-Encoding: aes128gcm',
                'Content-Type: application/octet-stream',
                'TTL: ' . self::TTL,
                'Urgency: normal',
            ],
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 4,
            CURLOPT_TIMEOUT        => 7,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        curl_exec($ch);
        $code = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return $code;
    }

    /* ---------------- low-level helpers ---------------- */

    private static function b64u(string $bin): string
    {
        return rtrim(strtr(base64_encode($bin), '+/', '-_'), '=');
    }
    private static function b64ud(string $s): string
    {
        $s = strtr($s, '-_', '+/');
        return (string) base64_decode($s . str_repeat('=', (4 - strlen($s) % 4) % 4));
    }
    private static function pad32(string $b): string
    {
        return str_pad(ltrim($b, "\x00"), 32, "\x00", STR_PAD_LEFT);
    }
    private static function origin(string $url): string
    {
        $p = parse_url($url);
        $scheme = $p['scheme'] ?? 'https';
        $host   = $p['host'] ?? '';
        $port   = isset($p['port']) ? ':' . $p['port'] : '';
        return $scheme . '://' . $host . $port;
    }

    /** Wrap a raw 65-byte uncompressed P-256 point in a DER SPKI + PEM. */
    private static function rawPointToPem(string $point): string
    {
        $der = "\x30\x59\x30\x13\x06\x07\x2a\x86\x48\xce\x3d\x02\x01\x06\x08\x2a\x86\x48\xce\x3d\x03\x01\x07\x03\x42\x00" . $point;
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($der), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    /** DER ECDSA signature (SEQ{ INT r, INT s }) -> raw 64-byte r||s for JWS. */
    private static function derSigToRaw(string $der): string
    {
        $off = 0;
        if (($der[$off] ?? '') !== "\x30") {
            return str_repeat("\x00", 64);
        }
        $off++;
        $len = ord($der[$off++]);
        if ($len & 0x80) { $off += ($len & 0x7f); }

        $read = function () use ($der, &$off): string {
            $off++;                       // 0x02 INTEGER tag
            $l = ord($der[$off++]);
            $v = substr($der, $off, $l);
            $off += $l;
            return ltrim($v, "\x00");
        };
        $r = $read();
        $s = $read();
        return str_pad($r, 32, "\x00", STR_PAD_LEFT) . str_pad($s, 32, "\x00", STR_PAD_LEFT);
    }
}
