<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $partner = Auth::partner($pdo, $userId);
    if (!$partner) {
        Response::json(['ok' => true, 'typing' => false]);
    }

    $stmt = $pdo->prepare('SELECT expires_at FROM typing_status WHERE user_id = ? AND expires_at > ? LIMIT 1');
    $stmt->execute([(int) $partner['id'], Security::now()]);
    Response::json(['ok' => true, 'typing' => (bool) $stmt->fetchColumn()]);
}

if ($method === 'POST') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    $typing = !empty($input['typing']);
    $expires = gmdate('Y-m-d H:i:s', time() + ($typing ? 6 : -1));

    $stmt = $pdo->prepare('REPLACE INTO typing_status (user_id, expires_at) VALUES (?, ?)');
    $stmt->execute([$userId, $expires]);
    Response::json(['ok' => true]);
}

Response::error('متد پشتیبانی نمی‌شود.', 405);
