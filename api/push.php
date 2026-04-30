<?php
require_once __DIR__ . '/../includes/bootstrap.php';

$user = Auth::requireUser($pdo);
Security::requireCsrf();

$input = Security::jsonInput();
$action = (string) ($input['action'] ?? 'subscribe');

function validate_push_endpoint($endpoint)
{
    $endpoint = trim((string) $endpoint);
    $parts = parse_url($endpoint);
    if (!$parts || strtolower($parts['scheme'] ?? '') !== 'https' || empty($parts['host'])) {
        Response::error('آدرس نوتیفیکیشن معتبر نیست.', 422);
    }

    $host = strtolower((string) $parts['host']);
    $allowed = [
        'fcm.googleapis.com',
        'updates.push.services.mozilla.com',
        'web.push.apple.com',
        'wns.windows.com',
    ];
    $allowedHost = false;
    foreach ($allowed as $domain) {
        if ($host === $domain || substr($host, -strlen('.' . $domain)) === '.' . $domain) {
            $allowedHost = true;
            break;
        }
    }
    if (!$allowedHost) {
        Response::error('سرویس نوتیفیکیشن پشتیبانی نمی‌شود.', 422);
    }

    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $flags = FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE;
        if (!filter_var($host, FILTER_VALIDATE_IP, $flags)) {
            Response::error('آدرس نوتیفیکیشن امن نیست.', 422);
        }
    }

    return $endpoint;
}


if ($action === 'subscribe') {
    $subscription = $input['subscription'] ?? null;
    if (!is_array($subscription)) {
        Response::error('اشتراک نوتیفیکیشن معتبر نیست.', 422);
    }

    $endpoint = validate_push_endpoint((string) ($subscription['endpoint'] ?? ''));
    $keys = $subscription['keys'] ?? [];
    $p256dh = (string) ($keys['p256dh'] ?? '');
    $auth = (string) ($keys['auth'] ?? '');

    if ($endpoint === '' || $p256dh === '' || $auth === '') {
        Response::error('کلیدهای نوتیفیکیشن کامل نیستند.', 422);
    }

    $hash = hash('sha256', $endpoint);
    $now = Security::now();
    $stmt = $pdo->prepare(
        'INSERT INTO push_subscriptions (user_id, endpoint_hash, endpoint, p256dh, auth, user_agent, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
         ON DUPLICATE KEY UPDATE
            user_id = VALUES(user_id),
            endpoint = VALUES(endpoint),
            p256dh = VALUES(p256dh),
            auth = VALUES(auth),
            user_agent = VALUES(user_agent),
            enabled = 1,
            updated_at = VALUES(updated_at)'
    );
    $stmt->execute([
        (int) $user['id'],
        $hash,
        $endpoint,
        $p256dh,
        $auth,
        substr((string) ($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 240),
        $now,
        $now,
    ]);

    Response::json(['ok' => true]);
}

if ($action === 'unsubscribe') {
    $endpoint = (string) ($input['endpoint'] ?? '');
    if ($endpoint !== '') {
        $stmt = $pdo->prepare('UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE endpoint_hash = ? AND user_id = ?');
        $stmt->execute([Security::now(), hash('sha256', $endpoint), (int) $user['id']]);
    }
    Response::json(['ok' => true]);
}

if ($action === 'test') {
    $result = PushService::sendToUser($pdo, $config, (int) $user['id'], [
        'title' => 'SoulMate',
        'body' => 'نوتیفیکیشن‌ها آماده‌اند.',
        'url' => rtrim($config['app']['base_url'], '/') . '/',
        'tag' => 'soulmate-test',
    ]);
    if (($result['sent'] ?? 0) < 1) {
        Response::error('اشتراک فعالی برای این دستگاه پیدا نشد.', 422, ['push' => $result]);
    }
    Response::json(['ok' => true, 'push' => $result]);
}

Response::error('عملیات ناشناخته است.', 400);
