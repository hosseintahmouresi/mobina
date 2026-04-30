<?php
if (!class_exists('Security', false)) {
final class Security
{
    private static $logFile = null;

    public static function installErrorHandlers($logFile)
    {
        self::$logFile = $logFile;
        @ini_set('display_errors', '0');
        @ini_set('log_errors', '1');
        @error_reporting(E_ALL);

        set_exception_handler(function ($exception) {
            Security::logException($exception);
            if (!headers_sent()) {
                Response::error('خطای داخلی سرور رخ داد. فایل logs را بررسی کنید.', 500);
            }
            echo 'Internal Server Error';
            exit;
        });

        register_shutdown_function(function () {
            $error = error_get_last();
            if (!$error) {
                return;
            }

            $fatal = array(E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR);
            if (!in_array($error['type'], $fatal, true)) {
                return;
            }

            Security::logLine('FATAL ' . $error['message'] . ' in ' . $error['file'] . ':' . $error['line']);
            if (!headers_sent()) {
                http_response_code(500);
                header('Content-Type: application/json; charset=utf-8');
                echo json_encode(array(
                    'ok' => false,
                    'error' => 'خطای داخلی سرور رخ داد. api/health.php را باز کنید.',
                ), JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
            }
        });
    }

    public static function logException($exception)
    {
        self::logLine(get_class($exception) . ' ' . $exception->getMessage() . ' in ' . $exception->getFile() . ':' . $exception->getLine());
    }

    public static function logLine($message)
    {
        if (!self::$logFile) {
            return;
        }

        $dir = dirname(self::$logFile);
        if (!is_dir($dir)) {
            @mkdir($dir, 0755, true);
        }

        $line = '[' . gmdate('Y-m-d H:i:s') . ' UTC] ' . $message . "\n";
        @file_put_contents(self::$logFile, $line, FILE_APPEND | LOCK_EX);
    }

    public static function randomBytes($length)
    {
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

    public static function sendBaseHeaders()
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        header('X-Frame-Options: SAMEORIGIN');
        header('Permissions-Policy: geolocation=(), camera=(self), microphone=(self)');
    }

    public static function startSession()
    {
        if (session_status() === PHP_SESSION_ACTIVE) {
            return;
        }

        $rememberSeconds = 60 * 60 * 24 * 60;
        @ini_set('session.gc_maxlifetime', (string) $rememberSeconds);
        @ini_set('session.cookie_lifetime', (string) $rememberSeconds);

        $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

        session_name('MOBINA_SESSID');
        if (PHP_VERSION_ID >= 70300) {
            session_set_cookie_params([
                'lifetime' => $rememberSeconds,
                'path' => '/',
                'secure' => $secure,
                'httponly' => true,
                'samesite' => 'Lax',
            ]);
        } else {
            session_set_cookie_params($rememberSeconds, '/; samesite=Lax', '', $secure, true);
        }
        session_start();

        if (empty($_SESSION['csrf'])) {
            $_SESSION['csrf'] = bin2hex(self::randomBytes(32));
        }
    }

    public static function csrfToken()
    {
        self::startSession();
        return (string) $_SESSION['csrf'];
    }

    public static function requireCsrf()
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
            return;
        }

        $given = $_SERVER['HTTP_X_MOBINA_CSRF'] ?? '';
        $expected = $_SESSION['csrf'] ?? '';

        if (!$given || !$expected || !hash_equals((string) $expected, (string) $given)) {
            Response::error('درخواست نامعتبر است. صفحه را تازه‌سازی کنید.', 419);
        }
    }

    public static function jsonInput()
    {
        $raw = file_get_contents('php://input') ?: '';
        if ($raw === '') {
            return [];
        }

        $data = json_decode($raw, true);
        if (!is_array($data)) {
            Response::error('بدنه درخواست JSON معتبر نیست.', 422);
        }

        return $data;
    }

    public static function cleanText($value, $maxLength)
    {
        $value = str_replace(["\r\n", "\r"], "\n", (string) $value);
        $value = trim($value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F\x{200B}\x{200D}]+/u', '', $value) ?? '';
        $value = preg_replace("/\n{4,}/", "\n\n\n", $value) ?? $value;
        if (function_exists('mb_strlen') && function_exists('mb_substr')) {
            if (mb_strlen($value, 'UTF-8') > $maxLength) {
                $value = mb_substr($value, 0, $maxLength, 'UTF-8');
            }
            return $value;
        }

        if (strlen($value) > $maxLength) {
            $value = substr($value, 0, $maxLength);
        }
        return $value;
    }

    public static function now()
    {
        return gmdate('Y-m-d H:i:s');
    }

    public static function clientIp()
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public static function baseUrlFromRequest()
    {
        $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
            || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
        $scheme = $https ? 'https' : 'http';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        $scriptDir = str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/'));
        $scriptDir = rtrim($scriptDir, '/');
        if (substr($scriptDir, -4) === '/api') {
            $scriptDir = substr($scriptDir, 0, -4);
        }
        return $scheme . '://' . $host . ($scriptDir ? $scriptDir : '');
    }
}
}
