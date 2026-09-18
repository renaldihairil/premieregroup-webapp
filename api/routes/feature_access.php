<?php
declare(strict_types=1);

/**
 * Feature access (Admin Panel — Pengaturan → "Akses Fitur"). See
 * api/lib/FeatureAccess.php for the catalog + resolution rule, and its
 * docblock for the "UI-only, not a security boundary" scope decision.
 *
 *   GET  /division-features            the full division x feature matrix
 *   POST /division-features            { items:[{divisionId,featureKey,enabled}] }
 *   GET  /user-features?userId=        one employee's explicit overrides + effective result
 *   POST /user-features                { userId, featureKey, enabled }  (enabled=null clears the override)
 */

pg_route('GET', '/division-features', function (): void {
    Guard::can('feature.access.edit');
    $divisions = Db::all("SELECT id, name FROM divisions ORDER BY name");
    $rows = Db::all("SELECT division_id, feature_key, enabled FROM division_features");
    $byDiv = [];
    foreach ($rows as $r) {
        $byDiv[(int) $r['division_id']][$r['feature_key']] = (bool) $r['enabled'];
    }
    $keys = FeatureAccess::keys();
    $matrix = [];
    foreach ($divisions as $d) {
        $features = [];
        foreach ($keys as $key) {
            $features[$key] = $byDiv[(int) $d['id']][$key] ?? true;
        }
        $matrix[] = ['divisionId' => id_str($d['id']), 'divisionName' => $d['name'], 'features' => $features];
    }
    Http::json(['ok' => true, 'catalog' => FeatureAccess::catalog(), 'matrix' => $matrix]);
});

pg_route('POST', '/division-features', function (): void {
    Guard::can('feature.access.edit');
    $items = (array) (Http::body()['items'] ?? []);
    $keys  = FeatureAccess::keys();
    foreach ($items as $it) {
        $divisionId = (int) ($it['divisionId'] ?? 0);
        $key = (string) ($it['featureKey'] ?? '');
        if ($divisionId <= 0 || !in_array($key, $keys, true)) {
            continue;
        }
        $enabled = !empty($it['enabled']) ? 1 : 0;
        Db::run(
            "INSERT INTO division_features (division_id, feature_key, enabled) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)",
            [$divisionId, $key, $enabled]
        );
    }
    Http::json(['ok' => true]);
});

pg_route('GET', '/user-features', function (): void {
    Guard::can('feature.access.edit');
    $userId = (int) (Http::query('userId') ?? 0);
    if (!$userId) {
        Http::json(['ok' => false, 'error' => 'Pilih karyawan terlebih dahulu.'], 200);
    }
    $rows = Db::all("SELECT feature_key, enabled FROM user_features WHERE user_id = ?", [$userId]);
    $overrides = [];
    foreach ($rows as $r) {
        $overrides[$r['feature_key']] = (bool) $r['enabled'];
    }
    $effective = FeatureAccess::effectiveForUser($userId, pg_user_division_ids($userId));
    Http::json(['ok' => true, 'catalog' => FeatureAccess::catalog(), 'overrides' => $overrides, 'effective' => $effective]);
});

pg_route('POST', '/user-features', function (): void {
    Guard::can('feature.access.edit');
    $body   = Http::body();
    $userId = (int) ($body['userId'] ?? 0);
    $key    = (string) ($body['featureKey'] ?? '');
    if (!$userId || !in_array($key, FeatureAccess::keys(), true)) {
        Http::json(['ok' => false, 'error' => 'Data tidak lengkap.'], 200);
    }
    if (array_key_exists('enabled', $body) && $body['enabled'] === null) {
        Db::run("DELETE FROM user_features WHERE user_id = ? AND feature_key = ?", [$userId, $key]);
    } else {
        $enabled = !empty($body['enabled']) ? 1 : 0;
        Db::run(
            "INSERT INTO user_features (user_id, feature_key, enabled) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE enabled = VALUES(enabled)",
            [$userId, $key, $enabled]
        );
    }
    Http::json(['ok' => true, 'effective' => FeatureAccess::effectiveForUser($userId, pg_user_division_ids($userId))]);
});
