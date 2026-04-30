<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::currentUser($pdo);
$partner = $user ? Auth::partner($pdo, (int) $user['id']) : null;

try {
    $settings = SettingsStore::all($pdo);
} catch (Exception $e) {
    Security::logException($e);
    $settings = array();
}

Response::json(array(
    'ok' => true,
    'user' => $user,
    'partner' => $partner,
    'csrf' => Security::csrfToken(),
    'app' => array(
        'name' => isset($config['app']['name']) ? $config['app']['name'] : 'SoulMate',
        'base_url' => isset($config['app']['base_url']) ? $config['app']['base_url'] : Security::baseUrlFromRequest(),
        'poll_ms' => (int) (isset($config['app']['poll_ms']) ? $config['app']['poll_ms'] : 2200),
        'max_upload_bytes' => (int) (isset($config['app']['max_upload_bytes']) ? $config['app']['max_upload_bytes'] : 12582912),
        'vapid_public_key' => isset($config['vapid']['public_key']) ? $config['vapid']['public_key'] : '',
        'encryption_ready' => !empty($config['app']['encryption_key']),
        'version' => isset($config['app']['version']) ? $config['app']['version'] : '',
    ),
    'settings' => $settings,
));
