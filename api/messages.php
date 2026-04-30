<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

function mark_received($pdo, $userId, $markRead)
{
    $now = Security::now();
    if ($markRead) {
        $stmt = $pdo->prepare(
            'UPDATE message_receipts r
             JOIN messages m ON m.id = r.message_id
             SET r.delivered_at = COALESCE(r.delivered_at, ?),
                 r.read_at = COALESCE(r.read_at, ?)
             WHERE r.user_id = ? AND m.sender_id <> ? AND m.deleted_at IS NULL'
        );
        $stmt->execute([$now, $now, $userId, $userId]);
        return;
    }

    $stmt = $pdo->prepare(
        'UPDATE message_receipts r
         JOIN messages m ON m.id = r.message_id
         SET r.delivered_at = COALESCE(r.delivered_at, ?)
         WHERE r.user_id = ? AND m.sender_id <> ? AND m.deleted_at IS NULL'
    );
    $stmt->execute([$now, $userId, $userId]);
}

function fetch_messages($pdo, $currentUserId, $afterId, $beforeId, $limit, $config)
{
    $base = MobinaMessageFormatter::baseQuery();
    if ($afterId > 0) {
        $stmt = $pdo->prepare($base . ' AND m.id > ? ORDER BY m.id ASC LIMIT ?');
        $stmt->bindValue(1, $afterId, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        return MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $currentUserId, $config);
    }

    if ($beforeId > 0) {
        $stmt = $pdo->prepare($base . ' AND m.id < ? ORDER BY m.id DESC LIMIT ?');
        $stmt->bindValue(1, $beforeId, PDO::PARAM_INT);
        $stmt->bindValue(2, $limit, PDO::PARAM_INT);
        $stmt->execute();
        $rows = array_reverse($stmt->fetchAll());
        return MobinaMessageFormatter::list($pdo, $rows, $currentUserId, $config);
    }

    $stmt = $pdo->prepare($base . ' ORDER BY m.id DESC LIMIT ?');
    $stmt->bindValue(1, $limit, PDO::PARAM_INT);
    $stmt->execute();
    $rows = array_reverse($stmt->fetchAll());
    return MobinaMessageFormatter::list($pdo, $rows, $currentUserId, $config);
}

function fetch_one_message($pdo, $currentUserId, $messageId, $config)
{
    $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . ' AND m.id = ? LIMIT 1');
    $stmt->execute([$messageId]);
    $rows = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $currentUserId, $config);
    return $rows[0] ?? null;
}

function deleted_message_ids($pdo)
{
    $stmt = $pdo->prepare(
        'SELECT id FROM messages
         WHERE deleted_at IS NOT NULL
           AND deleted_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 DAY)
         ORDER BY deleted_at DESC
         LIMIT 160'
    );
    $stmt->execute();
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function unread_message_ids($pdo, $userId)
{
    $stmt = $pdo->prepare(
        'SELECT m.id
         FROM message_receipts r
         JOIN messages m ON m.id = r.message_id
         WHERE r.user_id = ?
           AND m.sender_id <> ?
           AND m.deleted_at IS NULL
           AND r.read_at IS NULL
         ORDER BY m.id ASC
         LIMIT 200'
    );
    $stmt->execute([$userId, $userId]);
    return array_map('intval', $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function unread_message_count($pdo, $userId)
{
    $stmt = $pdo->prepare(
        'SELECT COUNT(*)
         FROM message_receipts r
         JOIN messages m ON m.id = r.message_id
         WHERE r.user_id = ?
           AND m.sender_id <> ?
           AND m.deleted_at IS NULL
           AND r.read_at IS NULL'
    );
    $stmt->execute([$userId, $userId]);
    return (int) $stmt->fetchColumn();
}

function receipt_updates($pdo, $currentUserId)
{
    $stmt = $pdo->prepare(
        'SELECT m.id AS message_id, r.delivered_at, r.read_at
         FROM messages m
         JOIN message_receipts r ON r.message_id = m.id AND r.user_id <> ?
         WHERE m.sender_id = ? AND m.deleted_at IS NULL
         ORDER BY m.id DESC
         LIMIT 80'
    );
    $stmt->execute([$currentUserId, $currentUserId]);
    $rows = [];
    foreach ($stmt->fetchAll() as $row) {
        $status = 'sent';
        if (!empty($row['read_at'])) {
            $status = 'read';
        } elseif (!empty($row['delivered_at'])) {
            $status = 'delivered';
        }
        $rows[] = [
            'message_id' => (int) $row['message_id'],
            'status' => $status,
        ];
    }
    return $rows;
}

function text_contains($haystack, $needle)
{
    $haystack = (string) $haystack;
    $needle = (string) $needle;
    if ($needle === '') {
        return true;
    }
    if (function_exists('mb_stripos')) {
        return mb_stripos($haystack, $needle, 0, 'UTF-8') !== false;
    }
    return stripos($haystack, $needle) !== false;
}

function search_messages($pdo, $currentUserId, $query, $limit, $config)
{
    $candidateIds = array();
    $useIndex = false;
    try {
        $useIndex = ((int) $pdo->query('SELECT COUNT(*) FROM message_search_tokens')->fetchColumn()) > 0;
        if ($useIndex) {
            $candidateIds = SearchIndex::candidateIds($pdo, $config, $query, min(1000, $limit * 20));
            if (!$candidateIds) {
                return array();
            }
            $placeholders = implode(',', array_fill(0, count($candidateIds), '?'));
            $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . " AND m.id IN ($placeholders) ORDER BY m.id DESC");
            $stmt->execute($candidateIds);
            $messages = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $currentUserId, $config);
            $matches = array();
            foreach ($messages as $message) {
                $attachmentName = isset($message['attachment']['name']) ? $message['attachment']['name'] : '';
                if (text_contains($message['body'] ?? '', $query) || text_contains($attachmentName, $query)) {
                    $matches[] = $message;
                    if (count($matches) >= $limit) {
                        break;
                    }
                }
            }
            return array_reverse($matches);
        }
    } catch (Exception $e) {
        Security::logException($e);
    }

    $scanLimit = min(2000, max(200, $limit * 12));
    $stmt = $pdo->prepare(MobinaMessageFormatter::baseQuery() . ' ORDER BY m.id DESC LIMIT ?');
    $stmt->bindValue(1, $scanLimit, PDO::PARAM_INT);
    $stmt->execute();

    $messages = MobinaMessageFormatter::list($pdo, $stmt->fetchAll(), $currentUserId, $config);
    $matches = array();
    foreach ($messages as $message) {
        $attachmentName = isset($message['attachment']['name']) ? $message['attachment']['name'] : '';
        if (text_contains($message['body'] ?? '', $query) || text_contains($attachmentName, $query)) {
            $matches[] = $message;
            if (count($matches) >= $limit) {
                break;
            }
        }
    }

    return array_reverse($matches);
}

