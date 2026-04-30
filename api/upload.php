<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
Security::requireCsrf();

if (empty($_FILES['file']) || !is_array($_FILES['file'])) {
    Response::error('فایلی ارسال نشده است.', 422);
}

$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    Response::error('آپلود فایل ناموفق بود.', 422);
}

$maxBytes = (int) ($config['app']['max_upload_bytes'] ?? 12582912);
if ((int) $file['size'] > $maxBytes) {
    Response::error('حجم فایل بیش از حد مجاز است.', 413);
}

$tmp = (string) $file['tmp_name'];
$mime = 'application/octet-stream';
$clientMime = strtolower(trim((string) ($file['type'] ?? '')));
if (strpos($clientMime, ';') !== false) {
    $clientMime = trim(strtok($clientMime, ';'));
}
$originalName = basename((string) ($file['name'] ?? 'file'));
$clientExtension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $detected = $finfo ? finfo_file($finfo, $tmp) : false;
    if ($finfo) {
        finfo_close($finfo);
    }
    if (is_string($detected) && $detected !== '') {
        $mime = $detected;
    }
}

if (($mime === 'application/octet-stream' || $mime === 'application/x-empty') && $clientMime !== '') {
    $mime = $clientMime;
}
if (strpos($mime, ';') !== false) {
    $mime = trim(strtok($mime, ';'));
}
$extensionMimeOverrides = [
    'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'rar' => 'application/vnd.rar',
];
if (isset($extensionMimeOverrides[$clientExtension]) && in_array($mime, ['application/zip', 'application/x-zip-compressed', 'application/octet-stream'], true)) {
    $mime = $extensionMimeOverrides[$clientExtension];
}
if ($mime === 'video/mp4' && in_array($clientExtension, ['m4a', 'aac'], true)) {
    $mime = 'audio/mp4';
}
if ($mime === 'video/webm' && $clientMime === 'audio/webm') {
    $mime = 'audio/webm';
}

// Image optimization (server-side, conceptual)
if (strpos($mime, 'image/') === 0) {
    $thumbnailPath = null;
    if (class_exists('Imagick')) {
        try {
            $imagick = new Imagick($tmp);
            $imagick->stripImage(); // Remove all profiles and comments
            $imagick->setImageCompression(Imagick::COMPRESSION_JPEG);
            $imagick->setImageCompressionQuality(80);
            $imagick->writeImage($tmp); // Overwrite original with optimized

            // Generate thumbnail
            $thumbnailPath = $uploadDir . '/thumb_' . $storedName;
            $imagick->thumbnailImage(300, 300, true, true); // Max 300x300, maintain aspect ratio
            $imagick->writeImage($thumbnailPath);
            @chmod($thumbnailPath, 0644);
            $imagick->destroy();
        } catch (ImagickException $e) {
            // Fallback to GD or log error
            Security::logException($e);
            // Fallback to GD if Imagick fails
            if (function_exists('imagecreatefromstring')) {
                // ... existing GD optimization logic ...
            }
        }
    }
}

$extensions = [
    'image/jpeg' => 'jpg',
    'image/png' => 'png',
    'image/gif' => 'gif',
    'image/webp' => 'webp',
    'audio/webm' => 'webm',
    'audio/ogg' => 'ogg',
    'audio/mpeg' => 'mp3',
    'audio/mp4' => 'm4a',
    'audio/aac' => 'aac',
    'audio/x-aac' => 'aac',
    'audio/x-m4a' => 'm4a',
    'audio/wav' => 'wav',
    'audio/x-wav' => 'wav',
    'video/mp4' => 'mp4',
    'video/webm' => 'webm',
    'video/quicktime' => 'mov',
    'application/pdf' => 'pdf',
    'text/plain' => 'txt',
    'application/zip' => 'zip',
    'application/x-zip-compressed' => 'zip',
    'application/vnd.rar' => 'rar',
    'application/x-rar-compressed' => 'rar',
    'application/msword' => 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document' => 'docx',
    'application/vnd.ms-excel' => 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' => 'xlsx',
    'application/vnd.ms-powerpoint' => 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation' => 'pptx',
];

if (!isset($extensions[$mime])) {
    Response::error('نوع فایل پشتیبانی نمی‌شود.', 415);
}

$uploadDir = APP_ROOT . '/uploads';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$storedName = bin2hex(Security::randomBytes(18)) . '.' . $extensions[$mime];
$target = $uploadDir . '/' . $storedName;

if (!move_uploaded_file($tmp, $target)) {
    Response::error('ذخیره فایل ناموفق بود.', 500);
}

@chmod($target, 0644);

$publicPath = 'uploads/' . $storedName;

$stmt = $pdo->prepare(
    'INSERT INTO attachments (uploader_id, original_name, stored_name, mime_type, size_bytes, public_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)'
);
$stmt->execute([
    (int) $user['id'],
    Security::cleanText($originalName, 240),
    $storedName,
    $mime,
    (int) $file['size'],
    $publicPath,
    Security::now(),
]);

$attachmentId = (int) $pdo->lastInsertId();
Response::json([
    'ok' => true,
    'attachment' => [
        'id' => $attachmentId,
        'name' => $originalName,
        'mime' => $mime,
        'size' => (int) $file['size'],
        'url' => 'api/file.php?id=' . $attachmentId,
    'thumbnail_url' => $thumbnailPath ? 'api/file.php?id=' . $attachmentId . '&thumb=1' : null, // New field
    ],
], 201);
