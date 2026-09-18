<?php
declare(strict_types=1);

/**
 * "Momen Kerja" — a shared, self-expiring feed (like a 24h story). Visible to
 * every logged-in principal (user AND admin) — one company-wide feed. A post
 * carries exactly one medium: a square photo, OR a short vertical video
 * (9:16, ≤60s), OR neither (text-only) — plus an optional caption. It
 * disappears (row + file) 24h after posting via Posts::sweepExpired().
 *
 *   GET    /posts                    list active (non-expired) posts
 *   POST   /posts                    JSON { photo (data:image/...), caption? }
 *                                    OR multipart { video (file), caption? }
 *   DELETE /posts/{id}               owner, or any admin (moderation)
 *   POST   /posts/{id}/like          toggle like for me
 *   GET    /posts/{id}/comments      list comments on a post
 *   POST   /posts/{id}/comments      { text }
 *   DELETE /post-comments/{id}       owner, or any admin (moderation)
 *   GET    /post-photo?id=           stream the photo (any logged-in principal)
 *   GET    /post-video?id=           stream the video, Range-aware (any principal)
 */

/**
 * A stable server secret for signing media URLs. Auto-generated once into
 * storage/keys/media.key (that folder is HTTP-denied, same as the VAPID keys).
 * Lets a <video src> carry its own proof so it plays even where the session
 * cookie is not sent on sub-resource requests — installed PWAs and some
 * mobile browsers, which is the "works on desktop, not on phone" symptom.
 */
function pg_media_secret(): string
{
    static $key = null;
    if ($key !== null) {
        return $key;
    }
    $path = PG_ROOT . '/storage/keys/media.key';
    if (is_file($path)) {
        $key = trim((string) @file_get_contents($path));
    }
    if (!$key) {
        $key = bin2hex(random_bytes(32));
        $dir = dirname($path);
        if (!is_dir($dir)) {
            @mkdir($dir, 0700, true);
        }
        @file_put_contents($path, $key, LOCK_EX);
        if (!is_file($dir . '/.htaccess')) {
            @file_put_contents($dir . '/.htaccess', "Require all denied\nDeny from all\n");
        }
    }
    return $key;
}

/** Per-post opaque token for its video stream URL. */
function pg_post_video_token(int $postId): string
{
    return substr(hash_hmac('sha256', 'post-video:' . $postId, pg_media_secret()), 0, 24);
}

/** @return array{kind:string,id:int,name:string} */
function pg_post_principal(): array
{
    $p = Auth::principal();
    if (!$p) {
        Http::fail('Perlu login.', 401);
    }
    $kind = $p['kind'] === 'admin' ? 'admin' : 'user';
    return ['kind' => $kind, 'id' => (int) $p['id'], 'name' => (string) ($p['name'] ?? '')];
}

/** Shared SELECT/JOIN fragment resolving a post's author name + raw photo path
 *  (fmt_post() turns the path into a content-versioned URL — see there for why
 *  a bare has-photo boolean isn't enough to keep the avatar fresh). */
function pg_post_author_select(): string
{
    return "CASE WHEN p.owner_kind = 'user' THEN u.full_name ELSE a.name END AS author_name,
            CASE WHEN p.owner_kind = 'user' THEN u.photo_path ELSE NULL END AS author_photo_path";
}
function pg_post_author_join(): string
{
    return "LEFT JOIN users  u ON u.id = p.owner_id AND p.owner_kind = 'user'
            LEFT JOIN admins a ON a.id = p.owner_id AND p.owner_kind = 'admin'";
}

/** Delete a comment and its whole reply subtree (post_comment_likes cascade
 *  via FK for each row). Used because parent_comment_id has no self-ref FK. */
function pg_delete_comment_subtree(int $id): void
{
    foreach (Db::all("SELECT id FROM post_comments WHERE parent_comment_id = ?", [$id]) as $child) {
        pg_delete_comment_subtree((int) $child['id']);
    }
    Db::run("DELETE FROM post_comments WHERE id = ?", [$id]);
}

/** Notify whoever owns a post/comment — the owner can be a user OR an admin. */
function pg_post_notify_owner(string $ownerKind, int $ownerId, string $type, string $title, string $body, ?string $link, ?int $actorUserId): void
{
    if ($ownerKind === 'admin') {
        Notify::toAdmin($ownerId, $type, $title, $body, $link, $actorUserId);
    } else {
        Notify::toUser($ownerId, $type, $title, $body, $link, $actorUserId);
    }
}

