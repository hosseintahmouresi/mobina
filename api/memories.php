<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

function memory_lock_session_key($userId)
{
    return 'memory_unlocked_until_' . (int) $userId;
}

function memory_lock_is_unlocked($userId)
{
    $key = memory_lock_session_key($userId);
    return isset($_SESSION[$key]) && (int) $_SESSION[$key] > time();
}

function memory_require_unlocked($userId)
{
    if (!memory_lock_is_unlocked($userId)) {
        Response::error('برای دیدن یا ویرایش این خاطره، اول قفل خصوصی را باز کن.', 403);
    }
}

function format_memories($rows, $unlocked)
{
    $result = [];
    foreach ($rows as $row) {
        $image = null;
        if (!empty($row['attachment_id'])) {
            $image = [
                'id' => (int) $row['attachment_id'],
                'name' => $row['image_name'] ?? 'عکس خاطره',
                'mime' => $row['image_mime'] ?? '',
                'size' => (int) ($row['image_size'] ?? 0),
                'url' => 'api/file.php?id=' . (int) $row['attachment_id'],
            ];
        }
        $row['locked'] = isset($row['locked']) ? (int) $row['locked'] : 0;
        $row['unlocked'] = ($row['locked'] === 1 && $unlocked) ? 1 : 0;
        if ($row['locked'] === 1 && !$unlocked) {
            $row['note'] = '';
            $image = null;
        }
        unset($row['image_name'], $row['image_mime'], $row['image_size']);
        $row['image'] = $image;
        $result[] = $row;
    }
    return $result;
}

function notify_memory_partner($pdo, $config, $user, $title, $memoryId, $action)
{
    $partner = Auth::partner($pdo, (int) $user['id']);
    if (!$partner) {
        return;
    }
    $settings = SettingsStore::all($pdo);
    $notificationMode = $settings['notification_mode'] ?? (($settings['notification_preview'] ?? '1') === '1' ? 'preview' : 'sender');
    $verb = $action === 'update' ? 'یک خاطره را ویرایش کرد.' : 'یک خاطره تازه ثبت کرد.';
    PushService::sendToUser($pdo, $config, (int) $partner['id'], [
        'title' => 'SoulMate',
        'body' => $notificationMode === 'preview'
            ? $user['display_name'] . ': ' . $verb . ' ' . $title
            : ($notificationMode === 'sender' ? 'تغییر تازه از ' . $user['display_name'] : 'یک اتفاق تازه در SoulMate داری.'),
        'url' => rtrim($config['app']['base_url'], '/') . '/?tab=memories&memory=' . (int) $memoryId,
        'tag' => 'soulmate-memory-' . (int) $memoryId,
        'type' => 'memory',
        'memory_id' => (int) $memoryId,
    ]);
}

function validate_memory_attachment($pdo, $attachmentId)
{
    if (!$attachmentId) {
        return null;
    }
    $stmt = $pdo->prepare('SELECT id, mime_type FROM attachments WHERE id = ? LIMIT 1');
    $stmt->execute([$attachmentId]);
    $attachment = $stmt->fetch();
    if (!$attachment || strpos((string) $attachment['mime_type'], 'image/') !== 0) {
        Response::error('عکس خاطره معتبر نیست.', 422);
    }
    return (int) $attachment['id'];
}

function fetch_memory_for_write($pdo, $id)
{
    $stmt = $pdo->prepare('SELECT * FROM memories WHERE id = ? LIMIT 1');
    $stmt->execute([(int) $id]);
    $memory = $stmt->fetch();
    if (!$memory) {
        Response::error('خاطره پیدا نشد.', 404);
    }
    return $memory;
}

if ($method === 'GET') {
    $rows = $pdo->query(
        'SELECT memories.*, users.display_name AS creator_name,
                a.original_name AS image_name, a.mime_type AS image_mime, a.size_bytes AS image_size
         FROM memories
         JOIN users ON users.id = memories.created_by
         LEFT JOIN attachments a ON a.id = memories.attachment_id
         ORDER BY COALESCE(memories.memory_date, DATE(memories.created_at)) DESC, memories.id DESC'
    )->fetchAll();

    Response::json([
        'ok' => true,
        'memories' => format_memories($rows, memory_lock_is_unlocked($userId)),
        'memory_unlocked' => memory_lock_is_unlocked($userId),
    ]);
}

