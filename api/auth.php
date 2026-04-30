<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_once __DIR__ . '/../includes/Helpers.php';

// Initialize rate limiting
RateLimiter::init();

$input = Security::jsonInput();
$action = (string) (isset($input['action']) ? $input['action'] : 'login');

$clientIp = Security::clientIp();
if (in_array($action, ['login', 'pin_login'], true) && !RateLimiter::isAllowed($action . ':' . $clientIp, 5, 60)) {
    Response::error('تلاش‌های ورود بسیار زیاد است. لطفاً بعداً دوباره سعی کنید.', 429);
}

function auth_device_name($input)
{
    $name = isset($input['device_name']) ? (string) $input['device_name'] : '';
    if ($name === '') {
        $name = substr((string) (isset($_SERVER['HTTP_USER_AGENT']) ? $_SERVER['HTTP_USER_AGENT'] : 'browser'), 0, 140);
    }
    return $name;
}

function auth_response($pdo, $user, $device = null)
{
    $payload = array(
        'ok' => true,
        'user' => $user,
        'partner' => Auth::partner($pdo, (int) $user['id']),
        'csrf' => Security::csrfToken(),
    );
    if ($device) {
        $payload['device'] = $device;
    }
    Response::json($payload);
}

if ($action === 'login') {
    $slug = strtolower(trim((string) (isset($input['slug']) ? $input['slug'] : '')));
    $password = (string) (isset($input['password']) ? $input['password'] : '');

    if (!in_array($slug, array('hossein', 'mobina'), true)) {
        Response::error('کاربر معتبر نیست.', 422);
    }

    $user = Auth::login($pdo, $slug, $password);
    $device = null;
    try {
        $device = Auth::ensureDevice(
            $pdo,
            (int) $user['id'],
            (string) (isset($input['device_id']) ? $input['device_id'] : ''),
            (string) (isset($input['device_token']) ? $input['device_token'] : ''),
            auth_device_name($input)
        );
    } catch (Exception $e) {
        Security::logException($e);
    }
    auth_response($pdo, $user, $device);
}

if ($action === 'device_login') {
    $user = null;
    try {
        $user = Auth::loginWithDevice(
            $pdo,
            (string) (isset($input['device_id']) ? $input['device_id'] : ''),
            (string) (isset($input['device_token']) ? $input['device_token'] : '')
        );
    } catch (Exception $e) {
        Security::logException($e);
    }
    if (!$user) {
        Response::error('ورود خودکار برای این دستگاه فعال نیست.', 401);
    }
    auth_response($pdo, $user);
}

if ($action === 'pin_login') {
    $user = null;
    try {
        $user = Auth::loginWithPin(
            $pdo,
            (string) (isset($input['device_id']) ? $input['device_id'] : ''),
            (string) (isset($input['pin']) ? $input['pin'] : '')
        );
    } catch (Exception $e) {
        Security::logException($e);
    }
    if (!$user) {
        Response::error('PIN درست نیست.', 422);
    }
    auth_response($pdo, $user);
}

if ($action === 'ensure_device') {
    Security::requireCsrf();
    $user = Auth::requireUser($pdo);
    $device = Auth::ensureDevice(
        $pdo,
        (int) $user['id'],
        (string) (isset($input['device_id']) ? $input['device_id'] : ''),
        (string) (isset($input['device_token']) ? $input['device_token'] : ''),
        auth_device_name($input)
    );
    Response::json(array('ok' => true, 'device' => $device));
}

if ($action === 'set_pin') {
    Security::requireCsrf();
    $user = Auth::requireUser($pdo);
    $deviceId = (string) (isset($input['device_id']) ? $input['device_id'] : '');
    Auth::setDevicePin($pdo, (int) $user['id'], $deviceId, (string) (isset($input['pin']) ? $input['pin'] : ''));
    Response::json(array('ok' => true));
}

if ($action === 'clear_pin') {
    Security::requireCsrf();
    $user = Auth::requireUser($pdo);
    Auth::clearDevicePin($pdo, (int) $user['id'], (string) (isset($input['device_id']) ? $input['device_id'] : ''));
    Response::json(array('ok' => true));
}

if ($action === 'logout') {
    Security::requireCsrf();
    Auth::logout();
    Response::json(array('ok' => true));
}

Response::error('عملیات ناشناخته است.', 400);
