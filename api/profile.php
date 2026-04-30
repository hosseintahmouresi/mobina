<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
$method = strtoupper(isset($_SERVER['REQUEST_METHOD']) ? $_SERVER['REQUEST_METHOD'] : 'GET');

if ($method !== 'POST') {
    Response::error('متد پشتیبانی نمی‌شود.', 405);
}

Security::requireCsrf();
$action = isset($_POST['action']) ? (string) $_POST['action'] : 'avatar';

if ($action === 'avatar') {
    if (empty($_FILES['avatar']) || !is_array($_FILES['avatar'])) {
        Response::error('عکس پروفایل انتخاب نشده است.', 422);
    }

    $file = $_FILES['avatar'];
    if ((isset($file['error']) ? $file['error'] : UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        Response::error('آپلود عکس ناموفق بود.', 422);
    }

    if ((int) $file['size'] > 4 * 1024 * 1024) {
        Response::error('حجم عکس پروفایل باید کمتر از ۴ مگابایت باشد.', 413);
    }

    $tmp = (string) $file['tmp_name'];
    $mime = 'application/octet-stream';
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

    $extensions = array(
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    );

    if (!isset($extensions[$mime])) {
        Response::error('فرمت عکس پروفایل پشتیبانی نمی‌شود.', 415);
    }

    $avatarDir = APP_ROOT . '/uploads/avatars';
    if (!is_dir($avatarDir)) {
        mkdir($avatarDir, 0755, true);
    }

    $storedName = 'u' . (int) $user['id'] . '-' . bin2hex(Security::randomBytes(12)) . '.' . $extensions[$mime];
    $target = $avatarDir . '/' . $storedName;
    if (!move_uploaded_file($tmp, $target)) {
        Response::error('ذخیره عکس پروفایل ناموفق بود.', 500);
    }
    @chmod($target, 0644);

    $publicPath = 'uploads/avatars/' . $storedName;
    $stmt = $pdo->prepare('UPDATE users SET avatar_path = ? WHERE id = ?');
    $stmt->execute(array($publicPath, (int) $user['id']));

    Response::json(array(
        'ok' => true,
        'avatar_path' => $publicPath,
    ));
}

if ($action === 'clear_avatar') {
    $stmt = $pdo->prepare('UPDATE users SET avatar_path = NULL WHERE id = ?');
    $stmt->execute(array((int) $user['id']));
    Response::json(array('ok' => true));
}

Response::error('عملیات ناشناخته است.', 400);