pg_route('GET', '/posts', function (): void {
    $me = pg_post_principal();
    $rows = Db::all(
        "SELECT p.*, " . pg_post_author_select() . ",
                (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                (SELECT COUNT(*) FROM post_comments pc WHERE pc.post_id = p.id) AS comment_count,
                EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.liker_kind = ? AND pl2.liker_id = ?) AS liked_by_me,
                (p.owner_kind = ? AND p.owner_id = ?) AS is_mine
           FROM posts p " . pg_post_author_join() . "
          WHERE p.expires_at > NOW()
          ORDER BY p.created_at DESC
          LIMIT 200",
        [$me['kind'], $me['id'], $me['kind'], $me['id']]
    );
    Http::json(['ok' => true, 'posts' => array_map('fmt_post', $rows)]);
});

pg_route('POST', '/posts', function (): void {
    $me   = pg_post_principal();
    $body = Http::body(); // multipart -> $_POST, else JSON

    $hasVideoUpload = isset($_FILES['video']) && is_array($_FILES['video'])
        && ($_FILES['video']['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_NO_FILE;

    $photoRaw = (string) ($body['photo'] ?? '');
    $hasPhoto = !$hasVideoUpload && strncmp($photoRaw, 'data:image', 10) === 0;
    $caption  = Validate::optStr($body['caption'] ?? null, 500);

    if (!$hasVideoUpload && !$hasPhoto && !$caption) {
        Http::json(['ok' => false, 'error' => 'Tulis sesuatu, atau tambahkan foto/video dulu.'], 200);
    }

    $photoRel = null;
    $videoRel = null;
    $videoMime = null;
    if ($hasVideoUpload) {
        $saved     = Storage::savePostVideo($_FILES['video']);
        $videoRel  = $saved['path'];
        $videoMime = $saved['mime'];
    } elseif ($hasPhoto) {
        $photoRel = Storage::savePostPhoto($photoRaw);
    }

    try {
        Db::run(
            "INSERT INTO posts (owner_kind, owner_id, photo_path, video_path, video_mime, caption, created_at, expires_at)
             VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW() + INTERVAL 24 HOUR)",
            [$me['kind'], $me['id'], $photoRel, $videoRel, $videoMime, $caption]
        );
    } catch (\Throwable $e) {
        if ($photoRel) { Storage::remove($photoRel); }
        if ($videoRel) { Storage::remove($videoRel); }
        error_log('[premiere][posts] create: ' . $e->getMessage());
        Http::json(['ok' => false, 'error' => 'Gagal membagikan momen.'], 200);
    }
    $newId = (int) Db::lastId(); // capture BEFORE Notify (its own INSERT bumps LAST_INSERT_ID)

    $name = $me['name'] !== '' ? $me['name'] : Notify::userName($me['id']);
    $what = $videoRel ? 'sebuah video' : 'sebuah momen';
    $snippet = $caption ? (' — ' . mb_substr($caption, 0, 80) . (mb_strlen($caption) > 80 ? '…' : '')) : '';
    Notify::broadcastExceptSelf($me['kind'], $me['id'], 'post.shared',
        'Momen kerja baru',
        $name . ' membagikan ' . $what . $snippet,
        '/momen');

    $row = Db::one(
        "SELECT p.*, " . pg_post_author_select() . ", 0 AS like_count, 0 AS comment_count, 0 AS liked_by_me, 1 AS is_mine
           FROM posts p " . pg_post_author_join() . " WHERE p.id = ?",
        [$newId]
    );
    Http::json(['ok' => true, 'post' => fmt_post($row)]);
});

pg_route('DELETE', '/posts/{id}', function (array $p): void {
    $me  = pg_post_principal();
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM posts WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Momen tidak ditemukan.'], 200);
    }
    $isOwner = $row['owner_kind'] === $me['kind'] && (int) $row['owner_id'] === $me['id'];
    $isAdmin = $me['kind'] === 'admin';
    if (!$isOwner && !$isAdmin) {
        Http::json(['ok' => false, 'error' => 'Anda tidak berhak menghapus momen ini.'], 200);
    }
    Db::run("DELETE FROM posts WHERE id = ?", [$id]); // likes/comments cascade
    Storage::remove($row['photo_path'] ?? null);
    Storage::remove($row['video_path'] ?? null);
    Http::json(['ok' => true]);
});