if ($method === 'POST') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    $action = (string) ($input['action'] ?? 'create');
    if (!in_array($action, ['create', 'update', 'delete', 'unlock', 'unlock_biometric', 'lock'], true)) {
        Response::error('عملیات خاطره معتبر نیست.', 400);
    }

    if ($action === 'unlock') {
        $password = (string) ($input['password'] ?? '');
        $stmt = $pdo->prepare('SELECT password_hash FROM users WHERE id = ? LIMIT 1');
        $stmt->execute([$userId]);
        $hash = (string) $stmt->fetchColumn();
        if ($password === '' || !$hash || !password_verify($password, $hash)) {
            Response::error('رمز ورود درست نیست.', 422);
        }
        $_SESSION[memory_lock_session_key($userId)] = time() + 30 * 60;
        Response::json(['ok' => true, 'unlocked_until' => $_SESSION[memory_lock_session_key($userId)]]);
    }

    if ($action === 'unlock_biometric') {
        $verifiedKey = 'webauthn_verified_until_' . $userId;
        if (empty($_SESSION[$verifiedKey]) || (int) $_SESSION[$verifiedKey] < time()) {
            Response::error('اول اثر انگشت یا FaceID را تایید کن.', 403);
        }
        $_SESSION[memory_lock_session_key($userId)] = time() + 30 * 60;
        Response::json(['ok' => true, 'unlocked_until' => $_SESSION[memory_lock_session_key($userId)]]);
    }

    if ($action === 'lock') {
        unset($_SESSION[memory_lock_session_key($userId)]);
        Response::json(['ok' => true]);
    }

    if ($action === 'delete') {
        $id = (int) ($input['id'] ?? 0);
        $memory = fetch_memory_for_write($pdo, $id);
        if ((int) ($memory['locked'] ?? 0) === 1) {
            memory_require_unlocked($userId);
        }
        $stmt = $pdo->prepare('DELETE FROM memories WHERE id = ?');
        $stmt->execute([$id]);
        Response::json(['ok' => true]);
    }

    $existing = null;
    if ($action === 'update') {
        $id = (int) ($input['id'] ?? 0);
        if ($id < 1) {
            Response::error('شناسه خاطره معتبر نیست.', 422);
        }
        $existing = fetch_memory_for_write($pdo, $id);
        if ((int) ($existing['locked'] ?? 0) === 1) {
            memory_require_unlocked($userId);
        }
    }

    $title = Security::cleanText((string) ($input['title'] ?? ''), 140);
    $note = Security::cleanText((string) ($input['note'] ?? ''), 2000);
    $date = trim((string) ($input['memory_date'] ?? ''));
    $emoji = Security::cleanText((string) ($input['emoji'] ?? '❤'), 8);
    $attachmentId = array_key_exists('attachment_id', $input)
        ? validate_memory_attachment($pdo, (int) $input['attachment_id'])
        : ($existing ? ($existing['attachment_id'] !== null ? (int) $existing['attachment_id'] : null) : null);
    $locked = !empty($input['locked']) ? 1 : 0;

    if ($title === '') {
        Response::error('عنوان خاطره لازم است.', 422);
    }
    if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
        Response::error('تاریخ خاطره معتبر نیست.', 422);
    }

    if ($action === 'update') {
        $stmt = $pdo->prepare(
            'UPDATE memories
             SET title = ?, note = ?, memory_date = ?, emoji = ?, attachment_id = ?, locked = ?
             WHERE id = ?'
        );
        $stmt->execute([
            $title,
            $note,
            $date !== '' ? $date : null,
            $emoji ?: '❤',
            $attachmentId,
            $locked,
            $id,
        ]);
        notify_memory_partner($pdo, $config, $user, $title, $id, 'update');
        Response::json(['ok' => true, 'id' => $id]);
    }

    $stmt = $pdo->prepare(
        'INSERT INTO memories (title, note, memory_date, emoji, attachment_id, locked, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    $stmt->execute([
        $title,
        $note,
        $date !== '' ? $date : null,
        $emoji ?: '❤',
        $attachmentId,
        $locked,
        $userId,
        Security::now(),
    ]);

    $newId = (int) $pdo->lastInsertId();
    notify_memory_partner($pdo, $config, $user, $title, $newId, 'create');
    Response::json(['ok' => true, 'id' => $newId], 201);
}

Response::error('متد پشتیبانی نمی‌شود.', 405);
