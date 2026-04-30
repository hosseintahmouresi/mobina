<?php
if (!class_exists('PushService', false)) {
final class PushService
{
    public static function sendToUser($pdo, $config, $userId, $payload)
    {
        if (empty($config['vapid']['public_key']) || empty($config['vapid']['private_key_pem'])) {
            return ['ok' => false, 'sent' => 0, 'errors' => ['VAPID تنظیم نشده است.']];
        }

        $stmt = $pdo->prepare('SELECT * FROM push_subscriptions WHERE user_id = ? AND enabled = 1');
        $stmt->execute([$userId]);
        $subscriptions = $stmt->fetchAll();

        $sent = 0;
        $errors = [];

        foreach ($subscriptions as $subscription) {
            try {
                $result = self::sendSubscription($config, $subscription, $payload);
                if ($result['status'] >= 200 && $result['status'] < 300) {
                    $sent++;
                    continue;
                }

                if (in_array($result['status'], [404, 410], true)) {
                    $disable = $pdo->prepare('UPDATE push_subscriptions SET enabled = 0, updated_at = ? WHERE id = ?');
                    $disable->execute([Security::now(), (int) $subscription['id']]);
                }

                $errors[] = 'HTTP ' . $result['status'];
            } catch (Throwable $e) {
                $errors[] = $e->getMessage();
            }
        }

        return [
            'ok' => $sent > 0 || count($subscriptions) === 0,
            'sent' => $sent,
            'errors' => array_values(array_unique($errors)),
        ];
    }

    public static function sendSubscription($config, $subscription, $payload)
    {
        if (!function_exists('openssl_pkey_derive')) {
            throw new RuntimeException('افزونه OpenSSL برای Web Push لازم است.');
        }

        $endpoint = (string) $subscription['endpoint'];
        $uaPublic = self::base64UrlDecode((string) $subscription['p256dh']);
        $authSecret = self::base64UrlDecode((string) $subscription['auth']);

        if (strlen($uaPublic) !== 65 || ord($uaPublic[0]) !== 4) {
            throw new RuntimeException('کلید عمومی Push معتبر نیست.');
        }

        $payloadJson = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payloadJson === false) {
            throw new RuntimeException('ساخت payload نوتیفیکیشن ناموفق بود.');
        }
        if (strlen($payloadJson) > 3052) {
            throw new RuntimeException('payload نوتیفیکیشن بیش از حد بزرگ است.');
        }

        $salt = Security::randomBytes(16);
        $localKey = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        if (!$localKey) {
            throw new RuntimeException('ساخت کلید موقت Push ناموفق بود.');
        }

        $details = openssl_pkey_get_details($localKey);
        if (!$details || empty($details['ec']['x']) || empty($details['ec']['y'])) {
            throw new RuntimeException('خواندن کلید موقت Push ناموفق بود.');
        }

        $asPublic = "\x04"
            . self::padCoordinate($details['ec']['x'])
            . self::padCoordinate($details['ec']['y']);

        $sharedSecret = openssl_pkey_derive(self::rawPublicKeyToPem($uaPublic), $localKey, 32);
        if ($sharedSecret === false) {
            throw new RuntimeException('محاسبه کلید مشترک Push ناموفق بود.');
        }

        $context = "WebPush: info\0" . $uaPublic . $asPublic;
        $ikm = self::hkdf($sharedSecret, $authSecret, $context, 32);
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        $cek = self::hkdfExpand($prk, "Content-Encoding: aes128gcm\0", 16);
        $nonce = self::hkdfExpand($prk, "Content-Encoding: nonce\0", 12);

        $tag = '';
        $ciphertext = openssl_encrypt($payloadJson . "\x02", 'aes-128-gcm', $cek, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($ciphertext === false) {
            throw new RuntimeException('رمزنگاری نوتیفیکیشن ناموفق بود.');
        }

        $body = $salt . pack('N', 4096) . chr(strlen($asPublic)) . $asPublic . $ciphertext . $tag;
        $jwt = self::buildVapidJwt($endpoint, $config);

        return self::httpPost($endpoint, $body, [
            'TTL: 2419200',
            'Content-Encoding: aes128gcm',
            'Content-Type: application/octet-stream',
            'Content-Length: ' . strlen($body),
            'Authorization: vapid t=' . $jwt . ', k=' . $config['vapid']['public_key'],
        ]);
    }

    public static function generateVapidKeys()
    {
        if (!function_exists('openssl_pkey_new')) {
            throw new RuntimeException('افزونه OpenSSL روی PHP فعال نیست.');
        }

        $key = openssl_pkey_new([
            'private_key_type' => OPENSSL_KEYTYPE_EC,
            'curve_name' => 'prime256v1',
        ]);
        if (!$key) {
            throw new RuntimeException('ساخت کلید VAPID ناموفق بود.');
        }

        openssl_pkey_export($key, $privatePem);
        $details = openssl_pkey_get_details($key);
        if (!$details || empty($details['ec']['x']) || empty($details['ec']['y'])) {
            throw new RuntimeException('خواندن کلید VAPID ناموفق بود.');
        }

        $rawPublic = "\x04"
            . self::padCoordinate($details['ec']['x'])
            . self::padCoordinate($details['ec']['y']);

        return [
            'public_key' => self::base64UrlEncode($rawPublic),
            'private_key_pem' => $privatePem,
        ];
    }

    private static function buildVapidJwt($endpoint, $config)
    {
        $parts = parse_url($endpoint);
        if (empty($parts['scheme']) || empty($parts['host'])) {
            throw new RuntimeException('endpoint نوتیفیکیشن معتبر نیست.');
        }

        $audience = $parts['scheme'] . '://' . $parts['host'];
        if (!empty($parts['port'])) {
            $audience .= ':' . $parts['port'];
        }

        $header = self::base64UrlEncode(json_encode(['typ' => 'JWT', 'alg' => 'ES256'], JSON_UNESCAPED_SLASHES));
        $claims = self::base64UrlEncode(json_encode([
            'aud' => $audience,
            'exp' => time() + 12 * 60 * 60,
            'sub' => $config['vapid']['subject'] ?: 'mailto:admin@example.com',
        ], JSON_UNESCAPED_SLASHES));
        $unsigned = $header . '.' . $claims;

        $ok = openssl_sign($unsigned, $signatureDer, $config['vapid']['private_key_pem'], OPENSSL_ALGO_SHA256);
        if (!$ok) {
            throw new RuntimeException('امضای VAPID ناموفق بود.');
        }

        return $unsigned . '.' . self::base64UrlEncode(self::ecdsaDerToJose($signatureDer));
    }

    private static function httpPost($url, $body, $headers)
    {
        if (function_exists('curl_init')) {
            $ch = curl_init($url);
            curl_setopt_array($ch, [
                CURLOPT_POST => true,
                CURLOPT_POSTFIELDS => $body,
                CURLOPT_HTTPHEADER => $headers,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_HEADER => true,
                CURLOPT_CONNECTTIMEOUT => 8,
                CURLOPT_TIMEOUT => 15,
            ]);
            $response = curl_exec($ch);
            $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            $error = curl_error($ch);
            curl_close($ch);

            if ($response === false) {
                throw new RuntimeException($error ?: 'ارسال Web Push ناموفق بود.');
            }

            return ['status' => $status, 'response' => $response];
        }

        $context = stream_context_create([
            'http' => [
                'method' => 'POST',
                'header' => implode("\r\n", $headers),
                'content' => $body,
                'timeout' => 15,
                'ignore_errors' => true,
            ],
        ]);
        $response = file_get_contents($url, false, $context);
        $status = 0;
        foreach ($http_response_header ?? [] as $header) {
            if (preg_match('/^HTTP\/\S+\s+(\d+)/', $header, $matches)) {
                $status = (int) $matches[1];
                break;
            }
        }

        if ($response === false) {
            throw new RuntimeException('ارسال Web Push ناموفق بود.');
        }

        return ['status' => $status, 'response' => $response];
    }

    private static function hkdf($ikm, $salt, $info, $length)
    {
        $prk = hash_hmac('sha256', $ikm, $salt, true);
        return self::hkdfExpand($prk, $info, $length);
    }

    private static function hkdfExpand($prk, $info, $length)
    {
        $hashLength = 32;
        $blocks = (int) ceil($length / $hashLength);
        $okm = '';
        $previous = '';

        for ($i = 1; $i <= $blocks; $i++) {
            $previous = hash_hmac('sha256', $previous . $info . chr($i), $prk, true);
            $okm .= $previous;
        }

        return substr($okm, 0, $length);
    }

    private static function rawPublicKeyToPem($rawPublicKey)
    {
        $spkiPrefix = hex2bin('3059301306072a8648ce3d020106082a8648ce3d030107034200');
        $der = $spkiPrefix . $rawPublicKey;
        return "-----BEGIN PUBLIC KEY-----\n"
            . chunk_split(base64_encode($der), 64, "\n")
            . "-----END PUBLIC KEY-----\n";
    }

    private static function ecdsaDerToJose($der)
    {
        $offset = 0;
        if (ord($der[$offset++]) !== 0x30) {
            throw new RuntimeException('امضای DER معتبر نیست.');
        }
        self::readDerLength($der, $offset);

        if (ord($der[$offset++]) !== 0x02) {
            throw new RuntimeException('امضای DER معتبر نیست.');
        }
        $rLength = self::readDerLength($der, $offset);
        $r = substr($der, $offset, $rLength);
        $offset += $rLength;

        if (ord($der[$offset++]) !== 0x02) {
            throw new RuntimeException('امضای DER معتبر نیست.');
        }
        $sLength = self::readDerLength($der, $offset);
        $s = substr($der, $offset, $sLength);

        $r = str_pad(ltrim($r, "\x00"), 32, "\x00", STR_PAD_LEFT);
        $s = str_pad(ltrim($s, "\x00"), 32, "\x00", STR_PAD_LEFT);

        return substr($r, -32) . substr($s, -32);
    }

    private static function readDerLength($der, &$offset)
    {
        $length = ord($der[$offset++]);
        if ($length < 0x80) {
            return $length;
        }

        $bytes = $length & 0x7f;
        $length = 0;
        for ($i = 0; $i < $bytes; $i++) {
            $length = ($length << 8) | ord($der[$offset++]);
        }
        return $length;
    }

    private static function padCoordinate($coordinate)
    {
        return str_pad(substr($coordinate, -32), 32, "\x00", STR_PAD_LEFT);
    }

    private static function base64UrlEncode($value)
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function base64UrlDecode($value)
    {
        $padding = strlen($value) % 4;
        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }
}
}
