<?php
require_once __DIR__ . '/../includes/bootstrap.php';

Auth::requireUser($pdo);
$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');

if ($method === 'GET') {
    Response::json(['ok' => true, 'settings' => SettingsStore::all($pdo)]);
}

if ($method === 'POST') {
    Security::requireCsrf();
    $input = Security::jsonInput();

    if (isset($input['couple_since'])) {
        $date = trim((string) $input['couple_since']);
        if ($date !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
            Response::error('تاریخ معتبر نیست.', 422);
        }
        SettingsStore::set($pdo, 'couple_since', $date);
    }

    if (isset($input['daily_phrase'])) {
        SettingsStore::set($pdo, 'daily_phrase', Security::cleanText((string) $input['daily_phrase'], 240));
    }

    if (isset($input['notification_preview'])) {
        SettingsStore::set($pdo, 'notification_preview', !empty($input['notification_preview']) ? '1' : '0');
    }

    if (isset($input['notification_mode'])) {
        $mode = (string) $input['notification_mode'];
        if (!in_array($mode, ['preview', 'sender', 'private'], true)) {
            Response::error('حریم نوتیفیکیشن معتبر نیست.', 422);
        }
        SettingsStore::set($pdo, 'notification_mode', $mode);
        SettingsStore::set($pdo, 'notification_preview', $mode === 'preview' ? '1' : '0');
    }

    Response::json(['ok' => true, 'settings' => SettingsStore::all($pdo)]);
}

Response::error('متد پشتیبانی نمی‌شود.', 405);