if ($method === 'GET') {
    $afterId = max(0, (int) ($_GET['after_id'] ?? 0));
    $beforeId = max(0, (int) ($_GET['before_id'] ?? 0));
    $limit = min(80, max(1, (int) ($_GET['limit'] ?? 50)));
    $markRead = (string) ($_GET['mark_read'] ?? '0') === '1';
    $search = Security::cleanText((string) ($_GET['search'] ?? ''), 120);

    $unreadBeforeIds = unread_message_ids($pdo, $userId);
    $unreadBeforeCount = count($unreadBeforeIds);

    mark_received($pdo, $userId, $markRead);

    if ($search !== '') {
        $messages = search_messages($pdo, $userId, $search, $limit, $config);
    } else {
        $messages = fetch_messages($pdo, $userId, $afterId, $beforeId, $limit, $config);
    }

    Response::json([
        'ok' => true,
        'messages' => $messages,
        'receipt_updates' => receipt_updates($pdo, $userId),
        'deleted_message_ids' => deleted_message_ids($pdo),
        'unread_message_ids' => $unreadBeforeIds,
        'unread_count' => $markRead ? 0 : $unreadBeforeCount,
        'server_time' => Security::now(),
    ]);
}

if ($method === 'POST') {
    Security::requireCsrf();
    $input = Security::jsonInput();

    $body = Security::cleanText((string) ($input['body'] ?? ''), 4000);
    $kind = (string) ($input['kind'] ?? 'text');
    if (!in_array($kind, ['text', 'love', 'letter', 'timed', 'sticker'], true)) {
        $kind = 'text';
    }

    $attachmentId = isset($input['attachment_id']) && $input['attachment_id'] !== ''
        ? (int) $input['attachment_id']
        : null;

    $replyToId = isset($input['reply_to_id']) && $input['reply_to_id'] !== ''
        ? (int) $input['reply_to_id']
        : null;

    $openAt = trim((string) ($input['open_at'] ?? ''));
    if ($kind !== 'timed') {
        $openAt = '';
    }
    if ($openAt !== '' && !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $openAt)) {
        Response::error('زمان باز شدن پیام معتبر نیست.', 422);
    }
    if ($kind === 'timed' && $openAt === '') {
        Response::error('زمان باز شدن پیام لازم است.', 422);
    }

    if ($body === '' && !$attachmentId) {
        Response::error('پیام خالی است.', 422);
    }

    $clientId = (string) ($input['client_id'] ?? '');
    if (!preg_match('/^[A-Za-z0-9_-]{8,80}$/', $clientId)) {
        $clientId = bin2hex(Security::randomBytes(16));
    }

    $attachmentName = '';
    if ($attachmentId) {
        $check = $pdo->prepare('SELECT id, original_name FROM attachments WHERE id = ? AND uploader_id = ? LIMIT 1');
        $check->execute([$attachmentId, $userId]);
        $attachment = $check->fetch();
        if (!$attachment) {
            Response::error('فایل پیوست معتبر نیست.', 422);
        }
        $attachmentName = (string) $attachment['original_name'];
    }

    if ($replyToId) {
        $check = $pdo->prepare('SELECT id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1');
        $check->execute([$replyToId]);
        if (!$check->fetchColumn()) {
            $replyToId = null;
        }
    }

    $now = Security::now();
    try {
        $storedBody = $body !== '' ? Crypto::encrypt($body, $config) : $body;
    } catch (RuntimeException $e) {
        Security::logException($e);
        Response::error('کلید رمزگذاری پیام تنظیم نشده است. update.php را اجرا کنید.', 500);
    }
    try {
        $pdo->beginTransaction();
        $stmt = $pdo->prepare('INSERT INTO messages (client_id, sender_id, body, kind, attachment_id, reply_to_id, open_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
        $stmt->execute([$clientId, $userId, $storedBody, $kind, $attachmentId, $replyToId, $openAt !== "" ? $openAt : null, $now]);
        $messageId = (int) $pdo->lastInsertId();

        $users = $pdo->query('SELECT id FROM users')->fetchAll();
        $receipt = $pdo->prepare('INSERT INTO message_receipts (message_id, user_id, delivered_at, read_at) VALUES (?, ?, ?, ?)');
        foreach ($users as $row) {
            $uid = (int) $row['id'];
            $receipt->execute([
                $messageId,
                $uid,
                $uid === $userId ? $now : null,
                $uid === $userId ? $now : null,
            ]);
        }
        SearchIndex::indexMessage($pdo, $config, $messageId, $body, $attachmentName);
        $pdo->commit();
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        if ($e->getCode() === '23000') {
            $stmt = $pdo->prepare('SELECT id FROM messages WHERE client_id = ? LIMIT 1');
            $stmt->execute([$clientId]);
            $messageId = (int) $stmt->fetchColumn();
        } else {
            throw $e;
        }
    }

    $message = fetch_one_message($pdo, $userId, $messageId, $config);
    $partner = Auth::partner($pdo, $userId);

    if ($partner) {
        $settings = SettingsStore::all($pdo);
        $notificationMode = $settings['notification_mode'] ?? (($settings['notification_preview'] ?? '1') === '1' ? 'preview' : 'sender');
        if ($kind === 'love') {
            $preview = 'یک پیام قلبی تازه داری.';
        } elseif ($kind === 'letter') {
            $preview = 'یک نامه عاشقانه تازه داری.';
        } elseif ($kind === 'timed') {
            $preview = 'یک پیام زمان‌دار تازه داری.';
        } elseif ($kind === 'sticker') {
            $preview = 'یک استیکر تازه داری.';
        } else {
            if (strpos($body, 'E2EE:') === 0) {
                $preview = '🔒 پیام رمزنگاری شده';
            } else {
                $preview = $body !== '' ? Security::cleanText($body, 90) : 'یک فایل تازه داری.';
            }
        }

        PushService::sendToUser($pdo, $config, (int) $partner['id'], [
            'title' => 'SoulMate',
            'body' => $notificationMode === 'preview'
                ? $user['display_name'] . ': ' . $preview
                : ($notificationMode === 'sender' ? 'پیام تازه از ' . $user['display_name'] : 'یک پیام تازه داری.'),
            'url' => rtrim($config['app']['base_url'], '/') . '/?message=' . $messageId,
            'tag' => 'soulmate-message-' . $messageId,
            'message_id' => $messageId,
        ]);
    }

    Response::json([
        'ok' => true,
        'message' => $message,
    ], 201);
}