pg_route('POST', '/posts/{id}/like', function (array $p): void {
    $me = pg_post_principal();
    $id = (int) $p['id'];
    $post = Db::one("SELECT id, owner_kind, owner_id, caption FROM posts WHERE id = ? AND expires_at > NOW()", [$id]);
    if (!$post) {
        Http::json(['ok' => false, 'error' => 'Momen tidak ditemukan.'], 200);
    }
    $existing = Db::one(
        "SELECT id FROM post_likes WHERE post_id = ? AND liker_kind = ? AND liker_id = ?",
        [$id, $me['kind'], $me['id']]
    );
    if ($existing) {
        Db::run("DELETE FROM post_likes WHERE id = ?", [$existing['id']]);
        $liked = false;
    } else {
        Db::run("INSERT INTO post_likes (post_id, liker_kind, liker_id) VALUES (?, ?, ?)", [$id, $me['kind'], $me['id']]);
        $liked = true;
        // Notify the owner — but never for un-likes, and never for liking your
        // own post.
        $isSelf = $post['owner_kind'] === $me['kind'] && (int) $post['owner_id'] === $me['id'];
        if (!$isSelf) {
            $name = $me['name'] !== '' ? $me['name'] : Notify::userName($me['id']);
            $snippet = !empty($post['caption'])
                ? (' — ' . mb_substr((string) $post['caption'], 0, 60) . (mb_strlen((string) $post['caption']) > 60 ? '…' : ''))
                : '';
            pg_post_notify_owner((string) $post['owner_kind'], (int) $post['owner_id'], 'post.liked',
                'Momen Anda disukai',
                $name . ' menyukai momen Anda' . $snippet . '.',
                '/momen', $me['kind'] === 'user' ? $me['id'] : null);
        }
    }
    $count = (int) (Db::one("SELECT COUNT(*) c FROM post_likes WHERE post_id = ?", [$id])['c'] ?? 0);
    Http::json(['ok' => true, 'liked' => $liked, 'likeCount' => $count]);
});

pg_route('GET', '/posts/{id}/comments', function (array $p): void {
    $me   = pg_post_principal();
    $id   = (int) $p['id'];
    $rows = Db::all(
        "SELECT c.*,
                CASE WHEN c.commenter_kind = 'user' THEN u.full_name ELSE a.name END AS author_name,
                CASE WHEN c.commenter_kind = 'user' THEN u.photo_path ELSE NULL END AS author_photo_path,
                (c.commenter_kind = ? AND c.commenter_id = ?) AS is_mine,
                (SELECT COUNT(*) FROM post_comment_likes pcl WHERE pcl.comment_id = c.id) AS like_count,
                EXISTS(SELECT 1 FROM post_comment_likes pl2 WHERE pl2.comment_id = c.id AND pl2.liker_kind = ? AND pl2.liker_id = ?) AS liked_by_me
           FROM post_comments c
           LEFT JOIN users  u ON u.id = c.commenter_id AND c.commenter_kind = 'user'
           LEFT JOIN admins a ON a.id = c.commenter_id AND c.commenter_kind = 'admin'
          WHERE c.post_id = ?
          ORDER BY c.created_at ASC
          LIMIT 500",
        [$me['kind'], $me['id'], $me['kind'], $me['id'], $id]
    );
    Http::json(['ok' => true, 'comments' => array_map('fmt_post_comment', $rows)]);
});

