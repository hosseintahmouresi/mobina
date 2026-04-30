<?php
/**
 * SoulMate 2.5 - Rate Limiting & Security Enhancements
 */

if (!class_exists('RateLimiter', false)) {
final class RateLimiter
{
    private static $redis = null;
    private static $useRedis = false;
    private static $fallbackFile = null;

    public static function init($config = [])
    {
        $useRedis = isset($config['use_redis']) && $config['use_redis'];
        
        if ($useRedis && extension_loaded('redis')) {
            try {
                self::$redis = new Redis();
                self::$redis->connect('127.0.0.1', 6379, 1);
                self::$useRedis = true;
            } catch (Exception $e) {
                // Fall back to file-based
                self::$useRedis = false;
            }
        }

        if (!self::$useRedis) {
            self::$fallbackFile = sys_get_temp_dir() . '/soulmate_ratelimit.json';
        }
    }

    /**
     * Check if request exceeds rate limit
     * 
     * @param string $key Unique identifier (user_id, IP, etc.)
     * @param int $maxRequests Maximum requests allowed
     * @param int $windowSeconds Time window in seconds
     * @return bool True if within limit, false if exceeded
     */
    public static function isAllowed($key, $maxRequests = 100, $windowSeconds = 60)
    {
        $now = time();
        $windowStart = $now - $windowSeconds;

        if (self::$useRedis) {
            return self::checkRedis($key, $maxRequests, $windowStart, $now);
        } else {
            return self::checkFile($key, $maxRequests, $windowStart, $now);
        }
    }

    private static function checkRedis($key, $maxRequests, $windowStart, $now)
    {
        if (!self::$redis) return true;

        $count = (int) self::$redis->get("rate:{$key}");
        if ($count >= $maxRequests) {
            return false;
        }

        self::$redis->incr("rate:{$key}");
        self::$redis->expire("rate:{$key}", 60);
        return true;
    }

    private static function checkFile($key, $maxRequests, $windowStart, $now)
    {
        if (!self::$fallbackFile) return true;

        $data = [];
        if (file_exists(self::$fallbackFile)) {
            $json = @file_get_contents(self::$fallbackFile);
            if ($json) {
                $data = json_decode($json, true) ?? [];
            }
        }

        // Clean old entries
        foreach ($data as $k => $timestamps) {
            $data[$k] = array_filter($timestamps, function($t) use ($windowStart) {
                return $t > $windowStart;
            });
            if (empty($data[$k])) {
                unset($data[$k]);
            }
        }

        // Check limit
        if (isset($data[$key]) && count($data[$key]) >= $maxRequests) {
            return false;
        }

        // Add new timestamp
        if (!isset($data[$key])) {
            $data[$key] = [];
        }
        $data[$key][] = $now;

        @file_put_contents(self::$fallbackFile, json_encode($data), LOCK_EX);
        return true;
    }

    public static function reset($key)
    {
        if (self::$useRedis && self::$redis) {
            self::$redis->del("rate:{$key}");
        } else if (self::$fallbackFile && file_exists(self::$fallbackFile)) {
            $data = json_decode(file_get_contents(self::$fallbackFile), true) ?? [];
            unset($data[$key]);
            @file_put_contents(self::$fallbackFile, json_encode($data), LOCK_EX);
        }
    }
}
}

if (!class_exists('InputValidator', false)) {
final class InputValidator
{
    public static function validateUsername($username)
    {
        return preg_match('/^[a-z0-9_]{3,32}$/i', $username);
    }

    public static function validateEmail($email)
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    public static function validateUrl($url)
    {
        return filter_var($url, FILTER_VALIDATE_URL) !== false;
    }

    public static function sanitizeFilename($filename)
    {
        $filename = basename($filename);
        $filename = preg_replace('/[^a-zA-Z0-9._-]/', '', $filename);
        return $filename ?: 'file';
    }

    public static function isValidMimeType($mime, $allowed = [])
    {
        if (empty($allowed)) {
            return true;
        }
        return in_array($mime, $allowed, true);
    }

    public static function validateFileSize($size, $maxBytes = 12582912)
    {
        return $size > 0 && $size <= $maxBytes;
    }
}
}

if (!class_exists('CacheHelper', false)) {
final class CacheHelper
{
    private static $cache = [];
    private static $cacheFile = null;

    public static function init($cacheDir = null)
    {
        if ($cacheDir === null) {
            $cacheDir = sys_get_temp_dir() . '/soulmate_cache';
        }
        
        if (!is_dir($cacheDir)) {
            @mkdir($cacheDir, 0755, true);
        }
        
        self::$cacheFile = $cacheDir . '/cache.json';
    }

    public static function get($key, $default = null)
    {
        if (isset(self::$cache[$key])) {
            $item = self::$cache[$key];
            if ($item['expiry'] > time()) {
                return $item['value'];
            }
            unset(self::$cache[$key]);
        }

        return $default;
    }

    public static function set($key, $value, $ttl = 3600)
    {
        self::$cache[$key] = [
            'value' => $value,
            'expiry' => time() + $ttl,
        ];

        self::persist();
    }

    public static function delete($key)
    {
        unset(self::$cache[$key]);
        self::persist();
    }

    public static function flush()
    {
        self::$cache = [];
        self::persist();
    }

    private static function persist()
    {
        if (self::$cacheFile) {
            @file_put_contents(self::$cacheFile, json_encode(self::$cache), LOCK_EX);
        }
    }
}
}
