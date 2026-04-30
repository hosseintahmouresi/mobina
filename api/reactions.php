<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
Security::requireCsrf();

$input = Security::jsonInput();
$messageId = (int) ($input['message_id'] ?? 0);
$reaction = (string) ($input['reaction'] ?? '');
$allowed = ['❤', '😘', '✨', '🌹', '🤍', '🫶', '🥰', '😍', '💋', '💌', '🫠', '😂', '🥺', '😭', '🔥', 'حذف'];

if ($messageId <= 0) {
    Response::error('پیام معتبر نیست.', 422);
}

$stmt = $pdo->prepare('SELECT id FROM messages WHERE id = ? AND deleted_at IS NULL LIMIT 1');
$stmt->execute([$messageId]);
if (!$stmt->fetchColumn()) {
    Response::error('پیام پیدا نشد.', 404);
}

if ($reaction === '' || $reaction === 'حذف') {
    $stmt = $pdo->prepare('DELETE FROM message_reactions WHERE message_id = ? AND user_id = ?');
    $stmt->execute([$messageId, (int) $user['id']]);
    Response::json(['ok' => true]);
}

if (!in_array($reaction, $allowed, true)) {
    Response::error('واکنش معتبر نیست.', 422);
}

$stmt = $pdo->prepare(
    'REPLACE INTO message_reactions (message_id, user_id, reaction, created_at) VALUES (?, ?, ?, ?)'
);
$stmt->execute([$messageId, (int) $user['id'], $reaction, Security::now()]);

Response::json(['ok' => true]);
