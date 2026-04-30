<?php
define('APP_ROOT', dirname(__DIR__));
define('APP_CONFIG_FILE', APP_ROOT . '/config/config.php');

require_once APP_ROOT . '/includes/Response.php';
require_once APP_ROOT . '/includes/Security.php';
require_once APP_ROOT . '/includes/Database.php';

define('APP_LOG_FILE', APP_ROOT . '/storage/logs/app.log');
Security::installErrorHandlers(APP_LOG_FILE);
Security::sendBaseHeaders();
header('Cache-Control: no-store, private');

$checks = [
    'php_version' => PHP_VERSION,
    'config_file' => is_file(APP_CONFIG_FILE),
    'extensions' => [
        'pdo_mysql' => extension_loaded('pdo_mysql'),
        'openssl' => extension_loaded('openssl'),
        'json' => extension_loaded('json'),
        'fileinfo' => extension_loaded('fileinfo'),
        'curl' => extension_loaded('curl'),
        'zip' => class_exists('ZipArchive'),
    ],
    'uploads_writable' => is_writable(APP_ROOT . '/uploads'),
    'database' => false,
    'tables' => [],
    'last_log_available' => false,
];

if (is_file(APP_LOG_FILE)) {
    $checks['last_log_available'] = true;
}

if (!is_file(APP_CONFIG_FILE)) {
    Response::json([
        'ok' => false,
        'checks' => $checks,
        'message' => 'config/config.php پیدا نشد.',
    ]);
}

try {
    $config = require APP_CONFIG_FILE;
    $checks['app_version'] = (string) ($config['app']['version'] ?? '');
    $checks['encryption_key_configured'] = !empty($config['app']['encryption_key']);
    $pdo = Database::pdo($config);
    $checks['database'] = true;

    foreach (['users', 'user_devices', 'webauthn_credentials', 'messages', 'message_search_tokens', 'attachments', 'message_receipts', 'push_subscriptions', 'memories'] as $table) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?');
        $stmt->execute([$table]);
        $checks['tables'][$table] = ((int) $stmt->fetchColumn()) > 0;
    }
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?');
    $stmt->execute(array('users', 'avatar_path'));
    $checks['columns'] = array(
        'users.avatar_path' => ((int) $stmt->fetchColumn()) > 0,
    );

    $ok = $checks['database']
        && $checks['config_file']
        && $checks['extensions']['pdo_mysql']
        && $checks['extensions']['openssl']
        && $checks['extensions']['json'];

    Response::json([
        'ok' => $ok,
        'checks' => $checks,
    ]);
} catch (Throwable $e) {
    Response::json([
        'ok' => false,
        'checks' => $checks,
        'message' => 'Database health check failed.',
    ]);
}
