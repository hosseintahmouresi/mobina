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

// Rate limiting for file uploads: 20 uploads per minute per user
$clientIp = Security::clientIp();
$uploadKey = 'upload:' . $user['id'] . ':' . $clientIp;
if (!RateLimiter::isAllowed('upload', $user['id'] . ':' . $clientIp, 20, 60)) {
    Response::error('تعداد آپلود فایل بسیار زیاد است. لطفاً کمی صبر کنید.', 429);
}

$maxBytes = (int) ($config['app']['max_upload_bytes'] ?? 12582912);
if ((int) $file['size'] > $maxBytes) {
    Response::error('حجم فایل بیش از حد مجاز است.', 413);
}

$tmp = (string) $file['tmp_name'];
$originalName = basename((string) ($file['name'] ?? 'file'));
$clientExtension = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

// Detect MIME type using finfo_file (secure method)
$mime = 'application/octet-stream';
if (function_exists('finfo_open') && is_readable($tmp)) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    if ($finfo) {
        $detected = finfo_file($finfo, $tmp);
        finfo_close($finfo);
        if (is_string($detected) && $detected !== '' && $detected !== 'application/x-empty') {
            $mime = $detected;
        }
    }
}

// Validate MIME type against whitelist
$allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    // Audio
    'audio/webm',
    'audio/ogg',
    'audio/mpeg',
    'audio/mp4',
    'audio/aac',
    'audio/x-aac',
    'audio/x-m4a',
    'audio/wav',
    'audio/x-wav',
    // Video
    'video/mp4',
    'video/webm',
    'video/quicktime',
    // Documents
    'application/pdf',
    'text/plain',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
];

if (!in_array($mime, $allowedMimeTypes, true)) {
    Response::error('نوع فایل پشتیبانی نمی‌شود یا غیرمجاز است.', 415);
}

// Additional validation: ensure extension matches MIME type
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

// Override MIME for specific file extensions in ZIP containers
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
if ($mime === 'video/webm' && strpos($originalName, '.webm') !== false && isset($_FILES['file']['type']) && strpos(strtolower($_FILES['file']['type']), 'audio') !== false) {
    $mime = 'audio/webm';
}

// Re-validate after overrides
if (!isset($extensions[$mime])) {
    Response::error('نوع فایل پشتیبانی نمی‌شود.', 415);
}

// Ensure extension matches detected MIME type
$expectedExtension = $extensions[$mime];
if ($clientExtension !== '' && $clientExtension !== $expectedExtension) {
    // Allow some common mismatches
    $safeMismatches = [
        ['jpg', 'jpeg'],
        ['m4a', 'aac'],
        ['wav', 'wave'],
    ];
    $isSafeMismatch = false;
    foreach ($safeMismatches as $pair) {
        if (in_array($clientExtension, $pair, true) && in_array($expectedExtension, $pair, true)) {
            $isSafeMismatch = true;
            break;
        }
    }
    if (!$isSafeMismatch) {
        Response::error('پسوند فایل با نوع واقعی آن همخوانی ندارد.', 422);
    }
}

$uploadDir = APP_ROOT . '/uploads';
if (!is_dir($uploadDir)) {
    mkdir($uploadDir, 0755, true);
}

$storedName = bin2hex(Security::randomBytes(18)) . '.' . $expectedExtension;
$target = $uploadDir . '/' . $storedName;

if (!move_uploaded_file($tmp, $target)) {
    Response::error('ذخیره فایل ناموفق بود.', 500);
}

@chmod($target, 0644);

// Image optimization and thumbnail generation
$thumbnailPath = null;
if (strpos($mime, 'image/') === 0) {
    if (class_exists('Imagick')) {
        try {
            $imagick = new Imagick($target);
            $imagick->stripImage(); // Remove all profiles and comments
            $imagick->setImageCompression(Imagick::COMPRESSION_JPEG);
            $imagick->setImageCompressionQuality(80);
            $imagick->writeImage($target); // Overwrite original with optimized

            // Generate thumbnail
            $thumbnailName = 'thumb_' . $storedName;
            $thumbnailPath = $uploadDir . '/' . $thumbnailName;
            $imagick->thumbnailImage(300, 300, true, true); // Max 300x300, maintain aspect ratio
            $imagick->writeImage($thumbnailPath);
            @chmod($thumbnailPath, 0644);
            $imagick->destroy();
        } catch (ImagickException $e) {
            Security::logException($e);
            // Fallback to GD if Imagick fails
            if (function_exists('imagecreatefromstring')) {
                $img = null;
                switch ($mime) {
                    case 'image/jpeg':
                        $img = @imagecreatefromjpeg($target);
                        break;
                    case 'image/png':
                        $img = @imagecreatefrompng($target);
                        break;
                    case 'image/gif':
                        $img = @imagecreatefromgif($target);
                        break;
                    case 'image/webp':
                        $img = @imagecreatefromwebp($target);
                        break;
                }
                if ($img) {
                    // Optimize original
                    switch ($mime) {
                        case 'image/jpeg':
                            @imagejpeg($img, $target, 80);
                            break;
                        case 'image/png':
                            @imagepng($img, $target, 6);
                            break;
                        case 'image/gif':
                            @imagegif($img, $target);
                            break;
                        case 'image/webp':
                            @imagewebp($img, $target, 80);
                            break;
                    }
                    
                    // Generate thumbnail
                    $thumbnailName = 'thumb_' . $storedName;
                    $thumbnailPath = $uploadDir . '/' . $thumbnailName;
                    $newWidth = 300;
                    $newHeight = 300;
                    $thumb = imagecreatetruecolor($newWidth, $newHeight);
                    if ($thumb) {
                        $oldWidth = imagesx($img);
                        $oldHeight = imagesy($img);
                        
                        // Calculate aspect ratio
                        $ratio = min($newWidth / $oldWidth, $newHeight / $oldHeight);
                        $newW = (int) ($oldWidth * $ratio);
                        $newH = (int) ($oldHeight * $ratio);
                        $startX = (int) (($newWidth - $newW) / 2);
                        $startY = (int) (($newHeight - $newH) / 2);
                        
                        // Fill with transparent background for PNG/WebP
                        if (in_array($mime, ['image/png', 'image/webp'], true)) {
                            imagealphablending($thumb, false);
                            imagesavealpha($thumb, true);
                            $transparent = imagecolorallocatealpha($thumb, 0, 0, 0, 127);
                            imagefill($thumb, 0, 0, $transparent);
                        }
                        
                        imagecopyresampled($thumb, $img, $startX, $startY, 0, 0, $newW, $newH, $oldWidth, $oldHeight);
                        
                        switch ($mime) {
                            case 'image/jpeg':
                                @imagejpeg($thumb, $thumbnailPath, 80);
                                break;
                            case 'image/png':
                                @imagepng($thumb, $thumbnailPath, 6);
                                break;
                            case 'image/gif':
                                @imagegif($thumb, $thumbnailPath);
                                break;
                            case 'image/webp':
                                @imagewebp($thumb, $thumbnailPath, 80);
                                break;
                        }
                        imagedestroy($thumb);
                        @chmod($thumbnailPath, 0644);
                    }
                    imagedestroy($img);
                }
            }
        }
    }
}

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
        'thumbnail_url' => $thumbnailPath ? 'api/file.php?id=' . $attachmentId . '&thumb=1' : null,
    ],
], 201);
