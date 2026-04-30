<?php
$root = __DIR__;
$checks = array(
    'ok' => version_compare(PHP_VERSION, '8.0.0', '>='),
    'php_version' => PHP_VERSION,
    'minimum_php' => '8.0.0',
    'server' => isset($_SERVER['SERVER_SOFTWARE']) ? strtok($_SERVER['SERVER_SOFTWARE'], ' ') : '',
    'app_folder' => basename($root),
    'https' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    'host' => isset($_SERVER['HTTP_HOST']) ? $_SERVER['HTTP_HOST'] : '',
    'request_path' => parse_url(isset($_SERVER['REQUEST_URI']) ? $_SERVER['REQUEST_URI'] : '', PHP_URL_PATH),
    'files' => array(
        'config/config.php' => is_file($root . '/config/config.php'),
        'index.php' => is_file($root . '/index.php'),
        'api/me.php' => is_file($root . '/api/me.php'),
        'includes/bootstrap.php' => is_file($root . '/includes/bootstrap.php'),
    ),
    'writable' => array(
        'config' => is_writable($root . '/config'),
        'uploads' => is_writable($root . '/uploads'),
        'storage_logs' => is_dir($root . '/storage/logs') ? is_writable($root . '/storage/logs') : is_writable($root),
    ),
    'extensions' => array(
        'pdo' => extension_loaded('pdo'),
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'openssl' => extension_loaded('openssl'),
        'json' => extension_loaded('json'),
        'fileinfo' => extension_loaded('fileinfo'),
        'curl' => extension_loaded('curl'),
        'mbstring' => extension_loaded('mbstring'),
        'zip' => class_exists('ZipArchive'),
    ),
    'last_log_available' => false,
);

$logFile = $root . '/storage/logs/app.log';
if (is_file($logFile)) {
    $checks['last_log_available'] = true;
}

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store, private');
$flags = defined('JSON_UNESCAPED_UNICODE') ? JSON_UNESCAPED_UNICODE : 0;
echo json_encode($checks, $flags);