// DELETE: Soft-delete a message during the short recall window.
if ($method === 'DELETE') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    
    $messageId = isset($input['message_id']) ? (int) $input['message_id'] : 0;
    if (!$messageId) {
        Response::error('شناسه پیام معتبر نیست.', 422);
    }

    $stmt = $pdo->prepare('SELECT sender_id, created_at, TIMESTAMPDIFF(SECOND, created_at, UTC_TIMESTAMP()) AS age_seconds FROM messages WHERE id = ? AND deleted_at IS NULL');
    $stmt->execute([$messageId]);
    $message = $stmt->fetch();

    if (!$message) {
        Response::error('پیام یافت نشد.', 404);
    }

    if ((int) $message['sender_id'] !== $userId) {
        Response::error('شما صاحب این پیام نیستید.', 403);
    }

    $ageSeconds = isset($message['age_seconds']) ? (int) $message['age_seconds'] : 0;
    if ($ageSeconds < 0) {
        $ageSeconds = 0;
    }
    if ($ageSeconds > 300) {
        Response::error('مهلت حذف این پیام تمام شده است.', 410);
    }

    $stmt = $pdo->prepare('UPDATE messages SET deleted_at = ? WHERE id = ?');
    $stmt->execute([Security::now(), $messageId]);

    Response::json([
        'ok' => true,
        'deleted' => true,
        'message_id' => $messageId,
    ]);
}

Response::error('متد پشتیبانی نمی‌شود.', 405);