pg_route('POST', '/posts/{id}/comments', function (array $p): void {
    $me   = pg_post_principal();
    $id   = (int) $p['id'];
    $body = Http::body();
    $text = Validate::str($body['text'] ?? '', 'Komentar', 1, 500);
    $post = Db::one("SELECT id, owner_kind, owner_id FROM posts WHERE id = ? AND expires_at > NOW()", [$id]);
    if (!$post) {
        Http::json(['ok' => false, 'error' => 'Momen tidak ditemukan.'], 200);
    }

    // Optional: this comment is a reply to another comment on the same post.
    $parentId = (int) ($body['parentCommentId'] ?? 0);
    $parent   = null;
    if ($parentId > 0) {
        $parent = Db::one("SELECT id, post_id, commenter_kind, commenter_id FROM post_comments WHERE id = ?", [$parentId]);
        if (!$parent || (int) $parent['post_id'] !== $id) {
            Http::json(['ok' => false, 'error' => 'Komentar yang dibalas tidak ditemukan.'], 200);
        }
    }

    Db::run(
        "INSERT INTO post_comments (post_id, parent_comment_id, commenter_kind, commenter_id, comment_text) VALUES (?, ?, ?, ?, ?)",
        [$id, $parentId > 0 ? $parentId : null, $me['kind'], $me['id'], $text]
    );
    $newId = (int) Db::lastId(); // capture BEFORE Notify (its own INSERT bumps LAST_INSERT_ID)

    $name    = $me['name'] !== '' ? $me['name'] : Notify::userName($me['id']);
    $snippet = mb_substr($text, 0, 80) . (mb_strlen($text) > 80 ? '…' : '');
    $actor   = $me['kind'] === 'user' ? $me['id'] : null;
    $isSelfPost = $post['owner_kind'] === $me['kind'] && (int) $post['owner_id'] === $me['id'];

    if ($parent) {
        // Reply -> tell the author of the comment being replied to.
        $isSelfParent = $parent['commenter_kind'] === $me['kind'] && (int) $parent['commenter_id'] === $me['id'];
        if (!$isSelfParent) {
            pg_post_notify_owner((string) $parent['commenter_kind'], (int) $parent['commenter_id'], 'post.comment_reply',
                'Komentar Anda dibalas',
                $name . ' membalas komentar Anda: ' . $snippet,
                '/momen', $actor);
        }
        // Still a comment on the post — tell the post owner too, unless that's
        // the commenter or the parent author we just pinged.
        $parentIsOwner = $parent['commenter_kind'] === $post['owner_kind'] && (int) $parent['commenter_id'] === (int) $post['owner_id'];
        if (!$isSelfPost && !$parentIsOwner) {
            pg_post_notify_owner((string) $post['owner_kind'], (int) $post['owner_id'], 'post.commented',
                'Komentar baru di momen Anda',
                $name . ' mengomentari momen Anda: ' . $snippet,
                '/momen', $actor);
        }
    } elseif (!$isSelfPost) {
        // Top-level comment -> tell the post owner.
        pg_post_notify_owner((string) $post['owner_kind'], (int) $post['owner_id'], 'post.commented',
            'Komentar baru di momen Anda',
            $name . ' mengomentari momen Anda: ' . $snippet,
            '/momen', $actor);
    }

    $row = Db::one(
        "SELECT c.*,
                CASE WHEN c.commenter_kind = 'user' THEN u.full_name ELSE a.name END AS author_name,
                CASE WHEN c.commenter_kind = 'user' THEN u.photo_path ELSE NULL END AS author_photo_path,
                1 AS is_mine, 0 AS like_count, 0 AS liked_by_me
           FROM post_comments c
           LEFT JOIN users  u ON u.id = c.commenter_id AND c.commenter_kind = 'user'
           LEFT JOIN admins a ON a.id = c.commenter_id AND c.commenter_kind = 'admin'
          WHERE c.id = ?",
        [$newId]
    );
    Http::json(['ok' => true, 'comment' => fmt_post_comment($row)]);
});

