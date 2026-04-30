<?php
if (!class_exists('WebAuthn', false)) {
final class WebAuthn
{
    public static function newChallenge()
    {
        return self::b64(Security::randomBytes(32));
    }

    public static function rpId($config)
    {
        $host = parse_url((string) ($config['app']['base_url'] ?? ''), PHP_URL_HOST);
        return $host ?: ($_SERVER['HTTP_HOST'] ?? 'localhost');
    }

    public static function origin($config)
    {
        $base = (string) ($config['app']['base_url'] ?? Security::baseUrlFromRequest());
        $parts = parse_url($base);
        if (!$parts || empty($parts['scheme']) || empty($parts['host'])) {
            return '';
        }
        $origin = $parts['scheme'] . '://' . $parts['host'];
        if (!empty($parts['port'])) {
            $origin .= ':' . $parts['port'];
        }
        return $origin;
    }

    public static function registerCredential($pdo, $config, $user, $input)
    {
        $pending = $_SESSION['webauthn_register'] ?? null;
        if (!$pending || (int) ($pending['user_id'] ?? 0) !== (int) $user['id'] || (int) ($pending['expires'] ?? 0) < time()) {
            Response::error('درخواست اثر انگشت منقضی شده است. دوباره تلاش کن.', 419);
        }

        $response = is_array($input['response'] ?? null) ? $input['response'] : array();
        $clientDataRaw = self::unb64((string) ($response['clientDataJSON'] ?? ''));
        $attestationRaw = self::unb64((string) ($response['attestationObject'] ?? ''));
        self::verifyClientData($clientDataRaw, 'webauthn.create', (string) $pending['challenge'], $config);

        $attestation = WebAuthnCbor::decode($attestationRaw);
        if (!is_array($attestation) || empty($attestation['authData'])) {
            Response::error('داده اثر انگشت معتبر نیست.', 422);
        }

        $auth = self::parseAuthData($attestation['authData'], true);
        $credentialId = self::b64($auth['credential_id']);
        $publicKeyPem = self::coseToPem($auth['cose_key']);
        $now = Security::now();

        $stmt = $pdo->prepare(
            'INSERT INTO webauthn_credentials (user_id, credential_id, public_key_pem, sign_count, device_name, created_at, last_used_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE
                public_key_pem = VALUES(public_key_pem),
                sign_count = VALUES(sign_count),
                device_name = VALUES(device_name),
                last_used_at = VALUES(last_used_at)'
        );
        $stmt->execute(array(
            (int) $user['id'],
            $credentialId,
            $publicKeyPem,
            (int) $auth['sign_count'],
            Security::cleanText((string) ($input['device_name'] ?? ($_SERVER['HTTP_USER_AGENT'] ?? 'device')), 160),
            $now,
            $now,
        ));

        unset($_SESSION['webauthn_register']);
        return $credentialId;
    }

    public static function verifyAssertion($pdo, $config, $input)
    {
        $pending = $_SESSION['webauthn_login'] ?? null;
        if (!$pending || (int) ($pending['expires'] ?? 0) < time()) {
            Response::error('درخواست ورود امن منقضی شده است. دوباره تلاش کن.', 419);
        }

        $credentialId = self::b64(self::unb64((string) ($input['rawId'] ?? $input['id'] ?? '')));
        if ($credentialId === '') {
            Response::error('کلید ورود امن معتبر نیست.', 422);
        }

        $stmt = $pdo->prepare('SELECT * FROM webauthn_credentials WHERE credential_id = ? AND user_id = ? LIMIT 1');
        $stmt->execute(array($credentialId, (int) $pending['user_id']));
        $credential = $stmt->fetch();
        if (!$credential) {
            Response::error('این اثر انگشت برای این کاربر ثبت نشده است.', 403);
        }

        $response = is_array($input['response'] ?? null) ? $input['response'] : array();
        $clientDataRaw = self::unb64((string) ($response['clientDataJSON'] ?? ''));
        $authDataRaw = self::unb64((string) ($response['authenticatorData'] ?? ''));
        $signature = self::unb64((string) ($response['signature'] ?? ''));
        self::verifyClientData($clientDataRaw, 'webauthn.get', (string) $pending['challenge'], $config);

        $auth = self::parseAuthData($authDataRaw, false);
        if (((int) $auth['flags'] & 0x01) !== 0x01) {
            Response::error('تایید حضور کاربر انجام نشد.', 422);
        }

        $signed = $authDataRaw . hash('sha256', $clientDataRaw, true);
        $ok = openssl_verify($signed, $signature, (string) $credential['public_key_pem'], OPENSSL_ALGO_SHA256);
        if ($ok !== 1) {
            Response::error('امضای ورود امن معتبر نیست.', 403);
        }

        $newCount = (int) $auth['sign_count'];
        if ($newCount > (int) $credential['sign_count']) {
            $update = $pdo->prepare('UPDATE webauthn_credentials SET sign_count = ?, last_used_at = ? WHERE id = ?');
            $update->execute(array($newCount, Security::now(), (int) $credential['id']));
        } else {
            $update = $pdo->prepare('UPDATE webauthn_credentials SET last_used_at = ? WHERE id = ?');
            $update->execute(array(Security::now(), (int) $credential['id']));
        }

        unset($_SESSION['webauthn_login']);
        return (int) $credential['user_id'];
    }

    public static function b64($value)
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    public static function unb64($value)
    {
        $value = (string) $value;
        $padding = strlen($value) % 4;
        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }

    private static function verifyClientData($raw, $type, $challenge, $config)
    {
        $data = json_decode($raw, true);
        if (!is_array($data) || ($data['type'] ?? '') !== $type) {
            Response::error('پاسخ ورود امن معتبر نیست.', 422);
        }
        if (self::b64(self::unb64((string) ($data['challenge'] ?? ''))) !== self::b64(self::unb64($challenge))) {
            Response::error('چالش ورود امن معتبر نیست.', 419);
        }
        if (!hash_equals(self::origin($config), (string) ($data['origin'] ?? ''))) {
            Response::error('مبدأ ورود امن معتبر نیست.', 403);
        }
    }

    private static function parseAuthData($authData, $withAttestation)
    {
        if (strlen($authData) < 37) {
            Response::error('داده ورود امن ناقص است.', 422);
        }
        $flags = ord($authData[32]);
        $count = unpack('N', substr($authData, 33, 4))[1];
        $result = array('flags' => $flags, 'sign_count' => $count);
        if (!$withAttestation) {
            return $result;
        }
        if (($flags & 0x40) !== 0x40 || strlen($authData) < 55) {
            Response::error('کلید عمومی ورود امن پیدا نشد.', 422);
        }
        $offset = 37 + 16;
        $idLength = unpack('n', substr($authData, $offset, 2))[1];
        $offset += 2;
        $credentialId = substr($authData, $offset, $idLength);
        $offset += $idLength;
        $cose = WebAuthnCbor::decode(substr($authData, $offset));
        $result['credential_id'] = $credentialId;
        $result['cose_key'] = $cose;
        return $result;
    }

    private static function coseToPem($cose)
    {
        if (!is_array($cose) || ($cose[1] ?? null) !== 2 || ($cose[3] ?? null) !== -7 || ($cose[-1] ?? null) !== 1) {
            Response::error('فرمت کلید ورود امن پشتیبانی نمی‌شود.', 422);
        }
        $x = (string) ($cose[-2] ?? '');
        $y = (string) ($cose[-3] ?? '');
        if (strlen($x) !== 32 || strlen($y) !== 32) {
            Response::error('کلید عمومی ورود امن معتبر نیست.', 422);
        }
        $der = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200') . "\x04" . $x . $y;
        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($der), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }
}
}

