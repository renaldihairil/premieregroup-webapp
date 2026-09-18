<?php
declare(strict_types=1);

/**
 * PDO wrapper. One connection per request. Prepared statements only.
 * Timezone is pinned to +08:00 (WITA) so DATETIME reads/writes are consistent.
 */
final class Db
{
    private static ?PDO $pdo = null;

    public static function conn(): PDO
    {
        if (self::$pdo instanceof PDO) {
            return self::$pdo;
        }
        $host = Env::get('DB_HOST', 'localhost');
        $port = Env::get('DB_PORT', '3306');
        $name = Env::get('DB_DATABASE', '');
        $user = Env::get('DB_USERNAME', '');
        $pass = Env::get('DB_PASSWORD', '');

        if ($name === '' || $user === '') {
            Http::fail('Konfigurasi database belum diisi. Lengkapi file .env.', 500);
        }

        $dsn = "mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4";
        try {
            self::$pdo = new PDO($dsn, $user, $pass, [
                PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES   => false,
            ]);
            self::$pdo->exec("SET time_zone = '+08:00'");
        } catch (PDOException $e) {
            error_log('[premiere][db] ' . $e->getMessage());
            Http::fail('Tidak dapat terhubung ke database.', 500);
        }
        return self::$pdo;
    }

    /** @param array<int|string,mixed> $params */
    public static function run(string $sql, array $params = []): PDOStatement
    {
        $st = self::conn()->prepare($sql);
        $st->execute($params);
        return $st;
    }

    /** Run a write and return the number of affected rows. */
    public static function exec(string $sql, array $params = []): int
    {
        return self::run($sql, $params)->rowCount();
    }

    /** @param array<int|string,mixed> $params @return array<string,mixed>|null */
    public static function one(string $sql, array $params = []): ?array
    {
        $row = self::run($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    /** @param array<int|string,mixed> $params @return list<array<string,mixed>> */
    public static function all(string $sql, array $params = []): array
    {
        return self::run($sql, $params)->fetchAll();
    }

    public static function lastId(): int
    {
        return (int) self::conn()->lastInsertId();
    }

    /** Run $fn inside a transaction; roll back on any throwable. */
    public static function tx(callable $fn): mixed
    {
        $pdo = self::conn();
        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Apply any migration file in database/migrations/ that is not yet recorded
     * in schema_migrations. Runs on every request but the fast path is a single
     * COUNT query. Each statement is executed independently and "already exists"
     * errors are ignored, so re-running is always safe. This makes deployment
     * "import db.sql once, upload new files, done" — no manual migration step.
     */
    public static function runPendingMigrations(): void
    {
        $dir = dirname(__DIR__, 2) . '/database/migrations';
        if (!is_dir($dir)) {
            return;
        }
        $files = glob($dir . '/*.sql') ?: [];
        if (!$files) {
            return;
        }
        sort($files);

        try {
            self::conn()->exec(
                "CREATE TABLE IF NOT EXISTS `schema_migrations` (
                   `version` VARCHAR(50) NOT NULL,
                   `applied_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                   PRIMARY KEY (`version`)
                 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci"
            );
            $applied = [];
            foreach (self::all("SELECT version FROM schema_migrations") as $r) {
                $applied[$r['version']] = true;
            }
            // Fast path: every file recorded (+1 for the fileless "initial" marker).
            if (count($applied) > count($files)) {
                return;
            }

            // dup column / table exists / dup key name / base table or column missing.
            // 42S02 = table not found: a fresh install runs db.sql (final schema) then
            // every migration; a migration that ALTERs a table a *later* migration
            // drops must no-op instead of aborting the whole run.
            $ignorable = ['42S21', '42S01', '42S02', '42S22', '42000'];

            foreach ($files as $file) {
                $version = basename($file, '.sql');
                if (isset($applied[$version])) {
                    continue;
                }
                $sql = (string) file_get_contents($file);
                $sql = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
                $stmts = array_filter(array_map('trim', preg_split('/;\s*[\r\n]+/', $sql) ?: []));

                foreach ($stmts as $st) {
                    if ($st === '' || stripos($st, 'schema_migrations') !== false) {
                        continue; // we record the marker ourselves
                    }
                    try {
                        self::conn()->exec($st);
                    } catch (\PDOException $e) {
                        if (!in_array($e->getCode(), $ignorable, true)
                            && !preg_match('/(already exists|doesn\'t exist|unknown (column|table)|duplicate (column|key|foreign key)|check that column\/key exists|multiple primary key)/i', $e->getMessage())) {
                            throw $e;
                        }
                    }
                }
                self::run(
                    "INSERT INTO schema_migrations (version) VALUES (?) ON DUPLICATE KEY UPDATE version = version",
                    [$version]
                );
            }
        } catch (\Throwable $e) {
            error_log('[premiere][migrate] ' . $e->getMessage());
            // Never let auto-migration take the whole API down.
        }
    }
}
