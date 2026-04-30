<?php
if (!class_exists('Crypto', false)) {
final class Crypto
{
    const PREFIX = 'enc:v1:';

    public static function encrypt($plainText, $config)
    {
        if ($plainText === null || $plainText === '') {
            return $plainText;
        }

        $key = self::key($config);
        if ($key === null || !function_exists('openssl_encrypt')) {
            throw new RuntimeException('Encryption is not configured.');
        }

        $nonce = self::randomBytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plainText, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $nonce, $tag);
        if ($cipher === false) {
            throw new RuntimeException('Message encryption failed.');
        }

        return self::PREFIX
            . self::b64($nonce) . ':'
            . self::b64($tag) . ':'
            . self::b64($cipher);
    }

    public static function decrypt($storedText, $config)
    {
        if ($storedText === null || $storedText === '' || strpos($storedText, self::PREFIX) !== 0) {
            return $storedText;
        }

        $key = self::key($config);
        if ($key === null || !function_exists('openssl_decrypt')) {
            return '';
        }

        $parts = explode(':', substr($storedText, strlen(self::PREFIX)));
        if (count($parts) !== 3) {
            return '';
        }

        list($nonce64, $tag64, $cipher64) = $parts;
        $plain = openssl_decrypt(
            self::unb64($cipher64),
            'aes-256-gcm',
            $key,
            OPENSSL_RAW_DATA,
            self::unb64($nonce64),
            self::unb64($tag64)
        );

        return $plain === false ? '' : $plain;
    }

    public static function generateKey()
    {
        return self::b64(self::randomBytes(32));
    }

    private static function key($config)
    {
        $encoded = (string) ($config['app']['encryption_key'] ?? '');
        if ($encoded === '') {
            return null;
        }

        $key = self::unb64($encoded);
        return strlen($key) === 32 ? $key : null;
    }

    private static function b64($value)
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private static function unb64($value)
    {
        $padding = strlen($value) % 4;
        if ($padding) {
            $value .= str_repeat('=', 4 - $padding);
        }
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }

    private static function randomBytes($length)
    {
        if (class_exists('Security')) {
            return Security::randomBytes($length);
        }

        if (function_exists('random_bytes')) {
            return random_bytes($length);
        }

        if (function_exists('openssl_random_pseudo_bytes')) {
            $strong = false;
            $bytes = openssl_random_pseudo_bytes($length, $strong);
            if ($bytes !== false && strlen($bytes) === $length) {
                return $bytes;
            }
        }

        $bytes = '';
        for ($i = 0; $i < $length; $i++) {
            $bytes .= chr(mt_rand(0, 255));
        }
        return $bytes;
    }
}
}