if (!class_exists('WebAuthnCbor', false)) {
final class WebAuthnCbor
{
    private $data;
    private $offset = 0;

    public static function decode($data)
    {
        $reader = new self($data);
        return $reader->read();
    }

    private function __construct($data)
    {
        $this->data = (string) $data;
    }

    private function read()
    {
        if ($this->offset >= strlen($this->data)) {
            throw new RuntimeException('CBOR EOF');
        }
        $initial = ord($this->data[$this->offset++]);
        $major = $initial >> 5;
        $ai = $initial & 0x1f;
        $length = $this->length($ai);

        if ($major === 0) {
            return $length;
        }
        if ($major === 1) {
            return -1 - $length;
        }
        if ($major === 2) {
            return $this->bytes($length);
        }
        if ($major === 3) {
            return $this->bytes($length);
        }
        if ($major === 4) {
            $items = array();
            for ($i = 0; $i < $length; $i++) {
                $items[] = $this->read();
            }
            return $items;
        }
        if ($major === 5) {
            $map = array();
            for ($i = 0; $i < $length; $i++) {
                $key = $this->read();
                $map[$key] = $this->read();
            }
            return $map;
        }
        if ($major === 7) {
            return $length;
        }
        throw new RuntimeException('Unsupported CBOR type');
    }

    private function length($ai)
    {
        if ($ai < 24) {
            return $ai;
        }
        if ($ai === 24) {
            return ord($this->bytes(1));
        }
        if ($ai === 25) {
            return unpack('n', $this->bytes(2))[1];
        }
        if ($ai === 26) {
            return unpack('N', $this->bytes(4))[1];
        }
        throw new RuntimeException('Unsupported CBOR length');
    }

    private function bytes($length)
    {
        $chunk = substr($this->data, $this->offset, $length);
        if (strlen($chunk) !== $length) {
            throw new RuntimeException('CBOR truncated');
        }
        $this->offset += $length;
        return $chunk;
    }
}
}
