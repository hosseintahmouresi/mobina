<?php
if (!class_exists('Auth', false)) {
final class Auth
{
    public static function currentUser($pdo)
    {
        $id = isset($_SESSION['uid']) ? $_SESSION['uid'] : null;
        if (!$id) {
            return null;
        }

        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute(array((int) $id));
        $user = $stmt->fetch();

        if (!$user) {
            unset($_SESSION['uid']);
            return null;
        }

        return self::publicUser($user);
    }

    public static function requireUser($pdo)
    {
        $user = self::currentUser($pdo);
        if (!$user) {
            Response::error('برای ادامه وارد شوید.', 401);
        }
        return $user;
    }

    public static function partner($pdo, $currentUserId)
    {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id <> ? ORDER BY id LIMIT 1');
        $stmt->execute(array($currentUserId));
        $partner = $stmt->fetch();
        return $partner ? self::publicUser($partner) : null;
    }

    public static function login($pdo, $slug, $password)
    {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE slug = ? LIMIT 1');
        $stmt->execute(array($slug));
        $user = $stmt->fetch();

        if (!$user || !password_verify($password, $user['password_hash'])) {
            Response::error('نام یا رمز عبور درست نیست.', 422);
        }

        self::setSession((int) $user['id']);
        return self::publicUser($user);
    }

    public static function loginWithDevice($pdo, $deviceId, $token)
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $deviceId) || !preg_match('/^[a-f0-9]{64}$/', $token)) {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT d.*, u.*
             FROM user_devices d
             JOIN users u ON u.id = d.user_id
             WHERE d.device_id = ? LIMIT 1'
        );
        $stmt->execute(array($deviceId));
        $row = $stmt->fetch();
        if (!$row || !hash_equals($row['token_hash'], hash('sha256', $token))) {
            return null;
        }

        self::touchDevice($pdo, $deviceId);
        self::setSession((int) $row['user_id']);
        return self::currentUser($pdo);
    }

    public static function loginWithPin($pdo, $deviceId, $pin)
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $deviceId) || !preg_match('/^\d{4,8}$/', $pin)) {
            return null;
        }

        $stmt = $pdo->prepare(
            'SELECT d.*, u.*
             FROM user_devices d
             JOIN users u ON u.id = d.user_id
             WHERE d.device_id = ? AND d.pin_hash IS NOT NULL LIMIT 1'
        );
        $stmt->execute(array($deviceId));
        $row = $stmt->fetch();
        if (!$row || !password_verify($pin, $row['pin_hash'])) {
            return null;
        }

        self::touchDevice($pdo, $deviceId);
        self::setSession((int) $row['user_id']);
        return self::currentUser($pdo);
    }

    public static function loginById($pdo, $userId)
    {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
        $stmt->execute(array((int) $userId));
        $user = $stmt->fetch();
        if (!$user) {
            return null;
        }

        self::setSession((int) $user['id']);
        return self::publicUser($user);
    }

    public static function createDevice($pdo, $userId, $deviceName = '')
    {
        $deviceId = bin2hex(Security::randomBytes(24));
        $token = bin2hex(Security::randomBytes(32));
        $now = Security::now();

        $stmt = $pdo->prepare(
            'INSERT INTO user_devices (user_id, device_id, token_hash, device_name, created_at, updated_at, last_used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)'
        );
        $stmt->execute(array(
            (int) $userId,
            $deviceId,
            hash('sha256', $token),
            Security::cleanText($deviceName, 160),
            $now,
            $now,
            $now,
        ));

        return array(
            'device_id' => $deviceId,
            'device_token' => $token,
        );
    }

    public static function ensureDevice($pdo, $userId, $deviceId, $token, $deviceName = '')
    {
        if ($deviceId && $token && preg_match('/^[a-f0-9]{48}$/', $deviceId) && preg_match('/^[a-f0-9]{64}$/', $token)) {
            $stmt = $pdo->prepare('SELECT id, token_hash FROM user_devices WHERE device_id = ? AND user_id = ? LIMIT 1');
            $stmt->execute(array($deviceId, (int) $userId));
            $row = $stmt->fetch();
            if ($row && hash_equals($row['token_hash'], hash('sha256', $token))) {
                self::touchDevice($pdo, $deviceId, $deviceName);
                return array(
                    'device_id' => $deviceId,
                    'device_token' => $token,
                );
            }
        }

        return self::createDevice($pdo, $userId, $deviceName);
    }

    public static function setDevicePin($pdo, $userId, $deviceId, $pin)
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $deviceId) || !preg_match('/^\d{4,8}$/', $pin)) {
            Response::error('PIN باید ۴ تا ۸ رقم باشد.', 422);
        }

        $stmt = $pdo->prepare('UPDATE user_devices SET pin_hash = ?, updated_at = ? WHERE user_id = ? AND device_id = ?');
        $stmt->execute(array(password_hash($pin, PASSWORD_DEFAULT), Security::now(), (int) $userId, $deviceId));
        if ($stmt->rowCount() < 1) {
            Response::error('این دستگاه برای تنظیم PIN ثبت نشده است.', 422);
        }
    }

    public static function clearDevicePin($pdo, $userId, $deviceId)
    {
        if (!preg_match('/^[a-f0-9]{48}$/', $deviceId)) {
            return;
        }
        $stmt = $pdo->prepare('UPDATE user_devices SET pin_hash = NULL, updated_at = ? WHERE user_id = ? AND device_id = ?');
        $stmt->execute(array(Security::now(), (int) $userId, $deviceId));
    }

    public static function logout()
    {
        $_SESSION = array();
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            $domain = isset($params['domain']) ? $params['domain'] : '';
            setcookie(session_name(), '', time() - 42000, $params['path'], $domain, $params['secure'], $params['httponly']);
        }
        session_destroy();
    }

    private static function setSession($userId)
    {
        session_regenerate_id(true);
        $_SESSION['uid'] = (int) $userId;
        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(Security::randomBytes(32));
        }
    }

    private static function touchDevice($pdo, $deviceId, $deviceName = '')
    {
        $stmt = $pdo->prepare('UPDATE user_devices SET device_name = COALESCE(NULLIF(?, \'\'), device_name), last_used_at = ?, updated_at = ? WHERE device_id = ?');
        $stmt->execute(array(Security::cleanText($deviceName, 160), Security::now(), Security::now(), $deviceId));
    }

    private static function publicUser($user)
    {
        unset($user['password_hash']);
        if (!isset($user['avatar_path'])) {
            $user['avatar_path'] = null;
        }
        return $user;
    }
}
}
