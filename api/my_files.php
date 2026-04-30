<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$userId = (int) $user['id'];
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    $stmt = $pdo->prepare('SELECT id, original_name, mime_type, size_bytes, created_at FROM attachments WHERE uploader_id = ? ORDER BY created_at DESC LIMIT 100');
    $stmt->execute([$userId]);
    $files = [];
    foreach ($stmt->fetchAll() as $row) {
        $files[] = [
            'id' => (int) $row['id'],
            'name' => $row['original_name'],
            'mime' => $row['mime_type'],
            'size' => (int) $row['size_bytes'],
            'created_at' => $row['created_at'],
            'url' => 'api/file.php?id=' . (int) $row['id'],
        ];
    }
    Response::json(['ok' => true, 'files' => $files]);
}

if ($method === 'DELETE') {
    Security::requireCsrf();
    $input = Security::jsonInput();
    $fileId = (int) ($input['id'] ?? 0);
    if ($fileId < 1) {
        Response::error('شناسه فایل معتبر نیست.', 422);
    }

    // Check ownership and if file is used in messages/memories
    $stmt = $pdo->prepare('SELECT stored_name FROM attachments WHERE id = ? AND uploader_id = ? LIMIT 1');
    $stmt->execute([$fileId, $userId]);
    $file = $stmt->fetch();
    if (!$file) {
        Response::error('فایل پیدا نشد یا شما مالک آن نیستید.', 404);
    }

    // Check if attachment is linked to any messages or memories
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM messages WHERE attachment_id = ? UNION ALL SELECT COUNT(*) FROM memories WHERE attachment_id = ?');
    $stmt->execute([$fileId, $fileId]);
    $usageCount = 0;
    while ($count = $stmt->fetchColumn()) {
        $usageCount += (int) $count;
    }

    if ($usageCount > 0) {
        Response::error('این فایل در پیام‌ها یا خاطره‌ها استفاده شده و قابل حذف نیست.', 403);
    }

    $pdo->beginTransaction();
    $stmt = $pdo->prepare('DELETE FROM attachments WHERE id = ? AND uploader_id = ?');
    $stmt->execute([$fileId, $userId]);
    @unlink(APP_ROOT . '/uploads/' . basename($file['stored_name']));
    @unlink(APP_ROOT . '/uploads/thumb_' . basename($file['stored_name'])); // Delete thumbnail if exists
    $pdo->commit();

    Response::json(['ok' => true]);
}

Response::error('متد پشتیبانی نمی‌شود.', 405);