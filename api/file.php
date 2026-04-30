<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);

$id = max(0, (int) ($_GET['id'] ?? 0));
if ($id < 1) {
    Response::error('فایل معتبر نیست.', 422);
}

$stmt = $pdo->prepare('SELECT * FROM attachments WHERE id = ? LIMIT 1');
$stmt->execute([$id]);
$file = $stmt->fetch();
if (!$file) {
    Response::error('فایل پیدا نشد.', 404);
}

$memoryLockedKey = 'memory_unlocked_until_' . (int) $user['id'];
$memoryUnlocked = isset($_SESSION[$memoryLockedKey]) && (int) $_SESSION[$memoryLockedKey] > time();
if (!$memoryUnlocked) {
    $stmt = $pdo->prepare('SELECT id FROM memories WHERE attachment_id = ? AND locked = 1 LIMIT 1');
    $stmt->execute([$id]);
    if ($stmt->fetchColumn()) {
        Response::error('برای دیدن این فایل، اول قفل خاطره خصوصی را باز کنید.', 403);
    }
}

$storedName = basename((string) $file['stored_name']);
$path = APP_ROOT . '/uploads/' . $storedName;
$uploadsRoot = str_replace('\\', '/', realpath(APP_ROOT . '/uploads'));
$realPath = realpath($path);
if (!$realPath || !$uploadsRoot || strpos(str_replace('\\', '/', $realPath), $uploadsRoot . '/') !== 0 || !is_file($realPath)) {
    Response::error('فایل روی سرور پیدا نشد.', 404);
}

$size = filesize($realPath);
$start = 0;
$end = $size > 0 ? $size - 1 : 0;
$status = 200;

if (!empty($_SERVER['HTTP_RANGE']) && preg_match('/bytes=(\d*)-(\d*)/', (string) $_SERVER['HTTP_RANGE'], $matches)) {
    if ($matches[1] !== '') {
        $start = (int) $matches[1];
    }
    if ($matches[2] !== '') {
        $end = min($end, (int) $matches[2]);
    }
    if ($start > $end || $start >= $size) {
        header('Content-Range: bytes */' . $size);
        http_response_code(416);
        exit;
    }
    $status = 206;
}

$length = $size > 0 ? ($end - $start + 1) : 0;
$name = str_replace(['"', "\r", "\n"], '', (string) $file['original_name']);

http_response_code($status);
header('Content-Type: ' . ((string) $file['mime_type'] ?: 'application/octet-stream'));
header('Content-Length: ' . $length);
header('Accept-Ranges: bytes');
header('Content-Disposition: inline; filename="' . $name . '"; filename*=UTF-8\'\'' . rawurlencode($name));
header('Cache-Control: private, max-age=86400');
if ($status === 206) {
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
}

if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'HEAD') {
    exit;
}

$handle = fopen($realPath, 'rb');
if (!$handle) {
    exit;
}
if ($start > 0) {
    fseek($handle, $start);
}

$remaining = $length;
while ($remaining > 0 && !feof($handle)) {
    $chunk = fread($handle, min(8192, $remaining));
    if ($chunk === false || $chunk === '') {
        break;
    }
    echo $chunk;
    $remaining -= strlen($chunk);
    if (connection_aborted()) {
        break;
    }
}
fclose($handle);