pg_route('POST', '/post-comments/{id}/like', function (array $p): void {
    $me = pg_post_principal();
    $id = (int) $p['id'];
    $comment = Db::one(
        "SELECT c.id, c.commenter_kind, c.commenter_id, c.comment_text
           FROM post_comments c JOIN posts pp ON pp.id = c.post_id
          WHERE c.id = ? AND pp.expires_at > NOW()",
        [$id]
    );
    if (!$comment) {
        Http::json(['ok' => false, 'error' => 'Komentar tidak ditemukan.'], 200);
    }
    $existing = Db::one(
        "SELECT id FROM post_comment_likes WHERE comment_id = ? AND liker_kind = ? AND liker_id = ?",
        [$id, $me['kind'], $me['id']]
    );
    if ($existing) {
        Db::run("DELETE FROM post_comment_likes WHERE id = ?", [$existing['id']]);
        $liked = false;
    } else {
        Db::run("INSERT INTO post_comment_likes (comment_id, liker_kind, liker_id) VALUES (?, ?, ?)", [$id, $me['kind'], $me['id']]);
        $liked = true;
        $isSelf = $comment['commenter_kind'] === $me['kind'] && (int) $comment['commenter_id'] === $me['id'];
        if (!$isSelf) {
            $name = $me['name'] !== '' ? $me['name'] : Notify::userName($me['id']);
            $snip = mb_substr((string) $comment['comment_text'], 0, 60) . (mb_strlen((string) $comment['comment_text']) > 60 ? '…' : '');
            pg_post_notify_owner((string) $comment['commenter_kind'], (int) $comment['commenter_id'], 'post.comment_liked',
                'Komentar Anda disukai',
                $name . ' menyukai komentar Anda: ' . $snip,
                '/momen', $me['kind'] === 'user' ? $me['id'] : null);
        }
    }
    $count = (int) (Db::one("SELECT COUNT(*) c FROM post_comment_likes WHERE comment_id = ?", [$id])['c'] ?? 0);
    Http::json(['ok' => true, 'liked' => $liked, 'likeCount' => $count]);
});

pg_route('DELETE', '/post-comments/{id}', function (array $p): void {
    $me  = pg_post_principal();
    $id  = (int) $p['id'];
    $row = Db::one("SELECT * FROM post_comments WHERE id = ?", [$id]);
    if (!$row) {
        Http::json(['ok' => false, 'error' => 'Komentar tidak ditemukan.'], 200);
    }
    $isOwner = $row['commenter_kind'] === $me['kind'] && (int) $row['commenter_id'] === $me['id'];
    $isAdmin = $me['kind'] === 'admin';
    if (!$isOwner && !$isAdmin) {
        Http::json(['ok' => false, 'error' => 'Anda tidak berhak menghapus komentar ini.'], 200);
    }
    pg_delete_comment_subtree($id); // also removes its replies (+ their likes cascade)
    Http::json(['ok' => true]);
});

pg_route('GET', '/post-photo', function (): void {
    if (!Auth::principal()) {
        Http::fail('Perlu login untuk melihat foto.', 401);
    }
    $id  = (int) (Http::query('id') ?? 0);
    $row = Db::one("SELECT photo_path FROM posts WHERE id = ?", [$id]);
    if (!$row) {
        Http::fail('Foto tidak ditemukan.', 404);
    }
    if (!headers_sent()) {
        header_remove('Pragma');
        header('Expires: ' . gmdate('D, d M Y H:i:s', time() + 3600) . ' GMT');
    }
    Storage::serve($row['photo_path'] ?? null);
});

/** GET (and HEAD — some players probe with one first) /api/post-video?id=&k= */
function pg_serve_post_video(): void
{
    $id  = (int) (Http::query('id') ?? 0);
    $k   = (string) (Http::query('k') ?? '');
    $row = Db::one("SELECT video_path, video_mime FROM posts WHERE id = ?", [$id]);
    if (!$row || empty($row['video_path'])) {
        Http::fail('Video tidak ditemukan.', 404);
    }
    // Authorise by EITHER a valid per-post token OR a logged-in session. The
    // token is what makes playback work in an installed PWA / strict mobile
    // browser where the cookie is not attached to the <video> request.
    $tokenOk = $k !== '' && hash_equals(pg_post_video_token($id), $k);
    if (!$tokenOk && !Auth::principal()) {
        Http::fail('Perlu login untuk melihat video.', 401);
    }
    // Release the PHP session lock before streaming so a second video the same
    // user opens doesn't block behind this one's whole transfer.
    if (session_status() === PHP_SESSION_ACTIVE) {
        session_write_close();
    }
    if (!headers_sent()) {
        header_remove('Pragma');
        header_remove('Expires');
    }
    Storage::serveFile(
        $row['video_path'],
        (string) ($row['video_mime'] ?: 'video/mp4'),
        'momen-video.' . (pathinfo((string) $row['video_path'], PATHINFO_EXTENSION) ?: 'mp4'),
        false
    );
}
pg_route('GET',  '/post-video', function (): void { pg_serve_post_video(); });
pg_route('HEAD', '/post-video', function (): void { pg_serve_post_video(); });
