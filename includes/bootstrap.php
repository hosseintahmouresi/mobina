<?php
define('APP_ROOT', dirname(__DIR__));
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');

require_once APP_ROOT . '/includes/Response.php';
require_once APP_ROOT . '/includes/Security.php';

define('APP_LOG_FILE', APP_ROOT . '/storage/logs/app.log');

Security::installErrorHandlers(APP_LOG_FILE);
Security::sendBaseHeaders();
header('Cache-Control: no-store, private');

require_once APP_ROOT . '/includes/Database.php';
require_once APP_ROOT . '/includes/Auth.php';
require_once APP_ROOT . '/includes/Crypto.php';
require_once APP_ROOT . '/includes/PushService.php';
require_once APP_ROOT . '/includes/SettingsStore.php';
require_once APP_ROOT . '/includes/MobinaMessageFormatter.php';
require_once APP_ROOT . '/includes/SearchIndex.php';

Security::startSession();

if (!is_file(APP_CONFIG_FILE)) {
    Response::error('برنامه هنوز نصب نشده است.', 503, [
        'install_url' => 'install.php',
    ]);
}

$config = require APP_CONFIG_FILE;
$timezone = isset($config['app']['timezone']) ? $config['app']['timezone'] : 'UTC';
date_default_timezone_set($timezone);

try {
    $pdo = Database::pdo($config);
} catch (Exception $e) {
    Security::logException($e);
    Response::error('اتصال به دیتابیس ناموفق است. api/health.php را بررسی کنید.', 500);
}
