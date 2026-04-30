<?php
require_once __DIR__ . '/../includes/bootstrap.php';
require_once APP_ROOT . '/includes/WebAuthn.php';

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
if ($method !== 'POST') {
    Response::error('متد پشتیبانی نمی‌شود.', 405);
}

$input = Security::jsonInput();
$action = (string) ($input['action'] ?? '');

function webauthn_user_payload($pdo, $user)
{
    return array(
        'ok' => true,
        'user' => $user,
        'partner' => Auth::partner($pdo, (int) $user['id']),
        'csrf' => Security::csrfToken(),
    );
}

function webauthn_credentials_for_user($pdo, $userId)
{
    $stmt = $pdo->prepare('SELECT credential_id FROM webauthn_credentials WHERE user_id = ? ORDER BY id DESC');
    $stmt->execute(array((int) $userId));
    return array_map(static function ($id) {
        return array('type' => 'public-key', 'id' => $id);
    }, $stmt->fetchAll(PDO::FETCH_COLUMN));
}

if ($action === 'register_options') {
    Security::requireCsrf();
    $user = Auth::requireUser($pdo);
    $challenge = WebAuthn::newChallenge();
    $_SESSION['webauthn_register'] = array(
        'challenge' => $challenge,
        'user_id' => (int) $user['id'],
        'expires' => time() + 300,
    );
    Response::json(array(
        'ok' => true,
        'publicKey' => array(
            'challenge' => $challenge,
            'rp' => array('name' => 'SoulMate', 'id' => WebAuthn::rpId($config)),
            'user' => array(
                'id' => WebAuthn::b64('user-' . (int) $user['id']),
                'name' => $user['slug'],
                'displayName' => $user['display_name'],
            ),
            'pubKeyCredParams' => array(array('type' => 'public-key', 'alg' => -7)),
            'authenticatorSelection' => array(
                'authenticatorAttachment' => 'platform',
                'userVerification' => 'required',
                'residentKey' => 'preferred',
            ),
            'timeout' => 60000,
            'attestation' => 'none',
            'excludeCredentials' => webauthn_credentials_for_user($pdo, (int) $user['id']),
        ),
    ));
}

if ($action === 'register') {
    Security::requireCsrf();
    $user = Auth::requireUser($pdo);
    $credentialId = WebAuthn::registerCredential($pdo, $config, $user, $input);
    Response::json(array('ok' => true, 'credential_id' => $credentialId));
}

if ($action === 'login_options') {
    $slug = strtolower(trim((string) ($input['slug'] ?? '')));
    if (!in_array($slug, array('hossein', 'mobina'), true)) {
        Response::error('کاربر معتبر نیست.', 422);
    }
    $stmt = $pdo->prepare('SELECT * FROM users WHERE slug = ? LIMIT 1');
    $stmt->execute(array($slug));
    $user = $stmt->fetch();
    if (!$user) {
        Response::error('برای این کاربر ورود امن ثبت نشده است.', 404);
    }
    $credentials = webauthn_credentials_for_user($pdo, (int) $user['id']);
    if (!$credentials) {
        Response::error('برای این کاربر هنوز اثر انگشت یا FaceID ثبت نشده است.', 404);
    }
    $challenge = WebAuthn::newChallenge();
    $_SESSION['webauthn_login'] = array(
        'challenge' => $challenge,
        'user_id' => (int) $user['id'],
        'expires' => time() + 300,
    );
    Response::json(array(
        'ok' => true,
        'publicKey' => array(
            'challenge' => $challenge,
            'rpId' => WebAuthn::rpId($config),
            'allowCredentials' => $credentials,
            'userVerification' => 'required',
            'timeout' => 60000,
        ),
    ));
}

if ($action === 'login') {
    $userId = WebAuthn::verifyAssertion($pdo, $config, $input);
    $user = Auth::loginById($pdo, $userId);
    if (!$user) {
        Response::error('ورود امن ناموفق بود.', 401);
    }
    $_SESSION['webauthn_verified_until_' . (int) $user['id']] = time() + 90;
    Response::json(webauthn_user_payload($pdo, $user));
}

Response::error('عملیات ناشناخته است.', 400);
